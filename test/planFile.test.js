// Plan files: save plans as .dashi-plan.json and open them as new plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStrategy } from '../src/platform/strategySeed.js';
import { seedStudio, ofPlan } from '../src/platform/studio.js';
import { migrateStrategy, rootOf, childrenOf, descendants } from '../src/platform/strategy.js';
import { exportPlans, readPlanFile, importPlans, planFileName } from '../src/platform/planFile.js';

const setup = () => {
  const strategy = migrateStrategy(seedStrategy());
  const studio = seedStudio(strategy, { staff: ['s1', 's2'] });
  const plan = childrenOf(strategy, rootOf(strategy).id).find((n) => n.type === 'plan');
  return { strategy, studio, plan };
};
const apply = (strategy, result) => { for (const n of result.nodes) strategy.nodes[n.id] = n; return strategy; };

test('exportPlans keeps a plan, everything under it and its studio work', () => {
  const { strategy, studio, plan } = setup();
  const file = exportPlans(strategy, studio, [plan.id], { org: { id: 'org-a', name: 'A' } });
  assert.equal(file.format, 'dashi-plan');
  assert.equal(file.nodes.length, 1 + descendants(strategy, plan.id).length);
  assert.ok(file.nodes.every((n) => n.type !== 'framework'));
  const cards = ofPlan(studio, 'cards', plan.id).length;
  assert.equal(file.studio.cards.length, cards);
  assert.equal(planFileName('Plan 2026–27: Growth!'), 'plan-2026-27-growth.dashi-plan.json');
});

test('readPlanFile explains files it cannot use', () => {
  assert.throws(() => readPlanFile('nope'), /isn’t JSON/);
  assert.throws(() => readPlanFile('{"format":"dashi-map"}'), /isn’t a Dashi plan file/);
  assert.throws(() => readPlanFile('{"format":"dashi-plan","version":99,"nodes":[]}'), /newer Dashi/);
});

test('importPlans in the same org adds a copy with new ids and keeps people', () => {
  const { strategy, studio, plan } = setup();
  const file = readPlanFile(JSON.stringify(exportPlans(strategy, studio, [plan.id], { org: { id: 'org-a' } })));
  const before = Object.keys(strategy.nodes).length;
  const r = importPlans(file, strategy, { orgId: 'org-a' });
  assert.equal(r.nodes.length, file.nodes.length);
  assert.ok(r.nodes.every((n) => !strategy.nodes[n.id]), 'every id is new');
  apply(strategy, r);
  assert.equal(Object.keys(strategy.nodes).length, before + file.nodes.length);
  const copy = strategy.nodes[r.planIds[0]];
  assert.equal(copy.parentId, rootOf(strategy).id);
  assert.match(copy.title, /\(imported\)$/);
  assert.equal(descendants(strategy, copy.id).length, descendants(strategy, plan.id).length);
  // Measure ids are new, and studio items follow their plan and measures.
  const oldM = new Set(descendants(strategy, plan.id).flatMap((n) => (n.measures ?? []).map((m) => m.id)));
  const newM = descendants(strategy, copy.id).flatMap((n) => (n.measures ?? []).map((m) => m.id));
  assert.ok(newM.every((id) => !oldM.has(id)));
  assert.ok(Object.values(r.studio.cards).every((c) => c.planId === copy.id));
  for (const w of Object.values(r.studio.wires)) assert.ok(r.studio.blocks[w.from] && r.studio.blocks[w.to]);
  assert.deepEqual(r.notes, []);
});

test('importPlans in another org leaves out people and org-only assets', () => {
  const { strategy, studio, plan } = setup();
  const file = exportPlans(strategy, studio, [plan.id], { org: { id: 'org-a', name: 'Org A' } });
  const wp = file.nodes.find((n) => n.type === 'workplan');
  wp.staffIds = ['s1'];
  wp.assets = [{ id: 'x', kind: 'staff', ref: 's1', label: 'Sam' }, { id: 'y', kind: 'link', url: 'https://example.org', label: 'Site' }];
  const empty = { nodes: {} };
  const r = importPlans(file, empty, { orgId: 'org-b' });
  assert.equal(r.nodes[0].type, 'framework', 'a framework is made when the org has none');
  const newWp = r.nodes.find((n) => n.type === 'workplan' && n.title === wp.title);
  assert.deepEqual(newWp.staffIds, []);
  assert.deepEqual(newWp.assets.map((a) => a.kind), ['link']);
  assert.ok(r.notes.some((n) => /Org A/.test(n)));
  assert.ok(Object.values(r.studio.plans).every((p) => p.team.length === 0));
});
