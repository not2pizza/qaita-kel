// Synthesized UI sound design — no audio files, generated live via Web Audio.
// Keeps the bundle tiny and the sounds perfectly crisp at any volume.

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // iOS/Safari suspends the context until a user gesture.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Prime/resume the audio context on the first user interaction.
if (typeof window !== 'undefined') {
  const unlock = () => {
    getCtx();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function tone(freq: number, start: number, dur: number, opts: ToneOpts = {}) {
  const c = getCtx();
  if (!c || muted) return;
  const { type = 'sine', gain = 0.12, slideTo } = opts;
  const t0 = c.currentTime + start;

  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// A short filtered-noise "whoosh" for the magic recognition moment.
function noiseSweep(dur = 0.55, gain = 0.07) {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime;

  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.8;
  filter.frequency.setValueAtTime(500, t0);
  filter.frequency.exponentialRampToValueAtTime(4500, t0 + dur);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

export const sound = {
  setMuted(m: boolean) { muted = m; },
  isMuted() { return muted; },

  /** Soft blip for taps / navigation. */
  tap() {
    tone(660, 0, 0.11, { type: 'sine', gain: 0.06 });
  },

  /** Two-note rise for adding to cart. */
  add() {
    tone(523.25, 0, 0.12, { type: 'triangle', gain: 0.09 });
    tone(783.99, 0.07, 0.16, { type: 'triangle', gain: 0.09 });
  },

  /** The magic moment — shimmer + whoosh when a member is recognized. */
  recognize() {
    tone(330, 0, 0.5, { type: 'sine', gain: 0.05, slideTo: 880 });
    tone(440, 0.04, 0.5, { type: 'triangle', gain: 0.045, slideTo: 1320 });
    noiseSweep();
  },

  /** Bright ascending arpeggio for order success. */
  success() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, i * 0.09, 0.32, { type: 'triangle', gain: 0.08 })
    );
  },
};
