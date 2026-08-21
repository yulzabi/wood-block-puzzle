import { describe, expect, it } from 'vitest';
import { lineClearScore, placementScore, streakMultiplier } from './scoring';

describe('placementScore', () => {
  it('is one point per placed cell', () => {
    expect(placementScore(0)).toBe(0);
    expect(placementScore(1)).toBe(1);
    expect(placementScore(5)).toBe(5);
    expect(placementScore(9)).toBe(9);
  });
});

describe('lineClearScore', () => {
  it('is the triangular bonus 10*k(k+1)/2', () => {
    expect(lineClearScore(1)).toBe(10);
    expect(lineClearScore(2)).toBe(30);
    expect(lineClearScore(3)).toBe(60);
    expect(lineClearScore(4)).toBe(100);
    expect(lineClearScore(5)).toBe(150);
  });

  it('is 0 when no lines clear', () => {
    expect(lineClearScore(0)).toBe(0);
    expect(lineClearScore(-3)).toBe(0);
  });
});

describe('streakMultiplier', () => {
  it('is 1 for the first clear (streak 0 or 1)', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
  });

  it('adds 0.5 per consecutive clear', () => {
    expect(streakMultiplier(2)).toBe(1.5);
    expect(streakMultiplier(3)).toBe(2);
    expect(streakMultiplier(4)).toBe(2.5);
    expect(streakMultiplier(5)).toBe(3);
    expect(streakMultiplier(6)).toBe(3.5);
  });

  it('caps at 4', () => {
    expect(streakMultiplier(7)).toBe(4);
    expect(streakMultiplier(20)).toBe(4);
  });
});
