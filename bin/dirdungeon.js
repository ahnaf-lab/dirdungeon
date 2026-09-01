#!/usr/bin/env node
import fs from 'node:fs';
import { generateDungeon } from '../src/mapgen.js';
import { renderFrame } from '../src/render.js';
import { autoClear } from '../src/game.js';

const args = process.argv.slice(2);
const jsonIndex = args.indexOf('--json');
const wantsJson = jsonIndex !== -1;
if (wantsJson) args.splice(jsonIndex, 1);

const clearIndex = args.indexOf('--clear');
const wantsClear = clearIndex !== -1;
if (wantsClear) args.splice(clearIndex, 1);

const [targetDir, seed] = args;

if (!targetDir) {
  console.error('Usage: dirdungeon <directory> [seed] [--json] [--clear]');
  process.exit(1);
}

if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
  console.error(`dirdungeon: not a directory: ${targetDir}`);
  process.exit(1);
}

const dungeon = generateDungeon(targetDir, seed ? { seed } : {});

if (wantsClear) {
  const game = autoClear(dungeon, { rootDir: targetDir });
  for (const line of game.log) console.log(line);
  if (game.status === 'dead') {
    process.exitCode = 1;
  }
} else if (wantsJson) {
  console.log(JSON.stringify(dungeon, null, 2));
} else {
  console.log(renderFrame(dungeon));
}
