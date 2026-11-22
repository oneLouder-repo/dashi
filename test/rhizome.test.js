// Rhizome stage 1: the fact layer, the measures and the switch-on set-up run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLUGINS, BUILT_IN_PLUGINS } from '../src/plugins.js';
import { orgHas, docMode } from '../src/platform/access.js';
import { mergeRegistry, registryView } from '../src/platform/pluginRegistry.js';
import { buildFacts, factCounts, relationsOf, searchEntities, assetKey } from '../src/rhizome/facts.js';
import { measureFacts, cutVertices, percentile, band, FLOWS } from '../src/rhizome/measures.js';
import { LENS_ZONES, zoneOf } from '../src/rhizome/zones.js';
import { blankRhizome, runStep, runSetup, nextStep, setupDone, resetSetup, profileFromOrg, cleanProfile, sinceBaseline, snapshot, stepsNow } from '../src/rhizome/setup.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const kestrel = (() => {
  const { docs } = kestrelBundle();
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  return { ...docs, mapContents };
})();

test('Rhizome is a plugin that ships switched off and owns only its own instance', () => {
  const p = PLUGINS.find((x) => x.id === 'rhizome');
  assert.ok(p && p.defaultOff && p.experimental);
  assert.deepEqual(p.owns, ['rhizome']);
  assert.ok(p.reads.includes('studio') && p.reads.includes('map/*'));
  assert.equal(orgHas(PLUGINS, { plugins: {} }, 'rhizome'), false, 'off until switched on');
  assert.equal(orgHas(PLUGINS, { plugins: { rhizome: true } }, 'rhizome'), true);
  // The registry keeps it switched off by default, so the server agrees.
  const view = registryView(mergeRegistry({}));
  assert.equal(view.rhizome.defaultOff, true);
  assert.equal(view.rhizome.version, '0.1.0');
  // It reads strategy but can never write it.
  assert.equal(docMode(BUILT_IN_PLUGINS, { plugins: { rhizome: true, strategy: false } }, 'strategy', {}), 'read');
});

test('the lens zones match the lens files', () => {
  for (const [id, lens] of Object.entries(LENS_ZONES)) {
    const file = JSON.parse(readFileSync(new URL(`../src/lenses/${id}.json`, import.meta.url)));
    assert.deepEqual(lens.zones.map((z) => [z.id, z.depth]), file.regions.map((r) => [r.id, r.depth]), id);
  }
  assert.equal(zoneOf('micro-meso-macro', 0.9).id, 'micro');
  assert.equal(zoneOf('micro-meso-macro', 0.1).id, 'macro');
  assert.equal(zoneOf('micro-meso-macro', null), null);
});

test('the fact layer reads maps, assets, strategy, the studio and people into one shape', () => {
  const f = buildFacts(kestrel);
  const c = factCounts(f);
  for (const s of ['org', 'mapper', 'assets', 'strategy', 'studio']) assert.ok(c.sources[s]?.entities > 0, s);
  assert.ok(c.types.actor > 30 && c.types.person === 36 && c.types.objective > 0 && c.types.soar > 0);
  // Every relation joins two known entities.
  for (const r of f.relations) assert.ok(f.entities[r.from] && f.entities[r.to], `${r.from} ${r.rel} ${r.to}`);
  // Actors carry their zone; the asset layer adds an ABCD type to them.
  const actor = Object.values(f.entities).find((e) => e.type === 'actor');
  assert.ok(actor.attrs.zone && 'abcd' in actor.attrs);
  // A workplan's people and its parent are ties.
  const wp = Object.values(f.entities).find((e) => e.type === 'workplan');
  const ties = relationsOf(f, wp.id);
  assert.ok(ties.some((t) => t.rel === 'part of' && t.out) && ties.some((t) => t.rel === 'works on' && !t.out));
  assert.ok(searchEntities(f, 'seniors').length >= 1);
});

test('plugins someone can’t use add no facts', () => {
  const f = buildFacts(kestrel, { plugins: new Set(['mapper']) });
  const c = factCounts(f);
  assert.ok(c.sources.mapper.entities > 0);
  assert.ok(!c.sources.strategy && !c.sources.studio && !c.sources.assets);
});

test('asset keys line up across Strategy & Work, the assembler and the Asset manager', () => {
  assert.equal(assetKey({ kind: 'actor', ref: 'a1', mapId: 'm1' }), 'actor:m1/a1');
  assert.equal(assetKey({ kind: 'staff', ref: 'p1' }), 'staff:p1');
  assert.equal(assetKey({ id: 'as_1', kind: 'literature', label: 'A book' }), 'asset:as_1');
});

test('measures: single points of failure, calibration by percentile, and one-way flows', () => {
  // A chain a-b-c: b is the only way between a and c.
  const adj = new Map([['a', new Set(['b'])], ['b', new Set(['a', 'c'])], ['c', new Set(['b'])]]);
  assert.deepEqual([...cutVertices(adj)], ['b']);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2);
  const c = { p25: 1, p50: 2, p75: 3, p90: 5 };
  assert.equal(band(1, c), 'low');
  assert.equal(band(5, c), 'top');
  const f = buildFacts(kestrel);
  const m = measureFacts(f, { today: '2026-11-22' });
  assert.ok(m.counts.actors > 30 && m.counts.links > 30);
  assert.ok(m.lists.bridges.length > 0, 'Kestrel has single points of failure');
  assert.ok(m.lists.hubs.every((id) => m.actors[id].band.degree === 'top'));
  assert.ok(m.lists.oneWay.every((x) => FLOWS.has(x.rel)), 'only flows can be one-way');
  assert.ok(m.calibration.degree.p90 >= m.calibration.degree.p50);
});

test('switching on runs a set-up: profile, index with a baseline, calibrate', () => {
  const doc = blankRhizome();
  assert.equal(nextStep(doc).id, 'switchOn');
  runStep(doc, 'switchOn', { docs: kestrel });
  runStep(doc, 'profile', { docs: kestrel });
  assert.equal(doc.profile.sector, 'foundation', 'Kestrel gets its pilot profile');
  assert.equal(nextStep(doc).id, 'index');
  runStep(doc, 'index', { docs: kestrel, now: '2026-11-22T10:00:00.000Z' });
  assert.ok(doc.baseline.entities > 100 && doc.snapshots.length === 1);
  runStep(doc, 'calibrate', { docs: kestrel });
  assert.ok(doc.calibration.degree);
  assert.equal(nextStep(doc).id, 'packs');
  runStep(doc, 'packs', { docs: kestrel });
  assert.ok(doc.analyses.includes('plan-hygiene') && doc.analyses.includes('network-health'));
  runStep(doc, 'firstRun', { docs: kestrel });
  assert.ok(setupDone(doc) && doc.runs[0].count > 0 && doc.runs[0].top.length > 0);
  assert.ok(stepsNow().every((s) => s.stage <= 2 && !s.optional), 'the harvest is optional and comes later');
  // Change since the baseline.
  const m = measureFacts(buildFacts(kestrel), { today: '2026-11-22' });
  assert.deepEqual(sinceBaseline(doc, { counts: { ...m.counts, links: m.counts.links + 2 } }), { links: 2 });
  snapshot(doc, buildFacts(kestrel), m, '2026-11-23T10:00:00.000Z');
  assert.equal(doc.snapshots.length, 2);
  resetSetup(doc);
  assert.equal(doc.runs.length, 0);
  assert.equal(nextStep(doc).id, 'switchOn');
  assert.equal(doc.profile.sector, 'foundation', 'the profile is kept');
});

test('Actua’s profile is tuned to AI strategy and curriculum, and profiles are cleaned', () => {
  const p = profileFromOrg({ id: 'org-actua-ai' });
  assert.ok(p.themes.includes('ai') && p.themes.includes('curriculum'));
  assert.equal(p.weights.speculative, 0.5);
  const clean = cleanProfile({ sector: 'nope', focus: 'a, b', themes: ['ai', 'made-up'], weights: { speculative: 7 } });
  assert.deepEqual(clean.focus, ['a', 'b']);
  assert.deepEqual(clean.themes, ['ai']);
  assert.equal(clean.sector, 'other');
  assert.equal(clean.weights.speculative, 1);
});

test('the Kestrel pilot is seeded switched on and set up', () => {
  const { docs } = kestrelBundle();
  assert.equal(docs.org.plugins.rhizome, true);
  assert.ok(setupDone(docs.rhizome));
  assert.ok(docs.rhizome.calibration.degree && docs.rhizome.baseline.counts.actors > 30);
  assert.ok(runSetup(blankRhizome(), { docs: kestrel }).setup.calibrate);
});

test('the rules engine: rules as data, findings with a Why?, dismissals that come back when facts change', async () => {
  const { RULES, ANALYSES, runRule, runAnalysis, check, weigh, describeCheck, analysesFor, ruleById } = await import('../src/rhizome/rules.js');
  const { tipById, fillTip } = await import('../src/rhizome/tips.js');
  assert.ok(RULES.length >= 20, 'about twenty starter rules');
  for (const r of RULES) {
    assert.ok(tipById[r.say], `${r.id} says a tip that exists`);
    assert.ok(r.from.list || r.from.type);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(r)), 'rules are plain data');
  }
  for (const a of ANALYSES) for (const id of a.rules) assert.ok(ruleById[id], `${a.id}: ${id}`);
  const f = buildFacts(kestrel);
  const m = measureFacts(f, { today: '2026-11-22' });
  const ctx = { facts: f, measures: m, calibration: m.calibration, profile: profileFromOrg({ id: 'org-kestrel' }) };
  const sp = runRule(ruleById['single-point'], ctx);
  assert.equal(sp.length, m.lists.bridges.length);
  assert.ok(sp[0].text.includes(f.entities[sp[0].items[0]].name), 'the tip names what matched');
  assert.ok(sp.every((x, i) => i === 0 || sp[i - 1].score >= x.score), 'best first');
  assert.equal(sp[0].why.rule, 'single-point');
  assert.ok(sp[0].why.weigh.themed, 'network weaving is in Kestrel’s profile');
  // A grouped rule gives one finding for everything that matched.
  const iso = runRule(ruleById.isolates, ctx);
  assert.equal(iso.length, 1);
  assert.equal(iso[0].items.length, m.lists.isolates.length);
  // Conditions read the calibration.
  const c = check({ field: 'degree', op: 'lte', pct: 'p25' }, { degree: 1 }, { degree: { p25: 1 } });
  assert.ok(c.ok && c.want === 1);
  assert.match(describeCheck(c), /degree is at most 1 \(your 25th percentile\)/);
  // Speculative links count for what the profile says.
  assert.equal(weigh({ weigh: { base: 0.8, plus: [] } }, { basis: 'speculative' }, { measures: m, profile: { weights: { speculative: 0.5 } } }).score, 0.4);
  // Plugins someone can't use run no rules.
  assert.equal(runRule(ruleById['hollow-objective'], { ...ctx, plugins: new Set(['mapper']) }).length, 0);
  // Dismissed findings stay away until what they rest on changes.
  const all = runAnalysis('all', ctx);
  const first = all[0];
  assert.ok(!runAnalysis('all', ctx, { dismissed: { [first.id]: { sig: first.sig } } }).some((x) => x.id === first.id));
  assert.ok(runAnalysis('all', ctx, { dismissed: { [first.id]: { sig: 'something else' } } }).some((x) => x.id === first.id));
  assert.ok(analysesFor({ themes: ['ai'] }).includes('plan-hygiene'));
  assert.equal(fillTip('{name} has {value} links ({count})', { name: 'A', value: 2 }), 'A has 2 links');
});

test('Rhizome’s helper docs are one source: Help carries them, and the About tab shows the same pages', async () => {
  const { HELP_SEED, HELP_ADDED } = await import('../src/help/library.js');
  const { RHIZOME_HELP } = await import('../src/rhizome/help.js');
  const section = HELP_SEED.sections.find((s) => s.id === 'rhizome');
  assert.equal(section, RHIZOME_HELP);
  assert.ok(section.pages.length >= 5 && HELP_ADDED.rhizome === 6);
  const { ribbonActions } = await import('../src/ui/crumbs.js');
  assert.equal(ribbonActions('rhizome').length, 3);
  const main = readFileSync(new URL('../src/rhizome/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("help.html#${RHIZOME_HELP_ID}/"), 'About links each page to Help');
});
