// Tamarack (alpha client): the Networks for Change map of Canada, from public sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLIENT_ORGS, CLIENT_TOPUPS } from '../src/platform/clients/index.js';
import { tamarackPlace, TAMARACK_NETWORKS } from '../src/platform/clients/tamarack.js';
import { baseStyle, CANADA_MAP } from '../src/place/basemaps.js';

test('Tamarack is a client org with Place on, opening on Canada', () => {
  assert.ok(CLIENT_ORGS.some((o) => o.id === 'org-tamarack' && o.slug === 'tamarack'));
  const p = tamarackPlace();
  assert.equal(p.basemap, 'drawn');
  assert.equal(p.drawn, CANADA_MAP);
  assert.ok(p.view.zoom < 4 && p.view.labelZoom > p.view.zoom);
  assert.equal(TAMARACK_NETWORKS.length, 4);
});

test('every network layer point is in Canada (or the one US region), and every listed community is a place', () => {
  const p = tamarackPlace();
  const layers = Object.values(p.data);
  assert.equal(layers.length, 3);
  for (const l of layers) {
    assert.ok(l.note && l.features.length);
    for (const f of l.features) {
      const [lng, lat] = f.geometry.coordinates;
      assert.ok(lat > 41 && lat < 70 && lng > -141 && lng < -52, `${f.properties.name} on the map`);
      assert.ok(/^https:\/\/www\.tamarackcommunity\.ca\//.test(f.properties.source));
    }
  }
  assert.equal(p.data['data-climate-2023'].features.length, 24);
  const communities = Object.values(p.places).filter((x) => x.kind === 'community');
  assert.ok(communities.length >= 40);
  assert.ok(communities.every((c) => c.description && c.tags.length));
});

test('the Canada base map is a small file with the 13 provinces and territories', () => {
  const g = JSON.parse(readFileSync(new URL(`../${CANADA_MAP}`, import.meta.url)));
  assert.equal(g.features.filter((f) => f.properties.layer === 'province').length, 13);
  assert.ok(JSON.stringify(g).length < 200_000);
  const style = baseStyle('drawn', { drawn: CANADA_MAP });
  assert.ok(style.layers.some((l) => l.id === 'province'));
});

test('Kestrel set up before EoViz gets its demo data once, as a top-up', () => {
  const t = CLIENT_TOPUPS.find((x) => x.id === 'a04-eoviz');
  const out = t.run((name) => (name === 'org' ? { id: 'org-kestrel', plugins: { place: true } } : null));
  assert.ok(Object.keys(out.eco.sites).length > 5);
  assert.equal(out.org.plugins.eoviz, true);
  assert.deepEqual(t.run((name) => (name === 'eco' ? { sites: { a: {} } } : name === 'org' ? { plugins: { eoviz: true } } : null)), {});
});

test('the members site: a public site around the shared map, with community pages and a join form', async () => {
  const { tamarackDocs, TAMARACK_SITE } = await import('../src/platform/clients/tamarack.js');
  const { publicDocs } = await import('../server/public.js');
  const { publicPlace, placeMemberships, layersFor } = await import('../src/place/model.js');
  const { parseMarkdown } = await import('../src/platform/markdownParse.js');
  const docs = tamarackDocs();
  assert.equal(docs.org.sites[TAMARACK_SITE.id].visibility, 'public');
  const pages = Object.values(docs.pages.pages);
  assert.ok(pages.every((p) => p.siteId === TAMARACK_SITE.id && p.status === 'published'));
  const embeds = pages.flatMap((p) => parseMarkdown(p.body).filter((b) => b.t === 'embed'));
  assert.ok(embeds.some((e) => e.kind === 'map' && e.id === 'place'));
  assert.ok(embeds.some((e) => e.kind === 'form' && docs.dashboards.forms[e.id]?.visibility === 'public'));
  // Visitors get the map, its places and the public layers: never pins.
  docs.place.pins = { 'actor:m/secret': { lat: 45, lng: -75 } };
  docs.place.places.halifax.held = true;
  const pub = publicDocs(docs, '2026-11-27').place;
  assert.ok(pub && Object.keys(pub.data).length === 3);
  assert.deepEqual(pub.pins, {});
  assert.ok(!pub.places.halifax, 'a held-back place stays out');
  assert.equal(layersFor(pub, 'climate').length, 2);
  assert.equal(layersFor(pub, 'youth').length, 1);
  const london = placeMemberships(pub, 'london');
  assert.deepEqual(london.map((x) => x.layer.id).sort(), ['data-climate-2023', 'data-climate-2024']);
  // Not shared, or Place off: nothing.
  assert.equal(publicPlace({ ...docs.place, publicMap: false }), null);
  assert.equal(publicDocs({ ...docs, org: { ...docs.org, plugins: { ...docs.org.plugins, place: false } } }).place, undefined);
  // A layer not marked public stays out.
  const one = { ...docs.place, data: { ...docs.place.data, 'data-youth-futures': { ...docs.place.data['data-youth-futures'], public: false } } };
  assert.equal(Object.keys(publicPlace(one).data).length, 2);
});

test('Tamarack set up with only the map gets its members site once, as a top-up', async () => {
  const { tamarackPlace: tp } = await import('../src/platform/clients/tamarack.js');
  const t = CLIENT_TOPUPS.find((x) => x.id === 'a04-tamarack-site');
  const old = { ...tp(), publicMap: false, data: Object.fromEntries(Object.entries(tp().data).map(([id, l]) => [id, { ...l, public: undefined }])) };
  const out = t.run((name) => (name === 'org' ? { id: 'org-tamarack', sites: {} } : name === 'place' ? old : null));
  assert.ok(out.org.sites['site-members']);
  assert.ok(out.pages.pages['pg-t-home']);
  assert.ok(out.dashboards.forms['form-t-join']);
  assert.equal(out.place.publicMap, true);
  assert.ok(Object.values(out.place.data).every((l) => l.public));
  const done = t.run((name) => ({ org: out.org, pages: out.pages, dashboards: out.dashboards, place: out.place })[name]);
  assert.deepEqual(done, {});
});
