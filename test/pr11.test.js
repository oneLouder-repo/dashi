import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actuaDocs } from '../src/platform/clients/actua.js';
import { studioOps, tocToPlan } from '../src/platform/studio.js';
import { strategyOps, layersInPlan, withoutLayers } from '../src/platform/strategy.js';
import { swSections } from '../src/strategy/swNav.js';

const apply = (doc, ops) => {
  for (const op of ops.flatMap((o) => (o.op === 'batch' ? o.ops : [o]))) {
    if (op.op === 'add') doc[op.collection][op.id] = { ...op.data, id: op.id };
    else if (op.op === 'update') Object.assign(doc[op.collection][op.id], op.patch);
  }
};

function freshTheory() {
  const { strategy, studio } = actuaDocs();
  const root = Object.values(strategy.nodes).find((n) => !n.parentId);
  const p = strategyOps.addNode(strategy, { type: 'plan', parentId: root.id, title: 'A new plan' });
  apply(strategy, [p]);
  const add = (lane, title) => { const op = studioOps.add('toc', { planId: p.id, lane, title, order: 0 }); apply(studio, [op]); return op.id; };
  return { strategy, studio, planId: p.id, add, link: (from, to) => apply(studio, [studioOps.add('tocLinks', { planId: p.id, from, to })]) };
}

test('a new theory of change makes goals and objectives even before it is linked into the plan', () => {
  const { strategy, studio, planId, add, link } = freshTheory();
  add('short', 'Families talk about AI at home');
  const a = add('activity', 'Family AI nights');
  const o = add('output', 'Twenty nights a year');
  link(a, o);
  const out = tocToPlan(studio, strategy, planId);
  apply(strategy, out.strategyOps);
  apply(studio, out.studioOps);
  const made = Object.values(strategy.nodes).filter((n) => n.draft);
  const types = made.map((n) => n.type).sort();
  assert.deepEqual(types, ['goal', 'goal', 'objective', 'task', 'workplan', 'workplan'].sort().filter((t, i, x) => x.indexOf(t) === i).flatMap((t) => types.filter((y) => y === t)));
  assert.ok(made.some((n) => n.type === 'objective' && n.tocHolder === 'new:objective' && n.parentId === planId), 'a holder objective under the plan');
  assert.ok(made.every((n) => n.tocLayer === 'new'), 'each draft knows its layer');
  // Sending again finds the same holders: nothing doubles.
  const again = tocToPlan(studio, strategy, planId);
  assert.equal(again.strategyOps.filter((op) => op.op === 'add').length, 0);
});

test('the theory’s layers can be hidden in Strategy & Work', () => {
  const { strategy, studio, planId, add } = freshTheory();
  add('long', 'Every family is AI-confident');
  apply(strategy, tocToPlan(studio, strategy, planId).strategyOps);
  assert.equal(layersInPlan(strategy).new, 1);
  const shown = withoutLayers(strategy, new Set(['new']));
  assert.ok(!Object.values(shown.nodes).some((n) => n.draft));
  assert.equal(withoutLayers(strategy, new Set()), strategy);
});

test('Strategy & Work has one left panel, in the same order on every page, every item with a second line', () => {
  const { strategy } = actuaDocs();
  const pages = ['strategy', 'studio', 'plandoc'].map((page) => swSections({ page, strategy }));
  const labels = (secs) => secs.map((s) => [s.title, s.items.map((i) => i.label)]);
  assert.deepEqual(labels(pages[0]), labels(pages[1]));
  assert.deepEqual(labels(pages[1]), labels(pages[2]));
  assert.deepEqual(pages[0][0].items.map((i) => i.label), ['Overview', 'Framework', 'Strategic data', 'Workplan completion', 'Roadmap', 'Plan designer']);
  assert.ok(pages.flat().every((s) => s.items.every((i) => i.sub)), 'every item has a second line');
});
