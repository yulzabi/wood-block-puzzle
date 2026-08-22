/**
 * Synthesized WebAudio sound effects (no audio files). Mirrors the haptics
 * module: a silent no-op that never throws when WebAudio is unavailable
 * (SSR / old browsers) or when sound is muted.
 */

type AudioContextCtor = new () => AudioContext;

let soundEnabled = true;
let ctx: AudioContext | null = null;
let unavailable = false;

/** Mute gate. When disabled, all play* calls become no-ops. */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

/** Lazily create/resume the AudioContext. Returns null if muted or unavailable. */
function getCtx(): AudioContext | null {
  if (!soundEnabled || unavailable) return null;
  if (ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* ignore autoplay-policy hiccups */
    }
    return ctx;
  }
  try {
    const w = globalThis as unknown as {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    ctx = new Ctor();
    return ctx;
  } catch {
    unavailable = true;
    return null;
  }
}

interface ToneOpts {
  freq: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  freqEnd?: number;
}

/** Play a single short, enveloped oscillator tone. */
function tone(ac: AudioContext, opts: ToneOpts): void {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type;
  osc.frequency.value = opts.freq;
  try {
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), now + opts.duration);
    }
  } catch {
    /* some environments lack ramp helpers */
  }
  g.gain.value = opts.gain;
  try {
    g.gain.setValueAtTime(opts.gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
  } catch {
    /* ignore */
  }
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(now);
  osc.stop(now + opts.duration);
}

/**
 * Pre-create/resume the AudioContext from a user-gesture context (game entry), so
 * the FIRST placement doesn't pay context construction inside its frame — a
 * one-time but very perceptible hitch on old hardware. No-op when muted or when
 * WebAudio is unavailable; never throws.
 */
export function warmAudio(): void {
  try {
    getCtx();
  } catch {
    /* never throw */
  }
}

/** Soft, low wood "clack" when a piece is placed. */
export function playPlace(): void {
  try {
    const ac = getCtx();
    if (!ac) return;
    tone(ac, { freq: 180, freqEnd: 90, type: 'triangle', duration: 0.09, gain: 0.16 });
  } catch {
    /* never throw */
  }
}

/** Brighter chime on line clear; pitch rises with the streak/combo count. */
export function playClear(streak = 1): void {
  try {
    const ac = getCtx();
    if (!ac) return;
    const step = Math.max(0, Math.floor(streak) - 1);
    const freq = Math.min(520 + step * 90, 1400);
    tone(ac, { freq, type: 'sine', duration: 0.22, gain: 0.18 });
  } catch {
    /* never throw */
  }
}

/** Test-only: reset module state between cases. */
export function _resetAudioForTest(): void {
  soundEnabled = true;
  ctx = null;
  unavailable = false;
}
