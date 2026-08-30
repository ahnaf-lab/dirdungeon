# dirdungeon

A terminal roguelike whose dungeon is deterministically generated from a real
directory tree: folders become rooms, file sizes become monster strength, and
extensions become monster types. Clearing it is meant to print a loot report
of what you'd actually find if you refactored — that gameplay loop is a later
milestone; this one is the map generator underneath it.

Point it at any directory and it hashes the paths in that tree into a fixed
set of rooms, corridors and monsters. Run it again, on the same tree, and you
get the exact same dungeon back — no randomness, no external state, just a
seeded hash of each path.

## Install

Requires Node.js 18 or later. No external dependencies.

```
npm install
```

## Usage

Generate a dungeon from any directory and print it as JSON:

```
node bin/dirdungeon.js <directory> [seed]
```

For example, to turn this repository's own source tree into a dungeon:

```
node bin/dirdungeon.js src
```

The `seed` argument is optional (it defaults to `"dirdungeon"`); pass a
different seed to get a different-looking dungeon from the same tree without
changing any files.

Output is a JSON object:

- `rooms` — one per directory, each with a stable `id` and an `(x, y)`
  position derived from a hash of its path.
- `corridors` — one per directory linking it to its parent directory's room.
- `monsters` — one per file, placed in its parent directory's room. `type` is
  derived from the file extension, and `level`/`tier` (`trivial` through
  `brutal`) are derived from the file's size in bytes.

You can also use it as a library:

```js
import { generateDungeon } from './src/mapgen.js';

const dungeon = generateDungeon('./src', { seed: 'my-seed' });
```

Run the test suite with:

```
npm test
```

## Status

Built autonomously and gated on passing tests: every change here only ships
if the full test suite passes.
