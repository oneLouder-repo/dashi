/**
 * Rhizome's fact layer (Rhizome stage 1): everything an org knows, in one
 * shape, so a measure or a rule never needs to know where a fact came from.
 *
 *   Entity   { id, type, name, source, attrs }
 *   Relation { from, rel, to, source, kind, weight?, basis?, ... }
 *
 * One adapter per plugin turns that plugin's documents into facts:
 * Ecosystem maps, Assets, Strategy & Work, and the Planning Studio (SOAR
 * cards, context, the assembler's wires and the theory of change). People
 * come from the org. Each adapter runs only when its plugin is on for the
 * person (`plugins`, a Set of ids), so nobody gets facts from a plugin they
 * can't open. Pure: no storage, no DOM, so the server and tests use it too.
 *
 * Relation kinds:
 *   'link'       a relationship between two actors on a map (the network)
 *   'structure'  part of, member of, on a map, in a collection
 *   'support'    an asset, person or idea behind a piece of strategy
 *   'feeds'      the assembler's wires: this idea feeds that goal
 *   'leads'      the theory of change: this change leads to that one
 *   'locates'    where a thing is, or the place it serves (from Place)
 *
 * Places (alpha 0.3 PR 20, ready for the Place plugin): any entity may carry
 * `attrs.geo` = { lat, lng, precision: 'exact' | 'approx' | 'area', placeId? },
 * from its own object (actor.geo, an asset item's geo). People never get one
 * by default. Other plugins add facts through `addFactAdapter` (see
 * adapters.js): Place registers one that adds place entities and pins.
 */
import { gatherAssets, migrateAssets, blankAssets } from '../platform/assetHub.js';
import { zoneOf, LENS_ZONES } from './zones.js';

export const FACT_SOURCES = [
  { id: 'mapper', label: 'Ecosystem maps', icon: 'sec-mapper' },
  { id: 'assets', label: 'Assets', icon: 'sec-assets' },
  { id: 'strategy', label: 'Strategy & Work', icon: 'sec-strategy' },
  { id: 'studio', label: 'Assembler and theory of change', icon: 'sec-studio' },
  { id: 'org', label: 'People', icon: 'person' },
  { id: 'place', label: 'Place', icon: 'globe' },
];

export const ENTITY_TYPES = {
  map: { label: 'Map', plural: 'Maps' },
  actor: { label: 'Actor', plural: 'Actors' },
  group: { label: 'Group', plural: 'Groups' },
  person: { label: 'Person', plural: 'People' },
  asset: { label: 'Asset', plural: 'Assets' },
  collection: { label: 'Collection', plural: 'Collections' },
  framework: { label: 'Framework', plural: 'Frameworks' },
  plan: { label: 'Plan', plural: 'Plans' },
  objective: { label: 'Objective', plural: 'Objectives' },
  goal: { label: 'Goal', plural: 'Goals' },
  workplan: { label: 'Workplan', plural: 'Workplans' },
  task: { label: 'Task', plural: 'Tasks' },
  soar: { label: 'SOAR card', plural: 'SOAR cards' },
  context: { label: 'Context factor', plural: 'Context factors' },
  result: { label: 'Result', plural: 'Results' },
  block: { label: 'Assembler block', plural: 'Assembler blocks' },
  outcome: { label: 'Theory of change step', plural: 'Theory of change steps' },
  place: { label: 'Place', plural: 'Places' },
};
export const typeLabel = (type, n = 1) => (n === 1 ? ENTITY_TYPES[type]?.label : ENTITY_TYPES[type]?.plural) ?? type;

/** A location, cleaned: { lat, lng, precision, placeId? }, or null when it isn't a real point. */
export const GEO_PRECISION = ['exact', 'approx', 'area'];
export function cleanGeo(g) {
  if (!g || typeof g !== 'object') return null;
  const lat = Number(g.lat), lng = Number(g.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const out = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, precision: GEO_PRECISION.includes(g.precision) ? g.precision : 'approx' };
  if (g.placeId) out.placeId = String(g.placeId);
  return out;
}

/**
 * Fact adapters from other plugins: id -> { build, doc }. `build(doc, ent,
 * rel, entities)` adds entities and relations with the same helpers the
 * built-in adapters use. It runs after them, only when plugin `id` is on.
 */
export const FACT_ADAPTERS = new Map();
export function addFactAdapter(id, build, { doc = id } = {}) {
  FACT_ADAPTERS.set(id, { build, doc });
}

const SOAR = { s: 'Strength', o: 'Opportunity', a: 'Aspiration', r: 'Result' };

/** The entity id of an asset as Strategy & Work and the assembler hold it ({ kind, ref, mapId } or { type, id, mapId }). */
export function assetKey(a) {
  if (!a) return null;
  if (typeof a === 'string') return a;
  const kind = a.kind ?? a.type;
  // Something written in by hand (a person, a piece of literature) has no ref: it stands for itself.
  if (a.ref == null && a.kind) return a.id ? `asset:${a.id}` : null;
  const ref = a.ref ?? a.id;
  if (!kind || ref == null) return null;
  if (kind === 'actor') return `actor:${a.mapId}/${ref}`;
  if (['upload', 'file', 'link', 'note'].includes(kind)) return String(a.id ?? ref);
  return `${kind}:${ref}`;
}

/**
 * Build the facts. `docs` = { org, maps, mapContents, assets, library,
 * podcasts, strategy, studio }; any may be missing. `plugins` (a Set) limits
 * the adapters to the plugins the person can use; null = all.
 */
export function buildFacts(docs = {}, { plugins = null } = {}) {
  const on = (id) => !plugins || plugins.has(id);
  const entities = {};
  const relations = [];
  const ent = (id, type, name, source, attrs = {}) => {
    if (!entities[id]) entities[id] = { id, type, name: String(name ?? '').trim() || 'Untitled', source, attrs: { ...attrs } };
    else Object.assign(entities[id].attrs, attrs);
    return entities[id];
  };
  const rel = (from, r, to, source, kind, extra = {}) => {
    if (!from || !to || from === to || !entities[from] || !entities[to]) return;
    relations.push({ from, rel: r, to, source, kind, ...extra });
  };

  // People: from the org, whatever else is on.
  for (const s of Object.values(docs.org?.staff ?? {})) ent(`staff:${s.id}`, 'person', s.name, 'org', { title: s.title ?? '', role: s.role ?? null });

  if (on('mapper')) {
    for (const [mapId, entry] of Object.entries(docs.maps?.maps ?? {})) {
      const content = docs.mapContents?.[mapId];
      const lensId = LENS_ZONES[content?.lensId] ? content.lensId : 'micro-meso-macro';
      const mapE = `map:${mapId}`;
      ent(mapE, 'map', entry.title ?? content?.name, 'mapper', { lens: lensId, actors: Object.keys(content?.actors ?? {}).length });
      for (const a of Object.values(content?.actors ?? {})) {
        const zone = zoneOf(lensId, a.place?.depth);
        ent(`actor:${mapId}/${a.id}`, 'actor', a.label, 'mapper', {
          mapId, kind: a.kind ?? 'actor', category: a.category ?? null, zone: zone?.id ?? null, zoneLabel: zone?.label ?? null,
          layerId: a.layerId ?? null, description: a.meta?.description ?? '', geo: cleanGeo(a.geo),
        });
        rel(`actor:${mapId}/${a.id}`, 'on map', mapE, 'mapper', 'structure');
      }
      for (const c of Object.values(content?.connectors ?? {})) {
        const from = c.from?.actorId ? `actor:${mapId}/${c.from.actorId}` : null;
        const to = c.to?.actorId ? `actor:${mapId}/${c.to.actorId}` : null;
        rel(from, c.type || 'link', to, 'mapper', 'link', { id: c.id, mapId, weight: Number(c.strength ?? 1) || 1, basis: c.meta?.basis ?? null, label: c.label ?? '' });
      }
      for (const g of Object.values(content?.groups ?? {})) {
        const gid = `group:${mapId}/${g.id}`;
        ent(gid, 'group', g.label, 'mapper', { mapId, description: g.description ?? '' });
        rel(gid, 'on map', mapE, 'mapper', 'structure');
        for (const m of g.memberIds ?? []) rel(`actor:${mapId}/${m}`, 'member of', gid, 'mapper', 'structure');
      }
    }
  }

  if (on('assets')) {
    const hub = migrateAssets(structuredClone(docs.assets ?? blankAssets()));
    const cards = gatherAssets(hub, docs, { plugins });
    for (const c of cards) {
      if (c.missing) continue;
      const attrs = { abcd: c.abcd ?? null, tags: [...(c.tags ?? []), ...(c.tagsFrom ?? [])], assetSource: c.source, sensitivity: c.sensitivity ?? 'internal', collections: c.collectionIds ?? [] };
      // A location noted on the asset itself; a person's never comes in this way (privacy).
      const geo = c.source === 'staff' ? null : cleanGeo(c.item?.geo);
      if (geo) attrs.geo = geo;
      // Actors and people are already entities: the asset layer adds its ABCD type and tags to them.
      if (entities[c.key]) Object.assign(entities[c.key].attrs, attrs, { asset: true });
      else ent(c.key, 'asset', c.title, 'assets', { ...attrs, asset: true, kindLabel: c.kindLabel ?? '' });
    }
    for (const col of Object.values(hub.collections ?? {})) ent(`collection:${col.id}`, 'collection', col.name ?? col.title, 'assets');
    for (const c of cards) for (const cid of c.collectionIds ?? []) rel(c.key, 'in collection', `collection:${cid}`, 'assets', 'structure');
  }

  if (on('strategy') && docs.strategy?.nodes) {
    const nodes = docs.strategy.nodes;
    for (const n of Object.values(nodes)) {
      ent(`node:${n.id}`, n.type, n.title || (n.type === 'framework' ? 'Strategic framework' : 'Untitled'), 'strategy', {
        start: n.start ?? null, end: n.end ?? null, status: n.type === 'task' ? n.status ?? 'planned' : null,
        measures: (n.measures ?? []).length, staff: (n.staffIds ?? n.assigneeIds ?? []).length, draft: !!n.draft,
      });
    }
    for (const n of Object.values(nodes)) {
      if (n.parentId && nodes[n.parentId]) rel(`node:${n.id}`, 'part of', `node:${n.parentId}`, 'strategy', 'structure');
      for (const sid of [...(n.staffIds ?? []), ...(n.assigneeIds ?? [])]) rel(`staff:${sid}`, 'works on', `node:${n.id}`, 'strategy', 'support');
      for (const a of n.assets ?? []) {
        const key = assetKey(a);
        if (key && !entities[key] && a.label) ent(key, 'asset', a.label, 'strategy', { asset: true, abcd: null, kindLabel: a.kind ?? '', detail: a.detail ?? '' });
        rel(key, 'supports', `node:${n.id}`, 'strategy', 'support');
      }
    }
  }

  if (on('studio') && docs.studio) {
    const st = docs.studio;
    for (const c of Object.values(st.cards ?? {})) {
      ent(`card:${c.id}`, 'soar', c.text, 'studio', { quadrant: c.quadrant, quadrantLabel: SOAR[c.quadrant] ?? '', planId: c.planId, votes: (c.votes ?? []).length, centre: Math.hypot(c.wx ?? 0, c.wy ?? 0) });
    }
    for (const x of Object.values(st.context ?? {})) ent(`context:${x.id}`, 'context', x.text, 'studio', { contextKind: x.kind, planId: x.planId });
    for (const r of Object.values(st.results ?? {})) ent(`result:${r.id}`, 'result', r.title, 'studio', { planId: r.planId, indicator: r.indicator ?? '', target: r.target ?? '' });
    for (const c of Object.values(st.cards ?? {})) {
      for (const a of c.assets ?? []) rel(assetKey(a), 'evidence for', `card:${c.id}`, 'studio', 'support');
      if (c.quadrant === 'r') for (const r of Object.values(st.results ?? {})) if (r.cardId === c.id) rel(`card:${c.id}`, 'measured by', `result:${r.id}`, 'studio', 'structure');
    }
    // The assembler: each block stands for a card, a context factor, a result, an asset, a piece of the plan, or a new idea.
    const blockEntity = (b) => {
      if (!b) return null;
      if (b.kind === 'card') return `card:${b.ref}`;
      if (b.kind === 'context') return `context:${b.ref}`;
      if (b.kind === 'result') return `result:${b.ref}`;
      if (b.kind === 'asset') {
        const key = assetKey(b.asset);
        if (key && !entities[key] && b.asset?.label) ent(key, 'asset', b.asset.label, 'studio', { asset: true });
        return key;
      }
      if (b.kind === 'note') return null;
      if (b.strategyId && entities[`node:${b.strategyId}`]) return `node:${b.strategyId}`;
      return ent(`block:${b.id}`, 'block', b.title || `New ${b.kind}`, 'studio', { blockKind: b.kind, planId: b.planId }).id;
    };
    const blockIds = {};
    for (const b of Object.values(st.blocks ?? {})) blockIds[b.id] = blockEntity(b);
    for (const w of Object.values(st.wires ?? {})) rel(blockIds[w.from], 'feeds', blockIds[w.to], 'studio', 'feeds', { planId: w.planId });
    for (const b of Object.values(st.blocks ?? {})) if (blockIds[b.id] && entities[blockIds[b.id]]) entities[blockIds[b.id]].attrs.onCanvas = true;
    // The theory of change: five lanes, and links with a confidence.
    for (const t of Object.values(st.toc ?? {})) ent(`toc:${t.id}`, 'outcome', t.title, 'studio', { lane: t.lane, planId: t.planId, strategyId: t.strategyId ?? null });
    for (const l of Object.values(st.tocLinks ?? {})) {
      rel(`toc:${l.from}`, 'leads to', `toc:${l.to}`, 'studio', 'leads', { confidence: l.confidence ?? 'untested', assumption: l.assumption ?? '', evidence: (l.evidence ?? []).length, planId: l.planId });
    }
  }

  // Other plugins' adapters (Place), each only when its plugin is on.
  for (const [id, { build, doc }] of FACT_ADAPTERS) {
    if (!on(id) || !docs[doc]) continue;
    try { build(docs[doc], ent, rel, entities); } catch (err) { console.warn(`Rhizome: the ${id} adapter failed`, err); }
  }
  // Keep only real locations, whoever set them.
  for (const e of Object.values(entities)) {
    if (e.attrs.geo == null) delete e.attrs.geo;
    else if (!(e.attrs.geo = cleanGeo(e.attrs.geo))) delete e.attrs.geo;
  }

  return { entities, relations, builtAt: null };
}

/** The entities with a location: what a geographic map can show. */
export const placedEntities = (facts) => Object.values(facts.entities).filter((e) => e.attrs.geo);

/** How many entities of each type, and relations from each source: the fact layer at a glance. */
export function factCounts(facts) {
  const types = {};
  const sources = {};
  for (const e of Object.values(facts.entities)) {
    types[e.type] = (types[e.type] ?? 0) + 1;
    (sources[e.source] ??= { entities: 0, relations: 0 }).entities++;
  }
  for (const r of facts.relations) (sources[r.source] ??= { entities: 0, relations: 0 }).relations++;
  return { entities: Object.keys(facts.entities).length, relations: facts.relations.length, types, sources };
}

/** Everything one entity is tied to, both ways. */
export function relationsOf(facts, id) {
  return facts.relations.filter((r) => r.from === id || r.to === id).map((r) => ({ ...r, other: r.from === id ? r.to : r.from, out: r.from === id }));
}

/** Entities whose name (or type) matches some text, best first. */
export function searchEntities(facts, text, { type = null, limit = 200 } = {}) {
  const q = String(text ?? '').trim().toLowerCase();
  const all = Object.values(facts.entities).filter((e) => !type || e.type === type);
  if (!q) return all.slice(0, limit);
  return all
    .map((e) => { const n = e.name.toLowerCase(); return [e, n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : (e.attrs.tags ?? []).some((t) => String(t).toLowerCase().includes(q)) ? 3 : 9]; })
    .filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).slice(0, limit).map(([e]) => e);
}
