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
} from './storage';

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
