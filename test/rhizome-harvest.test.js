// Rhizome PR 20: the tip harvester and the hooks for Place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts, cleanGeo, addFactAdapter, FACT_ADAPTERS, placedEntities } from '../src/rhizome/facts.js';
import { measureFacts } from '../src/rhizome/measures.js';
import { runAnalysis, ruleById, RULES } from '../src/rhizome/rules.js';
import { tipById } from '../src/rhizome/tips.js';
import { themeById, blankRhizome, runStep } from '../src/rhizome/setup.js';
import { HARVEST_SOURCES } from '../src/rhizome/harvestSources.js';
import { htmlToText, sentences, scoreSentence, similarity, textId, harvest, mergeHarvest, knownTexts, approve, reject, needsRewrite, blankTips, readingFor } from '../src/rhizome/harvest.js';
import { robotsRules, robotsAllow, politeFetcher } from '../server/politeFetch.js';
import { TIPS } from '../src/rhizome/tips.js';

const mapDocs = (geo) => ({
  maps: { maps: { m1: { title: 'Bay' } } },
  mapContents: { m1: { lensId: 'micro-meso-macro', actors: { a: { id: 'a', label: 'Harbour co-op', geo }, b: { id: 'b', label: 'Library' } }, connectors: {} } },
});

test('geo: only real points survive, and the precision is one of three', () => {
  assert.deepEqual(cleanGeo({ lat: 44.1234567, lng: -64.5, precision: 'exact', placeId: 'p1' }), { lat: 44.123457, lng: -64.5, precision: 'exact', placeId: 'p1' });
  assert.equal(cleanGeo({ lat: 95, lng: 0 }), null);
  assert.equal(cleanGeo({ lat: 'x', lng: 1 }), null);
  assert.equal(cleanGeo(null), null);
  assert.equal(cleanGeo({ lat: 1, lng: 2, precision: 'pinpoint' }).precision, 'approx');
});

test('an actor with geo carries it into the facts; one without has no geo at all', () => {
  const f = buildFacts(mapDocs({ lat: 44.4, lng: -64.3, precision: 'approx' }));
  assert.equal(f.entities['actor:m1/a'].attrs.geo.lat, 44.4);
  assert.ok(!('geo' in f.entities['actor:m1/b'].attrs));
  assert.deepEqual(placedEntities(f).map((e) => e.id), ['actor:m1/a']);
});

test('a plugin adapter adds facts only when its plugin is on, and bad geo is dropped', () => {
  const was = FACT_ADAPTERS.get('place');
  addFactAdapter('place', (doc, ent, rel) => {
    for (const p of Object.values(doc.places)) ent(`place:${p.id}`, 'place', p.name, 'place', { geo: p.geo });
    rel('actor:m1/b', 'located at', 'place:harbour', 'place', 'locates');
  });
  try {
    const docs = { ...mapDocs(null), place: { places: { harbour: { id: 'harbour', name: 'The harbour', geo: { lat: 44.5, lng: -64.2 } }, bad: { id: 'bad', name: 'Nowhere', geo: { lat: 300, lng: 0 } } } } };
    const on = buildFacts(docs, { plugins: new Set(['mapper', 'place']) });
    assert.equal(on.entities['place:harbour'].type, 'place');
    assert.ok(!('geo' in on.entities['place:bad'].attrs), 'a bad location is dropped');
    assert.ok(on.relations.some((r) => r.kind === 'locates' && r.to === 'place:harbour'));
    const off = buildFacts(docs, { plugins: new Set(['mapper']) });
    assert.equal(off.entities['place:harbour'], undefined, 'nothing from a plugin that is off');
  } finally { if (was) FACT_ADAPTERS.set('place', was); else FACT_ADAPTERS.delete('place'); }
});

test('findings say which of their things have a place, and the unplaced rule needs Place', () => {
  const f = buildFacts(mapDocs({ lat: 44.4, lng: -64.3 }));
  const m = measureFacts(f);
  assert.deepEqual(m.lists.unplaced, ['actor:m1/b']);
  assert.equal(m.counts.placed, 1);
  const ctx = (plugins) => ({ facts: f, measures: m, calibration: m.calibration, profile: null, plugins });
  assert.equal(runAnalysis('place-based', ctx(new Set(['mapper', 'assets']))).filter((x) => x.ruleId === 'place-unplaced').length, 0);
  const found = runAnalysis('place-based', ctx(new Set(['mapper', 'assets', 'place']))).find((x) => x.ruleId === 'place-unplaced');
  assert.ok(found && found.show === 'geo');
  const isolates = runAnalysis('network-health', ctx(null)).find((x) => x.ruleId === 'isolates');
  assert.deepEqual(isolates.placed, ['actor:m1/a']);
  assert.ok(themeById.place && tipById[ruleById['place-unplaced'].say]);
  for (const r of RULES) assert.ok(['map', 'list', 'geo'].includes(r.show), r.id);
});

test('the source registry: every source is filed under a theme, with points of its own', () => {
  const ids = new Set();
  for (const s of HARVEST_SOURCES) {
    assert.ok(!ids.has(s.id), `unique id ${s.id}`); ids.add(s.id);
    assert.ok(themeById[s.theme], `${s.id} theme`);
    assert.ok(s.points?.length >= 2, `${s.id} points`);
    if (s.url) assert.match(s.url, /^https:\/\//);
    if (s.fetch) assert.ok(s.url, `${s.id} can only be fetched with a url`);
  }
});

test('extract: page HTML becomes prose, without scripts, menus or footers', () => {
  const html = '<html><script>var x = "no"</script><nav>Home About</nav><p>Start with what people already bring to the table, and the plan will hold.</p><footer>Copyright</footer><p>Ask residents about their gifts &amp; skills before you plan anything new for them.</p></html>';
  const text = htmlToText(html);
  assert.ok(!/var x|Home About|Copyright/.test(text));
  assert.match(text, /gifts & skills/);
  assert.equal(sentences(text).length, 2);
  assert.equal(sentences('Short line.\nMenu Item').length, 0);
});

test('score and dedupe: useful sentences score higher, near-copies are caught', () => {
  assert.ok(scoreSentence('Ask residents which local associations already gather people, and start your asset map there.', 'abcd') > scoreSentence('Click here to subscribe to our newsletter for cookie updates today.', 'abcd'));
  assert.ok(similarity('Map who already knows whom before planning new ties.', 'Map who already knows whom before you plan new ties.') > 0.5);
  assert.ok(similarity('Map who already knows whom.', 'Budgets are the weakest lever in a system.') < 0.2);
  assert.equal(textId('Hello, world!'), textId('hello world'));
});

test('harvest offline: candidates from the registry, nothing offered twice, rejected stays away', () => {
  const doc = blankTips();
  const first = harvest({ known: knownTexts(doc, TIPS), now: '2026-11-22T00:00:00Z' });
  assert.ok(first.candidates.length > 40 && first.candidates.every((c) => c.kind === 'point'));
  const run = mergeHarvest(doc, first, { now: '2026-11-22T00:00:00Z' });
  assert.equal(run.added, first.candidates.length);
  const again = mergeHarvest(doc, harvest({ known: knownTexts(doc, TIPS) }));
  assert.equal(again.added, 0, 'a second run adds nothing new');
  const victim = doc.queue[0];
  assert.ok(reject(doc, victim.id));
  const third = harvest({ known: knownTexts(doc, TIPS), rejectedIds: doc.rejected.map((r) => r.id) });
  assert.ok(!third.candidates.some((c) => c.id === victim.id), 'a rejected candidate is not offered again');
  assert.equal(doc.runs.length, 2);
});

test('harvest online text: excerpts must be rewritten before approval', () => {
  const page = '<p>Bring residents, local business and government to the same table around one place, and agree how decisions are shared.</p>';
  const res = harvest({ texts: { 'tamarack-place': htmlToText(page) }, only: 'tamarack-place', known: [] });
  const ex = res.candidates.find((c) => c.kind === 'excerpt');
  assert.ok(ex, 'the page gave an excerpt');
  const doc = blankTips();
  mergeHarvest(doc, res);
  assert.ok(needsRewrite(ex, ex.text));
  assert.throws(() => approve(doc, ex.id), /own words/);
  const tip = approve(doc, ex.id, { text: 'Gather everyone who shapes one place, and settle how you will decide together before you start.', visibility: 'private' });
  assert.equal(tip.visibility, 'private');
  assert.equal(doc.approved.length, 1);
  assert.ok(!doc.queue.some((c) => c.id === ex.id));
});

test('robots.txt: our agent keeps out of what a site disallows', () => {
  const rules = robotsRules('User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: BadBot\nDisallow: /');
  assert.equal(robotsAllow(rules, '/articles/x'), true);
  assert.equal(robotsAllow(rules, '/private/x'), false);
  assert.equal(robotsAllow(rules, '/private/open/y'), true);
  assert.equal(robotsAllow(robotsRules('User-agent: DashiTipHarvester\nDisallow: /\n\nUser-agent: *\nDisallow:'), '/a'), false);
});

test('the polite fetcher reads robots.txt once per site and waits between requests', async () => {
  const calls = [];
  const waits = [];
  let clock = 0;
  const fetchImpl = async (url) => {
    calls.push(url);
    const body = url.endsWith('/robots.txt') ? 'User-agent: *\nDisallow: /no' : '<p>A page.</p>';
    return new Response(body, { status: 200, headers: { 'content-type': url.endsWith('.txt') ? 'text/plain' : 'text/html' } });
  };
  const get = politeFetcher({ fetchImpl, gapMs: 1000, sleep: async (ms) => { waits.push(ms); clock += ms; }, now: () => clock });
  assert.equal((await get('https://a.example/one')).ok, true);
  assert.equal((await get('https://a.example/no/thanks')).reason, 'robots.txt asks us not to');
  assert.equal((await get('https://a.example/two')).ok, true);
  assert.equal(calls.filter((u) => u.endsWith('robots.txt')).length, 1);
  assert.ok(waits.length >= 2 && waits.every((w) => w <= 1000));
  assert.equal((await get('ftp://a.example/x')).ok, false);
});

test('the context harvest step keeps a reading list for the profile\'s themes', () => {
  const doc = blankRhizome();
  doc.profile = { themes: ['ai', 'equity'] };
  runStep(doc, 'harvest', { now: '2026-11-22T00:00:00Z' });
  assert.ok(doc.setup.harvest);
  const themes = doc.reading.slice(0, 3).map((id) => HARVEST_SOURCES.find((s) => s.id === id).theme);
  assert.ok(themes.every((t) => ['ai', 'equity'].includes(t)));
  assert.deepEqual(readingFor({ themes: ['ai'] }).length, 8);
});
