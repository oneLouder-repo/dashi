/**
 * Graph algorithms for the semantic asset graph, on its nodes and edges
 * (treated as undirected: a link either way connects two things).
 *
 *   adjacency(g)                 Map iri → Set of neighbour iris
 *   degree / pageRank / betweenness(g)   iri → score
 *   components(g)                [[iri]] biggest first
 *   communities(g)               iri → community number (label propagation, seeded so it's repeatable)
 *   shortestPath(g, a, b)        [iri…] or null
 *   ego(g, iri, depth)           { nodes: Set, rings: [[iri]] }  the network unfolding from one thing
 *   findNodes(g, text)           best matches for a name
 *   ask(g, question)             the graph search: a name, "A to B", "most connected", "bridges", "islands"…
 */

/** Neighbours of each node. Weak links (on a map, works here) count only with `weak: true`. */
export function adjacency(g, { skip = null, weak = false } = {}) {
  const adj = new Map(Object.keys(g.nodes).map((k) => [k, new Set()]));
  for (const e of g.edges) {
    if (e.weak && !weak) continue;
    if (skip && (skip(g.nodes[e.s]) || skip(g.nodes[e.o]))) continue;
    adj.get(e.s)?.add(e.o);
    adj.get(e.o)?.add(e.s);
  }
  if (skip) for (const [k] of adj) if (skip(g.nodes[k])) adj.delete(k);
  return adj;
}

export const degree = (g, adj = adjacency(g)) => Object.fromEntries([...adj].map(([k, v]) => [k, v.size]));

export function pageRank(g, { damping = 0.85, iterations = 40, adj = adjacency(g) } = {}) {
  const ids = [...adj.keys()];
  const n = ids.length || 1;
  let pr = Object.fromEntries(ids.map((k) => [k, 1 / n]));
  for (let i = 0; i < iterations; i++) {
    const next = Object.fromEntries(ids.map((k) => [k, (1 - damping) / n]));
    let sink = 0;
    for (const k of ids) {
      const out = adj.get(k);
      if (!out.size) { sink += pr[k]; continue; }
      const share = (damping * pr[k]) / out.size;
      for (const o of out) next[o] += share;
    }
    for (const k of ids) next[k] += (damping * sink) / n;
    pr = next;
  }
  return pr;
}

/** Brandes' betweenness: how often something sits on the shortest way between two others. */
export function betweenness(g, { adj = adjacency(g) } = {}) {
  const ids = [...adj.keys()];
  const cb = Object.fromEntries(ids.map((k) => [k, 0]));
  for (const s of ids) {
    const stack = [];
    const pred = new Map(ids.map((k) => [k, []]));
    const sigma = new Map(ids.map((k) => [k, 0]));
    const dist = new Map(ids.map((k) => [k, -1]));
    sigma.set(s, 1); dist.set(s, 0);
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi];
      stack.push(v);
      for (const w of adj.get(v)) {
        if (dist.get(w) < 0) { queue.push(w); dist.set(w, dist.get(v) + 1); }
        if (dist.get(w) === dist.get(v) + 1) { sigma.set(w, sigma.get(w) + sigma.get(v)); pred.get(w).push(v); }
      }
    }
    const delta = new Map(ids.map((k) => [k, 0]));
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      if (w !== s) cb[w] += delta.get(w);
    }
  }
  for (const k of ids) cb[k] /= 2;
  return cb;
}

export function components(g, { adj = adjacency(g) } = {}) {
  const seen = new Set();
  const out = [];
  for (const k of adj.keys()) {
    if (seen.has(k)) continue;
    const comp = [];
    const queue = [k];
    seen.add(k);
    while (queue.length) {
      const v = queue.shift();
      comp.push(v);
      for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); queue.push(w); }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Communities by label propagation, in a fixed order so the same graph always splits the same way. */
export function communities(g, { adj = adjacency(g), rounds = 12 } = {}) {
  const ids = [...adj.keys()].sort();
  const label = Object.fromEntries(ids.map((k, i) => [k, i]));
  for (let r = 0; r < rounds; r++) {
    let changed = false;
    for (const k of ids) {
      const counts = new Map();
      for (const w of adj.get(k)) counts.set(label[w], (counts.get(label[w]) ?? 0) + 1);
      if (!counts.size) continue;
      const best = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      if (best !== label[k] && counts.get(best) > (counts.get(label[k]) ?? 0)) { label[k] = best; changed = true; }
    }
    if (!changed) break;
  }
  // Number them 0, 1, 2… biggest first.
  const sizes = new Map();
  for (const k of ids) sizes.set(label[k], (sizes.get(label[k]) ?? 0) + 1);
  const order = [...sizes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([l]) => l);
  return Object.fromEntries(ids.map((k) => [k, order.indexOf(label[k])]));
}

export function shortestPath(g, a, b, { adj = adjacency(g) } = {}) {
  if (!adj.has(a) || !adj.has(b)) return null;
  if (a === b) return [a];
  const prev = new Map([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const v = queue.shift();
    for (const w of adj.get(v)) {
      if (prev.has(w)) continue;
      prev.set(w, v);
      if (w === b) {
        const path = [b];
        for (let x = v; x; x = prev.get(x)) path.unshift(x);
        return path;
      }
      queue.push(w);
    }
  }
  return null;
}

export function ego(g, iri, depth = 2, { adj = adjacency(g) } = {}) {
  const rings = [[iri]];
  const seen = new Set([iri]);
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const v of rings[d]) for (const w of adj.get(v) ?? []) if (!seen.has(w)) { seen.add(w); next.push(w); }
    if (!next.length) break;
    rings.push(next);
  }
  return { nodes: seen, rings };
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s#]/g, ' ').replace(/\s+/g, ' ').trim();

/** Things whose name matches, best first: whole name, then start of a word, then anywhere; ties go to the better connected. */
export function findNodes(g, text, { limit = 8 } = {}) {
  const q = norm(text).replace(/^#/, '');
  if (!q) return [];
  const scored = [];
  for (const n of Object.values(g.nodes)) {
    const l = norm(n.label).replace(/^#/, '');
    let s = 0;
    if (l === q) s = 100;
    else if (l.startsWith(q)) s = 80;
    else if (l.split(' ').some((w) => w.startsWith(q))) s = 60;
    else if (l.includes(q)) s = 40;
    else {
      // Every word of the question somewhere in the name.
      const words = q.split(' ');
      if (words.length > 1 && words.every((w) => l.includes(w))) s = 30;
    }
    // A tag only wins when asked for as one (#name), so “Apple” finds Apple, not #apple.
    if (s && n.kind === 'concept' && !String(text).trim().startsWith('#')) s -= 25;
    if (s) scored.push([s + Math.min(10, (n.degree ?? 0) / 3), n.iri]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, iri]) => iri);
}

const top = (scores, n, filter = () => true) => Object.entries(scores).filter(([k]) => filter(k)).sort((a, b) => b[1] - a[1]).slice(0, n).filter(([, v]) => v > 0).map(([k]) => k);

/** Suggestions offered under the search box. */
export const ASK_CHIPS = [
  { q: 'most connected', label: 'Most connected', icon: 'spark' },
  { q: 'bridges', label: 'Who bridges groups', icon: 'connect' },
  { q: 'clusters', label: 'Clusters', icon: 'tiles' },
  { q: 'islands', label: 'On their own', icon: 'pin' },
  { q: 'people', label: 'People', icon: 'users' },
];

/**
 * The graph search. Returns { kind, title, nodes: [iri], path?, rings?, groups?, note }:
 *   a name            → 'ego': that thing and the network around it, ring by ring
 *   "A to B" / "path from A to B" / "how is A linked to B" → 'path'
 *   "most connected" / "central" → 'rank' (PageRank)
 *   "bridges" / "brokers"        → 'rank' (betweenness)
 *   "clusters" / "communities"   → 'groups'
 *   "islands" / "alone"          → 'list' of things with no links, and small separate groups
 *   "people" / "tags" / "maps" / "strategy" / ABCD type → 'list' of that kind
 */
export function ask(g, question, { adj = adjacency(g) } = {}) {
  const q = norm(question);
  if (!q) return null;
  const kinds = { people: 'person', person: 'person', tags: 'concept', tag: 'concept', maps: 'map', actors: 'actor', strategy: 'strategy', teams: 'team', collections: 'collection', assets: 'asset' };
  const abcd = { individuals: 'individual', associations: 'association', institutions: 'institution', physical: 'physical', places: 'physical', economic: 'economic', cultural: 'cultural', stories: 'cultural' };
  const m = /^(?:path |route |way )?(?:from |between )?(.+?) (?:to|and|->|→) (.+)$/.exec(q.replace(/^how (?:is|are|does) /, '').replace(/ (?:linked|connected|related)(?: to)? /, ' to '));
  if (m && !/^(most|who) /.test(q)) {
    const [a] = findNodes(g, m[1], { limit: 1 });
    const [b] = findNodes(g, m[2], { limit: 1 });
    if (a && b) {
      const path = shortestPath(g, a, b, { adj });
      return path
        ? { kind: 'path', title: `${g.nodes[a].label} → ${g.nodes[b].label}`, nodes: path, path, note: path.length === 2 ? 'Linked directly.' : `${path.length - 2} step${path.length === 3 ? '' : 's'} between them.` }
        : { kind: 'path', title: `${g.nodes[a].label} → ${g.nodes[b].label}`, nodes: [a, b], path: null, note: 'Not linked, even through others. Link an asset to both to join them up.' };
    }
  }
  if (/^(most connected|central|hubs?|key|important|top)/.test(q)) {
    const pr = pageRank(g, { adj });
    const list = top(pr, 10, (k) => g.nodes[k].kind !== 'org');
    return { kind: 'rank', title: 'Most connected', nodes: list, scores: pr, note: 'By PageRank: linked to many things, or to things that are themselves well linked.' };
  }
  if (/^(bridges?|brokers?|connectors?|who bridges|gatekeepers?)/.test(q)) {
    const bc = betweenness(g, { adj });
    const list = top(bc, 10, (k) => g.nodes[k].kind !== 'org' && g.nodes[k].kind !== 'concept');
    return { kind: 'rank', title: 'Who bridges groups', nodes: list, scores: bc, note: 'By betweenness: they sit on the shortest way between others, so they join groups that would otherwise be apart.' };
  }
  if (/^(clusters?|communities|groups?)$/.test(q)) {
    const cm = communities(g, { adj });
    const groups = [];
    for (const [k, c] of Object.entries(cm)) (groups[c] ??= []).push(k);
    const pr = pageRank(g, { adj });
    const named = groups.filter((x) => x.length > 1).map((x) => x.sort((a, b) => pr[b] - pr[a]));
    return { kind: 'groups', title: 'Clusters', nodes: named.flat(), groups: named, membership: cm, note: `${named.length} clusters of things more linked to each other than to the rest.` };
  }
  if (/^(islands?|alone|on their own|isolated|unlinked|orphans?)/.test(q)) {
    // The org, its maps and teams are linked to everything in their own way: leave them out.
    const frame = new Set(['org', 'map', 'team']);
    const comps = components(g, { adj }).map((c) => c.filter((k) => !frame.has(g.nodes[k].kind))).filter((c) => c.length).sort((a, b) => b.length - a.length);
    const alone = comps.filter((c) => c.length === 1).flat();
    const apart = comps.slice(1).filter((c) => c.length > 1);
    const note = [alone.length && `${alone.length} with no links at all`, apart.length && `${apart.flat().length} in ${apart.length} group${apart.length === 1 ? '' : 's'} not linked to the rest`].filter(Boolean).join(', and ');
    return { kind: 'groups', title: 'On their own', nodes: [...alone, ...apart.flat()], groups: [...apart, ...(alone.length ? [alone] : [])], note: note ? `${note}. Linking them in adds what they know to the whole.` : 'Everything is linked to everything else, one way or another.' };
  }
  if (kinds[q]) return { kind: 'list', title: q[0].toUpperCase() + q.slice(1), nodes: Object.values(g.nodes).filter((n) => n.kind === kinds[q]).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0)).map((n) => n.iri), note: '' };
  if (abcd[q]) return { kind: 'list', title: q[0].toUpperCase() + q.slice(1), nodes: Object.values(g.nodes).filter((n) => n.abcd === abcd[q]).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0)).map((n) => n.iri), note: '' };
  const [hit] = findNodes(g, q.replace(/^(near|around|who knows|what is linked to|linked to) /, ''), { limit: 1 });
  if (!hit) return { kind: 'none', title: question, nodes: [], note: 'Nothing by that name. Try part of a name, “A to B”, or one of the suggestions.' };
  return around(g, hit, { adj });
}

/** The network unfolding from one thing, ring by ring (what a name or a click on the graph asks for). */
export function around(g, iri, { adj = adjacency(g) } = {}) {
  if (!g.nodes[iri]) return null;
  // Around one thing, its map and team count too, so even a lone actor shows where it lives.
  let e = ego(g, iri, 2, { adj });
  if ((e.rings[1]?.length ?? 0) < 2) e = ego(g, iri, 2, { adj: adjacency(g, { weak: true }) });
  return { kind: 'ego', title: g.nodes[iri].label, nodes: [...e.nodes], rings: e.rings, focus: iri, note: `${e.rings[1]?.length ?? 0} linked directly, ${e.rings[2]?.length ?? 0} more one step further.` };
}

/**
 * Loops (alpha 0.4): the feedback loops drawn into the change ecosystem.
 * Map relationships have a direction (from one actor to another), so a
 * loop is a way round that comes back to where it started: A → B → C → A.
 * Dashi is about feedback and learning loops; this finds the ones already
 * there, and the near misses one link short of closing.
 *
 *   findLoops(g, { max = 6, limit = 60 })
 *     → { loops: [{ iris: [a, b, c], edges: [{s,o,label,p}], kind: 'feedback'|'learning'|'mixed'|'plain' }],
 *         almost: [{ iris: [a, b, c], missing: { s: c, o: a } }] }
 *
 * Only actor-to-actor links count (the ties people drew on maps), each loop
 * once (it starts at its smallest iri), shortest first.
 */
export function findLoops(g, { max = 6, limit = 60, almostLimit = 12 } = {}) {
  const out = new Map();
  const edgeOf = new Map();
  for (const e of g.edges) {
    if (e.weak || g.nodes[e.s]?.kind !== 'actor' || g.nodes[e.o]?.kind !== 'actor') continue;
    if (!out.has(e.s)) out.set(e.s, []);
    out.get(e.s).push(e.o);
    edgeOf.set(`${e.s}\u0000${e.o}`, e);
  }
  const loops = [];
  const seen = new Set();
  const starts = [...out.keys()].sort();
  for (const start of starts) {
    if (loops.length >= limit * 4) break;
    // Depth-first from each start, visiting only nodes "after" it, so each loop is found once.
    const stack = [[start, [start]]];
    while (stack.length) {
      const [at, path] = stack.pop();
      for (const next of out.get(at) ?? []) {
        if (next === start && path.length >= 2) {
          const key = path.join('>');
          if (!seen.has(key)) { seen.add(key); loops.push(path); }
        } else if (next > start && !path.includes(next) && path.length < max) stack.push([next, [...path, next]]);
      }
    }
  }
  const kindOfEdge = (e) => { const t = `${e.p} ${e.label ?? ''}`.toLowerCase(); return /learn/.test(t) ? 'learning' : /feedback/.test(t) ? 'feedback' : 'plain'; };
  const shaped = loops
    .sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()))
    .slice(0, limit)
    .map((iris) => {
      const edges = iris.map((s, i) => edgeOf.get(`${s}\u0000${iris[(i + 1) % iris.length]}`));
      const kinds = new Set(edges.map(kindOfEdge).filter((k) => k !== 'plain'));
      return { iris, edges, kind: kinds.size === 0 ? 'plain' : kinds.size > 1 ? 'mixed' : [...kinds][0] };
    });
  // Near misses: A → B → C with no way back from C to A (and no loop already through all three).
  const inLoop = new Set(shaped.flatMap((l) => l.iris));
  const almost = [];
  for (const a of starts) {
    for (const b of out.get(a) ?? []) {
      for (const c of out.get(b) ?? []) {
        if (c === a || edgeOf.has(`${c}\u0000${a}`) || edgeOf.has(`${b}\u0000${a}`)) continue;
        almost.push({ iris: [a, b, c], missing: { s: c, o: a }, warm: inLoop.has(a) + inLoop.has(b) + inLoop.has(c) });
      }
    }
  }
  // The ones touching existing loops least first: they are where new feedback would help most.
  almost.sort((x, y) => x.warm - y.warm || x.iris.join().localeCompare(y.iris.join()));
  return { loops: shaped, almost: almost.slice(0, almostLimit).map(({ warm, ...rest }) => rest) };
}
