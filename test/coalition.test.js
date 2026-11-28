// Shared Ground (made up): the example Place project, a nation-wide coalition with a hub org.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLIENT_ORGS, CLIENT_TOPUPS } from '../src/platform/clients/index.js';
import { coalitionPlace, coalitionDocs, COALITION_NETWORKS, COALITION_SITE } from '../src/platform/clients/coalition.js';
import { baseStyle, CANADA_MAP } from '../src/place/basemaps.js';
import { publicDocs } from '../server/public.js';
import { publicPlace, placeMemberships, layersFor } from '../src/place/model.js';
import { parseMarkdown } from '../src/platform/markdownParse.js';

test('the coalition is a client org with Place on, a hub and six regions, opening on Canada', () => {
  assert.ok(CLIENT_ORGS.some((o) => o.id === 'org-coalition' && o.slug === 'coalition'));
  const p = coalitionPlace();
  assert.equal(p.basemap, 'drawn');
  assert.equal(p.drawn, CANADA_MAP);
  assert.ok(p.view.zoom < 4 && p.view.labelZoom > p.view.zoom);
  assert.equal(COALITION_NETWORKS.length, 4);
  assert.equal(p.places.hub.kind, 'landmark');
  assert.equal(Object.values(p.places).filter((x) => x.kind === 'region').length, 6);
  const tables = Object.values(p.places).filter((x) => x.kind === 'community');
  assert.ok(tables.length >= 40 && tables.every((c) => c.within && p.places[c.within] && c.description && c.tags.length));
});

test('every layer point is in Canada and every member is a table on the map', () => {
  const p = coalitionPlace();
  const layers = Object.values(p.data);
  assert.equal(layers.length, 5);
  const names = new Set(Object.values(p.places).map((x) => x.name));
  for (const l of layers) {
    assert.ok(l.public && l.group && l.features.length);
    for (const f of l.features) {
      const [lng, lat] = f.geometry.coordinates;
      assert.ok(lat > 41 && lat < 70 && lng > -141 && lng < -52, `${f.properties.name} on the map`);
      assert.ok(names.has(f.properties.name), `${f.properties.name} is a place`);
    }
  }
  assert.equal(p.data['data-regional-hubs'].features.length, 6);
});

test('the Canada base map is a small file with the 13 provinces and territories', () => {
  const g = JSON.parse(readFileSync(new URL(`../${CANADA_MAP}`, import.meta.url)));
  assert.equal(g.features.filter((f) => f.properties.layer === 'province').length, 13);
  assert.ok(JSON.stringify(g).length < 200_000);
  const style = baseStyle('drawn', { drawn: CANADA_MAP });
  assert.ok(style.layers.some((l) => l.id === 'province'));
});

test('the members site: a public site around the shared map, with community pages and a join form', () => {
  const docs = coalitionDocs();
  assert.equal(docs.org.sites[COALITION_SITE.id].visibility, 'public');
  const pages = Object.values(docs.pages.pages);
  assert.ok(pages.every((p) => p.siteId === COALITION_SITE.id && p.status === 'published'));
  const embeds = pages.flatMap((p) => parseMarkdown(p.body).filter((b) => b.t === 'embed'));
  assert.ok(embeds.some((e) => e.kind === 'map' && e.id === 'place'));
  assert.ok(embeds.some((e) => e.kind === 'form' && docs.dashboards.forms[e.id]?.visibility === 'public'));
  // Every [[map:<group>]] on the site shows something.
  const pub0 = publicPlace(docs.place);
  for (const e of embeds.filter((x) => x.kind === 'map')) assert.ok(layersFor(pub0, e.id).length, `map:${e.id}`);
  // Visitors get the map, its places and the public layers: never pins.
  docs.place.pins = { 'actor:m/secret': { lat: 45, lng: -75 } };
  docs.place.places.halifax.held = true;
  const pub = publicDocs(docs, '2026-11-27').place;
  assert.ok(pub && Object.keys(pub.data).length === 5);
  assert.deepEqual(pub.pins, {});
  assert.ok(!pub.places.halifax, 'a held-back place stays out');
  assert.deepEqual(placeMemberships(pub, 'vancouver').map((x) => x.layer.id).sort(), ['data-climate', 'data-housing', 'data-regional-hubs']);
  // Not shared, or Place off: nothing.
  assert.equal(publicPlace({ ...docs.place, publicMap: false }), null);
  assert.equal(publicDocs({ ...docs, org: { ...docs.org, plugins: { ...docs.org.plugins, place: false } } }).place, undefined);
  // A layer not marked public stays out.
  const one = { ...docs.place, data: { ...docs.place.data, 'data-rural': { ...docs.place.data['data-rural'], public: false } } };
  assert.equal(Object.keys(publicPlace(one).data).length, 4);
});

test('Kestrel set up before EoViz gets its demo data once, as a top-up', () => {
  const t = CLIENT_TOPUPS.find((x) => x.id === 'a04-eoviz');
  const out = t.run((name) => (name === 'org' ? { id: 'org-kestrel', plugins: { place: true } } : null));
  assert.ok(Object.keys(out.eco.sites).length > 5);
  assert.equal(out.org.plugins.eoviz, true);
  assert.deepEqual(t.run((name) => (name === 'eco' ? { sites: { a: {} } } : name === 'org' ? { plugins: { eoviz: true } } : null)), {});
});
