import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedPodcasts, migratePodcasts, podcastRoute, episodeHref, seriesHref } from '../src/platform/podcasts.js';
import { migrateStrategy, liveNodeId, canHold, childrenOf } from '../src/platform/strategy.js';
import { migrateStudio, blankStudio } from '../src/platform/studio.js';
import { refoldDashboards } from '../src/platform/dashboards.js';

const doc = migratePodcasts(seedPodcasts());

test('the episode list is home, and anything unknown lands there', () => {
  assert.deepEqual(podcastRoute('', doc), { scope: 'episodes', seriesId: null, base: 'episodes', tray: null });
  assert.equal(podcastRoute('#nowhere/at-all', doc).base, 'episodes');
  assert.equal(podcastRoute('#series/gone', doc).base, 'episodes');
});

test('an episode, its form and a series’ settings open as trays over the page behind', () => {
  assert.deepEqual(podcastRoute('#episodes/ep-sv-1', doc).tray, { kind: 'episode', id: 'ep-sv-1' });
  assert.deepEqual(podcastRoute('#series/pod-stem-voices/ep-sv-1/edit', doc), { scope: 'series', seriesId: 'pod-stem-voices', base: 'series/pod-stem-voices', tray: { kind: 'edit', id: 'ep-sv-1' } });
  assert.deepEqual(podcastRoute('#series/pod-stem-voices/settings', doc).tray, { kind: 'settings', id: 'pod-stem-voices' });
  assert.deepEqual(podcastRoute('#station/new', doc), { scope: 'station', seriesId: null, base: 'station', tray: { kind: 'new', id: null } });
  assert.equal(podcastRoute('#episodes/settings', doc).tray, null, 'only a series has settings');
  assert.equal(podcastRoute('#episodes/no-such-episode', doc).tray, null);
});

test('older addresses (#<series>/<episode>) still land in the right place', () => {
  const r = podcastRoute('#pod-stem-voices/ep-sv-2', doc);
  assert.equal(r.base, 'series/pod-stem-voices');
  assert.deepEqual(r.tray, { kind: 'episode', id: 'ep-sv-2' });
  assert.equal(podcastRoute('#pod-land/settings', doc).tray.kind, 'settings');
});

test('links into Podcasts use the new addresses, and episodes can credit guests', () => {
  assert.equal(episodeHref(doc.episodes['ep-sv-1']), 'podcasts.html#episodes/ep-sv-1');
  assert.equal(seriesHref(doc.podcasts['pod-land']), 'podcasts.html#series/pod-land');
  assert.ok(Object.values(doc.episodes).every((e) => Array.isArray(e.guests)));
});

test('plans cannot hold plans; an older plan inside a plan folds into the one around it', () => {
  assert.equal(canHold('plan', 'plan'), false);
  assert.equal(canHold('framework', 'plan'), true);
  const node = (id, type, parentId, order, more = {}) => ({ id, type, parentId, order, title: id, notes: '', ...more });
  const doc = migrateStrategy({ id: 's', nodes: {
    f: node('f', 'framework', null, 0),
    big: node('big', 'plan', 'f', 0, { start: '2026-04-01', end: '2030-03-31' }),
    y1: node('y1', 'plan', 'big', 0, { start: '2026-04-01', end: '2027-03-31', milestones: [{ id: 'm1', date: '2026-06-01', title: 'Board' }] }),
    o1: node('o1', 'objective', 'y1', 0, { measures: [] }),
    y2: node('y2', 'plan', 'big', 1, { start: '2027-04-01', end: '2031-03-31' }),
    o2: node('o2', 'objective', 'y2', 0, { measures: [] }),
  } });
  assert.deepEqual(childrenOf(doc, 'big').map((n) => n.id), ['o1', 'o2']);
  assert.equal(doc.nodes.y1, undefined);
  assert.equal(doc.nodes.big.end, '2031-03-31', 'the plan stretches to cover what folded in');
  assert.deepEqual(doc.nodes.big.milestones.map((m) => m.id), ['m1']);
  assert.equal(liveNodeId(doc, 'y2'), 'big');

  const studio = blankStudio();
  studio.plans.y1 = { id: 'y1', team: [], notes: 'ours' };
  studio.cards.c = { id: 'c', planId: 'y1', quadrant: 's', text: 'x', at: 1 };
  migrateStudio(studio, doc);
  assert.equal(studio.plans.big.notes, 'ours');
  assert.equal(studio.cards.c.planId, 'big');

  const dashes = { dashboards: { d: { sourceNodeId: 'y1', widgets: [{ nodeId: 'y2' }, { measureId: 'm' }] } } };
  assert.equal(refoldDashboards(dashes, doc), true);
  assert.equal(dashes.dashboards.d.sourceNodeId, 'big');
  assert.equal(dashes.dashboards.d.widgets[0].nodeId, 'big');
});

test('a theory of change lays out from the plan, reads as pathways, and counts what is ready', async () => {
  const { seedStrategy } = await import('../src/platform/strategySeed.js');
  const { seedStudio, tocFromPlan, tocReadiness, tocStory, tocMarkdown, plansOf, mergeStudio } = await import('../src/platform/studio.js');
  const s = migrateStrategy(seedStrategy());
  const studio = seedStudio(s, { staff: [] });
  const planId = plansOf(s)[0].id;
  const r = tocReadiness(studio, planId);
  assert.ok(r.items > 10 && r.links > 10);
  assert.ok(r.assumed >= 2 && r.signposts >= 2 && r.evidenced >= 1, 'the example fills some in');
  assert.equal(tocFromPlan(studio, s, planId).length, 0, 'laying it out again adds nothing new');
  const story = tocStory(studio, planId);
  assert.equal(story.length, Object.values(s.nodes).filter((n) => n.type === 'objective' && n.parentId === planId).length, 'one pathway per lasting change in this plan');
  const equity = story.find((p) => /equity/i.test(p.title));
  assert.ok(equity.lines.some(([k]) => k === 'What it produces'));
  assert.ok(equity.lines.some(([k, v]) => k === 'It rests on' && /reaching more girls/i.test(v)));
  assert.match(tocMarkdown(story), /^\*\*/);
  assert.ok(Object.keys(mergeStudio(studio, studio).toc).length === r.items, 'theories of change merge like the rest of the studio');
});

test('the example keeps Year 1 and Year 2 as sibling plans, and an example folded into one plan splits back', async () => {
  const node = (id, type, parentId, order, more = {}) => ({ id, type, parentId, order, title: id, notes: '', ...more });
  const doc = {
    id: 'strategy-example',
    nodes: {
      f: node('f', 'framework', null, 0, { title: 'Strategic framework' }),
      big: node('big', 'plan', 'f', 0, { title: 'Strategic Plan 2026–2030: From pipelines to systems', start: '2026-04-01', end: '2030-03-31',
        milestones: [{ id: 'a', date: '2026-06-18', title: 'Board' }, { id: 'b', date: '2028-03-20', title: 'Mid-plan' }] }),
      'obj-equity': node('obj-equity', 'objective', 'big', 0),
      'obj-scale': node('obj-scale', 'objective', 'big', 1),
    },
  };
  migrateStrategy(doc);
  const y2 = doc.nodes['plan-year-2'];
  assert.equal(doc.nodes.big.title, 'Year 1 plan: Foundations', 'the folded plan keeps its id and becomes Year 1');
  assert.equal(doc.nodes.big.end, '2027-03-31');
  assert.deepEqual(doc.nodes.big.milestones.map((m) => m.id), ['a']);
  assert.equal(y2.parentId, 'f');
  assert.equal(doc.nodes['obj-scale'].parentId, y2.id);
  assert.deepEqual(y2.milestones.map((m) => m.id), ['b']);
  const once = JSON.stringify(doc);
  assert.equal(JSON.stringify(migrateStrategy(doc)), once, 'runs once');
  // A shortened title still splits, and is tidied to Year 1.
  const short = { id: 's', nodes: { f: node('f', 'framework', null, 0), p: node('p', 'plan', 'f', 0, { title: 'Strategic Plan 2026–2030', start: '2026-04-01', end: '2030-03-31' }), e: node('e', 'objective', 'p', 0), g: node('g', 'objective', 'p', 1, { title: 'Grow what works, with partners' }) } };
  migrateStrategy(short);
  assert.equal(short.nodes.g.parentId, 'plan-year-2', 'found by its title when the id differs');
  assert.equal(short.nodes.p.title, 'Year 1 plan: Foundations');
  // A plan someone renamed to their own words keeps its name, but still splits.
  const mine = { id: 's', nodes: { f: node('f', 'framework', null, 0), p: node('p', 'plan', 'f', 0, { title: 'Our plan', end: '2030-03-31' }), 'obj-equity': node('obj-equity', 'objective', 'p', 0), 'obj-scale': node('obj-scale', 'objective', 'p', 1) } };
  migrateStrategy(mine);
  assert.equal(mine.nodes['obj-scale'].parentId, 'plan-year-2');
  assert.equal(mine.nodes.p.title, 'Our plan');
  // Already apart: nothing happens.
  const { seedStrategy } = await import('../src/platform/strategySeed.js');
  const apart = migrateStrategy(seedStrategy());
  assert.ok(!apart.nodes['plan-year-2'] && !apart.yearsSplit, 'the new example needs no split');
});
