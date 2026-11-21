import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { rootOf, childrenOf, descendants, taskSummary, measureIndex, TASK_STATUSES } from '../platform/strategy.js';
import { workplanProgress, PROGRESS_STATES, strategyCounts, LIGHTS, lightOf } from '../platform/strategyReports.js';
import { NODE_TYPES, statusById } from '../platform/strategy.js';
import { Sunburst, tint } from '../ui/Sunburst.js';
import { LevelBadge, ProgressRing, AvatarStack, objectiveOrder, peopleOf, objectiveHue } from '../ui/strategyLook.js';
import { RoadSvg, currentPlan } from './Road.js';
import { range, short, today, daysBetween } from './dates.js';

/**
 * The landing page: purpose first (mission, vision, values), then where we
 * are (a thumbnail of the road, how much is done), then the objectives as
 * cards, each with its goals and how their workplans are doing, then the
 * plans on a time bar.
 */
export function Overview(ctx) {
  const doc = ctx.store.doc;
  const root = rootOf(doc);
  if (!root) return h('p', { class: 'empty' }, 'No strategy yet.');
  const now = today();
  const counts = strategyCounts(doc);
  const tasks = taskSummary(doc, root.id);
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
  // The thumbnail follows the plan we are in now.
  const topPlan = currentPlan(doc, now);
  const workplans = Object.values(doc.nodes).filter((n) => n.type === 'workplan');
  const states = workplans.map((w) => workplanProgress(doc, w.id, now).state);
  const onTrack = states.filter((s) => s === 'complete' || s === 'on-track').length;
  const behind = states.filter((s) => s === 'behind').length;

  const road = topPlan ? RoadSvg(doc, topPlan.id, { compact: true }) : null;

  return h('div', { class: 'sw-landing' },
    h('div', { class: 'sw-now' },
      h('a', { class: 'sw-card sw-road-card', href: '#roadmap', title: topPlan ? `The road for ${topPlan.title}` : null },
        h('div', { class: 'sw-card-head' }, h('h3', {}, icon('mapTrifold', 16), 'The road so far'), h('span', { class: 'small sw-more' }, 'Open the roadmap →')),
        road ? road.el : h('p', { class: 'muted' }, 'Give workplans dates to draw the road.'),
        h('p', { class: 'muted small' }, `${onTrack} of ${workplans.length} workplans on track${behind ? `, ${behind} behind` : ''}. Today is ${short(now)}.`)),
      h('div', { class: 'sw-card sw-progress-card' },
        h('div', { class: 'sw-card-head' }, h('h3', {}, icon('gauge', 16), 'Work done')),
        h('div', { class: 'sw-progress' },
          ProgressRing(tasks.total ? tasks.done / tasks.total : 0, { size: 92, stroke: 9, label: `${tasks.done} of ${tasks.total} tasks done` }),
          h('div', { class: 'sw-status-bars' },
            TASK_STATUSES.map((s) => h('div', { class: 'sw-status-row' },
              h('span', { class: 'sw-dot', style: `background:${s.color}` }), h('span', {}, s.label), h('strong', {}, String(tasks[s.id] ?? 0)),
              h('span', { class: 'sw-bar' }, h('i', { style: `width:${tasks.total ? ((tasks[s.id] ?? 0) / tasks.total) * 100 : 0}%;background:${s.color}` })))))),
        h('ul', { class: 'sw-counts' },
          [['plan', counts.plan], ['objective', counts.objective], ['goal', counts.goal], ['workplan', counts.workplan]].map(([t, c]) => h('li', {}, h('strong', {}, String(c)), LevelBadge(t, { plain: true }))),
          h('li', {}, h('strong', {}, String(Object.keys(measureIndex(doc)).length)), h('span', { class: 'muted small' }, 'measures'))))),

    // The whole framework under it (0.2): mission and vision live in the Framework now.
    WholeSunburst(ctx, root, now),
    h('div', { class: 'sw-section-head' }, h('h2', {}, 'Objectives and goals'), h('a', { class: 'small', href: '#framework' }, 'Open the framework →')),
    h('div', { class: 'sw-objectives' }, objectiveOrder(doc).map(({ node: o, hue }) => ObjectiveCard(ctx, o, hue, now))),

    h('div', { class: 'sw-section-head' }, h('h2', {}, 'Plans')),
    h('div', { class: 'sw-plans' }, plans.map((p) => PlanBar(doc, p, now))));
}

function ObjectiveCard(ctx, o, hue, now) {
  const doc = ctx.store.doc;
  const goals = childrenOf(doc, o.id).filter((n) => n.type === 'goal');
  const s = taskSummary(doc, o.id);
  const plan = doc.nodes[o.parentId];
  return h('article', { class: 'sw-obj', style: `--hue:${hue}` },
    h('header', {},
      h('div', {}, h('a', { class: 'sw-obj-title', href: `#${o.id}` }, o.title), plan && h('small', { class: 'muted' }, plan.title)),
      ProgressRing(s.total ? s.done / s.total : 0, { size: 40, color: hue, label: `${s.done} of ${s.total} tasks done` })),
    h('ul', { class: 'sw-goals' }, goals.map((g) => {
      const wps = descendants(doc, g.id).filter((n) => n.type === 'workplan');
      const gs = taskSummary(doc, g.id);
      return h('li', {},
        h('a', { href: `#${g.id}`, class: 'sw-goal-title' }, g.title),
        h('div', { class: 'sw-goal-meta' },
          h('span', { class: 'sw-bar' }, h('i', { style: `width:${gs.total ? (gs.done / gs.total) * 100 : 0}%;background:${hue}` })),
          h('span', { class: 'muted small' }, `${gs.done}/${gs.total}`),
          h('span', { class: 'sw-wp-lights' }, wps.map((w) => { const st = workplanProgress(doc, w.id, now).state; return h('a', { href: `#${w.id}`, class: `sw-wp-light l-${PROGRESS_STATES[st].light}`, title: `${w.title}: ${PROGRESS_STATES[st].label}` }); }))));
    })),
    h('footer', {}, AvatarStack(peopleOf(doc, ctx.org, o), { max: 6, size: 22 }), h('span', { class: 'muted small' }, `${o.measures?.length ?? 0} measure${o.measures?.length === 1 ? '' : 's'}`)));
}

function PlanBar(doc, p, now) {
  const total = p.start && p.end ? Math.max(1, daysBetween(p.start, p.end)) : 1;
  const gone = p.start ? Math.max(0, Math.min(1, daysBetween(p.start, now) / total)) : 0;
  const s = taskSummary(doc, p.id);
  return h('a', { class: 'sw-plan', href: `#${p.id}` },
    h('div', { class: 'sw-plan-text' }, LevelBadge('plan', { plain: true }), h('strong', {}, p.title), h('span', { class: 'muted small' }, `${range(p.start, p.end)}${p.theme ? ` · ${p.theme}` : ''}`)),
    h('div', { class: 'sw-plan-time', title: `${Math.round(gone * 100)}% of the way through its dates` },
      h('i', { style: `width:${gone * 100}%` }),
      h('b', { style: `left:${gone * 100}%` })),
    h('span', { class: 'muted small sw-plan-done' }, `${s.done}/${s.total} tasks`));
}

/**
 * The whole framework as a zoomable sunburst: plans, then objectives,
 * goals, workplans and tasks, each sized by its tasks and coloured by its
 * objective, a step lighter each level down (never washed out). A
 * workplan's outline is its traffic light; drafts from the theory of change
 * are striped. Beside it, a details panel: what's in the middle, or what
 * the pointer is on, with its progress; click a task to keep it there.
 */
let sunPath = [];      // where the framework sunburst is zoomed, kept across redraws
let sunPinned = null;  // a task picked in it
function WholeSunburst(ctx, root, now) {
  const doc = ctx.shown ? ctx.shown(ctx.store.doc) : ctx.store.doc;
  const toData = (n) => {
    const kids = childrenOf(doc, n.id);
    return kids.length ? { name: n.title || NODE_TYPES[n.type].label, id: n.id, children: kids.map(toData) } : { name: n.title || 'Untitled', id: n.id, value: 1 };
  };
  const data = toData(root);
  if (!data.children?.length) return null;
  const isDraft = (n) => { for (let p = n; p; p = doc.nodes[p.parentId]) if (p.draft) return true; return false; };
  const STEP = { objective: 0, goal: 0.14, workplan: 0.26, task: 0.38 };
  const lightOfWp = (n) => LIGHTS[PROGRESS_STATES[workplanProgress(doc, n.id, now).state].light];
  let centre = doc.nodes[data.id];
  const findByPath = () => { let n = root; for (const name of sunPath) { const k = childrenOf(doc, n.id).find((c) => (c.title || NODE_TYPES[c.type].label) === name); if (!k) break; n = k; } return n; };
  centre = findByPath();
  if (sunPinned && !doc.nodes[sunPinned]) sunPinned = null;

  const panel = h('aside', { class: 'sw-sb-panel', 'aria-live': 'polite' });
  const show = (n, { hovering = false } = {}) => n && panel.style.setProperty('--sb-hue', n.type === 'framework' || n.type === 'plan' ? '#4f566b' : objectiveHue(doc, n)) !== 0 && panel.replaceChildren(...Details(ctx, n, now, { hovering, isDraft, lightOfWp, pinned: n.id === sunPinned, unpin: () => { sunPinned = null; show(centre); } }));
  show(sunPinned ? doc.nodes[sunPinned] : centre);

  const objectives = objectiveOrder(doc);
  return h('section', { class: 'sw-card sw-sunburst-card' },
    h('div', { class: 'sw-card-head' }, h('h3', {}, icon('target', 16), 'The whole framework'),
      h('span', { class: 'muted small' }, 'Click a ring to zoom in, the centre to step out. Point at anything for its details; click a task to keep it there.')),
    h('div', { class: 'sw-sunburst-body' },
      h('div', { class: 'sw-sb-chart' },
        Sunburst({
          data, size: 480, caption: root.title || 'Framework', label: 'The framework as a sunburst, from plans to tasks',
          focus: sunPath,
          onZoom: (path, d) => { sunPath = path; centre = doc.nodes[d.id] ?? root; sunPinned = null; show(centre); },
          onHover: (d) => { if (d) show(doc.nodes[d.id], { hovering: true }); else show(sunPinned ? doc.nodes[sunPinned] : centre); },
          tip: (d) => { const n = doc.nodes[d.data.id]; return `${NODE_TYPES[n?.type]?.label ?? ''}${d.children ? ` · ${d.value} task${d.value === 1 ? '' : 's'}` : n?.type === 'task' ? ` · ${statusById[n.status]?.label ?? ''}` : ''}${n?.draft ? ' · draft' : ''}`; },
          color: (d) => {
            const n = doc.nodes[d.data.id];
            if (!n) return '#8a90a0';
            if (n.type === 'plan') return '#4f566b';
            return tint(objectiveHue(doc, n), STEP[n.type] ?? 0);
          },
          edge: (d) => { const n = doc.nodes[d.data.id]; return n?.type === 'workplan' ? lightOfWp(n).color : null; },
          hatched: (d) => isDraft(doc.nodes[d.data.id]),
          onLeaf: (leaf) => { sunPinned = leaf.id; show(doc.nodes[leaf.id]); },
        })),
      h('div', { class: 'sw-sb-side' },
        panel,
        h('ul', { class: 'sw-sunburst-key' },
          h('li', {}, h('i', { style: 'background:#4f566b' }), 'Plans'),
          objectives.slice(0, 8).map(({ node, hue }) => h('li', { title: node.title }, h('i', { style: `background:${hue}` }), h('span', {}, node.title))),
          h('li', { class: 'muted' }, h('i', { class: 'edge' }), 'Outline: the workplan’s traffic light'),
          h('li', { class: 'muted' }, h('i', { class: 'hatch' }), 'Striped: a draft')))));
}

/** The details panel's contents for one item. */
function Details(ctx, n, now, { hovering, isDraft, lightOfWp, pinned, unpin }) {
  if (!n) return [];
  const doc = ctx.store.doc;
  const path = [];
  for (let p = doc.nodes[n.parentId]; p && p.type !== 'framework'; p = doc.nodes[p.parentId]) path.unshift(p);
  const hue = n.type === 'framework' || n.type === 'plan' ? '#4f566b' : objectiveHue(doc, n);
  const out = [
    h('div', { class: 'sw-sb-top', style: `--hue:${hue}` },
      LevelBadge(n.type, { long: true }),
      hovering ? h('span', { class: 'muted small' }, 'Pointing at') : pinned ? h('button', { class: 'btn btn-ghost btn-xs', onclick: unpin }, icon('close', 12), 'Unpin') : h('span', { class: 'muted small' }, 'In the middle')),
    h('h4', { class: 'sw-sb-title', style: `--hue:${hue}` }, n.title || 'Untitled'),
    path.length > 0 && h('p', { class: 'sw-sb-path' }, path.map((p) => p.title).join(' › ')),
    isDraft(n) && h('p', { class: 'sw-tray-draft' }, 'A draft from the theory of change: accept or discard it in the framework.'),
  ];
  if (n.type === 'task') {
    const st = statusById[n.status];
    out.push(h('p', { class: 'sw-sb-status' }, h('span', { class: 'sw-dot', style: `background:${st?.color}` }), st?.label ?? '', h('span', { class: 'muted' }, ` · ${LIGHTS[lightOf(n)].label}`)),
      (n.start || n.end) && h('p', { class: 'muted small' }, range(n.start, n.end)),
      n.notes && h('p', { class: 'sw-sb-notes' }, n.notes.length > 220 ? `${n.notes.slice(0, 219)}…` : n.notes));
  } else {
    const s = taskSummary(doc, n.id);
    const kids = descendants(doc, n.id);
    const count = (t) => kids.filter((k) => k.type === t).length;
    out.push(
      h('div', { class: 'sw-sb-bar', role: 'img', 'aria-label': `${s.done} of ${s.total} tasks done` },
        TASK_STATUSES.map((t) => s[t.id] ? h('i', { style: `flex:${s[t.id]};background:${t.color}`, title: `${t.label}: ${s[t.id]}` }) : null)),
      h('ul', { class: 'sw-sb-stats' },
        TASK_STATUSES.map((t) => h('li', {}, h('span', { class: 'sw-dot', style: `background:${t.color}` }), h('strong', {}, String(s[t.id] ?? 0)), h('span', {}, t.label)))),
      h('p', { class: 'muted small' }, [['objective', 'objectives'], ['goal', 'goals'], ['workplan', 'workplans']].map(([t, w]) => count(t) ? `${count(t)} ${count(t) === 1 ? t : w}` : null).filter(Boolean).join(' · ') || `${s.total} tasks`),
      n.type === 'workplan' && h('p', { class: 'sw-sb-status' }, h('span', { class: 'sw-dot', style: `background:${lightOfWp(n).color}` }), PROGRESS_STATES[workplanProgress(doc, n.id, now).state].label),
      n.measures?.length > 0 && h('p', { class: 'muted small' }, `Measures: ${n.measures.map((m) => m.name).join(', ')}`));
  }
  out.push(h('a', { class: 'btn btn-sm sw-sb-open', href: `#${n.id}` }, `Open the ${NODE_TYPES[n.type].label.toLowerCase()}`, icon('chevronRight', 13)));
  return out.filter(Boolean);
}
