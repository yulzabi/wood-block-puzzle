/**
 * High-score persistence (localStorage). Never throws: degrades gracefully when
 * storage is unavailable (private mode / disabled / quota) or the stored value is
 * corrupt. Only the high score is persisted (per the design's persistence scope).
 */

const HIGH_SCORE_KEY = 'wbp.v1.highscore';
const LEVEL_KEY = 'wbp.v1.level';
const SETTINGS_KEY = 'wbp.v1.settings';
const STATS_KEY = 'wbp.v1.stats';
const SEEN_INTRO_KEY = 'wbp.v1.seenIntro';

/** Return the localStorage instance, or null if it is unavailable in this context. */
function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Accessing localStorage can itself throw in some privacy modes.
    return null;
  }
}

/** Load the persisted high score. Returns 0 if missing, corrupt, or unavailable. */
export function loadHighScore(): number {
  const storage = getStorage();
  if (!storage) return 0;
  try {
    const raw = storage.getItem(HIGH_SCORE_KEY);
    if (raw === null) return 0;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

/** Persist the high score. Silent no-op on any failure or invalid input. */
export function saveHighScore(score: number): void {
  if (!Number.isInteger(score) || score < 0) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}

/**
 * Load the player's current Levels-mode progress (the level to resume at).
 * Returns 1 if missing, corrupt (non-integer / < 1), or storage is unavailable.
 */
export function loadLevelProgress(): number {
  const storage = getStorage();
  if (!storage) return 1;
  try {
    const raw = storage.getItem(LEVEL_KEY);
    if (raw === null) return 1;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) return 1;
    return parsed;
  } catch {
    return 1;
  }
}

/** Persist Levels-mode progress. Silent no-op on any failure or invalid input (< 1). */
export function saveLevelProgress(level: number): void {
  if (!Number.isInteger(level) || level < 1) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LEVEL_KEY, String(level));
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}

/** User settings (audio + haptics + placement-hints + colorblind toggles). */
export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Placement hints (the in-game "Hint" button). Defaults OFF. */
  hints: boolean;
  /** Non-hue distinguisher (a letter) on gem markers. Defaults OFF. */
  colorblindGems: boolean;
}

/** Sound/haptics default ON; hints + colorblind gems default OFF (opt-in). */
const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, hints: false, colorblindGems: false };

/**
 * Load settings. Each field falls back to its default independently, so an
 * older stored blob missing a newer key (e.g. `hints`) loads cleanly with that
 * key defaulted rather than wiping the others. Corrupt/missing/unavailable →
 * all defaults.
 */
export function loadSettings(): Settings {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const obj = parsed as Record<string, unknown>;
    return {
      sound: typeof obj['sound'] === 'boolean' ? obj['sound'] : DEFAULT_SETTINGS.sound,
      haptics: typeof obj['haptics'] === 'boolean' ? obj['haptics'] : DEFAULT_SETTINGS.haptics,
      hints: typeof obj['hints'] === 'boolean' ? obj['hints'] : DEFAULT_SETTINGS.hints,
      colorblindGems:
        typeof obj['colorblindGems'] === 'boolean' ? obj['colorblindGems'] : DEFAULT_SETTINGS.colorblindGems,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings. Silent no-op on any failure. */
export function saveSettings(settings: Settings): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        sound: !!settings.sound,
        haptics: !!settings.haptics,
        hints: !!settings.hints,
        colorblindGems: !!settings.colorblindGems,
      }),
    );
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}

/** Aggregate local play stats (offline, no backend). */
export interface Stats {
  gamesPlayed: number;
  totalLines: number;
  bestStreak: number;
  bestScore: number;
}

const DEFAULT_STATS: Stats = { gamesPlayed: 0, totalLines: 0, bestStreak: 0, bestScore: 0 };

function toCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Load stats. All fields default to 0; corrupt/missing/unavailable → defaults. */
export function loadStats(): Stats {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_STATS };
  try {
    const raw = storage.getItem(STATS_KEY);
    if (raw === null) return { ...DEFAULT_STATS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_STATS };
    const obj = parsed as Record<string, unknown>;
    return {
      gamesPlayed: toCount(obj['gamesPlayed'], 0),
      totalLines: toCount(obj['totalLines'], 0),
      bestStreak: toCount(obj['bestStreak'], 0),
      bestScore: toCount(obj['bestScore'], 0),
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

/** Persist stats. Silent no-op on any failure. */
export function saveStats(stats: Stats): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      STATS_KEY,
      JSON.stringify({
        gamesPlayed: toCount(stats.gamesPlayed, 0),
        totalLines: toCount(stats.totalLines, 0),
        bestStreak: toCount(stats.bestStreak, 0),
        bestScore: toCount(stats.bestScore, 0),
      }),
    );
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}

/** Whether the first-run "How to play" intro has been shown. Defaults to false. */
export function loadSeenIntro(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(SEEN_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the seen-intro flag. Silent no-op on any failure. */
export function saveSeenIntro(seen = true): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SEEN_INTRO_KEY, seen ? '1' : '0');
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}
