import { describe, it, expect, afterEach, vi } from 'vitest';
import { vibrate, HAPTIC_PLACE, HAPTIC_CLEAR, setHapticsEnabled } from './haptics';

describe('haptics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setHapticsEnabled(true); // restore module state for other tests
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

  it('no-ops when haptics are disabled, even if navigator.vibrate exists', () => {
    const vibrateFn = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: vibrateFn });
    setHapticsEnabled(false);
    vibrate(HAPTIC_PLACE);
    expect(vibrateFn).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    vibrate(HAPTIC_PLACE);
    expect(vibrateFn).toHaveBeenCalledWith(HAPTIC_PLACE);
  });
});
