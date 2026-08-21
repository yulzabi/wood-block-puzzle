/**
 * Decorative line-clear particle overlay.
 *
 * A transparent `<canvas>` (pointer-events: none) that sprays short-lived
 * wood-chip particles at given client points. It is purely cosmetic: it no-ops
 * under `prefers-reduced-motion` or when canvas/rAF are unavailable, and never
 * throws. It does not touch the DOM board and runs its rAF loop only while
 * particles are alive, so it can't affect drag performance.
 *
 * The canvas is mounted lazily on the first burst — never during initial load —
 * so a full-viewport fixed element can't sit over the first paint (which would
 * suppress First Contentful Paint) or cover the menu while idle.
 *
 * Perf: chips are pooled (no per-frame allocation / splice), the device pixel
 * ratio is capped at 2, and each frame clears only the dirty rect (the union of
 * the chips' bounds) rather than the whole viewport.
 */

export interface Particles {
  /** Spray a burst of chips at each client-space point. */
  burst(points: readonly { x: number; y: number }[]): void;
  /** Tear down the canvas + listeners. */
  destroy(): void;
}

interface Chip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

const WOOD_TONES = ['#c8894e', '#b06f39', '#9a5a2c', '#d9a066', '#8a4b28', '#b58a5a'];
const NOOP: Particles = { burst(): void {}, destroy(): void {} };
const CAP = 400; // hard ceiling on live chips (also the pool size)

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function newChip(): Chip {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, ttl: 0, size: 0, rot: 0, vr: 0, color: '#000' };
}

export function createParticles(container: HTMLElement): Particles {
  if (prefersReducedMotion() || typeof document === 'undefined') return NOOP;

  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  const onResize = (): void => resize();

  /** Create + attach the canvas on first use. Returns false if unavailable. */
  function ensureMounted(): boolean {
    if (canvas) return true;
    try {
      const el = document.createElement('canvas');
      el.className = 'particle-canvas';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:70;';
      const c = el.getContext('2d');
      if (!c) return false;
      canvas = el;
      context = c;
      container.append(el);
      resize();
      window.addEventListener('resize', onResize);
      return true;
    } catch {
      return false;
    }
  }

  function resize(): void {
    if (!canvas || !context) return;
    try {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2); // cap at 2 — plenty for chips
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = null; // setting width/height already cleared the canvas
    } catch {
      /* ignore */
    }
  }

  // Pooled chips: pool[0..count-1] are live; removal is O(1) swap-with-last.
  const pool: Chip[] = Array.from({ length: CAP }, newChip);
  let count = 0;
  let raf = 0;
  let last = 0;
  // Region drawn last frame, in CSS px, so the next frame clears only that.
  let dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const PAD = 4; // clear a few extra px to avoid edge trails

  function frame(now: number): void {
    raf = 0;
    if (!context) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    const gravity = 1500; // px/s^2

    // Clear only what we drew last frame.
    if (dirty) {
      context.clearRect(dirty.x0 - PAD, dirty.y0 - PAD, dirty.x1 - dirty.x0 + PAD * 2, dirty.y1 - dirty.y0 + PAD * 2);
      dirty = null;
    }

    let nx0 = Infinity;
    let ny0 = Infinity;
    let nx1 = -Infinity;
    let ny1 = -Infinity;

    for (let i = count - 1; i >= 0; i--) {
      const c = pool[i]!;
      c.life += dt;
      if (c.life >= c.ttl) {
        // swap-remove: move the last live chip into this slot
        const lastLive = pool[count - 1]!;
        pool[count - 1] = c;
        pool[i] = lastLive;
        count--;
        continue;
      }
      c.vy += gravity * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      context.save();
      context.globalAlpha = Math.max(0, 1 - c.life / c.ttl);
      context.translate(c.x, c.y);
      context.rotate(c.rot);
      context.fillStyle = c.color;
      context.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.7);
      context.restore();
      // Accumulate this chip's bounds (size is a generous half-extent for the rotated rect).
      if (c.x - c.size < nx0) nx0 = c.x - c.size;
      if (c.y - c.size < ny0) ny0 = c.y - c.size;
      if (c.x + c.size > nx1) nx1 = c.x + c.size;
      if (c.y + c.size > ny1) ny1 = c.y + c.size;
    }

    if (count > 0) {
      dirty = { x0: nx0, y0: ny0, x1: nx1, y1: ny1 };
      raf = requestAnimationFrame(frame);
    } else {
      last = 0; // dirty already cleared above; nothing left to draw
    }
  }

  function burst(points: readonly { x: number; y: number }[]): void {
    try {
      if (!ensureMounted()) return;
      for (const p of points) {
        for (let i = 0; i < 7; i++) {
          if (count >= CAP) break; // honor the ceiling without allocating
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // upward-ish fan
          const spd = 120 + Math.random() * 260;
          const c = pool[count++]!;
          c.x = p.x;
          c.y = p.y;
          c.vx = Math.cos(ang) * spd + (Math.random() - 0.5) * 120;
          c.vy = Math.sin(ang) * spd;
          c.life = 0;
          c.ttl = 0.5 + Math.random() * 0.45;
          c.size = 5 + Math.random() * 5;
          c.rot = Math.random() * Math.PI;
          c.vr = (Math.random() - 0.5) * 12;
          c.color = WOOD_TONES[(Math.random() * WOOD_TONES.length) | 0]!;
        }
      }
      if (raf === 0) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    } catch {
      /* never throw */
    }
  }

  function destroy(): void {
    try {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      canvas?.remove();
      canvas = null;
      context = null;
      count = 0;
      dirty = null;
    } catch {
      /* ignore */
    }
  }

  return { burst, destroy };
}
