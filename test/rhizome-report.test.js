// Rhizome output: the report pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts } from '../src/rhizome/facts.js';
import { measureFacts } from '../src/rhizome/measures.js';
import { runAnalysis } from '../src/rhizome/rules.js';
import { seedRhizome } from '../src/rhizome/setup.js';
import { buildReport, reportToMarkdown, REPORT_SECTIONS, defaultReportOptions } from '../src/rhizome/report.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const { docs } = kestrelBundle();
const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
const facts = buildFacts({ ...docs, mapContents });
const measures = measureFacts(facts, { today: '2026-11-22' });
const doc = seedRhizome(docs);
const ctx = { facts, measures, calibration: doc.calibration, profile: doc.profile, plugins: null, customRules: {}, custom: {} };
const NOW = '2026-11-22T12:00:00.000Z';

test('the report has every section by default, in order, with the org on the cover', () => {
  const r = buildReport(ctx, doc, defaultReportOptions(), { now: NOW, orgName: 'Kestrel Bay Community Foundation' });
  assert.deepEqual(r.sections.map((s) => s.id), REPORT_SECTIONS.map((s) => s.id));
  assert.match(r.meta.title, /Kestrel Bay/);
  assert.equal(r.meta.date, '2026-11-22');
  assert.ok(r.meta.profile.themes.length > 0);
});

test('findings: one block per rule, nothing lost, the top ones first', () => {
  const r = buildReport(ctx, doc, { ...defaultReportOptions(), limit: 200 }, { now: NOW });
  const all = runAnalysis(doc.analyses, ctx, { dismissed: {} });
  const f = r.sections.find((s) => s.id === 'findings');
  const counted = f.groups.flatMap((g) => g.items).reduce((n, x) => n + 1 + x.also.length, 0);
  assert.equal(counted, all.length, 'every finding is in a block or listed under one');
  const rules = f.groups.flatMap((g) => g.items.map((x) => x.ruleId));
  assert.equal(new Set(rules).size, rules.length, 'one block per rule');
  for (const x of f.groups.flatMap((g) => g.items)) {
    assert.ok(x.text && x.looked, x.ruleId);
    for (const link of x.read) assert.match(link.url, /^https:\/\//);
  }
  const top = r.sections.find((s) => s.id === 'summary').top;
  assert.equal(new Set(top.map((t) => t.title)).size, top.length, '"start here" is a spread');
});

test('options: one analysis, a limit, and sections left out', () => {
  const r = buildReport(ctx, doc, { scope: 'plan-hygiene', limit: 2, sections: ['findings', 'help'], title: 'Board pack' }, { now: NOW });
  assert.equal(r.meta.title, 'Board pack');
  assert.deepEqual(r.meta.analyses.map((a) => a.id), ['plan-hygiene']);
  assert.deepEqual(r.sections.map((s) => s.id), ['findings', 'help']);
  assert.ok(r.meta.shown <= 2);
});

test('dismissed findings stay out, and the text version reads cleanly', () => {
  const first = runAnalysis(doc.analyses, ctx)[0];
  const d2 = { ...doc, dismissed: { [first.id]: { sig: first.sig, at: NOW, title: first.title } } };
  const r = buildReport(ctx, d2, { ...defaultReportOptions(), limit: 200 }, { now: NOW, orgName: 'Kestrel' });
  assert.equal(r.meta.dismissed, 1);
  assert.equal(r.meta.total, runAnalysis(doc.analyses, ctx).length - 1);
  const md = reportToMarkdown(r);
  assert.match(md, /^# What Rhizome found for Kestrel/);
  assert.match(md, /## Reading list/);
  assert.ok(!/undefined|\[object Object\]/.test(md));
});
