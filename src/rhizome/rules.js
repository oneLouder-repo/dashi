/**
 * Rhizome's rules engine (Rhizome stage 2): offline, not promptable, and
 * every finding can be traced back to the rule and the facts behind it.
 *
 * A rule is data, not code (the rack in stage 3 draws the same JSON):
 *
 *   {
 *     id, name, theme, source,           which plugin's facts it reads
 *     from: { list } | { type },         what it looks at: a measure's list, or every entity of a type
 *     when: [{ field, op, value | pct }],  all must hold; pct compares with the org's calibration
 *     weigh: { base, plus: [{ field, w, scale? }] },   a score from 0 to 1, for ranking
 *     say: tipId,                        the words, from the tip library
 *     group: true,                       one finding for everything that matched, not one each
 *     show: 'map' | 'list',              what to light up
 *   }
 *
 * A canned analysis is a named set of rules. Running one gives findings:
 *   { id, ruleId, analysisId, score, title, text, items: [entity ids], subject, why }
 */
import { tipById, fillTip, SOURCES } from './tips.js';

/** Condition operators, in the words the Why? panel uses. */
export const OPS = {
  eq: { label: 'is', test: (a, b) => a === b },
  ne: { label: 'is not', test: (a, b) => a !== b },
  gt: { label: 'is more than', test: (a, b) => a > b },
  gte: { label: 'is at least', test: (a, b) => a >= b },
  lt: { label: 'is less than', test: (a, b) => a < b },
  lte: { label: 'is at most', test: (a, b) => a <= b },
  in: { label: 'is one of', test: (a, b) => (b ?? []).includes(a) },
  yes: { label: 'is true', test: (a) => !!a },
  no: { label: 'is false', test: (a) => !a },
};
const PCT = { p25: '25th percentile', p50: 'median', p75: '75th percentile', p90: '90th percentile' };

export const RULES = [
  // Ecosystem
  { id: 'single-point', name: 'Single points of failure', theme: 'network', source: 'mapper', from: { list: 'bridges' }, when: [],
    weigh: { base: 0.5, plus: [{ field: 'betweenness', w: 0.4, scale: 'betweenness' }] }, say: 'net-bridge', show: 'map' },
  { id: 'hub-load', name: 'Hubs carrying a lot', theme: 'network', source: 'mapper', from: { list: 'hubs' }, when: [{ field: 'degree', op: 'gte', pct: 'p90' }],
    weigh: { base: 0.4, plus: [{ field: 'degree', w: 0.3, scale: 'degree' }] }, say: 'net-hub', show: 'map' },
  { id: 'isolates', name: 'Actors linked to nobody', theme: 'network', source: 'mapper', from: { list: 'isolates' }, when: [], group: true,
    weigh: { base: 0.5, plus: [] }, say: 'net-isolates', show: 'map' },
  { id: 'gatekeeper-distant', name: 'Gatekeepers you barely touch', theme: 'leverage', source: 'mapper', from: { type: 'actor' },
    when: [{ field: 'category', op: 'eq', value: 'gatekeeper' }, { field: 'degree', op: 'lte', pct: 'p25' }],
    weigh: { base: 0.6, plus: [] }, say: 'lev-gatekeeper', show: 'map' },
  { id: 'problem-central', name: 'Problems in the middle of the flows', theme: 'leverage', source: 'mapper', from: { type: 'actor' },
    when: [{ field: 'category', op: 'eq', value: 'problem' }, { field: 'betweenness', op: 'gte', pct: 'p75' }, { field: 'betweenness', op: 'gt', value: 0 }],
    weigh: { base: 0.45, plus: [{ field: 'betweenness', w: 0.35, scale: 'betweenness' }] }, say: 'lev-problem-central', show: 'map' },
  { id: 'community-thin', name: 'Community voices on the edge', theme: 'equity', source: 'mapper', from: { type: 'actor' },
    when: [{ field: 'category', op: 'eq', value: 'community' }, { field: 'degree', op: 'lte', pct: 'p25' }, { field: 'degree', op: 'gt', value: 0 }],
    weigh: { base: 0.5, plus: [] }, say: 'eq-community-thin', show: 'map' },
  { id: 'resource-one-way', name: 'Resources that only flow one way', theme: 'network', source: 'mapper', from: { list: 'oneWay' }, when: [{ field: 'rel', op: 'eq', value: 'resource-flow' }], group: true,
    weigh: { base: 0.45, plus: [] }, say: 'net-reciprocity', show: 'map' },
  { id: 'power-one-way', name: 'Power that only runs one way', theme: 'water', source: 'mapper', from: { list: 'oneWay' }, when: [{ field: 'rel', op: 'eq', value: 'power' }], group: true,
    weigh: { base: 0.5, plus: [] }, say: 'water-power', show: 'map' },
  { id: 'zone-empty', name: 'Empty zones on a lens', theme: 'water', source: 'mapper', from: { list: 'zoneGaps' }, when: [{ field: 'kind', op: 'eq', value: 'empty' }],
    weigh: { base: 0.3, plus: [] }, say: 'water-zone', show: 'map' },
  { id: 'zones-apart', name: 'Zones that never link', theme: 'network', source: 'mapper', from: { list: 'zoneGaps' }, when: [{ field: 'kind', op: 'eq', value: 'apart' }],
    weigh: { base: 0.4, plus: [] }, say: 'net-weave', show: 'map' },
  // Across plugins
  { id: 'hub-unplanned', name: 'Central partners no plan leans on', theme: 'impact', source: 'mapper', needs: ['strategy'], from: { list: 'hubs' }, when: [{ field: 'used', op: 'no' }],
    weigh: { base: 0.5, plus: [{ field: 'degree', w: 0.25, scale: 'degree' }] }, say: 'net-hub-unplanned', show: 'map' },
  // Strategy & Work
  { id: 'hollow-objective', name: 'Objectives with no work behind them', theme: 'hygiene', source: 'strategy', from: { list: 'hollowObjectives' }, when: [],
    weigh: { base: 0.75, plus: [] }, say: 'hyg-hollow-objective', show: 'list' },
  { id: 'hollow-goal', name: 'Goals with no workplan', theme: 'hygiene', source: 'strategy', from: { list: 'hollowGoals' }, when: [],
    weigh: { base: 0.6, plus: [] }, say: 'hyg-hollow-goal', show: 'list' },
  { id: 'unstaffed', name: 'Workplans with nobody on them', theme: 'hygiene', source: 'strategy', from: { list: 'unstaffed' }, when: [], group: true,
    weigh: { base: 0.6, plus: [] }, say: 'hyg-unstaffed', show: 'list' },
  { id: 'overdue', name: 'Work running late', theme: 'hygiene', source: 'strategy', from: { list: 'overdue' }, when: [],
    weigh: { base: 0.5, plus: [{ field: 'value', w: 0.3, cap: 180 }] }, say: 'hyg-overdue', show: 'list' },
  { id: 'blocked', name: 'Blocked work', theme: 'hygiene', source: 'strategy', from: { list: 'blockedWork' }, when: [],
    weigh: { base: 0.55, plus: [{ field: 'value', w: 0.2, cap: 5 }] }, say: 'hyg-blocked', show: 'list' },
  { id: 'no-measure', name: 'Objectives with no measure', theme: 'hygiene', source: 'strategy', from: { type: 'objective' }, when: [{ field: 'measures', op: 'eq', value: 0 }, { field: 'draft', op: 'no' }],
    weigh: { base: 0.5, plus: [] }, say: 'hyg-no-measure', show: 'list' },
  // Assets
  { id: 'unused-assets', name: 'Assets nothing leans on', theme: 'abcd', source: 'assets', from: { list: 'unusedAssets' }, when: [], group: true,
    weigh: { base: 0.35, plus: [] }, say: 'abcd-unused', show: 'list' },
  { id: 'abcd-thin', name: 'Thin ABCD types', theme: 'abcd', source: 'assets', from: { list: 'abcdThin' }, when: [],
    weigh: { base: 0.4, plus: [] }, say: 'abcd-thin', show: 'list' },
  // Planning Studio
  { id: 'loose-soar', name: 'SOAR ideas never patched in', theme: 'soar', source: 'studio', from: { list: 'looseIdeas' }, when: [], group: true,
    weigh: { base: 0.4, plus: [] }, say: 'soar-loose', show: 'list' },
  { id: 'strength-unused', name: 'Strengths the plan doesn’t use', theme: 'soar', source: 'studio', from: { type: 'soar' }, when: [{ field: 'quadrant', op: 'eq', value: 's' }, { field: 'wired', op: 'no' }],
    weigh: { base: 0.45, plus: [{ field: 'votes', w: 0.3, cap: 5 }] }, say: 'soar-strengths', show: 'list' },
  { id: 'untested-toc', name: 'Untested causal bets', theme: 'toc', source: 'studio', from: { list: 'untestedLinks' }, when: [], group: true,
    weigh: { base: 0.5, plus: [] }, say: 'toc-untested', show: 'list' },
];
export const ruleById = Object.fromEntries(RULES.map((r) => [r.id, r]));

/** The starter canned analyses: named sets of rules. */
export const ANALYSES = [
  { id: 'network-health', name: 'Network health', blurb: 'Where your ecosystem is fragile: single points of failure, overloaded hubs, isolated actors, and zones that never talk.', icon: 'sec-mapper',
    rules: ['single-point', 'hub-load', 'isolates', 'zones-apart', 'zone-empty'] },
  { id: 'power-leverage', name: 'Power and leverage', blurb: 'Gatekeepers, problems in the middle of the flows, power and resources that only run one way, and community voices on the edge.', icon: 'spark',
    rules: ['gatekeeper-distant', 'problem-central', 'power-one-way', 'resource-one-way', 'community-thin'] },
  { id: 'plan-hygiene', name: 'Plan hygiene', blurb: 'Objectives and goals with no work behind them, no measures, nobody on the work, and work that’s late or blocked.', icon: 'sec-strategy',
    rules: ['hollow-objective', 'hollow-goal', 'no-measure', 'unstaffed', 'overdue', 'blocked'] },
  { id: 'assets-in-use', name: 'Assets in use', blurb: 'Asset-based development: what you have that no plan uses yet, and which kinds of assets are thin.', icon: 'sec-assets',
    rules: ['unused-assets', 'abcd-thin'] },
  { id: 'studio-to-plan', name: 'From studio to plan', blurb: 'SOAR ideas and strengths that never made it into the plan, and causal bets nobody has tested.', icon: 'sec-studio',
    rules: ['loose-soar', 'strength-unused', 'untested-toc'] },
  { id: 'across', name: 'Map meets plan', blurb: 'Where your ecosystem and your strategy don’t meet: central partners no plan leans on.', icon: 'connect',
    rules: ['hub-unplanned'] },
];
export const analysisById = Object.fromEntries(ANALYSES.map((a) => [a.id, a]));

/**
 * The rows a rule looks at: one per entity or record, with the fields its
 * conditions and tip need. Entities get their attributes, their network
 * measures (actors), whether anything in the strategy or studio leans on
 * them (`used`) and whether they're on the assembler's wires (`wired`).
 */
export function rowsFor(rule, ctx) {
  const { facts, measures } = ctx;
  const E = facts.entities;
  const used = ctx.used ??= new Set(facts.relations.filter((r) => ['support', 'feeds'].includes(r.kind)).map((r) => r.from));
  const wired = ctx.wired ??= new Set(facts.relations.filter((r) => r.kind === 'feeds').flatMap((r) => [r.from, r.to]));
  const mapName = (mapId) => E[`map:${mapId}`]?.name ?? '';
  const entityRow = (id) => {
    const e = E[id];
    if (!e) return null;
    const a = measures.actors[id];
    return { id, items: [id], name: e.name, type: e.type, ...e.attrs, ...(a ?? {}), map: e.attrs.mapId ? mapName(e.attrs.mapId) : '', zone: e.attrs.zoneLabel ?? '', used: used.has(id), wired: wired.has(id), value: a?.degree };
  };
  const recordRow = (x) => {
    if (x.from && x.to) {
      const basis = facts.relations.find((r) => r.from === x.from && r.to === x.to)?.basis ?? null;
      return { ...x, id: `${x.from}>${x.to}`, items: [x.from, x.to], name: `${E[x.from]?.name ?? x.from} → ${E[x.to]?.name ?? x.to}`, map: mapName(E[x.from]?.attrs.mapId), basis };
    }
    if (x.map) return { ...x, id: `${x.map}:${x.zone}:${x.other ?? ''}`, items: [x.map], name: x.label, map: E[x.map]?.name ?? '' };
    if (x.abcd) return { ...x, items: [], name: x.label, value: x.count };
    if (E[x.id]) return { ...entityRow(x.id), ...x, value: x.late ?? x.blocked ?? x.open };
    return { ...x, items: [], name: x.label ?? x.id };
  };
  if (rule.from.type) return Object.values(E).filter((e) => e.type === rule.from.type).map((e) => entityRow(e.id));
  return (measures.lists[rule.from.list] ?? []).map((x) => (typeof x === 'string' ? entityRow(x) : recordRow(x))).filter(Boolean);
}

/** One condition against one row: { ok, field, op, want, got } for the Why? panel. */
export function check(cond, row, calibration) {
  const got = row[cond.field];
  const want = cond.pct ? calibration?.[cond.field]?.[cond.pct] ?? 0 : cond.value;
  return { ok: OPS[cond.op]?.test(got, want) ?? false, field: cond.field, op: cond.op, want, got, pct: cond.pct ?? null };
}

/** A row's score from the rule's weigh, the profile's themes, and how much speculative links count. */
export function weigh(rule, row, ctx) {
  const cal = ctx.calibration ?? ctx.measures.calibration;
  const terms = (rule.weigh.plus ?? []).map((t) => {
    const v = Number(row[t.field] ?? 0);
    const top = t.scale ? Math.max(1e-9, cal?.[t.scale]?.p90 || 1) : t.cap ?? 1;
    const part = t.w * Math.min(1, Math.max(0, v / top));
    return { field: t.field, w: t.w, value: v, part: Math.round(part * 100) / 100 };
  });
  let score = rule.weigh.base + terms.reduce((n, t) => n + t.part, 0);
  const themed = (ctx.profile?.themes ?? []).includes(rule.theme);
  // A rule in one of the profile's themes counts a little more.
  if (themed) score += 0.06;
  const spec = row.basis === 'speculative' ? ctx.profile?.weights?.speculative ?? 1 : 1;
  score *= spec;
  return { score: Math.round(Math.min(1, Math.max(0, score)) * 100) / 100, base: rule.weigh.base, terms, themed, speculative: spec !== 1 ? spec : null };
}

const nameList = (rows, n = 3) => {
  const names = rows.slice(0, n).map((r) => r.name);
  return rows.length > n ? `${names.join(', ')} and ${rows.length - n} more` : names.join(', ').replace(/, ([^,]*)$/, ' and $1');
};

/** Run one rule: its findings, best first. */
export function runRule(rule, ctx, { analysisId = null } = {}) {
  const cal = ctx.calibration ?? ctx.measures.calibration;
  if (ctx.plugins && ![rule.source, ...(rule.needs ?? [])].every((p) => ctx.plugins.has(p))) return [];
  const tip = tipById[rule.say];
  const matched = [];
  for (const row of rowsFor(rule, ctx)) {
    const checks = rule.when.map((c) => check(c, row, cal));
    if (checks.every((c) => c.ok)) matched.push({ row, checks, w: weigh(rule, row, ctx) });
  }
  if (!matched.length) return [];
  const why = (checks, w, count) => ({ rule: rule.id, from: rule.from, checks, weigh: w, tip: rule.say, theme: rule.theme, source: tip ? SOURCES[tip.source] : null, matched: count });
  if (rule.group) {
    matched.sort((a, b) => b.w.score - a.w.score || a.row.name.localeCompare(b.row.name));
    const rows = matched.map((x) => x.row);
    const best = matched[0];
    return [{
      id: `${rule.id}:all`, ruleId: rule.id, analysisId, score: best.w.score, title: rule.name, show: rule.show,
      text: fillTip(tip?.text ?? rule.name, { count: rows.length, items: nameList(rows), map: best.row.map, name: best.row.name }),
      items: [...new Set(rows.flatMap((r) => r.items))], rows: rows.map((r) => ({ id: r.id, name: r.name })), sig: rows.map((r) => r.id).sort().join('|'),
      why: why(best.checks, best.w, rows.length),
    }];
  }
  return matched.map(({ row, checks, w }) => ({
    id: `${rule.id}:${row.id}`, ruleId: rule.id, analysisId, score: w.score, title: rule.name, show: rule.show,
    text: fillTip(tip?.text ?? rule.name, { ...row, value: row.value, label: row.label ?? row.name, count: 1 }),
    items: row.items, rows: [{ id: row.id, name: row.name }], sig: row.id,
    why: why(checks, w, 1),
  })).sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
}

/** Run a canned analysis (or every one): findings ranked by score, dismissed ones left out. */
export function runAnalysis(analysisIds, ctx, { dismissed = {} } = {}) {
  const ids = analysisIds === 'all' ? ANALYSES.map((a) => a.id) : [].concat(analysisIds);
  const seen = new Set();
  const out = [];
  for (const aid of ids) {
    const a = analysisById[aid] ?? ctx.custom?.[aid];
    if (!a) continue;
    for (const rid of a.rules) {
      if (seen.has(rid)) continue;
      seen.add(rid);
      const rule = ruleById[rid];
      if (!rule) continue;
      for (const f of runRule(rule, ctx, { analysisId: aid })) {
        // A dismissed finding stays away until what it rests on changes.
        if (dismissed[f.id] && dismissed[f.id].sig === f.sig) continue;
        out.push(f);
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/** The words for a condition, as the Why? panel shows it. */
export function describeCheck(c) {
  const field = c.field.replace(/([A-Z])/g, ' $1').toLowerCase();
  const want = c.pct ? `${c.want} (your ${PCT[c.pct]})` : Array.isArray(c.want) ? c.want.join(', ') : c.want;
  return `${field} ${OPS[c.op]?.label ?? c.op}${['yes', 'no'].includes(c.op) ? '' : ` ${want}`}`;
}

/** Analyses that fit a context profile: those with a rule in one of its themes, plus plan hygiene, always. */
export function analysesFor(profile) {
  const themes = new Set(profile?.themes ?? []);
  return ANALYSES.filter((a) => a.id === 'plan-hygiene' || a.rules.some((r) => themes.has(ruleById[r]?.theme))).map((a) => a.id);
}
