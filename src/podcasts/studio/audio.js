/**
 * The Podcast Studio's sound: loading audio, playing a session, recording
 * from a microphone, and mixing down to a WAV file. Web Audio only, no
 * libraries.
 */
import { mediaUrl, audioSrc } from '../../platform/media.js';
import { audible, clipEnd, encodeWav, findSilences, voiceSpans, projectLength } from './project.js';

let ctx = null;
export const audioContext = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

/* ------------------------------------------------------------ loading */
const buffers = new Map();
const silenceCache = new Map();
export const sourceKey = (s) => s?.mediaId ? `m:${s.mediaId}` : s?.episodeId ? `e:${s.episodeId}` : `u:${s?.url}`;

/** The decoded sound of a clip source, cached. getEpisode(id) finds an episode's audio. */
export function loadBuffer(source, getEpisode = () => null) {
  const key = sourceKey(source);
  if (!buffers.has(key)) {
    buffers.set(key, (async () => {
      const url = source.mediaId ? await mediaUrl(source.mediaId)
        : source.episodeId ? await audioSrc(getEpisode(source.episodeId)?.audio ?? {})
        : source.url;
      if (!url) throw new Error('That sound is missing: it may have been deleted.');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn’t load the sound (${res.status}).`);
      return audioContext().decodeAudioData(await res.arrayBuffer());
    })().catch((err) => { buffers.delete(key); throw err; }));
  }
  return buffers.get(key);
}
export const cachedBuffer = (source) => buffers.get(sourceKey(source));
/** Keep a buffer we made here (a recording, an import) so it plays without reloading. */
export const keepBuffer = (source, buffer) => buffers.set(sourceKey(source), Promise.resolve(buffer));

/** One channel of a buffer, mixed down. */
export function mono(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) { const d = buffer.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / buffer.numberOfChannels; }
  return out;
}

/** Quiet stretches of a source, cached (for ducking and tightening pauses). */
export async function silencesOf(source, getEpisode, opts) {
  const key = `${sourceKey(source)}|${JSON.stringify(opts ?? {})}`;
  if (!silenceCache.has(key)) {
    const b = await loadBuffer(source, getEpisode);
    silenceCache.set(key, findSilences(mono(b), b.sampleRate, opts));
  }
  return silenceCache.get(key);
}

async function voiceSilences(project, getEpisode) {
  const out = {};
  for (const c of Object.values(project.clips)) {
    const t = project.tracks.find((x) => x.id === c.trackId);
    if (t?.kind === 'voice') out[c.id] = await silencesOf(c.source, getEpisode).catch(() => []);
  }
  return out;
}

/* ------------------------------------------------------------ the mix graph */
const DUCK = 0.22;
const RAMP = 0.25;

/**
 * Wire a session into an audio context, starting `from` seconds in, at
 * context time `when`. Returns the sources (to stop them) and the master.
 */
async function wire(ac, project, { from = 0, when = ac.currentTime + 0.05, master, getEpisode, spans }) {
  const live = audible(project);
  const sources = [];
  const trackNodes = {};
  for (const t of project.tracks) {
    const g = ac.createGain();
    g.gain.value = t.gain;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) { pan.pan.value = t.pan; g.connect(pan).connect(master); } else g.connect(master);
    trackNodes[t.id] = g;
    // Music that dips under voices.
    if (t.kind === 'music' && t.duck && spans?.length) {
      const at = (s) => when + Math.max(0, s - from);
      g.gain.setValueAtTime(t.gain, when);
      for (const [s, e] of spans) {
        if (e < from) continue;
        const s0 = Math.max(from, s - RAMP);
        g.gain.setValueAtTime(s > from ? t.gain : t.gain * DUCK, at(s0));
        g.gain.linearRampToValueAtTime(t.gain * DUCK, at(Math.max(from, s)));
        g.gain.setValueAtTime(t.gain * DUCK, at(e));
        g.gain.linearRampToValueAtTime(t.gain, at(e + RAMP * 2));
      }
    }
  }
  for (const c of Object.values(project.clips)) {
    if (!live.has(c.trackId) || clipEnd(c) <= from) continue;
    let buf;
    try { buf = await loadBuffer(c.source, getEpisode); } catch { continue; }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    src.connect(g).connect(trackNodes[c.trackId]);
    const skip = Math.max(0, from - c.start);          // starting part-way into the clip
    const startAt = when + Math.max(0, c.start - from);
    const len = c.length - skip;
    // Fades and clip gain, as an envelope in context time.
    const t0 = startAt - skip;                          // where the clip "began"
    const v = c.gain;
    g.gain.setValueAtTime(c.fadeIn > skip ? v * (skip / c.fadeIn) : v, startAt);
    if (c.fadeIn > skip) g.gain.linearRampToValueAtTime(v, t0 + c.fadeIn);
    if (c.fadeOut > 0) {
      const fs = Math.max(startAt, t0 + c.length - c.fadeOut);
      g.gain.setValueAtTime(v, fs);
      g.gain.linearRampToValueAtTime(0.0001, t0 + c.length);
    }
    src.start(startAt, c.offset + skip, len);
    sources.push(src);
  }
  return sources;
}

/** Plays a session in the page, and tells the studio where the playhead is. */
export class Transport {
  constructor() { this.playing = false; this.sources = []; this.startedAt = 0; this.from = 0; this.meter = null; }
  get ac() { return audioContext(); }
  position() { return this.playing ? this.from + (this.ac.currentTime - this.startedAt) : this.from; }
  async play(project, from, getEpisode) {
    this.stop();
    const ac = this.ac;
    if (ac.state === 'suspended') await ac.resume();
    const master = ac.createGain();
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 1024;
    master.connect(this.analyser).connect(ac.destination);
    this.master = master;
    const spans = voiceSpans(project, await voiceSilences(project, getEpisode));
    const when = ac.currentTime + 0.06;
    this.sources = await wire(ac, project, { from, when, master, getEpisode, spans });
    this.startedAt = when;
    this.from = from;
    this.playing = true;
    this.end = projectLength(project);
  }
  stop() {
    if (this.playing) this.from = this.position();
    for (const s of this.sources) { try { s.stop(); } catch { /* already done */ } }
    this.sources = [];
    try { this.master?.disconnect(); } catch { /* gone */ }
    this.playing = false;
  }
  seek(t) { this.from = Math.max(0, t); }
  level() { return levelOf(this.analyser); }
}

/** Peak level (0–1) of an analyser, for meters. */
export function levelOf(analyser) {
  if (!analyser) return 0;
  const d = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(d);
  let m = 0;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; }
  return m;
}

/** Play one buffer straight away (sound pads, previews). */
export async function playOnce(source, getEpisode) {
  const ac = audioContext();
  if (ac.state === 'suspended') await ac.resume();
  const src = ac.createBufferSource();
  src.buffer = await loadBuffer(source, getEpisode);
  src.connect(ac.destination);
  src.start();
  return src;
}

/* ------------------------------------------------------------ mixdown */
/** Render the whole session to stereo samples, then a WAV file. onProgress is called with a word. */
export async function mixdown(project, getEpisode, { sampleRate = 44100, onProgress = () => {} } = {}) {
  const length = projectLength(project);
  if (length <= 0) throw new Error('There is nothing to mix yet: add or record some sound first.');
  onProgress('Loading the sound…');
  const spans = voiceSpans(project, await voiceSilences(project, getEpisode));
  const off = new OfflineAudioContext(2, Math.ceil(length * sampleRate) + sampleRate / 10, sampleRate);
  const master = off.createGain();
  // A gentle limiter on the master, so stacked voices and music don't clip.
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -3; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.003; comp.release.value = 0.1;
  master.connect(comp).connect(off.destination);
  await wire(off, project, { from: 0, when: 0, master, getEpisode, spans });
  onProgress('Mixing…');
  const out = await off.startRendering();
  onProgress('Writing the file…');
  const wav = encodeWav([out.getChannelData(0), out.getChannelData(1)], sampleRate);
  return { blob: new Blob([wav], { type: 'audio/wav' }), duration: length, buffer: out };
}

/* ------------------------------------------------------------ recording */
/**
 * A microphone take. start() asks for the mic; level() is for the meter;
 * stop() gives back the take as a mono WAV file and its decoded sound.
 */
export class Recorder {
  async start(deviceId) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    const ac = audioContext();
    if (ac.state === 'suspended') await ac.resume();
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 1024;
    this.input = ac.createMediaStreamSource(this.stream);
    this.input.connect(this.analyser);
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.startedAt = performance.now();
  }
  elapsed() { return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0; }
  level() { return levelOf(this.analyser); }
  async stop() {
    const done = new Promise((r) => { this.rec.onstop = r; });
    this.rec.stop();
    await done;
    for (const t of this.stream.getTracks()) t.stop();
    try { this.input.disconnect(); } catch { /* gone */ }
    this.startedAt = 0;
    const raw = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
    const buffer = await audioContext().decodeAudioData(await raw.arrayBuffer());
    // Keep takes as WAV, the format the station already takes.
    const samples = mono(buffer);
    const wav = new Blob([encodeWav([samples], buffer.sampleRate)], { type: 'audio/wav' });
    return { wav, buffer, duration: buffer.duration };
  }
  cancel() { try { this.rec?.stop(); } catch { /* not started */ } for (const t of this.stream?.getTracks() ?? []) t.stop(); this.startedAt = 0; }
}

export async function microphones() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { return []; }
}
