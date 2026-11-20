import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportSections, joinSections, designedMarkdown, reportDesign } from '../src/platform/funderReports.js';
import { roleHas, orgPlugins } from '../src/plugins.js';
import { siteDesign } from '../src/platform/siteDesign.js';
import { boardDashboard } from '../src/platform/dashboards.js';

const body = '# Report to X: April 2026\n\n_Org · prepared today_\n\n## In brief\n\nIt went well.\n\n## The work\n\n### A workplan\n\nDone.\n';

test('report sections split on ## and join back', () => {
  const p = reportSections(body);
  assert.equal(p.title, 'Report to X: April 2026');
  assert.equal(p.intro, '_Org · prepared today_');
  assert.deepEqual(p.sections.map((s) => s.heading), ['In brief', 'The work']);
  assert.match(p.sections[1].text, /### A workplan/);
  assert.deepEqual(reportSections(joinSections(p)), p);
});

test('the designed report leaves out hidden sections, and the title when there is a cover', () => {
  const md = designedMarkdown({ body, hidden: ['The work'] });
  assert.doesNotMatch(md, /The work|^# /m);
  assert.match(md, /## In brief/);
  assert.match(designedMarkdown({ body, design: { cover: false } }), /^# Report to X/);
  assert.equal(reportDesign({}).template, 'modern');
});

test('plugins can be switched off for a role, never the core ones', () => {
  const org = { plugins: { podcasts: true }, pluginRoles: { podcasts: { board: false } } };
  assert.equal(roleHas(org, 'podcasts', 'board'), false);
  assert.equal(roleHas(org, 'podcasts', 'staff'), true);
  assert.ok(Array.isArray(orgPlugins(org)));
});

test('site design maps old heroes to templates and fills in a masthead', () => {
  assert.equal(siteDesign({ look: { hero: 'band' } }).template, 'commons');
  assert.equal(siteDesign({}).template, 'harbour');
  assert.ok(siteDesign({}).masthead.preset);
});

test('the board dashboard goes on the members-only portal', () => {
  const strategy = { nodes: { p: { id: 'p', type: 'plan', title: 'Plan', parentId: null, start: '2026-01-01', end: '2030-12-31' } } };
  const d = boardDashboard(strategy, 'me', { sites: { a: { id: 'a', visibility: 'public' }, b: { id: 'b', visibility: 'private' } }, today: '2026-06-01' });
  assert.equal(d.siteId, 'b');
  assert.equal(d.widgets[0].type, 'text');
  assert.equal(d.widgets.at(-1).title, 'What we ask of the board');
});
