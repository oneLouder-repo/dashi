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

test('Far Beyond the Graph: the score comes from the network, the same every time', async () => {
  const { scoreOf, degree, hashOf, STEPS } = await import('../src/rhizome/labSound.js');
  const { facts, g } = kestrel;
  const a = scoreOf(facts, g, { snapshots: [{ at: '2026-11-01T00:00:00Z', entities: 300, relations: 400 }] });
  assert.deepEqual(scoreOf(facts, g, { snapshots: [{ at: '2026-11-01T00:00:00Z', entities: 300, relations: 400 }] }), a);
  assert.ok(a.bpm >= 72 && a.bpm <= 92);
  assert.ok(a.present.length > 1 && a.present.length <= 6);
  for (const l of a.present) {
    const steps = l.notes.map((n) => n.step);
    assert.equal(new Set(steps).size, steps.length, 'one note per step in a loop');
    assert.ok(steps.every((s) => s >= 0 && s < STEPS));
  }
  assert.ok(a.bass.length && a.bass.every((b) => b.midi < 40), 'brokers on bass');
  assert.ok(a.projected.length && a.projected.every((p) => p.guess), 'ghost notes are marked as guesses');
  assert.ok(a.past.ratio > 0 && a.past.ratio <= 1 && a.past.since === '2026-11-01');
  assert.match(a.madeOf, /^Made of \d+ connected things and \d[\d,]* ties: .* as loops.*nothing leaves it\.$/);
  // The edge is heard: a member with one tie becomes a bell.
  const toyG = toy();
  const tiny = scoreOf({ entities: Object.fromEntries([...toyG.keys()].map((id) => [id, { id, name: id.toUpperCase(), type: 'actor', attrs: {} }])), relations: [] }, toyG);
  assert.ok(tiny.present.flatMap((l) => l.notes).some((n) => n.id === 'y' && n.edge));
  assert.equal(degree(0), 50);
  assert.equal(degree(5), 62);
  assert.equal(hashOf('abc'), hashOf('abc'));
});

test('Teach can link Lab experiments and saved patches into a block', async () => {
  const { linkables, GROUPS } = await import('../src/teach/LinkPicker.js');
  const { blockType } = await import('../src/learning/cartridge.js');
  assert.ok(GROUPS.some((g) => g.id === 'lab'));
  assert.equal(blockType('experiment').id, 'experiment');
  const items = linkables({ rhizome: { labPatches: { p1: { id: 'p1', name: 'Who bridges groups', cmd: 'people | weigh broker', note: '' } } } }, new Set(['rhizome']));
  const lab = items.filter((it) => it.group === 'lab');
  assert.ok(lab.some((it) => it.key === 'lab:sound' && it.href.endsWith('#lab/sound')));
  assert.ok(lab.some((it) => it.key === 'labpatch:p1' && it.href.includes('#lab/console?run=people%20%7C%20weigh%20broker')));
  // Rhizome off: none.
  assert.ok(!linkables({}, new Set()).some((it) => it.group === 'lab'));
});
