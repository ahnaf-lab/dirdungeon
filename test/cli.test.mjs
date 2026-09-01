import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const binPath = path.join(repoRoot, 'bin', 'dirdungeon.js');
const fixtureDir = path.join(repoRoot, 'fixtures', 'sample-tree');
const goldenJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'fixtures', 'sample-tree.golden.json'), 'utf8')
);
const goldenFrame = fs.readFileSync(
  path.join(repoRoot, 'fixtures', 'sample-tree.frame.golden.txt'),
  'utf8'
);

function run(args, options = {}) {
  try {
    const stdout = execFileSync('node', [binPath, ...args], { encoding: 'utf8', ...options });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', status: err.status };
  }
}

test('--json with --seed reproduces the exact golden dungeon end to end', () => {
  const { stdout, status } = run([fixtureDir, '--seed', 'test-seed', '--json']);
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout), goldenJson);
});

test('default (no flags) renders the golden ANSI frame for a fixed seed', () => {
  const { stdout, status } = run([fixtureDir, '--seed', 'test-seed']);
  assert.equal(status, 0);
  assert.equal(stdout.replace(/\n$/, ''), goldenFrame);
});

test('--depth 0 keeps only the root room and its direct files', () => {
  const { stdout, status } = run([fixtureDir, '--seed', 'test-seed', '--depth', '0', '--json']);
  assert.equal(status, 0);
  const dungeon = JSON.parse(stdout);
  assert.deepEqual(dungeon.rooms.map((r) => r.path), ['.']);
  assert.deepEqual(
    dungeon.monsters.map((m) => m.path).sort(),
    ['README', 'package.json'].sort()
  );
});

test('--depth 1 includes immediate subdirectories but not deeper nesting', () => {
  const { stdout, status } = run([fixtureDir, '--seed', 'test-seed', '--depth', '1', '--json']);
  assert.equal(status, 0);
  const dungeon = JSON.parse(stdout);
  assert.deepEqual(
    dungeon.rooms.map((r) => r.path).sort(),
    ['.', 'data', 'docs', 'src'].sort()
  );
  assert.ok(!dungeon.monsters.some((m) => m.path === 'docs/nested/notes.txt'));
  assert.ok(dungeon.monsters.some((m) => m.path === 'docs/guide.md'));
});

test('a different --seed changes the dungeon, same tree and same depth', () => {
  const a = run([fixtureDir, '--seed', 'test-seed', '--json']);
  const b = run([fixtureDir, '--seed', 'other-seed', '--json']);
  assert.notEqual(JSON.parse(a.stdout).rooms[0].id, JSON.parse(b.stdout).rooms[0].id);
});

test('--clear deterministically clears a survivable subtree and prints the treasure report', () => {
  // The full fixture tree's combined monster damage exceeds the player's
  // default max HP (see test/loot.test.mjs), so this uses the small `docs/`
  // subtree, which the player can actually clear.
  const docsDir = path.join(fixtureDir, 'docs');
  const { stdout, status } = run([docsDir, '--seed', 'test-seed', '--clear']);
  assert.equal(status, 0);
  assert.ok(stdout.includes('The dungeon is cleared.'));
  assert.ok(stdout.includes('Treasure Report'));
});

test('exits non-zero with a usage message when no directory is given', () => {
  const { status, stderr } = run([]);
  assert.equal(status, 1);
  assert.match(stderr, /Usage: dirdungeon/);
});

test('exits non-zero for a path that does not exist', () => {
  const { status, stderr } = run([path.join(fixtureDir, 'nope-does-not-exist')]);
  assert.equal(status, 1);
  assert.match(stderr, /not a directory/);
});

test('exits non-zero for a non-integer --depth value', () => {
  const { status, stderr } = run([fixtureDir, '--depth', 'abc']);
  assert.equal(status, 1);
  assert.match(stderr, /--depth must be a non-negative integer/);
});

test('exits non-zero for an unknown flag', () => {
  const { status, stderr } = run([fixtureDir, '--bogus']);
  assert.equal(status, 1);
  assert.match(stderr, /unknown flag/);
});
