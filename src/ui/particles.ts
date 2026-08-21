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

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
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
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    } catch {
      /* ignore */
    }
  }

  const chips: Chip[] = [];
  let raf = 0;
  let last = 0;

  function frame(now: number): void {
    raf = 0;
    if (!context) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    const gravity = 1500; // px/s^2
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i]!;
      c.life += dt;
      if (c.life >= c.ttl) {
        chips.splice(i, 1);
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
    }
    if (chips.length > 0) {
      raf = requestAnimationFrame(frame);
    } else {
      last = 0;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function burst(points: readonly { x: number; y: number }[]): void {
    try {
      if (!ensureMounted()) return;
      for (const p of points) {
        for (let i = 0; i < 7; i++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // upward-ish fan
          const spd = 120 + Math.random() * 260;
          chips.push({
            x: p.x,
            y: p.y,
            vx: Math.cos(ang) * spd + (Math.random() - 0.5) * 120,
            vy: Math.sin(ang) * spd,
            life: 0,
            ttl: 0.5 + Math.random() * 0.45,
            size: 5 + Math.random() * 5,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 12,
            color: WOOD_TONES[(Math.random() * WOOD_TONES.length) | 0]!,
          });
        }
      }
      if (chips.length > 400) chips.splice(0, chips.length - 400);
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
    } catch {
      /* ignore */
    }
  }

  return { burst, destroy };
}
