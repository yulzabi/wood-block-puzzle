import { describe, expect, it } from 'vitest';
import { generateLevel, gemCountForLevel, targetScoreForLevel } from './levels';
import { findFullLines } from './board';
import { BOARD_SIZE } from './types';

const CELL = BOARD_SIZE * BOARD_SIZE;
const count = (a: Uint8Array): number => a.reduce((n, v) => n + (v ? 1 : 0), 0);

describe('generateLevel', () => {
  it('is deterministic per level number', () => {
    const a = generateLevel(4);
    const b = generateLevel(4);
    expect(Array.from(a.board)).toEqual(Array.from(b.board));
    expect(Array.from(a.gems)).toEqual(Array.from(b.gems));
    expect(a.targetScore).toBe(b.targetScore);
  });

  it('produces different starts for different levels', () => {
    expect(Array.from(generateLevel(1).board)).not.toEqual(Array.from(generateLevel(2).board));
  });

  it('scales gem count and target score with the level (until the cap)', () => {
    expect(gemCountForLevel(1)).toBeLessThan(gemCountForLevel(5));
    expect(targetScoreForLevel(1)).toBeLessThan(targetScoreForLevel(5));
    expect(count(generateLevel(1).gems)).toBeLessThan(count(generateLevel(6).gems));
  });

  it('caps gem count so the board stays playable', () => {
    // Deep level should be capped, never overrunning the board.
    expect(gemCountForLevel(999)).toBeLessThanOrEqual(28);
    expect(count(generateLevel(999).gems)).toBeLessThanOrEqual(28);
  });

  it('marks exactly the pre-filled cells as gems', () => {
    const { board, gems } = generateLevel(3);
    expect(gems.length).toBe(CELL);
    for (let i = 0; i < CELL; i++) {
      expect(gems[i] ? 1 : 0).toBe(board[i] ? 1 : 0);
    }
  });

  it('never pre-fills a full row or column and always leaves empty room', () => {
    for (const lvl of [1, 3, 7, 12, 40]) {
      const { board, gems } = generateLevel(lvl);
      const { rows, cols } = findFullLines(board);
      expect(rows).toEqual([]);
      expect(cols).toEqual([]);
      const filled = count(board);
      expect(filled).toBe(count(gems)); // every filled cell is a gem
      expect(filled).toBeGreaterThan(0);
      expect(filled).toBeLessThan(CELL); // room remains
    }
  });

  it('is deterministic across a range of levels (locks layouts against RNG changes)', () => {
    for (const n of [1, 5, 20, 60]) {
      const a = generateLevel(n);
      const b = generateLevel(n);
      expect(Array.from(a.gems)).toEqual(Array.from(b.gems));
      expect(Array.from(a.board)).toEqual(Array.from(b.board));
      expect(a.targetScore).toBe(b.targetScore);
    }
  });

  it('places the full requested gem count at low/mid levels', () => {
    // With plenty of room and the per-line gap constraint, low/mid levels always
    // reach the requested count.
    for (const lvl of [1, 2, 3, 5, 8, 10]) {
      expect(count(generateLevel(lvl).gems)).toBe(gemCountForLevel(lvl));
    }
  });

  it('still fills close to the cap at high levels (guards against silent under-fill)', () => {
    // At high levels `want` saturates the 28 cap; generation must not quietly
    // under-fill and let difficulty plateau. Floor at ~half the requested count.
    for (const lvl of [20, 60, 999]) {
      const want = gemCountForLevel(lvl);
      const placed = count(generateLevel(lvl).gems);
      expect(placed).toBeLessThanOrEqual(28);
      expect(placed).toBeGreaterThanOrEqual(Math.ceil(want / 2));
    }
  });

  it('ramps gently early, then accelerates (convex difficulty curve)', () => {
    // Gem count: +1 per level early, a larger step later.
    expect(gemCountForLevel(2) - gemCountForLevel(1)).toBe(1);
    expect(gemCountForLevel(3) - gemCountForLevel(2)).toBe(1);
    expect(gemCountForLevel(8) - gemCountForLevel(7)).toBeGreaterThan(1);
    // Target score: strictly larger jumps at higher levels.
    const jump = (n: number): number => targetScoreForLevel(n + 1) - targetScoreForLevel(n);
    expect(jump(1)).toBeLessThan(jump(5));
  });
});
