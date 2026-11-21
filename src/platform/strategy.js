import { col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { today } from '../strategy/dates.js';

/**
 * The strategy document: one tree of nodes, from the strategic framework
 * at the root down to tasks.
 *
 *   framework  mission, vision, values               (the root)
 *   plan       start, end, theme, milestones; plans sit side by side under the framework, never inside each other
 *   objective  measures (KPIs to track later on dashboards)
 *   goal       measures
 *   workplan   start, end, staffIds, teamIds, assets  (shows as a Gantt chart)
 *   task       start, end, status, assigneeIds, events (its lifetime timeline), assets
 *
 * Measures on objectives and goals have ids; program data (platform/data.js)
 * and dashboards refer to them by id. Assets (platform/assets.js) can point
 * at anything in any tool: map actors, staff, plans, documents, links...
 *
 * Every node: { id, type, parentId, order, title, notes, ... }.
 * Stored as doc.nodes[id]; changes use the collection ops (core/collections.js).
 */
export const NODE_TYPES = {
  framework: { label: 'Strategic framework', children: ['plan'], glyph: '◆' },
  plan: { label: 'Strategic plan', children: ['objective'], glyph: '▣', dated: true },
  objective: { label: 'Strategic objective', children: ['goal'], glyph: '◎' },
  goal: { label: 'Goal', children: ['workplan'], glyph: '○' },
  workplan: { label: 'Workplan', children: ['task'], glyph: '≡', dated: true },
  task: { label: 'Task', children: [], glyph: '▪', dated: true },
};

export const TASK_STATUSES = [
  { id: 'planned', label: 'Planned', color: '#9aa2b5' },
  { id: 'active', label: 'In progress', color: '#3d63dd' },
  { id: 'blocked', label: 'Blocked', color: '#b5442f' },
  { id: 'done', label: 'Done', color: '#2a9d8f' },
];
export const statusById = Object.fromEntries(TASK_STATUSES.map((s) => [s.id, s]));

const DEFAULTS = {
  framework: { mission: '', vision: '', values: '' },
  plan: { start: null, end: null, theme: '' },
  objective: { measures: [] },
  goal: { measures: [] },
  workplan: { start: null, end: null, staffIds: [], teamIds: [], assets: [] },
  task: { start: null, end: null, status: 'planned', assigneeIds: [], events: [], assets: [] },
};

export function childrenOf(doc, parentId) {
  return Object.values(doc.nodes)
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function rootOf(doc) {
  return Object.values(doc.nodes).find((n) => !n.parentId);
}

export function descendants(doc, id) {
  const out = [];
  const walk = (pid) => {
    for (const child of childrenOf(doc, pid)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

export function ancestors(doc, id) {
  const out = [];
  let node = doc.nodes[id];
  while (node?.parentId) {
    node = doc.nodes[node.parentId];
    if (node) out.unshift(node);
  }
  return out;
}

export const canHold = (parentType, childType) => NODE_TYPES[parentType]?.children.includes(childType) ?? false;

export const strategyOps = {
  /** Add a child node, checking it is allowed under its parent. */
  addNode(doc, { type, parentId, title, ...data }) {
    const parent = doc.nodes[parentId];
    if (parentId && !canHold(parent?.type, type)) throw new Error(`A ${type} can't go under a ${parent?.type}`);
    const siblings = childrenOf(doc, parentId);
    return col.add('nodes', {
      id: uid(type),
      type,
      parentId,
      order: siblings.length ? siblings.at(-1).order + 1 : 0,
      title: title ?? `New ${NODE_TYPES[type].label.toLowerCase()}`,
      notes: '',
      ...structuredClone(DEFAULTS[type]),
      ...data,
    });
  },

  update: (id, patch) => col.update('nodes', id, patch),

  /** Remove a node and everything under it, as one undoable step. */
  removeNode(doc, id) {
    return col.batch([...descendants(doc, id).reverse(), doc.nodes[id]].map((n) => col.remove('nodes', n.id)));
  },

  /** Add an entry to a task's lifetime. */
  addEvent(doc, taskId, { date, kind = 'note', text = '' }) {
    const task = doc.nodes[taskId];
    const events = [...task.events, { id: uid('ev'), date, kind, text }].sort((a, b) => a.date.localeCompare(b.date));
    return col.update('nodes', taskId, { events });
  },

  /** Change a task's status and record the change on its timeline. */
  setStatus(doc, taskId, status, date) {
    const task = doc.nodes[taskId];
    const events = [...task.events, { id: uid('ev'), date, kind: 'status', text: status }].sort((a, b) => a.date.localeCompare(b.date));
    return col.update('nodes', taskId, { status, events });
  },
};

/** Earliest start and latest end of a node and everything under it. */
export function dateSpan(doc, id) {
  const dated = [doc.nodes[id], ...descendants(doc, id)].filter((n) => n.start && n.end);
  if (!dated.length) return null;
  return {
    start: dated.map((n) => n.start).sort()[0],
    end: dated.map((n) => n.end).sort().at(-1),
  };
}

/** Task counts by status under a node. */
export function taskSummary(doc, id) {
  const tasks = (doc.nodes[id]?.type === 'task' ? [doc.nodes[id]] : descendants(doc, id)).filter((n) => n.type === 'task');
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s.id, 0]));
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return { total: tasks.length, ...counts };
}

/** Every measure in the strategy, by id, with the objective or goal it belongs to. */
export function measureIndex(doc) {
  const index = {};
  for (const node of Object.values(doc.nodes)) {
    for (const m of node.measures ?? []) index[m.id] = { ...m, nodeId: node.id, nodeTitle: node.title, nodeType: node.type };
  }
  return index;
}

/** Measures on a node and everything under it. */
export function measuresUnder(doc, id) {
  return [doc.nodes[id], ...descendants(doc, id)].flatMap((n) => (n.measures ?? []).map((m) => ({ ...m, nodeId: n.id, nodeTitle: n.title })));
}

/** Bring an older saved strategy up to the current shape. */
export function migrateStrategy(doc) {
  flattenPlans(doc);
  splitExampleYears(doc);
  for (const n of Object.values(doc.nodes)) {
    if (n.measures) for (const m of n.measures) m.id ??= uid('m');
    if (n.type === 'task' || n.type === 'workplan') n.assets ??= [];
    // The example's check-in guide now has a real file behind it.
    for (const a of n.assets ?? []) if (a.kind === 'document' && a.label === 'Partner check-in guide.pdf' && !a.url && !a.dataUrl) { a.url = 'media/docs/partner-check-in-guide.pdf'; a.detail = 'PDF · 3 KB'; }
  }
  return doc;
}

/**
 * Plans sit directly under the framework, never inside another plan. Older
 * documents (the first example among them) had a long-range plan holding
 * yearly plans; each inner plan folds into the plan around it: its
 * objectives move up (after the outer plan's own), its milestones and notes
 * join the outer plan's, and the outer plan stretches to cover its dates.
 * `doc.folded` remembers where each folded plan went, so dashboards, plan
 * documents and studio work that pointed at it still land (liveNodeId).
 */
export function flattenPlans(doc) {
  const nested = () => Object.values(doc.nodes).find((n) => n.type === 'plan' && doc.nodes[n.parentId]?.type === 'plan');
  for (let inner = nested(); inner; inner = nested()) {
    const outer = doc.nodes[inner.parentId];
    const siblings = childrenOf(doc, outer.id).filter((c) => c.id !== inner.id);
    let order = Math.max(-1, ...siblings.map((c) => c.order ?? 0));
    for (const c of childrenOf(doc, inner.id)) { c.parentId = outer.id; c.order = ++order; }
    if (inner.milestones?.length) outer.milestones = [...(outer.milestones ?? []), ...inner.milestones];
    if (inner.notes?.trim()) outer.notes = [outer.notes, `${inner.title}: ${inner.notes}`].filter((x) => x?.trim()).join('\n\n');
    if (inner.start && (!outer.start || inner.start < outer.start)) outer.start = inner.start;
    if (inner.end && (!outer.end || inner.end > outer.end)) outer.end = inner.end;
    delete doc.nodes[inner.id];
    doc.folded = { ...doc.folded, [inner.id]: outer.id };
    for (const [k, v] of Object.entries(doc.folded)) if (v === inner.id) doc.folded[k] = outer.id;
  }
  return doc;
}

/**
 * The STEM example once kept Year 1 and Year 2 inside a 2026–2030 plan, and
 * flattenPlans folded them into it. The example now keeps them as sibling
 * plans: if that folded plan is still as the example left it, it becomes
 * the Year 1 plan (keeping its id, so its studio work, plan document and
 * dashboards stay with it) and the Year 2 objective moves to a new plan
 * beside it. Runs once, and never on a plan someone has renamed.
 */
const FOLDED_TITLE = 'Strategic Plan 2026–2030: From pipelines to systems';
export function splitExampleYears(doc) {
  const y1 = doc.nodes[doc.nodes['obj-equity']?.parentId];
  const scale = doc.nodes['obj-scale'];
  if (doc.yearsSplit || !y1 || !scale || y1.type !== 'plan' || scale.parentId !== y1.id || y1.title !== FOLDED_TITLE) return doc;
  const root = doc.nodes[y1.parentId];
  // A fixed id, so a page that migrates without saving finds the same plan next time.
  const { data } = strategyOps.addNode(doc, { type: 'plan', parentId: y1.parentId, title: 'Year 2 plan: Growth', start: '2027-04-01', end: '2028-03-31', theme: 'Growth',
    milestones: (y1.milestones ?? []).filter((m) => m.date > '2027-03-31') });
  const y2 = { ...data, id: 'plan-year-2' };
  doc.nodes[y2.id] = y2;
  scale.parentId = y2.id;
  scale.order = 0;
  Object.assign(y1, { title: 'Year 1 plan: Foundations', theme: 'Foundations', start: '2026-04-01', end: '2027-03-31', milestones: (y1.milestones ?? []).filter((m) => m.date <= '2027-03-31') });
  if (root?.type === 'framework' && root.title === 'Strategic framework') root.title = 'Strategic framework 2026–2030: From pipelines to systems';
  doc.yearsSplit = true;
  return doc;
}

/** Where a node lives now: itself, or the plan it was folded into. */
export function liveNodeId(doc, id) {
  let at = id;
  for (let i = 0; i < 10 && at && !doc.nodes[at] && doc.folded?.[at]; i++) at = doc.folded[at];
  return at;
}

/** A task's status on a date, read from its status history. */
export function statusAt(task, date, now = today()) {
  const changes = (task.events ?? []).filter((e) => e.kind === 'status' && e.date <= date);
  if (changes.length) return changes.at(-1).text;
  if (date >= now) return task.status;
  return 'planned';
}
