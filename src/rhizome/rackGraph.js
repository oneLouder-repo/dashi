/**
 * Graph helpers for the rack's Sets & graphs modules (Neighbours, Triads,
 * Prism, Complement) and the Plotter. They read the fact layer as one
 * undirected graph: every relation is a tie, whichever plugin it came from.
 * Results are cached per fact layer, so a patch with many modules stays fast.
 */
import { rowsFor } from './rules.js';

const graphs = new WeakMap();
const comms = new WeakMap();
const rowCache = new WeakMap();

/** The fact layer as an undirected graph: Map<id, Set<id>>. */
export function graphOf(facts) {
  if (graphs.has(facts)) return graphs.get(facts);
  const g = new Map();
  const add = (a, b) => { if (!g.has(a)) g.set(a, new Set()); g.get(a).add(b); };
  for (const r of facts.relations) {
    if (!r.from || !r.to || r.from === r.to) continue;
    if (!facts.entities[r.from] || !facts.entities[r.to]) continue;
    add(r.from, r.to); add(r.to, r.from);
  }
  graphs.set(facts, g);
  return g;
}

/** Every entity as a rack row (the rows a Facts module would give), cached. */
export function entityRows(ctx) {
  if (rowCache.has(ctx.facts)) return rowCache.get(ctx.facts);
  const types = [...new Set(Object.values(ctx.facts.entities).map((e) => e.type))];
  const rows = types.flatMap((type) => rowsFor({ from: { type } }, ctx));
  rowCache.set(ctx.facts, rows);
  return rows;
}

/** A breadth-first walk out from `start`, `hops` steps: { ring } = the new ids reached, nearest first. */
export function neighbourhood(g, start, hops = 1) {
  const seen = new Set(start);
  let frontier = [...seen];
  const ring = [];
  for (let k = 0; k < hops && frontier.length; k++) {
    const next = [];
    for (const id of frontier) for (const x of [...(g.get(id) ?? [])].sort()) if (!seen.has(x)) { seen.add(x); ring.push(x); next.push(x); }
    frontier = next;
  }
  return { ring };
}

/**
 * One node's triads: of the pairs among its neighbours, how many are tied
 * to each other (closed) and how many are not (open, a structural hole the
 * node bridges). Big neighbourhoods are sampled to the first 60.
 */
export function triadsOf(g, id) {
  const nb = [...(g.get(id) ?? [])].sort().slice(0, 60);
  let closed = 0, pairs = 0;
  for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) { pairs++; if (g.get(nb[i])?.has(nb[j])) closed++; }
  return { degree: g.get(id)?.size ?? 0, pairs, closed, open: pairs - closed };
}

/**
 * Communities by label propagation: each node takes the label most of its
 * neighbours have, until nothing changes. Deterministic (sorted order, ties
 * to the smaller label), so the same facts always split the same way.
 * Returns Map<id, label>.
 */
export function communities(g) {
  if (comms.has(g)) return comms.get(g);
  const ids = [...g.keys()].sort();
  const label = new Map(ids.map((id) => [id, id]));
  for (let round = 0; round < 20; round++) {
    let changed = false;
    for (const id of ids) {
      const count = new Map();
      for (const x of g.get(id)) count.set(label.get(x), (count.get(label.get(x)) ?? 0) + 1);
      let best = label.get(id), bestN = count.get(best) ?? 0;
      for (const [l, c] of count) if (c > bestN || (c === bestN && l < best)) { best = l; bestN = c; }
      if (best !== label.get(id)) { label.set(id, best); changed = true; }
    }
    if (!changed) break;
  }
  comms.set(g, label);
  return label;
}

/** Counts for the seven regions of a three-circle Venn (keys like 'a', 'ab', 'abc'). */
export function vennCounts(sets) {
  const keys = ['a', 'b', 'c'];
  const ids = new Map();
  sets.forEach((s, i) => { if (s) for (const r of s) { const k = ids.get(r.id) ?? ''; if (!k.includes(keys[i])) ids.set(r.id, k + keys[i]); } });
  const out = { a: 0, b: 0, c: 0, ab: 0, ac: 0, bc: 0, abc: 0 };
  for (const k of ids.values()) out[k]++;
  return out;
}

/**
 * A small force layout for the Plotter: rows as points, ties between them as
 * lines, in a unit box. Deterministic (seeded by position in the list).
 * Returns { nodes: [{ id, name, x, y, deg }], edges: [[i, j]] }.
 */
export function plotLayout(g, rows, { max = 48, iterations = 160 } = {}) {
  const pick = rows.slice(0, max);
  const index = new Map(pick.map((r, i) => [r.id, i]));
  const edges = [];
  pick.forEach((r, i) => { for (const x of g.get(r.id) ?? []) { const j = index.get(x); if (j != null && j > i) edges.push([i, j]); } });
  const N = pick.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const P = pick.map((_, i) => { const rad = Math.sqrt((i + 0.5) / Math.max(1, N)) * 0.45; return { x: 0.5 + rad * Math.cos(i * golden), y: 0.5 + rad * Math.sin(i * golden) }; });
  const k = Math.sqrt(1 / Math.max(1, N)) * 0.6;
  for (let it = 0; it < iterations && N > 1; it++) {
    const temp = 0.08 * (1 - it / iterations) + 0.004;
    const d = P.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dist = Math.max(0.01, Math.hypot(dx, dy));
      const f = (k * k) / dist;
      d[i].x += (dx / dist) * f; d[i].y += (dy / dist) * f; d[j].x -= (dx / dist) * f; d[j].y -= (dy / dist) * f;
    }
    for (const [i, j] of edges) {
      const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dist = Math.max(0.01, Math.hypot(dx, dy));
      const f = (dist * dist) / k;
      d[i].x -= (dx / dist) * f; d[i].y -= (dy / dist) * f; d[j].x += (dx / dist) * f; d[j].y += (dy / dist) * f;
    }
    for (let i = 0; i < N; i++) {
      // A gentle pull to the middle keeps loose points on the paper.
      d[i].x += (0.5 - P[i].x) * 1.6; d[i].y += (0.5 - P[i].y) * 1.6;
      const len = Math.max(1e-9, Math.hypot(d[i].x, d[i].y));
      P[i].x = Math.min(0.96, Math.max(0.04, P[i].x + (d[i].x / len) * Math.min(len, temp)));
      P[i].y = Math.min(0.94, Math.max(0.06, P[i].y + (d[i].y / len) * Math.min(len, temp)));
    }
  }
  const deg = pick.map(() => 0);
  for (const [i, j] of edges) { deg[i]++; deg[j]++; }
  return { nodes: pick.map((r, i) => ({ id: r.id, name: r.name, x: P[i].x, y: P[i].y, deg: deg[i] })), edges, more: rows.length - pick.length };
}

/** A histogram of one number across rows: { bins: [{ lo, hi, n }], max }. */
export function spectrumOf(rows, field, bars = 12) {
  const vals = rows.map((r) => Number(r[field])).filter((v) => Number.isFinite(v));
  if (!vals.length) return { bins: [], max: 0, count: 0 };
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const width = hi > lo ? (hi - lo) / bars : 1;
  const bins = Array.from({ length: hi > lo ? bars : 1 }, (_, i) => ({ lo: lo + i * width, hi: lo + (i + 1) * width, n: 0 }));
  for (const v of vals) bins[Math.min(bins.length - 1, Math.floor((v - lo) / width))].n++;
  return { bins, max: Math.max(...bins.map((b) => b.n)), count: vals.length, lo, hi };
}
