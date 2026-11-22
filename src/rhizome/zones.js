/**
 * The lens zones (regions) Rhizome needs to place an actor, copied from
 * src/lenses/*.json so the fact layer stays pure (no fetch). test/rhizome.test.js
 * checks they still match the lens files.
 */
export const LENS_ZONES = {
  'micro-meso-macro': { name: 'Micro / Meso / Macro', zones: [{ id: 'micro', label: 'Micro / Me', depth: [0.667, 1] }, { id: 'meso', label: 'Meso / We', depth: [0.333, 0.667] }, { id: 'macro', label: 'Macro / Us', depth: [0, 0.333] }] },
  'water-of-systems-change': { name: 'Water of Systems Change', zones: [{ id: 'structural', label: 'Structural change', depth: [0, 0.333] }, { id: 'relational', label: 'Relational change', depth: [0.333, 0.667] }, { id: 'transformative', label: 'Transformative change', depth: [0.667, 1] }] },
  'spheres-of-systems-change': { name: 'Spheres of Systems Change (NPC)', zones: [{ id: 'internal', label: 'Internal', depth: [0.917, 1] }, { id: 'behavioural', label: 'Behavioural', depth: [0.833, 0.917] }, { id: 'relational', label: 'Relational', depth: [0.75, 0.833] }, { id: 'organisational', label: 'Organisational', depth: [0.667, 0.75] }, { id: 'collective', label: 'Collective', depth: [0.5, 0.667] }, { id: 'infrastructural', label: 'Infrastructural', depth: [0.333, 0.5] }, { id: 'political', label: 'Political', depth: [0.167, 0.333] }, { id: 'cultural', label: 'Cultural / societal', depth: [0, 0.167] }] },
  'leverage-points': { name: 'Twelve Leverage Points (Meadows)', zones: [{ id: 'lp12', label: '12 · Constants, parameters, numbers', depth: [0, 0.083] }, { id: 'lp11', label: '11 · Sizes of buffers and stocks', depth: [0.083, 0.167] }, { id: 'lp10', label: '10 · Structure of material stocks and flows', depth: [0.167, 0.25] }, { id: 'lp9', label: '9 · Lengths of delays', depth: [0.25, 0.333] }, { id: 'lp8', label: '8 · Strength of balancing feedback loops', depth: [0.333, 0.417] }, { id: 'lp7', label: '7 · Gain of reinforcing feedback loops', depth: [0.417, 0.5] }, { id: 'lp6', label: '6 · Structure of information flows', depth: [0.5, 0.583] }, { id: 'lp5', label: '5 · Rules of the system', depth: [0.583, 0.667] }, { id: 'lp4', label: '4 · Power to change system structure', depth: [0.667, 0.75] }, { id: 'lp3', label: '3 · Goals of the system', depth: [0.75, 0.833] }, { id: 'lp2', label: '2 · Mindset or paradigm', depth: [0.833, 0.917] }, { id: 'lp1', label: '1 · Power to transcend paradigms', depth: [0.917, 1] }] },
  'theory-of-system-change': { name: 'Theory of System Change (ToSC)', zones: [{ id: 'events', label: 'Events & behaviours', depth: [0, 0.25] }, { id: 'patterns', label: 'Patterns & trends', depth: [0.25, 0.5] }, { id: 'structures', label: 'Structures, values & rules', depth: [0.5, 0.75] }, { id: 'mental-models', label: 'Beliefs & mental models', depth: [0.75, 1] }] },
};

/** The zone an actor sits in on its map's lens, or null. */
export function zoneOf(lensId, depth) {
  const lens = LENS_ZONES[lensId] ?? LENS_ZONES['micro-meso-macro'];
  if (depth == null || Number.isNaN(Number(depth))) return null;
  const d = Math.min(1, Math.max(0, Number(depth)));
  return lens.zones.find((z) => d >= z.depth[0] && d <= z.depth[1]) ?? null;
}
