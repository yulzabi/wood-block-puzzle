/**
 * Entry point: boot the app, then register the service worker with a
 * user-controlled update prompt.
 *
 * We use `registerType: 'prompt'` (see vite.config.ts) so a new deploy never
 * silently reloads the page mid-game (which would discard the in-progress,
 * unpersisted board). Instead a small dismissible "Refresh" toast appears; the
 * user chooses when to update. SW registration failure is non-fatal — the game
 * still runs online, and the toast is only ever shown from a SW callback (never
 * on the initial paint).
 */

import { registerSW } from 'virtual:pwa-register';
import { mountApp } from './app';
import { perfRequested, startPerfProbe } from './platform/perf-probe';

// On-device perf overlay, only with ?perf=1. Started before the app mounts so its
// listener count includes the app's wiring. Completely inert without the flag.
if (perfRequested()) startPerfProbe();

mountApp('app');

// Progressive enhancement: wire the SW update prompt. Never throw on load.
try {
  const updateSW = registerSW({
    onNeedRefresh() {
      showToast('New version available', { label: 'Refresh', onClick: () => void updateSW(true) });
    },
    onOfflineReady() {
      showToast('Ready to play offline', { autoDismissMs: 3000 });
    },
  });
} catch {
  /* Service worker unavailable — the game still runs online. */
}

interface ToastOptions {
  label?: string;
  onClick?: () => void;
  autoDismissMs?: number;
}

/**
 * Show a small, dismissible bottom toast. Created only when called — never on the
 * initial paint — so it can't affect First Contentful Paint or cover the game.
 */
function showToast(message: string, opts: ToastOptions = {}): void {
  try {
    const el = document.createElement('div');
    el.className = 'sw-toast';
    el.setAttribute('role', 'status');

    const text = document.createElement('span');
    text.className = 'sw-toast__msg';
    text.textContent = message;
    el.append(text);

    const close = (): void => {
      el.classList.remove('sw-toast--in');
      setTimeout(() => el.remove(), 250);
    };

    if (opts.label && opts.onClick) {
      const btn = document.createElement('button');
      btn.className = 'sw-toast__btn';
      btn.textContent = opts.label;
      btn.addEventListener('click', () => {
        close();
        opts.onClick?.();
      });
      el.append(btn);
    }

    const dismiss = document.createElement('button');
    dismiss.className = 'sw-toast__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', close);
    el.append(dismiss);

    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('sw-toast--in'));

    if (opts.autoDismissMs) setTimeout(close, opts.autoDismissMs);
  } catch {
    /* never throw */
  }
}
