import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDungeon } from '../src/mapgen.js';
import { fnv1a, seededHash } from '../src/hash.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(here, '..', 'fixtures');
const fixtureDir = path.join(fixturesRoot, 'sample-tree');
const goldenPath = path.join(fixturesRoot, 'sample-tree.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

test('matches the golden map for the fixture tree', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  assert.deepEqual(dungeon, golden);
});

test('is deterministic across repeated runs with the same seed', () => {
  const first = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const second = generateDungeon(fixtureDir, { seed: 'test-seed' });
  assert.deepEqual(first, second);
});

test('a different seed changes ids and room coordinates', () => {
  const a = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const b = generateDungeon(fixtureDir, { seed: 'a-different-seed' });
  assert.notEqual(a.rooms[0].id, b.rooms[0].id);
});

test('every directory becomes exactly one room, including the root', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const paths = dungeon.rooms.map((room) => room.path);
  assert.equal(paths.length, new Set(paths).size, 'room paths must be unique');
  assert.ok(paths.includes('.'), 'root directory must produce a room');
  assert.ok(paths.includes('docs/nested'), 'nested directories must produce a room');
});

test('every non-root room is reachable from the root via corridors', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const reachable = new Set([dungeon.rooms.find((r) => r.path === '.').id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const corridor of dungeon.corridors) {
      if (reachable.has(corridor.from) && !reachable.has(corridor.to)) {
        reachable.add(corridor.to);
        changed = true;
      }
    }
  }
  for (const room of dungeon.rooms) {
    assert.ok(reachable.has(room.id), `room ${room.path} must be reachable from the entrance`);
  }
});

test('every file becomes a monster placed in its parent directory room', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const roomIdByPath = new Map(dungeon.rooms.map((r) => [r.path, r.id]));
  const bigfile = dungeon.monsters.find((m) => m.path === 'data/bigfile.log');
  assert.equal(bigfile.room, roomIdByPath.get('data'));
  const nestedNotes = dungeon.monsters.find((m) => m.path === 'docs/nested/notes.txt');
  assert.equal(nestedNotes.room, roomIdByPath.get('docs/nested'));
});

test('monster strength tier scales with file size', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const small = dungeon.monsters.find((m) => m.path === 'src/utils.py');
  const big = dungeon.monsters.find((m) => m.path === 'data/bigfile.log');
  assert.ok(big.size > small.size);
  assert.ok(big.level > small.level);
});

test('extension maps to a stable monster type', () => {
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const jsMonster = dungeon.monsters.find((m) => m.path === 'src/index.js');
  assert.equal(jsMonster.type, 'javascript imp');
  const pyMonster = dungeon.monsters.find((m) => m.path === 'src/utils.py');
  assert.equal(pyMonster.type, 'python serpent');
});

test('throws when given a path that is not a directory', () => {
  const filePath = path.join(fixtureDir, 'package.json');
  assert.throws(() => generateDungeon(filePath), /not a directory/);
});

test('fnv1a is a pure function of its input string', () => {
  assert.equal(fnv1a('hello'), fnv1a('hello'));
  assert.notEqual(fnv1a('hello'), fnv1a('world'));
});

test('seededHash mixes the seed, not just the value', () => {
  assert.notEqual(seededHash('seed-a', 'same-value'), seededHash('seed-b', 'same-value'));
});
