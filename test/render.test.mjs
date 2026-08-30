import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDungeon } from '../src/mapgen.js';
import { renderFrame, createPlayer } from '../src/render.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(here, '..', 'fixtures');
const fixtureDir = path.join(fixturesRoot, 'sample-tree');
const framePath = path.join(fixturesRoot, 'sample-tree.frame.golden.txt');
const goldenFrame = fs.readFileSync(framePath, 'utf8');

test('matches the golden ANSI frame for the fixture tree and a fixed seed', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const frame = renderFrame(dungeon);
  assert.equal(frame, goldenFrame);
});

test('is deterministic across repeated renders of the same dungeon', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const first = renderFrame(dungeon);
  const second = renderFrame(dungeon);
  assert.equal(first, second);
});

test('createPlayer starts at full health, standing in the entrance room', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const player = createPlayer(dungeon);
  const rootRoom = dungeon.rooms.find((room) => room.path === '.');
  assert.equal(player.hp, player.maxHp);
  assert.equal(player.roomId, rootRoom.id);
});

test('the frame contains the player marker and the HUD stats line', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const frame = renderFrame(dungeon);
  assert.ok(frame.includes('\x1b[1;33m@\x1b[0m'), 'player glyph must be present and colored');
  assert.ok(frame.includes(`Seed: ${dungeon.seed}`), 'HUD must show the seed');
  assert.ok(frame.includes(`Monsters: ${dungeon.monsters.length}`), 'HUD must show monster count');
});

test('the map has exactly one line per row plus a blank line and two HUD lines', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const frame = renderFrame(dungeon, undefined, { width: 20, height: 5 });
  const lines = frame.split('\n');
  assert.equal(lines.length, 5 + 1 + 2, 'map rows + blank separator + 2 HUD lines');
});

test('a different seed changes the rendered frame', () => {
  const a = renderFrame(generateDungeon(fixtureDir, { seed: 'test-seed' }));
  const b = renderFrame(generateDungeon(fixtureDir, { seed: 'a-different-seed' }));
  assert.notEqual(a, b);
});

test('rejects a non-positive canvas size', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  assert.throws(() => renderFrame(dungeon, undefined, { width: 0, height: 5 }), /positive/);
  assert.throws(() => renderFrame(dungeon, undefined, { width: 5, height: -1 }), /positive/);
});

test('a custom player position moves the "@" marker off the entrance room', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const otherRoom = dungeon.rooms.find((room) => room.path === 'docs/nested');
  const player = { hp: 15, maxHp: 20, roomId: otherRoom.id };
  const frame = renderFrame(dungeon, player);
  assert.ok(frame.includes(`Room: ${otherRoom.name}`));
  assert.ok(frame.includes('HP 15/20'));
});
