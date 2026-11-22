import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actuaDocs } from '../src/platform/clients/actua.js';
import { buildGraph, toTurtle, toNTriples, toJsonLd, defaultGraphSettings } from '../src/platform/graph.js';
import { ask, around, findNodes, adjacency, components } from '../src/platform/graphAlgo.js';
import { PLUGINS, linkTo } from '../src/plugins.js';

const g = buildGraph(actuaDocs());

test('the graph is a sub-plugin of Rhizome (alpha 0.4, was Assets) that owns only its settings', () => {
  const p = PLUGINS.find((x) => x.id === 'graph');
  assert.equal(p.parent, 'rhizome');
  assert.ok(!p.experimental, 'out of experimental');
  assert.deepEqual(p.owns, ['graph']);
  assert.equal(linkTo('graph', '', { plugins: { rhizome: false } }), null, 'it goes with Rhizome');
  assert.equal(linkTo('graph', '#loops', { plugins: { rhizome: true } }), 'graph.html#loops');
});

test('Actua becomes linked facts: people, assets, actors, tags and strategy', () => {
  assert.ok(g.triples.length > 500);
  const kinds = new Set(Object.values(g.nodes).map((n) => n.kind));
  for (const k of ['org', 'person', 'asset', 'actor', 'concept', 'strategy']) assert.ok(kinds.has(k), k);
  // No one's email or phone goes in.
  assert.ok(!g.triples.some(([, p]) => /mbox|email|phone|telephone/i.test(p)));
});

test('graph search: a name unfolds its network; "A to B" finds the way', () => {
  const [cifar] = findNodes(g, 'cifar');
  assert.equal(g.nodes[cifar].label, 'CIFAR');
  const e = ask(g, 'CIFAR');
  assert.equal(e.kind, 'ego');
  assert.ok(e.rings[1].length >= 2 && e.rings.length === 3);
  assert.deepEqual(around(g, cifar).nodes.sort(), e.nodes.sort());
  const p = ask(g, 'cifar to apple');
  assert.equal(p.kind, 'path');
  assert.ok(p.path.length >= 3 && p.path[0] === cifar);
  for (const q of ['most connected', 'bridges', 'clusters', 'islands', 'people']) assert.ok(ask(g, q).nodes.length > 0, q);
  assert.equal(ask(g, 'zzqx nothing').kind, 'none');
});

test('switching a vocabulary off falls back to Dashi’s own words, and classes follow the settings', () => {
  const s = defaultGraphSettings();
  const noFoaf = buildGraph(actuaDocs(), { ...s, vocabs: { ...s.vocabs, foaf: false }, abcdClasses: { ...s.abcdClasses, individual: 'schema:Person' } });
  assert.ok(!noFoaf.triples.some((t) => t.some((x) => typeof x === 'string' && x.startsWith('foaf:'))));
  assert.ok(noFoaf.triples.some(([, p, o]) => p === 'rdf:type' && o === 'schema:Person'));
});

test('exports are well formed and leave out restricted assets', () => {
  const docs = { ...actuaDocs(), assets: { items: { secret: { id: 'secret', kind: 'note', title: 'Secret budget notes', text: 'x', tags: [], collectionIds: [], sensitivity: 'restricted' } }, collections: {} } };
  const all = buildGraph(docs);
  const shared = buildGraph(docs, undefined, { restricted: false });
  assert.ok(Object.values(all.nodes).some((n) => n.label === 'Secret budget notes'));
  assert.ok(!Object.values(shared.nodes).some((n) => n.label === 'Secret budget notes'));
  const ttl = toTurtle(shared, { base: 'https://x.example/id/' });
  assert.match(ttl, /@base <https:\/\/x\.example\/id\/> \./);
  assert.match(ttl, /<org>\n {4}a /);
  const nt = toNTriples(shared).trim().split('\n');
  assert.equal(nt.length, shared.triples.length);
  assert.ok(nt.every((l) => /^<[^>]+> <[^>]+> .+ \.$/.test(l)));
  const ld = toJsonLd(shared);
  assert.ok(ld['@context'] && Array.isArray(ld['@graph']) && ld['@graph'].length > 50);
});

test('everything but frame nodes is reachable or shows up as an island', () => {
  const comps = components(g, { adj: adjacency(g) });
  const islands = ask(g, 'islands');
  const loose = comps.slice(1).flat().filter((k) => !['org', 'map', 'team'].includes(g.nodes[k].kind));
  assert.equal(new Set(islands.nodes).size, loose.length);
});
