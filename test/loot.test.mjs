import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDungeon } from '../src/mapgen.js';
import { buildTreasureReport, formatTreasureReport } from '../src/loot.js';
import { autoClear } from '../src/game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(here, '..', 'fixtures');
const fixtureDir = path.join(fixturesRoot, 'sample-tree');
const goldenPath = path.join(fixturesRoot, 'sample-tree.loot.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

// Real filesystem mtimes are not preserved by a git checkout, so a report
// that ranks "oldest files" cannot be tested against whatever mtime happens
// to land on disk. Instead we pin every fixture file to a known date before
// each test, exactly like the golden files pin size/path/id already.
const FIXED_MTIMES = {
  README: '2020-01-01T00:00:00.000Z',
  'package.json': '2021-01-01T00:00:00.000Z',
  'src/index.js': '2022-06-01T00:00:00.000Z',
  'src/utils.py': '2019-03-15T00:00:00.000Z',
  'docs/guide.md': '2023-02-10T00:00:00.000Z',
  'docs/nested/notes.txt': '2018-07-04T00:00:00.000Z',
  'data/bigfile.log': '2024-05-20T00:00:00.000Z',
};

function pinFixtureMtimes() {
  for (const [relPath, iso] of Object.entries(FIXED_MTIMES)) {
    const date = new Date(iso);
    fs.utimesSync(path.join(fixtureDir, relPath), date, date);
  }
}

test('matches the golden treasure report for the fixture tree', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const report = buildTreasureReport(dungeon, fixtureDir);
  assert.deepEqual(report, golden);
});

test('largest files are sorted by size descending, ties broken by path', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const report = buildTreasureReport(dungeon, fixtureDir);
  const sizes = report.largestFiles.map((f) => f.size);
  const sorted = [...sizes].sort((a, b) => b - a);
  assert.deepEqual(sizes, sorted, 'must be in descending size order');
  assert.equal(report.largestFiles[0].path, 'data/bigfile.log', 'the biggest file leads');
});

test('oldest files are sorted by modification time ascending', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const report = buildTreasureReport(dungeon, fixtureDir);
  const times = report.oldestFiles.map((f) => Date.parse(f.mtime));
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted, 'must be in ascending modification-time order');
  assert.equal(report.oldestFiles[0].path, 'docs/nested/notes.txt', 'the oldest file leads');
});

test('limit controls how many entries come back per category', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const report = buildTreasureReport(dungeon, fixtureDir, { limit: 2 });
  assert.equal(report.largestFiles.length, 2);
  assert.equal(report.oldestFiles.length, 2);
});

test('rejects a non-positive limit', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  assert.throws(() => buildTreasureReport(dungeon, fixtureDir, { limit: 0 }), /positive integer/);
  assert.throws(() => buildTreasureReport(dungeon, fixtureDir, { limit: -3 }), /positive integer/);
});

test('formatTreasureReport renders a readable section for each category', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const report = buildTreasureReport(dungeon, fixtureDir);
  const text = formatTreasureReport(report);
  assert.ok(text.includes('Largest files'));
  assert.ok(text.includes('Oldest files'));
  assert.ok(text.includes('data/bigfile.log'), 'must name the biggest file');
  assert.ok(text.includes('docs/nested/notes.txt'), 'must name the oldest file');
});

test('is deterministic across repeated calls against the same fixture', () => {
  pinFixtureMtimes();
  const dungeon = generateDungeon(fixtureDir, { seed: 'test-seed' });
  const first = buildTreasureReport(dungeon, fixtureDir);
  const second = buildTreasureReport(dungeon, fixtureDir);
  assert.deepEqual(first, second);
});

// The full fixture tree's combined monster damage exceeds the player's
// default max HP (that is milestone 3's combat balance, unrelated to loot),
// so a survivable win here uses the small `docs/` subtree instead — two
// trivial-tier files is a real, on-disk dungeon the player can actually clear.
const docsDir = path.join(fixtureDir, 'docs');

test('autoClear walks the whole dungeon and attaches a loot report on win', () => {
  const dungeon = generateDungeon(docsDir, { seed: 'test-seed' });
  const game = autoClear(dungeon, { rootDir: docsDir });
  assert.equal(game.status, 'won');
  assert.equal(game.defeated.size, dungeon.monsters.length, 'every monster fought');
  assert.deepEqual(game.loot, buildTreasureReport(dungeon, docsDir));
  assert.ok(
    game.log.some((line) => line.includes('Treasure Report')),
    'the cleared log must include the loot report'
  );
});

test('autoClear without a rootDir still clears the dungeon, but with no loot', () => {
  const dungeon = generateDungeon(docsDir, { seed: 'test-seed' });
  const game = autoClear(dungeon);
  assert.equal(game.status, 'won');
  assert.equal(game.loot, null);
  assert.ok(!game.log.some((line) => line.includes('Treasure Report')));
});
