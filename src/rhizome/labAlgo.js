/**
 * Rhizome Lab: graph methods from current network science, run in the
 * browser on the fact layer (rackGraph.graphOf: Map<id, Set<id>>, undirected).
 * Everything here is deterministic: the same facts give the same answer.
 *
 *   leiden(g)           communities, Leiden-style: Louvain moves, then each
 *                       community split into its connected parts (the Leiden
 *                       guarantee: no community is held together by nothing)
 *   modularity(g, m)    how much more tied-in the communities are than chance
 *   brokers(g)          Burt's structural holes: constraint and effective size
 *   kCore(g)            the core number of every node (its "depth" in the net)
 *   predictTies(g)      likely missing ties, by Adamic–Adar
 *   checkShapes(f, s)   SHACL-style shape checks over the facts
 *
 * References (plain-language notes live in the Lab's About panel):
 * Traag, Waltman & van Eck 2019 (Leiden); Blondel et al. 2008 (Louvain);
 * Burt 1992 (structural holes); Seidman 1983 (k-cores); Adamic & Adar 2003;
 * Liben-Nowell & Kleinberg 2007 (link prediction); W3C SHACL 2017.
 */

const sortedIds = (g) => [...g.keys()].sort();

/* ------------------------------------------------------------ communities */

/** Splits a set of nodes into its connected parts, walking only ties inside the set. */
function connectedParts(g, nodes) {
  const inside = new Set(nodes);
  const seen = new Set();
  const parts = [];
  for (const start of [...nodes].sort()) {
    if (seen.has(start)) continue;
    const part = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop();
      part.push(id);
      for (const x of g.get(id) ?? []) if (inside.has(x) && !seen.has(x)) { seen.add(x); stack.push(x); }
    }
    parts.push(part);
  }
  return parts;
}

/**
 * One level of Louvain local moving on a weighted graph.
 * W: Map<node, Map<node, weight>>; returns Map<node, community>.
 */
function localMoves(W, resolution) {
  const nodes = [...W.keys()].sort();
  const k = new Map(nodes.map((n) => [n, [...W.get(n).values()].reduce((s, w) => s + w, 0)]));
  const m2 = [...k.values()].reduce((s, v) => s + v, 0);
  const comm = new Map(nodes.map((n) => [n, n]));
  const tot = new Map(nodes.map((n) => [n, k.get(n)]));
  if (!m2) return comm;
  for (let pass = 0; pass < 20; pass++) {
    let moved = false;
    for (const n of nodes) {
      const own = comm.get(n);
      const links = new Map();
      for (const [x, w] of W.get(n)) if (x !== n) links.set(comm.get(x), (links.get(comm.get(x)) ?? 0) + w);
      tot.set(own, tot.get(own) - k.get(n));
      const gain = (c) => (links.get(c) ?? 0) - resolution * (tot.get(c) ?? 0) * k.get(n) / m2;
      let best = own, bestGain = gain(own);
      for (const c of [...links.keys()].sort()) { const v = gain(c); if (v > bestGain + 1e-12) { best = c; bestGain = v; } }
      tot.set(best, (tot.get(best) ?? 0) + k.get(n));
      if (best !== own) { comm.set(n, best); moved = true; }
    }
    if (!moved) break;
  }
  return comm;
}

/**
 * Communities, Leiden-style. Returns Map<id, label>, where a label is the
 * alphabetically first id in its community (stable, readable in tests).
 */
export function leiden(g, { resolution = 1, levels = 4 } = {}) {
  // Each node starts in its own group; groups merge level by level.
  let members = new Map(sortedIds(g).map((id) => [id, [id]]));
  let W = new Map(sortedIds(g).map((id) => [id, new Map([...(g.get(id) ?? [])].map((x) => [x, 1]))]));
  for (let level = 0; level < levels; level++) {
    const comm = localMoves(W, resolution);
    // Gather the original nodes of each community, then refine: split it into connected parts.
    const byComm = new Map();
    for (const [node, c] of comm) { if (!byComm.has(c)) byComm.set(c, []); byComm.get(c).push(...members.get(node)); }
    const next = new Map();
    for (const nodes of byComm.values()) for (const part of connectedParts(g, nodes)) next.set(part.sort()[0], part);
    if (next.size === members.size) { members = next; break; }
    // Aggregate: one node per refined community, ties summed.
    const owner = new Map();
    for (const [label, nodes] of next) for (const id of nodes) owner.set(id, label);
    W = new Map([...next.keys()].map((l) => [l, new Map()]));
    for (const [id, nb] of g) for (const x of nb) {
      const a = owner.get(id), b = owner.get(x);
      if (a == null || b == null) continue;
      W.get(a).set(b, (W.get(a).get(b) ?? 0) + 1);
    }
    members = next;
  }
  const out = new Map();
  for (const [label, nodes] of members) for (const id of nodes) out.set(id, label);
  return out;
}

/** Newman's modularity Q of a split (Map<id, label>), from about −0.5 to 1; above 0.3 is a clear split. */
export function modularity(g, labels) {
  let m2 = 0;
  const tot = new Map(), inner = new Map();
  for (const [id, nb] of g) {
    const c = labels.get(id);
    m2 += nb.size;
    tot.set(c, (tot.get(c) ?? 0) + nb.size);
    for (const x of nb) if (labels.get(x) === c) inner.set(c, (inner.get(c) ?? 0) + 1);
  }
  if (!m2) return 0;
  let q = 0;
  for (const [c, t] of tot) q += (inner.get(c) ?? 0) / m2 - (t / m2) ** 2;
  return q;
}

/** Communities as lists, biggest first: [{ label, ids }]. */
export function communityList(labels) {
  const by = new Map();
  for (const [id, l] of labels) { if (!by.has(l)) by.set(l, []); by.get(l).push(id); }
  return [...by].map(([label, ids]) => ({ label, ids: ids.sort() })).sort((a, b) => b.ids.length - a.ids.length || (a.label < b.label ? -1 : 1));
}

/* ---------------------------------------------------------------- brokers */

/**
 * Burt's structural holes for every node with ties.
 *   constraint: 0 to 1; low = ties into otherwise unconnected groups (a broker)
 *   effective:  effective size, the number of non-redundant contacts
 *   broker:     1 − constraint, so bigger reads as "more of a broker"
 * Returns Map<id, { ties, constraint, effective, broker }>.
 */
export function brokers(g) {
  const out = new Map();
  for (const id of sortedIds(g)) {
    const nb = [...(g.get(id) ?? [])];
    const n = nb.length;
    if (!n) { out.set(id, { ties: 0, constraint: 1, effective: 0, broker: 0 }); continue; }
    const p = 1 / n; // unweighted: each tie is an equal share of the node's time
    let constraint = 0, among = 0;
    for (const j of nb) {
      let indirect = 0;
      for (const q of nb) if (q !== j && g.get(q)?.has(j)) { indirect += p * (1 / (g.get(q).size || 1)); among++; }
      constraint += (p + indirect) ** 2;
    }
    const effective = n - among / n;
    out.set(id, { ties: n, constraint: Math.min(1, constraint), effective, broker: 1 - Math.min(1, constraint) });
  }
  return out;
}

/* ------------------------------------------------------------------ cores */

/** Core numbers by peeling (Batagelj–Zaversnik): Map<id, k>. The k-core is every node with k or more. */
export function kCore(g) {
  const deg = new Map([...g].map(([id, nb]) => [id, nb.size]));
  const core = new Map();
  const left = new Set(g.keys());
  let k = 0;
  while (left.size) {
    let min = Infinity, pick = null;
    for (const id of [...left].sort()) { const d = deg.get(id); if (d < min) { min = d; pick = id; } }
    k = Math.max(k, min);
    core.set(pick, k);
    left.delete(pick);
    for (const x of g.get(pick) ?? []) if (left.has(x)) deg.set(x, deg.get(x) - 1);
  }
  return core;
}

/* -------------------------------------------------------- link prediction */

/**
 * Likely missing ties: pairs two steps apart, scored by Adamic–Adar (shared
 * neighbours, the rarer the neighbour the more it counts). `among` limits the
 * pairs to ones touching those ids. Returns [{ a, b, score, via: [ids] }],
 * best first.
 */
export function predictTies(g, { limit = 20, among = null } = {}) {
  const focus = among ? new Set(among) : null;
  const seen = new Set();
  const out = [];
  for (const a of sortedIds(g)) {
    for (const mid of g.get(a)) {
      for (const b of g.get(mid)) {
        if (b <= a || g.get(a).has(b)) continue;
        if (focus && !focus.has(a) && !focus.has(b)) continue;
        const key = `${a}\u0000${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const via = [...g.get(a)].filter((x) => g.get(b).has(x)).sort();
        const score = via.reduce((s, x) => s + 1 / Math.log(Math.max(2, g.get(x).size)), 0);
        out.push({ a, b, score, via });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score || (x.a + x.b < y.a + y.b ? -1 : 1)).slice(0, limit);
}

/* ----------------------------------------------------------------- shapes */

/**
 * Shapes, after W3C SHACL: each says what a kind of thing should have.
 *   { id, label, type, minTies?, tieTo?, attr? }
 * minTies: at least this many ties (to things of type tieTo, if given);
 * attr: this attribute should be filled in.
 */
export const SHAPES = [
  { id: 'actor-tied', label: 'Every actor is tied to something', type: 'actor', minTies: 1 },
  { id: 'objective-in-plan', label: 'Every objective sits in a plan', type: 'objective', minTies: 1, tieTo: 'plan' },
  { id: 'task-in-workplan', label: 'Every task belongs to a workplan', type: 'task', minTies: 1, tieTo: 'workplan' },
  { id: 'person-title', label: 'Every person has a title', type: 'person', attr: 'title' },
  { id: 'asset-tied', label: 'Every asset is used or linked somewhere', type: 'asset', minTies: 1 },
];

/** Runs shapes over the facts: [{ shape, checked, failing: [ids] }], shapes with nothing to check left out. */
export function checkShapes(facts, g, shapes = SHAPES) {
  const ents = Object.values(facts.entities);
  return shapes.map((s) => {
    const targets = ents.filter((e) => e.type === s.type);
    const failing = targets.filter((e) => {
      if (s.attr && !String(e.attrs?.[s.attr] ?? '').trim()) return true;
      if (s.minTies) {
        const nb = [...(g.get(e.id) ?? [])].filter((x) => !s.tieTo || facts.entities[x]?.type === s.tieTo);
        if (nb.length < s.minTies) return true;
      }
      return false;
    }).map((e) => e.id).sort();
    return { shape: s, checked: targets.length, failing };
  }).filter((r) => r.checked);
}

/* ----------------------------------------------------------------- bundle */

const labCache = new WeakMap();

/** Every measure the Lab and its console use, computed once per graph. */
export function labMeasures(g) {
  if (labCache.has(g)) return labCache.get(g);
  const comm = leiden(g);
  const out = { comm, q: modularity(g, comm), communities: communityList(comm), brokers: brokers(g), core: kCore(g) };
  labCache.set(g, out);
  return out;
}
