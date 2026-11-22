import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { measureIndex, NODE_TYPES } from '../platform/strategy.js';
import { WIDGET_TYPES, widget } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';
import { calcMeasure } from '../platform/data.js';
import { SERIES_MAX } from '../charts/widgets.js';
import { applyTheme } from '../platform/themes.js';
import { uiConfirm } from '../ui/dialog.js';

/** Dashboards mini-tool: a gallery of dashboards, or the designer for one (#<id>). */
export function DashboardsTool(ctx) {
  const dash = ctx.dashboards.doc.dashboards[ctx.route];
  return dash ? Editor(ctx, dash) : Gallery(ctx);
}

const siteUrl = (dash) => `site.html?site=${dash.siteId}#${dash.id}`;
const sourceNodes = (strategy) =>
  Object.values(strategy.nodes).filter((n) => (n.type === 'objective' || n.type === 'goal') && n.measures?.length);

/** Who a dashboard is for, from its visibility and its site. */
export function audienceOf(d, sites) {
  const site = sites[d.siteId];
  if (site?.visibility === 'private') return { id: 'members', label: 'Members only', blurb: `For the board and staff, on ${site.name}`, icon: 'lock' };
  if (d.visibility === 'public' && site) return { id: 'public', label: site.visibility === 'unlisted' ? 'Unlisted' : 'Public', blurb: `Live on ${site.name}`, icon: 'globe' };
  return { id: 'staff', label: 'Staff only', blurb: d.visibility === 'public' ? 'Public, but not on a site yet' : 'Inside Dashi only', icon: 'person' };
}

/** A small picture of a dashboard's layout: one block per widget, in its size and kind. */
export function DashThumb(d) {
  return h('div', { class: 'dg-thumb', 'aria-hidden': 'true' },
    h('i', { class: 'dg-thumb-title' }),
    h('div', { class: 'dg-thumb-grid' }, d.widgets.slice(0, 10).map((w) => h('span', { class: `dg-w ${w.size ?? 'wide'} t-${w.type}` }, h('b')))),
    !d.widgets.length && h('span', { class: 'dg-thumb-empty' }, 'Empty'));
}

function Gallery(ctx) {
  const { org } = ctx;
  const list = Object.values(ctx.dashboards.doc.dashboards).sort((a, b) => a.title.localeCompare(b.title));
  const nodes = sourceNodes(ctx.strategy);
  const from = h('select', { class: 'select select-sm w-full', name: 'from-node', 'aria-label': 'Objective or goal' },
    nodes.map((n) => h('option', { value: n.id }, `${NODE_TYPES[n.type].glyph} ${n.title}`)));
  const groups = [
    { id: 'public', title: 'On your public sites', blurb: 'What visitors see.' },
    { id: 'members', title: 'For the board and members', blurb: 'On a members-only portal.' },
    { id: 'staff', title: 'Staff only', blurb: 'Working dashboards, inside Dashi.' },
  ];
  const card = (d) => {
    const aud = audienceOf(d, org.sites);
    const site = org.sites[d.siteId];
    return h('article', { class: `dg-card ${aud.id}` },
      h('a', { class: 'dg-card-shot', href: `#${d.id}`, title: `Design ${d.title}` }, DashThumb(d)),
      h('div', { class: 'dg-card-body' },
        h('a', { class: 'dg-card-title', href: `#${d.id}` }, d.title),
        h('p', {}, d.description || 'No description yet.'),
        h('div', { class: 'dg-card-meta' },
          h('span', { class: `wv-vis ${aud.id === 'members' ? 'private' : aud.id === 'staff' ? 'unlisted' : 'public'}` }, icon(aud.icon, 12), aud.label),
          h('span', { class: 'muted small' }, `${d.widgets.length} widget${d.widgets.length === 1 ? '' : 's'}`)),
        h('div', { class: 'dg-card-foot' },
          h('span', { class: 'muted small' }, aud.blurb),
          h('button', { class: 'btn btn-xs btn-ghost', title: 'Make a private copy', onclick: () => ctx.create(null, { copyOf: d }) }, icon('copy', 12)),
          site && (d.visibility === 'public' || site.visibility === 'private') && h('a', { class: 'btn btn-xs btn-ghost', href: siteUrl(d), target: '_blank', rel: 'noopener', title: 'See it on the site' }, icon('share', 12)),
          h('a', { class: 'btn btn-xs btn-primary', href: `#${d.id}` }, 'Design'))));
  };
  return h('div', { class: 'dg' },
    h('h1', {}, 'Dashboards'),
    h('p', { class: 'lede' }, 'Design dashboards from your strategy and program data: working views for staff, a scorecard for the board, or live numbers on a public site. Everything stays live as the data and the plan move.'),
    h('section', { class: 'dg-start' },
      h('div', { class: 'dg-start-card' },
        h('span', { class: 'dg-start-icon' }, icon('target', 20)),
        h('strong', {}, 'From an objective or goal'),
        h('p', {}, 'A headline number and a chart for every measure on it, then the work.'),
        nodes.length ? [from, h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.create(from.value) }, 'Create')] : h('p', { class: 'muted small' }, 'Add measures to an objective or goal in Plan first.')),
      h('div', { class: 'dg-start-card featured' },
        h('span', { class: 'dg-start-icon board' }, icon('org', 20)),
        h('strong', {}, 'Board dashboard'),
        h('p', {}, 'One page for the board meeting: headline numbers, how they moved, the goal lights, what is next, and what you ask of the board. Goes on the board portal.'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.create(null, { template: 'board' }) }, 'Create')),
      h('div', { class: 'dg-start-card' },
        h('span', { class: 'dg-start-icon road' }, icon('flag', 20)),
        h('strong', {}, 'Strategy scorecard'),
        h('p', {}, 'The road so far, four headline numbers, the goal lights and what is coming up.'),
        h('button', { class: 'btn btn-sm', onclick: () => ctx.create(null, { template: 'scorecard' }) }, 'Create')),
      h('div', { class: 'dg-start-card' },
        h('span', { class: 'dg-start-icon blank' }, icon('plus', 20)),
        h('strong', {}, 'Blank'),
        h('p', {}, 'Start empty and add widgets from your measures and your plan.'),
        h('button', { class: 'btn btn-sm', onclick: () => ctx.create() }, 'Create'))),
    list.length ? groups.map((g) => {
      const mine = list.filter((d) => audienceOf(d, org.sites).id === g.id);
      return mine.length > 0 && h('section', { class: 'dg-group' },
        h('header', {}, h('h2', {}, g.title, h('span', { class: 'dg-count' }, String(mine.length))), h('span', { class: 'muted small' }, g.blurb)),
        h('div', { class: 'dg-grid' }, mine.map(card)));
    }) : h('p', { class: 'empty' }, 'No dashboards yet. Start one above.'));
}

/**
 * The dashboard designer: the dashboard as visitors will see it, in the
 * site's colours, edited in place. Click the title or description to type;
 * click a widget to choose what it shows; drag widgets to reorder them; add
 * widgets from the Add panel, straight from your measures.
 */
function Editor(ctx, dash) {
  const { dashboards, org } = ctx;
  ctx.selectedWidget = dash.widgets.some((w) => w.id === ctx.selectedWidget) ? ctx.selectedWidget : null;
  const update = (patch) => dashboards.apply(col.update('dashboards', dash.id, patch));
  const setWidget = (id, patch) => update({ widgets: dash.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const select = (id) => { ctx.selectedWidget = id; ctx.render(); };
  const add = (w) => { update({ widgets: [...dash.widgets, w] }); select(w.id); };
  // Strategy measures, then calculated ones (Program data).
  const measures = [...Object.values(measureIndex(ctx.strategy)), ...Object.values(ctx.data.doc.calcs ?? {}).map(calcMeasure)];
  const nodes = Object.values(ctx.strategy.nodes).filter((n) => ['plan', 'objective', 'goal', 'workplan'].includes(n.type));
  const onlyPlans = Object.values(ctx.strategy.nodes).filter((n) => n.type === 'plan');
  // Plans sit side by side; with more than one, a widget can also span them all.
  const root = Object.values(ctx.strategy.nodes).find((n) => n.type === 'framework');
  const plans = onlyPlans.length > 1 && root ? [{ ...root, title: 'All plans, end to end' }, ...onlyPlans] : onlyPlans;
  const sites = Object.values(org.sites);
  const site = org.sites[dash.siteId];
  const live = dash.visibility === 'public' && site && site.visibility !== 'private';

  // Editable in place: the title and description.
  const inline = (tag, cls, value, placeholder, onchange) => {
    const el = h(tag, { class: `dd-inline ${cls}`, contentEditable: 'plaintext-only', spellcheck: true, 'data-placeholder': placeholder, title: 'Click to edit' }, value ?? '');
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    el.addEventListener('blur', () => { const v = el.textContent.trim(); if (v !== (value ?? '')) onchange(v); });
    return el;
  };

  // Each widget: click to select, drag to reorder, a small bar of quick actions.
  let dragId = null;
  const decorate = (w, el) => {
    const i = dash.widgets.indexOf(w);
    el.classList.add('dd-widget');
    el.classList.toggle('dd-selected', w.id === ctx.selectedWidget);
    el.draggable = true;
    el.tabIndex = 0;
    el.addEventListener('click', (e) => { if (!e.target.closest('.dd-bar, a, button')) select(w.id); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) select(w.id); });
    el.addEventListener('dragstart', (e) => { dragId = w.id; e.dataTransfer.effectAllowed = 'move'; el.classList.add('dd-dragging'); });
    el.addEventListener('dragend', () => { dragId = null; el.classList.remove('dd-dragging'); });
    el.addEventListener('dragover', (e) => { if (dragId && dragId !== w.id) { e.preventDefault(); el.classList.add('dd-drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('dd-drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dd-drop');
      if (!dragId || dragId === w.id) return;
      const widgets = dash.widgets.filter((x) => x.id !== dragId);
      widgets.splice(widgets.findIndex((x) => x.id === w.id), 0, dash.widgets.find((x) => x.id === dragId));
      update({ widgets });
    });
    const sizes = ['small', 'wide', 'full'];
    el.append(h('div', { class: 'dd-bar' },
      h('span', { class: 'dd-grip', title: 'Drag to move', 'aria-hidden': 'true' }, '⋮⋮'),
      h('button', { type: 'button', title: 'Change what it shows', onclick: () => select(w.id) }, icon('settings', 14)),
      h('button', { type: 'button', title: `Size: ${w.size ?? 'wide'} (click for the next size)`, onclick: () => setWidget(w.id, { size: sizes[(sizes.indexOf(w.size ?? 'wide') + 1) % 3] }) }, '⇔'),
      h('button', { type: 'button', title: 'Move earlier', disabled: i === 0, onclick: () => { const ws = [...dash.widgets]; ws.splice(i - 1, 0, ws.splice(i, 1)[0]); update({ widgets: ws }); } }, '←'),
      h('button', { type: 'button', title: 'Move later', disabled: i === dash.widgets.length - 1, onclick: () => { const ws = [...dash.widgets]; ws.splice(i + 1, 0, ws.splice(i, 1)[0]); update({ widgets: ws }); } }, '→'),
      h('button', { type: 'button', title: 'Remove', class: 'dd-del', onclick: () => update({ widgets: dash.widgets.filter((x) => x.id !== w.id) }) }, '×')));
    return el;
  };

  const preview = DashboardView({ ...dash, title: '', description: '' }, { strategy: ctx.strategy, data: ctx.data.doc }, { decorate });
  preview.querySelector('.dashboard-head')?.remove();
  const canvas = h('div', { class: 'dd-canvas site-page' },
    h('div', { class: 'dd-site-bar', 'aria-hidden': 'true' }, h('span', { class: 'dd-dot' }), h('span', { class: 'dd-dot' }), h('span', { class: 'dd-dot' }),
      h('span', { class: 'dd-url' }, site ? `${site.url ?? site.name}` : 'Not on a site yet')),
    h('div', { class: 'dd-page' },
      h('header', { class: 'dashboard-head dd-head' },
        inline('h2', 'dd-title', dash.title, 'Name this dashboard', (v) => update({ title: v || 'Untitled dashboard' })),
        inline('p', 'dd-desc', dash.description, 'Add a sentence about what this shows and why it matters', (v) => update({ description: v }))),
      dash.widgets.length ? preview : h('div', { class: 'dd-empty' }, h('p', {}, 'This dashboard is empty.'), h('p', { class: 'muted' }, 'Add numbers and charts from the panel on the right: pick a measure and how to show it.'))));
  applyTheme(canvas, org.theme);
  canvas.addEventListener('click', (e) => { if (e.target === canvas || e.target.classList.contains('dd-page')) select(null); });

  return h('div', { class: 'dd' },
    h('div', { class: 'dd-top' },
      h('a', { class: 'btn btn-sm btn-ghost', href: '#dashboards' }, '← All dashboards'),
      h('span', { class: `dd-status ${live ? 'on' : ''}` }, live ? `Public on ${site.name}` : dash.visibility === 'public' ? 'Public, but not on a public site' : 'Private: staff and board only'),
      h('span', { class: 'spacer' }),
      h('label', { class: 'dd-field' }, 'Site', h('select', { class: 'select select-sm', name: 'siteId', onchange: (e) => update({ siteId: e.target.value || null }) },
        h('option', { value: '' }, 'No site'), options(sites.map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), dash.siteId))),
      dash.visibility === 'public'
        ? h('button', { class: 'btn btn-sm', onclick: () => update({ visibility: 'private' }) }, 'Make private')
        : h('button', { class: 'btn btn-sm btn-primary', disabled: !site, title: site ? '' : 'Choose a site first', onclick: () => update({ visibility: 'public' }) }, 'Publish'),
      site && h('a', { href: siteUrl(dash), target: '_blank', class: 'btn btn-sm btn-ghost' }, 'View ↗'),
      h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Delete this dashboard', 'aria-label': 'Delete this dashboard', onclick: async () => {
        if (!await uiConfirm(`Delete “${dash.title}”? You can undo.`)) return;
        ctx.go('dashboards');
        dashboards.apply(col.remove('dashboards', dash.id));
      } }, icon('trash', 16))),
    h('div', { class: 'dd-body' },
      canvas,
      h('aside', { class: 'dd-panel' }, ctx.selectedWidget
        ? WidgetPanel(ctx, dash.widgets.find((w) => w.id === ctx.selectedWidget), { measures, nodes, plans, setWidget, close: () => select(null), remove: (id) => { update({ widgets: dash.widgets.filter((x) => x.id !== id) }); select(null); } })
        : AddPanel(ctx, dash, { measures, add }))));
}

/** Add widgets: straight from a measure, or by kind. */
function AddPanel(ctx, dash, { measures, add }) {
  const q = h('input', { class: 'input input-sm w-full', name: 'dd-search', placeholder: 'Find a measure', value: ctx.ddSearch ?? '' });
  const list = h('div', { class: 'dd-measures' });
  const draw = () => {
    ctx.ddSearch = q.value;
    const term = q.value.trim().toLowerCase();
    const shown = measures.filter((m) => !term || `${m.name} ${m.nodeTitle}`.toLowerCase().includes(term));
    const groups = {};
    for (const m of shown) (groups[m.nodeTitle] ??= []).push(m);
    const inUse = new Set(dash.widgets.flatMap((w) => [w.measureId, ...(w.measureIds ?? [])]).filter(Boolean));
    list.replaceChildren(...Object.entries(groups).map(([title, ms]) => h('div', { class: 'dd-group' },
      h('h4', {}, title),
      ms.map((m) => h('div', { class: `dd-measure${inUse.has(m.id) ? ' used' : ''}` },
        h('span', { class: 'dd-measure-name', title: inUse.has(m.id) ? 'Already on this dashboard' : '' }, m.name, inUse.has(m.id) && h('small', {}, ' ✓')),
        h('span', { class: 'dd-measure-add' },
          h('button', { type: 'button', title: 'Add as a headline number', onclick: () => add(widget('kpi', { measureId: m.id })) }, '123'),
          h('button', { type: 'button', title: 'Add as a line over time', onclick: () => add(widget('line', { measureId: m.id })) }, '⟋'),
          h('button', { type: 'button', title: 'Add as monthly columns', onclick: () => add(widget('bar', { measureId: m.id })) }, '▮▮')))))));
    if (!shown.length) list.replaceChildren(h('p', { class: 'muted small' }, measures.length ? 'No measures match.' : 'Add measures to objectives and goals in Plan.'));
  };
  q.addEventListener('input', draw);
  draw();
  return h('div', {},
    h('h3', {}, 'Add to the dashboard'),
    h('div', { class: 'dd-kinds' }, WIDGET_TYPES.map((t) => h('button', { type: 'button', class: 'dd-kind', onclick: () => {
      const first = { measure: { measureId: measures[0]?.id }, measures: { measureIds: measures.slice(0, 2).map((m) => m.id) }, node: { nodeId: dash.sourceNodeId ?? Object.values(ctx.strategy.nodes).find((n) => n.type === 'objective')?.id }, plan: { nodeId: planFor(ctx, dash) }, null: { title: 'Heading', text: 'Say what this shows and why it matters.' } };
      add(widget(t.id, first[t.needs]));
    } }, h('span', { class: `dd-kind-icon k-${t.id}`, 'aria-hidden': 'true' }), t.label))),
    h('h3', {}, 'From your strategy'),
    h('p', { class: 'muted small' }, 'Show where the plan stands, live from Plan: the road, the goals’ lights, what is coming up.'),
    h('div', { class: 'dd-strategic' },
      [['road', 'The road so far', 'Lights passed and ahead, milestones, today', { nodeId: planFor(ctx, dash) }],
        ['lights', 'Goal lights', 'A light per workplan, goal by goal', { nodeId: dash.sourceNodeId ?? planFor(ctx, dash) }],
        ['milestones', 'Next milestones', 'The next five, nearest first', { nodeId: dash.sourceNodeId ?? planFor(ctx, dash) }],
        ['progress', 'Work progress', 'Tasks by status', { nodeId: dash.sourceNodeId ?? planFor(ctx, dash) }]].map(([type, label, blurb, more]) =>
        h('button', { type: 'button', class: 'dd-strat', onclick: () => add(widget(type, more)) }, h('span', { class: `dd-kind-icon k-${type}`, 'aria-hidden': 'true' }), h('span', {}, h('strong', {}, label), h('small', {}, blurb))))),
    h('h3', {}, 'From your measures'),
    h('p', { class: 'muted small' }, 'Add a measure as a number, a line or columns.'),
    q, list);
}

/** The plan a strategic widget starts on: the dashboard's own, else the longest plan holding today. */
function planFor(ctx, dash) {
  const nodes = ctx.strategy.nodes;
  let n = nodes[dash.sourceNodeId];
  while (n && n.type !== 'plan') n = nodes[n.parentId];
  if (n) return n.id;
  const now = new Date().toISOString().slice(0, 10);
  const plans = Object.values(nodes).filter((x) => x.type === 'plan');
  return (plans.filter((p) => p.start && p.end && p.start <= now && now <= p.end).sort((a, b) => (b.end > a.end ? 1 : -1))[0] ?? plans[0])?.id;
}

/** Settings for the selected widget. */
function WidgetPanel(ctx, w, { measures, nodes, plans, setWidget, close, remove }) {
  const type = WIDGET_TYPES.find((t) => t.id === w.type);
  const field = (label, control) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), control);
  const groups = {};
  for (const m of measures) (groups[m.nodeTitle] ??= []).push(m);
  const measureSelect = (value, onchange, name) => h('select', { class: 'select select-sm w-full', name, onchange },
    !value && h('option', { value: '' }, 'Choose a measure…'),
    Object.entries(groups).map(([title, ms]) => h('optgroup', { label: title }, options(ms.map((m) => ({ id: m.id, label: m.name })), value))));
  const on = new Set(w.measureIds ?? []);
  return h('div', {},
    h('div', { class: 'dd-panel-head' }, h('h3', {}, type?.label ?? w.type), h('button', { class: 'btn btn-xs btn-ghost', onclick: close }, 'Done')),
    field('Show it as', h('select', { class: 'select select-sm w-full', name: 'dd-type', onchange: (e) => {
      const next = WIDGET_TYPES.find((t) => t.id === e.target.value);
      const patch = { type: next.id, size: next.size };
      if (next.needs === 'measures' && !w.measureIds) patch.measureIds = [w.measureId ?? measures[0]?.id].filter(Boolean);
      if (next.needs === 'measure' && !w.measureId) patch.measureId = w.measureIds?.[0] ?? measures[0]?.id;
      if (next.needs === 'node' && !w.nodeId) patch.nodeId = nodes[0]?.id;
      if (next.needs === 'plan' && !plans.some((p) => p.id === w.nodeId)) patch.nodeId = plans[0]?.id;
      setWidget(w.id, patch);
    } }, options(WIDGET_TYPES.map((t) => ({ id: t.id, label: t.label })), w.type))),
    type?.needs === 'measure' && field('Measure', measureSelect(w.measureId, (e) => setWidget(w.id, { measureId: e.target.value }), 'dd-measure')),
    type?.needs === 'measures' && h('fieldset', { class: 'fieldset' }, h('legend', { class: 'fieldset-legend' }, `Measures to compare (up to ${SERIES_MAX})`),
      h('div', { class: 'dd-checks' }, measures.map((m) => h('label', {},
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: on.has(m.id), disabled: !on.has(m.id) && on.size >= SERIES_MAX,
          onchange: (e) => setWidget(w.id, { measureIds: e.target.checked ? [...on, m.id] : [...on].filter((id) => id !== m.id) }) }), m.name)))),
    type?.needs === 'node' && field('Work under', h('select', { class: 'select select-sm w-full', name: 'dd-node', onchange: (e) => setWidget(w.id, { nodeId: e.target.value }) },
      nodes.map((n) => h('option', { value: n.id, selected: n.id === w.nodeId }, `${NODE_TYPES[n.type].glyph} ${n.title}`)))),
    type?.needs === 'plan' && field('Plan', h('select', { class: 'select select-sm w-full', name: 'dd-plan', onchange: (e) => setWidget(w.id, { nodeId: e.target.value }) },
      plans.map((n) => h('option', { value: n.id, selected: n.id === w.nodeId }, n.title)))),
    type?.needs === 'plan' && h('p', { class: 'muted small' }, 'Visitors see the road: lights passed and ahead, milestones and today. Titles stay out of it; the table view lists the goals.'),
    field('Title (leave empty for the measure’s name)', h('input', { class: 'input input-sm w-full', name: 'dd-title', value: w.title ?? '', onchange: (e) => setWidget(w.id, { title: e.target.value || undefined }) })),
    w.type === 'text' && field('Text', h('textarea', { class: 'textarea textarea-sm w-full', rows: 4, name: 'dd-text', onchange: (e) => setWidget(w.id, { text: e.target.value }) }, w.text ?? '')),
    field('Size', h('div', { class: 'join' }, [['small', 'Small'], ['wide', 'Wide'], ['full', 'Full width']].map(([id, label]) =>
      h('button', { type: 'button', class: `btn btn-sm join-item${(w.size ?? 'wide') === id ? ' btn-active' : ''}`, onclick: () => setWidget(w.id, { size: id }) }, label)))),
    h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: () => remove(w.id) }, icon('trash', 14), 'Remove this widget'));
}
