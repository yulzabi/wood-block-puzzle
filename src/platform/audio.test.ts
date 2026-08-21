import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { playPlace, playClear, setSoundEnabled, _resetAudioForTest } from './audio';

function makeStubAudio() {
  const oscillators: Array<{ frequency: { value: number } }> = [];
  const gains: unknown[] = [];

  class FakeParam {
    value = 0;
    setValueAtTime = vi.fn();
    exponentialRampToValueAtTime = vi.fn();
  }
  class FakeOsc {
    type = '';
    frequency = new FakeParam();
    connect = vi.fn();
    start = vi.fn();
    stop = vi.fn();
  }
  class FakeGain {
    gain = new FakeParam();
    connect = vi.fn();
  }
  class FakeCtx {
    currentTime = 0;
    state = 'running';
    destination = {};
    resume = vi.fn();
    createOscillator = vi.fn(() => {
      const o = new FakeOsc();
      oscillators.push(o);
      return o;
    });
    createGain = vi.fn(() => {
      const g = new FakeGain();
      gains.push(g);
      return g;
    });
  }
  return { FakeCtx, oscillators, gains };
}

describe('audio', () => {
  beforeEach(() => {
    _resetAudioForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetAudioForTest();
  });

  it('no-ops and never throws when WebAudio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(() => playPlace()).not.toThrow();
    expect(() => playClear(3)).not.toThrow();
  });

  it('creates oscillator + gain nodes when enabled', () => {
    const { FakeCtx, oscillators, gains } = makeStubAudio();
    vi.stubGlobal('AudioContext', FakeCtx);
    playPlace();
    expect(oscillators.length).toBe(1);
    expect(gains.length).toBe(1);
  });

  it('creates no nodes when sound is disabled', () => {
    const { FakeCtx, oscillators } = makeStubAudio();
    vi.stubGlobal('AudioContext', FakeCtx);
    setSoundEnabled(false);
    playPlace();
    playClear(4);
    expect(oscillators.length).toBe(0);
  });

  it('pitches the clear chime up with the streak count', () => {
    const { FakeCtx, oscillators } = makeStubAudio();
    vi.stubGlobal('AudioContext', FakeCtx);
    playClear(1);
    const low = oscillators.at(-1)!.frequency.value;
    playClear(5);
    const high = oscillators.at(-1)!.frequency.value;
    expect(high).toBeGreaterThan(low);
  });
});
