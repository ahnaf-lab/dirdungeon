#!/usr/bin/env node
import fs from 'node:fs';
import { generateDungeon } from '../src/mapgen.js';
import { renderFrame } from '../src/render.js';
import { autoClear } from '../src/game.js';

const USAGE = 'Usage: dirdungeon <directory> [--seed <seed>] [--depth <n>] [--json] [--clear]';

function parseArgs(argv) {
  const options = { json: false, clear: false, seed: undefined, depth: undefined };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--clear') {
      options.clear = true;
    } else if (arg === '--seed' || arg === '--depth') {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      options[key] = value;
      i += 1;
    } else if (arg.startsWith('--seed=')) {
      options.seed = arg.slice('--seed='.length);
    } else if (arg.startsWith('--depth=')) {
      options.depth = arg.slice('--depth='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) {
    throw new Error(`unexpected extra argument: ${positional[1]}`);
  }

  return { ...options, targetDir: positional[0] };
}

function parseDepth(raw) {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`--depth must be a non-negative integer, got: ${raw}`);
  }
  return Number(raw);
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`dirdungeon: ${err.message}`);
  console.error(USAGE);
  process.exit(1);
}

if (!options.targetDir) {
  console.error(USAGE);
  process.exit(1);
}

if (!fs.existsSync(options.targetDir) || !fs.statSync(options.targetDir).isDirectory()) {
  console.error(`dirdungeon: not a directory: ${options.targetDir}`);
  process.exit(1);
}

let depth;
try {
  depth = parseDepth(options.depth);
} catch (err) {
  console.error(`dirdungeon: ${err.message}`);
  process.exit(1);
}

const dungeon = generateDungeon(options.targetDir, {
  ...(options.seed !== undefined ? { seed: options.seed } : {}),
  ...(depth !== undefined ? { depth } : {}),
});

if (options.clear) {
  const game = autoClear(dungeon, { rootDir: options.targetDir });
  for (const line of game.log) console.log(line);
  if (game.status === 'dead') {
    process.exitCode = 1;
  }
} else if (options.json) {
  console.log(JSON.stringify(dungeon, null, 2));
} else {
  console.log(renderFrame(dungeon));
}
