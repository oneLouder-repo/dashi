/**
 * Trial slideshow podcasts for Kestrel Bay (slideshow podcasts): on
 * `npm run clients`, the made-up Kestrel Bay org gets ten short slideshow
 * shows to play with (src/podcasts/show/trials.js), each as
 *
 *   - an audio file (the mix) carrying its slides, in Listen → Studio → Audio files,
 *   - a studio session (voice and music on their own tracks, the slides above them),
 *   - a published episode in the series "Kestrel in a Minute", with its slides and chapters.
 *
 * The audio is made here, with nothing to download:
 *   - the voice reads each slide's words, using the first speech tool the
 *     computer has: macOS `say`, `espeak-ng` / `espeak`, or ffmpeg's flite.
 *     With none of them, the shows are music only and the slides keep their
 *     timing from a reading speed;
 *   - a music bed is synthesised (soft chords and a plucked pattern, in a key
 *     picked from the show's name), dipping under the voice.
 *
 * A show already there (same file id) is left alone, so running it again
 * only adds what's missing. Delete data-clients/ to make them again.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { TRIAL_SHOWS, trialIds, sayLength, planTiming, timeSlides } from '../src/podcasts/show/trials.js';

export const RATE = 22050;
export const SERIES_ID = 'pod-kestrel-minute';

/* ------------------------------------------------------------ wav in and out */
/** A 16-bit mono WAV file from samples (-1 to 1). */
export function wavBytes(samples, rate = RATE) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0, 'latin1'); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1'); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

/** Samples (mono, at `rate`) from a PCM WAV file: 8, 16, 24 or 32-bit, any channels, resampled. */
export function readWav(buf, rate = RATE) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let fmt = null, data = null;
  for (let i = 12; i + 8 <= buf.length;) {
    const id = buf.toString('latin1', i, i + 4);
    let len = buf.readUInt32LE(i + 4);
    if (id === 'data' && (len === 0 || len === 0xffffffff || i + 8 + len > buf.length)) len = buf.length - i - 8;   // a stream that never filled its size in
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(i + 8), channels: buf.readUInt16LE(i + 10), rate: buf.readUInt32LE(i + 12), bits: buf.readUInt16LE(i + 22) };
    if (id === 'data') { data = buf.subarray(i + 8, i + 8 + len); break; }
    i += 8 + len + (len & 1);
  }
  if (!fmt || !data) throw new Error('WAV without format or data');
  const { channels, bits } = fmt;
  const step = (bits / 8) * channels;
  const frames = Math.floor(data.length / step);
  const mono = new Float32Array(frames);
  const read = fmt.format === 3 && bits === 32 ? (o) => data.readFloatLE(o)
    : bits === 16 ? (o) => data.readInt16LE(o) / 32768
      : bits === 24 ? (o) => data.readIntLE(o, 3) / 8388608
        : bits === 32 ? (o) => data.readInt32LE(o) / 2147483648
          : (o) => (data[o] - 128) / 128;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += read(f * step + c * (bits / 8));
    mono[f] = s / channels;
  }
  if (fmt.rate === rate) return mono;
  const out = new Float32Array(Math.floor((frames * rate) / fmt.rate));
  const k = fmt.rate / rate;
  for (let i = 0; i < out.length; i++) { const x = i * k, j = Math.floor(x), t = x - j; out[i] = (mono[j] ?? 0) * (1 - t) + (mono[j + 1] ?? mono[j] ?? 0) * t; }
  return out;
}

/* ------------------------------------------------------------ the voice */
const has = (cmd, args = ['--version']) => { try { return spawnSync(cmd, args, { stdio: 'ignore', timeout: 5000 }).status === 0; } catch { return false; } };

/** The speech tool this computer has: 'say' | 'espeak-ng' | 'espeak' | 'flite' | null. */
export function findVoice() {
  if (process.env.TRIAL_VOICE === 'none') return null;
  if (platform() === 'darwin' && has('say', ['-v', '?'])) return 'say';
  if (has('espeak-ng')) return 'espeak-ng';
  if (has('espeak')) return 'espeak';
  if (has('ffmpeg', ['-hide_banner', '-h', 'filter=flite'])) {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 5000 });
    if (/\bflite\b/.test(r.stdout ?? '')) return 'flite';
  }
  return null;
}

/** One line of speech as samples, or null if the tool failed. */
export function speak(tool, text, dir) {
  const out = join(dir, `say-${Math.random().toString(36).slice(2)}.wav`);
  const words = join(dir, `words-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(words, text);
  let r;
  try {
    if (tool === 'say') r = spawnSync('say', ['-r', '172', '-o', out, '--file-format=WAVE', `--data-format=LEI16@${RATE}`, '-f', words], { timeout: 60_000 });
    else if (tool === 'espeak-ng' || tool === 'espeak') r = spawnSync(tool, ['-s', '160', '-w', out, '-f', words], { timeout: 60_000 });
    else if (tool === 'flite') r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `flite=textfile=${words}:voice=slt`, '-ar', String(RATE), '-ac', '1', out], { timeout: 60_000 });
    if (r?.status !== 0 || !existsSync(out)) return null;
    const s = readWav(readFileSync(out));
    return s.length > RATE * 0.3 ? trimSilence(s) : null;
  } catch { return null; }
}
/** Take the quiet off both ends of a line of speech. */
function trimSilence(s, floor = 0.01) {
  let a = 0, b = s.length - 1;
  while (a < b && Math.abs(s[a]) < floor) a++;
  while (b > a && Math.abs(s[b]) < floor) b--;
  return s.subarray(Math.max(0, a - 200), Math.min(s.length, b + 400));
}

/* ------------------------------------------------------------ the music */
function seeded(str) { let x = 2166136261; for (const c of str) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
const PROGRESSIONS = [[0, 9, 5, 7], [0, 5, 9, 7], [0, 7, 9, 5], [9, 5, 0, 7]];   // I vi IV V and friends, as semitones above the key
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/**
 * A gentle music bed `seconds` long: slow chords on a soft pad and a plucked
 * pattern over them, in a key and tempo picked from `seed`. Fades in and out.
 */
export function musicBed(seconds, seed = 'dashi', rate = RATE) {
  const h = seeded(seed);
  const key = 48 + (h % 7);                       // C3 to F#3
  const bpm = 76 + (h >>> 3) % 24;
  const prog = PROGRESSIONS[(h >>> 7) % PROGRESSIONS.length];
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = Math.ceil(seconds * rate);
  const out = new Float32Array(n);
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  // The pad: three soft voices per chord, a slow swell each bar.
  for (let b = 0; b * bar < seconds; b++) {
    const root = key + prog[b % prog.length];
    const minor = prog[b % prog.length] === 9;
    const chord = [root, root + (minor ? 3 : 4), root + 7, root + 12];
    const s0 = Math.floor(b * bar * rate), len = Math.floor(bar * rate * 1.15);
    for (const m of chord) {
      const f = hz(m), w = (2 * Math.PI * f) / rate;
      for (let i = 0; i < len && s0 + i < n; i++) {
        const t = i / len;
        const env = Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 1.5;
        out[s0 + i] += 0.045 * env * (Math.sin(w * i) + 0.25 * Math.sin(2 * w * i + 0.3) + 0.08 * Math.sin(3 * w * i));
      }
    }
    // The bass: the root, an octave down, on beats one and three.
    for (const at of [0, 2]) {
      const f = hz(root - 12), w = (2 * Math.PI * f) / rate;
      const s1 = s0 + Math.floor(at * beat * rate), l = Math.floor(beat * 1.6 * rate);
      for (let i = 0; i < l && s1 + i < n; i++) out[s1 + i] += 0.09 * Math.exp(-i / (rate * 0.5)) * Math.sin(w * i) * Math.min(1, i / 200);
    }
    // The pluck: eighth notes up and down the chord, a little random.
    const r = (k) => (seeded(`${seed}:${b}:${k}`) % 1000) / 1000;
    for (let e = 0; e < 8; e++) {
      if (r(e) < 0.28) continue;
      const deg = [0, 2, 4, 6, 4, 2, 7, 4][e];
      const m = root + 12 + MAJOR[deg % 7] + (deg >= 7 ? 12 : 0) - (minor && deg === 2 ? 1 : 0);
      const f = hz(m), w = (2 * Math.PI * f) / rate;
      const s1 = s0 + Math.floor((e * beat * rate) / 2), l = Math.floor(rate * 0.9);
      const v = 0.05 + 0.03 * r(e + 10);
      for (let i = 0; i < l && s1 + i < n; i++) out[s1 + i] += v * Math.exp(-i / (rate * 0.18)) * (Math.sin(w * i) + 0.3 * Math.sin(2 * w * i)) * Math.min(1, i / 60);
    }
  }
  // A soft low-pass, then fades.
  let y = 0;
  for (let i = 0; i < n; i++) { y += 0.35 * (out[i] - y); out[i] = y; }
  const fade = Math.min(n / 4, rate * 1.5);
  for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[n - 1 - i] *= i / fade; }
  return out;
}

/* ------------------------------------------------------------ one show */
/**
 * Make one show's audio and slides. Returns { voice (samples or null),
 * music, mix, slides, duration, chapters }.
 */
export function makeShow(show, { tool = null, dir = null } = {}) {
  const lines = tool && dir ? show.slides.map((s) => speak(tool, s.say, dir)) : show.slides.map(() => null);
  const spoken = lines.every(Boolean);
  const durations = show.slides.map((s, i) => (spoken ? lines[i].length / RATE : sayLength(s.say)));
  const plan = planTiming(show, durations);
  const n = Math.ceil(plan.end * RATE);
  const voice = spoken ? new Float32Array(n) : null;
  if (voice) lines.forEach((ln, i) => voice.set(ln.subarray(0, Math.max(0, n - Math.floor(plan.voiceAt[i] * RATE))), Math.floor(plan.voiceAt[i] * RATE)));
  const music = musicBed(plan.end, show.slug);
  // The music sits under the voice: lower while words are said, up between them.
  const mix = new Float32Array(n);
  const duck = new Float32Array(n).fill(1);
  if (voice) plan.voiceAt.forEach((at, i) => {
    const a = Math.floor(at * RATE), b = Math.floor((at + durations[i]) * RATE), ramp = Math.floor(RATE * 0.25);
    for (let j = Math.max(0, a - ramp); j < Math.min(n, b + ramp); j++) duck[j] = Math.min(duck[j], j < a ? 1 - 0.7 * ((j - a + ramp) / ramp) : j > b ? 1 - 0.7 * (1 - (j - b) / ramp) : 0.3);
  });
  let peak = 0;
  for (let i = 0; i < n; i++) { mix[i] = (voice ? voice[i] * 0.95 : 0) + music[i] * (voice ? 0.55 : 0.9) * duck[i]; peak = Math.max(peak, Math.abs(mix[i])); }
  if (peak > 0.95) for (let i = 0; i < n; i++) mix[i] *= 0.95 / peak;
  const slides = timeSlides(show, durations);
  const chapters = slides.filter((s, i) => i === 0 || s.kind === 'title').map((s) => ({ id: `chap_${s.id}`, at: s.at, title: s.title }));
  return { voice, music, mix, slides, duration: plan.end, chapters, spoken };
}

/* ------------------------------------------------------------ into the database */
const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/**
 * Add the trial shows to an org's podcasts. Returns a summary line, or ''
 * when there was nothing to add.
 */
export function seedTrialShows(db, { orgId = 'org-kestrel', dataDir, log = () => {}, shows = TRIAL_SHOWS } = {}) {
  if (!db.prepare('SELECT 1 FROM orgs WHERE id = ?').get(orgId)) return '';
  const row = db.prepare("SELECT json FROM docs WHERE org_id = ? AND name = 'podcasts'").get(orgId);
  if (!row) return '';
  const doc = JSON.parse(row.json);
  doc.files ??= {}; doc.projects ??= {}; doc.episodes ??= {}; doc.podcasts ??= {};
  const todo = shows.filter((s) => !doc.files[trialIds(s.slug).file]);
  if (!todo.length) return '';
  // A speech tool that misbehaves (alpha 0.4: Kestrel's shows went missing on a Mac) never stops the shows: they fall back to music only.
  let tool = null;
  try { tool = findVoice(); } catch (err) { log(`Trial shows: no voice (${err.message}), music only.`); }
  const tmp = mkdtempSync(join(tmpdir(), 'dashi-trial-'));
  const mediaDir = join(dataDir, 'media', orgId);
  mkdirSync(mediaDir, { recursive: true });
  const stamp = new Date().toISOString();
  const hosts = Object.values(doc.podcasts)[0]?.hostIds ?? [];
  doc.podcasts[SERIES_ID] ??= {
    id: SERIES_ID, handle: 'inaminute', title: 'Kestrel in a Minute', description: 'Short slideshow podcasts from around the bay: a voice, some music and a few phone-card slides. Made in the studio.',
    category: 'Society & Culture', language: 'en', type: 'episodic', explicit: false, owner: { name: 'Kestrel Bay Community Foundation', email: 'podcast@kestrelbay.example' },
    cover: null, hostIds: hosts, featured: false, order: Object.keys(doc.podcasts).length, seasons: { 1: { number: 1, title: 'Season 1', description: '' } }, accent: null, links: { website: '', apple: '', spotify: '', youtube: '' },
  };
  const store = (name, samples) => {
    const bytes = wavBytes(samples);
    const mediaId = `media_trial_${name}`;
    writeFileSync(join(mediaDir, mediaId), bytes);
    db.prepare('DELETE FROM media WHERE id = ?').run(mediaId);
    db.prepare('INSERT INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(mediaId, orgId, `${name}.wav`, 'audio/wav', bytes.length, stamp);
    return { mediaId, size: bytes.length };
  };
  let voiced = 0;
  try {
    todo.forEach((show) => { try {
      const i = shows.indexOf(show);
      const ids = trialIds(show.slug);
      let made;
      try { made = makeShow(show, { tool, dir: tmp }); } catch (err) {
        log(`Trial show “${show.title}”: the voice failed (${err.message}), so it is music only.`);
        made = makeShow(show, { tool: null, dir: null });
      }
      if (made.spoken) voiced++;
      const dur = Math.round(made.duration * 10) / 10;
      const mix = store(`${show.slug}`, made.mix);
      const music = store(`${show.slug}-music`, made.music);
      const voice = made.voice ? store(`${show.slug}-voice`, made.voice) : null;
      const file = (id, name, m, extra = {}) => ({ id, name, mediaId: m.mediaId, duration: dur, size: m.size, type: 'audio/wav', origin: 'import', tags: ['trial-show'], createdAt: stamp, createdBy: null, ...extra });
      doc.files[ids.file] = file(ids.file, show.title, mix, { slides: structuredClone(made.slides) });
      doc.files[ids.music] = file(ids.music, `${show.title} · music`, music);
      if (voice) doc.files[ids.voice] = file(ids.voice, `${show.title} · voice`, voice);
      // The session: voice and music on their own tracks, the slides above them.
      const clip = (id, trackId, name, m) => ({ id, trackId, source: { mediaId: m.mediaId }, name, start: 0, offset: 0, length: dur, sourceLength: dur, gain: 1, fadeIn: 0, fadeOut: 0 });
      const tracks = [
        { id: `trk_trial_${show.slug}_voice`, name: 'Voice', kind: 'voice', gain: 1, pan: 0, muted: false, solo: false, duck: false },
        { id: `trk_trial_${show.slug}_music`, name: 'Music', kind: 'music', gain: voice ? 0.55 : 0.9, pan: 0, muted: false, solo: false, duck: !!voice },
      ];
      const clips = { [`clip_trial_${show.slug}_music`]: clip(`clip_trial_${show.slug}_music`, tracks[1].id, 'Music bed', music) };
      if (voice) clips[`clip_trial_${show.slug}_voice`] = clip(`clip_trial_${show.slug}_voice`, tracks[0].id, 'Voice', voice);
      doc.projects[ids.session] = {
        id: ids.session, title: show.title, podcastId: SERIES_ID, episodeId: ids.episode, template: 'slideshow', kind: 'slideshow', view: 'movie',
        tracks, clips, markers: made.chapters.map((c) => ({ id: c.id, at: c.at, title: c.title })), pads: [], slides: structuredClone(made.slides),
        fromFile: ids.file, mixFile: ids.file, trial: true, updatedAt: stamp,
      };
      doc.episodes[ids.episode] = {
        id: ids.episode, podcastId: SERIES_ID, season: 1, number: i + 1, type: 'full', title: show.title, slug: show.slug,
        description: show.blurb, notes: 'A slideshow podcast: press play to watch the slides change with the audio.', transcript: show.slides.map((s) => s.say).join('\n\n'),
        status: 'published', publishedAt: isoDay(-(shows.length - i) * 2), audio: { mediaId: mix.mediaId, duration: Math.round(made.duration), mimetype: 'audio/wav', size: mix.size, name: `${show.slug}.wav` },
        personIds: hosts.slice(0, 1), guests: [], cover: null, explicit: false, chapters: made.chapters, slides: structuredClone(made.slides), tags: ['slideshow'], related: [],
      };
    } catch (err) { log(`Trial show “${show.title}” was skipped: ${err.message}`); } });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  doc.trialShows = { tool: tool ?? 'none', at: stamp };
  db.prepare(`UPDATE docs SET json = ?, version = version + 1, updated_at = ?, updated_by = NULL WHERE org_id = ? AND name = 'podcasts'`).run(JSON.stringify(doc), stamp, orgId);
  const how = voiced ? `voiced with ${tool}` : 'music only (no speech tool found: macOS say, espeak or ffmpeg with flite)';
  const made = todo.filter((sh) => doc.episodes[trialIds(sh.slug).episode]).length;
  return `Trial shows: ${made} of ${todo.length} slideshow podcast${todo.length === 1 ? '' : 's'} for Kestrel Bay, ${how}.`;
}
