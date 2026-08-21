import { describe, expect, it } from 'vitest';
import {
  GEM_MARGIN,
  generateLevel,
  gemCountForLevel,
  goalTypeForLevel,
  planGemSupply,
  targetScoreForLevel,
} from './levels';
import { findFullLines } from './board';
import { BOARD_SIZE } from './types';

const CELL = BOARD_SIZE * BOARD_SIZE;
const count = (a: Uint8Array): number => a.reduce((n, v) => n + (v ? 1 : 0), 0);
const sum = (c: Record<number, number>): number => Object.values(c).reduce((n, v) => n + v, 0);
/** Per-color counts of a gem channel. */
const perColor = (gems: Uint8Array): Record<number, number> => {
  const q: Record<number, number> = {};
  for (const v of gems) if (v !== 0) q[v] = (q[v] ?? 0) + 1;
  return q;
};

// Gem-goal levels used across the invariant checks (level 2+).
const GEM_LEVELS = [2, 3, 5, 8, 10, 20, 60, 999];

describe('goalTypeForLevel', () => {
  it('is a score goal at level 1 and a gem goal from level 2 on', () => {
    expect(goalTypeForLevel(1)).toBe('score');
    expect(goalTypeForLevel(2)).toBe('gems');
    expect(goalTypeForLevel(3)).toBe('gems');
    expect(goalTypeForLevel(10)).toBe('gems');
    expect(goalTypeForLevel(999)).toBe('gems');
  });
});

describe('planGemSupply', () => {
  it('supplies just enough per color to reach quota + margin, floored at 0', () => {
    // The headline "quota 20 red, board starts with 6" case: supply must cover
    // the shortfall plus the solvability margin. 6 + supply >= 20 + margin.
    const supply = planGemSupply({ 1: 20 }, { 1: 6 }, 2);
    expect(supply[1]).toBe(16); // 20 + 2 - 6
    expect(6 + (supply[1] ?? 0)).toBeGreaterThanOrEqual(20 + 2);
  });

  it('supplies 0 when the board already meets quota + margin', () => {
    const supply = planGemSupply({ 1: 5 }, { 1: 9 }, 2); // 9 >= 5 + 2
    expect(supply[1]).toBe(0);
  });

  it('plans each color independently', () => {
    const supply = planGemSupply({ 1: 10, 2: 4 }, { 1: 3, 2: 4 }, 1);
    expect(supply[1]).toBe(8); // 10 + 1 - 3
    expect(supply[2]).toBe(1); // 4 + 1 - 4
  });
});

describe('generateLevel — score goal (level 1)', () => {
  it('has no gems, empty quotas/supply, and a positive target score', () => {
    const lvl = generateLevel(1);
    expect(lvl.goalType).toBe('score');
    expect(count(lvl.gems)).toBe(0);
    expect(count(lvl.board)).toBe(0); // clean board, pure score race
    expect(sum(lvl.quotas)).toBe(0);
    expect(sum(lvl.gemSupplyRemaining)).toBe(0);
    expect(lvl.targetScore).toBeGreaterThan(0);
  });
});

describe('generateLevel — gem goal (level 2+)', () => {
  it('is deterministic per level number (board/gems/quotas/supply/goalType)', () => {
    for (const n of [2, 5, 20, 60]) {
      const a = generateLevel(n);
      const b = generateLevel(n);
      expect(Array.from(a.board)).toEqual(Array.from(b.board));
      expect(Array.from(a.gems)).toEqual(Array.from(b.gems));
      expect(a.quotas).toEqual(b.quotas);
      expect(a.gemSupplyRemaining).toEqual(b.gemSupplyRemaining);
      expect(a.goalType).toBe(b.goalType);
      expect(a.targetScore).toBe(b.targetScore);
    }
  });

  it('produces different starts for different levels', () => {
    expect(Array.from(generateLevel(2).board)).not.toEqual(Array.from(generateLevel(3).board));
  });

  it('introduces colorblind-distinguishable colors first (blue, then amber, then red)', () => {
    // A single-color level leads with blue (2) — not the red/green pair that
    // red-green color blindness confuses.
    expect(Object.keys(generateLevel(2).quotas)).toEqual(['2']);
    // A three-color level uses the first three of the order: blue, amber, red.
    const threeColor = new Set(Object.keys(generateLevel(8).quotas).map(Number));
    expect(threeColor).toEqual(new Set([2, 4, 1]));
  });

  it('sets a positive per-color quota and starts with fewer board gems than the quota', () => {
    for (const lvl of GEM_LEVELS) {
      const { gems, quotas } = generateLevel(lvl);
      expect(sum(quotas)).toBeGreaterThan(0);
      // The board holds only a portion of the objective; the rest is supply.
      expect(count(gems)).toBeLessThan(sum(quotas));
    }
  });

  it('marks exactly the pre-filled cells as gems (board and gem channel agree)', () => {
    const { board, gems } = generateLevel(3);
    expect(gems.length).toBe(CELL);
    for (let i = 0; i < CELL; i++) {
      expect(gems[i] ? 1 : 0).toBe(board[i] ? 1 : 0);
      if (gems[i]) expect(gems[i]).toBe(board[i]); // gem color matches the block
    }
  });

  it('per-color board gems never exceed that color’s quota', () => {
    for (const lvl of GEM_LEVELS) {
      const { gems, quotas } = generateLevel(lvl);
      const onBoard = perColor(gems);
      for (const [color, n] of Object.entries(onBoard)) {
        expect(n).toBeLessThanOrEqual(quotas[Number(color)] ?? 0);
      }
    }
  });

  it('upholds the solvability invariant: start + supply >= quota + margin per color', () => {
    for (const lvl of GEM_LEVELS) {
      const { gems, quotas, gemSupplyRemaining } = generateLevel(lvl);
      const start = perColor(gems);
      for (const [color, quota] of Object.entries(quotas)) {
        const c = Number(color);
        const available = (start[c] ?? 0) + (gemSupplyRemaining[c] ?? 0);
        expect(available).toBeGreaterThanOrEqual(quota + GEM_MARGIN);
      }
    }
  });

  it('never pre-fills a full row or column and always leaves empty room', () => {
    for (const lvl of GEM_LEVELS) {
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
});

describe('level difficulty ramps', () => {
  it('scales the gem count and target score with the level (until the cap)', () => {
    expect(gemCountForLevel(1)).toBeLessThan(gemCountForLevel(5));
    expect(targetScoreForLevel(1)).toBeLessThan(targetScoreForLevel(5));
  });

  it('caps the gem count so the board stays playable', () => {
    expect(gemCountForLevel(999)).toBeLessThanOrEqual(28);
  });

  it('ramps gently early, then accelerates (convex difficulty curve)', () => {
    expect(gemCountForLevel(2) - gemCountForLevel(1)).toBe(1);
    expect(gemCountForLevel(3) - gemCountForLevel(2)).toBe(1);
    expect(gemCountForLevel(8) - gemCountForLevel(7)).toBeGreaterThan(1);
    const jump = (n: number): number => targetScoreForLevel(n + 1) - targetScoreForLevel(n);
    expect(jump(1)).toBeLessThan(jump(5));
  });
});
