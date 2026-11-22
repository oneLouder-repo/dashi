/**
 * The tip harvester (alpha 0.3 PR 20): a formal, re-runnable pipeline that
 * refreshes the tip collection from the source registry (harvestSources.js).
 *
 *   1. discover   pick sources from the registry (all, a theme, or one)
 *   2. fetch      online runs only, done by the server script, politely
 *   3. extract    page HTML to plain text, then sentences
 *   4. score      theme words, words that suggest an action, a readable length
 *   5. dedupe     word-shingle similarity against the library, the queue,
 *                 everything rejected, and each other
 *   6. distil     candidates for review. An offline run uses the registry's
 *                 own summaries; an online run adds short excerpts, marked
 *                 to be rewritten in our own words before they're approved
 *   7. review     a reviewer approves (with words of their own) or rejects
 *
 * Pure: no network, no storage, no DOM, so the server script, the browser
 * and the tests all use it. The tips document it fills (platform-wide):
 *
 *   tips { version, queue: [Candidate], approved: [Tip], rejected: [{ id, at }], runs: [Run] }
 *   Candidate { id, theme, source, text, kind: 'point' | 'excerpt', score, url?, at }
 *   Tip       { id, theme, source, text, visibility: 'public' | 'private', approvedAt, approvedBy? }
 */
import { HARVEST_SOURCES, harvestSourceById, HARVEST_REGISTRY_VERSION } from './harvestSources.js';

export const blankTips = () => ({ version: 1, queue: [], approved: [], rejected: [], runs: [] });

/** Words that say a sentence is about a theme. */
export const THEME_WORDS = {
  network: ['network', 'tie', 'ties', 'connect', 'connection', 'relationship', 'weave', 'weaver', 'cluster', 'hub', 'bridge', 'introduce', 'trust', 'collaborat'],
  leverage: ['leverage', 'system', 'rules', 'goal', 'paradigm', 'mindset', 'feedback', 'information', 'flows', 'intervene', 'structure', 'delay'],
  water: ['policies', 'practices', 'resource flows', 'relationships', 'power', 'mental models', 'conditions', 'systems change', 'decision'],
  abcd: ['asset', 'assets', 'gifts', 'skills', 'association', 'residents', 'community', 'strengths', 'local', 'inside out', 'capacit'],
  soar: ['strength', 'opportunit', 'aspiration', 'results', 'appreciative', 'strategy', 'stakeholder'],
  toc: ['theory of change', 'outcome', 'precondition', 'assumption', 'causal', 'pathway', 'evidence', 'long-term', 'backwards'],
  impact: ['collective impact', 'common agenda', 'shared measurement', 'backbone', 'partners', 'mutually reinforcing', 'communication', 'cross-sector'],
  place: ['place', 'place-based', 'neighbourhood', 'neighborhood', 'residents', 'local', 'community', 'region', 'engagement', 'boundary'],
  hygiene: ['owner', 'deadline', 'measure', 'objective', 'milestone', 'accountab', 'plan', 'review', 'progress'],
  ai: ['artificial intelligence', ' ai ', 'machine learning', 'model', 'data', 'algorithm', 'ethic', 'bias', 'responsible', 'human agency'],
  curriculum: ['curriculum', 'learning outcome', 'lesson', 'assessment', 'standard', 'pathway', 'learner', 'unit', 'design', 'grade'],
  equity: ['equity', 'access', 'barrier', 'underrepresented', 'indigenous', 'inclusion', 'reach', 'missing', 'sovereignty', 'ownership'],
  evaluation: ['evaluation', 'evaluate', 'indicator', 'method', 'findings', 'learning', 'evidence', 'data', 'outcome', 'impact'],
};
/** Words that suggest a sentence tells you what to do. */
const ACTION_WORDS = ['start', 'ask', 'map', 'name', 'bring', 'decide', 'plan', 'design', 'mark', 'test', 'count', 'connect', 'introduce', 'build', 'write', 'agree', 'remove', 'centre', 'center', 'turn', 'spread', 'close', 'should', 'need'];
const STOP = new Set('a an and are as at be but by for from has have in into is it its of on or that the their them then there these this to was were will with you your our we'.split(' '));

/* ------------------------------------------------------------ extract */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
/** A page's HTML as plain text, paragraphs on their own lines. Scripts, styles, menus and footers left out. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|button|select|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|li|h[1-6]|br|section|article|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m))
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n[\n ]*/g, '\n')
    .trim();
}

/** Sentences worth looking at: whole ones, from paragraphs of real prose. */
export function sentences(text) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    if (para.split(' ').length < 8) continue; // menus, headings, captions
    for (const s of para.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []) {
      const t = s.trim();
      if (t.length >= 50 && t.length <= 260 && /^[A-Z“"‘']/.test(t)) out.push(t);
    }
  }
  return out;
}

/* -------------------------------------------------------------- score */

const has = (text, w) => text.includes(w);
/** 0 to 1: how much a sentence looks like a usable tip for a theme. */
export function scoreSentence(s, theme) {
  const t = ` ${s.toLowerCase()} `;
  const themeHits = (THEME_WORDS[theme] ?? []).filter((w) => has(t, w)).length;
  const actionHits = ACTION_WORDS.filter((w) => new RegExp(`\\b${w}`).test(t)).length;
  let score = Math.min(0.5, themeHits * 0.15) + Math.min(0.3, actionHits * 0.1);
  const len = s.length;
  score += len >= 70 && len <= 200 ? 0.2 : 0.05;
  if (/\?$/.test(s.trim())) score -= 0.15; // a question, not a tip
  if (/\b(cookie|subscribe|copyright|click|sign in|log in|newsletter|privacy)\b/i.test(s)) score -= 0.6;
  if (/\(\d{4}\)|et al\.|\[\d+\]/.test(s)) score -= 0.1; // citations
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/* ------------------------------------------------------------- dedupe */

const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
function shingles(s, n = 2) {
  const w = words(s);
  const out = new Set();
  if (w.length < n) { w.forEach((x) => out.add(x)); return out; }
  for (let i = 0; i <= w.length - n; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
/** 0 to 1: how alike two texts are (word pairs in common). */
export function similarity(a, b) {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}

/** A short, stable id for a text (FNV-1a over its words). */
export function textId(text) {
  let h = 0x811c9dc5;
  for (const ch of words(text).join(' ')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `hv-${h.toString(36)}`;
}

/* ------------------------------------------------------------- distil */

/**
 * Run the harvest. `texts` = { sourceId: page text } from an online run's
 * fetches (leave empty for offline). `known` = texts already in the library,
 * queue or rejected, so nothing comes round twice.
 * Returns { candidates, log }.
 */
export function harvest({ sources = HARVEST_SOURCES, texts = {}, known = [], rejectedIds = [], perSource = 3, minScore = 0.45, now = new Date().toISOString(), theme = null, only = null } = {}) {
  const picked = sources.filter((s) => (!theme || s.theme === theme) && (!only || s.id === only));
  const seen = [...known];
  const rejected = new Set(rejectedIds);
  const candidates = [];
  const log = [];
  const fresh = (text) => !rejected.has(textId(text)) && !seen.some((k) => similarity(k, text) >= 0.5);
  for (const src of picked) {
    let points = 0, excerpts = 0, dupes = 0;
    // Offline: the registry's own summaries.
    for (const p of src.points ?? []) {
      if (!fresh(p)) { dupes++; continue; }
      candidates.push({ id: textId(p), theme: src.theme, source: src.id, text: p, kind: 'point', score: scoreSentence(p, src.theme), at: now });
      seen.push(p);
      points++;
    }
    // Online: the best few sentences from the page, as excerpts to rewrite.
    if (texts[src.id]) {
      const ranked = sentences(texts[src.id]).map((s) => [s, scoreSentence(s, src.theme)]).filter(([, sc]) => sc >= minScore).sort((a, b) => b[1] - a[1]);
      for (const [s, sc] of ranked) {
        if (excerpts >= perSource) break;
        if (!fresh(s)) { dupes++; continue; }
        candidates.push({ id: textId(s), theme: src.theme, source: src.id, text: s, kind: 'excerpt', score: sc, url: src.url ?? null, at: now });
        seen.push(s);
        excerpts++;
      }
    }
    log.push({ source: src.id, points, excerpts, dupes, fetched: !!texts[src.id] });
  }
  return { candidates, log };
}

/** Everything a harvest should not offer again: the library's words, the queue, and the approved tips. */
export function knownTexts(doc, builtIn = []) {
  return [...builtIn.map((t) => t.text.replace(/\{\w+\}/g, '')), ...(doc?.queue ?? []).map((c) => c.text), ...(doc?.approved ?? []).map((t) => t.text)];
}

/** Add a harvest to the tips document: new candidates to the queue, and a line in the run log (the last 20). */
export function mergeHarvest(doc, { candidates, log }, { mode = 'offline', now = new Date().toISOString(), by = null } = {}) {
  const have = new Set([...(doc.queue ?? []), ...(doc.approved ?? []), ...(doc.rejected ?? [])].map((x) => x.id));
  const added = candidates.filter((c) => !have.has(c.id));
  doc.queue = [...(doc.queue ?? []), ...added];
  const run = { at: now, mode, registry: HARVEST_REGISTRY_VERSION, sources: log.length, fetched: log.filter((l) => l.fetched).length, offered: candidates.length, added: added.length, by };
  doc.runs = [run, ...(doc.runs ?? [])].slice(0, 20);
  return run;
}

/** An excerpt must be rewritten before approval: our own words, not the source's. */
export const needsRewrite = (cand, text) => cand.kind === 'excerpt' && similarity(cand.text, text) >= 0.6;

/** Approve a candidate (with the reviewer's words): it leaves the queue and joins the library. */
export function approve(doc, id, { text = null, visibility = 'public', by = null, now = new Date().toISOString() } = {}) {
  const c = (doc.queue ?? []).find((x) => x.id === id);
  if (!c) return null;
  const words = String(text ?? c.text).trim();
  if (!words) return null;
  if (needsRewrite(c, words)) throw new Error('Put this one in your own words first: it is still too close to the source.');
  const tip = { id: c.id, theme: c.theme, source: c.source, text: words, visibility: visibility === 'private' ? 'private' : 'public', approvedAt: now, approvedBy: by };
  doc.queue = doc.queue.filter((x) => x.id !== id);
  doc.approved = [tip, ...(doc.approved ?? [])];
  return tip;
}

/** Reject a candidate: it leaves the queue and won't be offered again. */
export function reject(doc, id, { now = new Date().toISOString() } = {}) {
  if (!(doc.queue ?? []).some((x) => x.id === id)) return false;
  doc.queue = doc.queue.filter((x) => x.id !== id);
  doc.rejected = [{ id, at: now }, ...(doc.rejected ?? [])].slice(0, 2000);
  return true;
}

/** Where a candidate or tip came from, in words. */
export const sourceLabel = (id) => {
  const s = harvestSourceById[id];
  return s ? `${s.author}, “${s.title}”${s.year ? ` (${s.year})` : ''}` : id;
};

/** A reading list for a profile: resources in its themes first. */
export function readingFor(profile, { limit = 8 } = {}) {
  const themes = profile?.themes ?? [];
  return HARVEST_SOURCES.filter((s) => s.url).map((s) => [s, themes.indexOf(s.theme)])
    .sort((a, b) => (a[1] < 0) - (b[1] < 0) || a[1] - b[1]).slice(0, limit).map(([s]) => s.id);
}
