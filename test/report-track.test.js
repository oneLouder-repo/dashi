import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFor, withDues, blankGrant, dueState, upcomingDues, dataCheck, seedGrants, RAMP, stepDate, addDays } from '../src/platform/reportTrack.js';

const grant = (cadence, from = '2026-05-01', to = '2027-04-30') => blankGrant({ id: 'g1', funder: 'Northern', from, to, cadence });

test('a twice-yearly grant reports a month after each half closes, and a final two months after it ends', () => {
  const s = scheduleFor(grant('half'));
  assert.deepEqual(s.map((d) => [d.kind, d.from, d.to, d.due]), [
    ['interim', '2026-05-01', '2026-10-31', '2026-11-30'],
    ['final', '2026-05-01', '2027-04-30', '2027-06-30'],
  ]);
});

test('quarterly gives three interims in a year; final-only gives one report', () => {
  assert.equal(scheduleFor(grant('quarterly')).filter((d) => d.kind === 'interim').length, 3);
  assert.deepEqual(scheduleFor(grant('final')).map((d) => d.due), ['2027-06-30']);
  assert.deepEqual(scheduleFor({ cadence: 'half' }), []);
});

test('rescheduling keeps ticked steps and drafts, and drops untouched dues', () => {
  const g = withDues(grant('quarterly'));
  const first = Object.keys(g.dues)[0];
  g.dues[first].steps.heads = { done: true, at: '2026-07-01' };
  g.dues[first].evidence = ['story:s1'];
  const again = withDues({ ...g, cadence: 'final' });
  assert.ok(again.dues[first], 'the due with work on it is kept');
  assert.equal(again.dues[first].steps.heads.done, true);
  assert.deepEqual(again.dues[first].evidence, ['story:s1']);
  assert.deepEqual(withDues(g).dues[first].evidence, ['story:s1'], 'picked evidence survives a plain reschedule');
  assert.equal(Object.keys(again.dues).length, 2);
});

test('a due moves from later, to its on-ramp, to overdue, to sent', () => {
  const d = Object.values(withDues(grant('half')).dues)[0]; // due 2026-11-30
  assert.equal(dueState(d, '2026-09-01').phase, 'later');
  const ramp = dueState(d, '2026-11-10');
  assert.equal(ramp.phase, 'ramp');
  assert.deepEqual(ramp.late.map((s) => s.id), ['heads', 'data', 'evidence']);
  assert.equal(ramp.current.id, 'heads');
  assert.equal(dueState(d, '2026-12-05').phase, 'overdue');
  assert.equal(dueState({ ...d, steps: { send: { done: true } } }, '2026-12-05').phase, 'sent');
  assert.equal(dueState(d, '2026-12-05', { reportStatus: 'sent' }).phase, 'sent');
  assert.equal(stepDate(d, RAMP[0]), addDays('2026-11-30', -42));
});

test('upcoming dues come soonest first and leave out sent ones', () => {
  const g = withDues(grant('half'));
  const [first] = Object.keys(g.dues);
  g.dues[first].steps.send = { done: true };
  const list = upcomingDues({ grants: { g1: g } }, '2026-11-01');
  assert.deepEqual(list.map((x) => x.due.kind), ['final']);
  assert.equal(upcomingDues({ grants: { g1: g } }, '2026-11-01', { all: true }).length, 2);
});

test('the data check flags stale measures and missing months', () => {
  const strategy = { nodes: {
    root: { id: 'root', type: 'framework', parentId: null, children: ['o1'] },
    o1: { id: 'o1', type: 'objective', parentId: 'root', children: [], measures: [{ id: 'm1', name: 'Youth reached', target: '100' }, { id: 'm2', name: 'Grants made', target: '' }] },
  } };
  const data = { series: {
    m1: { points: [{ date: '2026-05-01', value: 1 }, { date: '2026-06-01', value: 2 }, { date: '2026-08-01', value: 3 }, { date: '2026-09-01', value: 4 }, { date: '2026-10-01', value: 5 }] },
    m2: { points: [{ date: '2026-05-01', value: 1 }] },
  } };
  const g = withDues({ ...grant('half'), nodeIds: ['o1'] });
  const d = Object.values(g.dues)[0];
  const checks = dataCheck(strategy, data, g, d, '2026-11-10');
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  assert.equal(byId.m1.missing, 1);
  assert.equal(byId.m1.stale, false);
  assert.equal(byId.m2.stale, true);
  assert.equal(byId.m2.noTarget, true);
});

test('Kestrel seeds three grants with one report in its on-ramp now', () => {
  const strategy = { nodes: { a: { id: 'a', type: 'objective' }, b: { id: 'b', type: 'objective' } } };
  const grants = seedGrants(strategy, '2026-11-23');
  assert.equal(Object.keys(grants).length, 3);
  const live = upcomingDues({ grants }, '2026-11-23').filter((x) => x.state.phase === 'ramp');
  assert.equal(live.length, 1);
  assert.equal(live[0].state.current.id, 'draft');
});

test('the Gantt finds reports for grants above or below a node, and My work finds an owner’s reports', async () => {
  const { duesForNodes, duesFor } = await import('../src/platform/reportTrack.js');
  const strategy = { nodes: { root: { id: 'root', parentId: null }, o1: { id: 'o1', parentId: 'root' }, g1: { id: 'g1', parentId: 'o1' }, w1: { id: 'w1', parentId: 'g1' }, o2: { id: 'o2', parentId: 'root' } } };
  const a = withDues({ ...blankGrant({ id: 'a', funder: 'A', from: '2026-05-01', to: '2027-04-30', cadence: 'half', ownerId: 's1' }), nodeIds: ['o1'] });
  const b = withDues({ ...blankGrant({ id: 'b', funder: 'B', from: '2026-05-01', to: '2027-04-30', cadence: 'final' }), nodeIds: ['o2'] });
  const doc = { grants: { a, b } };
  assert.deepEqual([...new Set(duesForNodes(doc, strategy, ['w1'], '2026-11-01').map((x) => x.grant.id))], ['a']);
  assert.deepEqual([...new Set(duesForNodes(doc, strategy, ['root'], '2026-11-01').map((x) => x.grant.id))].sort(), ['a', 'b']);
  assert.ok(duesFor(doc, 's1', '2026-11-01').every((x) => x.grant.id === 'a'));
  assert.equal(duesFor(doc, 's2', '2026-11-01').length, 0);
  assert.ok(duesFor(doc, 's2', '2026-11-01', { all: true }).length > 0);
});

test('evidence: stories sharing a measure come first, assets come from the funded work, episodes and course finishes from the period', async () => {
  const { evidenceFor, evidenceMarkdown } = await import('../src/platform/reportTrack.js');
  const strategy = { nodes: {
    o1: { id: 'o1', parentId: null, title: 'Youth', measures: [{ id: 'm1', name: 'Youth reached' }] },
    w1: { id: 'w1', parentId: 'o1', title: 'Panel', assets: [{ id: 'a1', kind: 'media', label: 'Panel photo' }, { id: 'a2', kind: 'staff', label: 'Sam' }] },
    o2: { id: 'o2', parentId: null, title: 'Other', assets: [{ id: 'a3', kind: 'document', label: 'Elsewhere' }] },
  } };
  const g = withDues({ ...blankGrant({ id: 'g', funder: 'F', from: '2026-05-01', to: '2027-04-30', cadence: 'half' }), nodeIds: ['o1'] });
  const due = Object.values(g.dues)[0]; // May to October 2026
  const dashboards = { stories: { s1: { id: 's1', title: 'B story', steps: [{ measureId: 'zz' }] }, s2: { id: 's2', title: 'A story', steps: [{ measureId: 'm1' }] } } };
  const podcasts = { podcasts: { p: { title: 'Show' } }, episodes: { e1: { id: 'e1', podcastId: 'p', title: 'In', status: 'published', publishedAt: '2026-07-01' }, e2: { id: 'e2', podcastId: 'p', title: 'Out', status: 'published', publishedAt: '2026-12-01' } } };
  const teach = { cartridges: { c1: { id: 'c1', title: 'Course', status: 'published', blocks: { b1: { id: 'b1', required: true } } } } };
  const learn = { people: { s1: { enrolments: { c1: { at: '2026-06-01T10:00:00Z', done: { b1: '2026-06-10T10:00:00Z' } } } }, s2: { enrolments: { c1: { at: '2025-01-01T10:00:00Z', done: {} } } } } };
  const ev = evidenceFor({ grant: g, due, strategy, dashboards, podcasts, teach, learn });
  assert.deepEqual(ev.stories.map((x) => x.key), ['story:s2', 'story:s1']);
  assert.deepEqual(ev.assets.map((x) => x.title), ['Panel photo']);
  assert.deepEqual(ev.episodes.map((x) => x.title), ['In']);
  assert.equal(ev.courses[0].joined, 1);
  assert.equal(ev.courses[0].finished, 1);
  const md = evidenceMarkdown(ev, ['course:c1', 'episode:e1', 'story:s2']);
  assert.match(md, /## Evidence/);
  assert.match(md, /Course: 1 person joined and 1 finished/);
  assert.doesNotMatch(md, /A story/);
  assert.equal(evidenceMarkdown(ev, []), '');
});
