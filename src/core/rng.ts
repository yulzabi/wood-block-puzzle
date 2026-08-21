/**
 * Seedable pseudo-random number generator (mulberry32).
 *
 * The generator is expressed as PURE functions over a single 32-bit integer
 * state: each call returns the next value together with the next state. There
 * are no module-level globals, so piece generation stays deterministic and the
 * whole game core remains a pure function of `(state, move)` — which is what
 * makes it reproducibly unit-testable.
 */

const UINT32 = 0x100000000; // 2^32

/** Normalize any number into a uint32 state value. */
function toUint32(n: number): number {
  return n >>> 0;
}

/**
 * Derive an initial generator state from an arbitrary seed.
 * In production, seed from `Date.now()` or `crypto.getRandomValues`.
 */
export function seedState(seed: number): number {
  // Mix the seed so small/adjacent seeds still diverge quickly.
  let h = toUint32(seed) + 0x6d2b79f5;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return toUint32(h ^ (h >>> 14));
}

/**
 * Advance the generator. Returns the next float in `[0, 1)` and the next state.
 */
export function nextRandom(state: number): { value: number; state: number } {
  // mulberry32: `state` is a plain counter. The next state is just this fixed-odd
  // increment — NOT the folded output mix computed below. Do not "simplify" by
  // returning the mixed value; that would change every RNG stream (piece deals and
  // level layouts) and break all determinism-dependent tests.
  let a = toUint32(state + 0x6d2b79f5);
  const next = a;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  const value = ((a ^ (a >>> 14)) >>> 0) / UINT32;
  return { value, state: next };
}

/**
 * Integer in `[0, n)`. Throws for non-positive `n`.
 */
export function nextInt(state: number, n: number): { value: number; state: number } {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`nextInt requires a positive integer bound, got ${n}`);
  }
  const r = nextRandom(state);
  return { value: Math.floor(r.value * n), state: r.state };
}
