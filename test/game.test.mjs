import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDungeon } from '../src/mapgen.js';
import {
  createGame,
  exits,
  move,
  resolveFight,
  monsterHitPoints,
} from '../src/game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, '..', 'fixtures', 'sample-tree');

// A small, hand-built dungeon so combat arithmetic is easy to check by hand,
// independent of the real fixture tree used elsewhere.
function threeRoomDungeon() {
  return {
    seed: 'test',
    root: 'root',
    rooms: [
      { id: 'r0', path: '.', name: 'entrance hall', x: 0, y: 0 },
      { id: 'r1', path: 'a', name: 'a', x: 1, y: 0 },
      { id: 'r2', path: 'b', name: 'b', x: 2, y: 0 },
    ],
    corridors: [
      { from: 'r0', to: 'r1' },
      { from: 'r1', to: 'r2' },
    ],
    monsters: [
      {
        id: 'm1',
        room: 'r1',
        path: 'a/tiny.txt',
        type: 'text sprite',
        size: 10,
        level: 1,
        tier: 'trivial',
      },
      {
        id: 'm2',
        room: 'r2',
        path: 'b/also-tiny.txt',
        type: 'text sprite',
        size: 20,
        level: 1,
        tier: 'trivial',
      },
    ],
  };
}

// Same shape, but the second room holds one huge, brutal-tier monster —
// guaranteed (maxHp 20 vs. thousands of rounds of level-5 damage) to kill
// the player before it dies.
function lethalDungeon() {
  const dungeon = threeRoomDungeon();
  dungeon.monsters[1] = {
    id: 'm2',
    room: 'r2',
    path: 'b/huge.log',
    type: 'text sprite',
    size: 100000,
    level: 5,
    tier: 'brutal',
  };
  return dungeon;
}

test('resolveFight is a pure function of monster size and level', () => {
  const player = { hp: 20, maxHp: 20 };
  const monster = { id: 'm', size: 10, level: 1 };
  const result = resolveFight(monster, player);
  assert.equal(monsterHitPoints(monster), 1, '10 bytes rounds up to 1 hit point');
  assert.equal(result.rounds, 1, 'one hit point dies in the first round');
  assert.equal(player.hp, 20 - 1 * 1, 'one round of level-1 damage');
  assert.equal(result.playerSurvived, true);
});

test('monsterHitPoints scales with file size and never rounds down to 0', () => {
  assert.ok(monsterHitPoints({ size: 1000 }) > monsterHitPoints({ size: 10 }));
  assert.equal(monsterHitPoints({ size: 0 }), 1, 'even an empty file is a real fight');
});

test('resolveFight clamps hp at 0 and reports death, never a negative hp', () => {
  const player = { hp: 5, maxHp: 20 };
  const monster = { id: 'm', size: 100000, level: 5 };
  const result = resolveFight(monster, player);
  assert.equal(player.hp, 0);
  assert.equal(result.playerSurvived, false);
});

test('createGame starts full health, standing in the entrance, with a log entry', () => {
  const game = createGame(threeRoomDungeon());
  assert.equal(game.status, 'playing');
  assert.equal(game.player.roomId, 'r0');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.ok(game.log[0].includes('entrance hall'));
});

test('exits lists only rooms directly connected by a corridor', () => {
  const game = createGame(threeRoomDungeon());
  assert.deepEqual(exits(game).map((r) => r.id), ['r1']);
  move(game, 'r1');
  assert.deepEqual(exits(game).map((r) => r.id).sort(), ['r0', 'r2']);
});

test('move rejects a room that is not directly reachable, leaving state unchanged', () => {
  const game = createGame(threeRoomDungeon());
  const before = { roomId: game.player.roomId, hp: game.player.hp };
  move(game, 'r2'); // r2 is two hops away, not adjacent to the entrance
  assert.equal(game.player.roomId, before.roomId, 'player does not move');
  assert.equal(game.player.hp, before.hp, 'no fight happens on a rejected move');
  assert.equal(game.status, 'playing');
  assert.ok(game.log.at(-1).includes('cannot reach'));
});

test('moving into a room auto-resolves a fight and applies file-size damage', () => {
  const game = createGame(threeRoomDungeon());
  const hpBefore = game.player.hp;
  move(game, 'r1');
  assert.equal(game.player.roomId, 'r1');
  assert.equal(game.defeated.has('m1'), true);
  assert.equal(game.player.hp, hpBefore - 1, 'one round of level-1 damage from the tiny monster');
  assert.ok(game.log.some((line) => line.includes('text sprite')));
});

test('clearing every monster transitions status to won', () => {
  const game = createGame(threeRoomDungeon());
  move(game, 'r1');
  move(game, 'r2');
  assert.equal(game.status, 'won');
  assert.equal(game.defeated.size, 2);
  assert.ok(game.log.at(-1).includes('cleared'));
});

test('a lethal monster transitions status to dead and stops the run', () => {
  const game = createGame(lethalDungeon());
  move(game, 'r1');
  assert.equal(game.status, 'playing', 'the tiny first monster is survivable');
  move(game, 'r2');
  assert.equal(game.status, 'dead');
  assert.equal(game.player.hp, 0);
});

test('no further moves are possible once the game has ended', () => {
  const game = createGame(lethalDungeon());
  move(game, 'r1');
  move(game, 'r2');
  assert.equal(game.status, 'dead');
  const roomBeforeExtraMove = game.player.roomId;
  move(game, 'r1');
  assert.equal(game.player.roomId, roomBeforeExtraMove, 'a dead player cannot keep moving');
  assert.ok(game.log.at(-1).includes('already cleared, or you have fallen'));
});

test('the same dungeon and move sequence always produces the same outcome', () => {
  const dungeon = threeRoomDungeon();
  const runOnce = () => {
    const game = createGame(dungeon);
    move(game, 'r1');
    move(game, 'r2');
    return { status: game.status, hp: game.player.hp, log: game.log };
  };
  const first = runOnce();
  const second = runOnce();
  assert.deepEqual(first, second);
});

test('a room with no monsters left in it is a free walk-through', () => {
  const game = createGame(threeRoomDungeon());
  move(game, 'r1');
  const hpAfterFirstFight = game.player.hp;
  move(game, 'r0'); // walk back to the (already-cleared) entrance
  assert.equal(game.player.hp, hpAfterFirstFight, 'no monsters left, no damage');
});

test('integration: the real fixture tree plays through mapgen -> game consistently', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const game = createGame(dungeon);
  const rootRoom = dungeon.rooms.find((r) => r.path === '.');
  const dataRoom = dungeon.rooms.find((r) => r.path === 'data');

  assert.equal(game.player.roomId, rootRoom.id);
  assert.ok(
    exits(game).some((room) => room.id === dataRoom.id),
    'data is a direct child of the root, so it must be a listed exit'
  );

  move(game, dataRoom.id);
  assert.equal(game.player.roomId, dataRoom.id);
  const bigfile = dungeon.monsters.find((m) => m.path === 'data/bigfile.log');
  assert.equal(game.defeated.has(bigfile.id), true, 'walking into the room fights its monster');
});
