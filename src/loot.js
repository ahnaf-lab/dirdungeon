// The treasure report: what clearing the dungeon actually finds.
//
// Deliberately kept separate from mapgen.js. The map (rooms, corridors,
// monster placement) is a pure function of a seeded hash of each *relative*
// path — no absolute path, no filesystem clock — so the exact same tree
// always produces the exact same dungeon on any machine. A file's last-
// modified time has no such guarantee (git checkouts do not preserve
// mtimes), so it is read fresh from disk here, at report time, from a
// caller-supplied root directory — never folded into the deterministic
// dungeon object itself.
//
// "Largest files" is the loot: the monster's already-known size, sorted.
// "Oldest files" is the dead code: whichever files were modified longest
// ago, on the theory that a refactor finds its cruft in what nobody has
// touched.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LIMIT = 5;

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

// Ties are broken by path, ascending, so the report is stable and
// reproducible even when two files share a size or a modification time.
function byPath(a, b) {
  return a.path.localeCompare(b.path);
}

/**
 * Build the loot report for a cleared dungeon: the largest files (by byte
 * size, already known from `dungeon.monsters`) and the oldest files (by
 * filesystem modification time, read fresh from `rootDir`).
 *
 * @param {object} dungeon - output of `generateDungeon`.
 * @param {string} rootDir - the real directory the dungeon was generated
 *   from; used only to stat each file's mtime, never stored on the dungeon.
 * @param {{ limit?: number }} [options] - how many entries per category
 *   (default 5).
 * @returns {{
 *   largestFiles: Array<{ path: string, size: number, type: string }>,
 *   oldestFiles: Array<{ path: string, mtime: string, type: string }>,
 * }}
 */
export function buildTreasureReport(dungeon, rootDir, options = {}) {
  const limit = options.limit ?? DEFAULT_LIMIT;
  assertPositiveInteger(limit, 'limit');

  const withMtime = dungeon.monsters.map((monster) => {
    const absPath = path.join(rootDir, monster.path);
    const stat = fs.statSync(absPath);
    return { ...monster, mtimeMs: stat.mtimeMs };
  });

  const largestFiles = [...withMtime]
    .sort((a, b) => b.size - a.size || byPath(a, b))
    .slice(0, limit)
    .map(({ path: relPath, size, type }) => ({ path: relPath, size, type }));

  const oldestFiles = [...withMtime]
    .sort((a, b) => a.mtimeMs - b.mtimeMs || byPath(a, b))
    .slice(0, limit)
    .map(({ path: relPath, mtimeMs, type }) => ({
      path: relPath,
      mtime: new Date(mtimeMs).toISOString(),
      type,
    }));

  return { largestFiles, oldestFiles };
}

/** Render a `buildTreasureReport` result as plain text for the terminal. */
export function formatTreasureReport(report) {
  const lines = ['=== Treasure Report ==='];

  lines.push('', 'Largest files (heaviest loot):');
  if (report.largestFiles.length === 0) {
    lines.push('  (nothing but empty rooms)');
  }
  report.largestFiles.forEach((file, i) => {
    lines.push(`  ${i + 1}. ${file.path} \u2014 ${file.size} bytes (${file.type})`);
  });

  lines.push('', 'Oldest files (dead code relics):');
  if (report.oldestFiles.length === 0) {
    lines.push('  (nothing but empty rooms)');
  }
  report.oldestFiles.forEach((file, i) => {
    lines.push(`  ${i + 1}. ${file.path} \u2014 last touched ${file.mtime} (${file.type})`);
  });

  return lines.join('\n');
}
