import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTIONS, STARTERS, newPlanDoc, newArea, layoutOf, applyStarter, releasePatch, unreleased, publishedDoc, migratePlanDocs, isLivePlan, planSnapshot, allMeasures, textOf,
} from '../src/platform/plandocs.js';
import { STORY_FORMS, newStoryItem, storyOf, storiesIn, applyStory, wordCount } from '../src/platform/stories.js';
import { gatherAssets, blankAssets, migrateAssets } from '../src/platform/assetHub.js';
import { publicDocs } from '../server/public.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';
import { CLIENT_TOPUPS } from '../src/platform/clients/index.js';
import { seedOrg } from '../src/platform/org.js';

test('content areas: a new area slots in before the closing page; the layout repairs itself', () => {
  const pd = newPlanDoc('plan-1');
  assert.deepEqual(layoutOf(pd), SECTIONS.map((s) => s.id), 'no layout = the standard order');
  const { area, text } = newArea('story');
  assert.equal(area.kind, 'story');
  assert.deepEqual(area.stories, []);
  assert.equal(text[`area:${area.id}:title`], 'Stories from the community');
  pd.areas[area.id] = area;
  const order = layoutOf(pd);
  assert.equal(order.at(-2), area.id, 'an area missing from the layout goes before closing');
  // A saved layout that forgets a section, repeats one, or names something gone is put right.
  pd.layout = ['closing', 'cover', 'cover', 'gone', area.id];
  const fixed = layoutOf(pd);
  assert.equal(new Set(fixed).size, fixed.length);
  assert.ok(!fixed.includes('gone'));
  for (const s of SECTIONS) assert.ok(fixed.includes(s.id), `${s.id} is back`);
  assert.equal(fixed[0], 'closing', 'the order someone chose is kept');
});

test('doc starters: set sections, template, cover and pages, keep words and your own pages', () => {
  const pd = newPlanDoc('plan-1', { text: { letter: 'Our own letter' } });
  const mine = newArea('text').area;
  pd.areas[mine.id] = mine;
  for (const st of STARTERS) {
    const patch = applyStarter(pd, st.id);
    assert.equal(patch.template, st.template);
    assert.equal(patch.cover, st.cover);
    for (const s of SECTIONS) assert.equal(!!patch.hidden[s.id], !st.show.includes(s.id), `${st.id}: ${s.id}`);
    assert.equal(Object.values(patch.areas).filter((a) => a.starter === st.id).length, st.areas.length);
    assert.ok(patch.areas[mine.id], 'your own pages stay');
    assert.equal(patch.text.letter, 'Our own letter', 'your words stay');
  }
  // Switching starters swaps the last starter's pages rather than piling them up.
  Object.assign(pd, applyStarter(pd, 'annual'));
  Object.assign(pd, applyStarter(pd, 'community'));
  assert.equal(Object.values(pd.areas).filter((a) => a.starter).length, 3);
  assert.ok(Object.values(pd.areas).every((a) => !a.starter || a.starter === 'community'));
  assert.equal(pd.text.coverKicker, 'Community update');
  Object.assign(pd, applyStarter(pd, 'plan'));
  assert.equal(pd.text.coverKicker, undefined, 'back to the default kicker');
});

test('publishing freezes a release; visitors see it, not later edits', () => {
  const org = seedOrg();
  const strategy = { nodes: { root: { id: 'root', type: 'framework', mission: 'M' }, p: { id: 'p', type: 'plan', parentId: 'root', title: 'Plan' } } };
  const snap = planSnapshot(strategy, null, 'p', org);
  const pd = newPlanDoc('p', { siteId: 'site-1' });
  assert.ok(unreleased(pd, snap));
  Object.assign(pd, releasePatch(pd, snap, 'me'));
  assert.equal(pd.release.version, 1);
  assert.ok(isLivePlan(pd));
  assert.ok(!unreleased(pd, snap), 'nothing changed since');
  pd.template = 'magazine';
  pd.text = { ...pd.text, title: 'A draft title' };
  assert.ok(unreleased(pd, snap), 'a design change is unreleased');
  const seen = publishedDoc(pd);
  assert.equal(seen.template, 'modern', 'visitors still see the release');
  assert.equal(textOf(seen, seen.snapshot, 'title'), 'Plan');
  Object.assign(pd, releasePatch(pd, snap, 'me'));
  assert.equal(pd.release.version, 2);
  assert.deepEqual(pd.releases.map((r) => r.version), [2, 1]);
  assert.equal(publishedDoc(pd).template, 'magazine');
  // The public document carries only the release, never the draft design.
  pd.template = 'minimal';
  const out = publicDocs({ org: { ...org, sites: { 'site-1': { id: 'site-1', visibility: 'public' } } }, plandocs: { docs: { [pd.id]: pd } } }).plandocs.docs[pd.id];
  assert.ok(out, 'published on a public site');
  assert.equal(out.template, undefined);
  assert.equal(out.release.design.template, 'magazine');
  assert.equal(publishedDoc(out).template, 'magazine');
});

test('plan docs published before releases become release 1, unchanged for visitors', () => {
  const legacy = { id: 'pd1', planId: 'p', template: 'bold', status: 'published', publishedAt: '2026-10-01', snapshot: { plan: { title: 'Old' }, objectives: [] }, text: {}, images: {} };
  const doc = migratePlanDocs({ docs: { pd1: legacy } });
  const pd = doc.docs.pd1;
  assert.equal(pd.release.version, 1);
  assert.equal(pd.release.design.template, 'bold');
  assert.equal(publishedDoc(pd).snapshot.plan.title, 'Old');
});

test('story cards: a native asset kind, with forms, words and up to two pictures', () => {
  assert.deepEqual(STORY_FORMS.map((f) => f.id), ['chunk', 'social', 'paragraph', 'post']);
  const hub = migrateAssets(blankAssets());
  const it = newStoryItem({ title: 'A day on the bay', subtitle: 'Week one', body: 'One two three', images: [{ url: '/a.jpg' }, { url: '/b.jpg' }, { url: '/c.jpg' }], tags: ['youth'], form: 'social' }, 'me');
  hub.items[it.id] = it;
  const st = storyOf(it);
  assert.equal(st.images.length, 2);
  assert.equal(st.form, 'social');
  assert.equal(wordCount(st.body), 3);
  const card = gatherAssets(hub).find((c) => c.key === it.id);
  assert.equal(card.source, 'story');
  assert.equal(card.kindLabel, 'Story card');
  assert.equal(card.description, 'Week one');
  applyStory(it, { ...st, title: 'Renamed', form: 'nonsense' }, 'me');
  assert.equal(storiesIn(hub)[0].title, 'Renamed');
  assert.equal(storyOf(it).form, 'chunk', 'an unknown form falls back');
});

test('Kestrel Bay gets story cards and a community update to play with', () => {
  const { docs } = kestrelBundle();
  const stories = storiesIn(docs.assets);
  assert.ok(stories.length >= 4);
  const update = docs.plandocs.docs['pd-kestrel-community'];
  assert.equal(update.starter, 'community');
  const area = Object.values(update.areas).find((a) => a.kind === 'story');
  assert.equal(area.stories.length, 2);
  assert.ok(allMeasures(planSnapshot(docs.strategy, docs.data, update.planId, docs.org)).length > 0);
  // The top-up adds the same to an org that's already set up, once, without touching the rest.
  const t = CLIENT_TOPUPS.find((x) => x.id === 'a03-plandoc-stories');
  const before = { ...docs, assets: { ...blankAssets(), items: {} }, plandocs: { id: 'plandocs', docs: { other: { id: 'other', planId: update.planId } } } };
  const out = t.run((name) => structuredClone(before[name] ?? null));
  assert.ok(storiesIn(out.assets).length >= 4);
  assert.ok(out.plandocs.docs.other && out.plandocs.docs['pd-kestrel-community']);
});
