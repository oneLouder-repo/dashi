import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actuaDocs } from '../src/platform/clients/actua.js';
import { CLIENT_RESET } from '../src/platform/clients/index.js';
import { col } from '../src/core/collections.js';
import { studioOps, tocToPlan, tocFromPlan, layersOf, layerOf, draftsOf, acceptDraftOps, plansOf, ofPlan } from '../src/platform/studio.js';

const applyAll = (doc, ops) => {
  for (const op of ops.flatMap((o) => (o.op === 'batch' ? o.ops : [o]))) {
    if (op.op === 'add') doc[op.collection][op.id] = { ...op.data, id: op.id };
    else if (op.op === 'update') Object.assign(doc[op.collection][op.id], op.patch);
  }
};

test('Actua is seeded with a planning studio from its plan and a blank theory of change', () => {
  const { strategy, studio } = actuaDocs();
  assert.ok(Object.keys(studio.cards).length >= 12, 'SOAR cards');
  assert.ok(Object.keys(studio.blocks).length > 10, 'an assembled plan');
  assert.ok(Object.keys(studio.results).length > 5, 'results');
  assert.equal(Object.keys(studio.toc).length, 0, 'no theory of change yet');
  assert.ok(plansOf(strategy).length >= 1);
  assert.deepEqual(CLIENT_RESET.docs['org-actua-ai'], ['strategy', 'studio']);
});

test('the theory of change goes to the plan as drafts, placed under what each leads to', () => {
  const { strategy, studio } = actuaDocs();
  const planId = plansOf(strategy)[0].id;
  applyAll(studio, tocFromPlan(studio, strategy, planId));
  const from = ofPlan(studio, 'toc', planId);
  assert.ok(from.length > 0 && from.every((x) => layerOf(x) === 'plan'));
  assert.equal(tocToPlan(studio, strategy, planId).strategyOps.length, 0, 'nothing new to send');

  // New thinking: a parallel lasting change with an early change, an activity and an output.
  const add = (data) => { const op = studioOps.add('toc', { planId, strategyId: null, order: 9, ...data }); applyAll(studio, [op]); return op.id; };
  const link = (a, b, assumption = '') => applyAll(studio, [studioOps.add('tocLinks', { planId, from: a, to: b, assumption, confidence: 'untested', evidence: [], signpost: null })]);
  const L = add({ lane: 'long', title: 'Nations lead their own AI policy' });
  const S = add({ lane: 'short', title: 'Policy circles in five nations' });
  const A = add({ lane: 'activity', title: 'Host policy circles' });
  const O = add({ lane: 'output', title: 'Five circle reports' });
  link(S, L, 'Policy follows practice'); link(A, O); link(O, S);
  assert.equal(layerOf(studio.toc[L]), 'new');

  const out = tocToPlan(studio, strategy, planId, { layers: ['new'] });
  assert.deepEqual(out.preview.map((p) => p.type), ['objective', 'goal', 'workplan', 'task']);
  assert.equal(out.loose.length, 0);
  applyAll(strategy, out.strategyOps);
  applyAll(studio, out.studioOps);
  const obj = strategy.nodes[studio.toc[L].strategyId];
  const task = strategy.nodes[studio.toc[O].strategyId];
  assert.equal(obj.parentId, planId);
  assert.ok(obj.draft && task.draft && task.status === 'planned');
  assert.match(strategy.nodes[studio.toc[S].strategyId].notes, /Policy follows practice/);
  assert.equal(draftsOf(strategy).length, 4);

  // Sending again updates the drafts rather than making more.
  studio.toc[L].title = 'Nations lead AI policy';
  const again = tocToPlan(studio, strategy, planId, { layers: ['new'] });
  assert.ok(again.preview.length === 4 && again.preview.every((p) => p.action === 'update'));
  applyAll(strategy, again.strategyOps);
  assert.equal(obj.title, 'Nations lead AI policy');

  // Accepting a goal accepts its draft objective too.
  applyAll(strategy, acceptDraftOps(strategy, studio.toc[S].strategyId));
  assert.equal(obj.draft, false);
  assert.equal(draftsOf(strategy).length, 2);
  assert.equal(layersOf(studio, planId).length, 2);
});
