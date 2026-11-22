/**
 * The rack (Rhizome stage 3): build analyses by cabling modules together,
 * like a modular synth. A patch is data, just like a rule:
 *
 *   patch { id, name, visibility: 'public' | 'private', modules: [Module], cables: [Cable], at }
 *   Module { id, type, rack: 'a' | 'b', params }  in rack order: they flow into rows, left to right
 *
 * Twin racks: rack A holds the controls (sources, shapers, logic, voice),
 * rack B the screens and the engines, so you can turn a knob on the left
 * and watch the right. Cables run across both.
 *   Cable  { id, from: { m, port }, to: { m, port }, color }
 *
 * Signals on the cables are streams of rows (the same rows a rule looks at),
 * or, after a Say module, findings. runPatch works them out in cable order,
 * so every screen and meter in the rack shows what's flowing through it.
 *
 * A straight chain (source → filters → weigh → say) is a rule, and a rule is
 * a straight chain: ruleToPatch opens any rule in the rack, and patchToRule
 * turns a patch back into a rule you can add to your analyses.
 */
import { rowsFor, check, weigh, OPS, ruleById } from './rules.js';
import { tipById, fillTip, SOURCES } from './tips.js';
import { ENTITY_TYPES } from './facts.js';
import { graphOf, neighbourhood, triadsOf, communities, entityRows } from './rackGraph.js';

export const HP = 42; // a rack row is 42 HP wide (each of the twin racks is half an 84 HP case)

/** Which plugin each measure list comes from (for the plugin gate on a compiled rule). */
export const LIST_SOURCE = {
  isolates: 'mapper', fewLinks: 'mapper', hubs: 'mapper', bridges: 'mapper', oneWay: 'mapper', zoneGaps: 'mapper',
  hollowObjectives: 'strategy', hollowGoals: 'strategy', unstaffed: 'strategy', blockedWork: 'strategy', overdue: 'strategy',
  unusedAssets: 'assets', abcdThin: 'assets', looseIdeas: 'studio', untestedLinks: 'studio', unsupportedOutcomes: 'studio', unplaced: 'place',
};
export const TYPE_SOURCE = { map: 'mapper', actor: 'mapper', group: 'mapper', person: 'org', asset: 'assets', collection: 'assets', framework: 'strategy', plan: 'strategy', objective: 'strategy', goal: 'strategy', workplan: 'strategy', task: 'strategy', soar: 'studio', context: 'studio', result: 'studio', block: 'studio', outcome: 'studio', place: 'place' };

/** Fields a filter or weigh knob can look at. */
export const FIELDS = {
  degree: 'links', betweenness: 'betweenness', inDeg: 'links in', outDeg: 'links out', value: 'value', votes: 'votes', measures: 'measures', staff: 'people on it',
  category: 'category', abcd: 'ABCD type', lane: 'lane', confidence: 'confidence', basis: 'basis', used: 'used by a plan', wired: 'wired in', cut: 'single point of failure', draft: 'draft',
};
const NUMERIC = new Set(['degree', 'betweenness', 'inDeg', 'outDeg', 'value', 'votes', 'measures', 'staff']);
export const isNumeric = (field) => NUMERIC.has(field);

/**
 * The module catalogue. `look` is analog (the 50s rack: wood, CRT, knobs) or
 * digital (the engines: modern glass). `hp` is the panel width.
 */
export const MODULES = {
  patchbay: { label: 'Patchbay', cat: 'Routing', look: 'analog', hp: 42, ins: ['1', '2', '3', '4'], outs: ['1', '2', '3', '4'], blurb: 'The routing strip at the top of the rack: each input comes out of its output below, so one signal can feed many places.' },
  facts: { label: 'Facts', cat: 'Sources', look: 'analog', hp: 8, brand: true, ins: [], outs: ['out'], params: { type: 'actor' }, blurb: 'Every thing of one type, from the fact layer.' },
  measure: { label: 'Measure', cat: 'Sources', look: 'analog', hp: 6, brand: true, ins: [], outs: ['out'], params: { list: 'isolates' }, blurb: 'A list the measures worked out: isolates, hubs, hollow objectives…' },
  filter: { label: 'Filter', cat: 'Shapers', look: 'analog', hp: 6, brand: true, ins: ['in'], outs: ['pass', 'reject'], params: { field: 'degree', op: 'lte', pct: 'p25', value: null }, blurb: 'Lets through the rows that meet a condition; the rest go out of reject.' },
  weigh: { label: 'Weigh', cat: 'Shapers', look: 'analog', hp: 7, brand: true, ins: ['in'], outs: ['out'], params: { base: 0.5, field: 'betweenness', w: 0.3 }, blurb: 'Gives each row a score from 0 to 1, so findings can be ranked.' },
  gate: { label: 'Gate', cat: 'Logic', look: 'analog', hp: 5, ins: ['a', 'b'], outs: ['out'], params: { mode: 'and' }, blurb: 'AND: in both. OR: in either. NOT: in A but not B.' },
  complement: { label: 'Complement', short: 'Compl.', cat: 'Sets & graphs', look: 'analog', hp: 5, ins: ['in'], outs: ['out'], params: {}, blurb: 'Set theory’s “everything else”: every thing of the same type that is not coming in.' },
  neighbours: { label: 'Neighbours', short: 'Neigh.', cat: 'Sets & graphs', look: 'analog', hp: 6, ins: ['in'], outs: ['ring', 'ball'], params: { hops: 1 }, blurb: 'Walks the ties out from what comes in, one to three hops. Ring: only the new things it reaches. Ball: the start and the ring together.' },
  triads: { label: 'Triads', cat: 'Sets & graphs', look: 'analog', hp: 6, ins: ['in'], outs: ['closed', 'open'], params: {}, blurb: 'Looks at each thing’s pairs of neighbours. Closed: tight circles, where neighbours know each other. Open: brokers sitting across structural holes.' },
  prism: { label: 'Prism', cat: 'Sets & graphs', look: 'analog', hp: 6, ins: ['in'], outs: ['1', '2', '3'], params: {}, blurb: 'Splits what comes in by community, like light through glass: the three biggest clusters each get an output.' },
  say: { label: 'Say', cat: 'Voice', look: 'analog', hp: 9, brand: true, ins: ['in'], outs: ['out'], params: { tip: 'net-isolates', group: false }, blurb: 'Turns rows into findings, in the words of a tip.' },
  scope: { label: 'Scope', cat: 'Displays', look: 'analog', hp: 18, brand: true, ins: ['in'], outs: [], params: { phosphor: 'green' }, blurb: 'A CRT screen: shows what’s flowing in.' },
  meter: { label: 'VU meter', short: 'VU', cat: 'Displays', look: 'analog', hp: 6, ins: ['in'], outs: ['thru'], params: {}, blurb: 'A needle for how many rows flow through, and their top score.' },
  plotter: { label: 'Plotter', cat: 'Displays', look: 'analog', hp: 18, brand: true, ins: ['in'], outs: [], params: { ink: 'blue' }, blurb: 'A pen plotter: draws what comes in as a little network on paper, with the ties between them.' },
  spectrum: { label: 'Spectrum', short: 'Spect.', cat: 'Displays', look: 'analog', hp: 12, ins: ['in'], outs: ['thru'], params: { field: 'degree' }, blurb: 'A bar spectrum of one number across the rows, so you can see the spread at a glance.' },
  venn: { label: 'Venn', cat: 'Displays', look: 'analog', hp: 12, ins: ['a', 'b', 'c'], outs: ['all'], params: {}, blurb: 'Three circles and the counts in every overlap. Out: what is in all the circles you patched.' },
  visualiser: { label: 'AI visualiser', cat: 'Engines', look: 'digital', hp: 12, ins: ['in'], outs: [], stage: 4, blurb: 'A tiny inference engine that shows, step by step, what happens when you ask a system a question.' },
  claude: { label: 'Claude engine', cat: 'Engines', look: 'digital', hp: 12, ins: ['in'], outs: ['out'], stage: 5, blurb: 'Real questions of your facts, through the server, with your own key and cost caps.' },
  slot: { label: 'Open engine slot', cat: 'Engines', look: 'digital', hp: 7, ins: ['in'], outs: ['out'], stage: null, blurb: 'Room for another engine later. Every engine plugs in the same way: facts and a question in, findings out.' },
};
export const CATEGORIES = ['Routing', 'Sources', 'Shapers', 'Logic', 'Sets & graphs', 'Voice', 'Displays', 'Engines'];
/** Cable colours, as patch cables come: red, yellow, blue, green, black, white, orange, violet. */
export const CABLE_COLORS = ['#d23c2c', '#f2c12e', '#2f6fd6', '#3f9a4c', '#22252b', '#f4f1e8', '#ee7d2b', '#8a4fd8'];

let seq = 0;
const nid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankPatch = (name = 'New patch') => ({ id: nid('patch-'), name, visibility: 'public', modules: [], cables: [], at: null });

export function addModule(patch, type, params = {}) {
  const def = MODULES[type];
  if (!def) return null;
  const m = { id: nid('m'), type, rack: defaultRack(type), params: { ...structuredClone(def.params ?? {}), ...params } };
  // The patchbay always sits at the top.
  if (type === 'patchbay') patch.modules.unshift(m); else patch.modules.push(m);
  return m;
}

/** Screens and engines go in the right-hand rack; everything else in the left. */
export const defaultRack = (type) => (['Displays', 'Engines'].includes(MODULES[type]?.cat) ? 'b' : 'a');
export const inRack = (patch, rack) => patch.modules.filter((m) => (m.rack ?? defaultRack(m.type)) === rack);
/** Move a module to the other rack. */
export function swapRack(patch, id) {
  const m = patch.modules.find((x) => x.id === id);
  if (!m || m.type === 'patchbay') return false;
  m.rack = (m.rack ?? defaultRack(m.type)) === 'a' ? 'b' : 'a';
  return true;
}

export function removeModule(patch, id) {
  patch.modules = patch.modules.filter((m) => m.id !== id);
  patch.cables = patch.cables.filter((c) => c.from.m !== id && c.to.m !== id);
}

/** Move a module left (-1) or right (+1) within its rack. */
export function moveModule(patch, id, by) {
  const m = patch.modules.find((x) => x.id === id);
  if (!m || m.type === 'patchbay') return false;
  const same = inRack(patch, m.rack ?? defaultRack(m.type));
  const k = same.indexOf(m) + by;
  const other = same[k];
  if (!other || other.type === 'patchbay') return false;
  const i = patch.modules.indexOf(m), j = patch.modules.indexOf(other);
  [patch.modules[i], patch.modules[j]] = [patch.modules[j], patch.modules[i]];
  return true;
}

/** Rows of a rack: modules flowed left to right, a new row when one is full (42 HP). */
export function rowsOf(mods) {
  const rows = [];
  let row = [], used = 0;
  for (const m of mods) {
    const hp = MODULES[m.type]?.hp ?? 10;
    if (used + hp > HP && row.length) { rows.push(row); row = []; used = 0; }
    row.push(m); used += hp;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Would a cable from → to make a loop? */
function loops(patch, fromM, toM) {
  const next = (id) => patch.cables.filter((c) => c.from.m === id).map((c) => c.to.m);
  const seen = new Set();
  const stack = [toM];
  while (stack.length) {
    const x = stack.pop();
    if (x === fromM) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...next(x));
  }
  return false;
}

/** Patch an output into an input. An input takes one cable (a new one replaces it); an output can feed many. */
export function connect(patch, from, to, color) {
  const a = patch.modules.find((m) => m.id === from.m);
  const b = patch.modules.find((m) => m.id === to.m);
  if (!a || !b || a.id === b.id) return null;
  if (!MODULES[a.type].outs.includes(from.port) || !MODULES[b.type].ins.includes(to.port)) return null;
  if (loops(patch, a.id, b.id)) return null;
  patch.cables = patch.cables.filter((c) => !(c.to.m === to.m && c.to.port === to.port));
  const cable = { id: nid('c'), from: { m: from.m, port: from.port }, to: { m: to.m, port: to.port }, color: color || CABLE_COLORS[patch.cables.length % CABLE_COLORS.length] };
  patch.cables.push(cable);
  return cable;
}
export const disconnect = (patch, id) => { patch.cables = patch.cables.filter((c) => c.id !== id); };

/** Modules in cable order (sources first). */
export function order(patch) {
  const ids = patch.modules.map((m) => m.id);
  const indeg = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const c of patch.cables) if (indeg[c.to.m] != null) indeg[c.to.m]++;
  const out = [];
  const queue = ids.filter((id) => !indeg[id]);
  while (queue.length) {
    const id = queue.shift();
    out.push(id);
    for (const c of patch.cables.filter((x) => x.from.m === id)) if (--indeg[c.to.m] === 0) queue.push(c.to.m);
  }
  return out;
}

const empty = () => ({ kind: 'rows', rows: [] });

/**
 * Run a patch over the facts. Returns { signals: { moduleId: { port: Signal } },
 * inputs: { moduleId: { port: Signal } } }, so each module can show what it gets.
 * Signal = { kind: 'rows', rows } | { kind: 'findings', findings }.
 */
export function runPatch(patch, ctx) {
  const cal = ctx.calibration ?? ctx.measures.calibration;
  const byId = Object.fromEntries(patch.modules.map((m) => [m.id, m]));
  const signals = {};
  const inputs = {};
  for (const id of order(patch)) {
    const m = byId[id];
    const def = MODULES[m.type];
    const ins = {};
    for (const port of def.ins) {
      const c = patch.cables.find((x) => x.to.m === id && x.to.port === port);
      ins[port] = c ? signals[c.from.m]?.[c.from.port] ?? empty() : null;
    }
    inputs[id] = ins;
    const p = m.params ?? {};
    const rowsIn = (s) => (s?.kind === 'rows' ? s.rows : []);
    let out = {};
    if (m.type === 'facts') out.out = { kind: 'rows', rows: rowsFor({ from: { type: p.type } }, ctx).map((r) => ({ ...r, _checks: [] })) };
    else if (m.type === 'measure') out.out = { kind: 'rows', rows: rowsFor({ from: { list: p.list } }, ctx).map((r) => ({ ...r, _checks: [] })) };
    else if (m.type === 'filter') {
      const cond = filterCond(p);
      const pass = [], fail = [];
      for (const r of rowsIn(ins.in)) {
        const c = check(cond, r, cal);
        (c.ok ? pass : fail).push({ ...r, _checks: [...(r._checks ?? []), c] });
      }
      out = { pass: { kind: 'rows', rows: pass }, reject: { kind: 'rows', rows: fail } };
    } else if (m.type === 'weigh') {
      const rule = { theme: p.theme ?? null, weigh: weighOf(p) };
      out.out = { kind: 'rows', rows: rowsIn(ins.in).map((r) => ({ ...r, _w: weigh(rule, r, ctx) })).sort((a, b) => b._w.score - a._w.score) };
    } else if (m.type === 'gate') {
      const a = rowsIn(ins.a), b = rowsIn(ins.b);
      const bIds = new Set(b.map((r) => r.id));
      const aIds = new Set(a.map((r) => r.id));
      const rows = p.mode === 'or' ? [...a, ...b.filter((r) => !aIds.has(r.id))] : p.mode === 'not' ? a.filter((r) => !bIds.has(r.id)) : a.filter((r) => bIds.has(r.id));
      out.out = { kind: 'rows', rows };
    } else if (m.type === 'say') out.out = { kind: 'findings', findings: sayRows(rowsIn(ins.in), p, m.id) };
    else if (m.type === 'meter' || m.type === 'spectrum') out.thru = ins.in ?? empty();
    else if (m.type === 'complement') {
      const rows = rowsIn(ins.in);
      const type = rows.find((r) => r.type)?.type ?? null;
      const have = new Set(rows.map((r) => r.id));
      out.out = { kind: 'rows', rows: type ? entityRows(ctx).filter((r) => r.type === type && !have.has(r.id)).map((r) => ({ ...r, _checks: [] })) : [] };
    } else if (m.type === 'neighbours') {
      const rows = rowsIn(ins.in);
      const { ring } = neighbourhood(graphOf(ctx.facts), rows.map((r) => r.id), Math.min(3, Math.max(1, Number(p.hops) || 1)));
      const byIdRow = Object.fromEntries(entityRows(ctx).map((r) => [r.id, r]));
      const ringRows = ring.map((id) => byIdRow[id]).filter(Boolean).map((r) => ({ ...r, _checks: [] }));
      out = { ring: { kind: 'rows', rows: ringRows }, ball: { kind: 'rows', rows: [...rows, ...ringRows] } };
    } else if (m.type === 'triads') {
      const g = graphOf(ctx.facts);
      const closed = [], open = [];
      for (const r of rowsIn(ins.in)) {
        const t = triadsOf(g, r.id);
        if (t.pairs === 0) continue; // fewer than two neighbours: no triads to look at
        (t.closed / t.pairs >= 0.5 ? closed : open).push({ ...r, _tri: t });
      }
      out = { closed: { kind: 'rows', rows: closed }, open: { kind: 'rows', rows: open } };
    } else if (m.type === 'prism') {
      const comm = communities(graphOf(ctx.facts));
      const groups = {};
      for (const r of rowsIn(ins.in)) (groups[comm.get(r.id) ?? `solo:${r.id}`] ??= []).push(r);
      const top = Object.values(groups).sort((a, b) => b.length - a.length);
      for (const [i, port] of ['1', '2', '3'].entries()) out[port] = { kind: 'rows', rows: top[i] ?? [] };
    } else if (m.type === 'venn') {
      const sets = ['a', 'b', 'c'].filter((k) => ins[k]).map((k) => rowsIn(ins[k]));
      if (!sets.length) out.all = empty();
      else {
        const rest = sets.slice(1).map((s) => new Set(s.map((r) => r.id)));
        out.all = { kind: 'rows', rows: sets[0].filter((r) => rest.every((s) => s.has(r.id))) };
      }
    }
    else if (m.type === 'patchbay') for (const port of def.outs) out[port] = ins[port] ?? empty();
    else if (m.type === 'claude' || m.type === 'slot') out.out = empty(); // engines arrive in later stages
    signals[id] = out;
  }
  return { signals, inputs };
}

export const filterCond = (p) => ({ field: p.field, op: p.op, ...(p.pct && isNumeric(p.field) && !['yes', 'no'].includes(p.op) ? { pct: p.pct } : { value: p.value }) });
export const weighOf = (p) => ({ base: Number(p.base ?? 0.5), plus: p.field && Number(p.w) ? [{ field: p.field, w: Number(p.w), ...(['degree', 'betweenness'].includes(p.field) ? { scale: p.field } : { cap: p.cap ?? 10 }) }] : [] });

function sayRows(rows, p, mid) {
  const tip = tipById[p.tip];
  if (!rows.length) return [];
  const scored = rows.map((r) => ({ r, score: r._w?.score ?? 0.5 }));
  if (p.group) {
    const names = rows.slice(0, 3).map((r) => r.name);
    const items = rows.length > 3 ? `${names.join(', ')} and ${rows.length - 3} more` : names.join(', ');
    return [{ id: `${mid}:all`, score: Math.max(...scored.map((x) => x.score)), text: fillTip(tip?.text ?? 'A finding', { count: rows.length, items, map: rows[0].map, name: rows[0].name }), items: [...new Set(rows.flatMap((r) => r.items ?? []))], rows: rows.map((r) => ({ id: r.id, name: r.name })) }];
  }
  return scored.map(({ r, score }) => ({ id: `${mid}:${r.id}`, score, text: fillTip(tip?.text ?? 'A finding', { ...r, label: r.label ?? r.name, count: 1 }), items: r.items ?? [], rows: [{ id: r.id, name: r.name }] }))
    .sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------ rules and patches */

/** Open a rule in the rack: source → a filter per condition → weigh → say → scope. */
export function ruleToPatch(rule) {
  const patch = blankPatch(rule.name);
  patch.from = rule.id;
  const src = rule.from.list ? addModule(patch, 'measure', { list: rule.from.list }) : addModule(patch, 'facts', { type: rule.from.type });
  let last = { m: src.id, port: 'out' };
  for (const c of rule.when) {
    const f = addModule(patch, 'filter', { field: c.field, op: c.op, pct: c.pct ?? null, value: c.value ?? null });
    connect(patch, last, { m: f.id, port: 'in' });
    last = { m: f.id, port: 'pass' };
  }
  const t = rule.weigh.plus?.[0];
  const w = addModule(patch, 'weigh', { base: rule.weigh.base, field: t?.field ?? null, w: t?.w ?? 0, cap: t?.cap, theme: rule.theme });
  connect(patch, last, { m: w.id, port: 'in' });
  const meter = addModule(patch, 'meter');
  connect(patch, { m: w.id, port: 'out' }, { m: meter.id, port: 'in' });
  const say = addModule(patch, 'say', { tip: rule.say, group: !!rule.group });
  connect(patch, { m: meter.id, port: 'thru' }, { m: say.id, port: 'in' });
  const scope = addModule(patch, 'scope');
  connect(patch, { m: say.id, port: 'out' }, { m: scope.id, port: 'in' });
  return patch;
}

/**
 * Turn a patch into a rule, if it is a straight chain into a Say module:
 * { rule } or { problem } saying why not.
 */
export function patchToRule(patch, { id = null } = {}) {
  const say = patch.modules.find((m) => m.type === 'say');
  if (!say) return { problem: 'Add a Say module: a rule needs words.' };
  const byId = Object.fromEntries(patch.modules.map((m) => [m.id, m]));
  const feed = (mid, port) => patch.cables.find((c) => c.to.m === mid && c.to.port === port);
  const when = [];
  let weighP = null;
  let cur = feed(say.id, 'in');
  let source = null;
  for (let guard = 0; cur && guard < 50; guard++) {
    const m = byId[cur.from.m];
    if (m.type === 'facts' || m.type === 'measure') { source = m; break; }
    if (m.type === 'filter') { if (cur.from.port !== 'pass') return { problem: 'A rule only follows a filter’s pass output.' }; when.unshift(filterCond(m.params)); cur = feed(m.id, 'in'); }
    else if (m.type === 'weigh') { weighP = m.params; cur = feed(m.id, 'in'); }
    else if (m.type === 'meter' || m.type === 'spectrum') cur = feed(m.id, 'in');
    else if (m.type === 'patchbay') cur = feed(m.id, cur.from.port);
    else return { problem: `A ${MODULES[m.type].label} can’t be part of a plain rule yet: keep it as a patch.` };
  }
  if (!source) return { problem: 'Cable a Facts or Measure module into the chain.' };
  const tip = tipById[say.params.tip];
  const from = source.type === 'facts' ? { type: source.params.type } : { list: source.params.list };
  const rule = {
    id: id ?? `own-${patch.id.replace(/^patch-/, '')}`, name: patch.name || 'My rule', theme: weighP?.theme ?? tip?.theme ?? 'network',
    source: from.list ? LIST_SOURCE[from.list] ?? 'mapper' : TYPE_SOURCE[from.type] ?? 'mapper',
    from, when, weigh: weighOf(weighP ?? { base: 0.5 }), say: say.params.tip, show: 'list', own: true,
    ...(say.params.group ? { group: true } : {}),
  };
  return { rule };
}

/** A patch to start from: community voices on the edge, through a meter, into words, onto a screen, and on to the engines. */
export function starterPatch() {
  const p = ruleToPatch(ruleById['community-thin'] ?? Object.values(ruleById)[0]);
  p.name = 'My first patch';
  delete p.from;
  addModule(p, 'patchbay');
  // The engines, waiting in rack B: the visualiser watches the weighed rows, Claude hears the findings.
  const weighM = p.modules.find((m) => m.type === 'weigh');
  const sayM = p.modules.find((m) => m.type === 'say');
  // A pen plotter beside the scope, drawing everything the source finds and the ties between them.
  const src = p.modules.find((m) => m.type === 'facts' || m.type === 'measure');
  const plot = addModule(p, 'plotter');
  if (src) connect(p, { m: src.id, port: 'out' }, { m: plot.id, port: 'in' });
  const vis = addModule(p, 'visualiser');
  const cl = addModule(p, 'claude');
  if (weighM) connect(p, { m: weighM.id, port: 'out' }, { m: vis.id, port: 'in' });
  if (sayM) connect(p, { m: sayM.id, port: 'out' }, { m: cl.id, port: 'in' });
  return p;
}

/** What a module's params say, in words (the rack's paper label, and tests). */
export function describeModule(m) {
  const p = m.params ?? {};
  if (m.type === 'facts') return `every ${ENTITY_TYPES[p.type]?.label.toLowerCase() ?? p.type}`;
  if (m.type === 'measure') return p.list;
  if (m.type === 'filter') return `${FIELDS[p.field] ?? p.field} ${OPS[p.op]?.label ?? p.op}${['yes', 'no'].includes(p.op) ? '' : p.pct && isNumeric(p.field) ? ` your ${p.pct}` : ` ${p.value ?? ''}`}`.trim();
  if (m.type === 'weigh') return `${p.base} + ${p.w} × ${FIELDS[p.field] ?? p.field ?? 'nothing'}`;
  if (m.type === 'gate') return p.mode.toUpperCase();
  if (m.type === 'say') return `${p.tip}${p.group ? ', grouped' : ''}`;
  if (m.type === 'neighbours') return `${p.hops ?? 1} ${Number(p.hops ?? 1) === 1 ? 'hop' : 'hops'} out`;
  if (m.type === 'spectrum') return `spread of ${FIELDS[p.field] ?? p.field}`;
  return MODULES[m.type]?.label ?? m.type;
}

export { SOURCES };
