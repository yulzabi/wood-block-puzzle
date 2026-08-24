/**
 * Achievements — pure, DOM-free, deterministic evaluator (design plan §3).
 *
 * The app feeds this a `Signal` built from signals it ALREADY has — a line
 * clear (rows+cols count, a board-empty scan, the lifetime line total from
 * Stats), a combo event (its multiplier), a level completion (the level), or a
 * daily result (its streak + best). `evaluate` returns the ids newly earned by
 * that signal. No new core counters exist for this list (see §3): every input
 * is derivable from existing events/Stats/DailyState.
 *
 * Nothing here touches the DOM, storage, or the clock — persistence lives in
 * platform/storage.ts (loadAchievements / recordAchievements), and the UI
 * (toast + Awards panel) is a separate slice.
 */

/** The four achievement families. */
export type AchievementFamily = 'clearing' | 'streak' | 'levels' | 'daily';

/** A single achievement's stable identity + display copy (pure data for the UI). */
export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly family: AchievementFamily;
  /** Human-readable unlock condition (shown on locked medallions). */
  readonly unlock: string;
}

/**
 * A game signal the evaluator can react to — each field is something the app
 * spine already has when the signal fires.
 */
export type AchievementSignal =
  /** A line clear resolved this move. */
  | {
      readonly type: 'clear';
      /** Lines cleared in this single move (rows + cols). */
      readonly lines: number;
      /** True if the board is empty after the clear (a cheap scan by the app). */
      readonly boardEmptyAfterClear: boolean;
      /** Lifetime total lines cleared AFTER this move (from Stats — not a new counter). */
      readonly totalLines: number;
    }
  /** A combo/streak event resolved this move. */
  | { readonly type: 'combo'; readonly multiplier: number }
  /** A level was completed. */
  | { readonly type: 'levelComplete'; readonly level: number }
  /** A daily run's result was recorded (post recordDailyResult). */
  | { readonly type: 'daily'; readonly currentStreak: number; readonly bestScore: number };

/** The 18 achievements (four families), in a stable display order. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  // Clearing
  { id: 'first-clear', name: 'First Clear', family: 'clearing', unlock: 'Clear your first line' },
  { id: 'double', name: 'Double', family: 'clearing', unlock: 'Clear 2 lines in one move' },
  { id: 'triple', name: 'Triple', family: 'clearing', unlock: 'Clear 3 lines in one move' },
  { id: 'clean-sweep', name: 'Clean Sweep', family: 'clearing', unlock: 'Clear 4 lines in one move' },
  { id: 'fresh-start', name: 'Fresh Start', family: 'clearing', unlock: 'Clear the whole board' },
  { id: 'lines-100', name: '100 Lines', family: 'clearing', unlock: 'Clear 100 lines total' },
  { id: 'lines-500', name: '500 Lines', family: 'clearing', unlock: 'Clear 500 lines total' },
  // Streak
  { id: 'streak-x2', name: 'Warming Up', family: 'streak', unlock: 'Reach a ×2 streak' },
  { id: 'streak-x3', name: 'On Fire', family: 'streak', unlock: 'Reach a ×3 streak' },
  { id: 'streak-x5', name: 'Unstoppable', family: 'streak', unlock: 'Reach the ×5 streak' },
  // Levels
  { id: 'level-5', name: 'Beat Level 5', family: 'levels', unlock: 'Beat level 5' },
  { id: 'level-10', name: 'Beat Level 10', family: 'levels', unlock: 'Beat level 10' },
  { id: 'level-25', name: 'Beat Level 25', family: 'levels', unlock: 'Beat level 25' },
  { id: 'level-50', name: 'Beat Level 50', family: 'levels', unlock: 'Beat level 50' },
  // Daily
  { id: 'first-daily', name: 'First Daily', family: 'daily', unlock: 'Play your first Daily' },
  { id: 'daily-streak-7', name: '7-Day Streak', family: 'daily', unlock: 'Reach a 7-day Daily streak' },
  { id: 'daily-streak-30', name: '30-Day Streak', family: 'daily', unlock: 'Reach a 30-day Daily streak' },
  { id: 'daily-best-500', name: 'Daily High Roller', family: 'daily', unlock: 'Score over 500 in a Daily' },
];

/**
 * Per-id predicate over a signal. Kept internal (the exported ACHIEVEMENTS list
 * stays pure display data). A clearing signal always has `lines >= 1` (the app
 * only emits a clear when lines cleared), so `first-clear` fires on any clear.
 */
const PREDICATES: Record<string, (s: AchievementSignal) => boolean> = {
  'first-clear': (s) => s.type === 'clear',
  double: (s) => s.type === 'clear' && s.lines === 2,
  triple: (s) => s.type === 'clear' && s.lines === 3,
  'clean-sweep': (s) => s.type === 'clear' && s.lines >= 4,
  'fresh-start': (s) => s.type === 'clear' && s.boardEmptyAfterClear,
  'lines-100': (s) => s.type === 'clear' && s.totalLines >= 100,
  'lines-500': (s) => s.type === 'clear' && s.totalLines >= 500,
  'streak-x2': (s) => s.type === 'combo' && s.multiplier >= 2,
  'streak-x3': (s) => s.type === 'combo' && s.multiplier >= 3,
  'streak-x5': (s) => s.type === 'combo' && s.multiplier >= 5,
  'level-5': (s) => s.type === 'levelComplete' && s.level >= 5,
  'level-10': (s) => s.type === 'levelComplete' && s.level >= 10,
  'level-25': (s) => s.type === 'levelComplete' && s.level >= 25,
  'level-50': (s) => s.type === 'levelComplete' && s.level >= 50,
  'first-daily': (s) => s.type === 'daily',
  'daily-streak-7': (s) => s.type === 'daily' && s.currentStreak >= 7,
  'daily-streak-30': (s) => s.type === 'daily' && s.currentStreak >= 30,
  'daily-best-500': (s) => s.type === 'daily' && s.bestScore > 500,
};

/**
 * The ids newly earned by `signal`, given the already-unlocked ids. Pure and
 * deterministic: returns them in ACHIEVEMENTS order and never re-reports an
 * already-unlocked id. One signal can unlock several at once (e.g. a 4-line
 * clear that also crosses the 100-line milestone).
 */
export function evaluate(signal: AchievementSignal, alreadyUnlocked: Iterable<string>): string[] {
  const have = new Set(alreadyUnlocked);
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    if (PREDICATES[a.id]?.(signal)) out.push(a.id);
  }
  return out;
}

/** Look up an achievement by id (for the UI to render name/family/condition). */
export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
