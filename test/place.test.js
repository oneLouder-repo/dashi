// Place stage 1: places, pins, base maps, and the adapter that feeds Rhizome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGINS, BUILT_IN_PLUGINS } from '../src/plugins.js';
import { orgHas, docMode } from '../src/platform/access.js';
import { mergeRegistry, registryView } from '../src/platform/pluginRegistry.js';
import { buildFacts, FACT_ADAPTERS } from '../src/rhizome/facts.js';
import '../src/rhizome/adapters.js';
import { buildPlaceFacts, addPlaceFacts } from '../src/place/facts.js';
import { blankPlace, migratePlace, geoOfPin, onTheMap, pinsAt, placesWithin, placeTrail, newPlaceId, boundsOf, kmBetween, LAYERS, PLACE_KINDS } from '../src/place/model.js';
import { baseStyle, basemapsFor, TILE_ORIGINS, STREET_TILES } from '../src/place/basemaps.js';
import { seedKestrelPlace, kestrelDrawing } from '../src/place/kestrel.js';
import { PLACE_HELP } from '../src/place/help.js';
import { HELP_SEED } from '../src/help/library.js';
import { CSP } from '../server/http.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const kestrel = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  return { ...docs, mapContents };
})();

/** Is a point inside a polygon's outer ring? */
function inside({ lat, lng }, polygon) {
  const ring = polygon.coordinates[0];
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}

test('Place is a plugin that ships switched off and owns only its own document', () => {
  const p = PLUGINS.find((x) => x.id === 'place');
  assert.ok(p && p.defaultOff && p.experimental);
  assert.deepEqual(p.owns, ['place']);
  assert.ok(p.reads.includes('map/*') && p.reads.includes('podcasts'));
  assert.equal(orgHas(PLUGINS, { plugins: {} }, 'place'), false, 'off until switched on');
  assert.equal(orgHas(PLUGINS, { plugins: { place: true } }, 'place'), true);
  const view = registryView(mergeRegistry({}));
  assert.equal(view.place.defaultOff, true);
  assert.equal(view.place.version, '0.1.0');
  // It reads the maps it pins things from, and can never write them.
  assert.equal(docMode(BUILT_IN_PLUGINS, { plugins: { place: true, mapper: false } }, 'map/x', {}), 'read');
  assert.equal(docMode(BUILT_IN_PLUGINS, { plugins: { place: true } }, 'place', {}), 'write');
  assert.equal(docMode(BUILT_IN_PLUGINS, { plugins: {} }, 'place', {}), 'public', 'nobody gets it with Place off');
});

test('a place document is cleaned: no pins to nowhere, no places without a point', () => {
  const d = migratePlace({
    places: { a: { name: 'A', kind: 'community', geo: { lat: 44, lng: -63 } }, bad: { name: 'No point' }, odd: { name: 'Odd', kind: 'castle', geo: { lat: 1, lng: 2 } } },
    pins: { 'actor:m/1': { placeId: 'a', serves: ['a', 'gone'] }, 'actor:m/2': { placeId: 'gone' }, 'episode:e': { lat: 44.1, lng: -63.1 }, 'library:x': { lat: 'x', lng: 5 } },
    basemap: 'drawn',
  });
  assert.deepEqual(Object.keys(d.places).sort(), ['a', 'odd']);
  assert.equal(d.places.odd.kind, 'site', 'an unknown kind becomes a site');
  assert.deepEqual(Object.keys(d.pins).sort(), ['actor:m/1', 'episode:e']);
  assert.deepEqual(d.pins['actor:m/1'].serves, ['a']);
  assert.equal(d.basemap, 'street', 'no drawing, no drawn map');
  for (const l of LAYERS) assert.equal(typeof d.layers[l.id].on, 'boolean');
  assert.deepEqual(migratePlace(null).places, {});
  assert.equal(PLACE_KINDS.length, 5);
});

test('where a pin is: its own spot, its place, or somewhere in a region', () => {
  const d = migratePlace({ places: {
    bay: { name: 'Bay', kind: 'region', geo: { lat: 43, lng: -61 }, area: { type: 'Polygon', coordinates: [[[-62, 42], [-60, 42], [-60, 44], [-62, 42]]] } },
    town: { name: 'Town', kind: 'community', geo: { lat: 43.1, lng: -61.1 }, within: 'bay' },
    hall: { name: 'Hall', kind: 'site', geo: { lat: 43.11, lng: -61.11 }, within: 'town' },
  }, pins: { a: { placeId: 'hall', lat: 43.2, lng: -61.2 }, b: { placeId: 'town' }, c: { placeId: 'bay' }, d: { placeId: 'hall', serves: ['bay'] }, e: { placeId: 'bay', serves: ['town'] } } });
  assert.deepEqual(geoOfPin(d, d.pins.a), { lat: 43.2, lng: -61.2, precision: 'exact', placeId: 'hall' });
  assert.equal(geoOfPin(d, d.pins.b).precision, 'approx');
  assert.equal(geoOfPin(d, d.pins.c).precision, 'area');
  assert.equal(onTheMap(geoOfPin(d, d.pins.c)), false, 'a region pin has no spot on the map');
  assert.deepEqual(placesWithin(d, 'bay').sort(), ['hall', 'town']);
  assert.deepEqual(placeTrail(d, 'hall'), ['town', 'bay']);
  const town = pinsAt(d, 'town');
  assert.deepEqual(town.here.sort(), ['a', 'b', 'd'], 'here includes the places inside it');
  assert.deepEqual(town.serving, ['e']);
  assert.equal(newPlaceId(d, 'Town'), 'town-2');
  assert.equal(newPlaceId(d, 'Café Ōkā'), 'cafe-oka');
  assert.deepEqual(boundsOf([{ lat: 1, lng: 2 }, { lat: 3, lng: -4 }, null]), [[-4, 1], [2, 3]]);
  assert.ok(Math.abs(kmBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.19) < 0.1);
});

test('Kestrel Bay: drawn at sea, every place inside the place it sits in, every pin a real thing', () => {
  const d = kestrel.place;
  assert.ok(d, 'Kestrel is seeded with a place document');
  assert.equal(d.basemap, 'drawn');
  assert.equal(Object.keys(d.places).length, 13);
  assert.equal(kestrel.org.plugins.place, true);
  // Out in the Atlantic, well clear of Nova Scotia's coast and Sable Island.
  for (const p of Object.values(d.places)) assert.ok(p.geo.lat > 43 && p.geo.lat < 43.5 && p.geo.lng > -61.4 && p.geo.lng < -61, p.name);
  for (const p of Object.values(d.places)) {
    if (p.area) assert.ok(inside(p.geo, p.area), `${p.name}'s point is inside its outline`);
    const parent = d.places[p.within];
    if (parent?.area) assert.ok(inside(p.geo, parent.area), `${p.name} is inside ${parent.name}`);
  }
  // Land and water: places on land are inside the mainland or an island.
  const land = kestrelDrawing().features.filter((f) => ['land', 'island'].includes(f.properties.layer));
  for (const p of Object.values(d.places)) if (p.kind !== 'region') assert.ok(land.some((f) => inside(p.geo, f.geometry)), `${p.name} is on land`);
  // Every pin is a thing in Kestrel's facts, and every copy of an actor is pinned to the same place.
  const facts = buildFacts(kestrel);
  const keys = Object.keys(d.pins);
  assert.ok(keys.length >= 60, `${keys.length} pins`);
  for (const k of keys) assert.ok(facts.entities[k], `${k} is a real thing`);
  const byName = {};
  for (const k of keys.filter((x) => x.startsWith('actor:'))) (byName[facts.entities[k].name] ??= new Set()).add(d.pins[k].placeId);
  for (const [name, places] of Object.entries(byName)) assert.equal(places.size, 1, name);
  // Place never writes into another plugin's documents.
  for (const mapId of Object.keys(kestrel.maps.maps)) for (const a of Object.values(kestrel.mapContents[mapId].actors)) assert.equal(a.geo, undefined);
  // The seed is the same every time.
  assert.deepEqual(Object.keys(seedKestrelPlace(kestrelBundle().docs).places), Object.keys(d.places));
});

test('Rhizome gets places as facts, only when Place is on', () => {
  assert.ok(FACT_ADAPTERS.has('place'), 'Place registers its adapter');
  const on = buildFacts(kestrel);
  const places = Object.values(on.entities).filter((e) => e.type === 'place');
  assert.equal(places.length, 13);
  assert.ok(places.every((p) => p.source === 'place' && p.attrs.geo));
  const located = on.relations.filter((r) => r.rel === 'located at');
  const serves = on.relations.filter((r) => r.rel === 'serves');
  assert.ok(located.length >= 60 && serves.length > 10);
  assert.ok([...located, ...serves].every((r) => r.kind === 'locates'));
  assert.ok(on.relations.some((r) => r.from === 'place:wharf-street' && r.rel === 'part of' && r.to === 'place:kestrel-harbour'));
  const council = Object.values(on.entities).find((e) => e.name === 'Municipal councils');
  assert.equal(council.attrs.geo.precision, 'exact');
  assert.equal(council.attrs.geo.placeId, 'kestrel-harbour');
  // A person who can't use Place gets none of it.
  const off = buildFacts(kestrel, { plugins: new Set(['mapper', 'assets', 'strategy', 'studio']) });
  assert.equal(Object.values(off.entities).filter((e) => e.type === 'place').length, 0);
  assert.equal(off.relations.filter((r) => r.kind === 'locates').length, 0);
  // Built on its own (Place's page), it's the same and never doubles up.
  const alone = addPlaceFacts(buildFacts(kestrel, { plugins: new Set(['mapper', 'assets', 'podcasts', 'library']) }), kestrel.place);
  assert.equal(Object.values(alone.entities).filter((e) => e.type === 'place').length, 13);
  const before = alone.relations.length;
  addPlaceFacts(alone, kestrel.place);
  assert.equal(alone.relations.length, before);
});

test('a thing’s own location wins over its pin', () => {
  const entities = { 'actor:m/1': { id: 'actor:m/1', type: 'actor', name: 'A', source: 'mapper', attrs: { geo: { lat: 1, lng: 2, precision: 'exact' } } } };
  const ent = (id, type, name, source, attrs) => { entities[id] ??= { id, type, name, source, attrs: { ...attrs } }; return entities[id]; };
  const rel = () => {};
  buildPlaceFacts({ places: { p: { name: 'P', kind: 'site', geo: { lat: 10, lng: 20 } } }, pins: { 'actor:m/1': { placeId: 'p' } } }, ent, rel, entities);
  assert.deepEqual(entities['actor:m/1'].attrs.geo, { lat: 1, lng: 2, precision: 'exact' });
  assert.equal(entities['place:p'].type, 'place');
});

test('base maps: street tiles are allowed by the CSP, the worker is a file, drawn only with a drawing', () => {
  assert.ok(TILE_ORIGINS.every((o) => CSP.includes(o)), 'connect-src allows the tile host');
  assert.match(CSP, /worker-src 'self'/);
  assert.ok(STREET_TILES[0].startsWith('https://'));
  assert.equal(baseStyle('street').sources.osm.type, 'raster');
  assert.ok(baseStyle('street').sources.osm.attribution.includes('OpenStreetMap'));
  assert.equal(baseStyle('drawn', { drawn: kestrelDrawing() }).sources.drawn.type, 'geojson');
  assert.deepEqual(Object.keys(baseStyle('drawn').sources), [], 'no drawing: a blank ground');
  assert.deepEqual(basemapsFor(blankPlace()).map((b) => b.id), ['street', 'blank']);
  assert.deepEqual(basemapsFor(kestrel.place).map((b) => b.id), ['street', 'drawn', 'blank']);
});

test('Place’s About tab and Help share one set of pages', () => {
  assert.equal(HELP_SEED.sections[0].id, 'place');
  assert.equal(HELP_SEED.sections[0], PLACE_HELP);
  assert.ok(PLACE_HELP.pages.length >= 3);
  for (const p of PLACE_HELP.pages) assert.ok(p.id.startsWith('place-') && p.body.length > 200, p.id);
});
