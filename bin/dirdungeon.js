#!/usr/bin/env node
import fs from 'node:fs';
import { generateDungeon } from '../src/mapgen.js';

const [, , targetDir, seed] = process.argv;

if (!targetDir) {
  console.error('Usage: dirdungeon <directory> [seed]');
  process.exit(1);
}

if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
  console.error(`dirdungeon: not a directory: ${targetDir}`);
  process.exit(1);
}

const dungeon = generateDungeon(targetDir, seed ? { seed } : {});
console.log(JSON.stringify(dungeon, null, 2));
