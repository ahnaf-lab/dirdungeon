// FNV-1a, 32-bit. Chosen because it needs no dependency, is fast, and (unlike
// Math.random or Date.now) gives the exact same digest for the exact same
// string on every machine and every run — which is the whole point of a
// dungeon that is supposed to be "the same dungeon" for the same tree.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(str) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // >>> 0 forces the result into an unsigned 32-bit integer.
  return hash >>> 0;
}

// Hashes a (seed, value) pair rather than reusing fnv1a(seed + value) at call
// sites, so every seeded lookup in this codebase mixes the seed the same way.
export function seededHash(seed, value) {
  return fnv1a(`${seed}\u0000${value}`);
}
