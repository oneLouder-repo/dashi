/**
 * Slideshow podcasts: the data shape (alpha 0.3, "slideshow podcasts").
 *
 * A slideshow is a podcast's audio with a deck of phone-card slides timed
 * along it, like a tiny film. The same shape is used by the studio's editor,
 * the embeddable player (player.js), episodes on the station, and blocks in
 * Learn cartridges. Pure functions only (no DOM), so the server, the tests
 * and other plugins can use them. Full write-up: docs/SLIDESHOW.md.
 *
 *   Show  { format: 'dashi.slideshow', version: 1, id, title, duration, audioUrl, slides: [Slide] }
 *
 *   Slide {
 *     id, at,              seconds into the audio; shows until the next slide's `at`
 *     kind,                'title' | 'point' | 'quote' | 'name' | 'story' | 'data'  (a layout hint)
 *     title, subtitle,     plain text
 *     blocks: [Block],     the body, top to bottom (a few hundred words and two images at most)
 *     tone,                accent colour (hex)
 *     bg: { colour, image, overlay },   card colour; optional picture (url) behind or as a banner; 0–1 shade over it
 *     banner,              true: the picture is a banner across the top; false: it fills the card
 *     ink,                 text colour (hex), or null to work it out from the background
 *     transition: { type, ms },   how this slide arrives: 'cut' | 'fade' | 'slide' | 'push' | 'zoom' | 'wipe'
 *     notes,               speaker notes or the words said under it (plain text)
 *   }
 *
 *   Block
 *     { id, type: 'text',    html }                       formatted words (see sanitiseInline)
 *     { id, type: 'bullets', items: [html], ordered }     a list
 *     { id, type: 'image',   src, alt, caption }          a picture
 *     { id, type: 'card',    card: { kind, label, value, note } }   a data card: 'stat' | 'quote' | 'progress' | 'callout'
 *
 * Older slides ({ id, at, title, body, kind, tone }, alpha 0.3 PR 17) are
 * upgraded by normaliseSlide(): the body becomes a text block.
 */
import { WHEEL, INK, inkOn } from '../../ui/wheel.js';

export const FORMAT = 'dashi.slideshow';
export const VERSION = 1;

/** A phone card's room: a few hundred words, two pictures. */
export const LIMITS = { words: 300, images: 2, blocks: 8 };

export const KINDS = [
  { id: 'title', label: 'Title', blurb: 'Big words, the start of a part' },
  { id: 'point', label: 'Point', blurb: 'A heading and a few lines' },
  { id: 'story', label: 'Story', blurb: 'A short story with a picture' },
  { id: 'data', label: 'Data', blurb: 'A number that matters' },
  { id: 'quote', label: 'Quote', blurb: 'Someone’s words' },
  { id: 'name', label: 'Name', blurb: 'Who is speaking' },
];

export const TRANSITIONS = [
  { id: 'cut', label: 'Cut', ms: 0 },
  { id: 'fade', label: 'Fade', ms: 500 },
  { id: 'slide', label: 'Slide', ms: 550 },
  { id: 'push', label: 'Push', ms: 550 },
  { id: 'zoom', label: 'Zoom', ms: 500 },
  { id: 'wipe', label: 'Wipe', ms: 600 },
];
const TRANSITION_IDS = new Set(TRANSITIONS.map((t) => t.id));

export const CARD_KINDS = [
  { id: 'stat', label: 'Number', blurb: 'A big figure and what it counts' },
  { id: 'progress', label: 'Progress', blurb: 'How far along, as a bar' },
  { id: 'quote', label: 'Quote', blurb: 'A line someone said' },
  { id: 'callout', label: 'Callout', blurb: 'A note that stands out' },
];

export const BLOCK_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'bullets', label: 'Bullets' },
  { id: 'image', label: 'Picture' },
  { id: 'card', label: 'Data card' },
];

/** The card colours: the wheel, plus white and Dashi's black. */
export const SWATCHES = ['#ffffff', ...WHEEL.map((w) => w.hex), '#f4f1ea', INK];

const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const round = (t) => Math.round(t * 10) / 10;
const str = (v) => (v == null ? '' : String(v));

/* ------------------------------------------------------------ safe words */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s) => str(s).replace(/[&<>"]/g, (c) => ESC[c]);
const KEEP = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', br: 'br', a: 'a' };
const SAFE_HREF = /^(https?:|mailto:|tel:|#)/i;

/**
 * Formatted words, kept to bold, italic, underline, links and line breaks.
 * Any other tag is dropped (its words kept), attributes other than a safe
 * link address are dropped, and loose < > & are escaped. Works without a DOM.
 */
export function sanitiseInline(html) {
  const s = str(html);
  let out = '';
  const open = [];
  const re = /<(\/?)([a-z][a-z0-9]*)\b([^<>]*)>|([^<]+)|(<)/gi;
  let m;
  while ((m = re.exec(s))) {
    // Scripts and styles go, words and all.
    if (m[2] && !m[1] && /^(script|style)$/i.test(m[2])) { const close = new RegExp(`</${m[2]}\\s*>`, 'i').exec(s.slice(re.lastIndex)); re.lastIndex = close ? re.lastIndex + close.index + close[0].length : s.length; continue; }
    if (m[4] != null) { out += m[4].replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+|nbsp);)/gi, '&amp;').replace(/>/g, '&gt;'); continue; }
    if (m[5]) { out += '&lt;'; continue; }
    const closing = !!m[1];
    const tag = KEEP[m[2].toLowerCase()];
    // Block tags become line breaks, so a pasted paragraph keeps its shape.
    if (!tag) { if (!closing && /^(p|div|li|h[1-6])$/i.test(m[2]) && out && !out.endsWith('<br>')) out += '<br>'; continue; }
    if (tag === 'br') { if (!closing) out += '<br>'; continue; }
    if (closing) {
      const i = open.lastIndexOf(tag);
      if (i < 0) continue;
      while (open.length > i) out += `</${open.pop()}>`;
      continue;
    }
    if (tag === 'a') {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const url = (href?.[2] ?? href?.[3] ?? href?.[4] ?? '').trim();
      if (!SAFE_HREF.test(url)) continue;
      out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">`;
    } else out += `<${tag}>`;
    open.push(tag);
  }
  while (open.length) out += `</${open.pop()}>`;
  return out.replace(/^(<br>)+|(<br>)+$/g, '');
}

/** The plain words in some formatted words. */
export const textOf = (html) => str(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const countWords = (s) => (str(s).trim() ? str(s).trim().split(/\s+/).length : 0);

/* ------------------------------------------------------------ blocks */
export function newBlock(type, patch = {}) {
  const id = rid('blk');
  if (type === 'bullets') return { id, type, items: ['First point', 'Second point'], ordered: false, ...patch };
  if (type === 'image') return { id, type, src: '', alt: '', caption: '', ...patch };
  if (type === 'card') return { id, type, card: { kind: 'stat', label: 'people reached', value: '120', note: '', ...(patch.card ?? {}) } };
  return { id, type: 'text', html: 'A few words.', ...patch };
}

function normaliseBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const id = b.id || rid('blk');
  if (b.type === 'bullets') return { id, type: 'bullets', items: (Array.isArray(b.items) ? b.items : []).map(sanitiseInline).filter((x) => x !== ''), ordered: !!b.ordered };
  if (b.type === 'image') return { id, type: 'image', src: str(b.src), alt: str(b.alt), caption: str(b.caption) };
  if (b.type === 'card') {
    const c = b.card ?? {};
    const kind = CARD_KINDS.some((k) => k.id === c.kind) ? c.kind : 'stat';
    return { id, type: 'card', card: { kind, label: str(c.label), value: str(c.value), note: str(c.note) } };
  }
  if (b.type === 'text') return { id, type: 'text', html: sanitiseInline(b.html) };
  return null;
}

/* ------------------------------------------------------------ slides */
const TONES = ['blue', 'teal', 'green', 'amber', 'orange', 'red', 'orchid', 'violet'].map((id) => WHEEL.find((w) => w.id === id).hex);
export const toneFor = (n) => TONES[((n % TONES.length) + TONES.length) % TONES.length];

/**
 * Any slide, old or new, as a full Slide. Missing parts get their defaults,
 * words are made safe, and an old `body` becomes a text block.
 */
export function normaliseSlide(s = {}, n = 0) {
  const kind = KINDS.some((k) => k.id === s.kind) ? s.kind : 'point';
  const tone = /^#[0-9a-f]{6}$/i.test(s.tone ?? '') ? s.tone : toneFor(n);
  let blocks = Array.isArray(s.blocks) ? s.blocks.map(normaliseBlock).filter(Boolean) : null;
  if (!blocks) blocks = s.body ? [{ id: `${s.id ?? 'sld'}_body`, type: 'text', html: escapeHtml(s.body) }] : [];
  // Old slides were solid colour cards: their tone was the card.
  const bg = s.bg && typeof s.bg === 'object' ? s.bg : { colour: s.blocks ? '#ffffff' : tone };
  const tr = s.transition && TRANSITION_IDS.has(s.transition.type) ? s.transition : { type: 'fade' };
  return {
    id: s.id || rid('sld'),
    at: round(Math.max(0, Number(s.at) || 0)),
    kind,
    title: str(s.title),
    subtitle: str(s.subtitle),
    blocks: blocks.slice(0, LIMITS.blocks),
    tone,
    bg: { colour: /^#[0-9a-f]{3,8}$/i.test(bg.colour ?? '') ? bg.colour : '#ffffff', image: bg.image ? str(bg.image) : null, overlay: Math.max(0, Math.min(1, Number(bg.overlay ?? (bg.image ? 0.35 : 0)))) },
    banner: s.banner == null ? true : !!s.banner,
    ink: /^#[0-9a-f]{3,8}$/i.test(s.ink ?? '') ? s.ink : null,
    transition: { type: tr.type, ms: Math.max(0, Math.min(2000, Number(tr.ms ?? TRANSITIONS.find((t) => t.id === tr.type).ms))) },
    notes: str(s.notes),
  };
}
export const normaliseSlides = (slides = []) => [...slides].map(normaliseSlide).sort((a, b) => a.at - b.at);

/** A new slide at `at` seconds. */
export function newSlide(at = 0, patch = {}, n = 0) {
  return normaliseSlide({ id: rid('sld'), at, kind: 'point', title: 'New slide', subtitle: '', blocks: [newBlock('text')], bg: { colour: '#ffffff' }, transition: { type: 'fade' }, ...patch }, n);
}

/** The colour for words on this slide: the one chosen, or black or white to suit the card. */
export function inkFor(slide) {
  if (slide.ink) return slide.ink;
  if (slide.bg?.image && !slide.banner) return '#ffffff';
  return inkOn(slide.bg?.colour ?? '#ffffff');
}

/** How full a slide is: words and pictures against the card's room. */
export function budget(slide) {
  const s = normaliseSlide(slide);
  let words = countWords(s.title) + countWords(s.subtitle);
  let images = s.bg.image && s.banner ? 1 : 0;
  for (const b of s.blocks) {
    if (b.type === 'text') words += countWords(textOf(b.html));
    else if (b.type === 'bullets') words += b.items.reduce((n, x) => n + countWords(textOf(x)), 0);
    else if (b.type === 'image') { images++; words += countWords(b.caption); }
    else if (b.type === 'card') words += countWords(`${b.card.label} ${b.card.value} ${b.card.note}`);
  }
  return { words, images, blocks: s.blocks.length, over: words > LIMITS.words || images > LIMITS.images || s.blocks.length > LIMITS.blocks };
}

/** Can another block of this type go on the slide? */
export function canAdd(slide, type) {
  const b = budget(slide);
  if (b.blocks >= LIMITS.blocks) return false;
  if (type === 'image') return b.images < LIMITS.images;
  return b.words < LIMITS.words;
}

/* ------------------------------------------------------------ edits (each returns a new slide list) */
const mapSlide = (slides, id, fn) => slides.map((s) => (s.id === id ? fn(structuredClone(s)) : s));
export const patchSlide = (slides, id, patch) => normaliseSlides(mapSlide(slides, id, (s) => ({ ...s, ...patch })));
export const addBlock = (slides, id, block, after = null) => mapSlide(slides, id, (s) => {
  const i = after ? s.blocks.findIndex((b) => b.id === after) : -1;
  s.blocks.splice(i < 0 ? s.blocks.length : i + 1, 0, block);
  return normaliseSlide(s);
});
export const patchBlock = (slides, id, blockId, patch) => mapSlide(slides, id, (s) => {
  s.blocks = s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch, ...(patch.card ? { card: { ...b.card, ...patch.card } } : {}) } : b));
  return normaliseSlide(s);
});
export const removeBlock = (slides, id, blockId) => mapSlide(slides, id, (s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) }));
export const moveBlock = (slides, id, blockId, dir) => mapSlide(slides, id, (s) => {
  const i = s.blocks.findIndex((b) => b.id === blockId), j = i + dir;
  if (i >= 0 && j >= 0 && j < s.blocks.length) [s.blocks[i], s.blocks[j]] = [s.blocks[j], s.blocks[i]];
  return s;
});
/** A copy of a slide just after it (halfway to the next one). */
export function duplicateSlide(slides, id, end = 0) {
  const sorted = normaliseSlides(slides);
  const i = sorted.findIndex((s) => s.id === id);
  if (i < 0) return sorted;
  const s = sorted[i];
  const next = sorted[i + 1]?.at ?? Math.max(end, s.at + 8);
  const copy = { ...structuredClone(s), id: rid('sld'), at: round(s.at + (next - s.at) / 2), blocks: s.blocks.map((b) => ({ ...structuredClone(b), id: rid('blk') })) };
  return normaliseSlides([...sorted, copy]);
}
/**
 * Swap a slide with the one before (-1) or after (+1), keeping the timing:
 * the words and look move, each time slot stays where it was.
 */
export function swapSlide(slides, id, dir) {
  const sorted = normaliseSlides(slides);
  const i = sorted.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return sorted;
  const a = sorted[i].at, b = sorted[j].at;
  sorted[i] = { ...sorted[i], at: b };
  sorted[j] = { ...sorted[j], at: a };
  return normaliseSlides(sorted);
}

/* ------------------------------------------------------------ playing */
/** Slides in order with when each ends (the next one's start, or the end of the audio). */
export function spans(slides = [], end = 0) {
  const s = normaliseSlides(slides);
  return s.map((x, i) => ({ ...x, until: Math.max(x.at, i + 1 < s.length ? s[i + 1].at : Math.max(end, x.at + 8)) }));
}
/** The index of the slide showing at t, or -1 before the first. */
export function indexAt(sorted, t) {
  let hit = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].at <= t + 1e-6) hit = i;
  return hit;
}
/**
 * What the screen shows at t: the slide, the one before it, and how far
 * through its arriving transition it is (0 to 1; 1 once it has arrived).
 */
export function frameAt(sorted, t) {
  const i = indexAt(sorted, t);
  if (i < 0) return { index: -1, slide: null, prev: null, p: 1 };
  const s = sorted[i];
  const ms = s.transition?.type === 'cut' ? 0 : s.transition?.ms ?? 0;
  const p = ms > 0 ? Math.min(1, Math.max(0, ((t - s.at) * 1000) / ms)) : 1;
  return { index: i, slide: s, prev: i > 0 ? sorted[i - 1] : null, p };
}

/* ------------------------------------------------------------ out */
/** A show, ready to play or hand to another plugin. */
export function showOf({ id, title = '', duration = 0, audioUrl = null, audio = null, slides = [] }) {
  return { format: FORMAT, version: VERSION, id, title: str(title), duration: Math.max(0, Number(duration) || 0), audioUrl, audio, slides: normaliseSlides(slides) };
}

/**
 * The show as an xAPI activity definition (for an LRS, a cmi5 package or
 * Moodle). A start: the full plan is in docs/SLIDESHOW.md.
 */
export function xapiActivity(show, base = 'https://dashi.app/xapi') {
  const id = `${base.replace(/\/$/, '')}/slideshow/${encodeURIComponent(show.id)}`;
  return {
    id,
    objectType: 'Activity',
    definition: {
      type: 'http://adlnet.gov/expapi/activities/media',
      name: { en: show.title },
      description: { en: `${show.slides.length} slides, ${Math.round(show.duration)} seconds` },
      extensions: { 'https://dashi.app/xapi/ext/slides': show.slides.map((s) => ({ id: s.id, at: s.at, title: s.title })) },
    },
  };
}

/* ------------------------------------------------------------ checks */
const rgbOf = (hex) => {
  let x = str(hex).replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0);
};
const lum = (hex) => { const [r, g, b] = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

/**
 * Accessibility and fit checks for one slide, shown beside the editor:
 * [{ level: 'warn' | 'tip', text }]. Contrast follows WCAG AA for large
 * type (3:1) on titles and normal type (4.5:1) on body words.
 */
export function checks(slide) {
  const s = normaliseSlide(slide);
  const out = [];
  const b = budget(s);
  if (b.words > LIMITS.words) out.push({ level: 'warn', text: `${b.words} words: a phone card holds about ${LIMITS.words}. Split it into two slides.` });
  if (b.images > LIMITS.images) out.push({ level: 'warn', text: `${b.images} pictures: keep it to ${LIMITS.images}.` });
  if (!s.bg.image || s.banner) {
    const r = contrast(inkFor(s), s.bg.colour);
    if (r < 3) out.push({ level: 'warn', text: `The words are hard to read on this colour (contrast ${r.toFixed(1)}:1). Choose another text colour.` });
    else if (r < 4.5 && s.blocks.length) out.push({ level: 'tip', text: `Body text contrast is ${r.toFixed(1)}:1; 4.5:1 reads better for everyone.` });
  } else if (s.bg.overlay < 0.25) out.push({ level: 'tip', text: 'Words over a photo: a darker shade (0.3 or more) keeps them readable.' });
  for (const x of s.blocks) if (x.type === 'image' && x.src && !x.alt.trim()) { out.push({ level: 'warn', text: 'A picture has no description (alt text) for people who can’t see it.' }); break; }
  if (!s.title.trim()) out.push({ level: 'tip', text: 'No title: a title helps people follow along and find their place.' });
  if (!s.notes.trim()) out.push({ level: 'tip', text: 'No notes: the words said under a slide make a transcript for people who can’t hear it.' });
  return out;
}
