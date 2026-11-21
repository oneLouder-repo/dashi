/**
 * The semantic asset graph (alpha 0.2, PR 7, experimental): everything the
 * org knows about its assets, people, maps and strategy, as linked facts.
 *
 * A fact is a triple [subject, predicate, object]. Subjects and predicates
 * are compact IRIs ("dashi:asset/abc", "schema:name"); an object is either
 * an IRI (a string) or a literal ({ v, lang?, dt? }). The vocabularies are
 * the common ones (schema.org, FOAF, SKOS, PROV, Dublin Core) plus ABCD's
 * six asset types and Dashi's own terms for what they don't cover.
 *
 *   buildGraph(docs, settings)  → { triples, nodes, edges, prefixes }
 *     nodes  { [iri]: { iri, label, kind, abcd, href, group } }   things you can see on the graph
 *     edges  [{ s, o, p, label }]                                 links between them
 *   toTurtle / toNTriples / toJsonLd(graph)
 *
 * Nothing here touches the DOM, so the server builds the same graph for
 * the read-only API (server/app.js, /api/graph/export).
 */
import { gatherAssets, ABCD } from './assetHub.js';
import { linkTo } from '../plugins.js';

/** The vocabularies the graph can use. `core` ones can't be switched off. */
export const VOCABS = [
  { prefix: 'rdf', iri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', name: 'RDF', core: true, about: 'The grammar of facts: rdf:type says what kind of thing something is.' },
  { prefix: 'rdfs', iri: 'http://www.w3.org/2000/01/rdf-schema#', name: 'RDF Schema', core: true, about: 'Labels and comments that people can read.' },
  { prefix: 'schema', iri: 'https://schema.org/', name: 'schema.org', about: 'The web’s shared words for people, organisations, places, creative works and events.' },
  { prefix: 'foaf', iri: 'http://xmlns.com/foaf/0.1/', name: 'FOAF', about: 'Friend of a friend: people, groups, and who knows whom.' },
  { prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', name: 'SKOS', about: 'Concepts and collections: tags, themes, and what sits under what.' },
  { prefix: 'prov', iri: 'http://www.w3.org/ns/prov#', name: 'PROV', about: 'Provenance: who made or changed something, and what it came from.' },
  { prefix: 'dcterms', iri: 'http://purl.org/dc/terms/', name: 'Dublin Core', about: 'Titles, subjects and descriptions, as libraries use them.' },
  { prefix: 'abcd', iri: 'https://dashi.app/ns/abcd#', name: 'ABCD', about: 'Asset-Based Community Development: individuals, associations, institutions, physical, economic and cultural assets.' },
  { prefix: 'dashi', iri: 'https://dashi.app/ns/', name: 'Dashi', core: true, about: 'Dashi’s own words for what the others don’t cover (strategy levels, map links).' },
];
export const vocabByPrefix = Object.fromEntries(VOCABS.map((v) => [v.prefix, v]));

/** Each ABCD type's class in the other vocabularies, unless the org changes it (the ontology manager). */
export const ABCD_CLASSES = {
  individual: 'foaf:Person',
  association: 'foaf:Group',
  institution: 'schema:Organization',
  physical: 'schema:Place',
  economic: 'schema:Offer',
  cultural: 'schema:CreativeWork',
};
/** Classes the ontology manager offers for an ABCD type. */
export const CLASS_CHOICES = ['foaf:Person', 'foaf:Group', 'foaf:Organization', 'schema:Person', 'schema:Organization', 'schema:GovernmentOrganization', 'schema:EducationalOrganization', 'schema:NGO', 'schema:LocalBusiness', 'schema:Place', 'schema:Offer', 'schema:CreativeWork', 'schema:Event', 'skos:Concept', 'prov:Entity'];

/**
 * The words the graph says things with. Each has its first choice and the
 * Dashi word used when that vocabulary is switched off.
 */
const TERMS = {
  name: ['schema:name', 'rdfs:label'],
  label: ['rdfs:label', 'rdfs:label'],
  description: ['schema:description', 'rdfs:comment'],
  url: ['schema:url', 'dashi:url'],
  subject: ['dcterms:subject', 'dashi:tag'],
  member: ['skos:member', 'dashi:member'],
  memberOf: ['schema:memberOf', 'dashi:memberOf'],
  knows: ['foaf:knows', 'dashi:knows'],
  related: ['dcterms:relation', 'dashi:related'],
  partOf: ['schema:isPartOf', 'dashi:partOf'],
  broader: ['skos:broader', 'dashi:broader'],
  appearsIn: ['dashi:appearsIn', 'dashi:appearsIn'],
  uses: ['prov:used', 'dashi:uses'],
  attributed: ['prov:wasAttributedTo', 'dashi:by'],
  derived: ['prov:wasDerivedFrom', 'dashi:from'],
  modified: ['dcterms:modified', 'dashi:modified'],
  abcd: ['abcd:type', 'dashi:abcd'],
  concept: ['skos:Concept', 'dashi:Tag'],
  collection: ['skos:Collection', 'dashi:Collection'],
  person: ['foaf:Person', 'dashi:Person'],
  team: ['foaf:Group', 'dashi:Team'],
  org: ['schema:Organization', 'dashi:Organisation'],
  map: ['schema:Map', 'dashi:Map'],
  doc: ['schema:CreativeWork', 'dashi:Document'],
  episode: ['schema:PodcastEpisode', 'dashi:Episode'],
};

export const defaultGraphSettings = () => ({ id: 'graph', vocabs: Object.fromEntries(VOCABS.map((v) => [v.prefix, true])), abcdClasses: { ...ABCD_CLASSES }, include: { tags: true, collections: true, strategy: true, people: true } });

/** Kinds of node, with the colour and word the graph page uses for each. */
export const NODE_KINDS = {
  org: { label: 'Organisation', color: '#1d2230' },
  person: { label: 'Person', color: '#ef7f2d' },
  team: { label: 'Team', color: '#c06f2a' },
  asset: { label: 'Asset', color: '#2c4fa3' },
  actor: { label: 'Map actor', color: '#3e8fa6' },
  map: { label: 'Ecosystem map', color: '#0e6b60' },
  concept: { label: 'Tag', color: '#8a6bc4' },
  collection: { label: 'Collection', color: '#6b55a8' },
  strategy: { label: 'Strategy', color: '#2c4fa3' },
};

const lit = (v, extra = {}) => ({ v: String(v), ...extra });
const slug = (s) => String(s).trim().toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').slice(0, 60) || 'x';

export function buildGraph(docs = {}, settings = defaultGraphSettings(), { hub = null, plugins = null, restricted = true } = {}) {
  const s = { ...defaultGraphSettings(), ...settings, vocabs: { ...defaultGraphSettings().vocabs, ...settings?.vocabs }, abcdClasses: { ...ABCD_CLASSES, ...settings?.abcdClasses }, include: { ...defaultGraphSettings().include, ...settings?.include } };
  const on = (prefix) => vocabByPrefix[prefix]?.core || s.vocabs[prefix] !== false;
  const term = (k) => { const [a, b] = TERMS[k]; return on(a.split(':')[0]) ? a : b; };
  const cls = (iri) => (on(iri.split(':')[0]) ? iri : null);
  const triples = [];
  const nodes = {};
  const edges = [];
  const t = (sub, p, o) => { if (sub && p && o != null && o !== '') triples.push([sub, p, o]); };
  const node = (iri, data) => { nodes[iri] = { iri, ...nodes[iri], ...data }; return iri; };
  // A weak link is true but says little (an actor is on a map, a person works here); paths and rankings skip them.
  const link = (a, p, b, label, weak = false) => { if (!a || !b || a === b) return; t(a, p, b); if (nodes[a] && nodes[b]) edges.push({ s: a, o: b, p, label, ...(weak ? { weak: true } : {}) }); };
  const org = docs.org ?? {};
  // Map contents come either gathered (docs.mapContents) or as the stored documents ("map/<id>").
  if (!docs.mapContents) docs = { ...docs, mapContents: Object.fromEntries(Object.entries(docs).filter(([k]) => k.startsWith('map/')).map(([k, v]) => [k.slice(4), v])) };

  // The organisation at the centre.
  const orgIri = node('dashi:org', { label: org.name || 'Our organisation', kind: 'org' });
  t(orgIri, 'rdf:type', term('org'));
  t(orgIri, term('name'), lit(org.name || 'Our organisation'));
  if (org.website) t(orgIri, term('url'), lit(org.website, { dt: 'xsd:anyURI' }));

  // Teams and people.
  if (s.include.people) {
    for (const tm of Object.values(org.teams ?? {})) {
      const iri = node(`dashi:team/${tm.id}`, { label: tm.name, kind: 'team' });
      t(iri, 'rdf:type', term('team'));
      t(iri, term('name'), lit(tm.name));
      link(iri, term('memberOf'), orgIri, 'part of', true);
    }
  }

  // Every asset, from the asset hub (it already folds in maps, actors, people, library and episodes).
  const hubDoc = hub ?? docs.assets ?? { items: {}, collections: {} };
  const cards = gatherAssets({ items: {}, collections: {}, positions: {}, ...hubDoc }, docs, { plugins });
  const iriOf = (key) => {
    const m = /^(\w+):(.+)$/.exec(key);
    if (!m) return `dashi:asset/${key}`;
    if (m[1] === 'staff') return `dashi:person/${m[2]}`;
    if (m[1] === 'actor') return `dashi:actor/${m[2]}`;
    return `dashi:${m[1]}/${m[2]}`;
  };
  const kindOf = (c) => (c.source === 'staff' ? 'person' : c.source === 'actor' ? 'actor' : c.source === 'map' ? 'map' : 'asset');
  for (const c of cards) {
    if (c.missing) continue;
    if (c.source === 'staff' && !s.include.people) continue;
    // Exports and the API leave out restricted assets: they're not to be passed on.
    if (!restricted && c.sensitivity === 'restricted') continue;
    const iri = node(iriOf(c.key), { label: c.title, kind: kindOf(c), abcd: c.abcd, href: c.href ?? null, source: c.source, key: c.key, sub: c.kindLabel });
    t(iri, 'rdf:type', c.source === 'staff' ? term('person') : c.source === 'map' ? term('map') : c.source === 'episode' ? term('episode') : c.source === 'library' ? term('doc') : 'prov:Entity');
    if (c.abcd) {
      t(iri, term('abcd'), `abcd:${c.abcd}`);
      const k = cls(s.abcdClasses[c.abcd] ?? ABCD_CLASSES[c.abcd] ?? '');
      if (k) t(iri, 'rdf:type', k);
    }
    t(iri, term('name'), lit(c.title));
    if (c.description) t(iri, term('description'), lit(c.description));
    if (c.url) t(iri, term('url'), lit(c.url, { dt: 'xsd:anyURI' }));
    if (c.updatedAt) t(iri, term('modified'), lit(String(c.updatedAt).slice(0, 19), { dt: 'xsd:dateTime' }));
  }
  // Now every asset is a node: their links.
  for (const c of cards) {
    if (c.missing || !nodes[iriOf(c.key)]) continue;
    const iri = iriOf(c.key);
    if (c.source === 'staff') {
      link(iri, term('memberOf'), orgIri, 'works at', true);
      const st = org.staff?.[c.ref?.id];
      for (const tid of st?.teamIds ?? (st?.teamId ? [st.teamId] : [])) link(iri, term('memberOf'), `dashi:team/${tid}`, 'in team');
    }
    if (c.source === 'actor' && c.ref?.mapId) link(iri, term('appearsIn'), `dashi:map/${c.ref.mapId}`, 'on map', true);
    if (c.source === 'map') link(iri, term('attributed'), orgIri, 'made by', true);
    for (const k of c.item?.related ?? []) if (k < c.key || !cards.some((x) => x.key === k && x.item?.related?.includes(c.key))) link(iri, term('related'), iriOf(k), 'linked to');
    if (s.include.tags) for (const tag of new Set([...(c.tags ?? []), ...(c.tagsFrom ?? [])])) {
      const tIri = node(`dashi:tag/${slug(tag)}`, { label: `#${tag}`, kind: 'concept' });
      t(tIri, 'rdf:type', term('concept'));
      t(tIri, on('skos') ? 'skos:prefLabel' : 'rdfs:label', lit(tag));
      link(iri, term('subject'), tIri, 'tagged');
    }
    if (s.include.collections) for (const cid of c.collectionIds ?? []) {
      const col = hubDoc.collections?.[cid];
      if (!col) continue;
      const cIri = node(`dashi:collection/${cid}`, { label: col.name, kind: 'collection' });
      t(cIri, 'rdf:type', term('collection'));
      t(cIri, term('name'), lit(col.name));
      if (col.parentId) link(cIri, term('broader'), `dashi:collection/${col.parentId}`, 'inside');
      link(cIri, term('member'), iri, 'holds');
    }
  }

  // Relationships drawn on the ecosystem maps: actor to actor.
  for (const [mapId, content] of Object.entries(docs.mapContents ?? {})) {
    for (const cn of Object.values(content?.connectors ?? {})) {
      const end = (x) => (typeof x === 'object' && x ? x.actorId : x);
      const a = `dashi:actor/${mapId}/${end(cn.from ?? cn.source)}`, b = `dashi:actor/${mapId}/${end(cn.to ?? cn.target)}`;
      if (!nodes[a] || !nodes[b]) continue;
      // The kind of link (resource flow, influence…) is the predicate; its words go on the edge.
      const p = cn.type ? `dashi:${slug(cn.type).replace(/-(\w)/g, (_, c) => c.toUpperCase())}` : term('knows');
      link(a, p, b, cn.label || (cn.type ?? 'connected').replace(/-/g, ' '));
    }
  }

  // The strategy: framework, plans, objectives, goals and workplans (tasks stay out, to keep it readable).
  if (s.include.strategy) {
    const sn = docs.strategy?.nodes ?? {};
    const keepTypes = new Set(['framework', 'plan', 'objective', 'goal', 'workplan']);
    for (const n of Object.values(sn)) {
      if (!keepTypes.has(n.type) || n.draft) continue;
      const iri = node(`dashi:strategy/${n.id}`, { label: n.title || n.type, kind: 'strategy', sub: n.type, href: linkTo('strategy', `#${n.id}`) });
      t(iri, 'rdf:type', `dashi:${n.type[0].toUpperCase()}${n.type.slice(1)}`);
      t(iri, term('name'), lit(n.title || n.type));
      if (n.vision) t(iri, term('description'), lit(n.vision));
    }
    for (const n of Object.values(sn)) {
      const iri = `dashi:strategy/${n.id}`;
      if (!nodes[iri]) continue;
      if (n.type === 'framework') link(iri, term('attributed'), orgIri, 'of', true);
      if (n.parentId && nodes[`dashi:strategy/${n.parentId}`]) link(iri, term('partOf'), `dashi:strategy/${n.parentId}`, 'under');
      // Assets a workplan or task names (its tasks' assets count for the workplan).
      const named = [n, ...(n.type === 'workplan' ? Object.values(sn).filter((x) => x.parentId === n.id) : [])].flatMap((x) => x.assets ?? []);
      for (const a of named) {
        const key = a.kind === 'map' && a.ref ? `map:${a.ref}` : a.kind === 'map' && a.libraryId ? `library:${a.libraryId}` : a.kind === 'actor' && a.mapId ? `actor:${a.mapId}/${a.ref}` : a.kind === 'staff' && a.ref ? `staff:${a.ref}` : a.kind === 'plan' && a.ref ? null : a.key ?? null;
        if (a.kind === 'plan' && a.ref) { link(iri, term('related'), `dashi:strategy/${a.ref}`, 'draws on'); continue; }
        if (key) link(iri, term('uses'), iriOf(key), 'uses');
      }
      if (s.include.people) for (const sid of [...(n.staffIds ?? [])]) link(`dashi:person/${sid}`, on('prov') ? 'prov:wasAssociatedWith' : 'dashi:worksOn', iri, 'works on');
    }
  }

  const used = new Set(triples.flatMap(([a, p, o]) => [a, p, typeof o === 'string' ? o : o.dt ?? '']).map((x) => String(x).split(':')[0]));
  const prefixes = Object.fromEntries([...VOCABS.filter((v) => used.has(v.prefix)), ...(used.has('xsd') ? [{ prefix: 'xsd', iri: 'http://www.w3.org/2001/XMLSchema#' }] : [])].map((v) => [v.prefix, v.iri]));
  // Degree, for sizing.
  for (const e of edges) { nodes[e.s].degree = (nodes[e.s].degree ?? 0) + 1; nodes[e.o].degree = (nodes[e.o].degree ?? 0) + 1; }
  return { triples, nodes, edges, prefixes, base: orgIri };
}

/* ------------------------------------------------------------------ export */

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
// Compact IRIs whose local part Turtle can't write bare get written out in full.
const safeLocal = (local) => /^[A-Za-z0-9_][\w-]*$/.test(local);
function full(prefixes, iri, base) {
  const [p, ...rest] = iri.split(':');
  const local = rest.join(':');
  const ns = p === 'dashi' && base ? base : prefixes[p];
  return ns ? `${ns}${local}` : iri;
}
function turtleTerm(prefixes, iri, base) {
  if (iri === 'rdf:type') return 'a';
  const [p, ...rest] = iri.split(':');
  const local = rest.join(':');
  if (prefixes[p] && safeLocal(local) && !(p === 'dashi' && base)) return iri;
  // Under @base, Dashi's own things are written relative to it: <asset/abc>.
  if (p === 'dashi' && base) return `<${local}>`;
  return `<${full(prefixes, iri, base)}>`;
}
const literal = (o, ref) => `"${esc(o.v)}"${o.lang ? `@${o.lang}` : o.dt ? `^^${ref(o.dt)}` : ''}`;

/** Turtle, grouped by subject. `base` writes Dashi's own IRIs under the org's address. */
export function toTurtle(graph, { base = null } = {}) {
  const P = { ...graph.prefixes, xsd: 'http://www.w3.org/2001/XMLSchema#' };
  const ref = (iri) => turtleTerm(P, iri, base);
  const lines = Object.entries(P).filter(([k]) => !(k === 'dashi' && base)).map(([k, v]) => `@prefix ${k}: <${v}> .`);
  if (base) lines.push(`@base <${base}> .`);
  lines.push('');
  const bySub = new Map();
  for (const tr of graph.triples) { if (!bySub.has(tr[0])) bySub.set(tr[0], []); bySub.get(tr[0]).push(tr); }
  for (const [sub, list] of bySub) {
    const parts = list.map(([, p, o]) => `    ${ref(p)} ${typeof o === 'string' ? ref(o) : literal(o, ref)}`);
    lines.push(`${ref(sub)}\n${parts.join(' ;\n')} .`, '');
  }
  return lines.join('\n');
}

/** N-Triples: one fact per line, every IRI written out in full. */
export function toNTriples(graph, { base = null } = {}) {
  const P = { ...graph.prefixes, xsd: 'http://www.w3.org/2001/XMLSchema#' };
  const ref = (iri) => `<${full(P, iri, base)}>`;
  return graph.triples.map(([s, p, o]) => `${ref(s)} ${ref(p)} ${typeof o === 'string' ? ref(o) : literal(o, ref)} .`).join('\n') + '\n';
}

/** JSON-LD, one object per subject, with an @context of the prefixes. */
export function toJsonLd(graph, { base = null } = {}) {
  const ctx = { ...graph.prefixes, xsd: 'http://www.w3.org/2001/XMLSchema#' };
  if (base) ctx.dashi = base;
  const bySub = new Map();
  for (const [s, p, o] of graph.triples) {
    if (!bySub.has(s)) bySub.set(s, { '@id': s });
    const obj = bySub.get(s);
    const key = p === 'rdf:type' ? '@type' : p;
    const val = p === 'rdf:type' ? o : typeof o === 'string' ? { '@id': o } : o.lang ? { '@value': o.v, '@language': o.lang } : o.dt ? { '@value': o.v, '@type': o.dt } : o.v;
    obj[key] = obj[key] === undefined ? val : [obj[key], val].flat();
  }
  return { '@context': ctx, '@graph': [...bySub.values()] };
}

export const EXPORTS = {
  turtle: { label: 'Turtle', ext: 'ttl', type: 'text/turtle', make: toTurtle },
  jsonld: { label: 'JSON-LD', ext: 'jsonld', type: 'application/ld+json', make: (g, o) => JSON.stringify(toJsonLd(g, o), null, 2) },
  ntriples: { label: 'N-Triples', ext: 'nt', type: 'application/n-triples', make: toNTriples },
};

export { ABCD };
