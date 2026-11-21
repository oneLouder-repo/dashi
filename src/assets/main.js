import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar, toast } from '../ui/Shell.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { Menu } from '../ui/Menu.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { MiniMap } from '../ui/MiniMap.js';
import { Sunburst } from '../ui/Sunburst.js';
import { pdfFirstPage } from '../ui/pdfPage.js';
import { standIn } from '../ui/standIn.js';
import { uiConfirm, uiForm, uiPrompt } from '../ui/dialog.js';
import { uid } from '../core/ops.js';
import { saveDoc, onDocChange, session } from '../platform/storage.js';
import { loadOrg, loadAssets, loadMaps, loadLibrary, loadPodcasts } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { currentUser } from '../platform/session.js';
import { enabledPlugins, linkTo } from '../plugins.js';
import { putMedia, deleteMedia, mediaUrl, maxUploadMb } from '../platform/media.js';
import {
  ABCD, abcdById, SENSITIVITY, SOURCES, sourceById, FILE_GROUPS, gatherAssets, ensureItem, newItem, touch, logActivity,
  collectionTree, tagCounts, searchCards, prettySize, migrateAssets, keyOf,
} from '../platform/assetHub.js';

/**
 * The Asset manager: everything the organisation has to work with, in one
 * place, seen through an ABCD (asset-based community development) lens.
 *
 *   left     search, where things come from, the six ABCD types, collections (drop
 *            cards on them), tags
 *   middle   tiles, a list, or the asset map (the ABCD wedges: drag a card into a
 *            wedge to sort it, lines show what links to what)
 *   right    the chosen asset: preview, notes, tags, collections, ABCD type,
 *            sensitivity, related assets and comments; or, with nothing chosen,
 *            recent activity and storage
 *
 * Drop files anywhere on the page to upload them (into the open collection).
 * Big files go up in resumable chunks, with a tray showing each one.
 *
 *   assets.html#src=upload | #coll=<id> | #tag=<tag> | #abcd=<type> | #key=<asset key>
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'assets', org });
const me = currentUser(org);
const canEdit = !session() || session().canEdit;
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');

let hub = loadAssets();
let docs = loadDocs();
function loadDocs() {
  const maps = plugins.has('mapper') ? loadMaps() : null;
  return { org, maps, mapContents: maps ? loadAllMaps(maps) : {}, library: plugins.has('library') ? loadLibrary() : null, podcasts: plugins.has('podcasts') ? loadPodcasts() : null };
}

/* ------------------------------------------------------------------ state */
const prefs = (() => { try { return { view: 'tiles', sort: 'recent', size: 's', ...JSON.parse(localStorage.getItem('dashi.assets.prefs') ?? '{}') }; } catch { return { view: 'tiles', sort: 'recent', size: 's' }; } })();
// A link can ask for a view (assets.html#view=map), as the Library's side list does.
{ const v = new URLSearchParams(location.hash.slice(1)).get('view'); if (['tiles', 'list', 'map'].includes(v)) prefs.view = v; }
const savePrefs = () => { try { localStorage.setItem('dashi.assets.prefs', JSON.stringify(prefs)); } catch { /* private window */ } };
let query = '';
let lastQ = null;
let selection = new Set();
let focusKey = null;
const uploads = [];

function scope() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { src: p.get('src'), coll: p.get('coll'), tag: p.get('tag'), abcd: p.get('abcd'), key: p.get('key'), q: p.get('q'), person: p.get('person'), about: p.get('about') };
}
const go = (params) => { location.hash = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString(); };

let saveTimer = null;
function save(what = null, key = null) {
  if (what) logActivity(hub, me?.id ?? null, what, key);
  window.dispatchEvent(new CustomEvent('toolbox:save-pending', { detail: { name: 'assets' } }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDoc('assets', hub), 250);
  render();
}
// Someone else changed the assets (or a map, the library...): pick it up.
onDocChange('assets', (doc) => { hub = migrateAssets(doc); render(); });
for (const name of ['maps', 'library', 'podcasts', 'org']) onDocChange(name, () => { docs = loadDocs(); render(); });

/* ------------------------------------------------------------------ cards */
const allCards = () => gatherAssets(hub, docs, { plugins });
function scoped(cards) {
  const s = scope();
  let out = cards;
  if (s.src) out = out.filter((c) => c.source === s.src);
  if (s.coll) { const ids = collectionTree(hub, s.coll); out = out.filter((c) => c.collectionIds.some((id) => ids.has(id))); }
  if (s.tag) out = out.filter((c) => [...c.tags, ...(c.tagsFrom ?? [])].some((t) => t.toLowerCase() === s.tag));
  if (s.abcd) out = out.filter((c) => (s.abcd === 'none' ? !c.abcd : c.abcd === s.abcd));
  out = searchCards(out, query);
  const by = {
    recent: (a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
    title: (a, b) => a.title.localeCompare(b.title),
    type: (a, b) => a.kindLabel.localeCompare(b.kindLabel) || a.title.localeCompare(b.title),
    size: (a, b) => (b.file?.size ?? 0) - (a.file?.size ?? 0),
  }[prefs.sort] ?? (() => 0);
  return [...out].sort((a, b) => (b.pinned - a.pinned) || by(a, b));
}
const who = (id) => org.staff?.[id] ?? null;
const ago = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ------------------------------------------------------------------ layout */
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
let sideEl = h('nav');
const mainEl = h('section', { class: 'ah-main' });
const detailEl = h('aside', { class: 'ah-detail', 'aria-label': 'Asset details' });
const tray = h('div', { class: 'ah-tray', hidden: true, role: 'status', 'aria-live': 'polite' });
const dropCover = h('div', { class: 'ah-drop', hidden: true }, h('div', {}, icon('cloudUpload', 42), h('strong', {}, 'Drop to upload'), h('span', { class: 'ah-drop-where' })));
const fileInput = h('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => { upload([...e.target.files]); e.target.value = ''; } });
const searchInput = h('input', { type: 'search', placeholder: 'Search assets', 'aria-label': 'Search assets',
  oninput: (e) => { query = e.target.value; drawMain(allCards()); }, onkeydown: (e) => { if (e.key === 'Escape') { query = ''; e.target.value = ''; drawMain(allCards()); } } });
app.classList.add('frame', 'assets-app');
app.replaceChildren(
  sideEl,
  h('div', { class: 'ah-panel' },
    PluginHeader('assets', { actions: canEdit && [
      h('label', { class: 'ah-search' }, icon('search', 16), searchInput),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => fileInput.click() }, icon('cloudUpload', 16), 'Upload'),
      Menu({ label: 'New', icon: 'plus', align: 'end', items: () => [
        { label: 'Link', icon: 'link', hint: 'A web page, video or shared drive', onclick: newLink },
        { label: 'Note', icon: 'note', hint: 'A story, a skill someone shared, an idea', onclick: newNote },
        'sep',
        { label: 'Collection', icon: 'folder', hint: 'A place to gather assets', onclick: () => newCollection() },
      ] }),
    ] }),
    h('div', { class: 'ah' }, mainEl, detailEl)),
);
document.body.append(tray, dropCover, fileInput);

/* ------------------------------------------------------------------ render */
function render() {
  const s = scope();
  if (s.key && s.key !== focusKey) { focusKey = s.key; selection = new Set([s.key]); }
  // A link can arrive with a search already typed (#q=...), e.g. from a task's toolbox.
  if (s.q != null && s.q !== lastQ) { lastQ = s.q; query = s.q; searchInput.value = s.q; }
  const cards = allCards();
  drawSide(cards);
  drawMain(cards);
  drawDetail(cards);
}
window.addEventListener('hashchange', render);

function drawSide(cards) {
  const s = scope();
  const count = (fn) => cards.filter(fn).length;
  const isOn = (params) => Object.entries(params).every(([k, v]) => s[k] === v) && Object.keys(s).filter((k) => s[k] && k !== 'key').length === Object.keys(params).length;
  const dropProps = (target) => ({
    ondragover: (e) => { if (canEdit && e.dataTransfer.types.includes('application/x-dashi-assets')) { e.preventDefault(); e.currentTarget.classList.add('drop-on'); } },
    ondragleave: (e) => e.currentTarget.classList.remove('drop-on'),
    ondrop: (e) => { e.currentTarget.classList.remove('drop-on'); dropOn(e, target); },
  });
  const dot = (color) => h('span', { class: 'ah-dot', style: `background:${color}`, 'aria-hidden': 'true' });
  const roots = Object.values(hub.collections).filter((c) => !c.parentId || !hub.collections[c.parentId]).sort((a, b) => a.name.localeCompare(b.name));
  const collItems = (c, depth = 0) => [
    {
      label: c.name, lead: dot(c.color ?? '#999'), href: `#coll=${c.id}`, on: isOn({ coll: c.id }),
      badge: String(count((x) => x.collectionIds.some((id) => collectionTree(hub, c.id).has(id)))),
      className: 'ah-coll-row', props: { ...dropProps({ coll: c.id }), style: `--depth:${depth}`, oncontextmenu: canEdit ? (e) => { e.preventDefault(); collectionMenu(c, e); } : null },
    },
    ...Object.values(hub.collections).filter((x) => x.parentId === c.id).sort((a, b) => a.name.localeCompare(b.name)).flatMap((x) => collItems(x, depth + 1)),
  ];
  const tags = tagCounts(cards).slice(0, 24);
  sideEl = swapSide(sideEl, SideNav({ label: 'Assets', sections: [
    { title: 'Assets', items: [
      { label: 'All assets', icon: 'dots', href: '#', on: !s.src && !s.coll && !s.tag && !s.abcd, badge: String(cards.length) },
      ...SOURCES.filter((x) => !x.plugin || plugins.has(x.plugin)).map((x) => ({ label: x.label, icon: x.icon, href: `#src=${x.id}`, on: isOn({ src: x.id }), badge: String(count((c) => c.source === x.id)) })),
    ] },
    { title: 'ABCD lens', items: [
      ...ABCD.map((x) => ({ label: x.label, lead: dot(x.color), href: `#abcd=${x.id}`, on: isOn({ abcd: x.id }), badge: String(count((c) => c.abcd === x.id)), title: x.hint, props: dropProps({ abcd: x.id }) })),
      { label: 'Not yet sorted', icon: 'question', href: '#abcd=none', on: isOn({ abcd: 'none' }), badge: String(count((c) => !c.abcd)) },
    ] },
    { title: 'Collections', action: canEdit && { label: 'New collection', onclick: () => newCollection() },
      items: roots.length ? roots.flatMap((c) => collItems(c)) : null,
      body: roots.length ? (canEdit ? h('p', { class: 'ah-empty-note' }, 'Right-click a collection to rename it or add one inside.') : null) : h('p', { class: 'ah-empty-note' }, 'Gather assets into collections: drag cards onto one.') },
    // The Library lives inside Assets (0.2): documents and bibliographies are assets too.
    { title: 'Library', items: [
      { label: 'Documents', sub: 'Files, Dashi docs and references', icon: 'book', href: linkTo('library', '#files/all') },
      { label: 'Bibliographies', sub: 'Annotated, with weekly briefs', icon: 'news', href: linkTo('library', '#bibs') },
      { label: 'Library tags', sub: 'What you’re reading about', icon: 'tag', href: linkTo('library', '#tags') },
    ] },
    // The asset graph (0.2, experimental): the same assets as linked facts.
    { title: 'Asset graph · experimental', items: [
      { label: 'Graph search', sub: 'Type a name; its network unfolds', icon: 'search', href: linkTo('graph', '#explore') },
      { label: 'Insights', sub: 'Hubs, bridges, clusters, islands', icon: 'lightbulb', href: linkTo('graph', '#insights') },
      { label: 'Ontology and export', sub: 'Vocabularies, linked data, API', icon: 'tree', href: linkTo('graph', '#ontology') },
    ] },
    tags.length && { title: 'Tags', body: h('div', { class: 'ah-tags' }, tags.map((t) => h('a', { href: `#tag=${encodeURIComponent(t.tag)}`, class: `ah-tag${s.tag === t.tag ? ' on' : ''}` }, t.tag, h('small', {}, String(t.n))))) },
  ] }));
  sideEl.classList.add('ah-side');
}

/** Rename, nest or delete a collection (right-click it in the sidebar). */
function collectionMenu(c, e) {
  const m = Menu({ label: '', className: 'ah-ctx', items: () => [
    { label: 'Rename…', icon: 'pencil', onclick: () => renameCollection(c) },
    { label: 'New collection inside…', icon: 'folder', onclick: () => newCollection(c.id) },
    { label: 'Delete collection', icon: 'trash', danger: true, hint: 'The assets in it stay', onclick: () => deleteCollection(c) },
  ] });
  Object.assign(m.style, { position: 'fixed', left: `${e.clientX}px`, top: `${e.clientY}px`, zIndex: 100, width: 0, height: 0, overflow: 'visible' });
  document.body.append(m);
  m.open?.();
  const gone = () => setTimeout(() => m.remove(), 200);
  document.addEventListener('pointerdown', (ev) => { if (!m.contains(ev.target)) gone(); }, { once: true, capture: true });
}

function scopeTitle() {
  const s = scope();
  if (s.coll) return hub.collections[s.coll]?.name ?? 'Collection';
  if (s.src) return sourceById[s.src]?.label ?? 'Assets';
  if (s.abcd) return s.abcd === 'none' ? 'Not yet sorted' : abcdById[s.abcd]?.label ?? 'Assets';
  if (s.tag) return `Tagged “${s.tag}”`;
  return 'All assets';
}

function drawMain(cards) {
  const list = scoped(cards);
  const s = scope();
  const sub = s.abcd && abcdById[s.abcd] ? abcdById[s.abcd].hint : s.coll ? hub.collections[s.coll]?.description : null;
  const views = [['tiles', 'tiles', 'Tiles'], ['list', 'list', 'List'], ['map', 'mapTrifold', 'Asset map']];
  const bulk = selection.size > 1 ? BulkBar(cards) : null;
  fill(mainEl, 
    h('div', { class: 'ah-bar' },
      h('div', { class: 'ah-title' }, h('h2', {}, scopeTitle()), h('span', { class: 'ah-count' }, `${list.length}`), sub && h('p', {}, sub)),
      h('div', { class: 'ah-tools' },
        prefs.view === 'tiles' && h('div', { class: 'ah-size join', role: 'group', 'aria-label': 'Tile size' }, [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([id, label], i) =>
          h('button', { type: 'button', class: `btn btn-sm join-item${prefs.size === id ? ' btn-active' : ''}`, title: `${label} tiles`, 'aria-pressed': String(prefs.size === id), onclick: () => { prefs.size = id; savePrefs(); drawMain(allCards()); } },
            h('span', { class: `ah-size-ico s${i}`, 'aria-hidden': 'true' })))),
        prefs.view !== 'map' && h('label', { class: 'ah-sort' }, h('span', { class: 'sr-only' }, 'Sort by'), h('select', { class: 'select select-sm', onchange: (e) => { prefs.sort = e.target.value; savePrefs(); drawMain(allCards()); } },
          [['recent', 'Recently changed'], ['title', 'Title'], ['type', 'Type'], ['size', 'Size']].map(([id, label]) => h('option', { value: id, selected: prefs.sort === id }, label)))),
        h('div', { class: 'ah-views join', role: 'group', 'aria-label': 'View' }, views.map(([id, glyph, label]) =>
          h('button', { type: 'button', class: `btn btn-sm join-item${prefs.view === id ? ' btn-active' : ''}`, 'aria-pressed': String(prefs.view === id), title: label, onclick: () => { prefs.view = id; savePrefs(); drawMain(allCards()); } }, icon(glyph, 16), h('span', {}, label)))))),
    bulk,
    list.length
      ? (prefs.view === 'list' ? ListView(list) : prefs.view === 'map' ? MapView(list, cards) : TileView(list))
      : Empty());
}

function Empty() {
  const s = scope();
  return h('div', { class: 'ah-emptystate' },
    icon(s.coll ? 'folderOpen' : 'dots', 40),
    h('h3', {}, query ? 'Nothing matches that search' : s.coll ? 'This collection is empty' : 'No assets here yet'),
    h('p', {}, query ? 'Try fewer words, or tag:, type: or abcd: to narrow.' : s.coll ? 'Drag cards onto it in the sidebar, or drop files here to upload them straight in.' : 'Drop files anywhere on the page, or add a link or a note. Maps, people, library items and episodes show up here by themselves.'),
    canEdit && !query && h('button', { class: 'btn btn-sm btn-primary', onclick: () => fileInput.click() }, icon('cloudUpload', 16), 'Upload files'),
    // Arrived from a task's toolbox looking for someone with no card yet: offer one.
    canEdit && query && s.person && h('button', { class: 'btn btn-sm btn-primary', onclick: () => {
      const it = newItem(hub, { kind: 'note', title: s.person, text: s.about ?? '', abcd: 'individual', tags: ['person'], collectionIds: [] }, me?.id);
      save(`added a card for “${it.title}”`, it.id);
      select(allCards().find((c) => c.key === it.id));
    } }, icon('person', 16), `Give “${s.person}” a card here`));
}

/* ------------------------------------------------------------------ views */
function select(card, e) {
  if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
    selection.has(card.key) ? selection.delete(card.key) : selection.add(card.key);
  } else selection = new Set([card.key]);
  focusKey = card.key;
  history.replaceState(null, '', `#${new URLSearchParams({ ...Object.fromEntries(Object.entries(scope()).filter(([k, v]) => v && k !== 'key')), key: card.key })}`);
  drawMain(allCards());
  drawDetail(allCards());
}

function dragCards(el, card) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    const keys = selection.has(card.key) ? [...selection] : [card.key];
    e.dataTransfer.setData('application/x-dashi-assets', JSON.stringify(keys));
    e.dataTransfer.effectAllowed = 'copyLink';
    document.body.classList.add('ah-dragging');
  });
  el.addEventListener('dragend', () => document.body.classList.remove('ah-dragging'));
}

/** Cards dropped on a collection are filed in it; on an ABCD type, sorted as it. */
function dropOn(e, { coll, abcd }) {
  const raw = e.dataTransfer.getData('application/x-dashi-assets');
  if (!raw || !canEdit) return;
  e.preventDefault();
  const keys = JSON.parse(raw);
  const cards = allCards().filter((c) => keys.includes(c.key));
  for (const c of cards) {
    const it = ensureItem(hub, c, me?.id);
    if (coll && !it.collectionIds.includes(coll)) it.collectionIds.push(coll);
    if (abcd) it.abcd = abcd;
    touch(hub, it, me?.id);
  }
  const n = cards.length;
  toast(coll ? `${n} in “${hub.collections[coll]?.name}”` : `${n} sorted as ${abcdById[abcd]?.label}`);
  save(coll ? `filed ${n} in “${hub.collections[coll]?.name}”` : `sorted ${n} as ${abcdById[abcd]?.label}`);
}

/**
 * A tile's picture: the image itself, a person's photo, a small drawing of
 * a map, a few lines of a document or note, or a stand-in nature scene in
 * the asset's ABCD colour.
 */
const plainText = (s) => String(s ?? '').replace(/[#*_>`~|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
function Thumb(card, size = 'tile') {
  const abcd = abcdById[card.abcd];
  const colour = abcd?.color ?? '#7f8ba3';
  const el = h('div', { class: `ah-thumb t-${size}`, style: `--abcd:${colour}` }, icon(card.icon, size === 'tile' ? 30 : 18));
  const picture = (src) => el.replaceChildren(h('img', { src, alt: '', loading: 'lazy', draggable: false }));
  if (card.thumb) { picture(card.thumb); return el; }
  if (card.sensitivity === 'restricted' && card.file) { el.replaceChildren(icon('lock', size === 'tile' ? 26 : 16)); return el; }
  if (card.file && card.group === 'image') {
    mediaUrl(card.file.mediaId).then((url) => { if (url) picture(url); }).catch(() => {});
    return el;
  }
  if (size !== 'tile') return el;
  if (card.file && card.group === 'pdf') {
    el.classList.add('pdf');
    mediaUrl(card.file.mediaId).then((url) => url && pdfFirstPage(url, 200)).then((src) => { if (src) picture(src); }).catch(() => {});
  }
  if (card.source === 'map' && docs.mapContents?.[card.ref?.id]) {
    el.classList.add('map');
    MiniMap(docs.mapContents[card.ref.id], { width: 240, height: 150, label: card.title }).then((s) => el.replaceChildren(s)).catch(() => {});
    return el;
  }
  if (card.source === 'actor') {
    const agent = card.kindLabel === 'Agent';
    el.classList.add('note', agent ? 'agent' : 'actor');
    el.replaceChildren(h('div', { class: 'ah-sticky' }, h('strong', {}, card.title), card.description && h('span', {}, card.description)));
    return el;
  }
  const words = plainText(card.text || card.description);
  if (words.length > 40 && ['note', 'library', 'link', 'episode'].includes(card.source)) {
    el.classList.add('text');
    el.replaceChildren(h('div', { class: 'ah-page' }, h('span', {}, words.slice(0, 260))));
    return el;
  }
  el.classList.add('art');
  picture(standIn(card.key, colour));
  el.append(h('span', { class: 'ah-thumb-badge' }, icon(card.icon, 14)));
  return el;
}

function TileView(list) {
  return h('div', { class: `ah-tiles size-${prefs.size}`, role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Assets' }, list.map((c) => {
    const abcd = abcdById[c.abcd];
    const el = h('div', { class: `ah-tile${selection.has(c.key) ? ' on' : ''}${c.missing ? ' missing' : ''}`, role: 'option', tabindex: 0, 'aria-selected': String(selection.has(c.key)),
      onclick: (e) => select(c, e), ondblclick: () => openCard(c), onkeydown: (e) => { if (e.key === 'Enter') openCard(c); if (e.key === ' ') { e.preventDefault(); select(c, { ctrlKey: true }); } } },
      Thumb(c),
      h('div', { class: 'ah-tile-body' },
        h('strong', { class: 'ah-tile-title', title: c.title }, c.title),
        h('span', { class: 'ah-tile-sub' }, [c.kindLabel, c.sub, c.file ? prettySize(c.file.size) : null].filter(Boolean).join(' · ')),
        h('div', { class: 'ah-tile-meta' },
          abcd && h('span', { class: 'ah-chip', style: `--c:${abcd.color}` }, abcd.short),
          c.sensitivity === 'restricted' && h('span', { class: 'ah-chip lock', title: 'Restricted' }, icon('lock', 11)),
          c.collectionIds.slice(0, 2).map((id) => hub.collections[id] && h('span', { class: 'ah-chip coll', style: `--c:${hub.collections[id].color ?? '#999'}` }, hub.collections[id].name)),
          c.tags.slice(0, 2).map((t) => h('span', { class: 'ah-chip tag' }, `#${t}`)))),
      c.pinned && h('span', { class: 'ah-pin', title: 'Pinned' }, icon('pin', 12)));
    dragCards(el, c);
    return el;
  }));
}

function ListView(list) {
  return h('div', { class: 'ah-listwrap' }, h('table', { class: 'table table-sm ah-list' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Title'), h('th', {}, 'Type'), h('th', {}, 'ABCD'), h('th', {}, 'Collections and tags'), h('th', {}, 'Size'), h('th', {}, 'Changed'))),
    h('tbody', {}, list.map((c) => {
      const abcd = abcdById[c.abcd];
      const tr = h('tr', { class: selection.has(c.key) ? 'on' : '', tabindex: 0, onclick: (e) => select(c, e), ondblclick: () => openCard(c), onkeydown: (e) => { if (e.key === 'Enter') openCard(c); } },
        h('td', {}, Thumb(c, 'row')),
        h('td', { class: 'ah-list-title' }, h('strong', {}, c.title), c.sub && h('small', {}, c.sub)),
        h('td', {}, c.kindLabel),
        h('td', {}, abcd ? h('span', { class: 'ah-chip', style: `--c:${abcd.color}` }, abcd.short) : h('span', { class: 'muted' }, '—')),
        h('td', {}, h('div', { class: 'ah-tile-meta' }, c.collectionIds.map((id) => hub.collections[id] && h('span', { class: 'ah-chip coll', style: `--c:${hub.collections[id].color ?? '#999'}` }, hub.collections[id].name)), c.tags.map((t) => h('span', { class: 'ah-chip tag' }, `#${t}`)))),
        h('td', { class: 'num' }, c.file ? prettySize(c.file.size) : ''),
        h('td', { class: 'muted' }, ago(c.updatedAt)));
      dragCards(tr, c);
      return tr;
    }))));
}

/**
 * The asset map opens as a zoomable sunburst (PR 10): all assets in the
 * centre, then the six ABCD types, then collections (or the first tag),
 * then the assets themselves. Click a ring to zoom in, the centre to step
 * out, an asset to open it. "Arrange" is the wedge map below, for sorting
 * and linking by hand.
 */
function MapView(list, cards) {
  const mode = prefs.mapMode === 'arrange' ? 'arrange' : 'sunburst';
  const by = prefs.mapSize === 'links' ? 'links' : 'count';
  const seg = (items, cur, set) => h('div', { class: 'device-toggle xs', role: 'radiogroup' }, items.map(([id, label]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(cur === id), class: cur === id ? 'on' : '', onclick: () => { set(id); savePrefs(); drawMain(allCards()); } }, label)));
  const bar = h('div', { class: 'ah-map-bar' },
    seg([['sunburst', 'Sunburst'], ['arrange', 'Arrange']], mode, (v) => { prefs.mapMode = v; }),
    mode === 'sunburst' && h('span', { class: 'ah-map-size' }, h('span', { class: 'muted small' }, 'Size by'), seg([['count', 'Count'], ['links', 'Links']], by, (v) => { prefs.mapSize = v; })),
    h('span', { class: 'muted small ah-map-hint' }, mode === 'sunburst' ? 'Click a ring to zoom in, the centre to step out, an asset to open it.' : 'Drag to sort, or grab the ring on an asset to link it.'));
  if (mode === 'arrange') return h('div', { class: 'ah-mapview' }, bar, AssetMap(list, cards));
  const linksOf = (c) => (c.item?.related ?? []).length + list.filter((x) => x.item?.related?.includes(c.key)).length;
  const groupOf = (c) => (c.collectionIds[0] && hub.collections[c.collectionIds[0]] ? hub.collections[c.collectionIds[0]].name : c.tags[0] ? `#${c.tags[0]}` : 'Not filed');
  const kinds = [...ABCD, { id: 'none', label: 'Not yet sorted', color: '#8a93a8' }];
  const data = { name: 'All assets', children: kinds.map((k) => {
    const mine = list.filter((c) => (c.abcd ?? 'none') === k.id);
    const groups = new Map();
    for (const c of mine) { const g = groupOf(c); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    const leaf = (c) => ({ name: c.title, key: c.key, kind: k.id, value: by === 'links' ? 1 + linksOf(c) : 1 });
    // Nothing filed in this type? Its assets sit straight under it, without a "Not filed" ring.
    const only = groups.size === 1 && groups.has('Not filed');
    return { name: k.label, kind: k.id, color: k.color, children: only ? mine.map(leaf) : [...groups].map(([name, cs]) => ({ name, kind: k.id, children: cs.map(leaf) })) };
  }).filter((k) => k.children.length) };
  const kindColor = Object.fromEntries(kinds.map((k) => [k.id, k.color]));
  const kindOfLabel = Object.fromEntries(kinds.map((k) => [k.label, k.id]));
  // Zoomed into one type: offer to arrange it by hand, with the burst into its wedge.
  const arrangeBtn = h('button', { type: 'button', class: 'btn btn-sm ah-sb-arrange', hidden: true }, icon('mapTrifold', 14), h('span', {}));
  const showArrange = (path) => {
    const kind = kindOfLabel[path[0]];
    arrangeBtn.hidden = !kind || kind === 'none';
    if (arrangeBtn.hidden) return;
    arrangeBtn.lastChild.textContent = `Arrange ${path[0].toLowerCase()} by hand`;
    arrangeBtn.onclick = () => { prefs.mapMode = 'arrange'; savePrefs(); mapFocus = kind; mapEmerge = true; drawMain(allCards()); };
  };
  showArrange(sunFocus);
  bar.append(arrangeBtn);
  return h('div', { class: 'ah-mapview' }, bar, Sunburst({
    data, size: 520, caption: 'All assets', label: 'Asset map: a sunburst of every asset by ABCD type',
    focus: sunFocus,
    onZoom: (path) => { sunFocus = path; showArrange(path); },
    tip: (d) => d.children ? `${d.value} asset${d.value === 1 ? '' : 's'} · click to open` : `${kinds.find((k) => k.id === d.data.kind)?.label ?? ''}${d.parent?.depth === 2 ? ` · ${d.parent.data.name}` : ''}\nClick to see it`,
    // Bold at every depth: each ring a step lighter, but never washed out.
    color: (d) => { const c = kindColor[d.data.kind] ?? '#8a93a8'; return d.depth === 1 ? c : d.children ? mix(c, 0.12) : mix(c, d.depth === 2 ? 0.12 : 0.24); },
    // Opening an asset shows it beside the map, and the sunburst stays where it is.
    onLeaf: (leaf, e) => {
      const c = list.find((x) => x.key === leaf.key);
      if (!c) return;
      selection = new Set([c.key]);
      focusKey = c.key;
      history.replaceState(null, '', `#${new URLSearchParams({ ...Object.fromEntries(Object.entries(scope()).filter(([k, v]) => v && k !== 'key')), key: c.key })}`);
      drawDetail(allCards());
    },
  }));
}
let sunFocus = [];   // the names from the centre to the ring the asset sunburst is zoomed into
/** A colour lifted towards white by t (0–1). */
const mix = (hex, t) => { const n = parseInt(hex.slice(1), 16); const ch = (s) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };

/**
 * The asset map (alpha 0.2): six ABCD wedges around the organisation.
 *
 *   Overview   each wedge shows its count and a few leading assets (the most
 *              connected), never a crowd of dots. Click a wedge to open it.
 *   One wedge  every asset of that type, fanned out in calm rows. The other
 *              five types sit along the top: drop an asset on one to re-sort it.
 *
 * Everywhere: drag an asset into another wedge to sort it; grab the small
 * ring on an asset's right and drop it on another asset to link them (like
 * a connector on the mapper); + adds an asset of that type.
 */
let mapFocus = null;   // the ABCD type opened, or null for all six
let mapEmerge = false; // just opened (or closed) a wedge: let the next view grow in
const quietMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * Open a wedge (or go back to all six) the way the sunburst does: the wedge
 * bursts outward to fill the map, then its assets emerge one after another.
 */
function burstTo(svgEl, type, wg = null) {
  const go = () => { mapFocus = type; mapEmerge = true; drawMain(allCards()); };
  if (quietMotion() || !svgEl.isConnected) { go(); return; }
  svgEl.classList.add('bursting');
  wg?.classList.add('burst');
  setTimeout(go, 380);
}
function AssetMap(list) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); parent?.append(n); return n; };
  if (mapFocus && !abcdById[mapFocus]) mapFocus = null;
  const W = mapFocus ? 900 : 820, H = mapFocus ? 380 : 760;
  const svgEl = el('svg', { viewBox: `0 0 ${W} ${H}`, class: `ah-map ah-map2${mapFocus ? ' focused' : ''}${mapEmerge && !quietMotion() ? ' emerging' : ''}`, role: 'group', 'aria-label': mapFocus ? `Asset map: ${abcdById[mapFocus].label}` : 'Asset map: the six ABCD types' });
  const defs = el('defs', {}, svgEl);
  ABCD.forEach((x) => {
    const g = el('radialGradient', { id: `ahg-${x.id}`, cx: '50%', cy: mapFocus ? '100%' : '50%', r: mapFocus ? '95%' : '55%' }, defs);
    // As bold as the sunburst's rings (PR 10 touch-up); the fanned-out view stays lighter, under its assets.
    el('stop', { offset: '0%', 'stop-color': x.color, 'stop-opacity': mapFocus ? '0.10' : '0.78' }, g);
    el('stop', { offset: '100%', 'stop-color': x.color, 'stop-opacity': mapFocus ? '0.32' : '1' }, g);
  });
  mapEmerge = false;
  let pillN = 0;
  const lines = el('g', { class: 'ah-lines' }, svgEl);
  const layer = el('g', { class: 'ah-layer' }, svgEl);
  const nodes = el('g', { class: 'ah-nodes' }, svgEl);
  const pos = new Map();
  const byType = (t) => list.filter((c) => (c.abcd ?? 'none') === t);
  const linksOf = (c) => (c.item?.related ?? []).length + list.filter((x) => x.item?.related?.includes(c.key)).length;
  const lead = (cs, n) => [...cs].sort((a, b) => linksOf(b) - linksOf(a) || (b.item?.updatedAt ?? '').localeCompare(a.item?.updatedAt ?? '')).slice(0, n);
  const svgPoint = (e) => { const r = svgEl.getBoundingClientRect(); const vb = svgEl.viewBox.baseVal; return { x: ((e.clientX - r.left) / r.width) * vb.width, y: ((e.clientY - r.top) / r.height) * vb.height }; };
  const short = (t, n = mapFocus ? 20 : 15) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  /* ---------- an asset, as a pill with a link ring */
  function Pill(c, x, y, { quiet = false } = {}) {
    pos.set(c.key, { x, y });
    const colour = abcdById[c.abcd]?.color ?? '#8a93a8';
    const label = short(c.title);
    const w = Math.max(70, label.length * 7.6 + 38);
    const g = el('g', { class: `ah-node ah-pill${selection.has(c.key) ? ' on' : ''}${quiet ? ' quiet' : ''}`, transform: `translate(${x},${y})`, style: `--i:${pillN++}`, tabindex: 0, role: 'button', 'aria-label': `${c.title}, ${c.kindLabel}`, 'data-key': c.key }, nodes);
    el('rect', { x: -w / 2, y: -15, width: w, height: 30, rx: 15, class: 'ah-node-box', style: `--c:${colour}` }, g);
    el('circle', { cx: -w / 2 + 15, cy: 0, r: 5.5, class: 'ah-node-dot', style: `fill:${colour}` }, g);
    el('text', { x: -w / 2 + 27, y: 4.5, class: 'ah-node-label' }, g).textContent = label;
    const ring = canEdit ? el('circle', { cx: w / 2 + 2, cy: 0, r: 7, class: 'ah-link-ring' }, g) : null;
    if (ring) el('title', {}, ring).textContent = 'Drag to another asset to link them';
    el('title', {}, g).textContent = `${c.title} · ${c.kindLabel}${linksOf(c) ? ` · ${linksOf(c)} links` : ''}`;
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(c, e); });
    g.addEventListener('pointerdown', (e) => (e.target === ring ? linkDrag(e, c, g) : moveDrag(e, c, g)));
    return g;
  }

  /* ---------- grab-and-link */
  function linkDrag(e, c, g) {
    e.preventDefault(); e.stopPropagation();
    const from = pos.get(c.key);
    const band = el('path', { class: 'ah-band' }, lines);
    g.setPointerCapture(e.pointerId);
    svgEl.classList.add('linking');
    const targetAt = (ev) => document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.ah-node[data-key]');
    const move = (ev) => {
      const q = svgPoint(ev);
      const mx = (from.x + q.x) / 2, my = Math.min(from.y, q.y) - 40;
      band.setAttribute('d', `M${from.x},${from.y} Q${mx},${my} ${q.x},${q.y}`);
      nodes.querySelectorAll('.ah-node.target').forEach((n) => n.classList.remove('target'));
      const t = targetAt(ev);
      if (t && t !== g) t.classList.add('target');
    };
    const up = (ev) => {
      g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up);
      svgEl.classList.remove('linking');
      band.remove();
      const t = targetAt(ev);
      nodes.querySelectorAll('.ah-node.target').forEach((n) => n.classList.remove('target'));
      if (!t || t === g) return;
      const other = list.find((x) => x.key === t.dataset.key);
      if (!other) return;
      const a = ensureItem(hub, c, me?.id), b = ensureItem(hub, other, me?.id);
      const linked = a.related.includes(other.key);
      a.related = linked ? a.related.filter((k) => k !== other.key) : [...a.related, other.key];
      b.related = linked ? b.related.filter((k) => k !== c.key) : [...new Set([...b.related, c.key])];
      touch(hub, a, me?.id); touch(hub, b, me?.id);
      toast(linked ? `Unlinked “${c.title}” and “${other.title}”` : `Linked “${c.title}” and “${other.title}”`);
      save(`${linked ? 'unlinked' : 'linked'} “${c.title}” and “${other.title}”`, a.id);
    };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
  }

  /* ---------- drag to move or re-sort */
  function moveDrag(e, c, g) {
    e.preventDefault();
    const start = svgPoint(e), orig = { ...pos.get(c.key) };
    let moved = false;
    // Bring it to the front first: moving it in the page later would drop the pointer capture.
    if (nodes.lastChild !== g) nodes.append(g);
    g.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const q = svgPoint(ev);
      if (!moved && Math.hypot(q.x - start.x, q.y - start.y) < 4) return;
      if (!canEdit) return;
      moved = true;
      g.classList.add('dragging');
      const np = { x: Math.max(30, Math.min(W - 30, orig.x + q.x - start.x)), y: Math.max(16, Math.min(svgEl.viewBox.baseVal.height - 16, orig.y + q.y - start.y)) };
      pos.set(c.key, np);
      g.setAttribute('transform', `translate(${np.x},${np.y})`);
      const hot = dropType(np, ev);
      svgEl.querySelectorAll('[data-abcd]').forEach((w) => w.classList.toggle('hot', w.dataset.abcd === hot));
      wrap.querySelectorAll('[data-abcd-chip]').forEach((w) => w.classList.toggle('hot', w.dataset.abcdChip === hot));
      drawLines();
    };
    const up = (ev) => {
      g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up);
      svgEl.querySelectorAll('.hot').forEach((w) => w.classList.remove('hot'));
      wrap.querySelectorAll('.hot').forEach((w) => w.classList.remove('hot'));
      if (!moved) return select(c, e);
      const np = pos.get(c.key);
      const type = dropType(np, ev);
      if (type && type !== 'none' && type !== c.abcd) {
        const it = ensureItem(hub, c, me?.id);
        it.abcd = type;
        touch(hub, it, me?.id);
        toast(`“${c.title}” is now ${abcdById[type].label.toLowerCase()}`);
        save(`sorted “${c.title}” as ${abcdById[type].label}`, c.key);
        return;
      }
      if (mapFocus) { (hub.positions[`focus:${mapFocus}`] ??= {})[c.key] = { x: Math.round(np.x), y: Math.round(np.y) }; save(); }
      else drawMain(allCards());
    };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
  }

  const drawLines = () => {
    lines.querySelectorAll('.ah-line').forEach((n) => n.remove());
    const seen = new Set();
    for (const c of list) for (const k of c.item?.related ?? []) {
      const id = [c.key, k].sort().join('|');
      if (seen.has(id)) continue;
      seen.add(id);
      const p = pos.get(c.key), q = pos.get(k);
      if (!p || !q) continue;
      // Curves bow towards the middle, so lines between wedges don't cross the labels.
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const [cx0, cy0] = mapFocus ? [W / 2, H + 200] : [W / 2, 360];
      const bx = mx + (cx0 - mx) * 0.25, by = my + (cy0 - my) * 0.25;
      el('path', { d: `M${p.x},${p.y} Q${bx},${by} ${q.x},${q.y}`, class: 'ah-line related' }, lines);
    }
  };

  /* ---------- overview: six calm wedges */
  let dropType;
  const wrap = h('div', { class: 'ah-mapwrap ah-mapwrap2' });
  if (!mapFocus) {
    const cx = W / 2, cy = 350, R = 286, r0 = 78;
    const wedge = (i) => [(-90 + i * 60 - 30) * Math.PI / 180, (-90 + i * 60 + 30) * Math.PI / 180];
    const pt = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const typeAt = (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r0 || d > R + 10) return 'none';
      let a = Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90 + 30;
      a = ((a % 360) + 360) % 360;
      return ABCD[Math.floor(a / 60)]?.id ?? 'none';
    };
    dropType = (np) => typeAt(np.x, np.y);
    const taken = [];
    const fits = (qx, qy, w, hh) => taken.every(([tx, ty, tw, th]) => Math.abs(tx - qx) * 2 >= tw + w || Math.abs(ty - qy) * 2 >= th + hh);
    ABCD.forEach((x, i) => {
      const [a0, a1] = wedge(i);
      const cs = byType(x.id);
      const gap = 0.012;
      const [x0, y0] = pt(a0 + gap, r0), [x1, y1] = pt(a0 + gap, R), [x2, y2] = pt(a1 - gap, R), [x3, y3] = pt(a1 - gap, r0);
      const wg = el('g', { class: 'ah-wedge2', 'data-abcd': x.id, style: `--c:${x.color}`, tabindex: 0, role: 'button', 'aria-label': `Open ${x.label}: ${cs.length} assets` }, layer);
      el('path', { d: `M${x0},${y0} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0} Z`, class: 'ah-wedge-bg', fill: `url(#ahg-${x.id})` }, wg);
      const mid = (a0 + a1) / 2;
      // The name and count sit outside the ring, so the inside stays calm.
      const [lx, ly] = pt(mid, R + 26);
      const anchor = lx < cx - 30 ? 'end' : lx > cx + 30 ? 'start' : 'middle';
      const lab = el('text', { x: lx, y: ly + (ly < cy ? -4 : 14), class: 'ah-wedge-name', 'text-anchor': anchor }, wg);
      el('tspan', { class: 'ah-wedge-count' }, lab).textContent = `${cs.length} `;
      el('tspan', {}, lab).textContent = x.label;
      el('title', {}, wg).textContent = `${x.label}: ${x.hint}. Click to open.`;
      // A clear way to add one of these.
      if (canEdit) {
        const [px, py] = pt(mid, r0 + 34);
        taken.push([px, py, 30, 30]);
        const add = el('g', { class: 'ah-wedge-add', transform: `translate(${px},${py})`, role: 'button', tabindex: 0, 'aria-label': `Add ${x.short.toLowerCase()}` }, wg);
        el('circle', { r: 12 }, add);
        el('path', { d: 'M-5,0 H5 M0,-5 V5' }, add);
        el('title', {}, add).textContent = `Add to ${x.label}`;
        add.addEventListener('click', (e) => { e.stopPropagation(); addAsset(x.id); });
      }
      wg.style.setProperty('--i', String(i));
      wg.addEventListener('click', (e) => { if (e.target.closest('.ah-wedge-add')) return; burstTo(svgEl, x.id, wg); });
      wg.addEventListener('keydown', (e) => { if (e.key === 'Enter') burstTo(svgEl, x.id, wg); });
      // A few leading assets in the outer band; the rest wait inside.
      // Up to three, wherever they fit without touching (nothing piles up).
      const top = lead(cs, 3);
      const span = a1 - a0;
      const cands = [];
      for (const rr of [R - 40, R - 92, R - 144]) for (const f of [0, -0.26, 0.26]) cands.push(pt(mid + f * span, rr));
      for (const c of top) {
        const w = Math.max(70, short(c.title).length * 7.6 + 38) + 18;
        const spot = cands.find(([qx, qy]) => fits(qx, qy, w, 34) && typeAt(qx - w / 2 + 10, qy) !== 'none' && typeAt(qx + w / 2 - 10, qy) === x.id && typeAt(qx - w / 2 + 10, qy) === x.id);
        if (!spot) continue;
        taken.push([spot[0], spot[1], w, 34]);
        Pill(c, spot[0], spot[1]);
      }
      const placed = top.filter((c) => pos.has(c.key)).length;
      if (cs.length > placed) {
        const [mx2, my2] = cands.find(([qx, qy]) => fits(qx, qy, 90, 22)) ?? pt(mid, R - 150);
        taken.push([mx2, my2, 90, 22]);
        const more = el('text', { x: mx2, y: my2 + 4, class: 'ah-more', 'text-anchor': 'middle' }, wg);
        more.textContent = `+ ${cs.length - placed} more`;
      }
    });
    el('circle', { cx, cy, r: r0 - 10, class: 'ah-core' }, layer);
    el('text', { x: cx, y: cy - 2, class: 'ah-core-label', 'text-anchor': 'middle' }, layer).textContent = short(org.name, 20);
    el('text', { x: cx, y: cy + 16, class: 'ah-core-sub', 'text-anchor': 'middle' }, layer).textContent = `${list.filter((c) => c.abcd).length} assets`;
    // Not yet sorted: a tray along the bottom, to drag into a wedge.
    const loose = byType('none');
    if (loose.length) {
      el('text', { x: 24, y: H - 52, class: 'ah-tray-label' }, layer).textContent = `Not yet sorted (${loose.length}): drag into a wedge`;
      let x = 60;
      for (const c of loose.slice(0, 7)) { const w = Math.max(70, short(c.title).length * 7.6 + 38); if (x + w > W - 120) break; Pill(c, x + w / 2 - 36, H - 24, { quiet: true }); x += w + 14; }
      if (loose.length > 7) el('text', { x: W - 24, y: H - 20, class: 'ah-more', 'text-anchor': 'end' }, layer).textContent = `+ ${loose.length - 7} more in the list`;
    }
    wrap.append(svgEl, h('p', { class: 'ah-map-note' }, 'Click a wedge to open it. Drag an asset into a wedge to sort it; drag the ring on its right onto another asset to link them.'));
  } else {
    /* ---------- one wedge, fanned out */
    const x = abcdById[mapFocus];
    const cs = byType(mapFocus);
    const saved = hub.positions[`focus:${mapFocus}`] ?? {};
    dropType = (np, ev) => document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-abcd-chip]')?.dataset.abcdChip ?? null;
    // Calm rows, centred, curving gently like the wedge they came from.
    const shown = cs.slice(0, 140);
    const widths = shown.map((c) => Math.max(70, short(c.title).length * 7.6 + 38) + 22);
    const rows = [];
    let row = [], used = 0;
    shown.forEach((c, j) => { if (row.length && used + widths[j] > W - 80) { rows.push(row); row = []; used = 0; } row.push(j); used += widths[j]; });
    if (row.length) rows.push(row);
    const cx = W / 2, top = 64, step = 54;
    const fullH = Math.max(H, top + rows.length * step + 60);
    svgEl.setAttribute('viewBox', `0 0 ${W} ${fullH}`);
    el('path', { d: `M20,${fullH - 20} L20,70 Q${cx},-30 ${W - 20},70 L${W - 20},${fullH - 20} Z`, class: 'ah-fan', fill: `url(#ahg-${x.id})`, style: `--c:${x.color}` }, layer);
    rows.forEach((r, ri) => {
      const total = r.reduce((t, j) => t + widths[j], 0);
      let px = cx - total / 2;
      for (const j of r) {
        const c = shown[j];
        const mx = px + widths[j] / 2;
        const curve = ((mx - cx) / (W / 2)) ** 2 * 26;
        const sp = saved[c.key];
        Pill(c, sp?.x ?? mx - 4, sp?.y ?? top + ri * step + curve);
        px += widths[j];
      }
    });
    if (!cs.length) el('text', { x: cx, y: 300, class: 'ah-empty', 'text-anchor': 'middle' }, layer).textContent = `No ${x.label.toLowerCase()} yet. ${x.hint}.`;
    const others = ABCD.filter((o) => o.id !== mapFocus);
    wrap.append(...[
      h('div', { class: 'ah-focus-bar' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => burstTo(svgEl, null) }, icon('chevronLeft', 14), 'All six'),
        h('span', { class: 'ah-focus-title', style: `--c:${x.color}` }, icon(x.icon, 16), h('strong', {}, x.label), h('small', {}, `${cs.length} · ${x.hint}`)),
        h('span', { class: 'spacer' }),
        canEdit && h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => addAsset(mapFocus) }, icon('plus', 14), `Add ${x.short.toLowerCase()}`)),
      h('div', { class: 'ah-chips', 'aria-label': 'Other types: drop an asset here to move it' }, others.map((o) =>
        h('button', { type: 'button', class: 'ah-chip', 'data-abcd-chip': o.id, style: `--c:${o.color}`, onclick: () => burstTo(svgEl, o.id) }, icon(o.icon, 13), o.label, h('small', {}, String(byType(o.id).length))))),
      svgEl,
      cs.length > shown.length && h('p', { class: 'ah-map-note' }, `Showing ${shown.length} of ${cs.length}. Narrow with a collection or a search.`),
      h('p', { class: 'ah-map-note' }, 'Drag to arrange (remembered). Drop an asset on a type above to re-sort it. Drag the ring on an asset onto another to link them.')].filter(Boolean));
  }
  drawLines();
  return wrap;
}

/** Add an asset straight onto the map: a note (a person, a group, a place…) or a link, already sorted. */
async function addAsset(abcd) {
  const x = abcdById[abcd];
  const v = await uiForm({ title: `Add to ${x.label}`, ok: 'Add', fields: [
    { name: 'title', label: 'Name', required: true, placeholder: { individual: 'e.g. Marguerite, bannock and storytelling', association: 'e.g. Tuesday knitting circle', institution: 'e.g. St. Martha’s Hospital', physical: 'e.g. The community hall kitchen', economic: 'e.g. Saturday farmers’ market', cultural: 'e.g. Mi’kmaw language circle' }[abcd] },
    { name: 'text', label: 'What they bring', type: 'textarea', rows: 3, placeholder: x.hint },
    { name: 'url', label: 'Web address (optional)', type: 'url', placeholder: 'https://' },
  ] });
  if (!v) return;
  const url = v.url?.trim();
  const it = newItem(hub, { kind: url ? 'link' : 'note', ...(url ? { url, description: v.text } : { text: v.text }), title: v.title.trim(), abcd, collectionIds: scope().coll ? [scope().coll] : [] }, me?.id);
  save(`added “${it.title}” to ${x.label}`, it.id);
  select(allCards().find((c) => c.key === it.id));
}

/* ------------------------------------------------------------------ bulk */
function BulkBar(cards) {
  const chosen = cards.filter((c) => selection.has(c.key));
  const own = chosen.filter((c) => c.item && c.item.kind !== 'ref');
  return h('div', { class: 'ah-bulk', role: 'toolbar', 'aria-label': 'Selected assets' },
    h('strong', {}, `${chosen.length} selected`),
    canEdit && [
      h('button', { class: 'btn btn-xs', onclick: () => bulkTag(chosen) }, icon('tag', 13), 'Tag'),
      Menu({ label: 'Add to collection', icon: 'folder', className: 'btn-xs', items: () => Object.values(hub.collections).length
        ? Object.values(hub.collections).map((c) => ({ label: c.name, onclick: () => { for (const x of chosen) { const it = ensureItem(hub, x, me?.id); if (!it.collectionIds.includes(c.id)) it.collectionIds.push(c.id); touch(hub, it, me?.id); } save(`filed ${chosen.length} in “${c.name}”`); } }))
        : [{ note: 'No collections yet.' }, { label: 'New collection…', onclick: () => newCollection(null, chosen) }] }),
      Menu({ label: 'ABCD', icon: 'circlesThree', className: 'btn-xs', items: () => ABCD.map((x) => ({ label: x.label, onclick: () => { for (const c of chosen) { const it = ensureItem(hub, c, me?.id); it.abcd = x.id; touch(hub, it, me?.id); } save(`sorted ${chosen.length} as ${x.label}`); } })) }),
      own.length > 0 && h('button', { class: 'btn btn-xs btn-ghost text-error', onclick: () => removeItems(own) }, icon('trash', 13), `Delete ${own.length}`),
    ],
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { selection = new Set(); render(); } }, 'Clear'));
}

async function bulkTag(chosen) {
  const v = await uiPrompt('Tags', '', { title: `Tag ${chosen.length} assets`, help: 'Separate tags with commas.', ok: 'Add tags' });
  const tags = cleanTags(v);
  if (!tags.length) return;
  for (const c of chosen) { const it = ensureItem(hub, c, me?.id); it.tags = [...new Set([...it.tags, ...tags])]; touch(hub, it, me?.id); }
  save(`tagged ${chosen.length} with ${tags.map((t) => `#${t}`).join(' ')}`);
}
const cleanTags = (v) => String(v ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '').slice(0, 40)).filter(Boolean);

/* ------------------------------------------------------------------ detail */
function drawDetail(cards) {
  const card = focusKey && cards.find((c) => c.key === focusKey);
  const one = card && selection.size <= 1;
  detailEl.classList.toggle('focus', !!one);
  fill(detailEl, ...(one ? Detail(card) : Overview(cards)));
}

function Overview(cards) {
  const own = Object.values(hub.items).filter((i) => i.kind === 'file');
  const bytes = own.reduce((n, i) => n + (i.file?.size ?? 0), 0);
  const groups = FILE_GROUPS.map((g) => ({ ...g, n: own.filter((i) => g === FILE_GROUPS.find((x) => x.test(i.file?.type ?? '', i.file?.name ?? ''))).length })).filter((g) => g.n);
  const sorted = cards.filter((c) => c.abcd).length;
  return [
    h('h3', { class: 'ah-d-head' }, 'At a glance'),
    h('div', { class: 'ah-stats' },
      h('div', {}, h('strong', {}, String(cards.length)), h('span', {}, 'assets')),
      h('div', {}, h('strong', {}, prettySize(bytes) || '0 B'), h('span', {}, 'uploaded')),
      h('div', {}, h('strong', {}, `${cards.length ? Math.round((sorted / cards.length) * 100) : 0}%`), h('span', {}, 'sorted by ABCD'))),
    h('div', { class: 'ah-abcd-bar', role: 'img', 'aria-label': 'Assets by ABCD type' }, ABCD.map((x) => {
      const n = cards.filter((c) => c.abcd === x.id).length;
      return n ? h('a', { href: `#abcd=${x.id}`, style: `flex:${n};background:${x.color}`, title: `${x.label}: ${n}` }) : null;
    })),
    groups.length ? h('ul', { class: 'ah-groups' }, groups.map((g) => h('li', {}, icon(g.icon, 15), g.label, h('span', {}, String(g.n))))) : null,
    h('h3', { class: 'ah-d-head' }, 'Recent activity'),
    hub.activity.length
      ? h('ul', { class: 'ah-activity' }, hub.activity.slice(0, 14).map((a) => h('li', {}, Avatar(who(a.by) ?? { name: '?' }, 22), h('div', {}, h('span', {}, h('b', {}, who(a.by)?.name?.split(' ')[0] ?? 'Someone'), ' ', a.what), h('small', {}, ago(a.at))))))
      : h('p', { class: 'muted small' }, 'Uploads, filing and comments show here, so everyone can see what moved.'),
    h('p', { class: 'ah-tip' }, icon('info', 14), h('span', {}, 'Tip: shift- or ctrl-click to choose several, then tag them or drag them onto a collection together.')),
  ];
}

function Detail(c) {
  const it = c.item;
  const own = it && it.kind !== 'ref';
  const editable = canEdit;
  const field = (label, control) => h('label', { class: 'ah-field' }, h('span', {}, label), control);
  const change = (fn, what) => { const item = ensureItem(hub, c, me?.id); fn(item); touch(hub, item, me?.id); save(what, c.key); };
  const abcdNow = c.abcd;

  return [
    h('div', { class: 'ah-d-top' },
      h('span', { class: 'ah-d-kind' }, icon(c.icon, 15), c.kindLabel),
      h('span', { class: 'spacer' }),
      editable && h('button', { class: `btn btn-xs btn-ghost btn-square${c.pinned ? ' on' : ''}`, title: c.pinned ? 'Unpin' : 'Pin to the top', 'aria-pressed': String(!!c.pinned), onclick: () => change((x) => { x.pinned = !x.pinned; }) }, icon('pin', 15)),
      h('button', { class: 'btn btn-xs btn-ghost btn-square', title: 'Close', 'aria-label': 'Close', onclick: () => { focusKey = null; selection = new Set(); go(Object.fromEntries(Object.entries(scope()).filter(([k, v]) => v && k !== 'key'))); } }, icon('close', 15))),
    Preview(c),
    own && editable
      ? h('input', { class: 'ah-d-title', value: c.title, 'aria-label': 'Title', onchange: (e) => change((x) => { x.title = e.target.value.trim() || x.title; }, 'renamed an asset') })
      : h('h2', { class: 'ah-d-title static' }, c.title),
    c.missing && h('p', { class: 'alert alert-warning alert-soft small' }, 'This has been removed where it lived. Your notes about it are kept here.'),
    !own && !c.missing && c.href && h('p', { class: 'ah-d-src' }, `Lives in ${sourceById[c.source]?.label ?? 'Dashi'}. `, h('a', { href: c.href }, 'Open it there →')),
    field(own ? 'Description' : 'Notes here', h('textarea', { class: 'textarea textarea-sm w-full', rows: 3, disabled: !editable, placeholder: own ? 'What it is and why it matters' : 'What this means for your work', value: it?.description ?? (own ? '' : ''),
      onchange: (e) => change((x) => { x.description = e.target.value; }, 'added notes') })),
    !own && c.description && h('p', { class: 'ah-d-desc' }, c.description),
    c.text != null && own && field('Note', h('textarea', { class: 'textarea textarea-sm w-full', rows: 6, disabled: !editable, value: c.text, onchange: (e) => change((x) => { x.text = e.target.value; }) })),
    h('div', { class: 'ah-field' }, h('span', {}, 'ABCD type'),
      h('div', { class: 'ah-abcd-pick', role: 'radiogroup', 'aria-label': 'ABCD type' }, ABCD.map((x) =>
        h('button', { type: 'button', role: 'radio', class: abcdNow === x.id ? 'on' : '', 'aria-checked': String(abcdNow === x.id), disabled: !editable, style: `--c:${x.color}`, title: x.hint,
          onclick: () => change((y) => { y.abcd = abcdNow === x.id ? null : x.id; }, `sorted “${c.title}” as ${x.label}`) }, icon(x.icon, 14), x.short)))),
    h('div', { class: 'ah-field' }, h('span', {}, 'Tags'), TagEditor(c, editable, change)),
    h('div', { class: 'ah-field' }, h('span', {}, 'Collections'),
      h('div', { class: 'ah-chips-wrap' },
        Object.values(hub.collections).sort((a, b) => a.name.localeCompare(b.name)).map((col) => {
          const on = c.collectionIds.includes(col.id);
          return h('button', { type: 'button', class: `ah-chip coll toggle${on ? ' on' : ''}`, style: `--c:${col.color ?? '#999'}`, disabled: !editable, 'aria-pressed': String(on),
            onclick: () => change((x) => { x.collectionIds = on ? x.collectionIds.filter((id) => id !== col.id) : [...x.collectionIds, col.id]; }, on ? null : `filed “${c.title}” in “${col.name}”`) }, col.name);
        }),
        editable && h('button', { type: 'button', class: 'ah-chip add', onclick: () => newCollection(null, [c]) }, icon('plus', 11), 'New'))),
    h('div', { class: 'ah-field' }, h('span', {}, 'Sensitivity'),
      h('div', { class: 'segmented ah-seg' }, SENSITIVITY.map((x) => h('button', { type: 'button', class: c.sensitivity === x.id ? 'on' : '', disabled: !editable, title: x.hint, 'aria-pressed': String(c.sensitivity === x.id),
        onclick: () => change((y) => { y.sensitivity = x.id; }, `marked “${c.title}” ${x.label.toLowerCase()}`) }, icon(x.icon, 13), x.label)))),
    own && Meta(c, editable, change),
    Related(c, editable, change),
    Comments(c, editable),
    h('dl', { class: 'ah-info' },
      c.file && [h('dt', {}, 'File'), h('dd', {}, `${c.file.name} · ${prettySize(c.file.size)}`)],
      it?.createdAt && [h('dt', {}, 'Added'), h('dd', {}, `${ago(it.createdAt)}${who(it.createdBy) ? ` by ${who(it.createdBy).name}` : ''}`)],
      c.updatedAt && [h('dt', {}, 'Changed'), h('dd', {}, `${ago(c.updatedAt)}${who(c.by) ? ` by ${who(c.by).name}` : ''}`)]),
    h('div', { class: 'ah-d-actions' },
      c.file && h('button', { class: 'btn btn-sm', onclick: async () => { const url = await mediaUrl(c.file.mediaId); if (url) window.open(c.group === 'image' || c.group === 'pdf' || c.group === 'audio' || c.group === 'video' ? url : `${url}${url.startsWith('blob:') ? '' : '?download'}`, '_blank', 'noopener'); } }, icon('download', 15), 'Open'),
      c.url && h('a', { class: 'btn btn-sm', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 15), 'Visit'),
      c.href && !c.url && !own && h('a', { class: 'btn btn-sm', href: c.href }, icon('arrowsIn', 15), 'Open in Dashi'),
      editable && own && h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: () => removeItems([c]) }, icon('trash', 15), 'Delete'),
      editable && !own && it && h('button', { class: 'btn btn-sm btn-ghost', title: 'Forget the tags, collections and notes kept here (the original stays)', onclick: async () => {
        if (!(await uiConfirm('Forget your notes, tags and collections for this? The original stays where it is.', { danger: false, ok: 'Forget them' }))) return;
        delete hub.items[it.id];
        save('cleared notes on an asset');
      } }, 'Forget notes')),
  ];
}

function Preview(c) {
  const box = h('div', { class: 'ah-preview' });
  const abcd = abcdById[c.abcd];
  box.style.setProperty('--abcd', abcd?.color ?? '#8a93a8');
  const plain = () => box.replaceChildren(h('div', { class: 'ah-preview-icon' }, icon(c.icon, 44)));
  if (c.sensitivity === 'restricted' && c.file) {
    box.replaceChildren(h('div', { class: 'ah-preview-icon' }, icon('lock', 36), h('small', {}, 'Restricted: open it on purpose')));
    return box;
  }
  if (c.thumb) { box.replaceChildren(h('img', { src: c.thumb, alt: '' })); return box; }
  if (c.file) {
    plain();
    mediaUrl(c.file.mediaId).then((url) => {
      if (!url) return box.replaceChildren(h('div', { class: 'ah-preview-icon' }, icon('warn', 36), h('small', {}, 'The file is no longer stored')));
      if (c.group === 'image') box.replaceChildren(h('img', { src: url, alt: c.item?.meta?.alt ?? '' }));
      else if (c.group === 'audio') box.replaceChildren(h('audio', { src: url, controls: true, preload: 'metadata' }));
      else if (c.group === 'video') box.replaceChildren(h('video', { src: url, controls: true, preload: 'metadata' }));
      else if (c.group === 'pdf') pdfFirstPage(url, 320).then((src) => { if (src) { box.classList.add('page'); box.replaceChildren(h('img', { src, alt: `First page of ${c.title}` })); } });
    }).catch(() => {});
    return box;
  }
  if (c.url) {
    let host = '';
    try { host = new URL(c.url).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
    box.replaceChildren(h('div', { class: 'ah-preview-icon' }, icon('link', 36), h('small', {}, host)));
    return box;
  }
  if (c.source === 'map' && docs.mapContents?.[c.ref?.id]) {
    plain();
    MiniMap(docs.mapContents[c.ref.id], { width: 300, height: 190, label: c.title }).then((s) => { box.classList.add('map'); box.replaceChildren(s); }).catch(() => {});
    return box;
  }
  box.classList.add('art');
  box.replaceChildren(h('img', { src: standIn(c.key, abcd?.color ?? '#7f8ba3'), alt: '' }), h('span', { class: 'ah-thumb-badge' }, icon(c.icon, 16)));
  return box;
}

function TagEditor(c, editable, change) {
  const known = tagCounts(allCards()).map((t) => t.tag);
  const listId = `ah-tags-${Math.random().toString(36).slice(2, 7)}`;
  const input = h('input', { class: 'ah-tag-input', placeholder: 'Add a tag', list: listId, 'aria-label': 'Add a tag', disabled: !editable,
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tags = cleanTags(input.value);
        if (tags.length) change((x) => { x.tags = [...new Set([...x.tags, ...tags])]; }, `tagged “${c.title}” ${tags.map((t) => `#${t}`).join(' ')}`);
      }
    } });
  return h('div', { class: 'ah-tagbox' },
    c.tags.map((t) => h('span', { class: 'ah-chip tag' }, `#${t}`, editable && h('button', { type: 'button', 'aria-label': `Remove ${t}`, onclick: () => change((x) => { x.tags = x.tags.filter((y) => y !== t); }) }, '×'))),
    (c.tagsFrom ?? []).filter((t) => !c.tags.includes(t)).map((t) => h('span', { class: 'ah-chip tag from', title: 'From the library' }, `#${t}`)),
    editable && input,
    h('datalist', { id: listId }, known.map((t) => h('option', { value: t }))));
}

function Meta(c, editable, change) {
  const m = c.item.meta ?? {};
  const row = (key, label, type = 'text') => h('label', { class: 'ah-meta-row' }, h('span', {}, label),
    h('input', { class: 'input input-xs', type, value: m[key] ?? '', disabled: !editable, onchange: (e) => change((x) => { x.meta = { ...x.meta, [key]: e.target.value.trim() }; }) }));
  return h('details', { class: 'ah-meta' }, h('summary', {}, 'Metadata'),
    row('creator', 'Made by'), row('date', 'Date', 'date'), row('source', 'Source or owner'), row('licence', 'Licence or permission'),
    row('location', 'Place'), row('language', 'Language'), c.group === 'image' && row('alt', 'Alt text'));
}

function Related(c, editable, change) {
  const cards = allCards();
  const rel = (c.item?.related ?? []).map((k) => cards.find((x) => x.key === k)).filter(Boolean);
  const back = cards.filter((x) => x.item?.related?.includes(c.key) && !rel.includes(x));
  return h('div', { class: 'ah-field' }, h('span', {}, `Related (${rel.length + back.length})`),
    h('ul', { class: 'ah-related' }, [...rel, ...back].map((x) => h('li', {},
      h('button', { type: 'button', class: 'ah-rel', onclick: () => select(x) }, icon(x.icon, 14), h('span', {}, x.title), h('small', {}, x.kindLabel)),
      editable && rel.includes(x) && h('button', { type: 'button', class: 'ah-x', 'aria-label': `Unlink ${x.title}`, onclick: () => change((y) => { y.related = y.related.filter((k) => k !== x.key); }) }, '×')))),
    editable && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => linkPicker(c, change) }, icon('plus', 13), 'Link another asset'));
}

async function linkPicker(c, change) {
  const cards = allCards().filter((x) => x.key !== c.key);
  let q = '';
  const chosen = new Set(c.item?.related ?? []);
  const list = h('ul', { class: 'pick-list' });
  const draw = () => list.replaceChildren(...searchCards(cards, q).slice(0, 50).map((x) => h('li', {},
    h('button', { type: 'button', class: `pick-row${chosen.has(x.key) ? ' on' : ''}`, onclick: () => { chosen.has(x.key) ? chosen.delete(x.key) : chosen.add(x.key); draw(); } },
      icon(x.icon, 16), h('span', { class: 'pick-text' }, h('strong', {}, x.title), h('small', {}, [x.kindLabel, x.sub].filter(Boolean).join(' · '))),
      h('span', { class: 'pick-state' }, chosen.has(x.key) ? [icon('check', 14), ' Linked'] : 'Link')))));
  draw();
  const { uiPanel } = await import('../ui/dialog.js');
  const ok = await uiPanel({ title: `Link assets to “${c.title}”`, ok: 'Save', cancel: 'Cancel', message: 'Related assets show on each other’s page, and as lines on the asset map.',
    build: () => h('div', { class: 'pick' }, h('input', { class: 'input input-sm w-full', type: 'search', placeholder: 'Find an asset', oninput: (e) => { q = e.target.value; draw(); } }), list) });
  if (ok) change((x) => { x.related = [...chosen]; }, `linked assets to “${c.title}”`);
}

function Comments(c, editable) {
  const list = c.item?.comments ?? [];
  const box = h('textarea', { class: 'textarea textarea-sm w-full', rows: 2, placeholder: 'Say something about this asset' });
  return h('div', { class: 'ah-field' }, h('span', {}, `Comments (${list.length})`),
    list.length ? h('ul', { class: 'ah-comments' }, list.map((m) => h('li', {}, Avatar(who(m.by) ?? { name: '?' }, 22),
      h('div', {}, h('p', {}, h('b', {}, who(m.by)?.name ?? 'Someone'), h('small', {}, ` · ${ago(m.at)}`)), h('p', {}, m.text))))) : null,
    editable && h('div', { class: 'ah-comment-new' }, box, h('button', { type: 'button', class: 'btn btn-xs btn-primary', onclick: () => {
      const text = box.value.trim();
      if (!text) return;
      const it = ensureItem(hub, c, me?.id);
      it.comments.push({ id: uid('cm'), by: me?.id ?? null, at: new Date().toISOString(), text: text.slice(0, 4000) });
      touch(hub, it, me?.id);
      save(`commented on “${c.title}”`, c.key);
    } }, 'Post')));
}

function openCard(c) {
  if (c.href && !c.item?.kind?.match(/file|note/)) { location.href = c.href; return; }
  select(c);
}

/* ------------------------------------------------------------------ adding */
const ALLOWED = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|epub|zip|png|jpe?g|gif|webp|txt|md|csv|json|bib|ris|mp3|wav|m4a|mp4|m4v|mov|webm)$/i;

function upload(files) {
  if (!canEdit || !files.length) return;
  const limit = maxUploadMb();
  const into = scope().coll && hub.collections[scope().coll] ? scope().coll : null;
  for (const file of files) {
    const job = { id: uid('up'), name: file.name, size: file.size, progress: 0, state: 'waiting', error: null };
    uploads.push(job);
    if (!ALLOWED.test(file.name)) { job.state = 'failed'; job.error = 'This kind of file can’t be kept here (no web pages or programs).'; continue; }
    if (file.size > limit * 1048576) { job.state = 'failed'; job.error = `Larger than ${limit} MB, the most your plan takes.`; continue; }
    job.file = file;
    job.into = into;
  }
  drawTray();
  pump();
}

let running = 0;
async function pump() {
  while (running < 2) {
    const job = uploads.find((j) => j.state === 'waiting');
    if (!job) break;
    running += 1;
    job.state = 'sending';
    drawTray();
    (async () => {
      try {
        const mediaId = await putMedia(job.file, { kind: 'asset', onProgress: (p) => { job.progress = p; drawTray(); } });
        const g = FILE_GROUPS.find((x) => x.test(job.file.type, job.file.name));
        const it = newItem(hub, {
          kind: 'file', title: job.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || job.file.name,
          file: { mediaId, name: job.file.name, size: job.file.size, type: job.file.type },
          collectionIds: job.into ? [job.into] : [], abcd: g?.id === 'audio' || g?.id === 'video' ? 'cultural' : null,
        }, me?.id);
        job.state = 'done';
        job.key = it.id;
        save(`uploaded “${it.title}”`, it.id);
      } catch (err) {
        job.state = 'failed';
        job.error = err.message;
      } finally {
        running -= 1;
        drawTray();
        pump();
      }
    })();
  }
}

function drawTray() {
  const live = uploads.filter((j) => j.state !== 'cleared');
  tray.hidden = !live.length;
  if (!live.length) return;
  const done = live.filter((j) => j.state === 'done').length;
  const sending = live.filter((j) => j.state === 'sending' || j.state === 'waiting');
  const bytes = sending.reduce((n, j) => n + j.size, 0), sent = sending.reduce((n, j) => n + j.size * j.progress, 0);
  fill(tray, 
    h('div', { class: 'ah-tray-head' },
      h('strong', {}, sending.length ? `Uploading ${sending.length}… ${bytes ? Math.round((sent / bytes) * 100) : 0}%` : `${done} uploaded`),
      h('span', { class: 'spacer' }),
      !sending.length && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { for (const j of live) j.state = 'cleared'; drawTray(); } }, 'Done')),
    h('ul', {}, live.slice(-8).map((j) => h('li', { class: j.state },
      icon(j.state === 'done' ? 'check' : j.state === 'failed' ? 'warn' : 'cloudUpload', 15),
      h('div', { class: 'ah-tray-file' }, h('span', { title: j.name }, j.name), j.error ? h('small', {}, j.error) : h('small', {}, `${prettySize(j.size)}${j.state === 'sending' ? ` · ${Math.round(j.progress * 100)}%` : ''}`),
        j.state === 'sending' && h('progress', { class: 'progress progress-primary', value: j.progress, max: 1 })),
      j.state === 'done' && j.key && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => select(allCards().find((c) => c.key === j.key) ?? { key: j.key }) }, 'Show')))));
}

// Drop files anywhere on the page.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || !canEdit) return;
  dragDepth += 1;
  dropCover.hidden = false;
  const coll = hub.collections[scope().coll];
  dropCover.querySelector('.ah-drop-where').textContent = coll ? `into “${coll.name}”` : 'into the Asset manager';
});
document.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; dropCover.hidden = true; } });
document.addEventListener('dragover', (e) => { if (hasFiles(e) && canEdit) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropCover.hidden = true;
  upload([...e.dataTransfer.files]);
});

async function newLink() {
  const v = await uiForm({ title: 'Add a link', ok: 'Add link', fields: [
    { name: 'url', label: 'Web address', type: 'url', required: true, placeholder: 'https://' },
    { name: 'title', label: 'Title', placeholder: 'What it is' },
    { name: 'description', label: 'Why it matters', type: 'textarea' },
  ], validate: ({ url }) => { let u; try { u = new URL(url); } catch { throw new Error('That doesn’t look like a web address.'); } if (!/^https?:$/.test(u.protocol)) throw new Error('Links must start with http:// or https://'); } });
  if (!v) return;
  const it = newItem(hub, { kind: 'link', url: v.url.trim(), title: v.title.trim() || new URL(v.url).hostname.replace(/^www\./, ''), description: v.description, collectionIds: scope().coll ? [scope().coll] : [] }, me?.id);
  save(`added the link “${it.title}”`, it.id);
  select(allCards().find((c) => c.key === it.id));
}

async function newNote() {
  const v = await uiForm({ title: 'Add a note', ok: 'Add note', wide: true, fields: [
    { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Marguerite’s bannock workshop' },
    { name: 'text', label: 'Note', type: 'textarea', rows: 6, placeholder: 'A story, a skill someone offered, a place you can use, an idea' },
    { name: 'abcd', label: 'ABCD type', type: 'select', value: scope().abcd ?? '', options: [{ id: '', label: 'Not sure yet' }, ...ABCD.map((x) => ({ id: x.id, label: `${x.label}: ${x.hint}` }))] },
  ] });
  if (!v) return;
  const it = newItem(hub, { kind: 'note', title: v.title.trim(), text: v.text, abcd: v.abcd || null, collectionIds: scope().coll ? [scope().coll] : [] }, me?.id);
  save(`added the note “${it.title}”`, it.id);
  select(allCards().find((c) => c.key === it.id));
}

const COLOURS = ['#0f7f9c', '#13897a', '#d9893a', '#a45ab8', '#3d6fc4', '#c03a64', '#7f8f3a', '#56657f'];
async function newCollection(parentId = null, cards = []) {
  const v = await uiForm({ title: parentId ? `New collection in “${hub.collections[parentId]?.name}”` : 'New collection', ok: 'Create', fields: [
    { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Partners in the north' },
    { name: 'description', label: 'What goes here', type: 'textarea', rows: 2 },
    { name: 'color', label: 'Colour', type: 'select', value: COLOURS[Object.keys(hub.collections).length % COLOURS.length], options: COLOURS.map((c, i) => ({ id: c, label: ['Lake', 'Teal', 'Ochre', 'Plum', 'Blue', 'Rose', 'Moss', 'Slate'][i] })) },
  ] });
  if (!v) return;
  const id = uid('coll');
  hub.collections[id] = { id, name: v.name.trim(), description: v.description, color: v.color, parentId, createdAt: new Date().toISOString(), createdBy: me?.id ?? null };
  for (const c of cards) { const it = ensureItem(hub, c, me?.id); it.collectionIds.push(id); touch(hub, it, me?.id); }
  save(`made the collection “${v.name.trim()}”`);
}

async function renameCollection(c) {
  const name = await uiPrompt('Name', c.name, { title: 'Rename collection', ok: 'Rename' });
  if (!name?.trim()) return;
  c.name = name.trim();
  save(`renamed a collection to “${c.name}”`);
}

async function deleteCollection(c) {
  const inner = collectionTree(hub, c.id);
  if (!(await uiConfirm(`Delete the collection “${c.name}”${inner.size > 1 ? ` and the ${inner.size - 1} inside it` : ''}? The assets in it stay.`))) return;
  for (const id of inner) delete hub.collections[id];
  for (const it of Object.values(hub.items)) it.collectionIds = it.collectionIds.filter((id) => !inner.has(id));
  for (const k of inner) delete hub.positions[k];
  if (inner.has(scope().coll)) go({});
  save(`deleted the collection “${c.name}”`);
}

async function removeItems(cards) {
  const own = cards.filter((c) => c.item && c.item.kind !== 'ref');
  if (!own.length) return;
  if (!(await uiConfirm(own.length === 1 ? `Delete “${own[0].title}”? Its file is removed for good.` : `Delete ${own.length} assets? Their files are removed for good.`))) return;
  for (const c of own) {
    if (c.item.file?.mediaId) {
      // Only remove the stored file if nothing else in the Asset manager uses it.
      const shared = Object.values(hub.items).some((x) => x !== c.item && x.file?.mediaId === c.item.file.mediaId);
      if (!shared) deleteMedia(c.item.file.mediaId).catch?.(() => {});
    }
    delete hub.items[c.item.id];
    for (const x of Object.values(hub.items)) x.related = (x.related ?? []).filter((k) => k !== c.key);
    selection.delete(c.key);
  }
  if (own.some((c) => c.key === focusKey)) focusKey = null;
  save(own.length === 1 ? `deleted “${own[0].title}”` : `deleted ${own.length} assets`);
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size && canEdit) {
    const cards = allCards().filter((c) => selection.has(c.key));
    if (cards.some((c) => c.item && c.item.kind !== 'ref')) { e.preventDefault(); removeItems(cards); }
  }
  if (e.key === '/' ) { e.preventDefault(); sideEl.querySelector('input[type=search]')?.focus(); }
  if (e.key === 'Escape' && selection.size) { selection = new Set(); focusKey = null; render(); }
});

render();
// Handy for poking at things from the browser console.
window.assetHub = { get hub() { return hub; }, allCards, keyOf };
