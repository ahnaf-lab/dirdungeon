import fs from 'node:fs';
import path from 'node:path';
import { seededHash } from './hash.js';

// Extension -> flavor monster. Kept small and explicit; anything not listed
// here falls through to WILDCARD_MONSTERS below, chosen deterministically by
// hash so unknown extensions still get a stable, varied monster rather than
// a single generic fallback for everything.
const MONSTER_TYPES = Object.freeze({
  '.js': 'javascript imp',
  '.mjs': 'javascript imp',
  '.cjs': 'javascript imp',
  '.ts': 'typescript wraith',
  '.jsx': 'react goblin',
  '.tsx': 'react goblin',
  '.py': 'python serpent',
  '.rb': 'ruby golem',
  '.go': 'gopher brute',
  '.rs': 'rust crab',
  '.java': 'java beetle',
  '.c': 'c troll',
  '.cpp': 'c troll',
  '.md': 'markdown ghost',
  '.json': 'json golem',
  '.yml': 'yaml wyrm',
  '.yaml': 'yaml wyrm',
  '.css': 'style specter',
  '.scss': 'style specter',
  '.html': 'html hydra',
  '.txt': 'text sprite',
  '.png': 'pixel phantom',
  '.jpg': 'pixel phantom',
  '.jpeg': 'pixel phantom',
  '.svg': 'pixel phantom',
  '.lock': 'lockjaw beast',
  '.sh': 'shell banshee',
  '.sql': 'query lich',
});

const WILDCARD_MONSTERS = Object.freeze([
  'shadow ooze',
  'byte wisp',
  'null slime',
  'void moth',
  'stray daemon',
  'orphan gremlin',
]);

// Byte-size tiers -> a strength level. Thresholds are arbitrary but fixed,
// so the same file size always lands on the same tier.
const SIZE_TIERS = Object.freeze([
  { max: 256, level: 1, tier: 'trivial' },
  { max: 1024, level: 2, tier: 'weak' },
  { max: 4096, level: 3, tier: 'moderate' },
  { max: 16384, level: 4, tier: 'tough' },
  { max: Infinity, level: 5, tier: 'brutal' },
]);

function classifyExtension(seed, relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext && MONSTER_TYPES[ext]) return MONSTER_TYPES[ext];
  const key = ext || path.basename(relPath);
  const idx = seededHash(seed, `ext:${key}`) % WILDCARD_MONSTERS.length;
  return WILDCARD_MONSTERS[idx];
}

function strengthForSize(size) {
  return SIZE_TIERS.find((tier) => size < tier.max) ?? SIZE_TIERS[SIZE_TIERS.length - 1];
}

// Pre-order walk with siblings sorted by name at every level. This is what
// makes the whole generator deterministic: fs.readdirSync order is not
// guaranteed to be stable across platforms, so we impose our own order
// instead of relying on it.
//
// `depth` is the nesting level of `absDir` itself (root is 0). `maxDepth`
// mirrors the familiar `find -maxdepth` meaning: a directory is only
// descended into while `depth < maxDepth`, so `maxDepth: 0` yields just the
// root room and its direct files, `maxDepth: 1` also includes the root's
// immediate subdirectories (and their files) but nothing deeper, and so on.
// Files are never excluded by depth on their own — only the recursion into
// deeper *directories* is cut off, so the deepest room still visited shows
// all of its own files.
function walk(absDir, relDir, entries, depth, maxDepth) {
  const items = fs
    .readdirSync(absDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const item of items) {
    const relPath = relDir === '.' ? item.name : path.posix.join(relDir, item.name);
    const absPath = path.join(absDir, item.name);

    if (item.isDirectory()) {
      if (maxDepth !== undefined && depth >= maxDepth) continue;
      entries.dirs.push(relPath);
      walk(absPath, relPath, entries, depth + 1, maxDepth);
    } else if (item.isFile()) {
      entries.files.push(relPath);
    }
  }
}

function parentOf(relPath) {
  const parent = path.posix.dirname(relPath);
  return parent === '.' || parent === '' ? '.' : parent;
}

/**
 * Deterministically generate a dungeon map from a real directory tree.
 *
 * Folders become rooms, the parent/child directory relationship becomes a
 * corridor, files become monsters placed in their parent directory's room,
 * file extension picks the monster type, and file size picks its strength
 * tier. Everything is derived from a seeded hash of the *relative* path, so
 * the same tree (and the same seed) always produces the exact same map,
 * regardless of machine, absolute path, or run order.
 *
 * @param {string} rootDir - path to the directory to turn into a dungeon.
 * @param {{ seed?: string, depth?: number }} [options] - `depth` caps how
 *   many levels of subdirectory are descended into (root is depth 0, so
 *   `depth: 0` means only the root room's own files are included);
 *   omitting it walks the entire tree.
 */
export function generateDungeon(rootDir, options = {}) {
  const seed = options.seed ?? 'dirdungeon';
  const maxDepth = options.depth;
  if (maxDepth !== undefined && (!Number.isInteger(maxDepth) || maxDepth < 0)) {
    throw new Error(`depth must be a non-negative integer, got: ${maxDepth}`);
  }
  const absRoot = path.resolve(rootDir);

  const rootStat = fs.statSync(absRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`not a directory: ${rootDir}`);
  }

  const entries = { dirs: ['.'], files: [] };
  walk(absRoot, '.', entries, 0, maxDepth);

  const roomIdByPath = new Map();
  const rooms = entries.dirs.map((relPath) => {
    const hash = seededHash(seed, `room:${relPath}`);
    const id = `room-${hash.toString(16)}`;
    roomIdByPath.set(relPath, id);
    return {
      id,
      path: relPath,
      name: relPath === '.' ? 'entrance hall' : path.posix.basename(relPath),
      x: hash % 1000,
      y: Math.floor(hash / 1000) % 1000,
    };
  });

  const corridors = entries.dirs
    .filter((relPath) => relPath !== '.')
    .map((relPath) => ({
      from: roomIdByPath.get(parentOf(relPath)),
      to: roomIdByPath.get(relPath),
    }));

  const monsters = entries.files.map((relPath) => {
    const absPath = path.join(absRoot, relPath);
    const stat = fs.statSync(absPath);
    const hash = seededHash(seed, `monster:${relPath}`);
    const { level, tier } = strengthForSize(stat.size);
    return {
      id: `monster-${hash.toString(16)}`,
      path: relPath,
      room: roomIdByPath.get(parentOf(relPath)),
      type: classifyExtension(seed, relPath),
      size: stat.size,
      level,
      tier,
    };
  });

  return {
    seed,
    root: path.basename(absRoot),
    rooms,
    corridors,
    monsters,
  };
}
