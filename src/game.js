// Movement and combat state machine. Built on top of the room/corridor/
// monster graph from mapgen.js: a corridor is the only legal move (rooms
// with no corridor between them are not adjacent, mirroring the fact that a
// directory has no direct edge to anything but its parent and children), and
// walking into a room auto-resolves a fight against every monster still
// alive there. There is no player input during a fight — the outcome is
// pure arithmetic on the monster's file size, so the same dungeon and the
// same sequence of moves always produces the same fights, in the same
// order, with the same result.

import { createPlayer } from './render.js';
import { buildTreasureReport, formatTreasureReport } from './loot.js';

// Fixed damage the player deals per round. Monsters have no player-facing
// "attack" stat to balance against, so this is the one constant tuned by
// hand; everything else in the formula below comes from the file itself.
export const PLAYER_ATTACK = 6;

// The file-size formula: bigger files are bigger fights. One hit point per
// 64 bytes, floored at 1 so even a zero-byte file is still a fight (and
// never a divide-by-zero or a free kill).
const HP_PER_BYTE = 1 / 64;

export function monsterHitPoints(monster) {
  return Math.max(1, Math.ceil(monster.size * HP_PER_BYTE));
}

/**
 * Resolve one fight to its conclusion in a single deterministic pass: each
 * round the player deals PLAYER_ATTACK damage and the monster deals damage
 * equal to its size-derived `level` (1-5, already computed by mapgen from
 * the same file size), simultaneously, until one side is out of hit points.
 * Mutates `player.hp` in place and clamps it at 0 (never negative).
 *
 * @returns {{ rounds: number, monsterId: string, playerSurvived: boolean }}
 */
export function resolveFight(monster, player) {
  let monsterHp = monsterHitPoints(monster);
  let rounds = 0;
  while (monsterHp > 0 && player.hp > 0) {
    rounds += 1;
    monsterHp -= PLAYER_ATTACK;
    player.hp -= monster.level;
  }
  player.hp = Math.max(player.hp, 0);
  return { rounds, monsterId: monster.id, playerSurvived: player.hp > 0 };
}

// Corridors are stored directed (parent -> child) because that is how
// mapgen derives them from the tree, but walking is undirected: you can
// always go back the way you came. Build both edges once up front rather
// than scanning `corridors` on every move.
function buildAdjacency(dungeon) {
  const adjacency = new Map();
  for (const room of dungeon.rooms) adjacency.set(room.id, new Set());
  for (const corridor of dungeon.corridors) {
    adjacency.get(corridor.from)?.add(corridor.to);
    adjacency.get(corridor.to)?.add(corridor.from);
  }
  return adjacency;
}

function fightMonstersInRoom(game, room) {
  const monstersHere = game.dungeon.monsters.filter(
    (monster) => monster.room === room.id && !game.defeated.has(monster.id)
  );

  for (const monster of monstersHere) {
    if (game.status !== 'playing') break;
    const result = resolveFight(monster, game.player);
    game.defeated.add(monster.id);
    game.log.push(
      `You fight the ${monster.type} guarding ${monster.path} for ${result.rounds} round(s) and defeat it.`
    );
    if (!result.playerSurvived) {
      game.status = 'dead';
      game.log.push('You have fallen.');
    }
  }

  if (game.status === 'playing' && game.defeated.size === game.dungeon.monsters.length) {
    game.status = 'won';
    game.log.push('The dungeon is cleared.');
    // The treasure report needs real filesystem stats (file size is already
    // known from the dungeon, but "oldest" needs a fresh mtime read), so it
    // only runs when the caller supplied the real directory the dungeon was
    // generated from. Without it, `game.loot` just stays null — the map and
    // combat remain fully playable either way.
    if (game.rootDir) {
      game.loot = buildTreasureReport(game.dungeon, game.rootDir);
      game.log.push(formatTreasureReport(game.loot));
    }
  }
}

/**
 * Start a new run: the player spawns in the entrance room (full health) and
 * immediately fights whatever is waiting there, exactly as if they had
 * walked in — there is no free pass for monsters placed at the root.
 *
 * @param {object} dungeon - output of `generateDungeon`.
 * @param {{ rootDir?: string }} [options] - `rootDir` is the real directory
 *   the dungeon was generated from. It is optional and only used to build
 *   the treasure report (`game.loot`) once the dungeon is cleared; omitting
 *   it still produces a fully playable game, just without loot.
 * @returns {{
 *   dungeon: object,
 *   player: {hp: number, maxHp: number, roomId: string},
 *   defeated: Set<string>,
 *   log: string[],
 *   status: 'playing' | 'won' | 'dead',
 *   loot: null | { largestFiles: object[], oldestFiles: object[] },
 * }}
 */
export function createGame(dungeon, options = {}) {
  const player = createPlayer(dungeon);
  const game = {
    dungeon,
    player,
    rootDir: options.rootDir,
    adjacency: buildAdjacency(dungeon),
    defeated: new Set(),
    log: [],
    status: 'playing',
    loot: null,
  };

  const startRoom = dungeon.rooms.find((room) => room.id === player.roomId);
  game.log.push(`You enter ${startRoom.name}.`);
  fightMonstersInRoom(game, startRoom);
  return game;
}

/** Rooms directly reachable from the player's current room via one corridor. */
export function exits(game) {
  const ids = game.adjacency.get(game.player.roomId) ?? new Set();
  return game.dungeon.rooms.filter((room) => ids.has(room.id));
}

/**
 * Attempt to move the player into `targetRoomId`. A no-op (besides a log
 * entry) if the game has already ended or the room is not directly
 * reachable. Otherwise moves the player, then auto-resolves combat against
 * every undefeated monster in the destination room, in the same order they
 * appear in `dungeon.monsters`.
 *
 * Mutates and returns the same `game` object passed in, matching a
 * conventional state-machine `transition(state, action) -> state` shape.
 */
export function move(game, targetRoomId) {
  if (game.status !== 'playing') {
    game.log.push('The dungeon is already cleared, or you have fallen.');
    return game;
  }

  const reachable = game.adjacency.get(game.player.roomId);
  if (!reachable || !reachable.has(targetRoomId)) {
    game.log.push('You cannot reach that room from here.');
    return game;
  }

  game.player.roomId = targetRoomId;
  const room = game.dungeon.rooms.find((r) => r.id === targetRoomId);
  game.log.push(`You move into ${room.name}.`);
  fightMonstersInRoom(game, room);
  return game;
}

// Depth-first: walk into every unvisited room reachable from `roomId`,
// then step back to `roomId` before trying the next one. Corridors form a
// tree (each directory has exactly one parent), so backing out after each
// subtree is what makes the rest of the tree reachable again through
// `move`, which only ever allows a step to a directly adjacent room.
function visitAll(game, roomId, visited) {
  visited.add(roomId);
  for (const room of exits(game)) {
    if (visited.has(room.id) || game.status !== 'playing') continue;
    move(game, room.id);
    if (game.status !== 'playing') return;
    visitAll(game, room.id, visited);
    if (game.status !== 'playing') return;
    move(game, roomId);
  }
}

/**
 * Play out a full, deterministic clear of the dungeon: starting from the
 * entrance, depth-first visit every room reachable by corridor, fighting
 * whatever is there, until every monster is defeated (or the player falls).
 * There is no branching decision to make — the map is a tree and the
 * outcome of every fight is pure arithmetic — so "play the whole dungeon"
 * has exactly one deterministic result for a given dungeon and rootDir.
 *
 * @param {object} dungeon - output of `generateDungeon`.
 * @param {{ rootDir?: string }} [options] - see `createGame`.
 * @returns {ReturnType<typeof createGame>}
 */
export function autoClear(dungeon, options = {}) {
  const game = createGame(dungeon, options);
  if (game.status === 'playing') {
    visitAll(game, game.player.roomId, new Set());
  }
  return game;
}
