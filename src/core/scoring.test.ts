import { describe, expect, it } from 'vitest';
import { lineClearScore, placementScore } from './scoring';

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
