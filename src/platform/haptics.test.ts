import { describe, it, expect, afterEach, vi } from 'vitest';
import { vibrate, HAPTIC_PLACE, HAPTIC_CLEAR } from './haptics';

describe('haptics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops when navigator is undefined', () => {
    vi.stubGlobal('navigator', undefined);
    expect(() => vibrate(HAPTIC_PLACE)).not.toThrow();
  });

  it('no-ops when navigator.vibrate is absent', () => {
    vi.stubGlobal('navigator', {});
    expect(() => vibrate(10)).not.toThrow();
  });

  it('calls navigator.vibrate with the given pattern when supported', () => {
    const vibrateFn = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: vibrateFn });
    vibrate(HAPTIC_PLACE);
    expect(vibrateFn).toHaveBeenCalledWith(HAPTIC_PLACE);
    vibrate(HAPTIC_CLEAR);
    expect(vibrateFn).toHaveBeenLastCalledWith(HAPTIC_CLEAR);
  });

  it('does not throw if navigator.vibrate itself throws', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked by permissions policy');
      },
    });
    expect(() => vibrate(5)).not.toThrow();
  });
});
