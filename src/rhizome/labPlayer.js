/**
 * The Web Audio player for Far Beyond the Graph (labSound.scoreOf).
 * Everything is synthesised in the browser: no samples, no network.
 *
 *   const p = createPlayer(score, { onStep })
 *   p.start(); p.stop(); p.setLayer('past' | 'present' | 'projected' | 'drums', on)
 *   p.startRecording(); const blob = await p.stopRecording()   a take, as audio
 *
 * A look-ahead scheduler (Chris Wilson's pattern) keeps time on the audio
 * clock; onStep(step) fires near when each step is heard, for the display.
 */
import { hz } from './labSound.js';

/** @param {any} score  @param {{ onStep?: (step: number) => void }} [opts] */
export function createPlayer(score, { onStep = (_step) => {} } = {}) {
  const AC = window.AudioContext || window['webkitAudioContext'];
  const ctx = new AC();
  const out = ctx.createGain();
  out.gain.value = 0.8;
  // A gentle limiter so busy moments don't clip.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  out.connect(comp).connect(ctx.destination);
  const tape = ctx.createMediaStreamDestination();
  comp.connect(tape);

  // Dub echo: three sixteenths, fed back through a darkening filter.
  const sixteenth = 60 / score.bpm / 4;
  const echo = ctx.createDelay(2);
  echo.delayTime.value = sixteenth * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 1800;
  echo.connect(dark).connect(fb).connect(echo);
  dark.connect(out);

  const bus = {};
  for (const name of ['present', 'drums', 'projected', 'past']) { bus[name] = ctx.createGain(); bus[name].connect(out); }
  const send = ctx.createGain(); send.gain.value = 0.3; send.connect(echo);
  bus.present.connect(send);
  bus.projected.connect(send);
  // The past: the same loops, worn: band-limited, a little flat, through a longer echo.
  const worn = ctx.createBiquadFilter(); worn.type = 'bandpass'; worn.frequency.value = 900; worn.Q.value = 0.8;
  worn.connect(bus.past);
  bus.past.gain.value = 0.35 + 0.4 * score.past.ratio;

  const noise = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
    return b;
  })();

  const env = (g, t, a, peak, decay) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay); };

  // A soft electric-piano voice: a sine with a quiet detuned triangle.
  const keys = (midi, t, vel, dest, { decay = 0.9, detune = 0 } = {}) => {
    const g = ctx.createGain(); g.connect(dest);
    for (const [type, mul, lvl] of /** @type {[OscillatorType, number, number][]} */ ([['sine', 1, 1], ['triangle', 2.001, 0.18]])) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(midi) * mul; o.detune.value = detune;
      const l = ctx.createGain(); l.gain.value = lvl; o.connect(l).connect(g); o.start(t); o.stop(t + decay + 0.1);
    }
    env(g, t, 0.01, vel * 0.3, decay);
  };
  const bell = (midi, t, vel, dest) => {
    const g = ctx.createGain(); g.connect(dest);
    for (const [mul, lvl] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
      const o = ctx.createOscillator(); o.frequency.value = hz(midi) * mul;
      const l = ctx.createGain(); l.gain.value = lvl; o.connect(l).connect(g); o.start(t); o.stop(t + 2.2);
    }
    env(g, t, 0.005, vel * 0.22, 2);
  };
  const ghost = (midi, t, dest) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(midi);
    const g = ctx.createGain(); o.connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.25); g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    o.start(t); o.stop(t + 1.3);
  };
  const bassNote = (midi, t, len, vel) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(midi);
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = hz(midi);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = ctx.createGain(); o.connect(f); s.connect(f); f.connect(g).connect(bus.present);
    const dur = len * sixteenth;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.02); g.gain.setValueAtTime(vel * 0.5, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); s.start(t); o.stop(t + dur + 0.05); s.stop(t + dur + 0.05);
  };
  const kick = (t) => {
    const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g).connect(bus.drums);
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    env(g, t, 0.003, 0.9, 0.35); o.start(t); o.stop(t + 0.45);
  };
  const hiss = (t, { type, freq, q = 1, peak, decay }) => {
    const n = ctx.createBufferSource(); n.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); n.connect(f).connect(g).connect(bus.drums);
    env(g, t, 0.002, peak, decay); n.start(t, Math.random() * 0.8); n.stop(t + decay + 0.05);
  };

  // Vinyl crackle under everything: sparse clicks and a low hiss.
  let crackle = null;
  const startCrackle = () => {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < len; i++) d[i] = (rnd() - 0.5) * 0.04 + (rnd() < 0.0006 ? (rnd() - 0.5) * 1.6 : 0);
    crackle = ctx.createBufferSource(); crackle.buffer = b; crackle.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 5000;
    const g = ctx.createGain(); g.gain.value = score.past.crackle;
    crackle.connect(f).connect(g).connect(bus.past);
    crackle.start();
  };

  const byStep = (list) => { const m = new Map(); for (const x of list) { if (!m.has(x.step)) m.set(x.step, []); m.get(x.step).push(x); } return m; };
  const present = byStep(score.present.flatMap((l) => l.notes));
  const bass = byStep(score.bass);
  const projected = byStep(score.projected);
  const kicks = new Set(score.drums.kick), snares = new Set(score.drums.snare), hats = new Set(score.drums.hat);
  // The past plays a share of the present loops, as many as the oldest snapshot had ties for.
  const pastNotes = byStep(score.present.flatMap((l) => l.notes).filter((n, i) => score.past.snapshots && (i % 10) < Math.round(score.past.ratio * 10)));

  let step = 0, next = 0, timer = null, playing = false;
  const visual = [];
  const playStep = (s, t) => {
    const swing = s % 2 ? sixteenth * 0.18 : 0; // a lazy, behind-the-beat feel
    const at = t + swing;
    for (const n of present.get(s) ?? []) (n.edge ? bell : keys)(n.midi, at, n.vel, bus.present);
    for (const n of bass.get(s) ?? []) bassNote(n.midi, at, n.len, n.vel);
    for (const n of projected.get(s) ?? []) ghost(n.midi, at, bus.projected);
    for (const n of pastNotes.get((s + 8) % score.steps) ?? []) keys(n.midi - 12, at, n.vel * 0.8, worn, { decay: 1.4, detune: -18 });
    if (kicks.has(s)) kick(at);
    if (snares.has(s)) hiss(at, { type: 'bandpass', freq: 1800, q: 0.7, peak: 0.5, decay: 0.18 });
    if (hats.has(s)) hiss(at, { type: 'highpass', freq: 7000, peak: s % 4 === 2 ? 0.12 : 0.06, decay: 0.04 });
    visual.push({ s, t: at });
  };
  const tick = () => {
    while (next < ctx.currentTime + 0.12) { playStep(step, next); next += sixteenth; step = (step + 1) % score.steps; }
    while (visual.length && visual[0].t <= ctx.currentTime) onStep(visual.shift().s);
  };

  let recorder = null, chunks = [];
  return {
    get playing() { return playing; },
    async start() {
      if (playing) return;
      await ctx.resume();
      playing = true; step = 0; next = ctx.currentTime + 0.06;
      startCrackle();
      timer = setInterval(tick, 25);
    },
    stop() {
      playing = false; clearInterval(timer); timer = null; visual.length = 0;
      try { crackle?.stop(); } catch {}
      onStep(-1);
    },
    setLayer(name, on) { const g = bus[name]; if (g) g.gain.setTargetAtTime(on ? (name === 'past' ? 0.35 + 0.4 * score.past.ratio : 1) : 0, ctx.currentTime, 0.08); },
    canRecord: typeof window.MediaRecorder === 'function',
    startRecording() {
      chunks = [];
      recorder = new window.MediaRecorder(tape.stream);
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.start();
    },
    stopRecording() {
      return new Promise((resolve) => {
        if (!recorder) return resolve(null);
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        recorder.stop();
      });
    },
    close() { this.stop(); ctx.close(); },
  };
}
