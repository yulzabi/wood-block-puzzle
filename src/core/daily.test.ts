import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_STATE,
  canPlayDaily,
  dailySeedFor,
  formatDay,
  recordDailyResult,
  startDaily,
  type DailyState,
} from './daily';

describe('formatDay', () => {
  it('formats a Date as a zero-padded local YYYY-MM-DD', () => {
    expect(formatDay(new Date(2026, 0, 5))).toBe('2026-01-05'); // Jan is month 0, single-digit day
    expect(formatDay(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips through dailySeedFor', () => {
    expect(dailySeedFor(formatDay(new Date(2026, 7, 22)))).toBe(20260822);
  });
});

describe('dailySeedFor', () => {
  it('maps a date to its YYYYMMDD integer (fixed date → fixed seed)', () => {
    expect(dailySeedFor('2026-08-22')).toBe(20260822);
    expect(dailySeedFor('2026-08-22')).toBe(dailySeedFor('2026-08-22')); // deterministic
  });

  it('gives different seeds for different dates', () => {
    expect(dailySeedFor('2026-08-22')).not.toBe(dailySeedFor('2026-08-23'));
    expect(dailySeedFor('2026-08-22')).not.toBe(dailySeedFor('2025-08-22'));
  });

  it('throws on a malformed date (a programming error, not a value to swallow)', () => {
    expect(() => dailySeedFor('not-a-date')).toThrow(RangeError);
    expect(() => dailySeedFor('2026-8-22')).toThrow();
  });
});

describe('canPlayDaily (single attempt/day)', () => {
  it('is true on a fresh record and false once today is played', () => {
    expect(canPlayDaily(DEFAULT_DAILY_STATE, '2026-08-22')).toBe(true);
    const used = startDaily(DEFAULT_DAILY_STATE, '2026-08-22');
    expect(canPlayDaily(used, '2026-08-22')).toBe(false); // same-day replay blocked
    expect(canPlayDaily(used, '2026-08-23')).toBe(true); // a new day is playable
  });
});

describe('startDaily (quit = used)', () => {
  it('marks the day played without touching the streak', () => {
    const s = startDaily(DEFAULT_DAILY_STATE, '2026-08-22');
    expect(s.lastPlayedDate).toBe('2026-08-22');
    expect(s.currentStreak).toBe(0); // streak advances only on a recorded result
    expect(s.lastCompletedDate).toBeNull();
  });

  it('is pure — the input state is not mutated', () => {
    const before = { ...DEFAULT_DAILY_STATE };
    startDaily(DEFAULT_DAILY_STATE, '2026-08-22');
    expect(DEFAULT_DAILY_STATE).toEqual(before);
  });
});

describe('recordDailyResult — streak transitions', () => {
  const play = (state: DailyState, date: string, score: number): DailyState =>
    recordDailyResult(startDaily(state, date), date, score);

  it('first completion starts the streak at 1 and tracks best/longest', () => {
    const s = play(DEFAULT_DAILY_STATE, '2026-08-22', 500);
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(1);
    expect(s.bestScore).toBe(500);
    expect(s.lastResult).toEqual({ score: 500 });
    expect(s.lastCompletedDate).toBe('2026-08-22');
  });

  it('consecutive days build the streak', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-22', 100);
    s = play(s, '2026-08-23', 100);
    s = play(s, '2026-08-24', 100);
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
  });

  it('forgives a single missed day (gap of one day keeps the streak)', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-22', 100); // streak 1
    s = play(s, '2026-08-24', 100); // skipped the 23rd — forgiven
    expect(s.currentStreak).toBe(2);
  });

  it('resets on a second consecutive missed day', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-22', 100); // streak 1
    s = play(s, '2026-08-25', 100); // skipped 23rd + 24th — streak broke
    expect(s.currentStreak).toBe(1); // this completion starts a fresh streak
  });

  it('longestStreak retains the peak after a reset', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-22', 100);
    s = play(s, '2026-08-23', 100);
    s = play(s, '2026-08-24', 100); // peak 3
    s = play(s, '2026-08-28', 100); // long gap → currentStreak resets to 1
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(3);
  });

  it('handles month/year boundaries in the day-gap math', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-31', 100); // streak 1
    s = play(s, '2026-09-01', 100); // next calendar day across the month boundary
    expect(s.currentStreak).toBe(2);
  });

  it('bestScore keeps the max; a later lower score does not lower it', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-22', 900);
    s = play(s, '2026-08-23', 300);
    expect(s.bestScore).toBe(900);
    expect(s.lastResult).toEqual({ score: 300 }); // lastResult is the latest, not the best
  });

  it('clamps a negative/non-finite score to 0', () => {
    const s = play(DEFAULT_DAILY_STATE, '2026-08-22', -50);
    expect(s.lastResult).toEqual({ score: 0 });
    expect(s.bestScore).toBe(0);
  });

  it('re-recording the same day does not double-count the streak', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-22', 100); // streak 1
    const before = s.currentStreak;
    s = recordDailyResult(s, '2026-08-22', 250); // same day again
    expect(s.currentStreak).toBe(before); // unchanged
    expect(s.bestScore).toBe(250); // but a higher score is still captured
    expect(s.lastResult).toEqual({ score: 250 });
  });

  it('is pure — does not mutate the input state', () => {
    const start = startDaily(DEFAULT_DAILY_STATE, '2026-08-22');
    const snapshot = JSON.parse(JSON.stringify(start));
    recordDailyResult(start, '2026-08-22', 400);
    expect(JSON.parse(JSON.stringify(start))).toEqual(snapshot);
  });

  it('holds the streak on a backwards date (clock skew is not corrupting)', () => {
    let s = play(DEFAULT_DAILY_STATE, '2026-08-25', 100);
    s = play(s, '2026-08-26', 100); // streak 2, last completed the 26th
    s = recordDailyResult(startDaily(s, '2026-08-24'), '2026-08-24', 100); // earlier date
    expect(s.currentStreak).toBe(2); // neither advanced nor reset
  });
});
