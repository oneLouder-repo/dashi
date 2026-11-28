/**
 * Far Beyond the Graph: the sound experiment in Rhizome Lab.
 *
 * This file turns the fact layer into a score: plain data, the same every
 * time for the same facts, so it can be tested and later rendered to a file.
 * The browser player (LabView) plays it with the Web Audio API.
 *
 *   present    each community a loop; each member a note placed by its id,
 *              pitched by how tied-in it is. Members on the edge of the
 *              network (one tie or none) get their own clear bell voice:
 *              they are heard, never treated as noise.
 *   bass       the brokers who bridge communities carry the bass line
 *   drums      a slow boom-bap pulse; the tighter the network, the busier the hats
 *   projected  likely ties not yet made (Adamic–Adar) as quiet ghost notes,
 *              marked as guesses
 *   past       saved snapshots set how much worn, filtered echo plays under
 *              it, and how loud the vinyl crackle is
 *
 * Nothing is composed by hand: change the relationships and the music changes.
 */
import { labMeasures, predictTies } from './labAlgo.js';

export const STEPS = 32; // two bars of sixteenths
/** D minor pentatonic across the octaves, as MIDI notes. */
export const SCALE = [0, 3, 5, 7, 10];
const ROOT = 50; // D3

/** A small, stable string hash (FNV-1a), so a member always lands on the same step. */
export function hashOf(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The nth note of the scale above the root (n may run past one octave). */
export const degree = (n, root = ROOT) => root + 12 * Math.floor(n / SCALE.length) + SCALE[((n % SCALE.length) + SCALE.length) % SCALE.length];

/**
 * The score for a fact layer. `snapshots` are Rhizome's saved snapshots
 * ({ at, entities, relations }), oldest first.
 */
export function scoreOf(facts, g, { snapshots = [], loops = 6, perLoop = 12, ghosts = 8 } = {}) {
  const lab = labMeasures(g);
  const linked = [...g.keys()].filter((id) => g.get(id).size);
  const ties = linked.reduce((s, id) => s + g.get(id).size, 0) / 2;
  const avg = linked.length ? (2 * ties) / linked.length : 0;
  // Slow and heavy for a sparse network, a little quicker as it knits: 72 to 92 bpm.
  const bpm = Math.round(Math.min(92, 72 + avg * 3));
  const name = (id) => facts.entities[id]?.name ?? id;

  const groups = lab.communities.filter((c) => c.ids.length > 1).slice(0, loops);
  const present = groups.map((c, li) => {
    const ranked = [...c.ids].sort((a, b) => (lab.core.get(b) ?? 0) - (lab.core.get(a) ?? 0) || g.get(b).size - g.get(a).size || (a < b ? -1 : 1));
    // The most tied-in members, and always room for those on the edge: they are heard, not cut.
    const edgeIds = ranked.filter((id) => g.get(id).size <= 1).slice(0, Math.floor(perLoop / 3));
    const members = [...ranked.filter((id) => !edgeIds.includes(id)).slice(0, perLoop - edgeIds.length), ...edgeIds];
    const used = new Set();
    const notes = members.map((id, k) => {
      // Each loop has its own lane of steps, so loops interlock rather than pile up.
      let step = (hashOf(id) % (STEPS / 2)) * 2 + (li % 2);
      while (used.has(step)) step = (step + 2) % STEPS;
      used.add(step);
      const edge = g.get(id).size <= 1;
      return { step, id, name: name(id), edge, midi: edge ? degree(10 + (k % 5)) : degree((li * 2 + Math.min(6, lab.core.get(id) ?? 0)) % 8 + 3), vel: edge ? 0.5 : 0.25 + 0.35 * Math.min(1, g.get(id).size / 8) };
    }).sort((a, b) => a.step - b.step);
    return { id: c.label, name: name(members[0]), size: c.ids.length, notes };
  });

  const edges = present.reduce((n, l) => n + l.notes.filter((x) => x.edge).length, 0);
  const allGroups = lab.communities.filter((c) => c.ids.length > 1).length;

  const brokers = [...lab.brokers].filter(([, b]) => b.ties >= 2).sort((a, b) => b[1].broker - a[1].broker || (a[0] < b[0] ? -1 : 1)).slice(0, 4);
  const bassSteps = [0, 6, 16, 22];
  const bass = brokers.map(([id, b], i) => ({ step: bassSteps[i], id, name: name(id), midi: degree([0, 3, 2, 1][i], ROOT - 24), len: i % 2 ? 4 : 6, vel: 0.4 + 0.4 * b.broker }));

  // Boom-bap: kick on 1, the "and" of 2 and beat 3; snare on 2 and 4; hats on the eighths, or sixteenths when the network is tight.
  const busy = lab.q < 0.4 || avg > 4;
  const drums = {
    kick: [0, 10, 16, 26, 29],
    snare: [8, 24],
    hat: Array.from({ length: STEPS }, (_, i) => i).filter((i) => (busy ? true : i % 2 === 0)),
  };

  const projected = predictTies(g, { limit: ghosts }).map((p, i) => ({ step: (hashOf(p.a + p.b) % STEPS), a: p.a, b: p.b, names: [name(p.a), name(p.b)], midi: degree(12 + (i % 5)), score: p.score, guess: true }));

  const snaps = snapshots.filter((s) => s && Number.isFinite(s.relations));
  const then = snaps[0];
  const now = facts.relations?.length ?? ties;
  const past = { snapshots: snaps.length, since: then?.at?.slice(0, 10) ?? null, ratio: then && now ? Math.min(1, then.relations / now) : 0, crackle: Math.min(0.5, 0.12 + snaps.length * 0.04) };

  const madeOf = `Made of ${linked.length.toLocaleString()} connected things and ${Math.round(ties).toLocaleString()} ties: ${groups.length < allGroups ? `the ${groups.length} biggest of its ${allGroups} communities` : `${groups.length} ${groups.length === 1 ? 'community' : 'communities'}`} as loops`
    + `${edges ? `, ${edges} ${edges === 1 ? 'member' : 'members'} on the edge heard as bells` : ''}`
    + `${projected.length ? `, ${projected.length} guessed ties as ghost notes` : ''}`
    + `${snaps.length ? `, and ${snaps.length} saved ${snaps.length === 1 ? 'snapshot' : 'snapshots'} as the past` : ''}.`
    + ' Played in your browser; nothing leaves it.';

  return { bpm, steps: STEPS, present, bass, drums, projected, past, edges, madeOf };
}

/** MIDI note to frequency in Hz. */
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
