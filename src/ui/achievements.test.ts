import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementById, evaluate, type AchievementSignal } from './achievements';

// --- Signal builders (only the fields each signal type carries) ---
const clear = (lines: number, totalLines = lines, boardEmptyAfterClear = false): AchievementSignal => ({
  type: 'clear',
  lines,
  boardEmptyAfterClear,
  totalLines,
});
const combo = (multiplier: number): AchievementSignal => ({ type: 'combo', multiplier });
const level = (n: number): AchievementSignal => ({ type: 'levelComplete', level: n });
const daily = (currentStreak: number, bestScore: number): AchievementSignal => ({
  type: 'daily',
  currentStreak,
  bestScore,
});

describe('ACHIEVEMENTS list', () => {
  it('has 18 achievements with unique ids across the four families', () => {
    expect(ACHIEVEMENTS).toHaveLength(18);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(18); // all unique
    expect(new Set(ACHIEVEMENTS.map((a) => a.family))).toEqual(
      new Set(['clearing', 'streak', 'levels', 'daily']),
    );
    // Every achievement carries display copy for the UI.
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.unlock.length).toBeGreaterThan(0);
    }
  });

  it('achievementById looks up by id', () => {
    expect(achievementById('clean-sweep')?.name).toBe('Clean Sweep');
    expect(achievementById('nope')).toBeUndefined();
  });
});

describe('evaluate — clearing family', () => {
  it('first-clear fires on any clear; not on non-clear signals', () => {
    expect(evaluate(clear(1), [])).toContain('first-clear');
    expect(evaluate(combo(3), [])).not.toContain('first-clear');
    expect(evaluate(level(9), [])).not.toContain('first-clear');
    expect(evaluate(daily(3, 200), [])).not.toContain('first-clear');
  });

  it('double/triple/clean-sweep fire at their exact / threshold line counts', () => {
    expect(evaluate(clear(1), ['first-clear'])).toEqual([]);
    expect(evaluate(clear(2), ['first-clear'])).toEqual(['double']);
    expect(evaluate(clear(3), ['first-clear'])).toEqual(['triple']);
    expect(evaluate(clear(4), ['first-clear'])).toEqual(['clean-sweep']);
    expect(evaluate(clear(5), ['first-clear'])).toEqual(['clean-sweep']); // 4+ still clean-sweep
    // A double is not also a triple/clean-sweep.
    expect(evaluate(clear(2), ['first-clear'])).not.toContain('triple');
  });

  it('fresh-start fires only when the board is empty after the clear', () => {
    expect(evaluate(clear(2, 2, false), ['first-clear'])).not.toContain('fresh-start');
    expect(evaluate(clear(2, 2, true), ['first-clear'])).toContain('fresh-start');
  });

  it('line milestones fire on the lifetime total (from Stats), not per-move', () => {
    expect(evaluate(clear(1, 99), ['first-clear'])).toEqual([]);
    expect(evaluate(clear(1, 100), ['first-clear'])).toEqual(['lines-100']);
    expect(evaluate(clear(1, 499), ['first-clear', 'lines-100'])).toEqual([]);
    expect(evaluate(clear(1, 500), ['first-clear', 'lines-100'])).toEqual(['lines-500']);
  });

  it('multi-unlock: a 4-line clear that empties the board and crosses 100 lines fires all three', () => {
    // Ordered by ACHIEVEMENTS order: clean-sweep, fresh-start, lines-100.
    expect(evaluate(clear(4, 100, true), ['first-clear'])).toEqual([
      'clean-sweep',
      'fresh-start',
      'lines-100',
    ]);
  });
});

describe('evaluate — streak family (multiplier thresholds)', () => {
  it('fires cumulatively as the multiplier climbs; a combo touches only streak ids', () => {
    expect(evaluate(combo(1.5), [])).toEqual([]);
    expect(evaluate(combo(2), [])).toEqual(['streak-x2']);
    expect(evaluate(combo(3), [])).toEqual(['streak-x2', 'streak-x3']);
    expect(evaluate(combo(5), [])).toEqual(['streak-x2', 'streak-x3', 'streak-x5']);
    // At the cap with the lower ones already earned, only the top is new.
    expect(evaluate(combo(5), ['streak-x2', 'streak-x3'])).toEqual(['streak-x5']);
    // A combo never fires a clearing/level/daily achievement.
    expect(evaluate(combo(5), [])).not.toContain('first-clear');
  });
});

describe('evaluate — levels family', () => {
  it('beat-level fires for every threshold at or below the completed level', () => {
    expect(evaluate(level(4), [])).toEqual([]);
    expect(evaluate(level(5), [])).toEqual(['level-5']);
    expect(evaluate(level(10), [])).toEqual(['level-5', 'level-10']);
    expect(evaluate(level(50), [])).toEqual(['level-5', 'level-10', 'level-25', 'level-50']);
    // Sequential play: beating 10 with 5 already earned adds only level-10.
    expect(evaluate(level(10), ['level-5'])).toEqual(['level-10']);
  });
});

describe('evaluate — daily family', () => {
  it('first-daily fires on any daily; streak + best thresholds are inclusive/over', () => {
    expect(evaluate(daily(1, 0), [])).toEqual(['first-daily']);
    expect(evaluate(daily(7, 0), ['first-daily'])).toEqual(['daily-streak-7']);
    expect(evaluate(daily(30, 0), ['first-daily', 'daily-streak-7'])).toEqual(['daily-streak-30']);
    // "over 500" is strict — exactly 500 does not qualify.
    expect(evaluate(daily(1, 500), ['first-daily'])).toEqual([]);
    expect(evaluate(daily(1, 501), ['first-daily'])).toEqual(['daily-best-500']);
  });
});

describe('evaluate — never re-reports already-unlocked', () => {
  it('returns nothing when every triggering id is already unlocked', () => {
    const all = ACHIEVEMENTS.map((a) => a.id);
    expect(evaluate(clear(4, 500, true), all)).toEqual([]);
    expect(evaluate(combo(5), all)).toEqual([]);
    expect(evaluate(level(50), all)).toEqual([]);
    expect(evaluate(daily(30, 999), all)).toEqual([]);
  });

  it('accepts a Set as the already-unlocked input', () => {
    expect(evaluate(clear(2), new Set(['first-clear', 'double']))).toEqual([]);
  });
});
