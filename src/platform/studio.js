/**
 * Planning Studio: the workshop where a strategic plan is worked out,
 * before (and alongside) its objectives and goals in Plan.
 * The framework and its plans live in the strategy document; this one
 * holds the planning around each plan:
 *
 * { id: 'studio',
 *   plans:   { [planId]: { id, team: [{ staffId, role }], notes } }        planId is a strategy plan node
 *   context: { [id]: { id, planId, kind, text, at } }                      the plan's operating context
 *   cards:   { [id]: { id, planId, quadrant: 's'|'o'|'a'|'r', text, detail, wx, wy, by, votes: [staffId], assets: [Asset], at } }
 *            wx, wy: where the card sits on the SOAR canvas, from its centre 0,0. The quadrant follows
 *            from the side it is on (S top left, O top right, A bottom left, R bottom right); nearer
 *            the centre means more important.
 *   results: { [id]: { id, planId, title, indicator, baseline, target, unit, source, frequency, measureId, cardId, x, y, w, h, at } }
 *   blocks:  { [id]: { id, planId, kind: 'card'|'asset'|'context'|'result'|'workplan'|'goal'|'objective'|'plan', ref, title, x, y, strategyId, at } }
 *   wires:   { [id]: { id, planId, from, to, at } }
 *   toc:      { [id]: { id, planId, lane, title, strategyId, order, at } }        a theory of change: what we do,
 *             what it produces, the early and lasting changes, and the change we seek (TOC_LANES)
 *   tocLinks: { [id]: { id, planId, from, to, assumption, confidence, evidence: [Asset], signpost: { measureId, note }, at } }
 *             "so that" links between them, each with the assumption behind it, how sure we are, the
 *             evidence for it, and a signpost: the number we watch, and what would make us rethink
 *   gone:    { [id]: at }                                                  deleted items, so a merge doesn't bring them back
 * }
 *
 * Several people can work in a plan at once. Every item carries `at`, the
 * time it last changed; when someone else's save arrives, mergeStudio keeps
 * the newer of each item, so people only overwrite each other when they
 * change the very same card at the same moment.
 */
import { uid } from '../core/ops.js';
import { col } from '../core/collections.js';
import { strategyOps, childrenOf, descendants, liveNodeId, measureIndex } from './strategy.js';

export const COLLECTIONS = ['plans', 'context', 'cards', 'results', 'blocks', 'wires', 'toc', 'tocLinks'];

export const QUADRANTS = [
  { id: 's', label: 'Strengths', ask: 'What are we best at? What do we do that others value?', color: '#4da65c' },
  { id: 'o', label: 'Opportunities', ask: 'What could we take up? What are partners and the world asking of us?', color: '#f4a93b' },
  { id: 'a', label: 'Aspirations', ask: 'What do we care most about? What future do we want to create?', color: '#7b2fe8' },
  { id: 'r', label: 'Results', ask: 'How will we know we have got there? What would we measure?', color: '#c8432f' },
];
export const quadrant = (id) => QUADRANTS.find((q) => q.id === id);

export const CONTEXT_KINDS = [
  { id: 'political', label: 'Political' },
  { id: 'economic', label: 'Economic' },
  { id: 'social', label: 'Social' },
  { id: 'technology', label: 'Technology' },
  { id: 'environment', label: 'Environment' },
  { id: 'legal', label: 'Legal' },
  { id: 'internal', label: 'Inside the organisation' },
];

export const TEAM_ROLES = [
  { id: 'facilitator', label: 'Facilitator' },
  { id: 'lead', label: 'Plan lead' },
  { id: 'member', label: 'Member' },
  { id: 'advisor', label: 'Advisor' },
];

export const blankStudio = () => ({ id: 'studio', plans: {}, context: {}, cards: {}, results: {}, blocks: {}, wires: {}, toc: {}, tocLinks: {}, gone: {} });

export function migrateStudio(doc, strategy = null) {
  for (const k of [...COLLECTIONS, 'gone']) doc[k] ??= {};
  // Work on a plan since folded into another (see flattenPlans) moves with it.
  if (strategy?.folded) {
    for (const k of COLLECTIONS.filter((c) => c !== 'plans')) for (const x of Object.values(doc[k])) {
      if (x.planId) x.planId = liveNodeId(strategy, x.planId);
      if (x.strategyId) x.strategyId = liveNodeId(strategy, x.strategyId);
    }
    for (const [id, p] of Object.entries(doc.plans)) {
      const to = liveNodeId(strategy, id);
      if (to === id) continue;
      delete doc.plans[id];
      if (!doc.plans[to]) doc.plans[to] = { ...p, id: to };
    }
  }
  // Cards from the first SOAR board sat at a share of a fixed quadrant; put them on the open canvas.
  for (const c of Object.values(doc.cards)) {
    if (c.wx != null) continue;
    const left = c.quadrant === 's' || c.quadrant === 'a';
    const top = c.quadrant === 's' || c.quadrant === 'o';
    const x = (c.x ?? 0.3) * QUADRANT_SIZE + CARD_SIZE.w / 2;
    const y = (c.y ?? 0.3) * QUADRANT_SIZE + CARD_SIZE.h / 2;
    c.wx = Math.round(left ? x - QUADRANT_SIZE : x);
    c.wy = Math.round(top ? y - QUADRANT_SIZE : y);
  }
  return doc;
}

/** The SOAR canvas: a quadrant's usual reach, and a card's size, in canvas units. */
export const QUADRANT_SIZE = 1000;
export const CARD_SIZE = { w: 200, h: 110 };

/** Which quadrant a point on the SOAR canvas is in. */
export const quadrantAt = (wx, wy) => (wy < 0 ? (wx < 0 ? 's' : 'o') : (wx < 0 ? 'a' : 'r'));

/** How important a card reads, from 0 (far out) to 1 (at the centre). */
export const closeness = (c) => Math.max(0, Math.min(1, 1 - (Math.hypot(c.wx, c.wy) - 160) / 1000));
/** Its border: 5px at the centre, thinning to 1px far out. */
export const borderFor = (c) => Math.round((1 + 4 * closeness(c)) * 2) / 2;

/** Ops that stamp the time, so merges know which change is newer. */
export const studioOps = {
  add: (collection, data) => col.add(collection, { id: uid(collection.replace(/s$/, '')), ...data, at: Date.now() }),
  update: (collection, id, patch) => col.update(collection, id, { ...patch, at: Date.now() }),
  remove: (doc, collection, ids) => col.batch([
    ...[ids].flat().filter((id) => doc[collection][id]).map((id) => col.remove(collection, id)),
    col.set('gone', { ...doc.gone, ...Object.fromEntries([ids].flat().map((id) => [id, Date.now()])) }),
  ]),
};

/** Everything in one collection that belongs to a plan. */
export const ofPlan = (doc, collection, planId) => Object.values(doc[collection] ?? {}).filter((x) => x.planId === planId);

/**
 * Merge someone else's saved studio into ours: the newer of each item
 * wins, and deletions stick unless the item changed after it was deleted.
 */
export function mergeStudio(mine, theirs) {
  const out = blankStudio();
  out.id = mine.id ?? theirs.id ?? 'studio';
  for (const [id, at] of [...Object.entries(mine.gone ?? {}), ...Object.entries(theirs.gone ?? {})]) out.gone[id] = Math.max(out.gone[id] ?? 0, at);
  for (const k of COLLECTIONS) {
    const ids = new Set([...Object.keys(mine[k] ?? {}), ...Object.keys(theirs[k] ?? {})]);
    for (const id of ids) {
      const a = mine[k]?.[id];
      const b = theirs[k]?.[id];
      const pick = !a ? b : !b ? a : (b.at ?? 0) > (a.at ?? 0) ? b : a;
      if (out.gone[id] && out.gone[id] >= (pick.at ?? 0)) continue;
      out[k][id] = structuredClone(pick);
    }
  }
  return out;
}

/** The strategy plans the Studio can work on, outermost first. */
export function plansOf(strategy) {
  const out = [];
  const walk = (parentId, depth) => {
    for (const n of childrenOf(strategy, parentId)) {
      if (n.type !== 'plan') continue;
      out.push({ ...n, depth });
      walk(n.id, depth + 1);
    }
  };
  for (const root of Object.values(strategy.nodes).filter((n) => !n.parentId)) walk(root.id, 0);
  return out;
}

/** What a block on the Assemble canvas shows, looked up from what it points at. */
export function blockLabel(doc, block) {
  if (block.kind === 'card') return doc.cards[block.ref]?.text ?? '(removed)';
  if (block.kind === 'context') return doc.context[block.ref]?.text ?? '(removed)';
  if (block.kind === 'result') return doc.results[block.ref]?.title ?? '(removed)';
  return block.title ?? '';
}

/** Can a wire go from one block to another? Ideas feed goals; goals feed objectives. */
export function canWire(from, to) {
  if (!from || !to || from.id === to.id) return false;
  if (to.kind === 'goal') return ['card', 'asset', 'context', 'result', 'workplan'].includes(from.kind);
  if (to.kind === 'objective') return ['card', 'asset', 'context', 'result', 'goal'].includes(from.kind);
  if (to.kind === 'plan') return from.kind === 'objective';
  return false;
}

/**
 * Turn the Assemble canvas into strategy ops: every objective block
 * becomes (or updates) an objective under the plan, every goal wired into
 * it a goal under that objective. A result wired in becomes a measure.
 * Returns { strategyOps: [op], studioOps: [op], made, updated, loose }.
 */
export function sendToPlan(doc, strategy, planId) {
  const blocks = ofPlan(doc, 'blocks', planId);
  const wires = ofPlan(doc, 'wires', planId);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const into = (id) => wires.filter((w) => w.to === id).map((w) => byId[w.from]).filter(Boolean);
  const sOps = [];
  const tOps = [];
  let made = 0;
  let updated = 0;
  const notesFor = (b) => {
    const feeds = into(b.id).filter((x) => x.kind !== 'goal' && x.kind !== 'result');
    if (!feeds.length) return undefined;
    return `From the Planning Studio, building on:\n${feeds.map((x) => `- ${x.kind === 'card' ? `${quadrant(doc.cards[x.ref]?.quadrant)?.label}: ` : x.kind === 'context' ? 'Context: ' : 'Asset: '}${blockLabel(doc, x)}`).join('\n')}`;
  };
  const measuresFor = (b, node) => {
    const have = node?.measures ?? [];
    const add = into(b.id).filter((x) => x.kind === 'result').map((x) => doc.results[x.ref]).filter(Boolean)
      .filter((r) => !have.some((m) => m.id === (r.measureId || `m-${r.id}`)))
      .map((r) => ({ id: r.measureId || `m-${r.id}`, name: r.indicator || r.title, target: r.target ?? '', unit: r.unit ?? '' }));
    return add.length ? [...have, ...add] : null;
  };
  // Work on a copy so new objectives can take goals in the same pass.
  const nodes = { ...strategy.nodes };
  const place = (b, type, parentId) => {
    const existing = b.strategyId && nodes[b.strategyId];
    const notes = notesFor(b);
    if (existing) {
      const patch = { title: b.title };
      // Move it only if it isn't already somewhere under its new parent.
      if (parentId && !isUnder(nodes, existing.id, parentId)) patch.parentId = parentId;
      if (notes && !existing.notes) patch.notes = notes;
      const measures = measuresFor(b, existing);
      if (measures) patch.measures = measures;
      sOps.push(strategyOps.update(existing.id, patch));
      updated++;
      return existing.id;
    }
    const op = strategyOps.addNode({ nodes }, { type, parentId, title: b.title, ...(notes ? { notes } : {}) });
    const measures = measuresFor(b, null);
    if (measures) op.data.measures = measures;
    nodes[op.id] = { ...op.data, id: op.id };
    sOps.push(op);
    tOps.push(studioOps.update('blocks', b.id, { strategyId: op.id }));
    made++;
    return op.id;
  };
  for (const pb of blocks.filter((b) => b.kind === 'plan' && b.strategyId === planId && nodes[planId])) {
    if (pb.title && pb.title !== nodes[planId].title) { sOps.push(strategyOps.update(planId, { title: pb.title })); updated++; }
  }
  for (const ob of blocks.filter((b) => b.kind === 'objective')) {
    const objId = place(ob, 'objective', planId);
    for (const g of into(ob.id).filter((x) => x.kind === 'goal')) {
      const goalId = place(g, 'goal', objId);
      for (const w of into(g.id).filter((x) => x.kind === 'workplan')) place(w, 'workplan', goalId);
    }
  }
  const loose = blocks.filter((b) => b.kind === 'goal' && !wires.some((w) => w.from === b.id && byId[w.to]?.kind === 'objective')).length;
  return { strategyOps: sOps, studioOps: tOps, made, updated, loose };
}

const isUnder = (nodes, id, ancestorId) => {
  for (let n = nodes[id]; n?.parentId; n = nodes[n.parentId]) if (n.parentId === ancestorId) return true;
  return false;
};

/** The example org's planning for its long-range plan: a SOAR in progress. */
export function seedStudio(strategy, { staff = [] } = {}) {
  const doc = blankStudio();
  const plan = plansOf(strategy).find((p) => /2026/.test(p.title)) ?? plansOf(strategy)[0];
  if (!plan) return doc;
  const planId = plan.id;
  const at = 1;
  const who = (i) => staff[i % Math.max(1, staff.length)] ?? null;
  doc.plans[planId] = { id: planId, at, notes: 'Two online sessions in March, then a board retreat. Tanis and Mateo co-facilitate.',
    team: [['s-indig', 'facilitator'], ['s-eval', 'facilitator'], ['s-ed', 'lead'], ['s-prog', 'member'], ['s-part', 'member'], ['s-fin', 'advisor']]
      .filter(([id]) => !staff.length || staff.includes(id)).map(([staffId, role]) => ({ staffId, role })) };
  const ctx = [
    ['political', 'Federal youth STEM funding is up for renewal in 2027.'],
    ['social', 'Families in rural and northern communities say programs feel built for cities.'],
    ['economic', 'Corporate sponsorship is steady but tied to short campaigns.'],
    ['technology', 'Members collect data in five different systems.'],
    ['internal', 'A small national office (12 staff) serving 40 member programs.'],
  ];
  ctx.forEach(([kind, text], i) => { doc.context[`cx-${i + 1}`] = { id: `cx-${i + 1}`, planId, kind, text, at }; });
  const cards = {
    s: ['Trusted by universities and colleges in every province', 'Hands-on programs young people love', 'Instructors who reflect the youth they serve', 'Shared data across 40 member programs'],
    o: ['Indigenous-led programs asking for partners', 'Provinces revising science curricula', 'Funders want shared outcomes, not one-off reports'],
    a: ['Every young person can see themselves in STEM', 'A network that bends to serve youth furthest from opportunity', 'Learning in public with our data'],
    r: ['Half a million youth a year, most from equity-deserving groups', 'Girls and gender-diverse youth at half of participants', 'Every program reporting the same core indicators'],
  };
  for (const [q, list] of Object.entries(cards)) list.forEach((text, i) => {
    const id = `card-${q}${i + 1}`;
    // Spread out from the centre: the first (most important) cards closest in.
    const r = 280 + i * 210;
    const angle = ((18 + ((i * 29) % 54)) * Math.PI) / 180;
    const [sx, sy] = [q === 's' || q === 'a' ? -1 : 1, q === 's' || q === 'o' ? -1 : 1];
    doc.cards[id] = { id, planId, quadrant: q, text, detail: '', wx: Math.round(sx * r * Math.cos(angle)), wy: Math.round(sy * r * Math.sin(angle)), by: who(i), votes: staff.slice(0, (5 - i) % 4), assets: [], at };
  });
  doc.cards['card-s1'].assets = [{ id: 'as-seed-1', kind: 'actor', mapId: 'map-ecosystem', ref: 'actor-universities', label: 'University & college partners' }];
  doc.cards['card-o1'].assets = [{ id: 'as-seed-2', kind: 'actor', mapId: 'map-ecosystem', ref: 'actor-indig-comm', label: 'Indigenous communities' }];
  const results = [
    ['res-1', 'card-r1', 'More young people reached, mostly from equity-deserving groups', 'Youth reached in a year', '312000', '500000', 'youth / yr', 'Member program registrations', 'Monthly', 'm-reach', 0, 0],
    ['res-2', 'card-r2', 'Gender parity in our programs', 'Girls & gender-diverse participants', '38', '50', '%', 'Registration survey', 'Quarterly', 'm-girls', 4, 0],
    ['res-3', 'card-r3', 'One MEL framework across all programs', 'Programs reporting core indicators', '30', '100', '%', 'Data platform', 'Quarterly', 'm-reporting', 8, 0],
  ];
  for (const [id, cardId, title, indicator, baseline, target, unit, source, frequency, measureId, x, y] of results)
    doc.results[id] = { id, planId, cardId, title, indicator, baseline, target, unit, source, frequency, measureId, x, y, w: 4, h: 5, at };
  const equity = strategy.nodes['obj-equity'] ? 'obj-equity' : null;
  const blocks = [
    ['bl-1', 'card', 'card-s3', 40, 40], ['bl-2', 'card', 'card-a2', 40, 150], ['bl-3', 'context', 'cx-2', 40, 260], ['bl-4', 'result', 'res-2', 40, 370],
    ['bl-5', 'goal', null, 380, 120, 'Programs reach more girls and gender-diverse youth', Object.values(strategy.nodes).find((n) => n.type === 'goal' && /girls/i.test(n.title))?.id],
    ['bl-6', 'objective', null, 720, 200, 'Deepen equity and inclusion in every program', equity],
    ['bl-7', 'card', 'card-o1', 40, 480], ['bl-8', 'goal', null, 380, 420, 'Co-design programs with Indigenous partners'],
  ];
  for (const [id, kind, ref, x, y, title, strategyId] of blocks) doc.blocks[id] = { id, planId, kind, ref, x, y, title: title ?? null, strategyId: strategyId ?? null, at };
  [['bl-1', 'bl-5'], ['bl-2', 'bl-5'], ['bl-3', 'bl-5'], ['bl-4', 'bl-5'], ['bl-5', 'bl-6'], ['bl-7', 'bl-8'], ['bl-8', 'bl-6']]
    .forEach(([from, to], i) => { doc.wires[`wi-${i + 1}`] = { id: `wi-${i + 1}`, planId, from, to, at }; });
  seedToc(doc, strategy, planId);
  return doc;
}

/** The example's theory of change: the plan laid out, with a few outputs, assumptions, evidence and signposts filled in. */
function seedToc(doc, strategy, planId) {
  const apply = (op) => { if (op.op === 'add') doc[op.collection][op.id] = { ...op.data, id: op.id, at: 1 }; };
  for (const op of tocFromPlan(doc, strategy, planId)) apply(op);
  const item = (re) => ofPlan(doc, 'toc', planId).find((x) => re.test(x.title));
  const linkOf = (a, b) => a && b && ofPlan(doc, 'tocLinks', planId).find((l) => l.from === a.id && l.to === b.id);
  const set = (l, patch) => { if (l) Object.assign(l, patch); };
  const refresh = item(/training refresh/i), trained = item(/^Instructors are trained/i), girls = item(/reach more girls/i), equity = item(/^Deepen equity/i), outreach = item(/girls in STEM outreach/i);
  const out = (id, title, order, from, to, assumption) => {
    if (!from || !to) return;
    doc.toc[id] = { id, planId, lane: 'output', title, strategyId: null, order, at: 1 };
    const old = linkOf(from, to);
    if (old) delete doc.tocLinks[old.id];
    doc.tocLinks[`${id}-in`] = { id: `${id}-in`, planId, from: from.id, to: id, assumption: '', confidence: 'tested', evidence: [], signpost: null, at: 1 };
    doc.tocLinks[`${id}-out`] = { id: `${id}-out`, planId, from: id, to: to.id, assumption, confidence: 'likely', evidence: [], signpost: null, at: 1 };
  };
  out('toc-out-1', '600 instructors finish the refreshed modules', 0, refresh, trained, 'Instructors use new practice when their sites back them');
  out('toc-out-2', 'Outreach sessions in 40 schools', 1, outreach, girls, 'Girls who meet role models like themselves are more likely to join a club');
  if (doc.tocLinks['toc-out-1-out']) doc.tocLinks['toc-out-1-out'].evidence = [{ id: 'as-toc-1', kind: 'link', label: 'Culturally responsive teaching: a research brief', url: 'https://example.org/research/crt-brief', detail: 'Research brief' }];
  set(linkOf(girls, equity), { assumption: 'Reaching more girls changes who stays in STEM, not just who tries it', confidence: 'untested', signpost: { measureId: 'm-equity', note: 'If the share of equity-deserving youth is still under 45% by spring, rethink outreach before scaling it.' } });
  set(linkOf(trained, equity), { assumption: 'Trained instructors keep equity-deserving youth in programs', confidence: 'likely', signpost: { measureId: 'm-trained', note: 'If fewer than half the instructors have finished by March, slow the roll-out.' } });
}

/**
 * Put the plan as it stands in Plan onto the Assemble canvas:
 * the plan, its objectives, their goals and the goals' workplans, wired
 * together, leaving out anything already there. Returns studio ops.
 */
export function bringInPlan(doc, strategy, planId) {
  const blocks = ofPlan(doc, 'blocks', planId);
  const onCanvas = Object.fromEntries(blocks.filter((b) => b.strategyId).map((b) => [b.strategyId, b.id]));
  const wired = new Set(ofPlan(doc, 'wires', planId).map((w) => `${w.from}>${w.to}`));
  const top = blocks.reduce((m, b) => Math.max(m, b.y + 130), 30);
  const ops = [];
  const rows = { workplan: top, goal: top, objective: top, plan: top };
  const X = { workplan: 40, goal: 400, objective: 760, plan: 1120 };
  const put = (n, kind) => {
    if (onCanvas[n.id]) return onCanvas[n.id];
    const op = studioOps.add('blocks', { planId, kind, ref: null, title: n.title, strategyId: n.id, x: X[kind], y: rows[kind] });
    rows[kind] += kind === 'workplan' ? 135 : 125;
    ops.push(op);
    onCanvas[n.id] = op.id;
    return op.id;
  };
  const wire = (from, to) => {
    if (wired.has(`${from}>${to}`)) return;
    wired.add(`${from}>${to}`);
    ops.push(studioOps.add('wires', { planId, from, to }));
  };
  const plan = strategy.nodes[planId];
  if (!plan) return ops;
  const planBlock = put(plan, 'plan');
  for (const o of descendants(strategy, planId).filter((n) => n.type === 'objective')) {
    const ob = put(o, 'objective');
    wire(ob, planBlock);
    for (const g of childrenOf(strategy, o.id).filter((n) => n.type === 'goal')) {
      rows.goal = Math.max(rows.goal, rows.workplan);
      const gb = put(g, 'goal');
      wire(gb, ob);
      for (const w of childrenOf(strategy, g.id).filter((n) => n.type === 'workplan')) wire(put(w, 'workplan'), gb);
    }
    rows.objective = Math.max(rows.objective, rows.goal);
  }
  return ops;
}

/** A free spot for a new card in a quadrant of the SOAR canvas, as near the centre as there's room. */
export function freeSpot(doc, planId, q, near = null) {
  const cards = ofPlan(doc, 'cards', planId);
  const [sx, sy] = [q === 's' || q === 'a' ? -1 : 1, q === 's' || q === 'o' ? -1 : 1];
  const fits = (x, y) => quadrantAt(x, y) === q && Math.abs(x) > CARD_SIZE.w / 2 + 10 && Math.abs(y) > CARD_SIZE.h / 2 + 10
    && cards.every((c) => Math.abs(c.wx - x) > CARD_SIZE.w + 16 || Math.abs(c.wy - y) > CARD_SIZE.h + 16);
  const start = near ?? { x: sx * 420, y: sy * 320 };
  for (let i = 0; i < 600; i++) {
    const r = i * 9;
    const t = i * 0.5;
    const x = Math.round(start.x + r * Math.cos(t));
    const y = Math.round(start.y + r * Math.sin(t) * 0.7);
    if (fits(x, y)) return { wx: x, wy: y };
  }
  return { wx: start.x, wy: start.y };
}

/* ------------------------------------------------------------------ theory of change */
/**
 * A theory of change reads left to right: what we do, so that it produces
 * something, so that early changes happen, so that lasting changes follow,
 * toward the change we seek. Every "so that" rests on an assumption; good
 * plans say what it is, how sure they are, what the evidence is, and which
 * number would tell them to change course (a signpost, in the spirit of
 * adaptive strategy).
 */
export const TOC_LANES = [
  { id: 'activity', label: 'What we do', short: 'Activities', hint: 'Programs, workplans, the work itself' },
  { id: 'output', label: 'What it produces', short: 'Outputs', hint: 'Sessions run, people reached, things made' },
  { id: 'short', label: 'Early changes', short: 'Short-term outcomes', hint: 'What shifts for people in a year or two' },
  { id: 'long', label: 'Lasting changes', short: 'Long-term outcomes', hint: 'What stays different, in people and systems' },
  { id: 'impact', label: 'The change we seek', short: 'Impact', hint: 'The vision this all serves' },
];
export const TOC_CONFIDENCE = [
  { id: 'untested', label: 'Untested', blurb: 'We believe it, but have not checked' },
  { id: 'likely', label: 'Some evidence', blurb: 'Research or experience points this way' },
  { id: 'tested', label: 'Tested', blurb: 'Our own data shows it' },
];
export const laneIndex = (id) => TOC_LANES.findIndex((l) => l.id === id);

/**
 * Ops that lay a plan's structure out as a first theory of change: its
 * workplans as what we do, its goals as early changes, its objectives as
 * lasting changes and the framework's vision as the change we seek, linked
 * the way the plan already nests them. Things already on the board are
 * left alone (matched by strategyId), so it can be run again after the
 * plan grows.
 */
export function tocFromPlan(doc, strategy, planId) {
  const plan = strategy.nodes[planId];
  if (!plan) return [];
  const have = Object.fromEntries(ofPlan(doc, 'toc', planId).filter((x) => x.strategyId).map((x) => [x.strategyId, x.id]));
  const linked = new Set(ofPlan(doc, 'tocLinks', planId).map((l) => `${l.from}>${l.to}`));
  const ops = [];
  const counts = Object.fromEntries(TOC_LANES.map((l) => [l.id, ofPlan(doc, 'toc', planId).filter((x) => x.lane === l.id).length]));
  const put = (node, lane, title = node.title) => {
    if (have[node.id]) return have[node.id];
    const op = studioOps.add('toc', { planId, lane, title, strategyId: node.id, order: counts[lane]++ });
    ops.push(op);
    have[node.id] = op.id;
    return op.id;
  };
  const next = {};
  for (const l of ofPlan(doc, 'tocLinks', planId)) (next[l.from] ??= []).push(l.to);
  // Already connected, perhaps through something added in between (an output)?
  const reaches = (from, to, seen = new Set()) => (next[from] ?? []).some((x) => x === to || (!seen.has(x) && seen.add(x) && reaches(x, to, seen)));
  const link = (from, to) => {
    if (linked.has(`${from}>${to}`) || reaches(from, to)) return;
    linked.add(`${from}>${to}`);
    ops.push(studioOps.add('tocLinks', { planId, from, to, assumption: '', confidence: 'untested', evidence: [], signpost: null }));
  };
  const root = Object.values(strategy.nodes).find((n) => !n.parentId);
  const impact = root?.vision ? put(root, 'impact', root.vision) : null;
  for (const o of childrenOf(strategy, planId).filter((n) => n.type === 'objective')) {
    const ob = put(o, 'long');
    if (impact) link(ob, impact);
    for (const g of childrenOf(strategy, o.id).filter((n) => n.type === 'goal')) {
      const gb = put(g, 'short');
      link(gb, ob);
      for (const w of childrenOf(strategy, g.id).filter((n) => n.type === 'workplan')) link(put(w, 'activity'), gb);
    }
  }
  return ops;
}

/** How ready the theory is: links, and how many have an assumption, evidence and a signpost. */
export function tocReadiness(doc, planId) {
  const items = ofPlan(doc, 'toc', planId);
  const links = ofPlan(doc, 'tocLinks', planId).filter((l) => doc.toc[l.from] && doc.toc[l.to]);
  const ids = new Set(links.flatMap((l) => [l.from, l.to]));
  return {
    items: items.length,
    links: links.length,
    assumed: links.filter((l) => l.assumption?.trim()).length,
    evidenced: links.filter((l) => l.evidence?.length).length,
    tested: links.filter((l) => l.confidence === 'tested').length,
    signposts: links.filter((l) => l.signpost?.measureId).length,
    loose: items.filter((x) => !ids.has(x.id)).length,
    lanesEmpty: TOC_LANES.filter((l) => !items.some((x) => x.lane === l.id)).map((l) => l.label),
  };
}

/**
 * The theory as pathways, one per lasting change: what we do, what it
 * produces, the early changes, the change it serves, and what it rests on.
 * Each pathway is { title, lines: [[label, text]] }; tocMarkdown turns them
 * into text for a plan document, a funder or a board.
 */
export function tocStory(doc, planId) {
  const items = ofPlan(doc, 'toc', planId);
  const links = ofPlan(doc, 'tocLinks', planId).filter((l) => doc.toc[l.from] && doc.toc[l.to]);
  const into = (id) => links.filter((l) => l.to === id);
  const lower = (t) => (t && !/^.[A-Z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t ?? '');
  const list = (xs) => { xs = [...new Set(xs)].map((x, i) => (i ? lower(x) : x)); return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`; };
  const from = (xs, lane) => xs.flatMap((x) => into(x.id).map((l) => doc.toc[l.from])).filter((x) => x.lane === lane);
  return items.filter((x) => x.lane === 'long').sort((a, b) => a.order - b.order).map((lo) => {
    const shorts = from([lo], 'short');
    const outs = [...from(shorts, 'output'), ...from([lo], 'output')];
    const acts = [...from([...shorts, ...outs], 'activity'), ...from([lo], 'activity')];
    const goal = links.filter((l) => l.from === lo.id).map((l) => doc.toc[l.to]).find((x) => x.lane === 'impact');
    const used = links.filter((l) => l.to === lo.id || l.from === lo.id || shorts.some((x) => x.id === l.to) || outs.some((x) => x.id === l.to));
    const beliefs = used.map((l) => l.assumption?.trim().replace(/\.$/, '')).filter(Boolean);
    const lines = [
      acts.length && ['What we do', list(acts.map((x) => x.title))],
      outs.length && ['What it produces', list(outs.map((x) => x.title))],
      shorts.length && ['Early changes', list(shorts.map((x) => x.title))],
      goal && ['Toward', goal.title.replace(/\.$/, '')],
      beliefs.length && ['It rests on', list(beliefs)],
    ].filter(Boolean).map(([k, v]) => [k, `${v}.`]);
    return { title: lo.title, lines };
  });
}
export const tocMarkdown = (story) => story.map((p) => `**${p.title}**\n\n${p.lines.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`).join('\n\n');

/**
 * A Planning Studio for an org that already has its plans in Strategy &
 * Work (0.2, PR 10): each plan gets its operating context, SOAR cards, a
 * result for every measure under it, and the plan assembled on the
 * Assemble canvas, with the cards wired into the goals they feed. The
 * theory of change is left blank, as an org with a plan but no theory yet.
 *
 *   studioFromPlans(strategy, { [planId]: { team, notes, context: [[kind, text]], cards: { s: [text|{text, feeds}] … } } })
 *
 * `feeds` is a pattern for the goal (or objective) a card feeds; the card
 * goes on the canvas wired into it. Pure apart from the generated ids.
 */
export function studioFromPlans(strategy, spec = {}) {
  const doc = blankStudio();
  const at = 1;
  const apply = (op) => { if (op.op === 'add') doc[op.collection][op.id] = { ...op.data, id: op.id, at }; };
  for (const [planId, p] of Object.entries(spec)) {
    const plan = strategy.nodes[planId];
    if (!plan) continue;
    doc.plans[planId] = { id: planId, at, notes: p.notes ?? '', team: p.team ?? [] };
    (p.context ?? []).forEach(([kind, text], i) => { const id = `cx-${planId}-${i + 1}`; doc.context[id] = { id, planId, kind, text, at }; });
    // SOAR cards: spread out from the centre, the first (most important) closest in.
    for (const [q, list] of Object.entries(p.cards ?? {})) list.forEach((c, i) => {
      const card = typeof c === 'string' ? { text: c } : c;
      const id = `card-${planId}-${q}${i + 1}`;
      const r = 260 + i * 190;
      const angle = ((20 + ((i * 29) % 50)) * Math.PI) / 180;
      const [sx, sy] = [q === 's' || q === 'a' ? -1 : 1, q === 's' || q === 'o' ? -1 : 1];
      doc.cards[id] = { id, planId, quadrant: q, text: card.text, detail: card.detail ?? '', wx: Math.round(sx * r * Math.cos(angle)), wy: Math.round(sy * r * Math.sin(angle)), by: (p.team?.[i % Math.max(1, p.team.length)]?.staffId) ?? null, votes: [], assets: [], feeds: card.feeds ?? null, at };
    });
    // A result for every measure under the plan, from the node that holds it (and its first task, if any).
    let ri = 0;
    for (const n of [plan, ...descendants(strategy, planId)]) for (const mz of n.measures ?? []) {
      const id = `res-${planId}-${++ri}`;
      const task = descendants(strategy, n.id).find((x) => x.type === 'task');
      doc.results[id] = { id, planId, title: mz.name, indicator: mz.name, baseline: mz.baseline ?? '', target: mz.target ?? '', unit: mz.unit ?? '', source: '', frequency: 'Quarterly', measureId: mz.id, cardId: null, nodeId: n.id, taskId: task?.id ?? null, x: ((ri - 1) % 3) * 4, y: Math.floor((ri - 1) / 3) * 5, w: 4, h: 5, at };
    }
    // Assemble: the plan as it stands, then the cards that feed a goal, to its left, wired in.
    for (const op of bringInPlan(doc, strategy, planId)) apply(op);
    const blocks = ofPlan(doc, 'blocks', planId);
    let y = 40;
    for (const card of ofPlan(doc, 'cards', planId).filter((c) => c.feeds)) {
      const re = new RegExp(card.feeds, 'i');
      const target = blocks.find((b) => (b.kind === 'goal' || b.kind === 'objective') && re.test(b.title));
      if (!target) continue;
      const id = `bl-${card.id}`;
      doc.blocks[id] = { id, planId, kind: 'card', ref: card.id, title: null, strategyId: null, x: -320, y, at };
      y += 110;
      const wid = `wi-${card.id}`;
      doc.wires[wid] = { id: wid, planId, from: id, to: target.id, at };
    }
    for (const c of ofPlan(doc, 'cards', planId)) delete c.feeds;
  }
  return doc;
}

/**
 * Theory layers: each plan's theory can hold several layers of thinking.
 * "From the plan" holds what was laid out from Plan; "New
 * thinking" holds what the team adds; more can be named. A layer can be
 * hidden on the board. Layers live on the plan's studio record as
 * { id, name, hue }; a toc item's layer is x.layer, or, when it has none,
 * 'plan' if it came from the plan and 'new' if not.
 */
export const BASE_LAYERS = [
  { id: 'plan', name: 'From the plan', hue: 222 },
  { id: 'new', name: 'New thinking', hue: 32 },
];
export const layersOf = (doc, planId) => {
  const own = doc.plans?.[planId]?.tocLayers ?? [];
  return [...BASE_LAYERS.map((b) => ({ ...b, ...own.find((l) => l.id === b.id) })), ...own.filter((l) => !BASE_LAYERS.some((b) => b.id === l.id))];
};
export const layerOf = (x) => x.layer ?? (x.strategyId ? 'plan' : 'new');

/** Which level each theory column becomes in the plan. */
export const TOC_TO_LEVEL = { long: 'objective', short: 'goal', activity: 'workplan', output: 'task' };

/**
 * Send the theory of change to the plan as drafts: lasting changes become
 * objectives, early changes goals, what we do workplans and what it
 * produces tasks (Planned), each placed under what it leads to. The change
 * we seek fills the framework's vision if that is empty. The assumption
 * behind a box's links, and any signposts, go in its notes.
 *
 * Only boxes not yet in the plan are made, as drafts ({ draft: true,
 * fromToc }), so the team can accept or discard each one in Strategy &
 * Work. Sending again updates drafts it made before. Boxes that came from
 * the plan, or whose draft was accepted, are left as they are.
 *
 * layers: which layers to send (default every layer).
 * Returns { strategyOps, studioOps, preview: [{ tocId, type, title, parentTitle, action }], loose: [title] }.
 */
export function tocToPlan(doc, strategy, planId, { layers = null } = {}) {
  const plan = strategy.nodes[planId];
  const out = { strategyOps: [], studioOps: [], preview: [], loose: [] };
  if (!plan) return out;
  const nodes = { ...strategy.nodes };
  const items = ofPlan(doc, 'toc', planId);
  const links = ofPlan(doc, 'tocLinks', planId).filter((l) => doc.toc[l.from] && doc.toc[l.to]);
  const sending = (x) => !layers || layers.includes(layerOf(x));
  const outsOf = (id) => links.filter((l) => l.from === id).map((l) => doc.toc[l.to]);
  const insOf = (id) => links.filter((l) => l.to === id).map((l) => doc.toc[l.from]);
  const measures = measureIndex(strategy);
  const notesFor = (x) => {
    const lines = links.filter((l) => l.from === x.id && (l.assumption || l.signpost?.measureId)).map((l) => {
      const to = doc.toc[l.to].title;
      const m = l.signpost?.measureId && measures[l.signpost.measureId];
      return [l.assumption && `- So that “${to}”, because we believe: ${l.assumption}`, m && `- Signpost: ${m.name}${l.signpost.note ? `. We would rethink this if ${l.signpost.note}` : ''}`].filter(Boolean).join('\n');
    });
    return `From the theory of change (draft).${lines.length ? `\n${lines.join('\n')}` : ''}`;
  };
  const made = {};   // toc id → node id, this pass
  const nodeFor = (x) => made[x.id] ?? (x.strategyId && nodes[x.strategyId] ? x.strategyId : null);
  const place = (x, type, parentId, parentTitle) => {
    const have = x.strategyId && nodes[x.strategyId];
    if (have && !have.draft) { made[x.id] = have.id; return have.id; }
    if (have) {
      const patch = { title: x.title, notes: notesFor(x) };
      if (have.parentId !== parentId) patch.parentId = parentId;
      out.strategyOps.push(strategyOps.update(have.id, patch));
      out.preview.push({ tocId: x.id, type, title: x.title, parentTitle, action: 'update' });
      made[x.id] = have.id;
      return have.id;
    }
    const op = strategyOps.addNode({ nodes }, { type, parentId, title: x.title, notes: notesFor(x), draft: true, fromToc: x.id, tocLayer: layerOf(x) });
    nodes[op.id] = { ...op.data, id: op.id };
    out.strategyOps.push(op);
    out.studioOps.push(studioOps.update('toc', x.id, { strategyId: op.id, layer: layerOf(x) }));
    out.preview.push({ tocId: x.id, type, title: x.title, parentTitle, action: 'new' });
    made[x.id] = op.id;
    return op.id;
  };
  const byLane = (lane) => items.filter((x) => x.lane === lane).sort((a, b) => a.order - b.order);

  // The change we seek: the framework's vision, if it has none yet.
  const root = Object.values(nodes).find((n) => !n.parentId);
  const impact = byLane('impact').find(sending);
  if (root && impact && !root.vision && !impact.strategyId) {
    out.strategyOps.push(strategyOps.update(root.id, { vision: impact.title }));
    out.preview.push({ tocId: impact.id, type: 'framework', title: impact.title, parentTitle: null, action: 'vision' });
  }
  for (const x of byLane('long')) if (sending(x) || nodeFor(x)) {
    if (sending(x)) place(x, 'objective', planId, plan.title);
  }
  // Each later column goes under the first thing it leads to that is (or is about to be) in the plan.
  const parentIn = (x, lanes) => {
    for (const to of outsOf(x.id)) if (lanes.includes(to.lane) && nodeFor(to)) return to;
    // An activity may lead to an early change only through what it produces.
    for (const mid of outsOf(x.id)) for (const to of outsOf(mid.id)) if (lanes.includes(to.lane) && nodeFor(to)) return to;
    return null;
  };
  /*
   * What doesn't lead to anything in the plan still goes, so a new theory
   * makes a new set of goals and objectives: under a holder for its layer
   * ("New thinking: from the theory of change"), an objective, with a goal
   * and a workplan under it as needed. Sending again finds the same holders.
   */
  const layerName = (id) => layersOf(doc, planId).find((l) => l.id === id)?.name ?? 'Theory of change';
  const holder = (layer, type) => {
    const key = `${layer}:${type}`;
    const found = Object.values(nodes).find((n) => n.tocHolder === key && n.draft);
    if (found) return found.id;
    const parentId = type === 'objective' ? planId : holder(layer, type === 'goal' ? 'objective' : 'goal');
    const title = { objective: `${layerName(layer)}: from the theory of change`, goal: `${layerName(layer)}: early changes`, workplan: `${layerName(layer)}: what we do` }[type];
    const op = strategyOps.addNode({ nodes }, { type, parentId, title, notes: 'Gathers what the theory of change sent that doesn’t lead to anything in the plan yet. Move things out, rename it, or accept it as it is.', draft: true, tocHolder: key, tocLayer: layer });
    nodes[op.id] = { ...op.data, id: op.id };
    out.strategyOps.push(op);
    out.preview.push({ tocId: null, type, title, parentTitle: nodes[parentId]?.title ?? plan.title, action: 'new', holder: true });
    return op.id;
  };
  const placeLoose = (x, type, holderType) => { out.loose.push(x.title); place(x, type, holder(layerOf(x), holderType), nodes[holder(layerOf(x), holderType)].title); };
  for (const x of byLane('short').filter(sending)) {
    const p = parentIn(x, ['long']);
    if (p) place(x, 'goal', nodeFor(p), p.title); else placeLoose(x, 'goal', 'objective');
  }
  for (const x of byLane('activity').filter(sending)) {
    const p = parentIn(x, ['short']);
    if (p) place(x, 'workplan', nodeFor(p), p.title); else placeLoose(x, 'workplan', 'goal');
  }
  for (const x of byLane('output').filter(sending)) {
    const from = insOf(x.id).find((a) => a.lane === 'activity' && nodeFor(a));
    if (from) place(x, 'task', nodeFor(from), from.title); else placeLoose(x, 'task', 'workplan');
  }
  return out;
}

/** The drafts the theory of change made, and ops to accept or discard them. */
export const draftsOf = (strategy) => Object.values(strategy.nodes).filter((n) => n.draft);
export const acceptDraftOps = (strategy, id) => [id, ...ancestorDrafts(strategy, id)]
  .filter((x, i, a) => a.indexOf(x) === i && strategy.nodes[x]?.draft).map((x) => strategyOps.update(x, { draft: false }));
// Accepting a draft goal accepts the draft objective it sits under too, so nothing real hangs off a draft.
const ancestorDrafts = (strategy, id) => { const out = []; for (let n = strategy.nodes[strategy.nodes[id]?.parentId]; n; n = strategy.nodes[n.parentId]) if (n.draft) out.push(n.id); return out; };
