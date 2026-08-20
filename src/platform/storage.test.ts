import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadHighScore, saveHighScore, loadLevelProgress, saveLevelProgress } from './storage';

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
