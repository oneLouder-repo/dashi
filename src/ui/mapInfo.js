import { regionAt, columnAt } from '../lenses/index.js';

/**
 * Plain facts about things on a map, for the inspector, the details dialog
 * and the hover cards: where an actor sits, what it is linked to, which
 * groups it is in.
 */

/** "Meso · Adopt", or "Outside the lens". */
export function whereIs(lens, actor) {
  return [regionAt(lens, actor.place)?.label, columnAt(lens, actor.place)?.label].filter(Boolean).join(' · ') || 'Outside the lens';
}

/**
 * Everything an actor is linked to: [{ connector, other, direction, type }],
 * strongest first. `direction` is 'out', 'in' or 'both' (a floating end has no `other`).
 */
export function linksOf(map, lens, actorId) {
  const out = [];
  for (const c of Object.values(map.connectors)) {
    const from = c.from?.actorId === actorId;
    const to = c.to?.actorId === actorId;
    if (!from && !to) continue;
    const otherId = from ? c.to?.actorId : c.from?.actorId;
    out.push({
      connector: c,
      other: otherId && otherId !== actorId ? map.actors[otherId] ?? null : null,
      direction: from && to ? 'both' : from ? 'out' : 'in',
      type: lens.typeById[c.type]?.label ?? c.type,
    });
  }
  return out.sort((a, b) => (b.connector.strength ?? 3) - (a.connector.strength ?? 3));
}

export const groupsOf = (map, actorId) => Object.values(map.groups ?? {}).filter((g) => g.memberIds.includes(actorId));

export const layerName = (map, item) => (map.layers.find((l) => l.id === item.layerId) ?? map.layers[0])?.name ?? '';

export const endName = (map, dock) => (dock?.actorId ? map.actors[dock.actorId]?.label || 'Untitled' : 'a floating end');

export const STRENGTH_WORDS = ['', 'Very weak', 'Weak', 'Medium', 'Strong', 'Very strong'];
