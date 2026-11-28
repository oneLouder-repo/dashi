import test from 'node:test';
import assert from 'node:assert/strict';
import { blankObject, migrateMobilize, readiness, nextStages, moveTo, addReview, addUptake, dueReviews, signalOf, planProposals, assetCards, tally } from '../src/mobilize/model.js';
import { actuaMobilize, addMobilizeGoals } from '../src/mobilize/actua.js';
import { actuaDocs } from '../src/platform/clients/actua.js';
import { CLIENT_TOPUPS } from '../src/platform/clients/index.js';
import { gatherAssets } from '../src/platform/assetHub.js';
import { PLUGINS } from '../src/plugins.js';
import { HELP_SEED } from '../src/help/library.js';

const ready = () => blankObject({
  title: 'A finding', message: 'Youth are ahead of their teachers on AI confidence.',
  audiences: [{ id: 'a1', group: 'educators', who: 'Teachers', use: 'Join PD' }],
  messengers: [{ id: 'm1', name: 'A teacher' }],
  outputs: [{ id: 'o1', kind: 'brief', title: 'Brief', status: 'idea' }],
  effect: { hoped: 'More confident teachers', signs: 'The survey measure moves' },
  evidence: { sources: ['lib-x'] }, consent: { share: 'open' }, ownerId: 's1', nextReview: '2027-01-01',
});

test('migrate fills a knowledge object with safe defaults', () => {
  const doc = migrateMobilize({ objects: { k: { title: 'x', stage: 'nonsense', consent: { share: 'weird' } } } });
  const o = doc.objects.k;
  assert.equal(o.id, 'k');
  assert.equal(o.stage, 'draft');
  assert.equal(o.consent.share, 'internal');
  assert.deepEqual(o.links.plan, []);
  assert.equal(doc.settings.reviewEvery, 90);
});

test('the readiness check follows the five questions, and a draft only moves when it passes', () => {
  const draft = blankObject({ title: 'Half done' });
  assert.equal(readiness(draft).ready, false);
  assert.deepEqual(nextStages(draft), []);
  assert.throws(() => moveTo(draft, 'ready'));
  const o = ready();
  assert.equal(readiness(o).ready, true);
  assert.deepEqual(nextStages(o), ['ready']);
  assert.equal(moveTo(moveTo(o, 'ready'), 'out').stage, 'out');
});

test('held and OCAP knowledge needs the holders’ sign-off before it is ready', () => {
  const o = { ...ready(), consent: { share: 'held', holders: 'Partner communities', ocap: true, signedOff: null } };
  const r = readiness(o);
  assert.equal(r.ready, false);
  assert.equal(r.checks.find((c) => c.id === 'consent').ok, false);
  assert.equal(readiness({ ...o, consent: { ...o.consent, signedOff: '2026-12-01' } }).ready, true);
  // Held knowledge never shows in the asset library.
  const doc = migrateMobilize({ objects: { a: o, b: ready() } });
  assert.deepEqual(assetCards(doc).map((c) => c.ref.id), [doc.objects.b.id]);
});

test('reviews set the next date, and a double-loop review proposes a plan change', () => {
  const o = moveTo(moveTo(ready(), 'ready'), 'out');
  const r1 = addReview(o, { heard: 'Teachers asked for an activity', change: 'Add one', at: '2026-11-01T12:00:00Z', every: 30 });
  assert.equal(r1.stage, 'reviewed');
  assert.equal(r1.nextReview, '2026-12-01');
  assert.equal(r1.reviews[0].planChange, '');
  const r2 = addReview(r1, { heard: 'Parents missing', change: 'Rethink', loop: 'double', planChange: 'Add a family measure', at: '2026-11-02T12:00:00Z' });
  const doc = migrateMobilize({ objects: { [r2.id]: r2 } });
  assert.equal(planProposals(doc).length, 1);
  assert.equal(planProposals(doc)[0].review.planChange, 'Add a family measure');
});

test('signals: heard back, quiet, needs a look', () => {
  const out = { ...moveTo(moveTo(ready(), 'ready'), 'out'), nextReview: '2027-01-01' };
  assert.equal(signalOf(ready(), '2026-11-28'), null);
  assert.equal(signalOf(out, '2026-11-28'), 'quiet');
  assert.equal(signalOf(addUptake(out, { kind: 'story', text: 'Used it', at: '2026-11-20T12:00:00Z' }), '2026-11-28'), 'heard');
  assert.equal(signalOf({ ...out, nextReview: '2026-11-01' }, '2026-11-28'), 'look');
  const doc = migrateMobilize({ objects: { a: { ...out, id: 'a', nextReview: '2026-11-01' } } });
  assert.deepEqual(dueReviews(doc, '2026-11-28').map((o) => o.id), ['a']);
});

test('the Actua starting set: objects linked to the plan, figures from the library, held knowledge kept a draft', () => {
  const docs = actuaDocs();
  const { strategy } = addMobilizeGoals(docs.strategy);
  assert.ok(strategy.nodes['goal-kmb'] && strategy.nodes['wp-kmb'] && strategy.nodes['goal-learning-design']);
  // Running it again adds nothing.
  const before = Object.keys(strategy.nodes).length;
  addMobilizeGoals(strategy);
  assert.equal(Object.keys(strategy.nodes).length, before);
  const m = actuaMobilize(strategy);
  const all = Object.values(m.objects);
  assert.ok(all.length >= 8);
  for (const o of all) {
    for (const id of o.links.plan) assert.ok(strategy.nodes[id], `${o.id} links to a plan node that exists`);
    for (const id of o.evidence.sources) assert.ok(docs.library.items[id], `${o.id} cites ${id}, which is in Actua's library`);
  }
  const land = m.objects['ko-land-based'];
  assert.equal(land.stage, 'draft');
  assert.equal(readiness(land).ready, false);
  // Examples say so.
  assert.ok(all.flatMap((o) => o.uptake).filter((u) => u.kind === 'story').every((u) => u.text.startsWith('Example:')));
  assert.equal(tally(m, '2026-11-28').objects, all.length);
});

test('the top-up switches Mobilize on for Actua and seeds it once', () => {
  const docs = actuaDocs();
  const t = CLIENT_TOPUPS.find((x) => x.id === 'a05-mobilize');
  const read = (name) => structuredClone(docs[name] ?? null);
  const out = t.run(read);
  assert.equal(out.org.plugins.mobilize, true);
  assert.ok(Object.keys(out.mobilize.objects).length >= 8);
  assert.ok(out.strategy.nodes['wp-kmb']);
  // A Mobilize that already has objects is left alone.
  const again = t.run((name) => (name === 'mobilize' ? out.mobilize : read(name)));
  assert.equal(again.mobilize, undefined);
});

test('knowledge objects show in the asset library as live cards, and Mobilize is a plugin with help', () => {
  const m = actuaMobilize(addMobilizeGoals(actuaDocs().strategy).strategy);
  const cards = gatherAssets({ items: {}, collections: {} }, { mobilize: m }).filter((c) => c.source === 'knowledge');
  assert.equal(cards.length, Object.values(m.objects).filter((o) => o.consent.share !== 'held').length);
  assert.ok(gatherAssets({ items: {}, collections: {} }, { mobilize: m }, { plugins: new Set(['assets']) }).every((c) => c.source !== 'knowledge'));
  const p = PLUGINS.find((x) => x.id === 'mobilize');
  assert.deepEqual(p.owns, ['mobilize']);
  assert.ok(PLUGINS.find((x) => x.id === 'assets').reads.includes('mobilize'));
  assert.ok(HELP_SEED.sections.some((s) => s.id === 'mobilize'));
});
