import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { rootOf, childrenOf, descendants, taskSummary, measureIndex, TASK_STATUSES } from '../platform/strategy.js';
import { workplanProgress, PROGRESS_STATES, strategyCounts } from '../platform/strategyReports.js';
import { LevelBadge, ProgressRing, AvatarStack, objectiveOrder, peopleOf } from '../ui/strategyLook.js';
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
  const statement = (label, ic, text) => text && h('div', { class: 'sw-statement' }, h('span', { class: 'sw-statement-ico' }, icon(ic, 18)), h('div', {}, h('span', {}, label), h('p', {}, text)));

  const road = topPlan ? RoadSvg(doc, topPlan.id, { compact: true }) : null;

  return h('div', { class: 'sw-landing' },
    h('section', { class: 'sw-hero' },
      h('div', { class: 'sw-hero-head' }, LevelBadge('framework', { long: true }), h('h2', {}, root.title || 'Strategic framework'),
        h('a', { class: 'btn btn-sm btn-ghost', href: `#${root.id}` }, icon('pencil', 14), 'Edit')),
      h('div', { class: 'sw-statements' },
        statement('Mission', 'target', root.mission),
        statement('Vision', 'eye', root.vision),
        statement('Values', 'heart', root.values))),

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
