import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { NODE_TYPES, TASK_STATUSES, ancestors, childrenOf, descendants, dateSpan, strategyOps, taskSummary, statusById } from '../platform/strategy.js';
import { teamList } from '../platform/org.js';
import { range, today, short } from './dates.js';
import { Gantt } from './Gantt.js';
import { Timeline } from './Timeline.js';
import { AssetsPanel } from './Assets.js';
import { Lanes, Board } from './Views.js';
import { LevelBadge, levelIcon, PeoplePicker, objectiveHue, LEVELS } from '../ui/strategyLook.js';
import { loadDashboards, saveDoc } from '../platform/docs.js';
import { dashboardFromNode } from '../platform/dashboards.js';
import { uid } from '../core/ops.js';
import { currentUser } from '../platform/session.js';
import { uiConfirm } from '../ui/dialog.js';
import { linkTo, reach } from '../plugins.js';

/** The views each level offers, the first is where it opens. */
export const VIEWS = {
  framework: [['details', 'Details', 'notePencil'], ['lanes', 'Lanes', 'rows']],
  plan: [['lanes', 'Lanes', 'rows'], ['details', 'Details', 'notePencil'], ['gantt', 'Gantt', 'timeline']],
  objective: [['lanes', 'Lanes', 'rows'], ['details', 'Details', 'notePencil'], ['gantt', 'Gantt', 'timeline']],
  goal: [['lanes', 'Lanes', 'rows'], ['details', 'Details', 'notePencil'], ['gantt', 'Gantt', 'timeline']],
  workplan: [['board', 'Board', 'tiles'], ['details', 'Details', 'notePencil'], ['gantt', 'Gantt', 'timeline']],
  task: [['details', 'Task', 'checklist']],
};

/** The selected node, in one of its views. */
export function Detail(ctx) {
  const { store, select } = ctx;
  const doc = store.doc;
  const n = doc.nodes[ctx.selectedId];
  if (!n) return h('p', { class: 'muted' }, 'Choose something on the left.');
  const views = VIEWS[n.type];
  const view = views.some(([id]) => id === ctx.view) ? ctx.view : views[0][0];
  const update = (patch) => store.apply(strategyOps.update(n.id, patch));
  const hue = objectiveHue(doc, n);

  const crumbs = h('nav', { class: 'sw-crumbs', 'aria-label': 'Breadcrumb' },
    ancestors(doc, n.id).map((a) => h('button', { onclick: () => select(a.id), title: a.title }, levelIcon(a.type, 13), h('span', {}, a.title))));
  const s = n.type === 'task' ? null : taskSummary(doc, n.id);
  const span = n.type === 'task' ? null : dateSpan(doc, n.id);
  const head = h('header', { class: 'sw-detail-head', style: `--hue:${hue}` },
    h('div', { class: 'sw-detail-title' },
      LevelBadge(n.type, { long: true }),
      h('input', { class: 'title-input detail-title', name: 'title', value: n.title, 'aria-label': 'Title', onchange: (e) => update({ title: e.target.value }) }),
      s && h('p', { class: 'summary' }, span ? `${range(span.start, span.end)} · ` : '', `${s.total} tasks: ${s.done} done, ${s.active} in progress, ${s.blocked} blocked, ${s.planned} planned`,
        // A plan is planned in the Studio and worked on here: one click between them.
        n.type === 'plan' && h('a', { class: 'sw-studio-link', href: linkTo('studio', `#${n.id}`) }, icon('studio', 13), 'Plan it with your team'))),
    views.length > 1 && h('nav', { class: 'sw-views', 'aria-label': 'Views' }, views.map(([id, label, ic]) =>
      h('a', { href: `#${n.id}/${id}`, class: id === view ? 'on' : '', 'aria-current': id === view ? 'page' : null }, icon(ic, 15), label))));

  let body;
  if (n.type === 'task') body = TaskView(ctx, n);
  else if (view === 'lanes') body = Lanes(ctx, n);
  else if (view === 'board') body = Board(ctx, n);
  else if (view === 'gantt') body = h('section', { class: 'panel gantt-full' }, Gantt(ctx, n.id));
  else body = DetailsView(ctx, n, update);
  return h('div', { class: `detail view-${view}` }, crumbs, head, body);
}

function DetailsView(ctx, n, update) {
  const { store, org } = ctx;
  const doc = store.doc;
  const type = NODE_TYPES[n.type];
  const field = (label, control, wide) => h('label', { class: `field${wide ? ' wide' : ''}` }, h('span', {}, label), control);
  const text = (key, label, opts = {}) =>
    field(label, h(opts.area ? 'textarea' : 'input', { name: key, value: n[key] ?? '', rows: opts.rows ?? 3, placeholder: opts.placeholder ?? '',
      onchange: (e) => update({ [key]: e.target.value }) }), opts.wide);
  const date = (key, label) => field(label, h('input', { type: 'date', name: key, value: n[key] ?? '', onchange: (e) => update({ [key]: e.target.value || null }) }));
  const teams = () => field('Teams', h('div', { class: 'sw-team-pills' }, teamList(org).map((t) => {
    const on = n.teamIds.includes(t.id);
    return h('button', { type: 'button', class: `sw-team${on ? ' on' : ''}`, style: `--c:${t.color ?? '#999'}`, 'aria-pressed': String(on), onclick: () => update({ teamIds: on ? n.teamIds.filter((x) => x !== t.id) : [...n.teamIds, t.id] }) }, t.name);
  })), true);
  const measures = () =>
    field('Measures (feed dashboards in the Data Workbench)', h('div', { class: 'measures' },
      n.measures.map((m, i) =>
        h('div', { class: 'measure' },
          ['name', 'target', 'unit'].map((k) =>
            h('input', { value: m[k] ?? '', placeholder: k === 'name' ? 'Measure' : k[0].toUpperCase() + k.slice(1), class: `m-${k}`,
              onchange: (e) => update({ measures: n.measures.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }) })),
          h('button', { class: 'icon-button', title: 'Remove measure', onclick: () => update({ measures: n.measures.filter((_, j) => j !== i) }) }, '×'))),
      h('button', { class: 'btn btn-sm', onclick: () => update({ measures: [...n.measures, { id: uid('m'), name: '', target: '', unit: '' }] }) }, 'Add measure')), true);
  const milestones = () => field('Milestones (on the roadmap as flags)', h('div', { class: 'measures' },
    (n.milestones ?? []).map((m, i) => h('div', { class: 'measure' },
      h('input', { type: 'date', value: m.date ?? '', class: 'm-date', 'aria-label': 'Date', onchange: (e) => update({ milestones: n.milestones.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) }) }),
      h('input', { value: m.title ?? '', placeholder: 'What happens', class: 'm-name', onchange: (e) => update({ milestones: n.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }) }),
      h('button', { class: 'icon-button', title: 'Remove', onclick: () => update({ milestones: n.milestones.filter((_, j) => j !== i) }) }, '×'))),
    h('button', { class: 'btn btn-sm', onclick: () => update({ milestones: [...(n.milestones ?? []), { id: uid('ms'), date: today(), title: '' }] }) }, 'Add milestone')), true);

  const fields = {
    framework: () => [text('mission', 'Mission', { area: true, wide: true, rows: 2 }), text('vision', 'Vision', { area: true, wide: true, rows: 2 }), text('values', 'Values', { wide: true })],
    plan: () => [date('start', 'Starts'), date('end', 'Ends'), text('theme', 'Theme', { placeholder: 'e.g. Foundations' }), milestones()],
    objective: () => [measures()],
    goal: () => [measures(), milestones()],
    workplan: () => [date('start', 'Starts'), date('end', 'Ends'), teams(), field('Staff', PeoplePicker({ org, selected: n.staffIds, onChange: (ids) => update({ staffIds: ids }), label: 'Staff' }), true)],
  }[n.type];

  const showsGantt = ['plan', 'objective', 'goal', 'workplan'].includes(n.type);
  return h('div', { class: 'sw-details' },
    h('div', { class: 'fields' }, fields(), text('notes', 'Notes', { area: true, wide: true, rows: 3 })),
    h('div', { class: 'detail-actions' },
      type.children.map((c) => h('button', { class: 'btn btn-sm', onclick: () => ctx.addChild(n.id, c) }, icon('plus', 14), `Add ${NODE_TYPES[c].label.toLowerCase()}`)),
      n.parentId && h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: async () => {
        if (await uiConfirm(`Delete “${n.title}” and everything under it? You can undo.`)) {
          ctx.select(n.parentId);
          store.apply(strategyOps.removeNode(doc, n.id));
        }
      } }, icon('trash', 16), 'Delete')),
    showsGantt && h('section', { class: 'panel' }, h('h2', {}, n.type === 'workplan' ? 'Schedule' : 'Workplans under this'), Gantt(ctx, n.id, { compact: true, fullHref: `#${n.id}/gantt` })),
    (n.type === 'objective' || n.type === 'goal') && reach('palette') && DashboardsPanel(ctx, n),
    n.type !== 'framework' && AssetsPanel(ctx, n));
}

/** A task, laid out for the person doing it: status first, then dates and people, the toolbox, and its lifetime. */
function TaskView(ctx, n) {
  const { store, org, select } = ctx;
  const doc = store.doc;
  const update = (patch) => store.apply(strategyOps.update(n.id, patch));
  const wp = doc.nodes[n.parentId];
  const siblings = wp ? descendants(doc, wp.id).filter((t) => t.type === 'task').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order) : [];
  const at = siblings.indexOf(n);
  const prev = siblings[at - 1];
  const next = siblings[at + 1];
  const now = today();
  const late = n.status !== 'done' && n.end && n.end < now;
  return h('div', { class: 'task-view' },
    h('div', { class: 'task-status', role: 'radiogroup', 'aria-label': 'Status' }, TASK_STATUSES.map((s) =>
      h('button', { type: 'button', class: `task-status-btn${n.status === s.id ? ' on' : ''}`, style: `--c:${s.color}`, role: 'radio', 'aria-checked': String(n.status === s.id),
        onclick: () => { if (n.status !== s.id) store.apply(strategyOps.setStatus(doc, n.id, s.id, now)); } }, s.label))),
    h('div', { class: 'task-grid' },
      h('div', { class: 'task-main' },
        h('div', { class: 'task-dates' },
          h('label', {}, h('span', {}, 'Starts'), h('input', { type: 'date', name: 'start', value: n.start ?? '', onchange: (e) => update({ start: e.target.value || null }) })),
          h('span', { class: 'task-arrow' }, '→'),
          h('label', {}, h('span', {}, 'Due'), h('input', { type: 'date', name: 'end', value: n.end ?? '', onchange: (e) => update({ end: e.target.value || null }) })),
          late && h('span', { class: 'task-late' }, icon('warn', 13), `Due ${short(n.end)}`)),
        h('label', { class: 'field wide' }, h('span', {}, 'Notes'), h('textarea', { name: 'notes', rows: 3, placeholder: 'What this task involves, and what done looks like', onchange: (e) => update({ notes: e.target.value }) }, n.notes ?? '')),
        h('section', { class: 'panel' }, h('h2', {}, 'Lifetime'), Timeline(ctx, n)),
        AssetsPanel(ctx, n)),
      h('aside', { class: 'task-side' },
        h('div', { class: 'task-side-block' }, h('h3', {}, 'Assigned to'), PeoplePicker({ org, selected: n.assigneeIds, onChange: (ids) => update({ assigneeIds: ids }), label: 'People' })),
        wp && h('div', { class: 'task-side-block' }, h('h3', {}, 'In the workplan'),
          h('a', { class: 'task-wp', href: `#${wp.id}` }, levelIcon('workplan', 15), h('span', {}, h('strong', {}, wp.title), h('small', { class: 'muted' }, `${at + 1} of ${siblings.length} tasks · ${range(wp.start, wp.end)}`))),
          h('ol', { class: 'task-siblings' }, siblings.map((t) => h('li', { class: t === n ? 'on' : '' },
            h('span', { class: 'dot', style: `background:${statusById[t.status]?.color}` }),
            h('a', { href: `#${t.id}` }, t.title)))),
          h('div', { class: 'task-nav' },
            h('button', { class: 'btn btn-xs', disabled: !prev, onclick: () => select(prev.id) }, icon('chevronLeft', 13), 'Previous'),
            h('button', { class: 'btn btn-xs', disabled: !next, onclick: () => select(next.id) }, 'Next', icon('chevronRight', 13)))),
        h('div', { class: 'task-side-block' },
          h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: async () => {
            if (await uiConfirm(`Delete “${n.title}”? You can undo.`)) { select(n.parentId); store.apply(strategyOps.removeNode(doc, n.id)); }
          } }, icon('trash', 14), 'Delete task')))));
}

/** Dashboards made from this objective or goal, and a button to make one. */
function DashboardsPanel(ctx, n) {
  const doc = loadDashboards();
  const made = Object.values(doc.dashboards).filter((d) => d.sourceNodeId === n.id);
  const create = () => {
    const id = uid('dashboard');
    doc.dashboards[id] = { ...dashboardFromNode(ctx.store.doc, n.id, currentUser(ctx.org)?.id ?? null), id };
    saveDoc('dashboards', doc);
    saveDoc('strategy', ctx.store.doc);
    location.href = linkTo('palette', `#${id}`);
  };
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', {}, 'Dashboards'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: create }, icon('chart', 16), 'Create dashboard')),
    h('p', { class: 'muted' }, n.measures.length
      ? `Makes an accessible dashboard from the ${n.measures.length} measure${n.measures.length > 1 ? 's' : ''} here and below, fed by live program data. You can edit it and publish it to a public site.`
      : 'Add a measure above to put numbers on the dashboard. It will still show the progress of the work.'),
    made.length > 0 && h('ul', { class: 'asset-list' }, made.map((d) =>
      h('li', { class: 'asset' },
        icon('chart', 18),
        h('div', { class: 'asset-text' }, h('a', { href: linkTo('palette', `#${d.id}`) }, d.title), h('small', {}, `${d.widgets.length} widgets`)),
        h('span', { class: `badge ${d.visibility}` }, d.visibility),
        d.siteId && h('a', { href: `site.html?site=${d.siteId}#${d.id}`, target: '_blank' }, 'View on site ↗')))));
}
export { LEVELS, childrenOf, options };
