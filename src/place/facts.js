/**
 * Place's adapter for Rhizome's fact layer (agreed with Rhizome, Place
 * stage 1). Rhizome's buildFacts calls this when the Place plugin is on for
 * the person, passing its own helpers:
 *
 *   ent(id, type, name, source, attrs)          add (or add to) an entity
 *   rel(from, rel, to, source, kind, extra)     add a relation (both ends must exist)
 *   entities                                    what's there so far
 *
 * It adds:
 *   - a `place` entity for each place: place:<id>, attrs { kind, kindLabel, geo, hasArea, within }
 *   - attrs.geo on every pinned thing, unless its own plugin already gave it one (own object wins)
 *   - 'located at' (thing → place), 'serves' (thing → place), both kind 'locates'
 *   - 'part of' (place → the place it's within), kind 'structure'
 *
 * Pins to things the person can't see (their plugin is off) are skipped,
 * because the entity isn't there.
 */
import { migratePlace, geoOfPin, kindLabel } from './model.js';
import { addFactAdapter } from '../rhizome/facts.js';

export function buildPlaceFacts(placeDoc, ent, rel, entities) {
  if (!placeDoc) return;
  const doc = migratePlace(placeDoc);
  for (const p of Object.values(doc.places)) {
    ent(`place:${p.id}`, 'place', p.name, 'place', {
      kind: p.kind, kindLabel: kindLabel(p.kind), description: p.description ?? '', tags: [...(p.tags ?? [])],
      geo: { lat: p.geo.lat, lng: p.geo.lng, precision: p.area ? 'area' : 'exact', placeId: p.id }, hasArea: !!p.area, within: p.within ?? null,
    });
  }
  for (const p of Object.values(doc.places)) if (p.within) rel(`place:${p.id}`, 'part of', `place:${p.within}`, 'place', 'structure');
  for (const [key, pin] of Object.entries(doc.pins)) {
    const e = entities[key];
    if (!e) continue;
    if (!e.attrs.geo) e.attrs.geo = geoOfPin(doc, pin);
    if (pin.placeId) rel(key, 'located at', `place:${pin.placeId}`, 'place', 'locates', pin.note ? { note: pin.note } : {});
    for (const s of pin.serves ?? []) if (s !== pin.placeId) rel(key, 'serves', `place:${s}`, 'place', 'locates');
  }
}

// Rhizome runs this after its own adapters, only when Place is on (src/rhizome/adapters.js imports this file).
addFactAdapter('place', buildPlaceFacts);

/**
 * The same facts, built on their own: for Place itself, before Rhizome
 * wires the adapter in (and for tests). Adds to an existing `facts`
 * ({ entities, relations }) in place, unless place facts are already there.
 */
export function addPlaceFacts(facts, placeDoc) {
  if (Object.values(facts.entities).some((e) => e.source === 'place')) return facts;
  const ent = (id, type, name, source, attrs = {}) => {
    if (!facts.entities[id]) facts.entities[id] = { id, type, name: String(name ?? '').trim() || 'Untitled', source, attrs: { ...attrs } };
    else Object.assign(facts.entities[id].attrs, attrs);
    return facts.entities[id];
  };
  const rel = (from, r, to, source, kind, extra = {}) => {
    if (!from || !to || from === to || !facts.entities[from] || !facts.entities[to]) return;
    facts.relations.push({ from, rel: r, to, source, kind, ...extra });
  };
  buildPlaceFacts(placeDoc, ent, rel, facts.entities);
  return facts;
}
