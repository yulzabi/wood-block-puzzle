/**
 * Feature-detected haptic feedback wrapper around `navigator.vibrate`.
 * A silent no-op (never throws) on platforms without vibration support (e.g. iOS Safari,
 * desktop). Patterns are intentionally short and subtle.
 */

/** Single soft tick when a piece is placed. */
export const HAPTIC_PLACE = 8;

/** Slightly richer double-pulse when one or more lines clear. */
export const HAPTIC_CLEAR: number[] = [0, 14, 40, 20];

type VibrateCapable = { vibrate?: (pattern: number | number[]) => boolean };

/** Trigger a vibration pattern where supported; otherwise do nothing. */
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & VibrateCapable;
    if (typeof nav.vibrate !== 'function') return;
    nav.vibrate(pattern);
  } catch {
    // Vibration can be blocked by user-gesture / permission policies — ignore.
  }
}
