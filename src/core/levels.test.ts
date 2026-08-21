import { describe, expect, it } from 'vitest';
import { generateLevel, targetCountForLevel, targetScoreForLevel } from './levels';
import { findFullLines } from './board';
import { BOARD_SIZE } from './types';

const CELL = BOARD_SIZE * BOARD_SIZE;
const count = (a: Uint8Array): number => a.reduce((n, v) => n + (v ? 1 : 0), 0);

describe('generateLevel', () => {
  it('is deterministic per level number', () => {
    const a = generateLevel(4);
    const b = generateLevel(4);
    expect(Array.from(a.board)).toEqual(Array.from(b.board));
    expect(Array.from(a.targets)).toEqual(Array.from(b.targets));
    expect(a.targetScore).toBe(b.targetScore);
  });

  it('produces different starts for different levels', () => {
    expect(Array.from(generateLevel(1).board)).not.toEqual(Array.from(generateLevel(2).board));
  });

  it('scales target count and target score with the level (until the cap)', () => {
    expect(targetCountForLevel(1)).toBeLessThan(targetCountForLevel(5));
    expect(targetScoreForLevel(1)).toBeLessThan(targetScoreForLevel(5));
    expect(count(generateLevel(1).targets)).toBeLessThan(count(generateLevel(6).targets));
  });

  it('caps target count so the board stays playable', () => {
    // Deep level should be capped, never overrunning the board.
    expect(targetCountForLevel(999)).toBeLessThanOrEqual(28);
    expect(count(generateLevel(999).targets)).toBeLessThanOrEqual(28);
  });

  it('marks exactly the pre-filled cells as targets', () => {
    const { board, targets } = generateLevel(3);
    expect(targets.length).toBe(CELL);
    for (let i = 0; i < CELL; i++) {
      expect(targets[i] ? 1 : 0).toBe(board[i] ? 1 : 0);
    }
  });

  it('never pre-fills a full row or column and always leaves empty room', () => {
    for (const lvl of [1, 3, 7, 12, 40]) {
      const { board, targets } = generateLevel(lvl);
      const { rows, cols } = findFullLines(board);
      expect(rows).toEqual([]);
      expect(cols).toEqual([]);
      const filled = count(board);
      expect(filled).toBe(count(targets)); // every filled cell is a target
      expect(filled).toBeGreaterThan(0);
      expect(filled).toBeLessThan(CELL); // room remains
    }
  });

  it('is deterministic across a range of levels (locks layouts against RNG changes)', () => {
    for (const n of [1, 5, 20, 60]) {
      const a = generateLevel(n);
      const b = generateLevel(n);
      expect(Array.from(a.targets)).toEqual(Array.from(b.targets));
      expect(Array.from(a.board)).toEqual(Array.from(b.board));
      expect(a.targetScore).toBe(b.targetScore);
    }
  });

  it('places the full requested target count at low/mid levels', () => {
    // With plenty of room and the per-line gap constraint, low/mid levels always
    // reach the requested count.
    for (const lvl of [1, 2, 3, 5, 8, 10]) {
      expect(count(generateLevel(lvl).targets)).toBe(targetCountForLevel(lvl));
    }
  });

  it('still fills close to the cap at high levels (guards against silent under-fill)', () => {
    // At high levels `want` saturates the 28 cap; generation must not quietly
    // under-fill and let difficulty plateau. Floor at ~half the requested count.
    for (const lvl of [20, 60, 999]) {
      const want = targetCountForLevel(lvl);
      const placed = count(generateLevel(lvl).targets);
      expect(placed).toBeLessThanOrEqual(28);
      expect(placed).toBeGreaterThanOrEqual(Math.ceil(want / 2));
    }
  });
});
