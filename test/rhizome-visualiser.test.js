// Rhizome stage 4: the critical AI visualiser, and moving modules by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../src/rhizome/facts.js';
import { measureFacts } from '../src/rhizome/measures.js';
import { visualise, tokenise, LANES, DEFAULT_QUESTION } from '../src/rhizome/visualiser.js';
import { MODULES, HP, blankPatch, addModule, placeModule, inRack, connect, runPatch, starterPatch } from '../src/rhizome/rack.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const ctx = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const facts = buildFacts({ ...docs, mapContents });
  const measures = measureFacts(facts, { today: '2026-11-22' });
  return { facts, measures, calibration: measures.calibration, profile: null, plugins: null };
})();

test('six lanes, and a critical lens note for each', () => {
  assert.deepEqual(LANES.map((l) => l.id), ['tokens', 'meaning', 'retrieval', 'attention', 'reasoning', 'answer']);
  const t = visualise({ question: DEFAULT_QUESTION, facts: ctx.facts, measures: ctx.measures });
  for (const l of LANES) assert.ok(t.lens[l.id]?.length > 20, `lens for ${l.id}`);
});

test('tokens: filler fades, content stays', () => {
  const toks = tokenise('Who are the hubs?');
  assert.deepEqual(toks.filter((t) => !t.filler).map((t) => t.text), ['hubs']);
  assert.ok(toks.find((t) => t.text === '?').filler);
});

test('a question about hubs fires the hubs rule, and the answer cites its facts', () => {
  const t = visualise({ question: 'Who are the hubs?', facts: ctx.facts, measures: ctx.measures });
  assert.equal(t.lanes.meaning[0].kind, 'measure');
  const hubs = new Set(ctx.measures.lists.hubs);
  assert.ok(t.lanes.reasoning.some((r) => r.rule === 'hubs' && r.fits));
  const first = t.lanes.answer.phrases[0];
  assert.match(first.text, /hubs/);
  assert.ok(first.facts.length && first.facts.every((id) => hubs.has(id) || ctx.facts.entities[id]), 'every phrase points at real facts');
  assert.ok(t.findings.length >= 1);
});

test('words it has no match for stay grey, and the lens says so', () => {
  const t = visualise({ question: 'What about the zorblax people?', facts: ctx.facts, measures: ctx.measures });
  assert.ok(t.lanes.meaning.some((m) => m.text === 'zorblax' && !m.kind));
  assert.match(t.lens.meaning, /zorblax/);
});

test('moving the weights changes the attention, with the same facts', () => {
  const q = 'Which community groups are on the edge of our network?';
  const a = visualise({ question: q, facts: ctx.facts, measures: ctx.measures, weights: { near: 1, links: 0, words: 0 } });
  const b = visualise({ question: q, facts: ctx.facts, measures: ctx.measures, weights: { near: 0, links: 1, words: 0 } });
  assert.notDeepEqual(a.lanes.attention.facts.map((f) => f.id), b.lanes.attention.facts.map((f) => f.id));
  assert.match(b.lens.attention, /Links make up/);
});

test('nothing matched: it falls back on what is plugged in, and says so', () => {
  const rows = Object.values(ctx.facts.entities).filter((e) => e.type === 'actor').slice(0, 5).map((e) => ({ id: e.id, name: e.name }));
  const t = visualise({ question: 'Hmm?', rows, facts: ctx.facts, measures: ctx.measures });
  assert.equal(t.lanes.retrieval.fallback, true);
  assert.match(t.lens.retrieval, /fell back/);
});

test('the visualiser is a full rack wide, runs in the patch and sends findings out', () => {
  assert.equal(MODULES.visualiser.hp, HP);
  assert.deepEqual(MODULES.visualiser.outs, ['out']);
  const p = starterPatch();
  const vis = p.modules.find((m) => m.type === 'visualiser');
  const { signals, traces } = runPatch(p, ctx);
  assert.ok(traces[vis.id].lanes.tokens.length);
  assert.equal(signals[vis.id].out.kind, 'findings');
});

test('drag and drop: a module lands before or after another, in either rack', () => {
  const p = blankPatch();
  const bay = addModule(p, 'patchbay');
  const f = addModule(p, 'facts'), w = addModule(p, 'weigh'), s = addModule(p, 'scope');
  assert.ok(placeModule(p, w.id, 'a', f.id, false));
  assert.deepEqual(inRack(p, 'a').map((m) => m.type), ['patchbay', 'weigh', 'facts']);
  assert.ok(placeModule(p, f.id, 'b', s.id, true));
  assert.deepEqual(inRack(p, 'b').map((m) => m.type), ['scope', 'facts']);
  assert.ok(placeModule(p, w.id, 'a', bay.id, false), 'dropping on the patchbay lands after it');
  assert.equal(p.modules[0], bay);
  assert.equal(placeModule(p, bay.id, 'b'), false, 'the patchbay stays put');
  connect(p, { m: f.id, port: 'out' }, { m: w.id, port: 'in' });
  assert.ok(placeModule(p, f.id, 'a'));
  assert.equal(p.cables.length, 1, 'cables stay plugged in when a module moves');
});
