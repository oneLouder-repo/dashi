import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { Drawer } from '../ui/drawer.js';
import { toast } from '../ui/toast.js';
import { uiConfirm } from '../ui/dialog.js';
import { reportableNodes, blankReport, draftReport, periodLabel } from '../platform/funderReports.js';
import { NODE_TYPES } from '../platform/strategy.js';
import { CADENCES, RAMP, RAMP_DAYS, blankGrant, withDues, stepDate, dueState, upcomingDues, dataCheck, dollars, addDays, evidenceFor, evidenceMarkdown } from '../platform/reportTrack.js';
import { loadPodcasts, loadTeach, loadLearn } from '../platform/docs.js';
import { enabledPlugins } from '../plugins.js';
import { short, today } from '../strategy/dates.js';

/**
 * The report track above the funder reports: what's due over the next
 * year, and for each report an on-ramp of steps counted back from its due
 * date. Each report opens in a drawer with its steps, a data check, and the
 * button that writes the draft.
 */
const PHASE = {
  overdue: { label: 'Overdue', cls: 'rt-overdue' },
  ramp: { label: 'On its way', cls: 'rt-ramp' },
  later: { label: 'Later', cls: 'rt-later' },
  sent: { label: 'Sent', cls: 'rt-sent' },
};
const kindLabel = (d) => (d.kind === 'final' ? 'Final report' : 'Interim report');
const inDays = (n) => (n === 0 ? 'due today' : n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} late`);

export function ReportTrack(ctx) {
  const store = ctx.dashboards;
  const now = today();
  const reports = store.doc.reports ?? {};
  const grants = Object.values(store.doc.grants ?? {});
  const dues = upcomingDues(store.doc, now, { reports });
  const yearOut = addDays(now, 365);
  const soon = dues.filter((x) => x.due.due <= yearOut);

  // Twelve months across, a dot for each report due.
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(`${now.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  const strip = h('ol', { class: 'rt-strip', 'aria-label': 'Reports due over the next twelve months' }, months.map((m) => {
    const here = soon.filter((x) => x.due.due.slice(0, 7) === m);
    return h('li', { class: here.length ? 'has' : '' },
      h('span', { class: 'rt-month' }, new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' })),
      h('span', { class: 'rt-dots' }, here.map((x) => h('button', { type: 'button', class: `rt-dot ${PHASE[x.state.phase].cls}`, title: `${x.grant.funder}: ${kindLabel(x.due)}, due ${short(x.due.due)}`, 'aria-label': `${x.grant.funder}, ${kindLabel(x.due)}, due ${short(x.due.due)}`, onclick: () => openDue(ctx, x.grant.id, x.due.id) }))));
  }));

  const rows = soon.slice(0, 4).map(({ grant, due, state }) => h('button', { type: 'button', class: `rt-row ${PHASE[state.phase].cls}`, onclick: () => openDue(ctx, grant.id, due.id) },
    h('span', { class: 'rt-date' }, h('b', {}, short(due.due)), h('small', {}, inDays(state.daysLeft))),
    h('span', { class: 'rt-what' }, h('b', {}, grant.funder), h('small', {}, `${kindLabel(due)} · ${periodLabel(due.from, due.to)}`)),
    h('span', { class: 'rt-pips', 'aria-label': `${state.done} of ${state.of} steps done` }, RAMP.map((s) => h('i', { class: `${due.steps?.[s.id]?.done ? 'done' : ''}${state.late.includes(s) ? ' late' : ''}${state.current === s && state.phase !== 'later' ? ' now' : ''}${s.optional ? ' opt' : ''}` }))),
    h('span', { class: 'rt-next' }, state.phase === 'later' ? `On-ramp starts ${short(addDays(due.due, -RAMP_DAYS))}` : state.current ? `${state.late.length ? 'Late: ' : 'Now: '}${state.current.label}` : 'All done'),
    icon('chevronRight', 14)));

  return h('section', { class: 'rt card', 'aria-label': 'Reports coming up' },
    h('header', { class: 'rt-head' },
      h('div', {}, h('h2', {}, icon('calendar', 16), 'Reports coming up'),
        h('p', { class: 'muted small' }, grants.length ? `${grants.length} grant${grants.length === 1 ? '' : 's'} · each report gets a six-week on-ramp, so nothing arrives as a surprise` : 'Add a grant and its reporting schedule, and Dashi lays out each report’s on-ramp: heads up, data check, evidence, draft, review, send.')),
      h('div', { class: 'rt-head-actions' },
        grants.length > 0 && h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => openGrants(ctx) }, icon('handshake', 14), 'Grants'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openGrant(ctx, null) }, icon('plus', 14), 'Add a grant'))),
    grants.length > 0 && strip,
    rows.length ? h('div', { class: 'rt-rows' }, rows) : grants.length > 0 && h('p', { class: 'muted small' }, 'No reports due in the next twelve months.'));
}

/* --------------------------------------------------------- one report due */

function openDue(ctx, grantId, dueId) {
  let drawer;
  const body = () => DueBody(ctx, grantId, dueId, () => drawer.close(), () => drawer.setBody(body()));
  const g = ctx.dashboards.doc.grants[grantId];
  const d = withDues(g).dues[dueId];
  drawer = Drawer({ title: `${g.funder}: ${kindLabel(d).toLowerCase()}`, sub: `${g.title} · covers ${periodLabel(d.from, d.to)} · due ${short(d.due)}`, body: body(), wide: true, onClose: () => ctx.render() });
}

function DueBody(ctx, grantId, dueId, close, redraw) {
  const store = ctx.dashboards;
  const now = today();
  const g = withDues(store.doc.grants[grantId]);
  const d = g.dues[dueId];
  const report = d.reportId ? store.doc.reports?.[d.reportId] : null;
  const state = dueState(d, now, { reportStatus: report?.status });
  const saveDue = (patch) => { store.apply(col.update('grants', g.id, { dues: { ...g.dues, [d.id]: { ...d, ...patch } } })); redraw(); };
  const tick = (s, done) => saveDue({ steps: { ...d.steps, [s.id]: { done, at: now } } });

  // Evidence from other plugins, only from the ones this person can use.
  const on = new Set(enabledPlugins(ctx.org).map((p) => p.id));
  const evidence = evidenceFor({ grant: g, due: d, strategy: ctx.strategy, dashboards: store.doc,
    podcasts: on.has('podcasts') ? loadPodcasts() : null, teach: on.has('learn') ? loadTeach() : null, learn: on.has('learn') ? loadLearn() : null });
  const picked = d.evidence ?? [];
  const pick = (key, yes) => saveDue({ evidence: yes ? [...new Set([...picked, key])] : picked.filter((k) => k !== key) });

  const writeDraft = () => {
    const storyIds = picked.filter((k) => k.startsWith('story:')).map((k) => k.slice(6));
    const base = blankReport({ funder: g.funder, from: d.from, to: d.to, nodeIds: g.nodeIds, measureIds: g.measureIds ?? [], storyIds });
    base.title = `${g.funder}: ${kindLabel(d).toLowerCase()}, ${periodLabel(d.from, d.to)}`;
    base.body = draftReport({ strategy: ctx.strategy, data: ctx.data.doc, dashboards: store.doc, org: ctx.org }, { ...base, today: now, extra: evidenceMarkdown(evidence, picked) });
    const op = store.apply(col.add('reports', base));
    store.apply(col.update('grants', g.id, { dues: { ...g.dues, [d.id]: { ...d, reportId: op.id, steps: { ...d.steps, draft: { done: true, at: now } } } } }));
    toast('Draft written');
    ctx.reportId = op.id;
    close();
  };
  const openDraft = () => { ctx.reportId = d.reportId; close(); };
  const send = async () => {
    if (report && report.status !== 'sent') store.apply(col.update('reports', report.id, { status: 'sent', sentAt: now, updatedAt: now }));
    tick(RAMP.at(-1), true);
  };

  const checks = dataCheck(ctx.strategy, ctx.data.doc, g, d, now);
  const bad = checks.filter((c) => !c.ok);

  const steps = h('ol', { class: 'rt-steps' }, RAMP.map((s) => {
    const done = !!d.steps?.[s.id]?.done;
    const late = state.late.includes(s);
    const extra = s.id === 'evidence' ? h('span', { class: `rt-tag ${picked.length ? 'ok' : 'warn'}` }, picked.length ? `${picked.length} picked for the draft` : 'Nothing picked yet: see Evidence below')
      : s.id === 'data' ? h('span', { class: `rt-tag ${bad.length ? 'warn' : 'ok'}` }, bad.length ? `${bad.length} of ${checks.length} measures need a look` : checks.length ? 'All measures up to date' : 'No measures picked')
      : s.id === 'draft' ? (report ? h('button', { type: 'button', class: 'btn btn-xs', onclick: openDraft }, icon('fileText', 13), 'Open the draft') : h('button', { type: 'button', class: 'btn btn-xs btn-primary', onclick: writeDraft }, icon('sparkle', 13), 'Write the draft'))
      : s.id === 'send' && !done ? h('button', { type: 'button', class: 'btn btn-xs', onclick: send }, icon('check', 13), 'Mark as sent')
      : null;
    return h('li', { class: `rt-step${done ? ' done' : ''}${late ? ' late' : ''}${state.current === s ? ' now' : ''}${s.optional ? ' opt' : ''}` },
      h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: done, 'aria-label': `${s.label} done`, onchange: (e) => (s.id === 'send' && e.target.checked ? send() : tick(s, e.target.checked)) }),
      h('div', { class: 'rt-step-text' },
        h('div', { class: 'rt-step-top' }, h('b', {}, s.label), s.optional && h('small', { class: 'rt-opt' }, 'optional'), h('span', { class: 'rt-step-date' }, `${short(stepDate(d, s))}${s.offset ? ` · ${-s.offset} days before` : ' · due date'}`)),
        h('p', {}, s.hint),
        extra));
  }));

  const dataCard = checks.length > 0 && h('section', { class: 'rt-data' },
    h('h3', {}, icon('gauge', 14), 'Is the data ready?'),
    h('ul', {}, checks.map((c) => h('li', { class: c.ok ? 'ok' : 'warn' },
      h('span', { class: 'rt-light', 'aria-hidden': 'true' }),
      h('span', {}, h('b', {}, c.name), h('small', {}, [c.last ? `last value ${short(c.last)}` : 'no data yet', c.stale ? 'stale' : null, c.missing ? `${c.missing} month${c.missing === 1 ? '' : 's'} missing in the period` : null, c.noTarget ? 'no target' : null].filter(Boolean).join(' · ')))))),
    h('a', { class: 'btn btn-xs btn-ghost', href: '#data' }, icon('table', 13), 'Open the data'));

  const groups = [['stories', 'Data stories', 'story'], ['assets', 'Photos, documents and links from the work', 'image'], ['episodes', 'Episodes from the period', 'mic'], ['courses', 'Courses in Learn', 'graduation']];
  const evidenceCard = h('section', { class: 'rt-evidence' },
    h('h3', {}, icon('sparkle', 14), 'Evidence for the draft'),
    h('p', { class: 'muted small' }, 'Tick what should go in. Stories become their own section; the rest are listed under Evidence.'),
    groups.map(([k, label, ic]) => evidence[k].length > 0 && h('div', { class: 'rt-ev-group' },
      h('h4', {}, icon(ic, 13), label, h('small', {}, String(evidence[k].length))),
      h('ul', {}, evidence[k].slice(0, 8).map((x) => h('li', {}, h('label', {},
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: picked.includes(x.key), onchange: (e) => pick(x.key, e.target.checked) }),
        h('span', {}, h('b', {}, x.title), h('small', {}, x.sub)))))))),
    !groups.some(([k]) => evidence[k].length) && h('p', { class: 'muted small' }, 'Nothing to pick yet. Attach photos and documents to the grant’s workplans in Plan, or make a data story.'));

  return h('div', { class: 'rt-due' },
    h('div', { class: `rt-banner ${PHASE[state.phase].cls}` },
      h('b', {}, PHASE[state.phase].label), ' · ', state.phase === 'sent' ? 'nothing left to do' : inDays(state.daysLeft),
      state.late.length > 0 && h('span', {}, ` · ${state.late.length} step${state.late.length === 1 ? '' : 's'} behind`)),
    steps, evidenceCard, dataCard);
}

/* ---------------------------------------------------------------- grants */

function openGrants(ctx) {
  let drawer;
  const body = () => h('ul', { class: 'rt-grants' }, Object.values(ctx.dashboards.doc.grants ?? {}).map((g) => {
    const next = upcomingDues({ grants: { [g.id]: g } }, today(), { reports: ctx.dashboards.doc.reports ?? {} })[0];
    return h('li', {}, h('button', { type: 'button', onclick: () => { drawer.close(); setTimeout(() => openGrant(ctx, g.id), 180); } },
      h('b', {}, g.funder), h('small', {}, `${g.title}${g.amount ? ` · ${dollars(g.amount)}` : ''} · ${CADENCES.find((c) => c.id === g.cadence)?.label.toLowerCase()}`),
      h('span', { class: 'muted small' }, next ? `Next: ${short(next.due.due)}` : 'All sent')));
  }));
  drawer = Drawer({ title: 'Grants', sub: 'Each grant’s reporting schedule', body: body(), onClose: () => ctx.render() });
}

function openGrant(ctx, grantId) {
  const store = ctx.dashboards;
  const now = today();
  const old = grantId ? store.doc.grants[grantId] : null;
  const g = old ? structuredClone(old) : blankGrant({ from: `${now.slice(0, 7)}-01`, to: `${+now.slice(0, 4) + 1}-${now.slice(5, 7)}-01` });
  const nodes = reportableNodes(ctx.strategy).filter((n) => n.type === 'objective' || n.type === 'goal');
  const field = (label, input) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), input);
  const preview = h('p', { class: 'muted small rt-preview' });
  const showPreview = () => { const ds = Object.values(withDues(g).dues); preview.textContent = g.from && g.to && g.to > g.from ? `${ds.length} report${ds.length === 1 ? '' : 's'}: ${ds.map((x) => short(x.due)).join(', ')}` : 'Pick when the grant starts and ends.'; };
  showPreview();
  const body = h('div', { class: 'rt-form' },
    field('Funder', h('input', { class: 'input input-sm', name: 'rt-funder', value: g.funder, placeholder: 'e.g. The Northern Foundation', oninput: (e) => { g.funder = e.target.value; } })),
    field('What it funds', h('input', { class: 'input input-sm', name: 'rt-title', value: g.title, oninput: (e) => { g.title = e.target.value; } })),
    h('div', { class: 'rt-form-row' },
      field('Amount ($)', h('input', { class: 'input input-sm', type: 'number', min: '0', step: '500', name: 'rt-amount', value: String(g.amount || ''), oninput: (e) => { g.amount = Number(e.target.value) || 0; } })),
      field('Starts', h('input', { class: 'input input-sm', type: 'date', name: 'rt-from', value: g.from, onchange: (e) => { g.from = e.target.value; showPreview(); } })),
      field('Ends', h('input', { class: 'input input-sm', type: 'date', name: 'rt-to', value: g.to, onchange: (e) => { g.to = e.target.value; showPreview(); } }))),
    field('Who looks after it', h('select', { class: 'select select-sm', name: 'rt-owner', onchange: (e) => { g.ownerId = e.target.value || null; } },
      h('option', { value: '' }, 'No one yet'),
      Object.values(ctx.org.staff ?? {}).sort((a, b) => a.name.localeCompare(b.name)).map((p) => h('option', { value: p.id, selected: g.ownerId === p.id }, p.name)))),
    field('Reports', h('select', { class: 'select select-sm', name: 'rt-cadence', onchange: (e) => { g.cadence = e.target.value; showPreview(); } }, CADENCES.map((c) => h('option', { value: c.id, selected: g.cadence === c.id }, c.label)))),
    preview,
    h('div', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'The work it funds'),
      h('div', { class: 'fr-nodes' }, nodes.map((n) => h('label', { class: `fr-node ${n.type}` },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: g.nodeIds.includes(n.id), onchange: (e) => { g.nodeIds = e.target.checked ? [...g.nodeIds, n.id] : g.nodeIds.filter((x) => x !== n.id); } }),
        h('span', { class: 'fr-glyph' }, NODE_TYPES[n.type].glyph), n.title)))));
  const save = () => {
    if (!g.funder.trim()) { toast('Add the funder’s name'); return; }
    if (!(g.from && g.to && g.to > g.from)) { toast('The grant needs to end after it starts'); return; }
    g.funder = g.funder.trim();
    const next = withDues(g);
    if (old) store.apply(col.update('grants', g.id, next)); else store.apply(col.add('grants', next));
    toast(old ? 'Grant saved' : 'Grant added');
    drawer.close();
  };
  const remove = async () => { if (await uiConfirm(`Remove the grant from ${g.funder} and its report schedule? Reports already written stay. You can undo.`)) { store.apply(col.remove('grants', g.id)); drawer.close(); } };
  const drawer = Drawer({ title: old ? g.funder : 'Add a grant', sub: 'Its reporting schedule sets the on-ramp for each report', body, onClose: () => ctx.render(),
    actions: [old && h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: remove }, icon('trash', 14), 'Remove'), h('span', { style: 'flex:1' }), h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: save }, icon('check', 14), old ? 'Save' : 'Add the grant')].filter(Boolean) });
}
