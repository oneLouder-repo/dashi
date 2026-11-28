// Rhizome Lab: Leiden-style communities, brokers, k-cores, link prediction, shapes, the console and patch packs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../src/rhizome/facts.js';
import { graphOf } from '../src/rhizome/rackGraph.js';
import { leiden, modularity, communityList, brokers, kCore, predictTies, checkShapes } from '../src/rhizome/labAlgo.js';
import { runCommand, tokenize, typeFor, PATCH_PACKS, installPack, exportPack, readPack } from '../src/rhizome/labConsole.js';
import { RHIZOME_TABS } from '../src/rhizome/tabs.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

// Two cliques of four joined by one bridge (d–e), and a tail h–z–y.
const toy = () => {
  const g = new Map();
  const add = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) { if (!g.has(x)) g.set(x, new Set()); g.get(x).add(y); } };
  for (const c of [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]) for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) add(c[i], c[j]);
  add('d', 'e'); add('h', 'z'); add('z', 'y');
  return g;
};

const kestrel = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const facts = buildFacts({ ...docs, mapContents });
  return { facts, g: graphOf(facts) };
})();

test('Leiden-style communities find the two cliques, and every community is connected', () => {
  const g = toy();
  const labels = leiden(g);
  const list = communityList(labels).map((c) => c.ids);
  assert.deepEqual(list.slice(0, 2), [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]);
  assert.ok(modularity(g, labels) > 0.3);
  // The same graph always splits the same way.
  assert.deepEqual([...leiden(g)], [...labels]);
  // On real data: no community is in pieces.
  const { g: kg } = kestrel;
  for (const c of communityList(leiden(kg))) {
    const inside = new Set(c.ids), seen = new Set([c.ids[0]]), stack = [c.ids[0]];
    while (stack.length) for (const x of kg.get(stack.pop())) if (inside.has(x) && !seen.has(x)) { seen.add(x); stack.push(x); }
    assert.equal(seen.size, c.ids.length, 'connected');
  }
});

test('brokers: the bridge ends score higher than clique members; cores and predicted ties', () => {
  const g = toy();
  const b = brokers(g);
  assert.ok(b.get('d').broker > b.get('a').broker);
  assert.equal(b.get('a').effective, 1); // three contacts, all tied to each other
  const core = kCore(g);
  assert.equal(core.get('a'), 3);
  assert.equal(core.get('y'), 1);
  const ties = predictTies(g, { limit: 3 });
  assert.deepEqual([ties[0].a, ties[0].b, ties[0].via], ['h', 'y', ['z']]);
  assert.ok(ties.every((t) => !g.get(t.a).has(t.b)), 'only ties that are missing');
});

test('shape checks report what is missing', () => {
  const facts = { entities: { 'a1': { id: 'a1', type: 'actor', attrs: {} }, 'a2': { id: 'a2', type: 'actor', attrs: {} }, 'p1': { id: 'p1', type: 'person', attrs: { title: 'Lead' } } } };
  const g = new Map([['a1', new Set(['p1'])], ['p1', new Set(['a1'])], ['a2', new Set()]]);
  const r = checkShapes(facts, g);
  assert.deepEqual(r.find((x) => x.shape.id === 'actor-tied').failing, ['a2']);
  assert.deepEqual(r.find((x) => x.shape.id === 'person-title').failing, []);
  assert.ok(!r.some((x) => x.shape.type === 'task'), 'shapes with nothing to check are left out');
});

test('the console: pipes, fields, errors in plain words', () => {
  const { facts, g } = kestrel;
  assert.deepEqual(tokenize('actors where name ~ "first nations" | top 2'), [['actors', 'where', 'name', '~', 'first nations'], ['top', '2']]);
  assert.equal(typeFor('People'), 'person');
  const top = runCommand('people | weigh broker | top 3 | say', { facts, g });
  assert.equal(top.kind, 'rows');
  assert.equal(top.rows.length, 3);
  assert.ok(top.rows[0].broker >= top.rows[2].broker);
  assert.match(top.said, /^3 people\. By broker, /);
  assert.equal(runCommand('people where core <= 1 | count', { facts, g }).kind, 'text');
  assert.equal(runCommand('all | predict 5', { facts, g }).pairs.length, 5);
  assert.ok(runCommand('communities', { facts, g }).groups.length > 1);
  assert.match(runCommand('bogus', { facts, g }).error, /isn't something Rhizome knows/);
  assert.match(runCommand('people | weigh nope', { facts, g }).error, /isn't a field/);
  assert.match(runCommand('people | where ties < lots', { facts, g }).error, /is a number/);
  // Every patch in every pack runs.
  for (const p of PATCH_PACKS.flatMap((x) => x.patches)) assert.ok(!runCommand(p.cmd, { facts, g }).error, p.cmd);
});

test('patch packs install once, export and read back', () => {
  const doc = {};
  assert.equal(installPack(doc, PATCH_PACKS[0]), PATCH_PACKS[0].patches.length);
  assert.equal(installPack(doc, PATCH_PACKS[0]), 0, 'no duplicates');
  const pack = readPack(JSON.stringify(exportPack(doc)));
  const other = {};
  assert.equal(installPack(other, pack), PATCH_PACKS[0].patches.length);
  assert.throws(() => readPack('not json'), /JSON/);
  assert.throws(() => readPack('{"patches":[{}]}'), /cmd/);
});

test('the Lab took the Rack’s place on the tabs', () => {
  assert.ok(RHIZOME_TABS.some((t) => t.id === 'lab'));
  assert.ok(!RHIZOME_TABS.some((t) => t.id === 'rack'));
});
