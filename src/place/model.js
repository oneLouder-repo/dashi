/**
 * Place's document (Place stage 1): the places an organisation works in,
 * and pins that tie Dashi things to them. Pure: no storage, no DOM, so the
 * server, Rhizome and the tests use it too.
 *
 *   place = {
 *     version,
 *     basemap: 'street' | 'drawn' | 'blank',
 *     view: { lat, lng, zoom },                 where the map opens
 *     places: { id: Place },
 *     pins: { entityKey: Pin },
 *     layers: { id: { on } },                   which layers show (see LAYERS)
 *     drawn: GeoJSON FeatureCollection | null,  a drawn base map (land, marsh, rivers, roads)
 *     data: { id: DataLayer },                  files brought in and things drawn (stage 2, below)
 *     publicMap: boolean,                       the map may show on the org's public sites (see publicPlace)
 *   }
 *
 *   Place = { id, name, kind, geo: { lat, lng }, area?: GeoJSON Polygon,
 *             within?: placeId, description, tags: [] }
 *   Pin   = { placeId?, lat?, lng?, note?, serves?: [placeId] }
 *
 * A pin's key is the thing's Rhizome fact id (actor:<map>/<id>, an asset key,
 * node:<id>, episode:<id>…), so Place never writes into another plugin's
 * documents. A thing's location is `geo` = { lat, lng, precision, placeId }:
 * precision 'exact' (its own point), 'approx' (its place's point) or 'area'
 * (somewhere in its place's outline). People never get one by default.
 */
export const PLACE_VERSION = 1;

export const PLACE_KINDS = [
  { id: 'community', label: 'Community', plural: 'Communities', why: 'A town, village or First Nation: where people live' },
  { id: 'neighbourhood', label: 'Neighbourhood', plural: 'Neighbourhoods', why: 'Part of a community, with its own feel' },
  { id: 'site', label: 'Site', plural: 'Sites', why: 'A building, a hall, a wharf, a street: somewhere you can stand' },
  { id: 'landmark', label: 'Landmark', plural: 'Landmarks', why: 'Land, water and places people know: a marsh, an island, a trail' },
  { id: 'region', label: 'Region', plural: 'Regions', why: 'The wider area: a county, a watershed, a whole bay' },
];
export const kindById = Object.fromEntries(PLACE_KINDS.map((k) => [k.id, k]));
export const kindLabel = (id, n = 1) => (n === 1 ? kindById[id]?.label : kindById[id]?.plural) ?? 'Place';

/** The layers a map can show, in drawing order (bottom first). */
export const LAYERS = [
  { id: 'areas', label: 'Place outlines', sub: 'Communities, neighbourhoods and regions', icon: 'mapTrifold' },
  { id: 'links', label: 'Links', sub: 'Ties between pinned actors, from your ecosystem maps', icon: 'connect' },
  { id: 'serves', label: 'Who serves where', sub: 'Lines from an actor to the places it serves', icon: 'flow' },
  { id: 'places', label: 'Places', sub: 'Named places, with how much is there', icon: 'pin' },
  { id: 'actors', label: 'Actors', sub: 'Actors from your ecosystem maps', icon: 'sec-mapper' },
  { id: 'assets', label: 'Assets', sub: 'Stories, documents and other assets', icon: 'sec-assets' },
];
const LAYER_DEFAULTS = { areas: true, links: true, serves: false, places: true, actors: true, assets: true };

export const blankPlace = () => ({
  version: PLACE_VERSION,
  basemap: 'street',
  view: null,
  places: {},
  pins: {},
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, { on: LAYER_DEFAULTS[l.id] }])),
  drawn: null,
  data: {},
});

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const okLat = (v) => num(v) != null && Math.abs(v) <= 90;
const okLng = (v) => num(v) != null && Math.abs(v) <= 180;

/** Fill in anything missing, and drop what can't be drawn (a pin to nowhere, a place with no point). */
export function migratePlace(doc) {
  const d = { ...blankPlace(), ...(doc ?? {}) };
  d.places = { ...(d.places ?? {}) };
  for (const [id, p] of Object.entries(d.places)) {
    if (!p || !okLat(p.geo?.lat) || !okLng(p.geo?.lng)) { delete d.places[id]; continue; }
    d.places[id] = { id, name: 'Untitled place', kind: 'site', description: '', tags: [], ...p, geo: { lat: Number(p.geo.lat), lng: Number(p.geo.lng) } };
    if (!kindById[d.places[id].kind]) d.places[id].kind = 'site';
  }
  d.pins = { ...(d.pins ?? {}) };
  for (const [key, pin] of Object.entries(d.pins)) {
    const hasPoint = okLat(pin?.lat) && okLng(pin?.lng);
    const placeId = pin?.placeId && d.places[pin.placeId] ? pin.placeId : null;
    if (!hasPoint && !placeId) { delete d.pins[key]; continue; }
    d.pins[key] = { ...pin, placeId, serves: (pin.serves ?? []).filter((s) => d.places[s]) };
    if (!hasPoint) { delete d.pins[key].lat; delete d.pins[key].lng; }
  }
  for (const l of LAYERS) d.layers = { ...d.layers, [l.id]: { on: LAYER_DEFAULTS[l.id], ...(d.layers?.[l.id] ?? {}) } };
  if (!['street', 'drawn', 'blank'].includes(d.basemap)) d.basemap = 'street';
  if (d.basemap === 'drawn' && !d.drawn) d.basemap = 'street';
  d.data = migrateData(d.data);
  return d;
}

/**
 * Where a pinned thing is: its own point if it has one, else its place's.
 * Null when it isn't pinned, or is pinned only to a place that has an
 * outline and no exact spot (a region): it's "somewhere in there".
 */
export function geoOfPin(doc, pin) {
  if (!pin) return null;
  const place = pin.placeId ? doc.places[pin.placeId] : null;
  if (num(pin.lat) != null && num(pin.lng) != null) return { lat: Number(pin.lat), lng: Number(pin.lng), precision: 'exact', placeId: place?.id ?? null };
  if (!place) return null;
  return { lat: place.geo.lat, lng: place.geo.lng, precision: place.area && place.kind === 'region' ? 'area' : 'approx', placeId: place.id };
}

/** Does a pin mark a spot on the map, or only say "somewhere in this region"? */
export const onTheMap = (geo) => !!geo && geo.precision !== 'area';

/** Every pin at a place (pinned to it, or to a place inside it), and every pin that serves it. */
export function pinsAt(doc, placeId) {
  const inside = new Set([placeId, ...placesWithin(doc, placeId)]);
  const here = [];
  const serving = [];
  for (const [key, pin] of Object.entries(doc.pins)) {
    if (pin.placeId && inside.has(pin.placeId)) here.push(key);
    else if ((pin.serves ?? []).includes(placeId)) serving.push(key);
  }
  return { here, serving };
}

/** The places inside a place, all the way down. */
export function placesWithin(doc, placeId) {
  const out = [];
  const walk = (id) => { for (const p of Object.values(doc.places)) if (p.within === id && !out.includes(p.id)) { out.push(p.id); walk(p.id); } };
  walk(placeId);
  return out;
}

/** A place's chain of containing places, nearest first (Wharf Street → Kestrel Harbour → Kestrel Bay). */
export function placeTrail(doc, placeId) {
  const out = [];
  let p = doc.places[doc.places[placeId]?.within];
  while (p && !out.includes(p.id)) { out.push(p.id); p = doc.places[p.within]; }
  return out;
}

/** A new id that isn't taken. */
export function newPlaceId(doc, name = 'place') {
  const base = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'place';
  let id = base;
  for (let i = 2; doc.places[id]; i++) id = `${base}-${i}`;
  return id;
}

/** The middle of a polygon's outer ring, near enough for a label. */
export function centreOf(polygon) {
  const ring = polygon?.coordinates?.[0] ?? [];
  if (!ring.length) return null;
  let x = 0, y = 0;
  const pts = ring.slice(0, ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? -1 : undefined);
  for (const [lng, lat] of pts) { x += lng; y += lat; }
  return { lat: y / pts.length, lng: x / pts.length };
}

/** A box round a set of points: [[west, south], [east, north]], or null. */
export function boundsOf(points) {
  const ok = points.filter((p) => p && okLat(p.lat) && okLng(p.lng));
  if (!ok.length) return null;
  const lats = ok.map((p) => p.lat), lngs = ok.map((p) => p.lng);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

/** Distance in km between two points (haversine). */
export function kmBetween(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** A short, readable "44.65° N, 63.58° W". */
export function formatGeo(g) {
  if (!g) return '';
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? pos : neg}`;
  return `${f(g.lat, 'N', 'S')}, ${f(g.lng, 'E', 'W')}`;
}

/* ------------------------------------------------------------ data layers and drawings (Place stage 2) */
/**
 *   place.data = { id: DataLayer }
 *   DataLayer = { id, name, colour (wheel hue id), on, source: 'csv' | 'geojson' | 'drawing',
 *                 features: [GeoJSON Feature], addedAt, note? }
 *
 * A file brought in (a CSV with latitude and longitude columns, or GeoJSON) becomes one layer; what
 * you draw on the map (points, lines, areas) goes into a drawing layer. Only Point, LineString and
 * Polygon geometries (and their Multi- forms) are kept, up to MAX_FEATURES a layer.
 */
export const MAX_FEATURES = 5000;
export const DATA_COLOURS = ['blue', 'orchid', 'green', 'orange', 'violet', 'teal', 'red', 'amber'];
const GEOMS = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
const okPos = (c) => Array.isArray(c) && okLng(c[0]) && okLat(c[1]);
const okCoords = (type, c) => {
  if (type === 'Point') return okPos(c);
  if (type === 'MultiPoint' || type === 'LineString') return Array.isArray(c) && c.length >= (type === 'LineString' ? 2 : 1) && c.every(okPos);
  if (type === 'MultiLineString') return Array.isArray(c) && c.every((l) => okCoords('LineString', l));
  if (type === 'Polygon') return Array.isArray(c) && c.length >= 1 && c.every((r) => Array.isArray(r) && r.length >= 4 && r.every(okPos));
  if (type === 'MultiPolygon') return Array.isArray(c) && c.every((p) => okCoords('Polygon', p));
  return false;
};
/** A clean feature (or null): a known geometry with sane coordinates and plain properties. */
export function cleanFeature(f) {
  const g = f?.type === 'Feature' ? f.geometry : f;
  if (!g || !GEOMS.has(g.type) || !okCoords(g.type, g.coordinates)) return null;
  const props = {};
  for (const [k, v] of Object.entries(f?.properties ?? {})) if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) props[String(k).slice(0, 60)] = typeof v === 'string' ? v.slice(0, 500) : v;
  return { type: 'Feature', geometry: { type: g.type, coordinates: g.coordinates }, properties: props };
}

/** GeoJSON in (a FeatureCollection, a Feature, a geometry or a list of them): { features, skipped }. */
export function featuresFromGeoJSON(obj) {
  const list = Array.isArray(obj) ? obj : obj?.type === 'FeatureCollection' ? obj.features ?? [] : obj?.type === 'GeometryCollection' ? obj.geometries ?? [] : [obj];
  const features = [];
  let skipped = 0;
  for (const f of list) { const c = cleanFeature(f); if (c && features.length < MAX_FEATURES) features.push(c); else skipped++; }
  return { features, skipped };
}

/** Split CSV text into rows (quotes, commas or semicolons, CRLF). */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const LAT_COLS = ['lat', 'latitude', 'y', 'lat_dd', 'latitude_dd'];
const LNG_COLS = ['lng', 'lon', 'long', 'longitude', 'x', 'lng_dd', 'longitude_dd'];
const NAME_COLS = ['name', 'title', 'label', 'site', 'place', 'organisation', 'organization'];
/**
 * A CSV with latitude and longitude columns as points: { features, skipped, columns, latCol, lngCol,
 * nameCol, error? }. Columns are found by their header (lat / latitude / y, lng / lon / longitude / x).
 */
export function featuresFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { features: [], skipped: 0, columns: rows[0] ?? [], error: 'The file has no rows under its header.' };
  const head = rows[0].map((c) => c.trim());
  const low = head.map((c) => c.toLowerCase().replace(/[\s-]+/g, '_'));
  const find = (names) => low.findIndex((c) => names.includes(c));
  const li = find(LAT_COLS), gi = find(LNG_COLS);
  let ni = find(NAME_COLS);
  if (ni < 0) ni = low.findIndex((_, i) => i !== li && i !== gi);
  if (li < 0 || gi < 0) return { features: [], skipped: rows.length - 1, columns: head, error: 'It needs a latitude and a longitude column (headed lat and lng, or latitude and longitude).' };
  const features = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const lat = num(String(r[li] ?? '').trim()), lng = num(String(r[gi] ?? '').trim());
    if (!okLat(lat) || !okLng(lng) || features.length >= MAX_FEATURES) { skipped++; continue; }
    const properties = {};
    head.forEach((k, i) => { if (i !== li && i !== gi && k) properties[k.slice(0, 60)] = String(r[i] ?? '').trim().slice(0, 500); });
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties });
  }
  return { features, skipped, columns: head, latCol: head[li], lngCol: head[gi], nameCol: ni >= 0 ? head[ni] : null };
}

/** What to call a feature: its name-like property, else its kind. */
export function featureName(f, nameCol = null) {
  const p = f?.properties ?? {};
  const key = (nameCol && p[nameCol] != null && p[nameCol] !== '') ? nameCol : Object.keys(p).find((k) => NAME_COLS.includes(k.toLowerCase()) && p[k] !== '' && p[k] != null);
  if (key) return String(p[key]);
  const t = f?.geometry?.type ?? '';
  return /Point/.test(t) ? 'Point' : /Line/.test(t) ? 'Line' : /Polygon/.test(t) ? 'Area' : 'Feature';
}

/** Every position in a set of features, as { lat, lng } (for fitting the map). */
export function pointsOfFeatures(features) {
  const out = [];
  const walk = (c) => { if (okPos(c)) out.push({ lng: c[0], lat: c[1] }); else if (Array.isArray(c)) c.forEach(walk); };
  for (const f of features ?? []) walk(f.geometry?.coordinates);
  return out;
}

/** A new data layer id that isn't taken. */
export function newDataId(doc, name = 'layer') {
  const base = `data-${String(name).toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'layer'}`;
  let id = base;
  for (let i = 2; doc.data?.[id]; i++) id = `${base}-${i}`;
  return id;
}

/** Keep data layers drawable: clean features, a colour, a name. */
export function migrateData(data) {
  const out = {};
  let i = 0;
  for (const [id, l] of Object.entries(data ?? {})) {
    if (!l || typeof l !== 'object') continue;
    const features = (l.features ?? []).map(cleanFeature).filter(Boolean).slice(0, MAX_FEATURES);
    out[id] = { id, name: String(l.name ?? 'Data').slice(0, 80), colour: DATA_COLOURS.includes(l.colour) ? l.colour : DATA_COLOURS[i % DATA_COLOURS.length], on: l.on !== false, source: ['csv', 'geojson', 'drawing'].includes(l.source) ? l.source : 'geojson', features, addedAt: l.addedAt ?? null, ...(l.nameCol ? { nameCol: String(l.nameCol) } : {}), ...(l.note ? { note: String(l.note).slice(0, 300) } : {}), ...(l.public ? { public: true } : {}), ...(l.group ? { group: String(l.group).slice(0, 40) } : {}) };
    i++;
  }
  return out;
}

/**
 * What a visitor may see of the map on a public site (Tamarack members site,
 * alpha 0.4): nothing unless `publicMap` is on; then the base map, the view,
 * the places that aren't held back, and only the data layers marked public.
 * Never the pins: they tie people and private things to places. Each public
 * feature gets the id of the place of the same name, for its community page.
 */
export function publicPlace(doc) {
  if (!doc?.publicMap) return null;
  const d = migratePlace(doc);
  const places = Object.fromEntries(Object.entries(d.places).filter(([, p]) => !p.held)
    .map(([id, p]) => [id, { id, name: p.name, kind: p.kind, geo: p.geo, ...(p.within ? { within: p.within } : {}), description: p.description ?? '', tags: p.tags ?? [] }]));
  const byName = new Map(Object.values(places).map((p) => [p.name.toLowerCase(), p.id]));
  const data = Object.fromEntries(Object.values(d.data).filter((l) => l.public).map((l) => [l.id, {
    ...l, on: true,
    features: l.features.map((f) => {
      const placeId = byName.get(String(featureName(f, l.nameCol)).toLowerCase());
      return placeId ? { ...f, properties: { ...f.properties, placeId } } : f;
    }),
  }]));
  return { version: d.version, basemap: d.basemap, view: d.view, drawn: d.drawn, places, pins: {}, data, publicMap: true, layers: d.layers };
}

/** The public layers a [[map:<id>]] embed shows: all of them, one layer, or a group of layers. */
export const layersFor = (pub, id = 'place') => Object.values(pub?.data ?? {}).filter((l) => !id || id === 'place' || l.id === id || l.group === id);

/** A place's networks on the public map: each public layer it's in, with that feature's properties. */
export function placeMemberships(pub, placeId) {
  return Object.values(pub?.data ?? {}).flatMap((l) => l.features.filter((f) => f.properties?.placeId === placeId).map((f) => ({ layer: l, props: f.properties })));
}
