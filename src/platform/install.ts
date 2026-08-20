/**
 * Install affordance controller.
 *
 * On Android / desktop Chromium the browser fires `beforeinstallprompt`; we capture it
 * and expose a programmatic `prompt()`. iOS Safari has no such event, so the UI must
 * instead show "Add to Home Screen" guidance — hence `isIOS()`. `isStandalone()` lets
 * the UI hide the affordance once the app is already installed. All browser-API access
 * is guarded so nothing throws in a non-browser (test/SSR) context.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallController {
  /** Begin listening for `beforeinstallprompt`. Call once at startup. */
  init(): void;
  /** True only once a prompt event has been captured and not yet consumed. */
  canPrompt(): boolean;
  /** Show the native install prompt; resolves with the user's choice. */
  prompt(): Promise<InstallOutcome>;
  /** True on iOS/iPadOS, where install is manual ("Add to Home Screen"). */
  isIOS(): boolean;
  /** True when running as an installed standalone app. */
  isStandalone(): boolean;
}

export function createInstallController(): InstallController {
  let deferred: BeforeInstallPromptEvent | null = null;

  return {
    init(): void {
      try {
        if (typeof window === 'undefined') return;
        window.addEventListener('beforeinstallprompt', (event: Event) => {
          // Suppress the browser's default mini-infobar so we control the affordance.
          event.preventDefault();
          deferred = event as BeforeInstallPromptEvent;
        });
      } catch {
        // Non-browser context — nothing to listen for.
      }
    },

    canPrompt(): boolean {
      return deferred !== null;
    },

    async prompt(): Promise<InstallOutcome> {
      const event = deferred;
      if (!event) return 'unavailable';
      // A prompt can only be used once.
      deferred = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch {
        return 'unavailable';
      }
    },

    isIOS(): boolean {
      try {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent || '';
        if (/iPad|iPhone|iPod/.test(ua)) return true;
        // iPadOS 13+ reports a Mac UA; distinguish it via touch support.
        const touchPoints =
          typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
        return /Macintosh/.test(ua) && touchPoints > 1;
      } catch {
        return false;
      }
    },

    isStandalone(): boolean {
      try {
        if (
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches
        ) {
          return true;
        }
        if (typeof navigator !== 'undefined') {
          // iOS Safari exposes a non-standard `standalone` flag.
          const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
          if (iosStandalone === true) return true;
        }
        return false;
      } catch {
        return false;
      }
    },
  };
}
