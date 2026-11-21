import { coverArt } from '../ui/standIn.js';
import { episodeHref } from './podcasts.js';
import { uid } from '../core/ops.js';
import { linkTo } from '../plugins.js';

/**
 * The Asset manager's document ('assets'): everything an organisation has
 * to work with, seen through an ABCD lens (Asset-Based Community
 * Development, after Kretzmann and McKnight). An asset is a gift, not a
 * gap: people's skills, groups, institutions, places, money and exchange,
 * stories and culture, and the files and maps that hold them.
 *
 *   items        { id: AssetItem }       what the org has added itself
 *   collections  { id: Collection }      folders, which can nest (parentId)
 *   positions    { collectionId|'all': { itemKey: { x, y } } }  where cards sit on the asset map
 *   activity     [ { at, by, what, key } ]  the latest 60 changes, newest first
 *
 * AssetItem {
 *   id, kind: 'file' | 'link' | 'note' | 'ref',
 *   title, description, tags: [], collectionIds: [], abcd, sensitivity,
 *   file?: { mediaId, name, size, type },   an upload (chunked, see platform/media.js)
 *   url?,                                   a link
 *   text?,                                  a note (Markdown)
 *   ref?: { type, id, mapId? },             something elsewhere in Dashi (see SOURCES)
 *   meta: { creator, date, source, licence, location, language },
 *   related: [itemKey], comments: [{ id, by, at, text }],
 *   pinned, createdAt, createdBy, updatedAt, updatedBy
 * }
 *
 * Things elsewhere in Dashi (maps, actors, people, library items, episodes,
 * Dashi docs) show here live, without being copied: each has a key like
 * `map:<id>` or `actor:<mapId>/<actorId>`. Tagging one, filing it in a
 * collection or writing about it makes a small `ref` item that points at
 * it, so the original stays the one true copy.
 */

/** The six ABCD asset types, plus files that are simply the org's records. */
export const ABCD = [
  { id: 'individual', label: 'Individuals', short: 'People', hint: 'Gifts, skills and passions of people', color: '#d9893a', icon: 'person' },
  { id: 'association', label: 'Associations', short: 'Groups', hint: 'Clubs, circles, networks and informal groups', color: '#3c9a6b', icon: 'users' },
  { id: 'institution', label: 'Institutions', short: 'Institutions', hint: 'Agencies, schools, funders, governments', color: '#3d6fc4', icon: 'org' },
  { id: 'physical', label: 'Physical', short: 'Places', hint: 'Land, buildings, spaces and equipment', color: '#7f8f3a', icon: 'pin' },
  { id: 'economic', label: 'Economic', short: 'Exchange', hint: 'Money, local business, trades and barter', color: '#b8860b', icon: 'handshake' },
  { id: 'cultural', label: 'Cultural', short: 'Stories', hint: 'Stories, heritage, language, art and knowledge', color: '#a45ab8', icon: 'story' },
];
export const abcdById = Object.fromEntries(ABCD.map((a) => [a.id, a]));

export const SENSITIVITY = [
  { id: 'public', label: 'Public', hint: 'Fine to share outside the organisation', icon: 'globeSimple' },
  { id: 'internal', label: 'Internal', hint: 'Anyone in the organisation', icon: 'users' },
  { id: 'restricted', label: 'Restricted', hint: 'Only those who need it: handle with care, don’t publish', icon: 'lock' },
];

/** What an item is, for icons, filters and the type column. */
export const FILE_GROUPS = [
  { id: 'image', label: 'Images', icon: 'image', test: (t, n) => /^image\//.test(t) || /\.(png|jpe?g|gif|webp)$/i.test(n) },
  { id: 'pdf', label: 'PDFs', icon: 'filePdf', test: (t, n) => /pdf/.test(t) || /\.pdf$/i.test(n) },
  { id: 'audio', label: 'Audio', icon: 'music', test: (t, n) => /^audio\//.test(t) || /\.(mp3|wav|m4a)$/i.test(n) },
  { id: 'video', label: 'Video', icon: 'video', test: (t, n) => /^video\//.test(t) || /\.(mp4|webm|mov)$/i.test(n) },
  { id: 'sheet', label: 'Spreadsheets', icon: 'table', test: (t, n) => /\.(xlsx?|ods|csv)$/i.test(n) },
  { id: 'slides', label: 'Slides', icon: 'story', test: (t, n) => /\.(pptx?|odp)$/i.test(n) },
  { id: 'doc', label: 'Documents', icon: 'fileText', test: () => true },
];
export const fileGroup = (file) => FILE_GROUPS.find((g) => g.test(file?.type ?? '', file?.name ?? ''));

/** Kinds of thing an asset can be, from Dashi's own tools. */
export const SOURCES = [
  { id: 'upload', label: 'Uploaded files', icon: 'cloudUpload' },
  { id: 'link', label: 'Links', icon: 'link' },
  { id: 'note', label: 'Notes', icon: 'note' },
  { id: 'map', label: 'Ecosystem maps', icon: 'sec-mapper', plugin: 'mapper' },
  { id: 'actor', label: 'Actors & agents', icon: 'actor', plugin: 'mapper' },
  { id: 'staff', label: 'People', icon: 'person' },
  { id: 'library', label: 'Library', icon: 'sec-library', plugin: 'library' },
  { id: 'episode', label: 'Podcast episodes', icon: 'sec-podcasts', plugin: 'podcasts' },
];
export const sourceById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export const blankAssets = () => ({ items: {}, collections: {}, positions: {}, activity: [] });

export function migrateAssets(doc) {
  doc ??= blankAssets();
  doc.items ??= {};
  doc.collections ??= {};
  doc.positions ??= {};
  doc.activity ??= [];
  for (const it of Object.values(doc.items)) {
    it.tags ??= [];
    it.collectionIds ??= [];
    it.related ??= [];
    it.comments ??= [];
    it.meta ??= {};
    it.sensitivity ??= 'internal';
  }
  return doc;
}

/** The key an asset is known by: its own id, or `type:id` for something elsewhere in Dashi. */
export const keyOf = (ref) => (ref.type === 'actor' ? `actor:${ref.mapId}/${ref.id}` : `${ref.type}:${ref.id}`);
export function refOfKey(key) {
  const m = /^(\w+):(.+)$/.exec(key);
  if (!m) return null;
  if (m[1] === 'actor') { const [mapId, id] = m[2].split('/'); return { type: 'actor', id, mapId }; }
  return { type: m[1], id: m[2] };
}

/** An actor's ABCD type, from its lens category (a best guess the user can change). */
function actorAbcd(a) {
  if (a.kind === 'agent') return 'individual';
  return { ally: 'association', resource: 'economic', gatekeeper: 'institution', community: 'association', problem: 'institution' }[a.category] ?? 'association';
}

/**
 * Every asset the org can see, as one flat list of cards:
 *   { key, item?, source, title, description, tags, collectionIds, abcd, sensitivity,
 *     file?, url?, href, thumb?, updatedAt, by, kindLabel, icon }
 * `docs` is { maps, mapContents, org, library, podcasts } (any may be missing).
 * Things elsewhere in Dashi take tags, collections and notes from their `ref` item, if one exists.
 */
export function gatherAssets(hub, docs = {}, { plugins = null } = {}) {
  const on = (id) => !plugins || plugins.has(id);
  const refs = new Map();
  const out = [];
  for (const it of Object.values(hub.items)) {
    if (it.kind === 'ref' && it.ref) { refs.set(keyOf(it.ref), it); continue; }
    const src = it.kind === 'file' ? 'upload' : it.kind;
    const g = it.kind === 'file' ? fileGroup(it.file) : null;
    out.push({
      key: it.id, item: it, source: src, title: it.title || it.file?.name || it.url || 'Untitled',
      description: it.description ?? '', tags: it.tags, collectionIds: it.collectionIds, abcd: it.abcd ?? null,
      sensitivity: it.sensitivity, file: it.file ?? null, url: it.url ?? null, text: it.text ?? null,
      href: it.url ?? null, updatedAt: it.updatedAt ?? it.createdAt, by: it.updatedBy ?? it.createdBy,
      kindLabel: it.kind === 'file' ? (g?.label.replace(/s$/, '') ?? 'File') : it.kind === 'link' ? 'Link' : 'Note',
      icon: it.kind === 'file' ? g?.icon ?? 'file' : it.kind === 'link' ? 'link' : 'note',
      group: g?.id ?? null, pinned: !!it.pinned,
    });
  }
  const add = (ref, card) => {
    const key = keyOf(ref);
    const it = refs.get(key);
    refs.delete(key);
    out.push({
      key, item: it ?? null, ref, tags: it?.tags ?? [], collectionIds: it?.collectionIds ?? [],
      sensitivity: it?.sensitivity ?? card.sensitivity ?? 'internal', pinned: !!it?.pinned,
      ...card,
      abcd: it?.abcd ?? card.abcd ?? null,
      description: it?.description || card.description || '',
    });
  };
  if (on('mapper')) {
    for (const [mapId, entry] of Object.entries(docs.maps?.maps ?? {})) {
      const content = docs.mapContents?.[mapId];
      const n = Object.keys(content?.actors ?? {}).length;
      add({ type: 'map', id: mapId }, { source: 'map', title: entry.title, description: entry.description, href: linkTo('mapper', `#${mapId}`), updatedAt: entry.updatedAt, by: entry.ownerId, kindLabel: 'Ecosystem map', icon: 'sec-mapper', sub: `${n} actor${n === 1 ? '' : 's'}`, abcd: null });
      for (const a of Object.values(content?.actors ?? {})) {
        add({ type: 'actor', id: a.id, mapId }, { source: 'actor', title: a.label || 'Untitled', description: a.meta?.description ?? '', href: linkTo('mapper', `#${mapId}`), kindLabel: a.kind === 'agent' ? 'Agent' : 'Actor', icon: a.kind === 'agent' ? 'agent' : 'actor', sub: entry.title, abcd: actorAbcd(a) });
      }
    }
  }
  for (const s of Object.values(docs.org?.staff ?? {})) {
    add({ type: 'staff', id: s.id }, { source: 'staff', title: s.name, description: [s.title, s.bio].filter(Boolean).join(' · '), href: `org.html#people/${s.id}`, kindLabel: 'Person', icon: 'person', sub: s.title, abcd: 'individual', thumb: s.avatar ?? null });
  }
  if (on('library')) {
    for (const li of Object.values(docs.library?.items ?? {})) {
      add({ type: 'library', id: li.id }, { source: 'library', title: li.meta?.title || li.file?.name || 'Untitled', description: li.meta?.abstract ?? '', href: linkTo('library', `#item/${li.id}`), file: li.file ?? null, url: li.url ?? null, updatedAt: li.updatedAt ? new Date(li.updatedAt).toISOString() : null, by: li.createdBy, kindLabel: li.kind === 'doc' ? 'Dashi doc' : li.kind === 'file' ? (fileGroup(li.file)?.label.replace(/s$/, '') ?? 'File') : 'Reference', icon: li.kind === 'doc' ? 'notePencil' : li.kind === 'file' ? fileGroup(li.file)?.icon ?? 'file' : 'book', group: li.file ? fileGroup(li.file)?.id : null, abcd: 'cultural', tagsFrom: li.tags, text: li.kind === 'doc' ? li.body ?? null : null });
    }
  }
  if (on('podcasts')) {
    for (const e of Object.values(docs.podcasts?.episodes ?? {})) {
      const show = docs.podcasts?.podcasts?.[e.podcastId];
      add({ type: 'episode', id: e.id }, { source: 'episode', title: e.title || 'Untitled episode', description: e.summary ?? e.description ?? '', href: episodeHref(e), kindLabel: 'Episode', icon: 'music', sub: show?.title, abcd: 'cultural', sensitivity: e.status === 'published' ? 'public' : 'internal', tagsFrom: e.tags ?? [],
        thumb: e.cover ?? show?.cover ?? (show ? coverArt({ ...show, title: e.title || show.title }, { label: show.title, seed: `${show.id}/${e.id}` }) : null) });
    }
  }
  // Notes about things that have since been removed elsewhere: keep them, marked missing.
  for (const [key, it] of refs) out.push({ key, item: it, ref: it.ref, source: it.ref.type, title: it.title || 'Removed item', description: it.description ?? '', tags: it.tags, collectionIds: it.collectionIds, abcd: it.abcd ?? null, sensitivity: it.sensitivity, missing: true, kindLabel: 'Removed', icon: 'warn', pinned: !!it.pinned });
  return out;
}

/** The item that holds tags, collections and notes for a card (made for things elsewhere in Dashi when first needed). */
export function ensureItem(hub, card, by = null) {
  if (card.item) return card.item;
  const id = uid('asset');
  const at = new Date().toISOString();
  hub.items[id] = migrateAssets({ items: { [id]: { id, kind: 'ref', ref: card.ref, title: card.title, description: '', tags: [], collectionIds: [], abcd: card.abcd ?? null, sensitivity: card.sensitivity ?? 'internal', createdAt: at, createdBy: by } } }).items[id];
  card.item = hub.items[id];
  return card.item;
}

export function newItem(hub, data, by = null) {
  const id = uid('asset');
  const at = new Date().toISOString();
  hub.items[id] = { id, title: '', description: '', tags: [], collectionIds: [], related: [], comments: [], meta: {}, sensitivity: 'internal', abcd: null, ...data, createdAt: at, createdBy: by, updatedAt: at, updatedBy: by };
  return hub.items[id];
}

export function touch(hub, item, by, what) {
  item.updatedAt = new Date().toISOString();
  item.updatedBy = by;
  if (what) logActivity(hub, by, what, item.id);
}

export function logActivity(hub, by, what, key = null) {
  hub.activity.unshift({ at: new Date().toISOString(), by, what, key });
  hub.activity.length = Math.min(hub.activity.length, 60);
}

/** A collection's id and every collection inside it. */
export function collectionTree(hub, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of Object.values(hub.collections)) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; }
  }
  return ids;
}

/** Tags in use, most used first: [{ tag, n }]. */
export function tagCounts(cards) {
  const n = new Map();
  for (const c of cards) for (const t of [...(c.tags ?? []), ...(c.tagsFrom ?? [])]) n.set(t.toLowerCase(), (n.get(t.toLowerCase()) ?? 0) + 1);
  return [...n].map(([tag, k]) => ({ tag, n: k })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

/** Filter cards by a search box: words match title, description, tags, type and the file name; `tag:x`, `type:x`, `abcd:x` narrow. */
export function searchCards(cards, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return cards;
  return cards.filter((c) => {
    const hay = [c.title, c.description, c.kindLabel, c.sub, c.file?.name, c.url, ...(c.tags ?? []), ...(c.tagsFrom ?? [])].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => {
      const [k, v] = w.includes(':') ? w.split(':') : [null, w];
      if (k === 'tag') return [...(c.tags ?? []), ...(c.tagsFrom ?? [])].some((t) => t.toLowerCase().startsWith(v));
      if (k === 'type') return (c.kindLabel ?? '').toLowerCase().startsWith(v) || c.source === v;
      if (k === 'abcd') return (c.abcd ?? '').startsWith(v) || (abcdById[c.abcd]?.label ?? '').toLowerCase().startsWith(v);
      return hay.includes(v);
    });
  });
}

export const prettySize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
