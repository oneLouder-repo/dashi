/**
 * Podcast Studio projects: a multitrack arrangement of audio clips. Pure
 * functions only (no DOM, no Web Audio), so the tests and the server can
 * use them. Every edit returns a new project; the studio keeps the old
 * ones for undo.
 *
 * Project {
 *   id, title, podcastId?, episodeId?,       the series it is for, the episode it became
 *   tracks:  [{ id, name, kind: 'voice' | 'music' | 'fx', gain (0–2), pan (-1–1), muted, solo, duck }],
 *   clips:   { [id]: { id, trackId, source, name, start, offset, length, gain, fadeIn, fadeOut } },
 *            source: { mediaId } | { url } | { episodeId }    where the sound comes from
 *            start: seconds on the timeline · offset: seconds into the source · length: seconds heard
 *   markers: [{ id, at, title }],             chapters when it becomes an episode
 *   pads:    [{ id, name, source, length, colour }],   the sound board: jingles, stings, beds
 *   updatedAt
 * }
 * Projects live in the podcasts document under `projects` (never public).
 */

export const MIN_CLIP = 0.05;
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clone = (x) => structuredClone(x);
const round = (t) => Math.round(t * 1000) / 1000;

export const TRACK_KINDS = [
  { id: 'voice', label: 'Voice', blurb: 'People talking' },
  { id: 'music', label: 'Music', blurb: 'Beds, intros and outros' },
  { id: 'fx', label: 'Effects', blurb: 'Stings, sounds and clips' },
];

export const TEMPLATES = [
  { id: 'interview', label: 'Interview', blurb: 'A host, a guest, and music under the open and close', tracks: [['Host', 'voice'], ['Guest', 'voice'], ['Music', 'music']] },
  { id: 'solo', label: 'Solo show', blurb: 'One voice and a music bed', tracks: [['Voice', 'voice'], ['Music', 'music']] },
  { id: 'panel', label: 'Panel', blurb: 'Three voices around a table, plus music and effects', tracks: [['Host', 'voice'], ['Guest 1', 'voice'], ['Guest 2', 'voice'], ['Music', 'music'], ['Effects', 'fx']] },
  { id: 'radio', label: 'Radio hour', blurb: 'Presenter, call-ins, music and station idents', tracks: [['Presenter', 'voice'], ['Calls', 'voice'], ['Music', 'music'], ['Idents', 'fx']] },
  { id: 'blank', label: 'Blank', blurb: 'One track; add what you need', tracks: [['Track 1', 'voice']] },
];

export const makeTrack = (name, kind = 'voice') => ({ id: rid('trk'), name, kind, gain: 1, pan: 0, muted: false, solo: false, duck: kind === 'music' });

export function newProject({ title = 'Untitled session', template = 'interview', podcastId = null } = {}) {
  const t = TEMPLATES.find((x) => x.id === template) ?? TEMPLATES[0];
  return { id: rid('proj'), title, podcastId, episodeId: null, template: t.id, tracks: t.tracks.map(([n, k]) => makeTrack(n, k)), clips: {}, markers: [], pads: [], updatedAt: new Date().toISOString() };
}

const touch = (p) => { p.updatedAt = new Date().toISOString(); return p; };
const edit = (project, fn) => { const p = clone(project); fn(p); return touch(p); };

export const clipEnd = (c) => c.start + c.length;
export const clipsOn = (p, trackId) => Object.values(p.clips).filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
export const projectLength = (p) => Math.max(0, ...Object.values(p.clips).map(clipEnd), ...p.markers.map((m) => m.at));

/** Snap a time to a grid step, and to clip edges within `near` seconds. */
export function snap(p, t, { step = 0, near = 0, except = null } = {}) {
  if (near > 0) {
    let best = null;
    for (const c of Object.values(p.clips)) {
      if (c.id === except) continue;
      for (const edge of [c.start, clipEnd(c)]) if (Math.abs(edge - t) <= near && (best == null || Math.abs(edge - t) < Math.abs(best - t))) best = edge;
    }
    if (best != null) return best;
  }
  return step > 0 ? Math.round(t / step) * step : t;
}

/* ------------------------------------------------------------ tracks */
export const addTrack = (p, name, kind) => edit(p, (x) => { x.tracks.push(makeTrack(name ?? `Track ${x.tracks.length + 1}`, kind)); });
export const updateTrack = (p, id, patch) => edit(p, (x) => { Object.assign(x.tracks.find((t) => t.id === id) ?? {}, patch); });
export const removeTrack = (p, id) => edit(p, (x) => {
  x.tracks = x.tracks.filter((t) => t.id !== id);
  for (const c of Object.values(x.clips)) if (c.trackId === id) delete x.clips[c.id];
});
export const moveTrack = (p, id, dir) => edit(p, (x) => {
  const i = x.tracks.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= x.tracks.length) return;
  [x.tracks[i], x.tracks[j]] = [x.tracks[j], x.tracks[i]];
});
/** Which tracks are heard: solo wins, then mute. */
export function audible(p) {
  const solo = p.tracks.some((t) => t.solo);
  return new Set(p.tracks.filter((t) => (solo ? t.solo : !t.muted)).map((t) => t.id));
}

/* ------------------------------------------------------------ clips */
export function addClip(p, { trackId, source, name = 'Clip', start = 0, offset = 0, length, sourceLength = length, gain = 1 }) {
  const id = rid('clip');
  const out = edit(p, (x) => { x.clips[id] = { id, trackId, source, name, start: round(Math.max(0, start)), offset: round(offset), length: round(length), sourceLength: round(sourceLength), gain, fadeIn: 0, fadeOut: 0 }; });
  out.lastId = id;
  return out;
}

export const updateClip = (p, id, patch) => edit(p, (x) => { if (x.clips[id]) Object.assign(x.clips[id], patch); });
export const removeClips = (p, ids) => edit(p, (x) => { for (const id of ids) delete x.clips[id]; });

export function moveClip(p, id, start, trackId) {
  return edit(p, (x) => {
    const c = x.clips[id];
    if (!c) return;
    c.start = round(Math.max(0, start));
    if (trackId && x.tracks.some((t) => t.id === trackId)) c.trackId = trackId;
  });
}

/** Drag a clip's left or right edge. The left edge also moves where the sound starts. */
export function trimClip(p, id, side, t) {
  return edit(p, (x) => {
    const c = x.clips[id];
    if (!c) return;
    const srcLen = c.sourceLength ?? c.offset + c.length;
    if (side === 'start') {
      const minStart = c.start - c.offset; // can't reach before the source begins
      const s = Math.min(Math.max(t, minStart, 0), clipEnd(c) - MIN_CLIP);
      const d = s - c.start;
      c.start = round(s); c.offset = round(c.offset + d); c.length = round(c.length - d);
    } else {
      const maxEnd = c.start + (srcLen - c.offset);
      c.length = round(Math.max(MIN_CLIP, Math.min(t, maxEnd) - c.start));
    }
    c.fadeIn = Math.min(c.fadeIn, c.length / 2);
    c.fadeOut = Math.min(c.fadeOut, c.length / 2);
  });
}

/** Cut a clip in two at a time on the timeline. Returns the project and the new right-hand id. */
export function splitClip(p, id, at) {
  const c = p.clips[id];
  if (!c || at <= c.start + MIN_CLIP || at >= clipEnd(c) - MIN_CLIP) return { project: p, rightId: null };
  const rightId = rid('clip');
  const project = edit(p, (x) => {
    const l = x.clips[id];
    const leftLen = round(at - l.start);
    x.clips[rightId] = { ...clone(l), id: rightId, start: round(at), offset: round(l.offset + leftLen), length: round(l.length - leftLen), fadeIn: 0 };
    l.length = leftLen;
    l.fadeOut = 0;
  });
  return { project, rightId };
}

/** Split every clip that crosses a time (on the given tracks, or all). */
export function splitAll(p, at, trackIds = null) {
  let out = p;
  for (const c of Object.values(p.clips)) if (!trackIds || trackIds.includes(c.trackId)) out = splitClip(out, c.id, at).project;
  return out;
}

export function duplicateClip(p, id) {
  const c = p.clips[id];
  if (!c) return p;
  return addClip(p, { ...c, start: clipEnd(c) });
}

/**
 * Take a stretch of time out of the whole session and close the gap
 * (ripple delete): the editor's "cut that ramble". Clips inside it go,
 * clips across it are cut, and everything after it moves up, markers too.
 */
export function rippleDelete(p, from, to, trackIds = null) {
  if (to - from < MIN_CLIP) return p;
  let out = splitAll(splitAll(p, from, trackIds), to, trackIds);
  const gap = to - from;
  return edit(out, (x) => {
    for (const c of Object.values(x.clips)) {
      if (trackIds && !trackIds.includes(c.trackId)) continue;
      if (c.start >= from - 1e-6 && clipEnd(c) <= to + 1e-6) delete x.clips[c.id];
      else if (c.start >= to - 1e-6) c.start = round(c.start - gap);
    }
    if (!trackIds) x.markers = x.markers.filter((m) => m.at < from || m.at >= to).map((m) => (m.at >= to ? { ...m, at: round(m.at - gap) } : m));
  });
}

/** Open a gap of silence at a time, pushing everything after it along. */
export function insertSilence(p, at, length) {
  const out = splitAll(p, at);
  return edit(out, (x) => {
    for (const c of Object.values(x.clips)) if (c.start >= at - 1e-6) c.start = round(c.start + length);
    for (const m of x.markers) if (m.at >= at) m.at = round(m.at + length);
  });
}

/* ------------------------------------------------------------ markers, pads */
export const addMarker = (p, at, title) => edit(p, (x) => { x.markers.push({ id: rid('mk'), at: round(at), title: title || `Chapter ${x.markers.length + 1}` }); x.markers.sort((a, b) => a.at - b.at); });
export const updateMarker = (p, id, patch) => edit(p, (x) => { Object.assign(x.markers.find((m) => m.id === id) ?? {}, patch); x.markers.sort((a, b) => a.at - b.at); });
export const removeMarker = (p, id) => edit(p, (x) => { x.markers = x.markers.filter((m) => m.id !== id); });
/** Markers as episode chapters (the first starts at 0). */
export const chaptersOf = (p) => p.markers.map((m) => ({ at: Math.round(m.at), title: m.title }));

export const PAD_COLOURS = ['#e4572e', '#f3a712', '#29bf12', '#00a5cf', '#7b2cbf', '#ef476f', '#118ab2', '#06d6a0'];
export const addPad = (p, pad) => edit(p, (x) => { x.pads.push({ id: rid('pad'), colour: PAD_COLOURS[x.pads.length % PAD_COLOURS.length], ...pad }); });
export const removePad = (p, id) => edit(p, (x) => { x.pads = x.pads.filter((d) => d.id !== id); });

/* ------------------------------------------------------------ the sound itself */
/**
 * Peaks for a waveform: [min, max] pairs, one per bucket, for samples
 * from `from` to `to` (sample indexes).
 */
export function peaks(samples, buckets, from = 0, to = samples.length) {
  const out = new Float32Array(buckets * 2);
  const span = Math.max(1, (to - from) / buckets);
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(from + b * span);
    const e = Math.min(to, Math.floor(from + (b + 1) * span));
    let lo = 0, hi = 0;
    // Big buckets: look at a sample of the points, fast enough for an hour of audio.
    const stride = Math.max(1, Math.floor((e - s) / 400));
    for (let i = s; i < e; i += stride) { const v = samples[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    out[b * 2] = lo; out[b * 2 + 1] = hi;
  }
  return out;
}

export function peakOf(samples) { let m = 0; for (let i = 0; i < samples.length; i++) { const v = Math.abs(samples[i]); if (v > m) m = v; } return m; }
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** The gain that brings a clip's loudest moment to `targetDb` (default -1 dB). */
export function normaliseGain(samples, targetDb = -1) {
  const pk = peakOf(samples);
  return pk > 0 ? Math.min(8, dbToGain(targetDb) / pk) : 1;
}

/**
 * Stretches of near-silence: windows of 20 ms whose level stays under
 * `thresholdDb` for at least `minLength` seconds. Times are seconds into
 * the samples. Used to tighten long pauses and to find where voices are.
 */
export function findSilences(samples, sampleRate, { thresholdDb = -42, minLength = 0.8, window = 0.02 } = {}) {
  const win = Math.max(1, Math.round(sampleRate * window));
  const limit = dbToGain(thresholdDb);
  const out = [];
  let startWin = -1;
  const n = Math.ceil(samples.length / win);
  for (let w = 0; w <= n; w++) {
    let quiet = false;
    if (w < n) {
      let sum = 0;
      const s = w * win, e = Math.min(samples.length, s + win);
      for (let i = s; i < e; i++) sum += samples[i] * samples[i];
      quiet = Math.sqrt(sum / Math.max(1, e - s)) < limit;
    }
    if (quiet && startWin < 0) startWin = w;
    if (!quiet && startWin >= 0) {
      const from = (startWin * win) / sampleRate, to = Math.min(samples.length, w * win) / sampleRate;
      if (to - from >= minLength) out.push({ from: round(from), to: round(to) });
      startWin = -1;
    }
  }
  return out;
}

/**
 * Tighten a clip's long pauses: each pause longer than `keep` seconds is
 * shortened to `keep`, by ripple-deleting the middle of it across the
 * session (so other tracks stay in sync). `silences` are seconds into the
 * clip's source, from findSilences.
 */
export function tightenPauses(p, clipId, silences, { keep = 0.5 } = {}) {
  const c = p.clips[clipId];
  if (!c) return { project: p, removed: 0 };
  // On the timeline, inside what is heard of the clip, latest first so earlier times stay put.
  const cuts = silences
    .map((s) => ({ from: c.start + (s.from - c.offset), to: c.start + (s.to - c.offset) }))
    .map((s) => ({ from: Math.max(s.from, c.start), to: Math.min(s.to, clipEnd(c)) }))
    .filter((s) => s.to - s.from > keep + MIN_CLIP)
    .map((s) => ({ from: s.from + keep / 2, to: s.to - keep / 2 }))
    .sort((a, b) => b.from - a.from);
  let out = p;
  let removed = 0;
  for (const cut of cuts) { out = rippleDelete(out, cut.from, cut.to); removed += cut.to - cut.from; }
  return { project: out, removed: round(removed) };
}

/**
 * Where voices are speaking, as [from, to] spans on the timeline, from the
 * silences of each voice clip. Music on tracks with `duck` dips under them.
 */
export function voiceSpans(p, silencesByClip) {
  const live = audible(p);
  const spans = [];
  for (const c of Object.values(p.clips)) {
    const t = p.tracks.find((x) => x.id === c.trackId);
    if (!t || t.kind !== 'voice' || !live.has(t.id)) continue;
    const quiet = (silencesByClip[c.id] ?? []).map((s) => [c.start + s.from - c.offset, c.start + s.to - c.offset]);
    let at = c.start;
    for (const [f, to] of quiet.sort((a, b) => a[0] - b[0])) {
      if (to <= c.start || f >= clipEnd(c)) continue;
      if (f > at) spans.push([at, Math.min(f, clipEnd(c))]);
      at = Math.max(at, to);
    }
    if (at < clipEnd(c)) spans.push([at, clipEnd(c)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  // Merge spans closer than half a second, so the music doesn't pump between words.
  const merged = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (last && s[0] - last[1] < 0.5) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  return merged;
}

/** A 16-bit PCM WAV file from channels of samples (-1 to 1). */
export function encodeWav(channels, sampleRate) {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return buf;
}

/** "1:05.3" for the timeline. */
export function clock(t, { tenths = true } = {}) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const sec = s - m * 60;
  const ss = tenths ? sec.toFixed(1).padStart(4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A good grid step for a zoom level (pixels per second), so labels sit ~80px apart. */
export function rulerStep(pxPerSec) {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]) if (s * pxPerSec >= 80) return s;
  return 3600;
}
