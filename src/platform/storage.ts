/**
 * High-score persistence (localStorage). Never throws: degrades gracefully when
 * storage is unavailable (private mode / disabled / quota) or the stored value is
 * corrupt. Only the high score is persisted (per the design's persistence scope).
 */

const HIGH_SCORE_KEY = 'wbp.v1.highscore';

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
