# dirdungeon

A terminal roguelike whose dungeon is deterministically generated from a real
directory tree: folders become rooms, file sizes become monster strength, and
extensions become monster types. Clearing it is meant to print a loot report
of what you'd actually find if you refactored — that report is a later
milestone; this one adds the map, the player and a HUD, plus movement between
rooms and combat that auto-resolves from each monster's file size.

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

Render a directory as an ANSI dungeon map:

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

The rendered frame is a fixed-size character grid: `E` is the entrance room,
`#` is any other room, `m` is a room containing at least one monster
(colored by its strongest occupant's danger tier: green/cyan/yellow/magenta/
red for trivial through brutal), `·` is a corridor, and `@` is the player,
who starts at full health in the entrance room. A two-line HUD underneath
shows HP, seed, current room and remaining monster count.

Pass `--json` to get the underlying dungeon data instead of a rendered frame:

```
node bin/dirdungeon.js src --json
```

That JSON object has:

- `rooms` — one per directory, each with a stable `id` and an `(x, y)`
  position derived from a hash of its path.
- `corridors` — one per directory linking it to its parent directory's room.
- `monsters` — one per file, placed in its parent directory's room. `type` is
  derived from the file extension, and `level`/`tier` (`trivial` through
  `brutal`) are derived from the file's size in bytes.

You can also use it as a library:

```js
import { generateDungeon } from './src/mapgen.js';
import { renderFrame, createPlayer } from './src/render.js';

const dungeon = generateDungeon('./src', { seed: 'my-seed' });
const player = createPlayer(dungeon); // full health, standing in the entrance
console.log(renderFrame(dungeon, player));
```

### Movement and combat

`src/game.js` turns the static map into a playable state machine:

```js
import { generateDungeon } from './src/mapgen.js';
import { createGame, exits, move } from './src/game.js';

const dungeon = generateDungeon('./src');
const game = createGame(dungeon); // spawns in the entrance, fights anything already there

for (const room of exits(game)) {
  move(game, room.id); // walk into a directly-connected room
}

console.log(game.status); // 'playing' | 'won' | 'dead'
console.log(game.log);    // a line per move and per fight, in order
```

A corridor is the only legal move — you can walk to a directory's parent or
its immediate children, nothing further in one step. Walking into a room
auto-resolves a fight against every monster still alive there: each round
the player deals a fixed amount of damage and the monster deals damage equal
to its size-derived danger tier, until one side runs out of hit points. A
monster's hit points come directly from its file size (bigger files are
longer fights), so the exact same dungeon and the same sequence of moves
always plays out identically. The run ends in `'won'` once every monster is
defeated, or `'dead'` if the player runs out of health first.

Run the test suite with:

```
npm test
```

## Status

Built autonomously and gated on passing tests: every change here only ships
if the full test suite passes.
