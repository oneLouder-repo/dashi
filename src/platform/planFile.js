import { uid } from '../core/ops.js';
import { descendants, rootOf } from './strategy.js';
import { COLLECTIONS } from './studio.js';

/**
 * Plan files (d, 2026-11-27): one or more strategic plans saved as a
 * `.dashi-plan.json` file, to keep a copy, share a plan with another org, or
 * start next year's plan from this one. Opening a file always adds its plans
 * as new plans under the framework, with new ids, so it never overwrites.
 *
 * {
 *   format: 'dashi-plan', version: 1, exportedAt,
 *   from: { orgId, orgName },
 *   framework: { title, mission, vision, values },   used only when the org has no framework yet
 *   nodes: [Node],                                    each plan and everything under it (platform/strategy.js)
 *   studio: { plans: {[planId]: …}, context: [..], cards: [..], results, blocks, wires, toc, tocLinks }
 * }                                                   the Planning Studio work around those plans
 *
 * Opened in another org, people (team, assignees, votes) are left out and so
 * are assets that point into the old org (its maps, staff and library);
 * links, people outside the org and media stay.
 */
export const FORMAT = 'dashi-plan';
export const VERSION = 1;
const ORG_ONLY_KINDS = new Set(['map', 'actor', 'staff']);

export const planFileName = (title) => `${(title || 'plan').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'plan'}.dashi-plan.json`;

/** The file for the given plans (ids of plan nodes). */
export function exportPlans(strategy, studio, planIds, { org = null, now = new Date() } = {}) {
  const plans = planIds.map((id) => strategy.nodes[id]).filter((n) => n?.type === 'plan');
  if (!plans.length) throw new Error('Pick at least one plan to save.');
  const nodes = plans.flatMap((p) => [p, ...descendants(strategy, p.id)]).map((n) => structuredClone(n));
  const inFile = new Set(plans.map((p) => p.id));
  const root = rootOf(strategy);
  const st = { plans: {} };
  for (const k of COLLECTIONS.filter((c) => c !== 'plans')) st[k] = Object.values(studio?.[k] ?? {}).filter((x) => inFile.has(x.planId)).map((x) => structuredClone(x));
  for (const id of inFile) if (studio?.plans?.[id]) st.plans[id] = structuredClone(studio.plans[id]);
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    from: { orgId: org?.id ?? null, orgName: org?.name ?? null },
    framework: root ? { title: root.title, mission: root.mission ?? '', vision: root.vision ?? '', values: root.values ?? '' } : null,
    nodes,
    studio: st,
  };
}

/** Read a file's text; throws a plain-language error when it isn't a plan file. */
export function readPlanFile(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('This file isn’t a plan file (it isn’t JSON).'); }
  if (file?.format !== FORMAT || !Array.isArray(file.nodes)) throw new Error('This file isn’t a Dashi plan file.');
  if (file.version > VERSION) throw new Error('This plan file comes from a newer Dashi. Update Dashi and try again.');
  if (!file.nodes.some((n) => n?.type === 'plan')) throw new Error('This plan file has no plans in it.');
  return file;
}

/**
 * What opening a file adds: new nodes for the strategy (a framework first,
 * if the org has none), new studio items, and notes on what was left out.
 *
 *   importPlans(file, strategy, { orgId }) → { nodes, studio: { [collection]: { [id]: item } }, planIds, notes }
 */
export function importPlans(file, strategy, { orgId = null, now = Date.now() } = {}) {
  const sameOrg = !!orgId && file.from?.orgId === orgId;
  const ids = new Map();
  const fresh = (old, prefix) => { if (!ids.has(old)) ids.set(old, uid(prefix)); return ids.get(old); };
  const map = (old) => (old != null && ids.has(old) ? ids.get(old) : old);
  const dropped = { people: 0, assets: 0 };
  const out = [];

  let root = rootOf(strategy);
  if (!root) {
    const f = file.framework ?? {};
    root = { id: uid('framework'), type: 'framework', parentId: null, order: 0, title: f.title || 'Our framework', notes: '', mission: f.mission ?? '', vision: f.vision ?? '', values: f.values ?? '' };
    out.push(root);
  }

  const nodes = file.nodes.filter((n) => n?.id && n.type && n.type !== 'framework');
  for (const n of nodes) fresh(n.id, n.type);
  // Measures and milestones carry ids other things point at (results, signposts, data).
  for (const n of nodes) for (const m of n.measures ?? []) if (m.id) fresh(m.id, 'm');

  const people = (list) => { if (sameOrg) return [...(list ?? [])]; dropped.people += (list ?? []).length; return []; };
  const assets = (list) => (list ?? []).flatMap((a) => {
    if (a.kind === 'plan') return ids.has(a.ref) ? [{ ...a, id: uid('asset'), ref: map(a.ref) }] : sameOrg ? [{ ...a, id: uid('asset') }] : (dropped.assets++, []);
    if (!sameOrg && (ORG_ONLY_KINDS.has(a.kind) || a.libraryId || a.assetKey)) { dropped.assets++; return []; }
    return [{ ...a, id: uid('asset') }];
  });

  const existing = new Set(Object.values(strategy.nodes).filter((n) => n.type === 'plan').map((n) => n.title.trim().toLowerCase()));
  let order = Math.max(-1, ...Object.values(strategy.nodes).filter((n) => n.parentId === root.id).map((n) => n.order ?? 0));
  const planIds = [];
  for (const n of nodes) {
    const c = structuredClone(n);
    c.id = map(n.id);
    if (n.type === 'plan') {
      c.parentId = root.id;
      c.order = ++order;
      if (existing.has((c.title ?? '').trim().toLowerCase())) c.title = `${c.title} (imported)`;
      planIds.push(c.id);
    } else {
      if (!ids.has(n.parentId)) continue; // its parent wasn't in the file
      c.parentId = map(n.parentId);
    }
    if (c.measures) c.measures = c.measures.map((m) => ({ ...m, id: map(m.id) }));
    if (c.milestones) c.milestones = c.milestones.map((m) => (m.id ? { ...m, id: uid('ms') } : { ...m }));
    if (c.events) c.events = c.events.map((e) => ({ ...e, id: uid('ev') }));
    for (const k of ['staffIds', 'teamIds', 'assigneeIds']) if (c[k]) c[k] = people(c[k]);
    if (c.assets) c.assets = assets(c.assets);
    out.push(c);
  }

  // The Planning Studio work: new ids first, so wires and links can follow them.
  const st = file.studio ?? {};
  const studio = Object.fromEntries(COLLECTIONS.map((k) => [k, {}]));
  const items = (k) => (Array.isArray(st[k]) ? st[k] : Object.values(st[k] ?? {})).filter((x) => x?.id && ids.has(x.planId));
  for (const k of COLLECTIONS.filter((c) => c !== 'plans')) for (const x of items(k)) fresh(x.id, k.replace(/s$/, ''));
  for (const k of COLLECTIONS.filter((c) => c !== 'plans')) {
    for (const x of items(k)) {
      const c = { ...structuredClone(x), id: map(x.id), planId: map(x.planId), at: now };
      for (const f of ['strategyId', 'from', 'to', 'cardId', 'measureId', 'ref']) if (c[f] != null) c[f] = map(c[f]);
      if (c.signpost?.measureId) c.signpost = { ...c.signpost, measureId: map(c.signpost.measureId) };
      if (c.votes) c.votes = people(c.votes);
      if (c.by && !sameOrg) delete c.by;
      if (c.assets) c.assets = assets(c.assets);
      if (c.evidence) c.evidence = assets(c.evidence);
      studio[k][c.id] = c;
    }
  }
  for (const [old, p] of Object.entries(st.plans ?? {})) {
    if (!ids.has(old)) continue;
    const id = map(old);
    studio.plans[id] = { ...structuredClone(p), id, team: sameOrg ? (p.team ?? []) : [], at: now };
    if (!sameOrg) dropped.people += (p.team ?? []).length;
  }

  const notes = [];
  if (dropped.people) notes.push(`People from ${file.from?.orgName ?? 'the other organisation'} were left off (${dropped.people}). Add your own team.`);
  if (dropped.assets) notes.push(`${dropped.assets} linked item${dropped.assets === 1 ? '' : 's'} pointed into the other organisation and were left off.`);
  return { nodes: out, studio, planIds, notes, sameOrg };
}

/** Save a file to the user's computer. */
export function downloadPlanFile(file, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
