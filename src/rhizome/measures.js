/**
 * Rhizome's measures (Rhizome stage 1): numbers worked out once over the
 * fact layer, for the rules (stage 2) and the patcher's Measure blocks
 * (stage 3) to read.
 *
 * Calibration: thresholds come from the org's own data (percentiles), so
 * "few links" means few *for this org*. A five-person collective and a
 * 36-person foundation get different cut-offs.
 */
import { betweenness } from '../platform/graphAlgo.js';
import { LENS_ZONES } from './zones.js';
import { ABCD as ABCD_TYPES } from '../platform/assetHub.js';

/** The value at percentile p (0 to 1) of a list of numbers, by nearest rank. */
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1));
  return v[i];
}
/** Cut-offs for one measure: the 25th, 50th, 75th and 90th percentiles. */
export const cutoffs = (values) => ({ p25: percentile(values, 0.25), p50: percentile(values, 0.5), p75: percentile(values, 0.75), p90: percentile(values, 0.9) });
/** Where a value sits against its cut-offs: 'low' | 'mid' | 'high' | 'top'. */
export function band(value, c) {
  if (value >= c.p90 && c.p90 > c.p50) return 'top';
  if (value > c.p75) return 'high';
  if (value <= c.p25) return 'low';
  return 'mid';
}
export const BANDS = { low: 'Low for this org', mid: 'Typical', high: 'High', top: 'Top 10%' };

/**
 * Articulation points (Tarjan): actors whose removal splits their network.
 * These are single points of failure: the only way between two parts.
 */
export function cutVertices(adj) {
  const disc = new Map();
  const low = new Map();
  const cut = new Set();
  let time = 0;
  for (const root of adj.keys()) {
    if (disc.has(root)) continue;
    // Iterative DFS, so a big map can't overflow the stack.
    const stack = [[root, null, [...adj.get(root)], 0]];
    disc.set(root, time); low.set(root, time); time++;
    let rootKids = 0;
    while (stack.length) {
      const top = stack.at(-1);
      const [v, parent, nbrs] = top;
      if (top[3] < nbrs.length) {
        const w = nbrs[top[3]++];
        if (!disc.has(w)) {
          disc.set(w, time); low.set(w, time); time++;
          if (v === root) rootKids++;
          stack.push([w, v, [...adj.get(w)], 0]);
        } else if (w !== parent) low.set(v, Math.min(low.get(v), disc.get(w)));
      } else {
        stack.pop();
        if (parent != null) {
          low.set(parent, Math.min(low.get(parent), low.get(v)));
          if (parent !== root && low.get(v) >= disc.get(parent)) cut.add(parent);
        }
      }
    }
    if (rootKids > 1) cut.add(root);
  }
  return cut;
}

/** Map link types that flow one way (src/lenses/taxonomy.json). */
export const FLOWS = new Set(['resource-flow', 'information', 'power']);

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/**
 * Work out every measure. `today` is an ISO date (for overdue work).
 * Returns { actors, calibration, lists, counts }:
 *   actors[id]   { degree, inDeg, outDeg, betweenness, cut, band: { degree, betweenness } }
 *   lists        named lists of entity ids (or small records) the rules will match on
 */
export function measureFacts(facts, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const E = facts.entities;
  const R = facts.relations;
  const ofType = (t) => Object.values(E).filter((e) => e.type === t);

  // The network: actors and their map links (undirected for reach, directed for one-way).
  const actors = ofType('actor');
  const adj = new Map(actors.map((a) => [a.id, new Set()]));
  const out = new Map(actors.map((a) => [a.id, new Set()]));
  const links = R.filter((r) => r.kind === 'link' && adj.has(r.from) && adj.has(r.to));
  const inn = new Map(actors.map((a) => [a.id, new Set()]));
  for (const r of links) { adj.get(r.from).add(r.to); adj.get(r.to).add(r.from); out.get(r.from).add(r.to); inn.get(r.to).add(r.from); }
  const g = { nodes: Object.fromEntries(actors.map((a) => [a.id, a])), edges: links.map((r) => ({ s: r.from, o: r.to })) };
  const bc = betweenness(g, { adj });
  const cut = cutVertices(adj);
  const per = {};
  for (const a of actors) {
    const inDeg = inn.get(a.id).size;
    per[a.id] = { degree: adj.get(a.id).size, inDeg, outDeg: out.get(a.id).size, betweenness: Math.round(bc[a.id] * 10) / 10, cut: cut.has(a.id) };
  }
  const calibration = {
    degree: cutoffs(Object.values(per).map((x) => x.degree)),
    betweenness: cutoffs(Object.values(per).map((x) => x.betweenness)),
  };
  for (const x of Object.values(per)) x.band = { degree: band(x.degree, calibration.degree), betweenness: band(x.betweenness, calibration.betweenness) };

  const byDegree = (a, b) => per[b].degree - per[a].degree || E[a].name.localeCompare(E[b].name);
  const isolates = actors.filter((a) => per[a.id].degree === 0).map((a) => a.id);
  const fewLinks = actors.filter((a) => per[a.id].degree > 0 && per[a.id].degree <= Math.max(1, calibration.degree.p25)).map((a) => a.id);
  const hubs = actors.filter((a) => per[a.id].band.degree === 'top' && per[a.id].degree >= 3).map((a) => a.id).sort(byDegree);
  const bridges = actors.filter((a) => per[a.id].cut).map((a) => a.id).sort((a, b) => per[b].betweenness - per[a].betweenness);
  // A link one way only: A reaches B, B never reaches back.
  // Only flows have a direction that matters: a relationship, a feedback or a learning loop runs both ways by nature.
  const oneWay = links.filter((r) => FLOWS.has(r.rel) && !links.some((x) => x.from === r.to && x.to === r.from)).map((r) => ({ from: r.from, to: r.to, rel: r.rel }));

  // Zones: per map, zones with no actors, and pairs of zones with actors but no link between them.
  const zoneGaps = [];
  for (const m of ofType('map')) {
    const lens = LENS_ZONES[m.attrs.lens] ?? LENS_ZONES['micro-meso-macro'];
    const mapId = m.id.slice(4);
    const here = actors.filter((a) => a.attrs.mapId === mapId);
    if (!here.length) continue;
    const zoneOfA = Object.fromEntries(here.map((a) => [a.id, a.attrs.zone]));
    const used = new Set(here.map((a) => a.attrs.zone).filter(Boolean));
    for (const z of lens.zones) if (!used.has(z.id)) zoneGaps.push({ map: m.id, kind: 'empty', zone: z.id, label: z.label });
    const linked = new Set(links.filter((r) => zoneOfA[r.from] && zoneOfA[r.to]).map((r) => [zoneOfA[r.from], zoneOfA[r.to]].sort().join('|')));
    const zs = lens.zones.filter((z) => used.has(z.id));
    for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
      if (!linked.has([zs[i].id, zs[j].id].sort().join('|'))) zoneGaps.push({ map: m.id, kind: 'apart', zone: zs[i].id, other: zs[j].id, label: `${zs[i].label} and ${zs[j].label}` });
    }
  }

  // Strategy: objectives and goals with nothing under them, work with no people, work running late.
  const kids = {};
  for (const r of R) if (r.rel === 'part of') (kids[r.to] ??= []).push(r.from);
  const under = (id, type) => {
    const found = [];
    const walk = (x) => { for (const k of kids[x] ?? []) { if (E[k]?.type === type) found.push(k); walk(k); } };
    walk(id);
    return found;
  };
  const live = (e) => !e.attrs.draft;
  const hollowObjectives = ofType('objective').filter(live).filter((o) => !under(o.id, 'workplan').length).map((o) => o.id);
  const hollowGoals = ofType('goal').filter(live).filter((o) => !under(o.id, 'workplan').length).map((o) => o.id);
  const supported = new Set(R.filter((r) => r.kind === 'support').map((r) => r.to));
  const unstaffed = ofType('workplan').filter(live).filter((w) => !w.attrs.staff && !R.some((r) => r.rel === 'works on' && r.to === w.id)).map((w) => w.id);
  const tasksOf = (w) => under(w, 'task').map((t) => E[t]);
  const blockedWork = ofType('workplan').filter(live).map((w) => ({ id: w.id, tasks: tasksOf(w.id) }))
    .filter((x) => x.tasks.some((t) => t.attrs.status === 'blocked')).map((x) => ({ id: x.id, blocked: x.tasks.filter((t) => t.attrs.status === 'blocked').length, of: x.tasks.length }));
  const overdue = ofType('workplan').filter(live).filter((w) => w.attrs.end && w.attrs.end < today)
    .map((w) => ({ id: w.id, open: tasksOf(w.id).filter((t) => t.attrs.status !== 'done').length, late: daysBetween(w.attrs.end, today) }))
    .filter((x) => x.open > 0);

  // Assets: ones nothing in the strategy or studio leans on, and the ABCD balance.
  const assetIds = Object.values(E).filter((e) => e.attrs.asset && !['actor', 'person'].includes(e.type)).map((e) => e.id);
  const leanedOn = new Set(R.filter((r) => ['support', 'feeds'].includes(r.kind)).map((r) => r.from));
  const unusedAssets = assetIds.filter((id) => !leanedOn.has(id));
  const abcd = {};
  for (const e of Object.values(E)) if (e.attrs.asset && e.attrs.abcd) abcd[e.attrs.abcd] = (abcd[e.attrs.abcd] ?? 0) + 1;
  // ABCD types with few assets next to the fullest one (a tenth or less).
  const abcdMax = Math.max(0, ...Object.values(abcd));
  const abcdThin = abcdMax ? ABCD_TYPES.filter((t) => (abcd[t.id] ?? 0) <= abcdMax / 10).map((t) => ({ id: `abcd:${t.id}`, abcd: t.id, label: t.label.toLowerCase(), count: abcd[t.id] ?? 0 })) : [];

  // The studio: SOAR cards never patched into anything, aspirations with no result, untested causal bets.
  const wired = new Set(R.filter((r) => r.kind === 'feeds').flatMap((r) => [r.from, r.to]));
  const looseIdeas = ofType('soar').filter((c) => !wired.has(c.id)).map((c) => c.id);
  const untestedLinks = R.filter((r) => r.kind === 'leads' && r.confidence !== 'tested').map((r) => ({ from: r.from, to: r.to, confidence: r.confidence }));
  const leadsIn = new Set(R.filter((r) => r.kind === 'leads').map((r) => r.to));
  const unsupportedOutcomes = ofType('outcome').filter((o) => o.attrs.lane !== 'activity' && !leadsIn.has(o.id)).map((o) => o.id);

  // Places: actors and assets with no real-world location yet (Place can give them one).
  const placeable = [...actors.map((a) => a.id), ...assetIds.filter((id) => E[id].type === 'asset')];
  const unplaced = placeable.filter((id) => !E[id].attrs.geo);

  const lists = { unplaced, abcdThin, isolates, fewLinks, hubs, bridges, oneWay, zoneGaps, hollowObjectives, hollowGoals, unstaffed, blockedWork, overdue, unusedAssets, looseIdeas, untestedLinks, unsupportedOutcomes, supported: [...supported] };
  return {
    actors: per, calibration, lists, abcd,
    counts: {
      actors: actors.length, links: links.length, isolates: isolates.length, hubs: hubs.length, bridges: bridges.length, oneWay: oneWay.length,
      zoneGaps: zoneGaps.length, hollowObjectives: hollowObjectives.length, hollowGoals: hollowGoals.length, unstaffed: unstaffed.length,
      blockedWork: blockedWork.length, overdue: overdue.length, assets: assetIds.length, unusedAssets: unusedAssets.length,
      soar: ofType('soar').length, looseIdeas: looseIdeas.length, outcomes: ofType('outcome').length, untestedLinks: untestedLinks.length,
      placed: placeable.length - unplaced.length, unplaced: unplaced.length,
    },
  };
}

/**
 * The signals the home page shows, in order: each a named list with a count,
 * the plugin it comes from, and a plain line on why it matters. The rules
 * engine (stage 2) turns these into ranked tips with words from the library.
 */
export const SIGNALS = [
  { id: 'bridges', label: 'Single points of failure', source: 'mapper', why: 'Take one of these away and part of the network loses its way to the rest.' },
  { id: 'hubs', label: 'Hubs', source: 'mapper', why: 'The most connected actors for this org: where news travels fastest, and where too much may rest on one door.' },
  { id: 'isolates', label: 'Isolated actors', source: 'mapper', why: 'On a map, but linked to nobody yet.' },
  { id: 'oneWay', label: 'One-way relationships', source: 'mapper', why: 'Resources, information or power flow one way, and nothing comes back.' },
  { id: 'zoneGaps', label: 'Zone gaps', source: 'mapper', why: 'Parts of the lens with nobody in them, or zones that never link to each other.' },
  { id: 'hollowObjectives', label: 'Objectives with no work behind them', source: 'strategy', why: 'No workplan anywhere under them yet.' },
  { id: 'unstaffed', label: 'Workplans with nobody on them', source: 'strategy', why: 'No one is named as doing the work.' },
  { id: 'overdue', label: 'Work running late', source: 'strategy', why: 'Past its end date with tasks still open.' },
  { id: 'blockedWork', label: 'Blocked work', source: 'strategy', why: 'Workplans with blocked tasks.' },
  { id: 'unusedAssets', label: 'Assets nothing leans on', source: 'assets', why: 'Not used by any plan, workplan or idea in the studio.' },
  { id: 'looseIdeas', label: 'SOAR ideas not patched in', source: 'studio', why: 'On the SOAR board, but never wired into a goal or objective.' },
  { id: 'untestedLinks', label: 'Untested causal bets', source: 'studio', why: 'Theory of change links nobody has checked yet.' },
];
