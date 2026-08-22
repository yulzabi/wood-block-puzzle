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

  // hlΔ: measured offset (px) of the highlight overlay grid vs the board grid,
  // sampled at cells 0 and 63. This is LAYOUT truth read on the device: if the
  // hint rings LOOK offset while hlΔ reads ~0, layout agrees and the compositor
  // is misplacing the overlay layer (the iPad-only bug, perf plan §7). Costs
  // four rect reads per overlay refresh (~2×/s) — probe-only, never in play.
  let sample: { c0: Element; c63: Element; h0: Element; h63: Element } | null = null;
  const hlDelta = (): string => {
    if (!sample || !sample.c0.isConnected || !sample.h0.isConnected) {
      sample = null;
      const cs = document.querySelectorAll('.board .cell');
      const hs = document.querySelectorAll('.board-hl .hcell');
      if (cs.length < 64 || hs.length < 64) return 'n/a';
      sample = { c0: cs[0]!, c63: cs[63]!, h0: hs[0]!, h63: hs[63]! };
    }
    const d = (cell: Element, hcell: Element): string => {
      const a = cell.getBoundingClientRect();
      const b = hcell.getBoundingClientRect();
      // Zero-size = not laid out (hidden screen, or a broken grid): deltas
      // between zero rects would read as a false 0.0 — say so instead.
      if (a.width === 0 || a.height === 0 || b.width === 0 || b.height === 0) return 'hidden';
      return `${(b.left - a.left).toFixed(1)},${(b.top - a.top).toFixed(1)}`;
    };
    return `0:(${d(sample.c0, sample.h0)}) 63:(${d(sample.c63, sample.h63)})`;
  };

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
        `listeners ${listeners}\n` +
        `hlΔ ${hlDelta()}`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
