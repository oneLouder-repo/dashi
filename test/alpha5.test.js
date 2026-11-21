import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegistry, registryView, cleanManifest } from '../src/platform/pluginRegistry.js';
import { PLUGINS, applyRegistry, enabledPlugins, chosenByOrg } from '../src/plugins.js';
import { seedOrg, seedRiverbend, migrateOrg } from '../src/platform/org.js';
import { readability, syllables, applySwaps } from '../src/platform/plainWords.js';
import { LESSONS, suggestFor, criticalOn, lessonsOf, migrateCritical, lessonText, onSiteFor } from '../src/platform/criticalMedia.js';
import { roadModel, currentPlan } from '../src/strategy/Road.js';
import { seedStrategy } from '../src/platform/strategySeed.js';
import { migrateStrategy } from '../src/platform/strategy.js';
import { publicDocs } from '../server/public.js';

test('released plugins: only Plain Words is on by default; Critical Media is on for the STEM example', () => {
  applyRegistry(registryView(mergeRegistry({})));
  const on = (org) => enabledPlugins(org).map((p) => p.id);
  const stem = seedOrg();
  const river = seedRiverbend();
  for (const id of ['ai-policy', 'ai-register', 'prompt-commons']) {
    assert.ok(!on(stem).includes(id), `${id} is off until switched on`);
    assert.ok(on({ ...river, plugins: { ...river.plugins, [id]: true } }).includes(id), `${id} can be switched on`);
  }
  assert.ok(on(stem).includes('plain-words') && on(river).includes('plain-words'), 'Plain Words is on by default');
  assert.ok(!on({ ...river, plugins: { 'plain-words': false } }).includes('plain-words'), 'and can be switched off');
  assert.ok(on(stem).includes('critical-media'), 'Critical Media is on for the STEM org');
  assert.ok(!on(river).includes('critical-media'), 'and off for others');
  assert.equal(chosenByOrg(migrateOrg({ id: 'org-example', plugins: { 'critical-media': false } }), PLUGINS.find((p) => p.id === 'critical-media')), false, 'the STEM org can still switch it off');
  // The designer keeps the switch when a manifest is cleaned and saved.
  assert.equal(cleanManifest({ ...mergeRegistry({}).plugins['ai-policy'] }).defaultOff, true);
  // A stored copy of an old draft gives way to the release.
  const old = { ...mergeRegistry({}).plugins['ai-policy'], version: '0.1.0', status: 'draft' };
  assert.equal(mergeRegistry({ plugins: { 'ai-policy': old } }).plugins['ai-policy'].status, 'installed');
});

test('Plain Words grades hard and easy text, and suggests plainer words', () => {
  assert.equal(syllables('cat'), 1);
  assert.ok(syllables('information') >= 4);
  const hard = readability('In order to facilitate the commencement of the program, individuals are required to obtain additional documentation prior to the first session, which will subsequently be utilized by the coordinators to ascertain eligibility.');
  const easy = readability('Come to the first session. Bring your forms. We will check them with you.');
  assert.ok(hard.grade > 12 && hard.verdict.level === 'hard', `hard text: grade ${hard.grade}`);
  assert.ok(easy.grade <= 6 && easy.verdict.level === 'easy', `easy text: grade ${easy.grade}`);
  assert.equal(hard.longSentences.length, 1);
  assert.ok(hard.swaps.some((x) => x.from === 'in order to' && x.to === 'to'));
  assert.match(applySwaps('In order to commence, utilise the form.'), /^To start, use the form\.$/);
});

test('Critical Media suggests a fitting lesson, keeps its credit, and shares only settings and own lessons', () => {
  assert.equal(LESSONS.length, 10);
  for (const l of LESSONS) assert.ok(l.title && l.activity && l.takeAway && l.builds.startsWith(`Session ${l.n}:`), l.id);
  assert.equal(suggestFor('Programs reach 46% girls now').id, 'cm-tricks');
  assert.equal(suggestFor('New research from our scientists').id, 'cm-facts');
  assert.equal(suggestFor('A quiet week').id, 'cm-pause');
  const doc = migrateCritical({ settings: { hidden: { 'cm-media': true } }, collections: { lessons: { x: { id: 'x', title: 'Our own', takeAway: 'Ours.' } } } });
  const list = lessonsOf(doc);
  assert.ok(!list.some((l) => l.id === 'cm-media') && list.at(-1).own);
  assert.match(lessonText(LESSONS[0]), /Builds on NALA’s Facts Matter, Session 1/);
  assert.ok(onSiteFor({ siteIds: [] }, 'any') && !onSiteFor({ siteIds: ['a'] }, 'b'));
  // Public site: only for orgs that have it on, and never the sessions log.
  const org = seedOrg();
  assert.ok(criticalOn(org) && !criticalOn(seedRiverbend()));
  const docs = { org, 'plugin/critical-media': { ...doc, collections: { ...doc.collections, sessions: { s: { id: 's', notes: 'private' } } } } };
  const pub = publicDocs(docs)['plugin/critical-media'];
  assert.deepEqual(pub.collections.sessions, {});
  assert.ok(pub.collections.lessons.x);
  assert.equal(publicDocs({ ...docs, org: seedRiverbend() })['plugin/critical-media'], undefined);
});

test('the road puts lights passed behind today, red ahead, and a sign at each goal', () => {
  const doc = migrateStrategy(seedStrategy());
  const now = '2026-11-15';
  const plan = currentPlan(doc, now);
  assert.match(plan.title, /Year 1/, 'the plan holding today');
  // The whole road: the framework, across both plans.
  const top = Object.values(doc.nodes).find((n) => n.type === 'framework');
  const m = roadModel(doc, top.id, now);
  const passed = m.posts.filter((p) => p.date < now);
  const ahead = m.posts.filter((p) => p.date >= now);
  assert.ok(passed.length >= 3, 'some workplans are already behind us');
  assert.ok(passed.some((p) => p.light === 'green') && passed.some((p) => p.light === 'red'), 'passed lights are green, amber or red');
  assert.ok(ahead.filter((p) => p.node.start > now).every((p) => p.light === 'red'), 'work not started yet is red');
  assert.equal(m.signs.length, Object.values(doc.nodes).filter((n) => n.type === 'goal').length);
  assert.ok(m.milestones.length >= 5, 'plan, goal and task milestones');
  assert.ok(m.from < m.to);
});
