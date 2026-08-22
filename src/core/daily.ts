/**
 * Daily Challenge (pure, DOM-free, deterministic).
 *
 * A once-a-day Endless run seeded from the calendar date, plus a daily-play
 * streak with one-day forgiveness. All logic is a pure function of an injected
 * `today` (a `YYYY-MM-DD` string) — nothing here reads the clock, so it is fully
 * reproducible in tests. Persistence lives in platform/storage.ts.
 *
 * Two dates are tracked for two distinct jobs:
 * - `lastPlayedDate` — the day the single attempt was consumed (drives
 *   `canPlayDaily`). Set at game START, so quitting mid-run still counts as used.
 * - `lastCompletedDate` — the day a run reached a result. Drives the streak's
 *   day-gap math, so the streak rewards FINISHING the daily, not merely opening it.
 */

/** The most recent completed daily result. */
export interface DailyResult {
  readonly score: number;
}

/** Persisted daily state (see platform/storage.ts for load/save). */
export interface DailyState {
  /** Day the attempt was consumed (set at start); null = never played. */
  readonly lastPlayedDate: string | null;
  /** Day a run last reached a result (drives the streak); null = never completed. */
  readonly lastCompletedDate: string | null;
  /** The most recent completed result; null until the first completion. */
  readonly lastResult: DailyResult | null;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly bestScore: number;
}

/** A fresh daily record (nothing played yet). */
export const DEFAULT_DAILY_STATE: DailyState = {
  lastPlayedDate: null,
  lastCompletedDate: null,
  lastResult: null,
  currentStreak: 0,
  longestStreak: 0,
  bestScore: 0,
};

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a `YYYY-MM-DD` string; throws on a malformed value (a programming error). */
function parts(date: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new RangeError(`daily date must be YYYY-MM-DD, got "${date}"`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Whole-day index (UTC) for gap math; deterministic (no clock read). */
function dayIndex(date: string): number {
  const { y, m, d } = parts(date);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/**
 * Format a `Date` as a local-calendar `YYYY-MM-DD` string — the app's single
 * clock-read boundary for the daily (so the daily rolls over at the player's
 * local midnight). Everything downstream takes this string, keeping the logic
 * deterministic and testable.
 */
export function formatDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Deterministic seed for the daily run on `date` (a `YYYY-MM-DD` string): the
 * numeric `YYYYMMDD`. Same date → same seed → same piece sequence for everyone;
 * different dates differ. Feed it to `newGame(seed, …)` (which mixes it via
 * `seedState`, so even adjacent dates diverge into well-separated RNG streams).
 */
export function dailySeedFor(date: string): number {
  const { y, m, d } = parts(date);
  return y * 10000 + m * 100 + d;
}

/** True iff the daily has not yet been played on `today` (single attempt/day). */
export function canPlayDaily(state: DailyState, today: string): boolean {
  return state.lastPlayedDate !== today;
}

/**
 * Consume today's attempt at game START. Marks `today` played so `canPlayDaily`
 * flips immediately — quitting mid-run cannot restore it (quit = used). Does not
 * touch the streak (that advances only on a recorded result). Pure.
 */
export function startDaily(state: DailyState, today: string): DailyState {
  return { ...state, lastPlayedDate: today };
}

/**
 * The streak after completing on `today`, given the previous completion date.
 * A consecutive day (gap 1) or a single missed day (gap 2, forgiven) continues
 * the streak; two or more consecutive missed days (gap ≥ 3), or no prior
 * completion, (re)start it at 1.
 */
function streakAfter(current: number, lastCompleted: string | null, today: string): number {
  if (lastCompleted === null) return 1;
  const gap = dayIndex(today) - dayIndex(lastCompleted);
  if (gap <= 0) return Math.max(current, 1); // same day / clock skew — hold (defensive)
  if (gap <= 2) return current + 1; // consecutive (1) or one forgiven miss (2)
  return 1; // gap ≥ 3 → second consecutive miss broke the streak; restart
}

/**
 * Record a completed daily run (on game-over) for `today` with `score`. Updates
 * the streak (via the completion day-gap), longest streak, best score, and last
 * result; also marks `today` played (defensive). Re-recording the same day does
 * not double-count the streak — it only refreshes the score/result. Pure.
 */
export function recordDailyResult(state: DailyState, today: string, score: number): DailyState {
  const s = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
  const result: DailyResult = { score: s };
  const bestScore = Math.max(state.bestScore, s);

  if (state.lastCompletedDate === today) {
    // Already completed today — refresh result/best, but the streak stands.
    return { ...state, lastPlayedDate: today, lastResult: result, bestScore };
  }

  const currentStreak = streakAfter(state.currentStreak, state.lastCompletedDate, today);
  return {
    ...state,
    lastPlayedDate: today,
    lastCompletedDate: today,
    lastResult: result,
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    bestScore,
  };
}
