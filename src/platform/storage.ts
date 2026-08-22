/**
 * High-score persistence (localStorage). Never throws: degrades gracefully when
 * storage is unavailable (private mode / disabled / quota) or the stored value is
 * corrupt. Only the high score is persisted (per the design's persistence scope).
 */

import type { GameState, GameMode, GameStatus, GoalType, Piece } from '../core/types';
import { BOARD_SIZE } from '../core/types';

const HIGH_SCORE_KEY = 'wbp.v1.highscore';
const LEVEL_KEY = 'wbp.v1.level';
const SETTINGS_KEY = 'wbp.v1.settings';
const STATS_KEY = 'wbp.v1.stats';
const SEEN_INTRO_KEY = 'wbp.v1.seenIntro';
const LEVEL_RESULTS_KEY = 'wbp.v1.levelResults';
const SAVE_KEY = 'wbp.v1.save';

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

/**
 * Per-level result. Levels are deterministic from their number, so we persist
 * only outcomes — never layouts. `completed` is monotonic (never regresses);
 * `bestScore` keeps the highest score seen.
 */
export interface LevelResult {
  completed: boolean;
  bestScore: number;
}

/**
 * Load all persisted per-level results, keyed by level number. Skips corrupt
 * entries and invalid level keys. Corrupt/missing/unavailable → empty map.
 */
export function loadLevelResults(): Record<number, LevelResult> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(LEVEL_RESULTS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<number, LevelResult> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const level = Number(key);
      if (!Number.isInteger(level) || level < 1) continue;
      if (typeof value !== 'object' || value === null) continue;
      const v = value as Record<string, unknown>;
      const rawScore = v['bestScore'];
      const bestScore = typeof rawScore === 'number' && Number.isInteger(rawScore) && rawScore >= 0 ? rawScore : 0;
      out[level] = { completed: v['completed'] === true, bestScore };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Merge a level result: `bestScore = max(existing, score)` and
 * `completed = existing.completed || completed` (monotonic — never downgrades).
 * Silent no-op on any failure or invalid level.
 */
export function saveLevelResult(level: number, result: { score: number; completed: boolean }): void {
  if (!Number.isInteger(level) || level < 1) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    const all = loadLevelResults();
    const prev = all[level] ?? { completed: false, bestScore: 0 };
    const score = Number.isInteger(result.score) && result.score >= 0 ? result.score : 0;
    all[level] = {
      completed: prev.completed || result.completed === true,
      bestScore: Math.max(prev.bestScore, score),
    };
    storage.setItem(LEVEL_RESULTS_KEY, JSON.stringify(all));
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}

/** A single level's result, defaulting an unknown level to not-completed / 0. Pure. */
export function levelResult(results: Record<number, LevelResult>, level: number): LevelResult {
  return results[level] ?? { completed: false, bestScore: 0 };
}

/**
 * The lowest unlocked, not-yet-completed level — the "current / next to play"
 * node the Level Map highlights. Unlocked = `level <= highestReached`; level 1
 * is always unlocked. If every unlocked level is completed, returns the next
 * (newly unlocked) level. Pure.
 */
export function nextLevelToPlay(results: Record<number, LevelResult>, highestReached: number): number {
  const frontier = Math.max(1, highestReached);
  for (let level = 1; level <= frontier; level++) {
    if (!results[level]?.completed) return level;
  }
  return frontier + 1;
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

// ---- In-progress game save/restore ----

/** Schema version of the save blob; a mismatch on load discards the save.
 *  v2 adds GameState.streakGraceUsed — a v1 blob lacks it and loads as null. */
const SAVE_SCHEMA = 2;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isCounts = (x: unknown): boolean =>
  typeof x === 'object' &&
  x !== null &&
  !Array.isArray(x) &&
  Object.values(x as Record<string, unknown>).every(
    (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0,
  );
/** A length-CELL_COUNT array of 0..255 (a serialized Uint8Array board/gems channel). */
const isByteArray = (x: unknown): x is number[] =>
  Array.isArray(x) &&
  x.length === CELL_COUNT &&
  x.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255);

const SAVE_STATUSES = new Set(['home', 'playing', 'gameover', 'levelcomplete', 'levelfailed']);
const SAVE_MODES = new Set(['endless', 'levels']);
const SAVE_GOALS = new Set(['gems', 'score']);

/** Validate a serialized tray piece (shape + material + placement + optional gems). */
function isValidPiece(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  if (typeof p['id'] !== 'string' || !isNum(p['material']) || typeof p['placed'] !== 'boolean') return false;
  const shape = p['shape'];
  if (typeof shape !== 'object' || shape === null) return false;
  const sh = shape as Record<string, unknown>;
  if (typeof sh['id'] !== 'string' || !isNum(sh['size']) || !isNum(sh['width']) || !isNum(sh['height'])) {
    return false;
  }
  const cells = sh['cells'];
  if (
    !Array.isArray(cells) ||
    !cells.every((c) => {
      if (typeof c !== 'object' || c === null) return false;
      const co = c as Record<string, unknown>;
      return isNum(co['row']) && isNum(co['col']);
    })
  ) {
    return false;
  }
  if (p['gems'] !== undefined && !isCounts(p['gems'])) return false;
  return true;
}

/** Per-mode save slots — an Endless game and a Levels game resume independently. */
const SAVE_ENDLESS_KEY = 'wbp.v1.save.endless';
const SAVE_LEVELS_KEY = 'wbp.v1.save.levels';

function slotKey(mode: GameMode): string {
  return mode === 'endless' ? SAVE_ENDLESS_KEY : SAVE_LEVELS_KEY;
}

/** Serialize + persist a state under `key`. Uint8Arrays become plain arrays. */
function writeSave(key: string, state: GameState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const blob = {
      v: SAVE_SCHEMA,
      state: { ...state, board: Array.from(state.board), gems: Array.from(state.gems) },
    };
    storage.setItem(key, JSON.stringify(blob));
  } catch {
    // Quota exceeded / disabled — silently ignore.
  }
}

/**
 * Read + validate the save under `key`, or null if missing, the schema version
 * mismatches, or any required field is missing/invalid. Never throws and never
 * half-restores. `rngState` is restored verbatim (no re-seed).
 */
function readSave(key: string): GameState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const blob = parsed as Record<string, unknown>;
    if (blob['v'] !== SAVE_SCHEMA) return null;
    if (typeof blob['state'] !== 'object' || blob['state'] === null) return null;
    const o = blob['state'] as Record<string, unknown>;

    if (!isByteArray(o['board']) || !isByteArray(o['gems'])) return null;
    if (!Array.isArray(o['tray']) || !o['tray'].every(isValidPiece)) return null;
    if (
      !isNum(o['score']) ||
      !isNum(o['highScore']) ||
      !isNum(o['rngState']) ||
      !isNum(o['pieceSeq']) ||
      !isNum(o['streak']) ||
      !isNum(o['level']) ||
      !isNum(o['targetScore'])
    ) {
      return null;
    }
    if (typeof o['streakGraceUsed'] !== 'boolean') return null;
    if (typeof o['status'] !== 'string' || !SAVE_STATUSES.has(o['status'])) return null;
    if (typeof o['mode'] !== 'string' || !SAVE_MODES.has(o['mode'])) return null;
    if (typeof o['goalType'] !== 'string' || !SAVE_GOALS.has(o['goalType'])) return null;
    if (!isCounts(o['quotas']) || !isCounts(o['gemsCleared']) || !isCounts(o['gemSupplyRemaining'])) {
      return null;
    }

    return {
      board: Uint8Array.from(o['board']),
      gems: Uint8Array.from(o['gems']),
      tray: o['tray'] as Piece[],
      score: o['score'],
      highScore: o['highScore'],
      status: o['status'] as GameStatus,
      rngState: o['rngState'],
      pieceSeq: o['pieceSeq'],
      streak: o['streak'],
      streakGraceUsed: o['streakGraceUsed'],
      mode: o['mode'] as GameMode,
      level: o['level'],
      goalType: o['goalType'] as GoalType,
      targetScore: o['targetScore'],
      quotas: o['quotas'] as Record<number, number>,
      gemsCleared: o['gemsCleared'] as Record<number, number>,
      gemSupplyRemaining: o['gemSupplyRemaining'] as Record<number, number>,
    };
  } catch {
    return null;
  }
}

function removeKey(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/** A resumable save is a valid blob whose game is still in progress. */
function resumable(state: GameState | null): GameState | null {
  return state && state.status === 'playing' ? state : null;
}

/**
 * Persist the full in-progress game so it can resume after reload/backgrounding.
 * Routed to the per-mode slot by `state.mode`, so an Endless and a Levels game
 * survive independently. Uint8Array channels round-trip as plain arrays. Also
 * cleans up the pre-keyed single slot. Silent no-op on failure.
 */
export function saveGame(state: GameState): void {
  writeSave(slotKey(state.mode), state);
  removeKey(SAVE_KEY); // migrate away from the legacy single slot
}

/** The resumable Endless game, or null. */
export function loadEndlessSave(): GameState | null {
  return resumable(readSave(SAVE_ENDLESS_KEY));
}

/** The resumable Levels game, or null. */
export function loadLevelsSave(): GameState | null {
  return resumable(readSave(SAVE_LEVELS_KEY));
}

/** Whether a resumable Endless game exists. */
export function hasEndlessSave(): boolean {
  return loadEndlessSave() !== null;
}

/** Whether a resumable Levels game exists. */
export function hasLevelsSave(): boolean {
  return loadLevelsSave() !== null;
}

/** Remove the Endless save. Silent no-op on failure. */
export function clearEndlessSave(): void {
  removeKey(SAVE_ENDLESS_KEY);
}

/** Remove the Levels save. Silent no-op on failure. */
export function clearLevelsSave(): void {
  removeKey(SAVE_LEVELS_KEY);
}
