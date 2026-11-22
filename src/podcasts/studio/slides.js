/**
 * The studio's slide track (alpha 0.3 PR 17): a triggered slide show that
 * runs along the audio. Each slide starts at a time and shows until the next
 * one, so a 45-minute show can carry a deck of 30 to 50 slides: a title, a
 * point, a quote, a name. Pure functions only (no DOM), so the tests and the
 * server can use them.
 *
 *   Slide { id, at (seconds), title, body, kind: 'title' | 'point' | 'quote' | 'name', tone (hex) }
 *
 * Slides live on a session (project.slides) and, for a sample or a file that
 * already has a deck, on an audio file (file.slides). Opening a file in the
 * studio (sessionFromFile) carries its slides into the new session.
 */
import { WHEEL } from '../../ui/wheel.js';
import { newProject, addClip } from './project.js';

const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const round = (t) => Math.round(t * 10) / 10;
const TONES = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'orchid'].map((id) => WHEEL.find((w) => w.id === id)?.hex).filter(Boolean);

export const SLIDE_KINDS = [
  { id: 'title', label: 'Title' },
  { id: 'point', label: 'Point' },
  { id: 'quote', label: 'Quote' },
  { id: 'name', label: 'Name' },
];

/** Slides in time order, each with when it ends (the next one's start, or the end). */
export function slideSpans(slides = [], end = 0) {
  const s = [...slides].sort((a, b) => a.at - b.at);
  return s.map((x, i) => ({ ...x, until: Math.max(x.at, i + 1 < s.length ? s[i + 1].at : Math.max(end, x.at + 8)) }));
}
/** The slide showing at time t (the last one started), or null before the first. */
export function slideAt(slides = [], t = 0) {
  let hit = null;
  for (const x of slides) if (x.at <= t + 1e-6 && (!hit || x.at >= hit.at)) hit = x;
  return hit;
}

export const addSlide = (slides = [], at, patch = {}) => [...slides, { id: rid('sld'), at: round(Math.max(0, at)), title: 'New slide', body: '', kind: 'point', tone: TONES[slides.length % TONES.length], ...patch }].sort((a, b) => a.at - b.at);
export const updateSlide = (slides = [], id, patch) => slides.map((x) => (x.id === id ? { ...x, ...patch, ...(patch.at != null ? { at: round(Math.max(0, patch.at)) } : {}) } : x)).sort((a, b) => a.at - b.at);
export const removeSlide = (slides = [], id) => slides.filter((x) => x.id !== id);

/** How many slides a sample deck has: 30 to 50 for a long show (about one a minute), fewer for a short clip. */
export function sampleCount(duration) {
  if (duration >= 20 * 60) return Math.max(30, Math.min(50, Math.round(duration / 60)));
  return Math.max(3, Math.min(30, Math.floor(duration / 4)));
}

const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const NAMES = ['Amara Doucette', 'Liam MacIsaac', 'Noor Haddad', 'Marie-Claude Arsenault', 'Jesse Paul', 'Hannah Sock', 'Owen Chisholm', 'Priya Raman'];
/** A small seeded random, so a sample deck is the same every time it's made. */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A sample deck of lorem ipsum slides spread along `duration` seconds, so the
 * slide track can be seen without making one first. The same seed gives the
 * same deck.
 */
export function sampleSlides(duration, { seed = 7, title = 'Social Justice Radio' } = {}) {
  const n = sampleCount(duration);
  const r = rng(seed);
  const words = (k) => Array.from({ length: k }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
  const step = duration / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    // Evenly spread, nudged a little so it reads like a real show, never before 0 or past the end.
    const at = i === 0 ? 0 : Math.min(duration - 1, Math.max(0, step * i + (r() - 0.5) * step * 0.5));
    const kind = i === 0 || i === n - 1 ? 'title' : i % 7 === 3 ? 'quote' : i % 9 === 5 ? 'name' : 'point';
    const slide = {
      id: `sld_s${seed}_${i}`, at: round(at), kind, tone: TONES[i % TONES.length],
      title: i === 0 ? title : i === n - 1 ? 'Thanks for listening' : kind === 'name' ? NAMES[i % NAMES.length] : cap(words(2 + Math.floor(r() * 3))),
      body: i === 0 ? 'Lorem ipsum dolor sit amet: a sample slide show along this episode.' : i === n - 1 ? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' : kind === 'quote' ? `“${cap(words(8 + Math.floor(r() * 6)))}.”` : kind === 'name' ? cap(words(3)) : `${cap(words(9 + Math.floor(r() * 8)))}.`,
    };
    out.push(slide);
  }
  return out;
}

/** Give the longest podBeam file a sample deck, unless some file already has slides. Changes doc; true if it did. */
export function seedSampleSlides(doc, { title } = {}) {
  const files = Object.values(doc.files ?? {});
  if (files.some((f) => f.slides?.length)) return false;
  const pick = files.filter((f) => (f.tags ?? []).includes('podBeam') && f.duration > 0).sort((a, b) => b.duration - a.duration)[0];
  if (!pick) return false;
  pick.slides = sampleSlides(pick.duration, { title });
  return true;
}

/**
 * A session made from one audio file (the audio files' "Open in the studio"):
 * the file on one track from the start, with its slide show if it has one.
 * Marked with fromFile, so opening the file again goes back to the same session.
 */
export function sessionFromFile(file, { podcastId = null } = {}) {
  let p = newProject({ title: file.name, template: 'solo', podcastId });
  p = addClip(p, { trackId: p.tracks[0].id, source: { mediaId: file.mediaId }, name: file.name, start: 0, offset: 0, length: Math.max(1, file.duration || 1) });
  delete p.lastId;
  return { ...p, fromFile: file.id, slides: structuredClone(file.slides ?? []) };
}
