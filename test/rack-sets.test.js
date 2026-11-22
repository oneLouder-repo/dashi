// Alpha 0.4 rack: the set and graph modules, the displays, and their helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../src/rhizome/facts.js';
import { measureFacts } from '../src/rhizome/measures.js';
import { MODULES, CATEGORIES, HP, blankPatch, addModule, connect, runPatch, patchToRule, starterPatch, rowsOf, inRack } from '../src/rhizome/rack.js';
import { graphOf, neighbourhood, triadsOf, communities, vennCounts, plotLayout, spectrumOf } from '../src/rhizome/rackGraph.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const ctx = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const facts = buildFacts({ ...docs, mapContents });
  const measures = measureFacts(facts, { today: '2026-11-22' });
  return { facts, measures, calibration: measures.calibration, profile: null, plugins: null };
})();
const ids = (s) => new Set(s.rows.map((r) => r.id));

test('a tiny graph: neighbours, triads and communities', () => {
  const g = new Map([['a', new Set(['b', 'c'])], ['b', new Set(['a', 'c'])], ['c', new Set(['a', 'b', 'd'])], ['d', new Set(['c', 'e'])], ['e', new Set(['d'])]]);
  assert.deepEqual(neighbourhood(g, ['a'], 1).ring, ['b', 'c']);
  assert.deepEqual(neighbourhood(g, ['a'], 2).ring, ['b', 'c', 'd']);
  assert.deepEqual(triadsOf(g, 'a'), { degree: 2, pairs: 1, closed: 1, open: 0 });
  assert.deepEqual(triadsOf(g, 'c'), { degree: 3, pairs: 3, closed: 1, open: 2 });
  const comm = communities(g);
  assert.equal(comm.get('a'), comm.get('b'), 'the triangle is one community');
  assert.deepEqual(vennCounts([[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], null]), { a: 1, b: 1, c: 0, ab: 1, ac: 0, bc: 0, abc: 0 });
  const sp = spectrumOf([{ v: 0 }, { v: 1 }, { v: 1 }, { v: 4 }], 'v', 4);
  assert.equal(sp.count, 4); assert.equal(sp.bins.reduce((n, b) => n + b.n, 0), 4);
});

test('the new modules fit the rack and sit in the right category', () => {
  for (const t of ['neighbours', 'triads', 'prism', 'complement']) assert.equal(MODULES[t].cat, 'Sets & graphs');
  for (const t of ['venn', 'plotter', 'spectrum']) assert.equal(MODULES[t].cat, 'Displays');
  assert.ok(CATEGORIES.includes('Sets & graphs'));
  for (const d of Object.values(MODULES)) assert.ok(d.hp <= HP);
  // The starter patch's controls fit one shelf under the patchbay.
  const p = starterPatch();
  assert.equal(rowsOf(inRack(p, 'a')).length, 2);
});

test('set and graph modules run over the Kestrel facts', () => {
  const p = blankPatch();
  const f = addModule(p, 'facts', { type: 'actor' });
  const nb = addModule(p, 'neighbours', { hops: 1 }), tr = addModule(p, 'triads'), pr = addModule(p, 'prism'), co = addModule(p, 'complement'), v = addModule(p, 'venn');
  const fl = addModule(p, 'filter', { field: 'degree', op: 'lte', pct: 'p25' });
  for (const m of [nb, tr, pr, fl]) assert.ok(connect(p, { m: f.id, port: 'out' }, { m: m.id, port: 'in' }), 'an output feeds many');
  connect(p, { m: fl.id, port: 'pass' }, { m: co.id, port: 'in' });
  connect(p, { m: f.id, port: 'out' }, { m: v.id, port: 'a' });
  connect(p, { m: fl.id, port: 'pass' }, { m: v.id, port: 'b' });
  const { signals: s } = runPatch(p, ctx);
  const all = ids(s[f.id].out);
  // Neighbours: the ring is new things only, the ball is start + ring.
  assert.ok(s[nb.id].ring.rows.length > 0);
  assert.ok(s[nb.id].ring.rows.every((r) => !all.has(r.id)));
  assert.equal(s[nb.id].ball.rows.length, all.size + s[nb.id].ring.rows.length);
  // Triads: closed and open never overlap, and are drawn from the input.
  const c = ids(s[tr.id].closed), o = ids(s[tr.id].open);
  assert.ok([...c].every((x) => !o.has(x) && all.has(x)) && [...o].every((x) => all.has(x)));
  // Prism: three disjoint groups, biggest first.
  const [p1, p2, p3] = ['1', '2', '3'].map((k) => s[pr.id][k].rows.length);
  assert.ok(p1 >= p2 && p2 >= p3 && p1 > 0);
  // Complement + filter pass = every actor.
  assert.equal(s[co.id].out.rows.length + s[fl.id].pass.rows.length, all.size);
  // Venn out: in both A and B = the pass rows.
  assert.equal(s[v.id].all.rows.length, s[fl.id].pass.rows.length);
  assert.ok(patchToRule(p).problem, 'not a plain rule');
});

test('the plotter lays points out on the paper, the same way every time', () => {
  const rows = Object.values(ctx.facts.entities).filter((e) => e.type === 'actor').map((e) => ({ id: e.id, name: e.name }));
  const a = plotLayout(graphOf(ctx.facts), rows, { max: 30 }), b = plotLayout(graphOf(ctx.facts), rows, { max: 30 });
  assert.equal(a.nodes.length, Math.min(30, rows.length));
  assert.deepEqual(a.nodes.map((n) => [n.x, n.y]), b.nodes.map((n) => [n.x, n.y]));
  assert.ok(a.nodes.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1));
  assert.equal(a.more, rows.length - a.nodes.length);
});
