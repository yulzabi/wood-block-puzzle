import { describe, it, expect } from 'vitest';
import { seedState, nextRandom, nextInt } from './rng';

/** Collect `count` floats starting from `state`, threading the state. */
function stream(state: number, count: number): number[] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < count; i++) {
    const r = nextRandom(s);
    out.push(r.value);
    s = r.state;
  }
  return out;
}

describe('rng', () => {
  it('produces an identical stream for the same seed', () => {
    const a = stream(seedState(12345), 20);
    const b = stream(seedState(12345), 20);
    expect(a).toEqual(b);
  });

  it('produces different streams for different seeds', () => {
    const a = stream(seedState(1), 20);
    const b = stream(seedState(2), 20);
    expect(a).not.toEqual(b);
  });

  it('advances state deterministically (each step is a pure function of state)', () => {
    const s0 = seedState(999);
    const first = nextRandom(s0);
    const firstAgain = nextRandom(s0);
    // Same input state -> same output value AND same next state.
    expect(firstAgain.value).toBe(first.value);
    expect(firstAgain.state).toBe(first.state);
    // A second step from the advanced state differs from the first.
    const second = nextRandom(first.state);
    expect(second.value).not.toBe(first.value);
  });

  it('returns floats in [0, 1)', () => {
    let s = seedState(7);
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.state;
    }
  });

  it('nextInt(state, n) stays within [0, n)', () => {
    let s = seedState(42);
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(s, 31);
      expect(Number.isInteger(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(31);
      s = r.state;
    }
  });

  it('nextInt with n=1 always returns 0', () => {
    let s = seedState(3);
    for (let i = 0; i < 50; i++) {
      const r = nextInt(s, 1);
      expect(r.value).toBe(0);
      s = r.state;
    }
  });

  it('nextInt rejects a non-positive bound', () => {
    expect(() => nextInt(seedState(1), 0)).toThrow();
    expect(() => nextInt(seedState(1), -5)).toThrow();
  });
});
