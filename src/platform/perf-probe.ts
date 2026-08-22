/**
 * On-device performance probe — gated behind `?perf=1`.
 *
 * INERT unless `startPerfProbe()` is called: importing this module adds no
 * listeners, no DOM, no timers, and does no monkey-patching. `main.ts` calls
 * `startPerfProbe()` only when `perfRequested()` is true, so a normal load pays
 * nothing.
 *
 * The overlay shows:
 *  - live FPS (rAF frame-delta, refreshed ~2×/s)
 *  - long tasks: count + worst duration (PerformanceObserver 'longtask'; shows
 *    "n/a" where unsupported — e.g. Safari)
 *  - DOM node count
 *  - net live event-listener count (a scoped add/removeEventListener patch)
 */

/** True iff the current URL requests the probe (`?perf=1`). */
export function perfRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

let started = false;

/** Start the probe: patch listener counting, observe long tasks, and draw the overlay. */
export function startPerfProbe(): void {
  if (started) return;
  started = true;

  // Net live listener count. Patch BEFORE the app wires up, so its listeners are
  // counted; a growing number over a long session flags a leak.
  let listeners = 0;
  const proto = EventTarget.prototype;
  const origAdd = proto.addEventListener;
  const origRemove = proto.removeEventListener;
  proto.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    listeners++;
    origAdd.call(this, type, listener, options);
  } as typeof proto.addEventListener;
  proto.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listeners > 0) listeners--;
    origRemove.call(this, type, listener, options);
  } as typeof proto.removeEventListener;

  // Long tasks (> 50 ms). Unsupported on Safari/iOS — degrade to "n/a".
  let longtaskCount = 0;
  let longtaskWorst = 0;
  let longtaskSupported = false;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longtaskCount++;
        longtaskWorst = Math.max(longtaskWorst, e.duration);
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
    longtaskSupported = true;
  } catch {
    longtaskSupported = false;
  }

  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed',
    top: '4px',
    left: '4px',
    zIndex: '99999',
    font: '11px/1.35 ui-monospace, Menlo, monospace',
    color: '#4ade80',
    background: 'rgba(0, 0, 0, 0.72)',
    padding: '4px 6px',
    borderRadius: '6px',
    whiteSpace: 'pre',
    pointerEvents: 'none',
    textShadow: '0 1px 1px #000',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(box);

  // FPS from rAF deltas; refresh the overlay ~2×/s.
  let frames = 0;
  let windowStart = performance.now();
  const tick = (now: number): void => {
    frames++;
    const elapsed = now - windowStart;
    if (elapsed >= 500) {
      const fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      windowStart = now;
      const longText = longtaskSupported
        ? `${longtaskCount} (worst ${Math.round(longtaskWorst)}ms)`
        : 'n/a';
      box.textContent =
        `fps ${fps}\n` +
        `long ${longText}\n` +
        `nodes ${document.getElementsByTagName('*').length}\n` +
        `listeners ${listeners}`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
