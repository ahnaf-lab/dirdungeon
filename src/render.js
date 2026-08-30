// ANSI terminal renderer for a generated dungeon (see mapgen.js). Turns the
// abstract room/corridor/monster graph into a fixed-size character grid plus
// a HUD, with no external dependencies — just escape codes for color.
//
// Room and monster *placement on the grid* reuses the same hashed (x, y)
// coordinates mapgen already computed, so the visual layout is exactly as
// deterministic as the map itself: same tree, same seed, same frame, every
// run, on every machine.

const RESET = '\x1b[0m';

const COLORS = Object.freeze({
  trivial: '\x1b[32m', // green
  weak: '\x1b[36m', // cyan
  moderate: '\x1b[33m', // yellow
  tough: '\x1b[35m', // magenta
  brutal: '\x1b[31m', // red
  corridor: '\x1b[90m', // bright black / gray
  room: '\x1b[37m', // white
  entrance: '\x1b[1;37m', // bold white
  player: '\x1b[1;33m', // bold yellow
});

export const DEFAULT_WIDTH = 60;
export const DEFAULT_HEIGHT = 18;

function colorize(color, char) {
  return color ? `${color}${char}${RESET}` : char;
}

// Every room already carries a hashed (x, y) from mapgen. Fold that into the
// bounded canvas with modulo, then resolve collisions with deterministic
// linear probing (same idea as open-addressing in a hash table): the probe
// sequence depends only on the grid size and the starting cell, never on
// insertion order beyond the fixed, pre-order `rooms` array — so two runs
// over the same tree always resolve collisions identically.
function placeRooms(rooms, width, height) {
  const total = width * height;
  const occupied = new Set();
  const cellByRoomId = new Map();

  for (const room of rooms) {
    let x = ((room.x % width) + width) % width;
    let y = ((room.y % height) + height) % height;
    let attempts = 0;
    while (occupied.has(y * width + x) && attempts < total) {
      const idx = (y * width + x + 1) % total;
      x = idx % width;
      y = Math.floor(idx / width);
      attempts++;
    }
    occupied.add(y * width + x);
    cellByRoomId.set(room.id, { x, y });
  }

  return cellByRoomId;
}

// Orthogonal path (horizontal, then vertical) between two placed rooms.
// Doesn't need to be the prettiest path, just a deterministic, boundable one.
function corridorPath(from, to) {
  const path = [];
  let { x, y } = from;
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    path.push({ x, y });
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    path.push({ x, y });
  }
  return path;
}

function strongestMonsterByRoom(monsters) {
  const map = new Map();
  for (const monster of monsters) {
    const current = map.get(monster.room);
    if (!current || monster.level > current.level) map.set(monster.room, monster);
  }
  return map;
}

/**
 * The player's starting state: full health, standing in the entrance room.
 * Combat and movement are later milestones — this milestone only needs a
 * position and some stats to draw.
 */
export function createPlayer(dungeon) {
  const rootRoom = dungeon.rooms.find((room) => room.path === '.');
  return { hp: 20, maxHp: 20, roomId: rootRoom.id };
}

function renderHud(dungeon, player, playerRoom) {
  const stats = `HP ${player.hp}/${player.maxHp}  |  Seed: ${dungeon.seed}  |  ` +
    `Room: ${playerRoom.name}  |  Monsters: ${dungeon.monsters.length}`;
  const legend = 'Legend: @ you   E entrance   m monster   # room   \u00b7 corridor';
  return [stats, legend];
}

/**
 * Render one full ANSI frame: the map grid, the player, and a HUD.
 *
 * @param {object} dungeon - output of `generateDungeon`.
 * @param {{hp?: number, maxHp?: number, roomId?: string}} [player] - defaults
 *   to `createPlayer(dungeon)` (full health, standing in the entrance room).
 * @param {{width?: number, height?: number}} [options]
 * @returns {string} the frame, ready to print with `console.log`.
 */
export function renderFrame(dungeon, player, options = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('width and height must be positive integers');
  }

  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ char: ' ', color: null }))
  );

  const cellByRoomId = placeRooms(dungeon.rooms, width, height);
  const rootRoom = dungeon.rooms.find((room) => room.path === '.');
  const strongestByRoom = strongestMonsterByRoom(dungeon.monsters);

  // Corridors first, so room glyphs are always drawn on top of any corridor
  // that happens to cross a room's cell.
  for (const corridor of dungeon.corridors) {
    const from = cellByRoomId.get(corridor.from);
    const to = cellByRoomId.get(corridor.to);
    if (!from || !to) continue;
    for (const cell of corridorPath(from, to)) {
      grid[cell.y][cell.x] = { char: '\u00b7', color: COLORS.corridor };
    }
  }

  for (const room of dungeon.rooms) {
    const cell = cellByRoomId.get(room.id);
    const monster = strongestByRoom.get(room.id);
    if (room.id === rootRoom.id) {
      grid[cell.y][cell.x] = { char: 'E', color: COLORS.entrance };
    } else if (monster) {
      grid[cell.y][cell.x] = { char: 'm', color: COLORS[monster.tier] };
    } else {
      grid[cell.y][cell.x] = { char: '#', color: COLORS.room };
    }
  }

  const playerState = player ?? createPlayer(dungeon);
  const playerRoom = dungeon.rooms.find((room) => room.id === playerState.roomId) ?? rootRoom;
  const playerCell = cellByRoomId.get(playerRoom.id);
  grid[playerCell.y][playerCell.x] = { char: '@', color: COLORS.player };

  const mapLines = grid.map((row) =>
    row.map((cell) => colorize(cell.color, cell.char)).join('')
  );

  return [...mapLines, '', ...renderHud(dungeon, playerState, playerRoom)].join('\n');
}
