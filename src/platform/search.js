import { NODE_TYPES } from './strategy.js';
import { linkTo } from '../plugins.js';

/**
 * Org-wide search: one list of everything an organisation has written down,
 * across its plugins, so a keyword finds a map actor, a task, a reading, a
 * person or a page in one go.
 *
 *   const index = buildIndex(docs, { plugins })   docs as loadAll() gives them
 *   search(index, 'food security tag:north')      -> [{ entry, score, snippet }]
 *
 * An entry: { id, kind, group, title, text, tags, href, sub, icon }.
 * `tag:x` narrows to entries tagged x; `in:maps` (or people, strategy,
 * library, assets, podcasts, pages) narrows to one group.
 */
export const GROUPS = [
  { id: 'maps', label: 'Ecosystem maps', icon: 'sec-mapper', plugin: 'mapper' },
  { id: 'strategy', label: 'Strategy & work', icon: 'sec-strategy', plugin: 'strategy' },
  { id: 'library', label: 'Library', icon: 'sec-library', plugin: 'library' },
  { id: 'assets', label: 'Assets', icon: 'sec-assets', plugin: 'assets' },
  { id: 'people', label: 'People', icon: 'person' },
  { id: 'podcasts', label: 'Listen', icon: 'sec-podcasts', plugin: 'podcasts' },
  { id: 'pages', label: 'Web pages', icon: 'sec-sites', plugin: 'pages' },
  // Help is searched from its own index (buildHelpIndex), never mixed into the org's.
  { id: 'help', label: 'Help', icon: 'help', separate: true },
];
export const groupById = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

const plain = (s) => String(s ?? '').replace(/[#*_>`~|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
// Lower case without accents, one character for one, so positions in the folded text match the original.
const words = (s) => [...String(s ?? '')].map((ch) => { const f = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return f.length === ch.length ? f : ch.toLowerCase(); }).join('');

export function buildIndex(docs = {}, { plugins = null } = {}) {
  const on = (g) => !groupById[g].plugin || !plugins || plugins.has(groupById[g].plugin);
  const out = [];
  const add = (e) => out.push({ tags: [], text: '', sub: '', ...e, hay: words([e.title, e.text, e.sub, ...(e.tags ?? [])].join(' ')) });

  if (on('maps')) {
    for (const [mapId, entry] of Object.entries(docs.maps?.maps ?? {})) {
      const m = docs.mapContents?.[mapId] ?? {};
      add({ id: `map:${mapId}`, kind: 'Map', group: 'maps', title: entry.title || 'Untitled map', text: entry.description ?? '', href: linkTo('mapper', `#${mapId}`), icon: 'sec-mapper', sub: `${Object.keys(m.actors ?? {}).length} actors` });
      for (const a of Object.values(m.actors ?? {})) {
        add({ id: `actor:${mapId}/${a.id}`, kind: a.kind === 'agent' ? 'Agent' : 'Actor', group: 'maps', title: a.label || 'Untitled', text: [a.meta?.description, a.meta?.notes, ...Object.values(a.meta?.facts ?? {})].filter(Boolean).join(' · '), tags: a.tags ?? [], href: linkTo('mapper', `#${mapId}/${a.id}`), icon: a.kind === 'agent' ? 'agent' : 'actor', sub: entry.title });
      }
      for (const c of Object.values(m.connectors ?? {})) {
        if (!c.label && !c.meta?.notes) continue;
        const from = m.actors?.[c.from?.actorId]?.label, to = m.actors?.[c.to?.actorId]?.label;
        add({ id: `conn:${mapId}/${c.id}`, kind: 'Link', group: 'maps', title: c.label || `${from ?? '?'} → ${to ?? '?'}`, text: [from && to ? `${from} → ${to}` : '', c.meta?.notes].filter(Boolean).join(' · '), href: linkTo('mapper', `#${mapId}/${c.id}`), icon: 'connect', sub: entry.title });
      }
      for (const g of Object.values(m.groups ?? {})) {
        add({ id: `group:${mapId}/${g.id}`, kind: 'Group', group: 'maps', title: g.label || g.name || 'Group', text: g.meta?.notes ?? '', href: linkTo('mapper', `#${mapId}/${g.id}`), icon: 'collection', sub: entry.title });
      }
    }
  }
  if (on('strategy')) {
    for (const n of Object.values(docs.strategy?.nodes ?? {})) {
      add({ id: `node:${n.id}`, kind: NODE_TYPES[n.type]?.label ?? 'Item', group: 'strategy', title: n.title || 'Untitled', text: [n.notes, n.description, ...(n.measures ?? []).map((m) => m.name)].filter(Boolean).join(' · '), tags: n.tags ?? [], href: linkTo('strategy', `#${n.id}`), icon: n.type === 'task' ? 'checklist' : 'sec-strategy', sub: docs.strategy.nodes[n.parentId]?.title ?? '', due: n.end ?? n.due ?? null, status: n.status ?? null, ownerId: n.ownerId ?? null });
    }
  }
  if (on('library')) {
    for (const it of Object.values(docs.library?.items ?? {})) {
      const m = it.meta ?? {};
      const authors = (m.creators ?? []).map((c) => c.literal ?? [c.given, c.family].filter(Boolean).join(' ')).join(', ');
      add({ id: `lib:${it.id}`, kind: it.kind === 'doc' ? 'Dashi doc' : it.kind === 'file' ? 'Document' : 'Reference', group: 'library', title: m.title || it.file?.name || 'Untitled',
        text: [authors, m.abstract, plain(it.body), ...(it.notes ?? []).flatMap((x) => [x.quote, x.text])].filter(Boolean).join(' · '), tags: [...(it.tags ?? []), ...(m.keywords ?? [])], href: linkTo('library', `#item/${it.id}`), icon: it.kind === 'doc' ? 'notePencil' : 'book', sub: [authors, (m.issued ?? '').slice(0, 4)].filter(Boolean).join(' · ') });
    }
    for (const b of Object.values(docs.library?.bibs ?? {})) {
      add({ id: `bib:${b.id}`, kind: 'Bibliography', group: 'library', title: b.title, text: [b.description, ...Object.values(b.annotations ?? {}).map((a) => a.text)].filter(Boolean).join(' · '), href: linkTo('library', `#bib/${b.id}`), icon: 'news', sub: `${b.itemIds?.length ?? 0} sources` });
    }
  }
  if (on('assets')) {
    for (const it of Object.values(docs.assets?.items ?? {})) {
      if (it.kind === 'ref') continue; // notes on Dashi things are found with the thing itself
      add({ id: `asset:${it.id}`, kind: it.kind === 'file' ? 'File' : it.kind === 'link' ? 'Link' : 'Note', group: 'assets', title: it.title || it.file?.name || 'Untitled', text: [it.description, it.text, it.file?.name, it.url].filter(Boolean).join(' · '), tags: it.tags ?? [], href: linkTo('assets', `#key=${encodeURIComponent(it.id)}`), icon: it.kind === 'file' ? 'file' : it.kind === 'link' ? 'link' : 'note' });
    }
  }
  for (const s of Object.values(docs.org?.staff ?? {})) {
    add({ id: `staff:${s.id}`, kind: 'Person', group: 'people', title: s.name, text: [s.title, s.bio, s.email].filter(Boolean).join(' · '), href: `org.html#people/${s.id}`, icon: 'person', sub: s.title ?? '', person: s });
  }
  if (on('podcasts')) {
    for (const p of Object.values(docs.podcasts?.podcasts ?? {})) add({ id: `show:${p.id}`, kind: 'Series', group: 'podcasts', title: p.title || 'Untitled series', text: p.description ?? '', href: linkTo('podcasts', `#series/${p.id}`), icon: 'sec-podcasts' });
    for (const e of Object.values(docs.podcasts?.episodes ?? {})) add({ id: `ep:${e.id}`, kind: 'Episode', group: 'podcasts', title: e.title || 'Untitled episode', tags: e.tags ?? [], text: [e.summary, e.description, e.notes, e.transcript, ...(e.chapters ?? []).map((c) => c.title)].filter(Boolean).join(' · '), href: linkTo('podcasts', `#episodes/${e.id}`), icon: 'music', sub: docs.podcasts.podcasts?.[e.podcastId]?.title ?? '' });
  }
  if (on('pages')) {
    for (const p of Object.values(docs.pages?.pages ?? {})) add({ id: `page:${p.id}`, kind: p.kind === 'article' ? 'News article' : 'Page', group: 'pages', title: p.title || 'Untitled', text: [p.summary, plain(p.body)].filter(Boolean).join(' · '), href: linkTo('pages', `#${p.id}`), icon: 'fileText' });
  }
  return out;
}

/**
 * The help library as a search index of its own: one entry per section and
 * per page. It is built from the platform's help, not from any org document,
 * and kept apart from buildIndex so help never joins the org's data, maps or
 * graph (and org data never shows up in help).
 */
export function buildHelpIndex(help) {
  const out = [];
  const clean = (md) => plain(String(md ?? '').replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^- \[[ x]\] /gim, ''));
  const add = (e) => out.push({ tags: [], sub: '', ...e, group: 'help', icon: e.icon || 'help', hay: words([e.title, e.text, e.sub].join(' ')) });
  for (const s of help?.sections ?? []) {
    add({ id: `help:${s.id}`, kind: 'Help section', title: s.title, text: clean(s.blurb), href: `help.html#${encodeURIComponent(s.id)}`, icon: s.icon, sub: `${s.pages?.length ?? 0} guides` });
    for (const p of s.pages ?? []) {
      add({ id: `help:${s.id}/${p.id}`, kind: 'Help', title: p.title, text: clean(p.body), href: `help.html#${encodeURIComponent(s.id)}/${encodeURIComponent(p.id)}`, sub: s.title });
    }
  }
  return out;
}

/** A short piece of text around the first match, with the matches marked: [{ t, hit }]. */
export function snippet(text, terms, len = 150) {
  const src = String(text ?? '');
  if (!src) return [];
  const low = words(src);
  let at = -1;
  for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = at < 0 ? 0 : Math.max(0, at - Math.round(len / 3));
  let piece = src.slice(start, start + len);
  if (start > 0) piece = `…${piece.replace(/^\S*\s/, '')}`;
  if (start + len < src.length) piece = `${piece.replace(/\s\S*$/, '')}…`;
  const re = terms.length ? new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null;
  if (!re) return [{ t: piece, hit: false }];
  // Match on the accent-free form, keep the original letters.
  const lowPiece = words(piece);
  const out = [];
  let last = 0;
  for (const m of lowPiece.matchAll(re)) {
    if (m.index > last) out.push({ t: piece.slice(last, m.index), hit: false });
    out.push({ t: piece.slice(m.index, m.index + m[0].length), hit: true });
    last = m.index + m[0].length;
  }
  if (last < piece.length) out.push({ t: piece.slice(last), hit: false });
  return out;
}

/** Parse a query into free terms, tags and a group. */
export function parseQuery(q) {
  const out = { terms: [], tags: [], group: null };
  for (const raw of String(q ?? '').trim().split(/\s+/).filter(Boolean)) {
    const w = words(raw);
    if (w.startsWith('tag:') && w.length > 4) out.tags.push(w.slice(4).replace(/^#/, ''));
    else if (w.startsWith('#') && w.length > 1) out.tags.push(w.slice(1));
    else if (w.startsWith('in:') && groupById[w.slice(3)]) out.group = w.slice(3);
    else out.terms.push(w.replace(/[^\p{L}\p{N}'’-]/gu, ''));
  }
  out.terms = out.terms.filter(Boolean);
  return out;
}

/** Results, best first. Every term must appear; titles count most, then tags, then text. */
export function search(index, q, { limit = 200 } = {}) {
  const { terms, tags, group } = parseQuery(q);
  if (!terms.length && !tags.length) return [];
  const results = [];
  for (const e of index) {
    if (group && e.group !== group) continue;
    const etags = e.tags.map((t) => words(t));
    if (tags.length && !tags.every((t) => etags.some((x) => x.startsWith(t)))) continue;
    if (!terms.every((t) => e.hay.includes(t))) continue;
    const title = words(e.title);
    let score = 0;
    for (const t of terms) {
      if (title === t) score += 30;
      else if (title.startsWith(t)) score += 18;
      else if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) score += 12;
      else if (title.includes(t)) score += 8;
      if (etags.some((x) => x === t)) score += 6;
      if (words(e.text).includes(t)) score += 2;
    }
    if (terms.length > 1 && title.includes(terms.join(' '))) score += 15;
    if (tags.length) score += 5;
    const inTitle = terms.length && terms.every((t) => title.includes(t));
    results.push({ entry: e, score, snippet: snippet(inTitle ? (e.text || e.sub) : e.text, terms) });
  }
  return results.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)).slice(0, limit);
}
