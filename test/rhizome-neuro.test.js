// Rack neuro-symbolic tools (d, 2026-11-27): mocked Claude tools that run on the same patch API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../src/rhizome/facts.js';
import { measureFacts } from '../src/rhizome/measures.js';
import { MODULES, blankPatch, addModule, connect, runPatch, unfoldTranslator, specToPatch, defaultRack } from '../src/rhizome/rack.js';
import { translate, narrate, verify, critique, conceptLens, usageOf } from '../src/rhizome/neuro.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const ctx = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const facts = buildFacts({ ...docs, mapContents });
  const measures = measureFacts(facts, { today: '2026-11-22' });
  return { facts, measures, calibration: measures.calibration, profile: null, plugins: null };
})();

test('the neuro-symbolic tools are modules like any other, in rack B', () => {
  for (const t of ['translator', 'concept', 'narrator', 'verifier', 'critic']) {
    assert.equal(MODULES[t].cat, 'Neuro-symbolic');
    assert.equal(defaultRack(t), 'b');
  }
});

test('the Translator turns plain words into a patch the rack can run', () => {
  const s = translate('Which of our partners are barely connected but sit between groups?', ctx);
  assert.deepEqual(s.modules.map((m) => m.type), ['facts', 'filter', 'filter', 'weigh', 'say']);
  assert.equal(s.modules[1].params.field, 'degree');
  assert.equal(s.modules[2].params.field, 'betweenness');
  assert.match(s.prompt, /Never invent names/);
  assert.ok(s.usage.inTok > 0 && s.usage.cost > 0);
  const either = translate('Which objectives have no measure or nobody on them?', ctx);
  assert.ok(either.modules.some((m) => m.type === 'gate' && m.params.mode === 'or'));
  assert.equal(either.modules[0].params.type, 'objective');
  const near = translate('Who is one step away from our hubs?', ctx);
  assert.deepEqual(near.modules.slice(0, 2).map((m) => m.type), ['measure', 'neighbours']);
  // It runs as a module, and unfolds into the patch.
  const p = blankPatch();
  const t = addModule(p, 'translator', { q: 'Which community actors are barely connected?' });
  const run = runPatch(p, ctx);
  assert.equal(run.signals[t.id].out.kind, 'findings');
  assert.ok(run.signals[t.id].out.findings.length > 0);
  const made = unfoldTranslator(p, t.id, ctx);
  assert.ok(made.length >= 4 && p.modules.some((m) => m.type === 'scope'));
  assert.equal(runPatch(specToPatch(translate('hubs', ctx)), ctx).signals ? true : false, true);
});

test('the Narrator cites its findings, and the Verifier catches what it makes up', () => {
  const p = blankPatch();
  const f = addModule(p, 'measure', { list: 'hubs' });
  const w = addModule(p, 'weigh');
  const s = addModule(p, 'say', { tip: 'net-hub' });
  const n = addModule(p, 'narrator', { imagination: 0.9 });
  const v = addModule(p, 'verifier');
  connect(p, { m: f.id, port: 'out' }, { m: w.id, port: 'in' });
  connect(p, { m: w.id, port: 'out' }, { m: s.id, port: 'in' });
  connect(p, { m: s.id, port: 'out' }, { m: n.id, port: 'in' });
  connect(p, { m: n.id, port: 'out' }, { m: v.id, port: 'in' });
  const run = runPatch(p, ctx);
  const said = run.signals[n.id].out.findings;
  assert.ok(said.length >= 2);
  assert.ok(said.filter((x) => !x.invented).every((x) => x.cites.length > 0), 'real sentences cite findings');
  assert.ok(said.some((x) => x.invented));
  const flagged = run.signals[v.id].flag.findings;
  assert.ok(flagged.some((x) => x.invented), 'the made-up sentence is flagged');
  assert.ok(!run.signals[v.id].ok.findings.some((x) => x.invented));
  assert.ok(flagged.find((x) => x.invented).trail.some((t) => t.ok === false && /not in your facts/.test(t.text)));
  // Calm, it makes nothing up.
  const calm = narrate(run.signals[s.id].out.findings, { imagination: 0.1 });
  assert.ok(!calm.sentences.some((x) => x.invented));
  assert.equal(verify([{ text: 'Municipal councils matter.', rows: [] }], ctx)[0].ok, true);
});

test('the Critic reads the patch like a reviewer', () => {
  const p = blankPatch();
  const f = addModule(p, 'facts', { type: 'actor' });
  const s = addModule(p, 'say', { tip: 'net-isolates', group: false });
  addModule(p, 'critic');
  connect(p, { m: f.id, port: 'out' }, { m: s.id, port: 'in' });
  const run = runPatch(p, ctx);
  const notes = critique(p, run, MODULES).map((x) => x.text).join(' ');
  assert.match(notes, /no Weigh/);
  assert.match(notes, /grouped/);
  const c = p.modules.find((m) => m.type === 'critic');
  assert.ok(run.signals[c.id].out.findings.length >= 2);
});

test('the Concept lens ranks by meaning', () => {
  const rows = [{ id: 'a', name: 'Harbour food bank' }, { id: 'b', name: 'Town council' }, { id: 'c', name: 'Community pantry and food hub' }];
  const r = conceptLens(rows, 'food', { facts: { entities: {} } });
  assert.equal(r[r.length - 1].row.id, 'b');
  assert.ok(r[0].sim > 0);
  assert.equal(usageOf('abcd', 'abcdabcd').outTok, 2);
});
