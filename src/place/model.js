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
