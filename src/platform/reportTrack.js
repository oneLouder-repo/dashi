/**
 * Funding report tracks: each grant has a reporting schedule, and each
 * report on it has an on-ramp, a run of steps counted back from its due
 * date, so a report never arrives as a surprise. The draft at the end is
 * the one funderReports.js already writes.
 *
 * Grants live in the dashboards document (collection `grants`), next to the
 * funder reports they lead to.
 *
 * Grant { id, funder, title, amount (dollars), from, to (YYYY-MM-DD),
 *         cadence: 'quarterly' | 'half' | 'yearly' | 'final',
 *         nodeIds, measureIds, ownerId, notes,
 *         dues: { [dueId]: Due } }
 * Due   { id, due (YYYY-MM-DD), kind: 'interim' | 'final', from, to (the period it covers),
 *         steps: { [stepId]: { done: bool, at } }, reportId }
 *
 * Step offsets count back from the due date in days, the way cartridge
 * blocks count from day 0. Pure functions, so tests and the server can run them.
 */
import { measuresUnder, rootOf } from './strategy.js';
import { seriesOf } from './data.js';

export const CADENCES = [
  { id: 'quarterly', label: 'Every quarter', months: 3 },
  { id: 'half', label: 'Twice a year', months: 6 },
  { id: 'yearly', label: 'Once a year', months: 12 },
  { id: 'final', label: 'A final report only', months: 0 },
];

/** The on-ramp: what to do, and how many days before the due date. */
export const RAMP = [
  { id: 'heads', offset: -42, label: 'Heads up', hint: 'Tell the owner and the program lead the report is coming. Book the review.' },
  { id: 'data', offset: -35, label: 'Check the data', hint: 'Fill missing months and update stale numbers for the measures the funder cares about.' },
  { id: 'evidence', offset: -28, label: 'Gather the evidence', hint: 'Pick data stories, photos, quotes and episodes that show the work.' },
  { id: 'brief', offset: -21, label: 'Read up on the funder', hint: 'Their current priorities, latest annual report and any changes to the report form.', optional: true },
  { id: 'draft', offset: -14, label: 'Write the draft', hint: 'Dashi writes a first draft from the period, the measures, the workplans and the stories.' },
  { id: 'review', offset: -7, label: 'Review and sign off', hint: 'The ED or a board member reads it and signs off.' },
  { id: 'send', offset: 0, label: 'Send it', hint: 'Send it through the funder’s portal or by email, then mark it sent.' },
];
export const RAMP_DAYS = -RAMP[0].offset;

const DAY = 86400000;
const dayNum = (d) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY;
const fromNum = (n) => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);
export const addDays = (d, n) => fromNum(dayNum(d) + n);
export const daysBetween = (a, b) => Math.round(dayNum(b) - dayNum(a));
function addMonths(d, n) {
  const [y, m] = d.slice(0, 7).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 10);
}
const monthEnd = (d) => addDays(addMonths(d, 1), -1);

/** A new grant with sensible defaults. */
export function blankGrant({ id, funder = '', title = '', amount = 0, from, to, cadence = 'half', nodeIds = [], measureIds = [], ownerId = null } = {}) {
  return { id: id ?? `grant-${Math.random().toString(36).slice(2, 9)}`, funder, title: title || (funder ? `${funder} grant` : 'New grant'), amount, from, to, cadence, nodeIds, measureIds, ownerId, notes: '', dues: {} };
}

/**
 * The report due dates a grant's cadence gives: one at the end of each
 * period (due a month after it closes), and a final report two months
 * after the grant ends. Returns [{ id, due, kind, from, to }], oldest first.
 */
export function scheduleFor(grant) {
  if (!grant?.from || !grant?.to) return [];
  const months = CADENCES.find((c) => c.id === grant.cadence)?.months ?? 0;
  const out = [];
  if (months) {
    for (let start = `${grant.from.slice(0, 7)}-01`; ; start = addMonths(start, months)) {
      const end = monthEnd(addMonths(start, months - 1));
      if (end >= grant.to) break;
      out.push({ id: `due-${end.slice(0, 7)}`, kind: 'interim', from: start < grant.from ? grant.from : start, to: end, due: monthEnd(addMonths(end, 1)) });
    }
  }
  out.push({ id: 'due-final', kind: 'final', from: grant.from, to: grant.to, due: monthEnd(addMonths(grant.to, 2)) });
  return out;
}

/**
 * The grant with its dues brought in line with its schedule. Steps already
 * ticked and drafts already written are kept; dues the schedule no longer
 * gives are dropped unless work was done on them.
 */
export function withDues(grant) {
  const old = grant.dues ?? {};
  const dues = {};
  for (const d of scheduleFor(grant)) dues[d.id] = { ...(old[d.id] ?? {}), ...d, steps: old[d.id]?.steps ?? {}, reportId: old[d.id]?.reportId ?? null };
  for (const [id, d] of Object.entries(old)) if (!dues[id] && (d.reportId || d.evidence?.length || Object.values(d.steps ?? {}).some((s) => s.done))) dues[id] = d;
  return { ...grant, dues };
}

/** The date each step of a due falls on. */
export const stepDate = (due, step) => addDays(due.due, step.offset);

/**
 * Where a due stands today:
 *   phase    'sent' | 'later' (before the on-ramp) | 'ramp' | 'overdue' (past the due date, not sent)
 *   daysLeft days until the due date (negative once past)
 *   current  the step to do now: the first one not done whose date has come (or the next one)
 *   late     steps not done whose date has passed
 *   done     how many steps are done, of how many
 */
export function dueState(due, today, { reportStatus = null } = {}) {
  const daysLeft = daysBetween(today, due.due);
  const isDone = (s) => !!due.steps?.[s.id]?.done;
  const sent = isDone(RAMP.at(-1)) || reportStatus === 'sent';
  const required = RAMP.filter((s) => !s.optional);
  const done = RAMP.filter(isDone).length;
  const late = sent ? [] : RAMP.filter((s) => !s.optional && !isDone(s) && stepDate(due, s) < today);
  const current = sent ? null : RAMP.find((s) => !isDone(s) && !s.optional && stepDate(due, s) <= today) ?? RAMP.find((s) => !isDone(s) && !s.optional) ?? null;
  const phase = sent ? 'sent' : daysLeft < 0 ? 'overdue' : daysLeft > RAMP_DAYS ? 'later' : 'ramp';
  return { phase, daysLeft, current, late, done, of: RAMP.length, required: required.length };
}

/** Every due across the grants, soonest first, with its grant and state. Sent ones are left out unless `all`. */
export function upcomingDues(doc, today, { all = false, reports = {} } = {}) {
  const out = [];
  for (const g of Object.values(doc.grants ?? {})) {
    for (const d of Object.values(withDues(g).dues)) {
      const state = dueState(d, today, { reportStatus: reports[d.reportId]?.status });
      if (all || state.phase !== 'sent') out.push({ grant: g, due: d, state });
    }
  }
  return out.sort((a, b) => a.due.due.localeCompare(b.due.due));
}

/**
 * Is the data ready? For each of the grant's measures (or all the measures
 * under its objectives): when it was last updated, whether that is stale
 * (no value in the last 60 days), how many months of the period have no
 * value, and whether it has a target. `ok` is true when none of those bite.
 */
export function dataCheck(strategy, data, grant, due, today) {
  const ids = grant.measureIds?.length ? grant.measureIds : [...new Set((grant.nodeIds ?? []).flatMap((id) => measuresUnder(strategy, id).map((m) => m.id)))];
  const all = Object.fromEntries(measuresUnder(strategy, rootOf(strategy)?.id).map((m) => [m.id, m]));
  const until = due.to < today ? due.to : today;
  return ids.map((id) => all[id]).filter(Boolean).map((m) => {
    const points = seriesOf(m.id, data)?.points ?? [];
    const last = points.filter((p) => p.date <= today).at(-1) ?? null;
    const have = new Set(points.map((p) => p.date.slice(0, 7)));
    let missing = 0;
    for (let mo = `${due.from.slice(0, 7)}-01`; mo <= until; mo = addMonths(mo, 1)) if (!have.has(mo.slice(0, 7))) missing++;
    const stale = !last || daysBetween(last.date, today) > 60;
    const target = Number(m.target);
    const noTarget = !(Number.isFinite(target) && target > 0);
    return { id: m.id, name: m.name, last: last?.date ?? null, stale, missing, noTarget, ok: !stale && !missing };
  });
}

/** How many dollars, as words: $18,500. */
export const dollars = (n) => (n ? `$${Math.round(n).toLocaleString('en-CA')}` : '');

/**
 * Example grants for the Kestrel Bay test org, dated around `today` so a
 * report is always on its way: one in its on-ramp now, one a quarter out,
 * and one final report later in the year.
 */
export function seedGrants(strategy, today = new Date().toISOString().slice(0, 10), ownerId = null) {
  const objectives = Object.values(strategy?.nodes ?? {}).filter((n) => n.type === 'objective');
  const pick = (i) => (objectives.length ? [objectives[i % objectives.length].id] : []);
  const month = (n) => addMonths(today, n);
  const grants = [
    // Twice a year; the period that closed last month is due at the end of this one.
    blankGrant({ id: 'grant-province', funder: 'Provincial Community Fund', title: 'Rural community grants', amount: 450000, from: month(-6), to: monthEnd(month(29)), cadence: 'half', nodeIds: pick(0), ownerId }),
    // Every quarter; the next one is due in about three months.
    blankGrant({ id: 'grant-northern', funder: 'The Northern Foundation', title: 'Youth philanthropy panel', amount: 60000, from: month(-1), to: monthEnd(month(10)), cadence: 'quarterly', nodeIds: pick(1), ownerId }),
    // A final report only, after a short grant ending this spring.
    blankGrant({ id: 'grant-federal', funder: 'Federal Community Services Fund', title: 'Food security bridge', amount: 40000, from: month(-8), to: monthEnd(month(4)), cadence: 'final', nodeIds: pick(2), ownerId }),
  ].map(withDues);
  // Kestrel has done the first steps of the report due soonest, but not the draft yet.
  const soon = Object.values(grants[0].dues).filter((d) => d.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
  if (soon) for (const s of RAMP) if (stepDate(soon, s) < today && !s.optional && s.id !== 'draft') soon.steps[s.id] = { done: true, at: stepDate(soon, s) };
  return Object.fromEntries(grants.map((g) => [g.id, g]));
}

/**
 * The reports that touch a part of the plan: dues of grants that fund any
 * of `nodeIds`, or anything above or below them. For the workplan Gantt.
 */
export function duesForNodes(doc, strategy, nodeIds, today, { reports = {} } = {}) {
  const near = new Set();
  const nodes = strategy?.nodes ?? {};
  for (const id of nodeIds) {
    for (let n = nodes[id]; n; n = nodes[n.parentId]) near.add(n.id);
    const walk = (pid) => { for (const c of Object.values(nodes)) if (c.parentId === pid && !near.has(c.id)) { near.add(c.id); walk(c.id); } };
    walk(id);
  }
  return upcomingDues(doc, today, { reports, all: true }).filter((x) => (x.grant.nodeIds ?? []).some((id) => near.has(id)));
}

/** The reports a person looks after: grants they own (or, for `all`, every grant). Sent ones left out. */
export function duesFor(doc, staffId, today, { all = false, reports = {} } = {}) {
  return upcomingDues(doc, today, { reports }).filter((x) => all || x.grant.ownerId === staffId);
}

/**
 * What could go in a report as evidence, for one due:
 *   stories   data stories (all of them; the ones sharing a measure with the grant come first)
 *   assets    documents, links and media attached to the grant's work in Plan
 *   episodes  Listen episodes published during the period
 *   courses   published courses in Learn, with how many joined and finished during the period
 * Each item is { key, kind, title, sub }. `key` is `<kind>:<id>`, what a due keeps in `evidence`.
 */
export function evidenceFor({ grant, due, strategy, dashboards = {}, podcasts = null, teach = null, learn = null }) {
  const nodes = strategy?.nodes ?? {};
  const under = new Set();
  const walk = (id) => { if (under.has(id) || !nodes[id]) return; under.add(id); for (const c of Object.values(nodes)) if (c.parentId === id) walk(c.id); };
  for (const id of grant.nodeIds ?? []) walk(id);
  const measures = new Set([...under].flatMap((id) => (nodes[id].measures ?? []).map((m) => m.id)));
  const inPeriod = (d) => !!d && d.slice(0, 10) >= due.from && d.slice(0, 10) <= due.to;

  const stories = Object.values(dashboards.stories ?? {}).map((s) => ({ s, hit: (s.steps ?? []).some((st) => measures.has(st.measureId)) }))
    .sort((a, b) => b.hit - a.hit || a.s.title.localeCompare(b.s.title))
    .map(({ s, hit }) => ({ key: `story:${s.id}`, kind: 'story', title: s.title, sub: hit ? 'Uses this grant’s measures' : (s.summary ?? '').slice(0, 80) }));
  const assets = [...under].flatMap((id) => (nodes[id].assets ?? []).filter((a) => ['media', 'document', 'link', 'literature'].includes(a.kind)).map((a) => ({ key: `asset:${id}/${a.id}`, kind: 'asset', title: a.label, sub: `${a.kind === 'media' ? 'Photo or media' : a.kind === 'document' ? 'Document' : a.kind === 'link' ? 'Link' : 'Reading'} · ${nodes[id].title}`, url: a.url ?? null })));
  const episodes = Object.values(podcasts?.episodes ?? {}).filter((e) => e.status === 'published' && inPeriod(e.publishedAt))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((e) => ({ key: `episode:${e.id}`, kind: 'episode', title: e.title, sub: `${podcasts.podcasts?.[e.podcastId]?.title ?? 'Listen'} · ${e.publishedAt.slice(0, 10)}` }));
  const courses = Object.values(teach?.cartridges ?? {}).filter((c) => c.status === 'published').map((c) => {
    let joined = 0, finished = 0;
    for (const p of Object.values(learn?.people ?? {})) {
      const e = p.enrolments?.[c.id];
      if (!e) continue;
      if (inPeriod(e.at)) joined++;
      const req = Object.values(c.blocks ?? {}).filter((b) => b.required);
      const last = req.map((b) => e.done?.[b.id]).filter(Boolean).sort().at(-1);
      if (req.length && req.every((b) => e.done?.[b.id]) && inPeriod(last)) finished++;
    }
    return { key: `course:${c.id}`, kind: 'course', title: c.title, sub: `${joined} joined and ${finished} finished in the period`, joined, finished };
  });
  return { stories, assets, episodes, courses };
}

/** The picked evidence as a report section, in Markdown ('' when nothing is picked). */
export function evidenceMarkdown(evidence, picked = []) {
  const all = Object.fromEntries(Object.values(evidence).flat().map((x) => [x.key, x]));
  const items = picked.map((k) => all[k]).filter(Boolean).filter((x) => x.kind !== 'story');
  if (!items.length) return '';
  const lines = ['## Evidence', ''];
  const group = (kind, heading, line) => { const xs = items.filter((x) => x.kind === kind); if (xs.length) lines.push(`**${heading}**`, '', ...xs.map(line), ''); };
  group('course', 'Learning', (x) => `- ${x.title}: ${x.joined} ${x.joined === 1 ? 'person' : 'people'} joined and ${x.finished} finished in the period.`);
  group('episode', 'Episodes', (x) => `- _${x.title}_ (${x.sub})`);
  group('asset', 'Photos, documents and links', (x) => `- ${x.url ? `[${x.title}](${x.url})` : x.title} (${x.sub.split(' · ')[0].toLowerCase()})`);
  return lines.join('\n');
}
