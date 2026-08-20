import { describe, it, expect, afterEach, vi } from 'vitest';
import { createInstallController } from './install';

type Listener = (e: unknown) => void;

function makeMockWindow(matchMediaMatches = false) {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener: vi.fn((type: string, cb: Listener) => {
      const arr = listeners.get(type) ?? [];
      arr.push(cb);
      listeners.set(type, arr);
    }),
    dispatch(type: string, e: unknown) {
      (listeners.get(type) ?? []).forEach((cb) => cb(e));
    },
    matchMedia: vi.fn((query: string) => ({
      matches: matchMediaMatches && query.includes('standalone'),
      media: query,
    })),
  };
}

function makePromptEvent(outcome: 'accepted' | 'dismissed') {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  };
}

describe('install controller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('canPrompt is false before the event and true after capture', () => {
    const win = makeMockWindow();
    vi.stubGlobal('window', win);
    const ctrl = createInstallController();
    ctrl.init();
    expect(ctrl.canPrompt()).toBe(false);

    const evt = makePromptEvent('accepted');
    win.dispatch('beforeinstallprompt', evt);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(ctrl.canPrompt()).toBe(true);
  });

  it('prompt() resolves to "accepted" and consumes the event', async () => {
    const win = makeMockWindow();
    vi.stubGlobal('window', win);
    const ctrl = createInstallController();
    ctrl.init();
    win.dispatch('beforeinstallprompt', makePromptEvent('accepted'));

    await expect(ctrl.prompt()).resolves.toBe('accepted');
    expect(ctrl.canPrompt()).toBe(false); // consumed — single use
    await expect(ctrl.prompt()).resolves.toBe('unavailable');
  });

  it('prompt() resolves to "dismissed"', async () => {
    const win = makeMockWindow();
    vi.stubGlobal('window', win);
    const ctrl = createInstallController();
    ctrl.init();
    win.dispatch('beforeinstallprompt', makePromptEvent('dismissed'));
    await expect(ctrl.prompt()).resolves.toBe('dismissed');
  });

  it('prompt() resolves to "unavailable" when no event was captured', async () => {
    vi.stubGlobal('window', makeMockWindow());
    const ctrl = createInstallController();
    ctrl.init();
    await expect(ctrl.prompt()).resolves.toBe('unavailable');
  });

  it('detects iOS via iPhone UA', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit',
      maxTouchPoints: 5,
    });
    const ctrl = createInstallController();
    expect(ctrl.isIOS()).toBe(true);
  });

  it('detects iPadOS reporting a Mac UA with touch', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit',
      maxTouchPoints: 5,
    });
    const ctrl = createInstallController();
    expect(ctrl.isIOS()).toBe(true);
  });

  it('does not flag a touchless desktop Mac as iOS', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit',
      maxTouchPoints: 0,
    });
    const ctrl = createInstallController();
    expect(ctrl.isIOS()).toBe(false);
  });

  it('isStandalone() true via matchMedia(display-mode: standalone)', () => {
    vi.stubGlobal('window', makeMockWindow(true));
    vi.stubGlobal('navigator', { userAgent: 'x' });
    const ctrl = createInstallController();
    expect(ctrl.isStandalone()).toBe(true);
  });

  it('isStandalone() true via iOS navigator.standalone', () => {
    vi.stubGlobal('window', makeMockWindow(false));
    vi.stubGlobal('navigator', { userAgent: 'x', standalone: true });
    const ctrl = createInstallController();
    expect(ctrl.isStandalone()).toBe(true);
  });

  it('isStandalone() false in a normal browser tab', () => {
    vi.stubGlobal('window', makeMockWindow(false));
    vi.stubGlobal('navigator', { userAgent: 'x' });
    const ctrl = createInstallController();
    expect(ctrl.isStandalone()).toBe(false);
  });
});
