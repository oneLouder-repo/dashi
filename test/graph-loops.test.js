import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLoops } from '../src/platform/graphAlgo.js';

const actor = (id) => [id, { iri: id, kind: 'actor', label: id }];
const g = {
  nodes: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(actor).concat([['t', { iri: 't', kind: 'tag' }]])),
  edges: [
    { s: 'a', o: 'b', p: 'dashi:feedback', label: 'feedback' },
    { s: 'b', o: 'c', p: 'dashi:resourceFlow', label: 'funds' },
    { s: 'c', o: 'a', p: 'dashi:learning', label: 'learning' },
    { s: 'c', o: 'd', p: 'foaf:knows', label: 'connected' },
    { s: 'd', o: 'e', p: 'foaf:knows', label: 'connected' },
    { s: 'a', o: 't', p: 'dct:subject', label: 'tagged' },
    { s: 'e', o: 'd', p: 'foaf:knows', label: 'connected', weak: true },
  ],
};

test('findLoops: each directed loop of actors once, with its kind', () => {
  const { loops } = findLoops(g);
  assert.equal(loops.length, 1, 'a weak link never closes a loop, and the loop is not counted three times');
  assert.deepEqual(loops[0].iris, ['a', 'b', 'c']);
  assert.equal(loops[0].kind, 'mixed');
  assert.deepEqual(loops[0].edges.map((e) => e.label), ['feedback', 'funds', 'learning']);
});

test('findLoops: near misses are one link short of a loop', () => {
  const { almost } = findLoops(g);
  assert.ok(almost.some((x) => x.iris.join() === 'c,d,e' && x.missing.s === 'e' && x.missing.o === 'c'));
  assert.ok(!almost.some((x) => x.iris.join() === 'a,b,c'), 'already a loop');
});

test('the Rhizome tools tray counts from Kestrel’s own documents', async () => {
  const { CLIENT_ORGS } = await import('../src/platform/clients/index.js');
  const { trayFacts } = await import('../src/assets/rhizomeTray.js');
  const d = CLIENT_ORGS.find((o) => o.slug === 'kestrel').docs();
  const mapContents = Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('map/')).map(([k, v]) => [k.slice(4), v]));
  const f = trayFacts({ ...d, mapContents }, d.assets, null);
  assert.ok(f.assets > 10 && f.top.length === 5);
  assert.ok(f.loops >= 1, 'Kestrel’s maps have feedback loops');
  assert.ok(Object.values(f.abcd).filter(Boolean).length >= 3, 'more than one ABCD type is counted');
});
