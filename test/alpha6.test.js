import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleDocs } from '../src/platform/seeds.js';
import { publicDocs } from '../server/public.js';
import { cleanResponse, summarise, formsAt, seedForms, blankForm } from '../src/platform/feedback.js';
import { draftReport, periodLabel, measureMovements, reportableNodes } from '../src/platform/funderReports.js';
import { seedLibrary, addBoardDocs } from '../src/platform/boardSeed.js';
import { blankLibrary } from '../src/platform/library.js';
import { mergeRegistry } from '../src/platform/pluginRegistry.js';
import { migrateOrg } from '../src/platform/org.js';
import { measureIndex } from '../src/platform/strategy.js';
import { parseMarkdown } from '../src/platform/pages.js';

const docs = () => exampleDocs('org-example');

test('a feedback answer keeps only real answers to the form’s own questions', () => {
  const form = { id: 'f1', ...blankForm('site-impact') };
  const [rating, choice, text] = form.questions;
  const r = cleanResponse(form, { [rating.id]: '9', [choice.id]: choice.options[1], [text.id]: 'x'.repeat(2000), stray: 'nope' }, { siteId: 'site-impact', at: '2026-11-01T10:00:00Z' });
  assert.equal(r.formId, 'f1');
  assert.equal(r.answers[rating.id], undefined, 'a rating of 9 is not 1 to 5');
  assert.equal(r.answers[choice.id], choice.options[1]);
  assert.equal(r.answers[text.id].length, 1000);
  assert.equal(r.answers.stray, undefined);
  assert.equal(cleanResponse(form, { [choice.id]: 'Not an option' }), null, 'nothing valid, nothing stored');
});

test('feedback answers add up question by question', () => {
  const form = { id: 'f1', ...blankForm('site-impact') };
  const [rating, choice, text] = form.questions;
  const responses = {};
  [[5, choice.options[0], 'More regions'], [3, choice.options[0], ''], [4, choice.options[2], 'Clear']].forEach(([a, b, c], i) => {
    const r = cleanResponse(form, { [rating.id]: a, [choice.id]: b, [text.id]: c }, { at: `2026-11-0${i + 1}T10:00:00Z` });
    responses[r.id] = r;
  });
  responses.other = { id: 'other', formId: 'f2', at: '2026-11-09', answers: {} };
  const sum = summarise(form, responses);
  assert.equal(sum.total, 3);
  assert.equal(sum.latest, '2026-11-03T10:00:00Z');
  assert.equal(sum.questions[0].avg, 4);
  assert.deepEqual(sum.questions[0].counts, [0, 0, 1, 1, 1]);
  assert.equal(sum.questions[1].counts.find((c) => c.option === choice.options[0]).n, 2);
  assert.deepEqual(sum.questions[2].texts.sort(), ['Clear', 'More regions']);
});

test('the STEM example has a public numbers form and a members-only board form', () => {
  const d = docs();
  const forms = d.dashboards.forms;
  assert.equal(forms['form-numbers'].siteId, 'site-impact');
  assert.equal(forms['form-board-pack'].siteId, 'site-board');
  assert.deepEqual(formsAt(forms, 'site-impact', 'dashboards').map((f) => f.id), ['form-numbers']);
  assert.deepEqual(formsAt(forms, 'site-board', 'home'), [], 'visitors never see the board form');
  assert.deepEqual(formsAt(forms, 'site-board', 'home', { members: true }).map((f) => f.id), ['form-board-pack']);
  assert.deepEqual(seedForms({ sites: {} }), {});
});

test('visitors get public forms, but never answers, the library or the board site', () => {
  const d = docs();
  d.feedback = { id: 'feedback', responses: { a: { id: 'a', formId: 'form-numbers', answers: {} } } };
  const pub = publicDocs(d);
  assert.equal(pub.feedback, undefined);
  assert.equal(pub.library, undefined);
  assert.deepEqual(Object.keys(pub.dashboards.forms), ['form-numbers']);
  assert.deepEqual(pub.dashboards.reports, {});
  assert.equal(pub.dashboards.dashboards['dash-board'], undefined, 'the board scorecard stays private');
  assert.deepEqual(Object.keys(pub.org.sites['site-board']).sort(), ['id', 'look', 'name', 'visibility']);
});

test('the board library has governance guides, finance summaries and a minutes archive', () => {
  const lib = seedLibrary();
  const items = Object.values(lib.items);
  const tagged = (t) => items.filter((it) => it.tags.includes('board') && it.tags.includes(t));
  assert.ok(tagged('governance').length >= 4);
  assert.ok(tagged('finance').length >= 2);
  assert.ok(tagged('minutes').length >= 6);
  for (const it of tagged('minutes')) assert.equal(it.folderId, 'folder-minutes');
  assert.ok(items.every((it) => it.kind === 'doc' && it.body.length > 50));
});

test('older STEM libraries gain the board documents once, and other orgs never do', () => {
  const lib = blankLibrary();
  lib.items.mine = { id: 'mine', kind: 'doc', title: 'Mine', tags: [] };
  assert.equal(addBoardDocs(lib, 'org-example'), true);
  assert.ok(lib.items['lib-bylaws'] && lib.items.mine);
  delete lib.items['lib-bylaws'];
  assert.equal(addBoardDocs(lib, 'org-example'), false, 'a document staff deleted stays deleted');
  assert.equal(lib.items['lib-bylaws'], undefined);
  const other = blankLibrary();
  assert.equal(addBoardDocs(other, 'org-riverbend'), false);
  assert.equal(Object.keys(other.items).length, 0);
});

test('a funder report drafts every section from the plan and the data', () => {
  const d = docs();
  const measureIds = Object.keys(measureIndex(d.strategy)).slice(0, 3);
  const nodeIds = reportableNodes(d.strategy).filter((n) => n.type === 'objective').map((n) => n.id).slice(0, 1);
  const storyIds = Object.keys(d.dashboards.stories ?? {}).slice(0, 1);
  const md = draftReport(d, { funder: 'The Northern Foundation', from: '2026-04-01', to: '2026-09-30', nodeIds, measureIds, storyIds, today: '2026-10-15' });
  assert.match(md, /^# Report to The Northern Foundation: April to September 2026/);
  for (const h of ['## In brief', '## The numbers', '## What is next', '## Thank you']) assert.ok(md.includes(h), h);
  assert.equal(md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---') && !l.startsWith('| Measure')).length, measureIds.length);
  if (storyIds.length) assert.ok(md.includes('## Stories from the data'));
  assert.ok(!/\n{3,}/.test(md));
  const moves = measureMovements(d.strategy, d.data, measureIds, '2026-04-01', '2026-09-30');
  assert.equal(moves.length, measureIds.length);
  assert.equal(periodLabel('2026-04-01', '2026-04-30'), 'April 2026');
  assert.equal(periodLabel('2025-11-01', '2026-02-28'), 'November 2025 to February 2026');
});

test('Markdown tables render with a head and rows', () => {
  const blocks = parseMarkdown('Before\n\n| Source | Budget |\n| --- | --- |\n| Grants | $4.2M |\n| Fees | $0.6M |\n\nAfter');
  const table = blocks.find((b) => b.t === 'table');
  assert.ok(table, 'a table block');
  assert.equal(table.head.length, 2);
  assert.equal(table.rows.length, 2);
  assert.equal(blocks.filter((b) => b.t !== 'table').length, 2, 'the text either side stays');
});

test('a stored “Web views” manifest gives way to the Web name', () => {
  const reg = mergeRegistry({ plugins: { pages: { id: 'pages', name: 'Web views', short: 'Web', blurb: 'old', tier: 'basic' } } });
  assert.equal(reg.plugins.pages.name, 'Web');
  assert.equal(reg.plugins.pages.tier, 'basic', 'other settings are kept');
  const kept = mergeRegistry({ plugins: { pages: { id: 'pages', name: 'Our sites' } } });
  assert.equal(kept.plugins.pages.name, 'Our sites', 'a name the org chose is kept');
});

test('every example site has a look, and the STEM example gains the youth site once', () => {
  const org = docs().org;
  for (const s of Object.values(org.sites)) assert.ok(s.look?.hero && s.look?.type, s.id);
  assert.equal(org.sites['site-youth'].visibility, 'unlisted');
  const older = structuredClone(org);
  delete older.sites['site-youth'];
  delete older.youthSite;
  for (const s of Object.values(older.sites)) delete s.look;
  const migrated = migrateOrg(older);
  assert.ok(migrated.sites['site-youth']);
  assert.ok(Object.values(migrated.sites).every((s) => s.look));
  delete migrated.sites['site-youth'];
  assert.equal(migrateOrg(migrated).sites['site-youth'], undefined, 'removed on purpose, it stays removed');
});

test('a strategy scorecard works for any plan: the road, headline numbers, goal lights and what is next', async () => {
  const { scorecardDashboard } = await import('../src/platform/dashboards.js');
  const d = docs();
  const dash = scorecardDashboard(d.strategy, 's-ed', '2026-11-15');
  const types = dash.widgets.map((w) => w.type);
  assert.equal(types[0], 'road');
  assert.ok(types.filter((t) => t === 'kpi').length >= 1 && types.filter((t) => t === 'kpi').length <= 4);
  for (const t of ['lights', 'milestones', 'progress']) assert.ok(types.includes(t), t);
  assert.equal(dash.visibility, 'private');
  assert.equal(new Set(dash.widgets.map((w) => w.id)).size, dash.widgets.length);
  const empty = scorecardDashboard({ nodes: {} });
  assert.deepEqual(empty.widgets, []);
});

test('alpha 0.4 one-word names: stored Strategy & Work, Public Portal and Podcasts take Plan, Web and Listen', () => {
  const reg = mergeRegistry({ plugins: {
    strategy: { id: 'strategy', name: 'Strategy & Work', short: 'Strategy' },
    pages: { id: 'pages', name: 'Public Portal', short: 'Portal' },
    podcasts: { id: 'podcasts', name: 'Podcasts', short: 'Podcasts' },
  } });
  assert.deepEqual(['strategy', 'pages', 'podcasts'].map((id) => [reg.plugins[id].name, reg.plugins[id].short]), [['Plan', 'Plan'], ['Web', 'Web'], ['Listen', 'Listen']]);
});
