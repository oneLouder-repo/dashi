/**
 * Find a slideshow in the podcasts document, for the player or another
 * plugin (Learn's cartridge blocks hold a reference, never a copy).
 *
 *   showFor(doc, ref, { mediaUrl }) → Show | null
 *     ref = { type: 'episode' | 'session' | 'file', id }   (or { plugin: 'podcasts', type, id })
 *
 * Where the audio comes from:
 *   episode  its audio (an upload or a link) and episode.slides
 *   file     the audio file itself and file.slides
 *   session  a studio session: the episode it was sent to if there is one,
 *            else the audio file it was opened from, else its first clip's sound
 *
 * `mediaUrl(id)` turns a stored media id into a URL; it defaults to the
 * hosted address (/media/<id>). In the browser, pass platform/media.js's
 * mediaUrl, which also knows local media (it returns a promise).
 */
import { showOf } from './format.js';

const hosted = (id) => `/media/${encodeURIComponent(id)}`;
const urlOf = (audio, mediaUrl) => (audio?.mediaId ? mediaUrl(audio.mediaId) : audio?.url ?? null);

export function showFor(doc, ref, { mediaUrl = hosted } = {}) {
  if (!doc || !ref?.id) return null;
  const type = ref.type ?? 'episode';
  if (type === 'episode') {
    const e = doc.episodes?.[ref.id];
    if (!e) return null;
    return showOf({ id: e.id, title: e.title, duration: e.audio?.duration ?? 0, audio: e.audio ? { mediaId: e.audio.mediaId ?? null, url: e.audio.url ?? null } : null, audioUrl: urlOf(e.audio, mediaUrl), slides: e.slides ?? [] });
  }
  if (type === 'file') {
    const f = doc.files?.[ref.id];
    if (!f) return null;
    return showOf({ id: f.id, title: f.name, duration: f.duration ?? 0, audio: { mediaId: f.mediaId }, audioUrl: urlOf({ mediaId: f.mediaId }, mediaUrl), slides: f.slides ?? [] });
  }
  if (type === 'session') {
    const p = doc.projects?.[ref.id];
    if (!p) return null;
    const ep = p.episodeId && doc.episodes?.[p.episodeId];
    const file = p.fromFile && doc.files?.[p.fromFile];
    const mix = p.mixFile && doc.files?.[p.mixFile];
    const clip = Object.values(p.clips ?? {}).sort((a, b) => a.start - b.start)[0];
    const audio = ep?.audio ?? (mix ? { mediaId: mix.mediaId } : file ? { mediaId: file.mediaId } : clip?.source?.mediaId ? { mediaId: clip.source.mediaId } : clip?.source?.url ? { url: clip.source.url } : null);
    const duration = ep?.audio?.duration ?? mix?.duration ?? file?.duration ?? Math.max(0, ...Object.values(p.clips ?? {}).map((c) => c.start + c.length));
    return showOf({ id: p.id, title: p.title, duration, audio, audioUrl: urlOf(audio, mediaUrl), slides: p.slides ?? [] });
  }
  return null;
}

/** Every slideshow in the document (episodes, files and sessions with slides), for pickers. */
export function listShows(doc) {
  const out = [];
  for (const e of Object.values(doc?.episodes ?? {})) if (e.slides?.length) out.push({ type: 'episode', id: e.id, title: e.title, slides: e.slides.length, duration: e.audio?.duration ?? 0 });
  for (const p of Object.values(doc?.projects ?? {})) if (p.slides?.length) out.push({ type: 'session', id: p.id, title: p.title, slides: p.slides.length, duration: 0 });
  for (const f of Object.values(doc?.files ?? {})) if (f.slides?.length) out.push({ type: 'file', id: f.id, title: f.name, slides: f.slides.length, duration: f.duration ?? 0 });
  return out;
}
