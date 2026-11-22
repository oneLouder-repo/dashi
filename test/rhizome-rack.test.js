// Rhizome stage 3: the rack. Patches are data; a straight chain is a rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../src/rhizome/facts.js';
import { measureFacts } from '../src/rhizome/measures.js';
import { RULES, ruleById, runRule, runAnalysis } from '../src/rhizome/rules.js';
import { MODULES, HP, blankPatch, addModule, removeModule, moveModule, swapRack, inRack, rowsOf, connect, disconnect, order, runPatch, ruleToPatch, patchToRule, starterPatch, describeModule } from '../src/rhizome/rack.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const ctx = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const facts = buildFacts({ ...docs, mapContents });
  const measures = measureFacts(facts, { today: '2026-11-22' });
  return { facts, measures, calibration: measures.calibration, profile: null, plugins: null };
})();

test('every module fits a rack row, and screens and engines go in rack B', () => {
  for (const [type, d] of Object.entries(MODULES)) {
    assert.ok(d.hp > 0 && d.hp <= HP, `${type} width`);
    assert.ok(Array.isArray(d.ins) && Array.isArray(d.outs), `${type} jacks`);
    assert.ok(['analog', 'digital'].includes(d.look));
  }
  const p = blankPatch();
  const s = addModule(p, 'scope'), f = addModule(p, 'facts'), c = addModule(p, 'claude');
  assert.equal(s.rack, 'b'); assert.equal(c.rack, 'b'); assert.equal(f.rack, 'a');
  assert.equal(MODULES.claude.look, 'digital');
  assert.ok(swapRack(p, f.id) && f.rack === 'b');
  const bay = addModule(p, 'patchbay');
  assert.equal(p.modules[0], bay, 'the patchbay sits at the top');
  assert.equal(swapRack(p, bay.id), false);
});

test('rows flow left to right and wrap when a row is full', () => {
  const p = blankPatch();
  for (let i = 0; i < 7; i++) addModule(p, 'weigh'); // 7 × 7 HP in a 42 HP row
  const rows = rowsOf(inRack(p, 'a'));
  assert.deepEqual(rows.map((r) => r.length), [6, 1]);
  const [a, b] = p.modules;
  assert.ok(moveModule(p, b.id, -1));
  assert.equal(p.modules[0], b);
  assert.equal(moveModule(p, b.id, -1), false, 'nothing to its left');
});

test('cables: output to input only, one cable per input, no loops', () => {
  const p = blankPatch();
  const f = addModule(p, 'facts'), w1 = addModule(p, 'weigh'), w2 = addModule(p, 'weigh');
  assert.ok(connect(p, { m: f.id, port: 'out' }, { m: w1.id, port: 'in' }));
  assert.equal(connect(p, { m: f.id, port: 'in' }, { m: w1.id, port: 'in' }), null, 'facts has no input');
  assert.ok(connect(p, { m: w1.id, port: 'out' }, { m: w2.id, port: 'in' }));
  assert.equal(connect(p, { m: w2.id, port: 'out' }, { m: w1.id, port: 'in' }), null, 'a loop is refused');
  connect(p, { m: f.id, port: 'out' }, { m: w2.id, port: 'in' });
  assert.equal(p.cables.filter((c) => c.to.m === w2.id).length, 1, 'a new cable replaces the old one at an input');
  assert.deepEqual(order(p)[0], f.id);
  disconnect(p, p.cables[0].id);
  removeModule(p, f.id);
  assert.equal(p.cables.length, 0);
});

test('every built-in rule, opened in the rack and run, gives the same findings as the rule', () => {
  for (const rule of RULES) {
    if (rule.source === 'place') continue;
    const patch = ruleToPatch(rule);
    const { signals } = runPatch(patch, ctx);
    const say = patch.modules.find((m) => m.type === 'say');
    const fromRack = signals[say.id].out.findings;
    const fromRule = runRule(rule, ctx);
    assert.equal(fromRack.length, fromRule.length, `${rule.id}: same number of findings`);
    if (fromRule.length) assert.equal(Math.max(...fromRack.map((f) => f.score)), Math.max(...fromRule.map((f) => f.score)), `${rule.id}: same top score`);
  }
});

test('a patch turns back into the rule it came from', () => {
  for (const id of ['community-thin', 'hub-load', 'isolates', 'hollow-objective']) {
    const rule = ruleById[id];
    const { rule: back } = patchToRule(ruleToPatch(rule));
    assert.deepEqual(back.from, rule.from, id);
    assert.deepEqual(back.when, rule.when.map((c) => ({ field: c.field, op: c.op, ...(c.pct ? { pct: c.pct } : { value: c.value }) })), id);
    assert.equal(back.say, rule.say);
    assert.equal(!!back.group, !!rule.group);
    assert.equal(back.source, rule.source, id);
  }
});

test('a patch with a gate stays a patch, and says why', () => {
  const p = blankPatch();
  const a = addModule(p, 'facts', { type: 'actor' }), b = addModule(p, 'measure', { list: 'hubs' });
  const g = addModule(p, 'gate', { mode: 'and' }), s = addModule(p, 'say', { tip: 'net-hub' });
  connect(p, { m: a.id, port: 'out' }, { m: g.id, port: 'a' });
  connect(p, { m: b.id, port: 'out' }, { m: g.id, port: 'b' });
  connect(p, { m: g.id, port: 'out' }, { m: s.id, port: 'in' });
  const { signals } = runPatch(p, ctx);
  assert.equal(signals[g.id].out.rows.length, ctx.measures.lists.hubs.length, 'AND keeps the actors that are hubs');
  g.params.mode = 'not';
  assert.equal(runPatch(p, ctx).signals[g.id].out.rows.length, Object.values(ctx.facts.entities).filter((e) => e.type === 'actor').length - ctx.measures.lists.hubs.length);
  assert.match(patchToRule(p).problem, /Gate/);
  assert.match(patchToRule(blankPatch()).problem, /Say/);
});

test('your own rules run in Analyses beside the built-in ones', () => {
  const { rule } = patchToRule(ruleToPatch(ruleById['isolates']), { id: 'own-test' });
  const c = { ...ctx, customRules: { 'own-test': rule }, custom: { own: { id: 'own', rules: ['own-test'] } } };
  const found = runAnalysis('own', c);
  assert.equal(found.length, runRule(ruleById.isolates, ctx).length);
  assert.ok(found.every((f) => f.ruleId === 'own-test'));
});

test('the starter patch is cabled through to the engines in rack B', () => {
  const p = starterPatch();
  assert.ok(p.modules.some((m) => m.type === 'patchbay'));
  const eng = p.modules.filter((m) => MODULES[m.type].cat === 'Engines');
  assert.ok(eng.length >= 2 && eng.every((m) => m.rack === 'b'));
  assert.ok(eng.every((m) => p.cables.some((c) => c.to.m === m.id)));
  const { inputs } = runPatch(p, ctx);
  assert.ok(inputs[eng[0].id].in, 'the visualiser gets a signal');
  assert.ok(patchToRule(p).rule, 'and it is still a rule');
  assert.match(describeModule(p.modules.find((m) => m.type === 'filter')), /category|links/);
});

test('no two files differ only by letter case (macOS and Windows would see one file)', async () => {
  const { readdirSync } = await import('node:fs');
  const seen = new Map();
  for (const dir of ['src', 'server', 'test', 'media/help']) {
    for (const f of readdirSync(dir, { recursive: true })) {
      const key = `${dir}/${f}`.toLowerCase();
      assert.ok(!seen.has(key), `${dir}/${f} clashes with ${seen.get(key)}`);
      seen.set(key, `${dir}/${f}`);
    }
  }
});
