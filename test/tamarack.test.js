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
