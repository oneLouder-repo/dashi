import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { measureIndex, descendants } from '../platform/strategy.js';
import { ofPlan } from '../platform/studio.js';
import { uiConfirm } from '../ui/dialog.js';
import { Drawer } from '../ui/drawer.js';
import { LevelBadge, LEVELS } from '../ui/strategyLook.js';

/**
 * Results: the plan's monitoring and evaluation framework (reworked in
 * 0.2, PR 10). Results are listed under the part of the plan they come
 * from, at any level: the plan itself, an objective, a goal, a workplan or
 * a single task (a task's own result, say "600 instructors trained").
 * Each row reads at a glance: the result, what is counted, baseline to
 * target, how often and where the number comes from. Click a row to edit
 * it in the side drawer. A result can use a measure in Plan for
 * its live data, and on the Assemble canvas a result wired into a goal
 * becomes that goal's measure.
 *
 *   result: { …, nodeId, taskId }   where it comes from: nodeId is any plan
 *   item (taskId is kept for results seeded from a task, and read as nodeId).
 */
const FREQ = ['Monthly', 'Quarterly', 'Twice a year', 'Yearly', 'At the end'].map((x) => ({ id: x, label: x }));

/** Where a result comes from: its plan item, or the plan. */
const sourceOf = (r, plan, nodes) => nodes[r.nodeId] ?? nodes[r.taskId] ?? plan;

export function Results(ctx, plan) {
  const results = ofPlan(ctx.doc, 'results', plan.id);
  const rCards = ofPlan(ctx.doc, 'cards', plan.id).filter((c) => c.quadrant === 'r');
  const waiting = rCards.filter((c) => !results.some((r) => r.cardId === c.id));
  const measures = Object.values(measureIndex(ctx.strategy.doc));
  const nodes = ctx.strategy.doc.nodes;
  const tree = [plan, ...descendants(ctx.strategy.doc, plan.id)];
  const make = (card, nodeId = null) => {
    const op = ctx.add('results', {
      planId: plan.id, cardId: card?.id ?? null, title: card?.text ?? 'New result', indicator: '', baseline: '', target: '', unit: '',
      source: '', frequency: 'Quarterly', measureId: null, nodeId, x: 0, y: 0, w: 4, h: 5,
    });
    const id = op?.id ?? Object.values(ctx.doc.results).filter((r) => r.planId === plan.id).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0]?.id;
    if (id) openResult(ctx, plan, id, measures, tree);
  };

  // Group by the objective each result sits under (results on the plan itself first).
  const objectiveOf = (n) => { let x = n; while (x && x.type !== 'objective' && x.parentId) x = nodes[x.parentId]; return x?.type === 'objective' ? x : null; };
  const groups = new Map([[plan.id, { head: plan, rows: [] }]]);
  for (const o of tree.filter((n) => n.type === 'objective')) groups.set(o.id, { head: o, rows: [] });
  for (const r of results) {
    const src = sourceOf(r, plan, nodes);
    const key = objectiveOf(src)?.id ?? plan.id;
    (groups.get(key) ?? groups.get(plan.id)).rows.push({ r, src });
  }
  const counted = results.filter((r) => r.measureId).length;

  return h('div', { class: 'results-wrap results-v2' },
    h('div', { class: 'results-intro' },
      h('div', {}, h('h2', {}, 'Results framework'),
        h('p', { class: 'muted' }, 'How you will know the plan is working, at every level: the plan, its objectives and goals, a workplan or a single task. Click a result to say how it is measured.')),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => make(null) }, icon('plus', 14), 'New result')),
    h('ul', { class: 'results-stats', 'aria-label': 'At a glance' },
      h('li', {}, h('strong', {}, String(results.length)), h('span', {}, 'results')),
      h('li', {}, h('strong', {}, String(counted)), h('span', {}, 'use live data')),
      h('li', {}, h('strong', {}, String(results.filter((r) => r.baseline && r.target).length)), h('span', {}, 'have a baseline and target')),
      h('li', {}, h('strong', {}, String(results.filter((r) => nodes[r.nodeId ?? r.taskId]?.type === 'task').length)), h('span', {}, 'from a task'))),
    waiting.length > 0 && h('div', { class: 'results-tray' },
      h('span', { class: 'fieldset-legend' }, 'From the SOAR board'),
      waiting.map((c) => h('button', { class: 'btn btn-sm btn-soft', title: 'Make this a result', onclick: () => make(c) }, icon('plus', 13), c.text || '(blank card)'))),
    !results.length && h('p', { class: 'empty' }, 'No results yet. Start from a Result card on the SOAR board, or press New result.'),
    [...groups.values()].filter((g) => g.rows.length || g.head.type === 'objective').map((g) => h('section', { class: 'results-group' },
      h('header', { class: 'results-group-head' }, LevelBadge(g.head.type === 'objective' ? 'objective' : 'plan'), h('h3', {}, g.head.title),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-ghost btn-xs', onclick: () => make(null, g.head.id === plan.id ? null : g.head.id) }, icon('plus', 12), 'Add a result here')),
      g.rows.length
        ? h('ul', { class: 'results-rows' }, g.rows.map(({ r, src }) => ResultRow(ctx, plan, r, src, measures, tree)))
        : h('p', { class: 'muted small results-none' }, 'No results here yet.'))));
}

function ResultRow(ctx, plan, r, src, measures, tree) {
  const linked = measures.find((m) => m.id === r.measureId);
  const b = parseFloat(r.baseline); const t = parseFloat(r.target);
  const share = Number.isFinite(b) && Number.isFinite(t) && t !== 0 ? Math.max(0, Math.min(1, b / t)) : null;
  return h('li', {}, h('button', { type: 'button', class: 'result-row', onclick: () => openResult(ctx, plan, r.id, measures, tree) },
    h('span', { class: 'result-row-main' },
      h('strong', {}, r.title || 'Untitled result'),
      h('span', { class: 'result-row-from' }, src.id === plan.id ? 'The whole plan' : [LevelBadge(src.type, { plain: true }), ' ', src.title])),
    h('span', { class: 'result-row-ind' }, r.indicator || h('em', { class: 'muted' }, 'What is counted?'), r.unit && h('small', {}, r.unit)),
    h('span', { class: 'result-row-target' },
      h('span', { class: 'result-bt' }, h('span', {}, r.baseline || '–'), icon('chevronRight', 12), h('strong', {}, r.target || '–')),
      h('i', { class: 'result-bar', style: share == null ? 'visibility:hidden' : `--f:${share}` })),
    h('span', { class: 'result-row-meta' }, r.frequency || '', linked && h('span', { class: 'badge badge-xs badge-success badge-soft', title: `Uses ${linked.name} in Plan` }, 'live data'))));
}

/** Edit one result in the side drawer. */
function openResult(ctx, plan, id, measures, tree) {
  const r = () => ctx.doc.results[id];
  if (!r()) return;
  const set = (patch) => ctx.put('results', id, patch);
  const f = (key, label, attrs = {}) => h('label', { class: 'rf' }, h('span', {}, label),
    h('input', { class: 'input input-sm w-full', name: `r-${id}-${key}`, value: r()[key] ?? '', onchange: (e) => set({ [key]: e.target.value }), ...attrs }));
  const depth = (n) => { let d = 0; let x = n; while (x?.parentId && x.id !== plan.id) { d++; x = ctx.strategy.doc.nodes[x.parentId]; } return d; };
  const levelName = (n) => LEVELS[n.type]?.label ?? n.type;
  const body = () => h('div', { class: 'result-edit' },
    h('label', { class: 'rf' }, h('span', {}, 'The result'),
      h('textarea', { class: 'textarea textarea-sm w-full', rows: 2, name: `r-${id}-title`, onchange: (e) => set({ title: e.target.value }) }, r().title)),
    h('label', { class: 'rf' }, h('span', {}, 'Comes from'),
      h('select', { class: 'select select-sm w-full', name: `r-${id}-from`, onchange: (e) => set({ nodeId: e.target.value === plan.id ? null : e.target.value, taskId: null }) },
        tree.map((n) => h('option', { value: n.id, selected: (r().nodeId ?? r().taskId ?? plan.id) === n.id }, `${'\u00a0\u00a0'.repeat(depth(n))}${n.id === plan.id ? 'The whole plan' : `${levelName(n)}: ${n.title}`}`))),
      h('small', { class: 'muted' }, 'Any level of the plan, down to a single task.')),
    h('label', { class: 'rf' }, h('span', {}, 'Measure in Plan (for live data)'),
      h('select', { class: 'select select-sm w-full', name: `r-${id}-m`, onchange: (e) => {
        const m = measures.find((x) => x.id === e.target.value);
        set(m ? { measureId: m.id, indicator: r().indicator || m.name, target: r().target || m.target, unit: r().unit || m.unit } : { measureId: null });
      } }, h('option', { value: '' }, 'None yet'), options(measures.map((m) => ({ id: m.id, label: m.name })), r().measureId))),
    h('div', { class: 'rf-grid2' },
      f('indicator', 'What is counted', { placeholder: 'Youth reached, educators trained…' }),
      f('unit', 'Unit', { placeholder: 'youth, %…' }),
      f('baseline', 'Baseline (now)'),
      f('target', 'Target'),
      f('source', 'Where the number comes from', { placeholder: 'Survey, registrations…' }),
      h('label', { class: 'rf' }, h('span', {}, 'How often'),
        h('select', { class: 'select select-sm w-full', name: `r-${id}-f`, onchange: (e) => set({ frequency: e.target.value }) }, options(FREQ, r().frequency)))));
  const d = Drawer({ title: 'Result', sub: plan.title, body: body(),
    actions: [
      h('button', { class: 'btn btn-ghost btn-sm text-error', onclick: async () => { if (await uiConfirm('Remove this result?')) { ctx.remove('results', id); d.close(); } } }, icon('trash', 14), 'Remove'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => d.close() }, 'Done'),
    ] });
}


/** Cards under the moved one slide down below it, and so on. Returns [[id, { y }]]. */
export function settle(cards, movedId) {
  const list = cards.map((c) => ({ ...c }));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const changed = new Map();
  const queue = [list.find((c) => c.id === movedId)];
  while (queue.length) {
    const a = queue.shift();
    for (const b of list) {
      if (b.id === a.id || b.id === movedId || !hit(a, b)) continue;
      b.y = a.y + a.h;
      changed.set(b.id, { y: b.y });
      queue.push(b);
    }
  }
  return [...changed];
}

