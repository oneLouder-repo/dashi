import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegistry, registryView, manifestProblems, cleanManifest, bumpVersion, compareVersions, blankManifest, pausedByRegistry, defaultManifest, SCAFFOLDS } from '../src/platform/pluginRegistry.js';
import { PLUGINS, BUILT_IN_PLUGINS, applyRegistry, featureOn, enabledPlugins } from '../src/plugins.js';
import { seedOrg } from '../src/platform/org.js';

test('every built-in plugin has a valid starting manifest', () => {
  const reg = mergeRegistry({});
  assert.deepEqual(Object.keys(reg.plugins), [...BUILT_IN_PLUGINS.map((p) => p.id), ...SCAFFOLDS.map((s) => s.id)]);
  for (const m of Object.values(reg.plugins)) assert.deepEqual(manifestProblems(m), [], m.id);
  // The scaffolded plugins arrive as drafts for the designer, and stay away once removed.
  for (const s of SCAFFOLDS) assert.equal(reg.plugins[s.id].status, 'draft');
  assert.ok(!mergeRegistry({ dismissed: ['ai-policy'] }).plugins['ai-policy']);
  assert.ok(reg.plugins.assets && reg.plugins.assets.builtIn, 'the Asset manager ships with Dashi');
  assert.deepEqual(manifestProblems(blankManifest({ id: 'x-y', name: 'X' })), []);
});

test('versions bump and compare', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});

test('manifests are checked and cleaned', () => {
  assert.ok(manifestProblems({ id: 'A', name: '', version: 'x' }).length >= 3);
  const m = cleanManifest({ id: 'p', name: 'P', version: '1.0.0', evil: true, look: { tone: 'javascript:1' }, features: [{ id: 'f', label: 'F', plans: { free: false } }] });
  assert.ok(!('evil' in m));
  assert.equal(m.look.tone, '#56657f');
  assert.equal(m.features[0].plans.free, false);
  assert.equal(m.features[0].plans.basic, true);
});

test('the registry renames, recolours, switches off and adds plugins on every page', () => {
  const stored = { plugins: {
    mapper: { ...defaultManifest('mapper'), name: 'Systems Mapper', look: { tone: '#000000', icon: 'sec-mapper' } },
    podcasts: { ...defaultManifest('podcasts'), status: 'disabled' },
    grants: { ...blankManifest({ id: 'grants', name: 'Grants' }), status: 'installed', features: [{ id: 'records', enabled: false }] },
  } };
  const reg = mergeRegistry(stored);
  assert.ok(pausedByRegistry(reg, 'free').podcasts);
  applyRegistry(registryView(reg));
  assert.equal(PLUGINS.find((p) => p.id === 'mapper').name, 'Systems Mapper');
  assert.ok(PLUGINS.find((p) => p.id === 'grants'), 'installed plugins join the list');
  const ids = enabledPlugins(seedOrg()).map((p) => p.id);
  assert.ok(!ids.includes('podcasts') && ids.includes('grants'));
  assert.equal(featureOn('grants', 'records'), false);
  assert.equal(featureOn('mapper', 'lenses'), true);
  assert.equal(featureOn('library', 'bibliographies', 'free'), false, 'a feature left out of a plan');
});
