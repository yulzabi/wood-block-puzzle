import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  loadHighScore,
  saveHighScore,
  loadLevelProgress,
  saveLevelProgress,
  loadSettings,
  saveSettings,
  loadStats,
  saveStats,
  loadSeenIntro,
  saveSeenIntro,
  loadLevelResults,
  saveLevelResult,
  levelResult,
  nextLevelToPlay,
  saveGame,
  scheduleSaveGame,
  flushSaveGame,
  scheduleSaveStats,
  flushSaveStats,
  loadEndlessSave,
  loadLevelsSave,
  hasEndlessSave,
  hasLevelsSave,
  clearEndlessSave,
  clearLevelsSave,
  loadDaily,
  saveDaily,
  loadDailySave,
  hasDailySave,
  clearDailySave,
} from './storage';
import { DEFAULT_DAILY_STATE, type DailyState } from '../core/daily';
import type { GameState, Piece } from '../core/types';
import { BOARD_SIZE } from '../core/types';
import { SHAPES } from '../core/shapes';

/** A rich in-progress endless state: non-empty board, no gems. */
function richEndlessState(): GameState {
  const board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  board[0] = 1;
  board[5] = 4;
  const tray: Piece[] = [
    { id: 'e-1', shape: SHAPES[0]!, material: 2, placed: false },
    { id: 'e-2', shape: SHAPES[3]!, material: 6, placed: true },
  ];
  return {
    board,
    tray,
    score: 88,
    highScore: 500,
    status: 'playing',
    rngState: 42424242,
    pieceSeq: 5,
    streak: 1,
    streakGraceUsed: false,
    mode: 'endless',
    level: 0,
    goalType: 'score',
    targetScore: 0,
    gems: new Uint8Array(BOARD_SIZE * BOARD_SIZE),
    quotas: {},
    gemsCleared: {},
    gemSupplyRemaining: {},
  };
}

/** A rich in-progress gem-level state: non-empty typed arrays + gem-bearing pieces. */
function richState(): GameState {
  const board = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  board[0] = 3;
  board[9] = 2;
  board[63] = 1;
  const gems = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  gems[9] = 2;
  gems[10] = 2;
  const tray: Piece[] = [
    { id: 'p-7', shape: SHAPES[0]!, material: 4, placed: false, gems: { 0: 2 } },
    { id: 'p-8', shape: SHAPES[1]!, material: 5, placed: true },
    { id: 'p-9', shape: SHAPES[2]!, material: 1, placed: false },
  ];
  return {
    board,
    tray,
    score: 320,
    highScore: 500,
    status: 'playing',
    rngState: 123456789,
    pieceSeq: 10,
    streak: 3,
    streakGraceUsed: true,
    mode: 'levels',
    level: 4,
    goalType: 'gems',
    targetScore: 0,
    gems,
    quotas: { 2: 20 },
    gemsCleared: { 2: 6 },
    gemSupplyRemaining: { 2: 16 },
  };
}

const KEY = 'wbp.v1.highscore';
const LEVEL_KEY = 'wbp.v1.level';

function makeMockStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: vi.fn((k: string) => (map.has(k) ? (map.get(k) as string) : null)),
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      map.delete(k);
    }),
    clear: vi.fn(() => {
      map.clear();
    }),
    key: vi.fn(() => null),
    get length() {
      return map.size;
    },
  };
  return { storage: storage as unknown as Storage, map, raw: storage };
}

describe('storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a saved high score', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveHighScore(1234);
    expect(loadHighScore()).toBe(1234);
  });

  it('returns 0 when the key is missing', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadHighScore()).toBe(0);
  });

  it('returns 0 on a corrupt (non-numeric) value', () => {
    const { storage, map } = makeMockStorage();
    map.set(KEY, 'not-a-number');
    vi.stubGlobal('localStorage', storage);
    expect(loadHighScore()).toBe(0);
  });

  it('returns 0 on negative or non-integer values', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(KEY, '-5');
    expect(loadHighScore()).toBe(0);
    map.set(KEY, '3.5');
    expect(loadHighScore()).toBe(0);
  });

  it('returns 0 without throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadHighScore()).not.toThrow();
    expect(loadHighScore()).toBe(0);
  });

  it('save is a silent no-op when setItem throws (quota exceeded)', () => {
    const { storage, raw } = makeMockStorage();
    raw.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.stubGlobal('localStorage', storage);
    expect(() => saveHighScore(50)).not.toThrow();
  });

  it('save is a no-op when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveHighScore(50)).not.toThrow();
  });

  it('does not persist invalid scores', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveHighScore(-1);
    saveHighScore(2.7);
    expect(loadHighScore()).toBe(0);
  });
});

describe('level progress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a saved level', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveLevelProgress(7);
    expect(loadLevelProgress()).toBe(7);
  });

  it('defaults to 1 when the key is missing', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadLevelProgress()).toBe(1);
  });

  it('defaults to 1 on corrupt / out-of-range values', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(LEVEL_KEY, 'nope');
    expect(loadLevelProgress()).toBe(1);
    map.set(LEVEL_KEY, '0');
    expect(loadLevelProgress()).toBe(1);
    map.set(LEVEL_KEY, '-3');
    expect(loadLevelProgress()).toBe(1);
    map.set(LEVEL_KEY, '2.5');
    expect(loadLevelProgress()).toBe(1);
  });

  it('defaults to 1 without throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadLevelProgress()).not.toThrow();
    expect(loadLevelProgress()).toBe(1);
  });

  it('does not persist invalid levels', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveLevelProgress(0);
    saveLevelProgress(-2);
    saveLevelProgress(1.5);
    expect(loadLevelProgress()).toBe(1);
  });

  it('save is a silent no-op when setItem throws', () => {
    const { storage, raw } = makeMockStorage();
    raw.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.stubGlobal('localStorage', storage);
    expect(() => saveLevelProgress(4)).not.toThrow();
  });
});

describe('settings', () => {
  const SETTINGS_KEY = 'wbp.v1.settings';
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips settings', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveSettings({ sound: false, haptics: true, hints: true, colorblindGems: true });
    expect(loadSettings()).toEqual({ sound: false, haptics: true, hints: true, colorblindGems: true });
  });

  it('defaults sound/haptics ON and hints/colorblindGems OFF when missing', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadSettings()).toEqual({ sound: true, haptics: true, hints: false, colorblindGems: false });
  });

  it('defaults hints and colorblindGems to false explicitly', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    // A blob that sets them false round-trips false (not silently flipped on).
    map.set(SETTINGS_KEY, JSON.stringify({ sound: true, haptics: true, hints: false, colorblindGems: false }));
    expect(loadSettings().hints).toBe(false);
    expect(loadSettings().colorblindGems).toBe(false);
  });

  it('loads a legacy blob (no colorblindGems key) with it defaulted false, not clobbering others', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    // Older builds stored no `colorblindGems` (or `hints`) key. Newer keys must
    // default false while the stored fields are preserved exactly.
    map.set(SETTINGS_KEY, JSON.stringify({ sound: false, haptics: false }));
    expect(loadSettings()).toEqual({ sound: false, haptics: false, hints: false, colorblindGems: false });
    // A blob that has hints but not colorblindGems keeps hints, defaults the new key.
    map.set(SETTINGS_KEY, JSON.stringify({ sound: true, haptics: false, hints: true }));
    expect(loadSettings()).toEqual({ sound: true, haptics: false, hints: true, colorblindGems: false });
  });

  it('falls back to defaults on corrupt JSON / partial values', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(SETTINGS_KEY, '{not json');
    expect(loadSettings()).toEqual({ sound: true, haptics: true, hints: false, colorblindGems: false });
    map.set(SETTINGS_KEY, JSON.stringify({ sound: false }));
    expect(loadSettings()).toEqual({ sound: false, haptics: true, hints: false, colorblindGems: false });
  });

  it('defaults without throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toEqual({ sound: true, haptics: true, hints: false, colorblindGems: false });
    expect(() =>
      saveSettings({ sound: false, haptics: false, hints: true, colorblindGems: true }),
    ).not.toThrow();
  });
});

describe('stats', () => {
  const STATS_KEY = 'wbp.v1.stats';
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips stats', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveStats({ gamesPlayed: 3, totalLines: 42, bestStreak: 5, bestScore: 999 });
    expect(loadStats()).toEqual({ gamesPlayed: 3, totalLines: 42, bestStreak: 5, bestScore: 999 });
  });

  it('defaults all fields to 0 when missing', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadStats()).toEqual({ gamesPlayed: 0, totalLines: 0, bestStreak: 0, bestScore: 0 });
  });

  it('clamps corrupt / negative / non-integer fields to 0', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(STATS_KEY, JSON.stringify({ gamesPlayed: -1, totalLines: 2.5, bestStreak: 'x', bestScore: 10 }));
    expect(loadStats()).toEqual({ gamesPlayed: 0, totalLines: 0, bestStreak: 0, bestScore: 10 });
    map.set(STATS_KEY, 'garbage');
    expect(loadStats()).toEqual({ gamesPlayed: 0, totalLines: 0, bestStreak: 0, bestScore: 0 });
  });

  it('defaults without throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadStats()).not.toThrow();
    expect(loadStats()).toEqual({ gamesPlayed: 0, totalLines: 0, bestStreak: 0, bestScore: 0 });
    expect(() => saveStats({ gamesPlayed: 1, totalLines: 1, bestStreak: 1, bestScore: 1 })).not.toThrow();
  });
});

describe('seen-intro flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the seen-intro flag', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    expect(loadSeenIntro()).toBe(false);
    saveSeenIntro();
    expect(loadSeenIntro()).toBe(true);
  });

  it('defaults to false when missing or unavailable', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadSeenIntro()).toBe(false);
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadSeenIntro()).not.toThrow();
    expect(loadSeenIntro()).toBe(false);
  });
});

describe('level results', () => {
  const RESULTS_KEY = 'wbp.v1.levelResults';
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty map when the key is missing', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadLevelResults()).toEqual({});
  });

  it('returns an empty map on a corrupt blob', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(RESULTS_KEY, '{not json');
    expect(loadLevelResults()).toEqual({});
    map.set(RESULTS_KEY, '"a string"');
    expect(loadLevelResults()).toEqual({});
  });

  it('returns an empty map (and save is a no-op) when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadLevelResults()).not.toThrow();
    expect(loadLevelResults()).toEqual({});
    expect(() => saveLevelResult(1, { score: 10, completed: true })).not.toThrow();
  });

  it('drops corrupt per-level entries and invalid level keys', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(
      RESULTS_KEY,
      JSON.stringify({
        1: { completed: true, bestScore: 10 },
        2: { completed: 'yes', bestScore: -5 }, // completed !== true -> false; bestScore invalid -> 0
        0: { completed: true, bestScore: 5 }, // level < 1 -> skipped
        x: { completed: true, bestScore: 5 }, // non-numeric key -> skipped
      }),
    );
    const r = loadLevelResults();
    expect(r[1]).toEqual({ completed: true, bestScore: 10 });
    expect(r[2]).toEqual({ completed: false, bestScore: 0 });
    expect(Object.keys(r)).toEqual(['1', '2']);
  });

  it('merges bestScore to the higher value and never downgrades', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveLevelResult(2, { score: 120, completed: true });
    saveLevelResult(2, { score: 80, completed: true }); // lower — must not downgrade
    expect(loadLevelResults()[2]).toEqual({ completed: true, bestScore: 120 });
    saveLevelResult(2, { score: 200, completed: false }); // higher score; completed stays true
    expect(loadLevelResults()[2]).toEqual({ completed: true, bestScore: 200 });
  });

  it('never regresses completed to false once true', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveLevelResult(5, { score: 50, completed: true });
    saveLevelResult(5, { score: 60, completed: false });
    expect(loadLevelResults()[5]?.completed).toBe(true);
  });

  it('stores the first result for a fresh level', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveLevelResult(4, { score: 30, completed: false });
    expect(loadLevelResults()[4]).toEqual({ completed: false, bestScore: 30 });
  });

  it('levelResult reads an unknown level as not-completed with score 0', () => {
    expect(levelResult({}, 3)).toEqual({ completed: false, bestScore: 0 });
    expect(levelResult({ 3: { completed: true, bestScore: 42 } }, 3)).toEqual({
      completed: true,
      bestScore: 42,
    });
  });
});

describe('game save/restore (keyed by mode)', () => {
  const LEVELS_KEY = 'wbp.v1.save.levels';
  const LEGACY_KEY = 'wbp.v1.save';
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a levels save (typed arrays + per-piece gems) into the levels slot', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    const state = richState(); // mode: 'levels'
    saveGame(state);

    const loaded = loadLevelsSave();
    expect(loaded).toEqual(state);
    expect(loaded!.board).toBeInstanceOf(Uint8Array);
    expect(loaded!.gems).toBeInstanceOf(Uint8Array);
    expect(loaded!.tray[0]?.gems).toEqual({ 0: 2 });
    expect(loaded!.tray[1]?.gems).toBeUndefined();
    // The endless slot is untouched.
    expect(loadEndlessSave()).toBeNull();
  });

  it('round-trips an endless save into the endless slot', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    const state = richEndlessState();
    saveGame(state);

    expect(loadEndlessSave()).toEqual(state);
    expect(loadLevelsSave()).toBeNull();
  });

  it('endless and levels saves are independent — saving/clearing one never affects the other', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveGame(richEndlessState());
    saveGame(richState());
    expect(hasEndlessSave()).toBe(true);
    expect(hasLevelsSave()).toBe(true);

    // Clearing levels leaves endless intact.
    clearLevelsSave();
    expect(hasLevelsSave()).toBe(false);
    expect(hasEndlessSave()).toBe(true);

    // ...and clearing endless leaves a fresh levels save intact.
    saveGame(richState());
    clearEndlessSave();
    expect(hasEndlessSave()).toBe(false);
    expect(hasLevelsSave()).toBe(true);
  });

  it('missing / corrupt / schema-mismatch / partial / wrong-length -> null (per slot)', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    expect(loadLevelsSave()).toBeNull(); // missing
    map.set(LEVELS_KEY, '{not json');
    expect(() => loadLevelsSave()).not.toThrow();
    expect(loadLevelsSave()).toBeNull();
    map.set(LEVELS_KEY, JSON.stringify({ v: 999, state: {} }));
    expect(loadLevelsSave()).toBeNull();
    map.set(LEVELS_KEY, JSON.stringify({ v: 1, state: { score: 10 } }));
    expect(loadLevelsSave()).toBeNull();
    const tampered = JSON.parse(
      JSON.stringify({
        v: 1,
        state: { ...richState(), board: Array.from(richState().board), gems: Array.from(richState().gems) },
      }),
    );
    tampered.state.board = [1, 2, 3];
    map.set(LEVELS_KEY, JSON.stringify(tampered));
    expect(loadLevelsSave()).toBeNull();
  });

  it('discards an old v:1 save (pre-streakGraceUsed schema) as null', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    // An otherwise-valid blob at the previous schema (no streakGraceUsed field):
    // the version check alone must reject it rather than half-restoring.
    const legacy = JSON.parse(
      JSON.stringify({
        v: 1,
        state: { ...richState(), board: Array.from(richState().board), gems: Array.from(richState().gems) },
      }),
    );
    delete legacy.state.streakGraceUsed;
    map.set(LEVELS_KEY, JSON.stringify(legacy));
    expect(loadLevelsSave()).toBeNull();
  });

  it('has*Save is true only for a valid PLAYING blob', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    expect(hasLevelsSave()).toBe(false);
    saveGame(richState()); // status 'playing'
    expect(hasLevelsSave()).toBe(true);
    // A finished game in the same slot must not count as resumable.
    saveGame({ ...richState(), status: 'levelcomplete' });
    expect(hasLevelsSave()).toBe(false);
  });

  it('clear removes only its own slot', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveGame(richEndlessState());
    saveGame(richState());
    clearEndlessSave();
    expect(hasEndlessSave()).toBe(false);
    expect(hasLevelsSave()).toBe(true);
  });

  it('ignores the legacy single-slot key (treated as absent) and cleans it up on save', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(LEGACY_KEY, JSON.stringify({ v: 1, state: {} }));
    expect(loadLevelsSave()).toBeNull();
    expect(loadEndlessSave()).toBeNull();
    saveGame(richState());
    expect(map.has(LEGACY_KEY)).toBe(false); // cleaned up on the next save
  });

  it('save/clear are no-ops without throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveGame(richState())).not.toThrow();
    expect(() => clearLevelsSave()).not.toThrow();
    expect(loadLevelsSave()).toBeNull();
  });
});

describe('deferred save (idle-coalesced)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scheduleSaveGame defers the write; flushSaveGame performs it', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    scheduleSaveGame(richEndlessState());
    expect(raw.setItem).not.toHaveBeenCalled(); // nothing written inside the caller's frame
    flushSaveGame();
    expect(raw.setItem).toHaveBeenCalled();
    expect(loadEndlessSave()).not.toBeNull();
  });

  it('coalesces rapid schedules into a single write of the latest state', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    scheduleSaveGame(richEndlessState());
    scheduleSaveGame({ ...richEndlessState(), score: 999 });
    expect(raw.setItem).not.toHaveBeenCalled();
    flushSaveGame();
    expect(raw.setItem).toHaveBeenCalledTimes(1);
    expect(loadEndlessSave()?.score).toBe(999);
  });

  it('scheduleSaveStats defers the write; flushSaveStats performs it', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    scheduleSaveStats({ gamesPlayed: 3, totalLines: 12, bestStreak: 4, bestScore: 500 });
    expect(raw.setItem).not.toHaveBeenCalled(); // nothing written inside the placement frame
    flushSaveStats();
    expect(raw.setItem).toHaveBeenCalledTimes(1);
    expect(loadStats().bestScore).toBe(500);
  });

  it('coalesces rapid stats schedules into one write of the latest stats', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    scheduleSaveStats({ gamesPlayed: 1, totalLines: 1, bestStreak: 1, bestScore: 10 });
    scheduleSaveStats({ gamesPlayed: 1, totalLines: 2, bestStreak: 1, bestScore: 20 });
    flushSaveStats();
    expect(raw.setItem).toHaveBeenCalledTimes(1);
    expect(loadStats().bestScore).toBe(20);
    expect(loadStats().totalLines).toBe(2);
  });

  it('flushSaveStats with nothing pending writes nothing', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    flushSaveStats();
    expect(raw.setItem).not.toHaveBeenCalled();
  });

  it('a terminal clear cancels a pending deferred save (no resurrection)', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    scheduleSaveGame(richEndlessState());
    clearEndlessSave(); // terminal transition — must drop the queued write
    flushSaveGame(); // nothing pending now → no write
    expect(loadEndlessSave()).toBeNull();
  });

  it('clear*Save writes synchronously (immediate removeItem)', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveGame(richEndlessState());
    raw.removeItem.mockClear();
    clearEndlessSave();
    expect(raw.removeItem).toHaveBeenCalled();
    expect(loadEndlessSave()).toBeNull();
  });
});

describe('nextLevelToPlay', () => {
  it('returns level 1 on a fresh save', () => {
    expect(nextLevelToPlay({}, 1)).toBe(1);
  });

  it('always treats level 1 as unlocked even if highestReached is out of range', () => {
    expect(nextLevelToPlay({}, 0)).toBe(1);
  });

  it('returns the lowest incomplete unlocked level (fills a gap of incomplete levels)', () => {
    const results = {
      1: { completed: true, bestScore: 5 },
      3: { completed: true, bestScore: 9 }, // 2 is unlocked but not completed
    };
    expect(nextLevelToPlay(results, 3)).toBe(2);
  });

  it('returns the next (newly unlocked) level when all unlocked levels are completed', () => {
    const results = {
      1: { completed: true, bestScore: 1 },
      2: { completed: true, bestScore: 2 },
      3: { completed: true, bestScore: 3 },
    };
    expect(nextLevelToPlay(results, 3)).toBe(4);
  });
});

describe('daily save slot (in-progress daily run)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes the daily run to its own slot — Endless is not touched (no cross-contamination)', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    // Save a normal Endless game to the Endless slot.
    saveGame(richEndlessState());
    // Now save the SAME-shaped state as the daily (daily=true) — a distinct slot.
    saveGame(richEndlessState(), true);
    expect(loadDailySave()).not.toBeNull();
    expect(loadEndlessSave()).not.toBeNull(); // the Endless save still stands
  });

  it('a fresh Endless save does not create a daily save (and vice versa)', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveGame(richEndlessState()); // endless only
    expect(hasDailySave()).toBe(false);
    clearEndlessSave();
    saveGame(richEndlessState(), true); // daily only
    expect(hasDailySave()).toBe(true);
    expect(loadEndlessSave()).toBeNull();
  });

  it('clearDailySave removes only the daily slot', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveGame(richEndlessState()); // endless
    saveGame(richEndlessState(), true); // daily
    clearDailySave();
    expect(hasDailySave()).toBe(false);
    expect(loadEndlessSave()).not.toBeNull(); // endless survives
  });

  it('a deferred daily schedule flushes to the daily slot, not Endless', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    scheduleSaveGame(richEndlessState(), true);
    flushSaveGame();
    expect(hasDailySave()).toBe(true);
    expect(loadEndlessSave()).toBeNull();
  });
});

describe('daily challenge persistence', () => {
  const DAILY_KEY = 'wbp.v1.daily';
  const richDaily: DailyState = {
    lastPlayedDate: '2026-08-22',
    lastCompletedDate: '2026-08-22',
    lastResult: { score: 750 },
    currentStreak: 4,
    longestStreak: 9,
    bestScore: 1200,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a daily record', () => {
    const { storage } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    saveDaily(richDaily);
    expect(loadDaily()).toEqual(richDaily);
  });

  it('returns fresh defaults when the key is missing', () => {
    vi.stubGlobal('localStorage', makeMockStorage().storage);
    expect(loadDaily()).toEqual(DEFAULT_DAILY_STATE);
  });

  it('returns defaults on corrupt JSON', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(DAILY_KEY, 'not json {');
    expect(loadDaily()).toEqual(DEFAULT_DAILY_STATE);
  });

  it('coerces bad fields per-field (bad dates → null, bad numbers → 0, bad result → null)', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(
      DAILY_KEY,
      JSON.stringify({
        lastPlayedDate: 'yesterday', // not YYYY-MM-DD
        lastCompletedDate: 42, // not a string
        lastResult: { score: 'lots' }, // not numeric
        currentStreak: -3, // negative
        longestStreak: 2.5, // non-integer
        bestScore: 500,
      }),
    );
    expect(loadDaily()).toEqual({
      lastPlayedDate: null,
      lastCompletedDate: null,
      lastResult: null,
      currentStreak: 0,
      longestStreak: 0,
      bestScore: 500,
    });
  });

  it('backward-compat: a partial blob loads with the missing fields defaulted', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(DAILY_KEY, JSON.stringify({ currentStreak: 3, bestScore: 200 }));
    expect(loadDaily()).toEqual({
      lastPlayedDate: null,
      lastCompletedDate: null,
      lastResult: null,
      currentStreak: 3,
      longestStreak: 0,
      bestScore: 200,
    });
  });

  it('normalizes a fractional/negative stored result score on load', () => {
    const { storage, map } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    map.set(DAILY_KEY, JSON.stringify({ ...richDaily, lastResult: { score: 12.9 } }));
    expect(loadDaily().lastResult).toEqual({ score: 12 });
  });

  it('defaults without throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadDaily()).not.toThrow();
    expect(loadDaily()).toEqual(DEFAULT_DAILY_STATE);
    expect(() => saveDaily(richDaily)).not.toThrow();
  });

  it('save is a silent no-op when setItem throws (quota exceeded)', () => {
    const { storage, raw } = makeMockStorage();
    vi.stubGlobal('localStorage', storage);
    raw.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveDaily(richDaily)).not.toThrow();
  });
});
