import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { uiConfirm, uiPrompt, uiAlert } from '../ui/dialog.js';
import { Markdown } from '../ui/markdown.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadAssets, loadMaps, loadLibrary, loadPodcasts, loadStrategy, loadStudio, loadPlace } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { loadHelp } from '../platform/help.js';
import { HELP_SHOTS } from '../help/library.js';
import { enabledPlugins, linkTo } from '../plugins.js';
import { WHEEL, inkOn } from '../ui/wheel.js';
import { buildFacts, typeLabel } from '../rhizome/facts.js';
import { addPlaceFacts } from './facts.js';
import { PLACE_KINDS, kindById, kindLabel, LAYERS, geoOfPin, onTheMap, pinsAt, placesWithin, placeTrail, newPlaceId, boundsOf, formatGeo, migratePlace, featuresFromCsv, featuresFromGeoJSON, featureName, pointsOfFeatures, newDataId, DATA_COLOURS, MAX_FEATURES } from './model.js';
import { BASEMAPS, basemapsFor, baseStyle } from './basemaps.js';
import { PLACE_HELP, PLACE_HELP_ID } from './help.js';

/**
 * Place (stages 1 and 2, experimental): Dashi's work on a real map, for
 * place-based development. MapLibre GL draws the map (vendor/maplibre, the
 * CSP build: its worker is a file, never a blob).
 *
 *   #map               the map
 *   #map/<placeId>     the map, with that place's tray open
 *   #pin/<entityKey>   the map, with that pin's tray open
 *   #show/<ids>        things sent from elsewhere (Rhizome's findings), picked out
 *   #data/<id>[/<n>]   a data layer (a file brought in, or your drawings), or one feature in it (stage 2)
 *   #places            every place, by kind
 *   #about[/<page>]    the quick reference, and the same tutorials as Help
 *
 * Pins point at things by their Rhizome fact id; the facts (built here
 * with the plugins this person can open) give each its name and type.
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'place', org });
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');
app.classList.add('frame', 'pl-app');
let side = h('nav');
const main = h('section', { class: 'palette-main pl-main' });
app.replaceChildren(side, main);

const canEdit = canWriteDoc('place');
let doc = loadPlace();
const docs = (() => {
  const maps = plugins.has('mapper') ? loadMaps() : null;
  return {
    org, maps, mapContents: maps ? loadAllMaps(maps) : {},
    assets: plugins.has('assets') ? loadAssets() : null,
    library: plugins.has('library') ? loadLibrary() : null,
    podcasts: plugins.has('podcasts') ? loadPodcasts() : null,
    strategy: plugins.has('strategy') ? loadStrategy() : null,
    studio: plugins.has('studio') ? loadStudio() : null,
    place: doc,
  };
})();
let facts = null;
function rebuild() {
  docs.place = doc;
  facts = addPlaceFacts(buildFacts(docs, { plugins: new Set([...plugins, 'place']) }), doc);
}
rebuild();
function save(note) {
  doc = migratePlace(doc);
  saveDoc('place', doc);
  rebuild();
  if (note) toast(note);
  drawOverlays();
  render();
}

/* ------------------------------------------------------------ colours */

const hex = (id) => WHEEL.find((w) => w.id === id)?.hex ?? '#56657f';
const KIND_COLOURS = { community: hex('teal'), neighbourhood: hex('green'), site: hex('amber'), landmark: hex('mint'), region: hex('blue') };
const CATEGORY_COLOURS = { community: hex('green'), ally: hex('teal'), resource: hex('amber'), gatekeeper: hex('violet'), problem: hex('red'), other: '#8a919c' };
const SOURCE_COLOURS = { episode: hex('orchid'), library: hex('blue'), asset: hex('coral') };
const INK = '#16181d';

/** What sort of thing a pin is, for its layer and its dot. */
function sortOf(key) {
  const e = facts.entities[key];
  if (!e) return null;
  if (e.type === 'actor') return { layer: 'actors', colour: CATEGORY_COLOURS[e.attrs.category] ?? CATEGORY_COLOURS.other, label: e.attrs.category ? `Actor · ${e.attrs.category}` : 'Actor' };
  const src = key.split(':')[0];
  const label = src === 'episode' ? 'Story (episode)' : src === 'library' ? 'Document' : e.attrs.kindLabel || typeLabel(e.type);
  return { layer: 'assets', colour: SOURCE_COLOURS[src] ?? SOURCE_COLOURS.asset, label };
}
const nameOf = (key) => facts.entities[key]?.name ?? key;
/** The same actor is on several ecosystem maps; on Place it's one thing. */
const twinKey = (key) => {
  const e = facts.entities[key];
  return e?.type === 'actor' ? `actor-name:${e.name.toLowerCase()}` : key;
};

/** Where to open a pinned thing in its own plugin (only if the person can). */
function openIn(key) {
  const e = facts.entities[key];
  if (!e) return null;
  const [src, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (e.type === 'actor') { const href = linkTo('mapper', `#${rest.includes('/') ? rest : e.attrs.mapId}`); return href && { href, label: `Open on ${facts.entities[`map:${e.attrs.mapId}`]?.name ?? 'its map'}` }; }
  if (src === 'episode') { const href = linkTo('podcasts', `#episodes/${rest}`); return href && { href, label: 'Open the episode' }; }
  if (src === 'library') { const href = linkTo('library', '#files/all'); return href && { href, label: 'Open the Library' }; }
  const href = linkTo('assets');
  return href && { href, label: 'Open in Assets' };
}

/* ------------------------------------------------------------ routes */

const route = () => {
  const raw = location.hash.slice(1) || 'map';
  const i = raw.indexOf('/');
  return i < 0 ? [raw, ''] : [raw.slice(0, i), decodeURIComponent(raw.slice(i + 1))];
};
const onMap = (view) => ['map', 'pin', 'show', 'data'].includes(view);
const n = (count, word, plural = `${word}s`) => `${count.toLocaleString()} ${count === 1 ? word : plural}`;

function render() {
  const [view, arg] = route();
  drawSide(view, arg);
  if (onMap(view)) {
    if (!mapPage.isConnected) main.replaceChildren(mapPage);
    main.classList.add('pl-main-map');
    mapPage.querySelector('.plugin-header')?.replaceWith(tabs('map'));
    openTray(view, arg);
    map?.resize();
    return;
  }
  main.classList.remove('pl-main-map');
  setPicking(null);
  main.replaceChildren(view === 'places' ? Places() : view === 'about' ? About(arg) : Places());
  main.scrollTop = 0;
}
addEventListener('hashchange', render);

const tabs = (current) => PluginHeader('place', {
  tabs: [
    { id: 'map', label: 'Map', icon: 'mapTrifold' },
    { id: 'places', label: 'Places', icon: 'pin' },
    { id: 'about', label: 'About', icon: 'help' },
  ],
  current,
  actions: current === 'map' && canEdit ? [
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => setPicking({ kind: 'new-place' }) }, icon('plus', 15), 'Add place'),
  ] : null,
});

/* ------------------------------------------------------------ side nav */

function drawSide(view, arg) {
  const counts = layerCounts();
  const bases = basemapsFor(doc);
  side = swapSide(side, SideNav({ label: 'Place', sections: [
    { title: 'Place · experimental', items: [
      { label: 'Map', sub: `${n(Object.keys(doc.places).length, 'place')} · ${n(Object.keys(doc.pins).length, 'pin')}`, icon: 'mapTrifold', href: '#map', on: onMap(view) },
      { label: 'Places', sub: 'Every place, by kind', icon: 'pin', href: '#places', on: view === 'places' },
      { label: 'About', sub: 'Quick reference and tutorials', icon: 'help', href: '#about', on: view === 'about' },
    ] },
    { title: 'Layers', items: LAYERS.map((l) => ({
      label: l.label, sub: counts[l.id] != null ? `${l.sub} · ${counts[l.id]}` : l.sub, icon: l.icon,
      badge: doc.layers[l.id]?.on ? 'On' : 'Off', badgeClass: doc.layers[l.id]?.on ? 'pl-badge-on' : 'badge-ghost',
      on: !!doc.layers[l.id]?.on,
      onclick: () => toggleLayer(l.id),
    })) },
    { title: 'Data layers', action: canEdit ? { label: 'Bring in a file', icon: 'upload', onclick: () => fileIn.click() } : null, items: [
      ...Object.values(doc.data ?? {}).map((l) => ({
        label: l.name, sub: `${n(l.features.length, l.source === 'drawing' ? 'drawing' : 'feature')} · ${l.source === 'csv' ? 'CSV' : l.source === 'drawing' ? 'drawn here' : 'GeoJSON'}`,
        lead: h('span', { class: 'pl-data-swatch', style: `--c:${hex(l.colour)}` }),
        badge: l.on ? 'On' : 'Off', badgeClass: l.on ? 'pl-badge-on' : 'badge-ghost',
        href: `#data/${encodeURIComponent(l.id)}`, on: view === 'data' && arg.split('/')[0] === l.id,
      })),
      canEdit && { label: 'Bring in a file', sub: 'CSV with latitude and longitude, or GeoJSON', icon: 'upload', onclick: () => fileIn.click() },
      !Object.keys(doc.data ?? {}).length && !canEdit && { label: 'No data layers yet', sub: 'An editor can bring in a file', icon: 'info' },
    ].filter(Boolean) },
    { title: 'Base map', items: BASEMAPS.map((b) => ({
      label: b.label, sub: b.sub, icon: b.icon, on: doc.basemap === b.id,
      disabled: !bases.includes(b), onclick: bases.includes(b) ? () => setBasemap(b.id) : null,
    })) },
    { title: 'Coming next', items: [
      { label: 'Place profiles', sub: 'Stage 3: what’s here, gaps, the asset map', icon: 'lightbulb' },
      { label: 'Rhizome on the map', sub: 'Stage 4: findings and tips as a layer', icon: 'sec-rhizome' },
    ] },
  ] }));
  side.classList.add('pl-side');
}

function toggleLayer(id) {
  doc.layers[id] = { ...(doc.layers[id] ?? {}), on: !doc.layers[id]?.on };
  // Layers are a view choice: anyone can flip them; only editors keep the choice.
  if (canEdit) saveDoc('place', doc);
  drawOverlays();
  drawSide(...route());
}
function setBasemap(id) {
  if (doc.basemap === id) return;
  doc.basemap = id;
  if (canEdit) saveDoc('place', doc);
  loadBase();
  drawSide(...route());
}

/* ------------------------------------------------------------ the map */

const maplibregl = globalThis.maplibregl;
if (maplibregl) maplibregl.setWorkerUrl('vendor/maplibre/maplibre-gl-csp-worker.js');
const mapEl = h('div', { class: 'pl-map', role: 'region', 'aria-label': 'Map' });
const trayEl = h('aside', { class: 'pl-tray', hidden: true, 'aria-live': 'polite' });
const hintEl = h('div', { class: 'pl-hint', hidden: true });
const noteEl = h('div', { class: 'pl-banner', hidden: true });
const tools = h('div', { class: 'pl-tools' },
  h('button', { class: 'btn btn-xs', title: 'Fit everything', onclick: () => fitAll() }, icon('fit', 14), 'Fit everything'),
  canEdit && h('span', { class: 'pl-tools-group', role: 'group', 'aria-label': 'Draw on the map' },
    h('button', { class: 'btn btn-xs', title: 'Draw a point', onclick: () => startDraw('point') }, icon('pin', 14), 'Point'),
    h('button', { class: 'btn btn-xs', title: 'Draw a line: a route, a walk, a boundary', onclick: () => startDraw('line') }, icon('flow', 14), 'Line'),
    h('button', { class: 'btn btn-xs', title: 'Draw an area', onclick: () => startDraw('area') }, icon('mapTrifold', 14), 'Area')),
  canEdit && h('button', { class: 'btn btn-xs', title: 'Bring in a CSV (latitude and longitude columns) or a GeoJSON file', onclick: () => fileIn.click() }, icon('upload', 14), 'Add data'));
/* A file brought in becomes a data layer (stage 2). */
const fileIn = h('input', { type: 'file', class: 'sr-only', accept: '.csv,.tsv,.txt,.geojson,.json,text/csv,application/geo+json,application/json', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) bringIn(f); } });
document.body.append(fileIn);
const mapPage = h('div', { class: 'pl-page pl-page-map' }, tabs('map'), h('div', { class: 'pl-stage' }, mapEl, tools, hintEl, noteEl, trayEl));
const dark = document.documentElement.dataset.mode === 'dark';
let map = null;
let baseFailed = false;

function allPoints() {
  const pts = Object.values(doc.places).filter((p) => p.kind !== 'region').map((p) => p.geo);
  for (const pin of Object.values(doc.pins)) { const g = geoOfPin(doc, pin); if (onTheMap(g)) pts.push(g); }
  return pts;
}
function fitAll(animate = true) {
  if (!map) return;
  const b = boundsOf(allPoints());
  if (b) map.fitBounds(b, { padding: trayPad(), maxZoom: 15, duration: animate ? 600 : 0 });
}

function startMap() {
  if (!maplibregl) {
    mapEl.replaceChildren(h('div', { class: 'pl-nomap' }, h('h3', {}, 'The map couldn’t start'), h('p', {}, 'This browser couldn’t load the map library. Places and pins are still listed under Places.')));
    return;
  }
  const v = lastView() ?? doc.view;
  map = new maplibregl.Map({
    container: mapEl,
    style: baseStyle(doc.basemap, { drawn: doc.drawn, dark }),
    center: v ? [v.lng, v.lat] : [-63.6, 44.6],
    zoom: v?.zoom ?? (Object.keys(doc.places).length ? 10 : 3),
    attributionControl: { compact: true },
    dragRotate: true,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  map.on('style.load', () => { addOverlayLayers(); drawOverlays(); });
  map.once('load', () => {
    streetNote();
    if (selected.place || selected.pin || selected.show.length) flyToSelection();
    else if (!v) fitAll(false);
  });
  // Sites (a hall, a street) crowd their town's label when zoomed out: they show from street level in.
  const zoomClass = () => mapEl.classList.toggle('far', map.getZoom() < 12.6);
  map.on('zoom', zoomClass);
  zoomClass();
  map.on('error', (e) => {
    // The street map's tiles didn't come (offline, or blocked): say so once, and keep going.
    const msg = String(e?.error?.message ?? '');
    if (doc.basemap === 'street' && !baseFailed && /tile|fetch|Failed|load|Forbidden|40\d|AJAX/i.test(msg)) {
      baseFailed = true;
      const refused = /Forbidden|403|429|418/.test(msg);
      showNote(refused
        ? 'The street map’s tile server refused the tiles. OpenStreetMap’s free tiles are for light testing only; a live Dashi needs its own tile host.'
        : doc.drawn ? 'The street map’s tiles didn’t load. Try the drawn map, which works offline.' : 'The street map’s tiles didn’t load (no internet?). Your places and links still show.');
    }
  });
  map.on('click', (e) => onMapClick(e));
  map.on('mouseenter', 'pl-areas-fill', () => { if (!picking) map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'pl-areas-fill', () => { if (!picking) map.getCanvas().style.cursor = ''; });
  // Where each person last looked stays in their browser, not in the shared document.
  map.on('moveend', () => {
    const c = map.getCenter();
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: +map.getZoom().toFixed(2) })); } catch { /* private window */ }
  });
}
const VIEW_KEY = `dashi.place-view.${org.id}`;
function lastView() {
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY)); return Number.isFinite(v?.lat) && Number.isFinite(v?.lng) ? v : null; } catch { return null; }
}
function loadBase() {
  if (!map) return;
  baseFailed = false;
  showNote(null);
  map.setStyle(baseStyle(doc.basemap, { drawn: doc.drawn, dark }));
  streetNote();
}
/**
 * Alpha 0.4 triage: the street map looked empty for Kestrel Bay. Kestrel is made up and drawn
 * out at sea (src/place/kestrel.js), so real street tiles there are open water. Say so.
 */
function streetNote() {
  if (doc.basemap === 'street' && doc.drawn) showNote('These places sit on your drawn map. On the street map they are out at sea, so it shows only water here. Switch to the drawn map to see the coast and roads.');
}
function showNote(text) {
  noteEl.hidden = !text;
  noteEl.replaceChildren(text ? h('span', {}, icon('info', 14), text) : '', text ? h('button', { class: 'btn btn-ghost btn-xs', onclick: () => showNote(null), 'aria-label': 'Dismiss' }, icon('close', 12)) : '');
}

/* GeoJSON overlays: outlines, links and who serves where. */
const empty = () => ({ type: 'FeatureCollection', features: [] });
function addOverlayLayers() {
  for (const id of ['pl-areas', 'pl-links', 'pl-serves', 'pl-show']) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() });
  const add = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
  add({ id: 'pl-areas-fill', type: 'fill', source: 'pl-areas', filter: ['!=', ['get', 'kind'], 'region'], paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': ['case', ['get', 'on'], 0.32, 0.14] } });
  add({ id: 'pl-areas-line', type: 'line', source: 'pl-areas', filter: ['!=', ['get', 'kind'], 'region'], paint: { 'line-color': ['get', 'colour'], 'line-width': ['case', ['get', 'on'], 3, 1.6] } });
  add({ id: 'pl-region-line', type: 'line', source: 'pl-areas', filter: ['==', ['get', 'kind'], 'region'], paint: { 'line-color': ['get', 'colour'], 'line-width': 1.6, 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
  add({ id: 'pl-serves', type: 'line', source: 'pl-serves', layout: { 'line-cap': 'round' }, paint: { 'line-color': hex('amber'), 'line-width': 2, 'line-dasharray': [1, 2], 'line-opacity': 0.95 } });
  add({ id: 'pl-links', type: 'line', source: 'pl-links', filter: ['!', ['get', 'speculative']], layout: { 'line-cap': 'round' }, paint: { 'line-color': INK, 'line-width': ['+', 0.6, ['*', 0.6, ['get', 'count']]], 'line-opacity': 0.38 } });
  add({ id: 'pl-links-spec', type: 'line', source: 'pl-links', filter: ['get', 'speculative'], paint: { 'line-color': INK, 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0.4 } });
  // Data layers and drawings (stage 2), under the places and pins.
  for (const id of ['pl-data', 'pl-draft']) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() });
  const isPoly = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
  const isLine = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
  const isPoint = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
  add({ id: 'pl-data-fill', type: 'fill', source: 'pl-data', filter: isPoly, paint: { 'fill-color': ['get', '_c'], 'fill-opacity': ['case', ['get', '_on'], 0.38, 0.18] } });
  add({ id: 'pl-data-line', type: 'line', source: 'pl-data', filter: ['any', isLine, isPoly], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', '_c'], 'line-width': ['case', ['get', '_on'], 4, 2.2] } });
  add({ id: 'pl-data-point', type: 'circle', source: 'pl-data', filter: isPoint, paint: { 'circle-radius': ['case', ['get', '_on'], 8, 5], 'circle-color': ['get', '_c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
  add({ id: 'pl-draft-line', type: 'line', source: 'pl-draft', paint: { 'line-color': INK, 'line-width': 2, 'line-dasharray': [2, 1] } });
  add({ id: 'pl-draft-fill', type: 'fill', source: 'pl-draft', filter: isPoly, paint: { 'fill-color': INK, 'fill-opacity': 0.12 } });
  add({ id: 'pl-draft-point', type: 'circle', source: 'pl-draft', filter: isPoint, paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': INK, 'circle-stroke-width': 2 } });
  add({ id: 'pl-show', type: 'circle', source: 'pl-show', paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': INK, 'circle-stroke-width': 2.5 } });
}

let markers = [];
let selected = { place: null, pin: null, show: [], data: null };

/** Things with a spot of their own, one dot per spot (an actor on three maps is one dot). */
function thingDots() {
  const dots = new Map();
  for (const [key, pin] of Object.entries(doc.pins)) {
    const s = sortOf(key);
    const g = geoOfPin(doc, pin);
    if (!s || !g || g.precision !== 'exact') continue;
    const id = `${twinKey(key)}@${g.lat.toFixed(5)},${g.lng.toFixed(5)}`;
    if (!dots.has(id)) dots.set(id, { keys: [], geo: g, sort: s });
    dots.get(id).keys.push(key);
  }
  // Things whose own plugin gave them a spot (an actor's geo on its map), with no pin in Place.
  for (const e of Object.values(facts.entities)) {
    const g = e.attrs.geo;
    if (doc.pins[e.id] || e.type === 'place' || g?.precision !== 'exact') continue;
    const s = sortOf(e.id);
    if (!s) continue;
    const id = `${twinKey(e.id)}@${g.lat.toFixed(5)},${g.lng.toFixed(5)}`;
    if (!dots.has(id)) dots.set(id, { keys: [], geo: g, sort: s });
    dots.get(id).keys.push(e.id);
  }
  return [...dots.values()];
}
/** Where an actor sits on the map: its own spot, else its place's point. */
const pointOf = (key) => { const g = doc.pins[key] ? geoOfPin(doc, doc.pins[key]) : facts.entities[key]?.attrs.geo; return onTheMap(g) ? g : null; };

function layerCounts() {
  const dots = facts ? thingDots() : [];
  return {
    places: Object.keys(doc.places).length,
    areas: Object.values(doc.places).filter((p) => p.area).length,
    actors: dots.filter((d) => d.sort.layer === 'actors').length,
    assets: dots.filter((d) => d.sort.layer === 'assets').length,
    links: facts ? linkFeatures().length : 0,
    serves: facts ? servesFeatures().length : 0,
  };
}

function linkFeatures() {
  const pairs = new Map();
  for (const r of facts.relations) {
    if (r.kind !== 'link') continue;
    const a = pointOf(r.from), b = pointOf(r.to);
    if (!a || !b || (a.lat === b.lat && a.lng === b.lng)) continue;
    const [k1, k2] = [twinKey(r.from), twinKey(r.to)].sort();
    const id = `${k1}|${k2}`;
    if (!pairs.has(id)) pairs.set(id, { a, b, count: 0, speculative: true, rels: [] });
    const p = pairs.get(id);
    p.count++;
    if (r.basis !== 'speculative') p.speculative = false;
    p.rels.push(r);
  }
  return [...pairs.values()].map((p) => ({ type: 'Feature', properties: { count: Math.min(p.count, 4), speculative: p.speculative }, geometry: { type: 'LineString', coordinates: arc(p.a, p.b) } }));
}
/**
 * A gentle curve from a to b (a quadratic Bézier, bowed to one side by a
 * fifth of its length), so links that share a corridor fan out instead of
 * piling onto one straight line.
 */
function arc(a, b, bend = 0.2, steps = 18) {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (b.lng - a.lng) * k, dy = b.lat - a.lat;
  const c = { x: (a.lng * k + b.lng * k) / 2 - dy * bend, y: (a.lat + b.lat) / 2 + dx * bend };
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([+((u * u * a.lng * k + 2 * u * t * c.x + t * t * b.lng * k) / k).toFixed(6), +(u * u * a.lat + 2 * u * t * c.y + t * t * b.lat).toFixed(6)]);
  }
  return out;
}
function servesFeatures() {
  const out = new Map();
  for (const [key, pin] of Object.entries(doc.pins)) {
    const from = pointOf(key);
    if (!from || !sortOf(key)) continue;
    for (const s of pin.serves ?? []) {
      const place = doc.places[s];
      if (!place || place.kind === 'region' || s === pin.placeId) continue;
      const id = `${twinKey(key)}>${s}`;
      if (!out.has(id)) out.set(id, { type: 'Feature', properties: { key, place: s }, geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [place.geo.lng, place.geo.lat]] } });
    }
  }
  return [...out.values()];
}

function drawOverlays() {
  if (!map) { drawMarkers(); return; }
  let ready = null;
  try { ready = map.getSource('pl-areas'); } catch { /* the style is still loading */ }
  if (!ready) { drawMarkers(); return; }
  const on = (id) => !!doc.layers[id]?.on;
  const set = (id, data) => map.getSource(id)?.setData(data);
  set('pl-areas', { type: 'FeatureCollection', features: on('areas') ? Object.values(doc.places).filter((p) => p.area).map((p) => ({ type: 'Feature', id: p.id, properties: { id: p.id, kind: p.kind, colour: KIND_COLOURS[p.kind], on: selected.place === p.id }, geometry: p.area })) : [] });
  set('pl-links', { type: 'FeatureCollection', features: on('links') ? linkFeatures() : [] });
  set('pl-serves', { type: 'FeatureCollection', features: on('serves') ? servesFeatures() : [] });
  set('pl-data', { type: 'FeatureCollection', features: dataFeatures() });
  drawDraft();
  set('pl-show', { type: 'FeatureCollection', features: selected.show.map((k) => pointOf(k)).filter(Boolean).map((g) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [g.lng, g.lat] } })) });
  drawMarkers();
}

function drawMarkers() {
  for (const m of markers) m.remove();
  markers = [];
  if (!map) return;
  const on = (id) => !!doc.layers[id]?.on;
  const add = (el, g, anchor = 'center') => markers.push(new maplibregl.Marker({ element: el, anchor }).setLngLat([g.lng, g.lat]).addTo(map));
  for (const d of thingDots()) {
    if (!on(d.sort.layer)) continue;
    const key = d.keys[0];
    const pinned = d.keys.includes(selected.pin) || d.keys.some((k) => selected.show.includes(k));
    const el = h('button', {
      class: `pl-dot ${d.sort.layer === 'actors' ? 'actor' : 'asset'}${pinned ? ' on' : ''}`, style: `--c:${d.sort.colour}`,
      title: `${nameOf(key)} · ${d.sort.label}${d.keys.length > 1 ? ` · on ${d.keys.length} maps` : ''}`,
      'aria-label': nameOf(key),
      onclick: (e) => { e.stopPropagation(); if (!picking) location.hash = `#pin/${encodeURIComponent(key)}`; },
    });
    add(el, d.geo);
  }
  if (on('places')) {
    for (const p of Object.values(doc.places)) {
      const { here } = pinsAt(doc, p.id);
      const count = new Set(here.filter((k) => facts.entities[k]).map(twinKey)).size;
      const region = p.kind === 'region';
      const el = h('button', {
        class: `pl-label ${p.kind}${region ? ' region' : ''}${selected.place === p.id || selected.show.includes(`place:${p.id}`) ? ' on' : ''}`, style: `--c:${KIND_COLOURS[p.kind]};--ink:${inkOn(KIND_COLOURS[p.kind])}`,
        title: `${p.name} · ${kindLabel(p.kind)}`,
        onclick: (e) => { e.stopPropagation(); if (!picking) location.hash = `#map/${encodeURIComponent(p.id)}`; },
      }, h('span', { class: 'pl-label-name' }, p.name), !region && count ? h('span', { class: 'pl-label-count' }, String(count)) : null);
      add(el, p.geo, region ? 'center' : 'bottom');
    }
  }
}

/* Clicking the map: picking a spot, or opening the place under the click. */
let picking = null;
function setPicking(p) {
  picking = p;
  hintEl.hidden = !p;
  mapEl.classList.toggle('picking', !!p);
  if (map) map.getCanvas().style.cursor = p ? 'crosshair' : '';
  if (p) hintEl.replaceChildren(icon('pin', 14), h('span', {}, p.kind === 'new-place' ? 'Click the map where the new place is.' : p.kind === 'move-place' ? `Click the map to move ${doc.places[p.id]?.name}.` : `Click the map to set ${nameOf(p.key)}’s spot.`),
    h('button', { class: 'btn btn-ghost btn-xs', onclick: () => setPicking(null) }, 'Cancel'));
}
function onMapClick(e) {
  const g = { lat: +e.lngLat.lat.toFixed(5), lng: +e.lngLat.lng.toFixed(5) };
  if (picking?.kind === 'draw') { addVertex(g); return; }
  if (!picking) {
    // A data feature under the click opens it (points first, then lines, then areas).
    const layers = ['pl-data-point', 'pl-data-line', 'pl-data-fill'].filter((l) => map.getLayer(l));
    const hit = layers.length ? map.queryRenderedFeatures(e.point, { layers })[0] : null;
    if (hit?.properties?._layer != null) { location.hash = `#data/${encodeURIComponent(hit.properties._layer)}/${hit.properties._i}`; return; }
  }
  if (picking) {
    const p = picking;
    setPicking(null);
    if (p.kind === 'new-place') {
      const id = newPlaceId(doc, 'new-place');
      const within = Object.values(doc.places).find((x) => x.area && inside(g, x.area) && x.kind !== 'site')?.id ?? null;
      doc.places[id] = { id, name: 'New place', kind: 'site', geo: g, within, description: '', tags: [] };
      editing = id;
      save('Place added. Give it a name.');
      location.hash = `#map/${encodeURIComponent(id)}`;
    } else if (p.kind === 'move-place' && doc.places[p.id]) {
      doc.places[p.id].geo = g;
      save('Moved.');
    } else if (p.kind === 'pin-spot' && doc.pins[p.key]) {
      Object.assign(doc.pins[p.key], g);
      save('Spot set.');
    }
    return;
  }
  // The smallest outline under the click opens its place.
  const hits = map.queryRenderedFeatures(e.point, { layers: ['pl-areas-fill'] });
  if (hits.length) {
    const ids = hits.map((f) => f.properties.id).filter((id) => doc.places[id]);
    const smallest = ids.sort((a, b) => area(doc.places[a].area) - area(doc.places[b].area))[0];
    if (smallest) location.hash = `#map/${encodeURIComponent(smallest)}`;
  } else if (!trayEl.hidden) location.hash = '#map';
}
/** Is a point inside a polygon's outer ring (ray casting)? */
function inside(g, polygon) {
  const ring = polygon?.coordinates?.[0] ?? [];
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > g.lat) !== (yj > g.lat) && g.lng < ((xj - xi) * (g.lat - yi)) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}
const area = (polygon) => { const r = polygon?.coordinates?.[0] ?? []; let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(s / 2); };

/* ------------------------------------------------------------ the tray */

let editing = null;
function openTray(view, arg) {
  const before = JSON.stringify(selected);
  selected = { place: null, pin: null, show: [], data: null };
  let body = null;
  if (view === 'map' && arg && doc.places[arg]) { selected.place = arg; body = PlaceTray(doc.places[arg]); setCrumbs([{ label: doc.places[arg].name }]); }
  else if (view === 'pin' && facts.entities[arg]) { selected.pin = arg; body = PinTray(arg); setCrumbs([{ label: nameOf(arg) }]); }
  else if (view === 'data') {
    const [lid, idx] = arg.split('/');
    const l = doc.data?.[lid];
    if (l) {
      const i = idx !== undefined && idx !== '' ? Number(idx) : null;
      selected.data = { layer: lid, i: Number.isInteger(i) && l.features[i] ? i : null };
      body = selected.data.i != null ? FeatureTray(l, selected.data.i) : DataTray(l);
      setCrumbs([{ label: l.name, href: `#data/${encodeURIComponent(lid)}` }, ...(selected.data.i != null ? [{ label: featureName(l.features[selected.data.i], l.nameCol) }] : [])]);
    } else setCrumbs([]);
  } else if (view === 'show') {
    selected.show = arg.split(',').map((s) => s.trim()).filter((k) => facts.entities[k]);
    body = ShowTray(selected.show);
    setCrumbs([{ label: 'Picked out' }]);
  } else setCrumbs([]);
  trayEl.hidden = !body;
  trayEl.replaceChildren(body ?? '');
  if (JSON.stringify(selected) !== before) {
    drawOverlays();
    flyToSelection();
  }
}
/** Room for the tray: beside the map on a wide screen, under it on a phone. */
function trayPad() {
  const w = mapEl.clientWidth, hgt = mapEl.clientHeight;
  if (trayEl.hidden) return { top: 60, bottom: 60, left: 60, right: 60 };
  return w > 900 ? { top: 70, bottom: 70, left: 70, right: 430 } : { top: 40, bottom: Math.min(hgt * 0.55, hgt - 120) + 20, left: 30, right: 30 };
}
function flyToSelection() {
  if (!map) return;
  const pad = trayPad();
  if (selected.place) {
    const p = doc.places[selected.place];
    const pts = p.area ? p.area.coordinates[0].map(([lng, lat]) => ({ lat, lng })) : [p.geo];
    const { here } = pinsAt(doc, p.id);
    for (const k of here) { const g = pointOf(k); if (g) pts.push(g); }
    const b = boundsOf(pts);
    if (b) map.fitBounds(b, { padding: pad, maxZoom: p.kind === 'site' ? 15 : 14, duration: 600 });
  } else if (selected.pin) {
    const g = pointOf(selected.pin);
    if (g) map.easeTo({ center: [g.lng, g.lat], zoom: Math.max(map.getZoom(), 13), padding: pad, duration: 600 });
  } else if (selected.data) {
    const l = doc.data[selected.data.layer];
    const b = boundsOf(pointsOfFeatures(selected.data.i != null ? [l.features[selected.data.i]] : l.features));
    if (b) map.fitBounds(b, { padding: pad, maxZoom: 15, duration: 600 });
  } else if (selected.show.length) {
    const b = boundsOf(selected.show.map((k) => (k.startsWith('place:') ? doc.places[k.slice(6)]?.geo : pointOf(k))));
    if (b) map.fitBounds(b, { padding: pad, maxZoom: 14, duration: 600 });
  }
}

const closeBtn = () => h('a', { class: 'btn btn-ghost btn-sm btn-square pl-close', href: '#map', 'aria-label': 'Close' }, icon('close', 16));
const KindChip = (kind) => h('span', { class: 'pl-kind', style: `--c:${KIND_COLOURS[kind]};--ink:${inkOn(KIND_COLOURS[kind])}` }, kindLabel(kind));

/** A list of pinned things, grouped: actors, then stories, then documents and other assets. */
function ThingList(keys, { empty = 'Nothing here yet.' } = {}) {
  const seen = new Set();
  const rows = keys.filter((k) => facts.entities[k] && !seen.has(twinKey(k)) && seen.add(twinKey(k)))
    .map((k) => ({ k, s: sortOf(k) }))
    .sort((a, b) => (a.s.layer === b.s.layer ? 0 : a.s.layer === 'actors' ? -1 : 1) || a.s.label.localeCompare(b.s.label) || nameOf(a.k).localeCompare(nameOf(b.k)));
  if (!rows.length) return h('p', { class: 'pl-none' }, empty);
  return h('ul', { class: 'pl-things' }, rows.map(({ k, s }) => h('li', {},
    h('a', { href: `#pin/${encodeURIComponent(k)}` },
      h('span', { class: `pl-swatch ${s.layer === 'actors' ? 'actor' : 'asset'}`, style: `--c:${s.colour}` }),
      h('b', {}, nameOf(k)), h('small', {}, s.label, geoOfPin(doc, doc.pins[k])?.precision === 'exact' ? '' : ' · no spot of its own')))));
}

function PlaceTray(p) {
  const { here, serving } = pinsAt(doc, p.id);
  const trail = placeTrail(doc, p.id);
  const inner = placesWithin(doc, p.id).filter((id) => doc.places[id].within === p.id);
  if (editing === p.id && canEdit) return PlaceForm(p);
  return h('div', { class: 'pl-tray-in' },
    h('header', { class: 'pl-tray-head' },
      h('div', {}, KindChip(p.kind), h('h2', {}, p.name),
        trail.length ? h('p', { class: 'pl-trail' }, 'In ', trail.map((id, i) => [i ? ' · ' : '', h('a', { href: `#map/${encodeURIComponent(id)}` }, doc.places[id].name)])) : null),
      closeBtn()),
    p.description ? h('p', { class: 'pl-desc' }, p.description) : null,
    p.tags?.length ? h('p', { class: 'pl-tags' }, p.tags.map((t) => h('span', {}, t))) : null,
    h('section', {}, h('h3', {}, `Here · ${new Set(here.filter((k) => facts.entities[k]).map(twinKey)).size}`), ThingList(here, { empty: 'Nothing pinned here yet.' }),
      canEdit ? PinPicker(p.id) : null),
    serving.length ? h('section', {}, h('h3', {}, `Serving ${p.name} from elsewhere`), ThingList(serving)) : null,
    inner.length ? h('section', {}, h('h3', {}, 'Places inside'), h('ul', { class: 'pl-places' }, inner.map((id) => h('li', {}, h('a', { href: `#map/${encodeURIComponent(id)}` }, KindChip(doc.places[id].kind), doc.places[id].name))))) : null,
    h('footer', { class: 'pl-tray-foot' },
      h('small', {}, formatGeo(p.geo), p.area ? ' · has an outline' : ''),
      canEdit ? h('button', { class: 'btn btn-sm', onclick: () => { editing = p.id; openTray(...route()); } }, icon('pencil', 14), 'Edit') : null));
}

function PlaceForm(p) {
  const name = h('input', { class: 'input input-sm', value: p.name, required: true });
  const kind = h('select', { class: 'select select-sm' }, PLACE_KINDS.map((k) => h('option', { value: k.id, selected: k.id === p.kind }, k.label)));
  const kindWhy = h('small', { class: 'pl-why' }, kindById[p.kind]?.why ?? '');
  kind.addEventListener('change', () => { kindWhy.textContent = kindById[kind.value]?.why ?? ''; });
  const blocked = new Set([p.id, ...placesWithin(doc, p.id)]);
  const within = h('select', { class: 'select select-sm' }, h('option', { value: '' }, 'Nowhere (it’s the biggest)'),
    Object.values(doc.places).filter((x) => !blocked.has(x.id)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => h('option', { value: x.id, selected: x.id === p.within }, x.name)));
  const description = h('textarea', { class: 'textarea textarea-sm', rows: 4 }, p.description ?? '');
  const tags = h('input', { class: 'input input-sm', value: (p.tags ?? []).join(', '), placeholder: 'housing, east shore' });
  const done = () => { editing = null; openTray(...route()); };
  return h('form', { class: 'pl-tray-in pl-form', onsubmit: (e) => {
    e.preventDefault();
    Object.assign(doc.places[p.id], {
      name: name.value.trim() || 'Untitled place', kind: kind.value, within: within.value || null,
      description: description.value.trim(), tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean),
    });
    editing = null;
    save('Saved.');
  } },
    h('header', { class: 'pl-tray-head' }, h('div', {}, h('small', { class: 'pl-eyebrow' }, 'Edit place'), h('h2', {}, p.name)), closeBtn()),
    h('label', {}, h('span', {}, 'Name'), name),
    h('label', {}, h('span', {}, 'Kind'), kind, kindWhy),
    h('label', {}, h('span', {}, 'Inside'), within),
    h('label', {}, h('span', {}, 'Description'), description),
    h('label', {}, h('span', {}, 'Tags'), tags, h('small', { class: 'pl-why' }, 'Separate them with commas.')),
    h('div', { class: 'pl-row' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => setPicking({ kind: 'move-place', id: p.id }) }, icon('pin', 14), 'Move its point'),
      p.area ? h('small', { class: 'pl-why' }, 'Drawing outlines comes in stage 2.') : null),
    h('footer', { class: 'pl-tray-foot' },
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost pl-danger', onclick: async () => {
        const { here } = pinsAt(doc, p.id);
        if (!(await uiConfirm(`Delete ${p.name}? ${here.length ? `${n(here.length, 'pin')} here will be unpinned. ` : ''}The things themselves aren’t changed.`))) return;
        for (const k of here) if (doc.pins[k]?.placeId === p.id) delete doc.pins[k];
        for (const x of Object.values(doc.places)) if (x.within === p.id) x.within = p.within ?? null;
        delete doc.places[p.id];
        editing = null;
        location.hash = '#map';
        save('Place deleted.');
      } }, icon('trash', 14), 'Delete'),
      h('span', { class: 'pl-grow' }),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: done }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-sm btn-primary' }, 'Save')));
}

/** Search for an unpinned thing and pin it to a place. */
function PinPicker(placeId) {
  const box = h('div', { class: 'pl-picker' });
  const list = h('ul', { class: 'pl-results' });
  const input = h('input', { class: 'input input-sm', type: 'search', placeholder: 'Search actors, assets, stories…', 'aria-label': 'Search for a thing to pin' });
  const pinnable = () => {
    const pinnedTwins = new Set(Object.keys(doc.pins).filter((k) => facts.entities[k]).map(twinKey));
    return Object.values(facts.entities).filter((e) => !['person', 'place', 'map', 'collection', 'framework', 'plan', 'block', 'outcome', 'soar', 'context', 'result', 'task', 'workplan', 'goal', 'objective'].includes(e.type) && !pinnedTwins.has(twinKey(e.id)));
  };
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.replaceChildren(); return; }
    const seen = new Set();
    const hits = pinnable().filter((e) => e.name.toLowerCase().includes(q) && !seen.has(twinKey(e.id)) && seen.add(twinKey(e.id))).slice(0, 8);
    list.replaceChildren(...(hits.length ? hits.map((e) => h('li', {}, h('button', { type: 'button', onclick: () => {
      // Every copy of an actor (one per map) goes to the same place.
      const twins = Object.values(facts.entities).filter((x) => twinKey(x.id) === twinKey(e.id)).map((x) => x.id);
      for (const k of twins) doc.pins[k] = { placeId };
      save(`${e.name} pinned to ${doc.places[placeId].name}.`);
    } }, h('b', {}, e.name), h('small', {}, sortOf(e.id)?.label ?? typeLabel(e.type))))) : [h('li', { class: 'pl-none' }, 'Nothing unpinned matches.')]));
  };
  input.addEventListener('input', fill);
  const open = h('button', { type: 'button', class: 'btn btn-xs btn-outline', onclick: () => { open.hidden = true; box.append(input, list); input.focus(); } }, icon('plus', 13), 'Pin a thing here');
  box.append(open);
  return box;
}

function PinTray(key) {
  const e = facts.entities[key];
  const pin = doc.pins[key];
  const s = sortOf(key);
  const twins = Object.keys(doc.pins).filter((k) => k !== key && twinKey(k) === twinKey(key));
  const out = openIn(key);
  const rz = linkTo('rhizome', `#facts/${encodeURIComponent(key)}`);
  const geo = geoOfPin(doc, pin);
  const head = h('header', { class: 'pl-tray-head' },
    h('div', {}, h('span', { class: 'pl-kind', style: `--c:${s?.colour ?? '#888'};--ink:${inkOn(s?.colour ?? '#888888')}` }, s?.label ?? typeLabel(e.type)), h('h2', {}, e.name),
      e.type === 'actor' ? h('p', { class: 'pl-trail' }, `On ${n(twins.length + 1, 'ecosystem map')}`) : null),
    closeBtn());
  const links = h('p', { class: 'pl-links' }, out ? h('a', { href: out.href }, icon('link', 13), out.label) : null, rz ? h('a', { href: rz }, icon('sec-rhizome', 13), 'Its facts in Rhizome') : null);
  const desc = e.attrs.description ? h('p', { class: 'pl-desc' }, e.attrs.description) : null;
  if (!pin) {
    return h('div', { class: 'pl-tray-in' }, head, desc, links, h('p', { class: 'pl-none' }, 'Not pinned to a place yet.'),
      canEdit ? h('label', { class: 'pl-form' }, h('span', {}, 'Pin it to'), h('select', { class: 'select select-sm', onchange: (ev) => {
        if (!ev.target.value) return;
        for (const k of [key, ...Object.keys(facts.entities).filter((k) => k !== key && twinKey(k) === twinKey(key))]) doc.pins[k] = { placeId: ev.target.value };
        save('Pinned.');
      } }, h('option', { value: '' }, 'Choose a place…'), Object.values(doc.places).sort((a, b) => a.name.localeCompare(b.name)).map((p) => h('option', { value: p.id }, p.name)))) : null);
  }
  const all = [key, ...twins];
  const setAll = (fn) => { for (const k of all) if (doc.pins[k]) fn(doc.pins[k]); };
  const place = doc.places[pin.placeId];
  const servesBox = h('div', { class: 'pl-serves' }, Object.values(doc.places).filter((p) => p.id !== pin.placeId).sort((a, b) => (a.kind === 'region') - (b.kind === 'region') || a.name.localeCompare(b.name)).map((p) =>
    h('label', {}, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: (pin.serves ?? []).includes(p.id), disabled: !canEdit, onchange: (ev) => {
      setAll((x) => { const set = new Set(x.serves ?? []); ev.target.checked ? set.add(p.id) : set.delete(p.id); x.serves = [...set]; });
      save();
    } }), h('span', {}, p.name))));
  const note = h('textarea', { class: 'textarea textarea-sm', rows: 2, disabled: !canEdit, placeholder: 'Why it’s here, or what it does for the place' }, pin.note ?? '');
  note.addEventListener('change', () => { setAll((x) => { x.note = note.value.trim() || undefined; }); save('Note saved.'); });
  return h('div', { class: 'pl-tray-in' }, head, desc, links,
    h('section', {}, h('h3', {}, 'Where'),
      canEdit
        ? h('select', { class: 'select select-sm', onchange: (ev) => { setAll((x) => { x.placeId = ev.target.value; }); save('Moved.'); } },
          Object.values(doc.places).sort((a, b) => a.name.localeCompare(b.name)).map((p) => h('option', { value: p.id, selected: p.id === pin.placeId }, p.name)))
        : h('p', {}, place ? h('a', { href: `#map/${encodeURIComponent(place.id)}` }, place.name) : 'Somewhere'),
      h('p', { class: 'pl-why' }, geo?.precision === 'exact' ? `Its own spot: ${formatGeo(geo)}` : geo?.precision === 'area' ? `Somewhere in ${place?.name}: no spot on the map.` : `At ${place?.name}’s point: no spot of its own.`),
      canEdit ? h('div', { class: 'pl-row' },
        h('button', { class: 'btn btn-xs', onclick: () => setPicking({ kind: 'pin-spot', key }) }, icon('pin', 13), geo?.precision === 'exact' ? 'Move its spot' : 'Set its spot on the map'),
        geo?.precision === 'exact' ? h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { setAll((x) => { delete x.lat; delete x.lng; }); save('Spot cleared.'); } }, 'Clear the spot') : null) : null),
    h('section', {}, h('h3', {}, 'Serves'), servesBox),
    h('section', {}, h('h3', {}, 'Note'), note),
    canEdit ? h('footer', { class: 'pl-tray-foot' }, h('span', { class: 'pl-grow' }),
      h('button', { class: 'btn btn-sm btn-ghost pl-danger', onclick: async () => {
        if (!(await uiConfirm(`Unpin ${e.name}? It stays where it is in its own plugin.`, { ok: 'Unpin', danger: false }))) return;
        for (const k of all) delete doc.pins[k];
        location.hash = place ? `#map/${encodeURIComponent(place.id)}` : '#map';
        save('Unpinned.');
      } }, 'Unpin')) : null);
}

/** Things sent here to look at (Rhizome's "Show on Place"). */
function ShowTray(keys) {
  const places = keys.filter((k) => k.startsWith('place:') && doc.places[k.slice(6)]).map((k) => doc.places[k.slice(6)]);
  const things = keys.filter((k) => !k.startsWith('place:'));
  const placed = things.filter((k) => pointOf(k));
  const unplaced = things.filter((k) => !pointOf(k));
  return h('div', { class: 'pl-tray-in' },
    h('header', { class: 'pl-tray-head' }, h('div', {}, h('small', { class: 'pl-eyebrow' }, 'Picked out'), h('h2', {}, n(keys.length, 'thing'))), closeBtn()),
    h('p', { class: 'pl-desc' }, placed.length || places.length ? 'Ringed on the map.' : 'None of these has a place yet.'),
    places.length ? h('section', {}, h('h3', {}, 'Places'), h('ul', { class: 'pl-places' }, places.map((p) => h('li', {}, h('a', { href: `#map/${encodeURIComponent(p.id)}` }, KindChip(p.kind), p.name))))) : null,
    placed.length ? h('section', {}, h('h3', {}, 'On the map'), ThingList(placed)) : null,
    unplaced.length ? h('section', {}, h('h3', {}, 'Not on the map yet'), h('ul', { class: 'pl-things' }, unplaced.map((k) => h('li', {}, h('a', { href: `#pin/${encodeURIComponent(k)}` }, h('span', { class: 'pl-swatch none' }), h('b', {}, nameOf(k)), h('small', {}, typeLabel(facts.entities[k].type))))))) : null);
}

/* ------------------------------------------------------------ data layers and drawing (stage 2) */

/** Every feature of every layer that's on, tagged with its layer, its colour and whether it's picked. */
function dataFeatures() {
  const out = [];
  for (const l of Object.values(doc.data ?? {})) {
    if (!l.on) continue;
    const c = hex(l.colour);
    l.features.forEach((f, i) => out.push({ ...f, properties: { ...f.properties, _layer: l.id, _i: i, _c: c, _on: selected.data?.layer === l.id && (selected.data.i == null || selected.data.i === i) } }));
  }
  return out;
}

/** Read a file and keep it as a new data layer. */
async function bringIn(file) {
  if (file.size > 15 * 1048576) { uiAlert('That file is over 15 MB. Trim it to the area you work in, or simplify its shapes, then try again.'); return; }
  const text = await file.text();
  const csv = /\.(csv|tsv|txt)$/i.test(file.name) || /csv/.test(file.type);
  let r;
  if (csv) r = featuresFromCsv(text);
  else {
    try { r = featuresFromGeoJSON(JSON.parse(text)); } catch { uiAlert('That file isn’t valid GeoJSON. Check it opens in a GeoJSON viewer, or save it as a CSV with latitude and longitude columns.'); return; }
  }
  if (r.error) { uiAlert(`${file.name}: ${r.error}`); return; }
  if (!r.features.length) { uiAlert(`Nothing in ${file.name} could go on a map. Points need a latitude and longitude; shapes need GeoJSON in WGS84 (longitude, latitude).`); return; }
  const id = newDataId(doc, file.name);
  const used = new Set(Object.values(doc.data ?? {}).map((l) => l.colour));
  const colour = DATA_COLOURS.find((c) => !used.has(c)) ?? DATA_COLOURS[Object.keys(doc.data ?? {}).length % DATA_COLOURS.length];
  doc.data = { ...(doc.data ?? {}), [id]: { id, name: (file.name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Data').replace(/^./, (c) => c.toUpperCase()), colour, on: true, source: csv ? 'csv' : 'geojson', features: r.features, addedAt: new Date().toISOString(), ...(r.nameCol ? { nameCol: r.nameCol } : {}) } };
  const skipped = r.skipped ? ` ${n(r.skipped, 'row')} couldn’t be placed${r.features.length >= MAX_FEATURES ? ` (a layer holds up to ${MAX_FEATURES.toLocaleString()})` : ''}.` : '';
  save(`${n(r.features.length, 'feature')} brought in.${skipped}`);
  location.hash = `#data/${encodeURIComponent(id)}`;
}

/** Download a layer as GeoJSON, to open in QGIS, geojson.io or another map. */
function exportLayer(l) {
  const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', name: l.name, features: l.features }, null, 1)], { type: 'application/geo+json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${l.name.replace(/[^\w\- ]+/g, '').trim() || 'layer'}.geojson` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* Drawing: click to add points, double-click (or Finish) to end a line or an area, Esc to stop. */
const SHAPE_WORD = { point: 'point', line: 'line', area: 'area' };
function startDraw(shape) {
  if (!map) return;
  setPicking({ kind: 'draw', shape, coords: [] });
  map.doubleClickZoom.disable();
  drawHint();
}
function drawHint() {
  const p = picking;
  if (p?.kind !== 'draw') return;
  const need = p.shape === 'area' ? 3 : 2;
  const say = p.shape === 'point' ? 'Click the map where the point goes.'
    : p.coords.length === 0 ? `Click to start the ${SHAPE_WORD[p.shape]}.`
    : p.coords.length < need ? `Keep clicking to add corners${p.shape === 'area' ? ' (three at least)' : ''}.`
    : 'Double-click or press Finish to end it.';
  hintEl.replaceChildren(icon(p.shape === 'point' ? 'pin' : p.shape === 'line' ? 'flow' : 'mapTrifold', 14), h('span', {}, say),
    p.coords.length > 0 && h('button', { class: 'btn btn-ghost btn-xs', onclick: () => { p.coords.pop(); drawDraft(); drawHint(); } }, 'Undo'),
    p.shape !== 'point' && p.coords.length >= need && h('button', { class: 'btn btn-xs pl-hint-ok', onclick: finishDraw }, 'Finish'),
    h('button', { class: 'btn btn-ghost btn-xs', onclick: stopDraw }, 'Cancel'));
}
function addVertex(g) {
  const p = picking;
  const last = p.coords.at(-1);
  // A double-click lands two clicks on one spot: the second finishes the shape.
  if (last && Math.abs(last[0] - g.lng) < 1e-6 && Math.abs(last[1] - g.lat) < 1e-6) { finishDraw(); return; }
  p.coords.push([g.lng, g.lat]);
  if (p.shape === 'point') { finishDraw(); return; }
  drawDraft(); drawHint();
}
function draftGeometry(p, closing = false) {
  if (!p || p.kind !== 'draw' || !p.coords.length) return null;
  if (p.shape === 'point') return { type: 'Point', coordinates: p.coords[0] };
  if (p.shape === 'area' && (closing || p.coords.length >= 3)) return { type: 'Polygon', coordinates: [[...p.coords, p.coords[0]]] };
  return p.coords.length >= 2 ? { type: 'LineString', coordinates: p.coords } : null;
}
function drawDraft() {
  const src = map?.getSource?.('pl-draft');
  if (!src) return;
  const p = picking?.kind === 'draw' ? picking : null;
  const g = draftGeometry(p);
  src.setData({ type: 'FeatureCollection', features: [
    ...(g ? [{ type: 'Feature', properties: {}, geometry: g }] : []),
    ...(p ? p.coords.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) : []),
  ] });
}
function stopDraw() {
  setPicking(null);
  map?.doubleClickZoom.enable();
  drawDraft();
}
async function finishDraw() {
  const p = picking;
  const need = p.shape === 'area' ? 3 : p.shape === 'line' ? 2 : 1;
  if (p.coords.length < need) { drawHint(); return; }
  const geometry = draftGeometry(p, true);
  stopDraw();
  const name = await uiPrompt(`Name this ${SHAPE_WORD[p.shape]}`, '', { title: `A new ${SHAPE_WORD[p.shape]}`, ok: 'Keep it', placeholder: p.shape === 'line' ? 'The harbour walk' : p.shape === 'area' ? 'Where the market sets up' : 'The new food hub', required: false });
  if (name === null) return;
  const id = 'data-drawings';
  const layer = doc.data?.[id] ?? { id, name: 'Your drawings', colour: 'orchid', on: true, source: 'drawing', features: [], addedAt: new Date().toISOString() };
  const feature = { type: 'Feature', geometry, properties: { name: name.trim() || `A ${SHAPE_WORD[p.shape]}`, drawnAt: new Date().toISOString().slice(0, 10) } };
  doc.data = { ...(doc.data ?? {}), [id]: { ...layer, on: true, features: [...layer.features, feature] } };
  save(`${feature.properties.name} drawn.`);
  location.hash = `#data/${id}/${doc.data[id].features.length - 1}`;
}
addEventListener('keydown', (e) => {
  if (picking?.kind !== 'draw' || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'Escape') { e.preventDefault(); stopDraw(); }
  else if (e.key === 'Enter') { e.preventDefault(); finishDraw(); }
  else if ((e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) && picking.coords.length) { e.preventDefault(); picking.coords.pop(); drawDraft(); drawHint(); }
});

/** A data layer's tray: its name, colour, show or hide, what's in it, export, remove. */
function DataTray(l) {
  const setL = (patch, note) => { doc.data = { ...doc.data, [l.id]: { ...doc.data[l.id], ...patch } }; if (canEdit) save(note); else { drawOverlays(); render(); } };
  const kinds = { Point: 0, Line: 0, Area: 0 };
  for (const f of l.features) kinds[/Point/.test(f.geometry.type) ? 'Point' : /Line/.test(f.geometry.type) ? 'Line' : 'Area']++;
  const shown = l.features.slice(0, 200);
  return h('div', { class: 'pl-tray-in' },
    h('header', { class: 'pl-tray-head' }, h('div', {}, h('small', { class: 'pl-eyebrow' }, l.source === 'drawing' ? 'Drawn here' : `Data layer · ${l.source === 'csv' ? 'CSV' : 'GeoJSON'}`), h('h2', {}, l.name)), closeBtn()),
    h('p', { class: 'pl-desc' }, Object.entries(kinds).filter(([, c]) => c).map(([k, c]) => n(c, k.toLowerCase())).join(' · ') || 'Empty', l.addedAt ? ` · added ${new Date(l.addedAt).toLocaleDateString()}` : ''),
    canEdit && h('section', { class: 'pl-data-edit' },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Name'), h('input', { class: 'input input-sm w-full', value: l.name, onchange: (e) => { if (e.target.value.trim()) setL({ name: e.target.value.trim() }, 'Renamed.'); } })),
      h('div', { class: 'pl-data-colours', role: 'radiogroup', 'aria-label': 'Colour' }, DATA_COLOURS.map((c) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(l.colour === c), 'aria-label': c, title: c, class: l.colour === c ? 'on' : '', style: `--c:${hex(c)}`, onclick: () => setL({ colour: c }) })))),
    h('div', { class: 'pl-data-actions' },
      h('button', { class: 'btn btn-sm', onclick: () => setL({ on: !l.on }) }, icon(l.on ? 'eyeOff' : 'eye', 14), l.on ? 'Hide' : 'Show'),
      h('button', { class: 'btn btn-sm', onclick: () => exportLayer(l), title: 'A .geojson file for QGIS, geojson.io or another map' }, icon('download', 14), 'Export GeoJSON'),
      canEdit && h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (!await uiConfirm(`Remove the layer “${l.name}”? Its ${n(l.features.length, 'feature')} go with it.`, { danger: true, ok: 'Remove' })) return; const { [l.id]: _gone, ...rest } = doc.data; doc.data = rest; location.hash = '#map'; save('Layer removed.'); } }, icon('trash', 14), 'Remove')),
    h('section', {}, h('h3', {}, 'In this layer'),
      h('ul', { class: 'pl-things' }, shown.map((f, i) => h('li', {}, h('a', { href: `#data/${encodeURIComponent(l.id)}/${i}` },
        h('span', { class: 'pl-data-swatch', style: `--c:${hex(l.colour)}` }), h('b', {}, featureName(f, l.nameCol)), h('small', {}, /Point/.test(f.geometry.type) ? 'Point' : /Line/.test(f.geometry.type) ? 'Line' : 'Area'))))),
      l.features.length > shown.length ? h('p', { class: 'pl-note' }, `And ${n(l.features.length - shown.length, 'more')}: click them on the map.`) : null));
}

/** One feature: its properties, and (for drawings) its name and a way to remove it. */
function FeatureTray(l, i) {
  const f = l.features[i];
  const props = Object.entries(f.properties ?? {}).filter(([, v]) => v !== '' && v != null);
  const setF = (patch, note) => { const features = [...doc.data[l.id].features]; features[i] = { ...features[i], properties: { ...features[i].properties, ...patch } }; doc.data = { ...doc.data, [l.id]: { ...doc.data[l.id], features } }; save(note); };
  const len = (() => { const g = f.geometry; if (g.type !== 'LineString') return null; let km = 0; for (let k = 1; k < g.coordinates.length; k++) { const [a, b] = [g.coordinates[k - 1], g.coordinates[k]]; const R = 6371, r = Math.PI / 180; const s = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2; km += 2 * R * Math.asin(Math.sqrt(s)); } return km; })();
  return h('div', { class: 'pl-tray-in' },
    h('header', { class: 'pl-tray-head' }, h('div', {}, h('a', { class: 'pl-eyebrow', href: `#data/${encodeURIComponent(l.id)}` }, `← ${l.name}`), h('h2', {}, featureName(f, l.nameCol))), closeBtn()),
    h('p', { class: 'pl-desc' }, /Point/.test(f.geometry.type) ? formatGeo({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }) : /Line/.test(f.geometry.type) ? `A line${len != null ? `, ${len < 1 ? `${Math.round(len * 1000)} m` : `${len.toFixed(1)} km`} long` : ''}` : 'An area'),
    l.source === 'drawing' && canEdit && h('section', { class: 'pl-data-edit' },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Name'), h('input', { class: 'input input-sm w-full', value: f.properties?.name ?? '', onchange: (e) => setF({ name: e.target.value.trim() }, 'Saved.') })),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Note'), h('textarea', { class: 'textarea textarea-sm w-full', rows: 3, placeholder: 'What it is, who it’s for, what happens here', onchange: (e) => setF({ note: e.target.value.trim() }, 'Saved.') }, f.properties?.note ?? ''))),
    props.length && !(l.source === 'drawing' && canEdit) ? h('section', {}, h('h3', {}, 'Details'), h('dl', { class: 'pl-ref pl-props' }, props.slice(0, 40).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))) : null,
    canEdit && h('div', { class: 'pl-data-actions' },
      h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (!await uiConfirm(`Remove “${featureName(f, l.nameCol)}” from ${l.name}?`, { danger: true, ok: 'Remove' })) return; const features = doc.data[l.id].features.filter((_, k) => k !== i); doc.data = { ...doc.data, [l.id]: { ...doc.data[l.id], features } }; location.hash = `#data/${encodeURIComponent(l.id)}`; save('Removed.'); } }, icon('trash', 14), 'Remove it')));
}

/* ------------------------------------------------------------ places */

function Places() {
  setCrumbs([]);
  const byKind = PLACE_KINDS.map((k) => [k, Object.values(doc.places).filter((p) => p.kind === k.id).sort((a, b) => a.name.localeCompare(b.name))]).filter(([, list]) => list.length);
  const pinned = Object.keys(doc.pins).filter((k) => facts.entities[k]);
  return h('div', { class: 'pl-page' }, tabs('places'),
    h('div', { class: 'pl-stats' },
      Stat(Object.keys(doc.places).length, 'places'), Stat(new Set(pinned.map(twinKey)).size, 'things pinned'),
      Stat(new Set(pinned.filter((k) => geoOfPin(doc, doc.pins[k])?.precision === 'exact').map(twinKey)).size, 'with their own spot'),
      Stat(layerCounts().links, 'links on the map')),
    byKind.length ? byKind.map(([k, list]) => h('section', { class: 'pl-panel' },
      h('header', { class: 'pl-panel-head' }, KindChip(k.id), h('small', {}, k.why)),
      h('table', { class: 'pl-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Place'), h('th', {}, 'Inside'), h('th', {}, 'Here'), h('th', {}, 'Served from elsewhere'))),
        h('tbody', {}, list.map((p) => { const { here, serving } = pinsAt(doc, p.id); const c = (ks) => new Set(ks.filter((x) => facts.entities[x]).map(twinKey)).size; return h('tr', {},
          h('td', {}, h('a', { href: `#map/${encodeURIComponent(p.id)}` }, p.name), p.description ? h('small', {}, p.description) : null),
          h('td', {}, p.within ? doc.places[p.within]?.name ?? '' : ''),
          h('td', {}, String(c(here))), h('td', {}, String(c(serving)))); }))))) :
      h('section', { class: 'pl-panel pl-empty' }, h('h3', {}, 'No places yet'), h('p', {}, 'Open the map and click Add place to name the first place you work in.'), h('a', { class: 'btn btn-sm btn-primary', href: '#map' }, 'Open the map')));
}
const Stat = (v, label) => h('div', { class: 'pl-stat' }, h('strong', {}, v.toLocaleString()), h('span', {}, label));

/* ------------------------------------------------------------ about */

let helpDoc = null;
loadHelp().then(({ doc: hd }) => { helpDoc = hd.sections.find((s) => s.id === PLACE_HELP_ID) ?? PLACE_HELP; if (route()[0] === 'about') render(); }).catch(() => { helpDoc = PLACE_HELP; });
const helpHref = (pageId) => `help.html#${PLACE_HELP_ID}/${pageId}`;

/** About: an immediate reference beside the map, and the same tutorials as Help. */
function About(arg) {
  const section = helpDoc ?? PLACE_HELP;
  const page = section.pages.find((p) => p.id === arg) ?? null;
  setCrumbs(page ? [{ label: page.title }] : []);
  const ref = (title, rows) => h('section', { class: 'pl-panel' }, h('h3', {}, title), h('dl', { class: 'pl-ref' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  return h('div', { class: 'pl-page' }, tabs('about'),
    h('div', { class: 'pl-intro' },
      h('h2', {}, 'What Place does'),
      h('p', {}, 'Place puts your work on a real map, for place-based development: start from a place and the people in it, see what’s already there and who’s tied to whom, and build on it. Name the places you work in, pin your actors, assets and stories to them, and see the links between them on the ground.')),
    page
      ? h('article', { class: 'pl-panel pl-help' }, h('header', { class: 'pl-panel-head' }, h('h3', {}, page.title), h('a', { class: 'btn btn-xs btn-outline', href: helpHref(page.id) }, 'Open in Help')),
        Markdown(page.body, { embeds: ['shot'], embed: ({ id }) => HELP_SHOTS[id] ? h('figure', { class: 'pl-shot' }, h('img', { src: `media/help/${id}.jpg`, alt: HELP_SHOTS[id], loading: 'lazy' }), h('figcaption', {}, HELP_SHOTS[id])) : null }),
        h('a', { class: 'pl-back', href: '#about' }, '← Quick reference'))
      : h('div', { class: 'pl-two' },
        h('div', { class: 'pl-stack' },
          ref('Kinds of place', PLACE_KINDS.map((k) => [k.label, k.why])),
          ref('Words you’ll see', [['Pin', 'A Dashi thing tied to a place, and maybe to an exact spot'], ['Own spot', 'A pin with its own point on the map, drawn as a dot'], ['Serves', 'The places a thing works for, beyond where it is'], ['Inside', 'A place within a bigger one: a street in a town, a town in a region'], ['Link', 'A tie between two actors, from your ecosystem maps'], ['Data layer', 'A file brought in (a CSV with latitude and longitude, or GeoJSON), or the things you drew']]),
          ref('On the map', [['Coloured outline', 'A community, neighbourhood or landmark'], ['Dashed outline', 'A region'], ['Round dot', 'An actor, coloured by its category'], ['Square dot', 'A story, document or other asset'], ['Black line', 'A link between actors; dashed if speculative'], ['Amber dots', 'Who serves where'], ['Coloured dot, line or area', 'A data layer or a drawing: click it for its details']]),
          ref('Drawing', [['Point, Line, Area', 'The buttons over the map. Click to add corners'], ['Finish', 'Double-click, press Enter, or the Finish button'], ['Undo', 'Backspace takes back the last corner; Esc stops'], ['Export', 'Any layer downloads as GeoJSON, for QGIS or geojson.io']])),
        h('div', { class: 'pl-stack' },
          h('section', { class: 'pl-panel' }, h('h3', {}, 'Tutorials'), h('p', { class: 'pl-note' }, 'The same pages are in Help, under Place.'),
            h('ul', { class: 'pl-tutorials' }, section.pages.map((p) => h('li', {}, h('a', { href: `#about/${p.id}` }, icon('book', 15), p.title), h('a', { class: 'pl-out', href: helpHref(p.id), title: 'Open in Help' }, 'Help'))))),
          h('section', { class: 'pl-panel' }, h('h3', {}, 'Your data'), h('p', { class: 'pl-note' }, 'Place shows only things from plugins you can open, and never changes them: a pin lives in Place. The street map’s tiles come from OpenStreetMap; nothing about your organisation is sent with them. A drawn map works with no internet at all.')),
          h('section', { class: 'pl-panel' }, h('h3', {}, 'Built with'), h('ul', { class: 'pl-sourcelist' }, h('li', {}, 'MapLibre GL JS, free and open source (BSD licence)'), h('li', {}, 'Map data © OpenStreetMap contributors (street map)'), h('li', {}, 'Kestrel Bay’s drawn map is made up'))))));
}

/* ------------------------------------------------------------ go */

render();
startMap();
