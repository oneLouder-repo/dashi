/**
 * The critical AI visualiser (Rhizome stage 4): a deliberately tiny,
 * transparent "inference engine" that answers a question about your facts
 * and keeps every step on show, so learners can watch it think and ask
 * sharper questions of the real AI tools they meet.
 *
 * It is NOT a language model and says so. It runs in the browser, with no
 * network and no model. Six steps, the same six lanes the Claude engine
 * will use in stage 5:
 *
 *   tokens     the question splits into word pieces; filler words fade
 *   meaning    tokens are matched to things, types, categories and measures
 *              through a small hand-built vocabulary; the rest stay grey
 *   retrieval  matched things glow on a mini graph, and activation spreads
 *              along ties, fading with each hop
 *   attention  each fact gets a weight from closeness, links and word hits
 *   reasoning  the heaviest facts run past the measure rules; each one that
 *              fires is a step in a chain
 *   answer     a short answer from templates, every phrase linked to the
 *              facts and rules it came from
 *
 * At each step a "critical lens" note asks where it could go wrong.
 *
 * visualise({ question, rows, facts, measures, weights, statement }) → trace
 * trace = { question, lanes: { tokens, meaning, retrieval, attention, reasoning, answer }, lens: { lane: text }, findings, statement }
 *
 * With a statement (a finding from the rack's Say module, d 2026-11-27), it
 * doesn't answer: it reads the rack's sentence the way a language system
 * would, step by step, beside the rack's own trail (the filters and weighing
 * that really made it), so the two kinds of "reasoning" can be compared.
 */
import { graphOf } from './rackGraph.js';
import { ENTITY_TYPES } from './facts.js';

export const LANES = [
  { id: 'tokens', label: 'Tokens', blurb: 'The question splits into word pieces.' },
  { id: 'meaning', label: 'Meaning', blurb: 'Each piece is matched to what the facts know.' },
  { id: 'retrieval', label: 'Retrieval', blurb: 'Matches light up, and the glow spreads along ties.' },
  { id: 'attention', label: 'Attention', blurb: 'Each fact gets a weight: how much it counts.' },
  { id: 'reasoning', label: 'Reasoning', blurb: 'The heaviest facts run past the rules.' },
  { id: 'answer', label: 'Answer', blurb: 'Words from templates, each linked to its facts.' },
];

export const DEFAULT_QUESTION = 'Which community groups are on the edge of our network?';
export const DEFAULT_WEIGHTS = { near: 0.5, links: 0.3, words: 0.2 };

export const STOP = new Set(('a an the of to in on for and or is are was were be been being who whom whose what which where when how why do does did ' +
  'with by at from that this these those it its as about into our we us you your i me my any all some most more less than can could ' +
  'should would will shall may might have has had there their them they he she his her if then so just only very much many also ' +
  'out up down over under again ever each other such own same too s t ' +
  // Words too general to point at anything in the facts.
  'network networks group groups ecosystem system things thing stuff work').split(' '));

/** Words the engine knows that aren't names: a measure, a type, a category or a zone. */
const VOCAB = {
  // measures (the rules it can reason with)
  isolated: ['measure', 'isolates'], isolate: ['measure', 'isolates'], isolates: ['measure', 'isolates'], alone: ['measure', 'isolates'], lonely: ['measure', 'isolates'], disconnected: ['measure', 'isolates'], unconnected: ['measure', 'isolates'],
  edge: ['measure', 'fewLinks'], edges: ['measure', 'fewLinks'], margins: ['measure', 'fewLinks'], margin: ['measure', 'fewLinks'], few: ['measure', 'fewLinks'], thin: ['measure', 'fewLinks'], weak: ['measure', 'fewLinks'], periphery: ['measure', 'fewLinks'],
  hub: ['measure', 'hubs'], hubs: ['measure', 'hubs'], central: ['measure', 'hubs'], busiest: ['measure', 'hubs'], popular: ['measure', 'hubs'], connected: ['measure', 'hubs'], influential: ['measure', 'hubs'], key: ['measure', 'hubs'],
  bridge: ['measure', 'bridges'], bridges: ['measure', 'bridges'], broker: ['measure', 'bridges'], brokers: ['measure', 'bridges'], between: ['measure', 'bridges'], connector: ['measure', 'bridges'], connectors: ['measure', 'bridges'], gap: ['measure', 'bridges'],
  'one-way': ['measure', 'oneWay'], oneway: ['measure', 'oneWay'], unreturned: ['measure', 'oneWay'],
  overdue: ['measure', 'overdue'], late: ['measure', 'overdue'], blocked: ['measure', 'blockedWork'], stuck: ['measure', 'blockedWork'],
  unused: ['measure', 'unusedAssets'], idle: ['measure', 'unusedAssets'], unplaced: ['measure', 'unplaced'], loose: ['measure', 'looseIdeas'],
  // types
  people: ['type', 'person'], person: ['type', 'person'], staff: ['type', 'person'], volunteers: ['type', 'person'],
  actors: ['type', 'actor'], actor: ['type', 'actor'], organisations: ['type', 'actor'], organizations: ['type', 'actor'], orgs: ['type', 'actor'], partners: ['type', 'actor'], players: ['type', 'actor'],
  assets: ['type', 'asset'], asset: ['type', 'asset'], resources: ['type', 'asset'],
  goals: ['type', 'goal'], goal: ['type', 'goal'], objectives: ['type', 'objective'], objective: ['type', 'objective'], tasks: ['type', 'task'], task: ['type', 'task'], plans: ['type', 'plan'], plan: ['type', 'plan'],
  places: ['type', 'place'], place: ['type', 'place'], outcomes: ['type', 'outcome'], outcome: ['type', 'outcome'], maps: ['type', 'map'],
  // categories on the ecosystem maps
  community: ['category', 'community'], communities: ['category', 'community'], grassroots: ['category', 'community'],
  gatekeeper: ['category', 'gatekeeper'], gatekeepers: ['category', 'gatekeeper'], government: ['category', 'gatekeeper'], authorities: ['category', 'gatekeeper'],
  ally: ['category', 'ally'], allies: ['category', 'ally'], friends: ['category', 'ally'],
  funder: ['category', 'resource'], funders: ['category', 'resource'], funding: ['category', 'resource'], money: ['category', 'resource'],
  // zones
  micro: ['zone', 'micro'], meso: ['zone', 'meso'], macro: ['zone', 'macro'], local: ['zone', 'micro'], regional: ['zone', 'meso'], national: ['zone', 'macro'],
};

/** What each measure rule says, in words (the reasoning chain and the answer). */
export const RULE_TEXT = {
  isolates: 'has no ties on the map', fewLinks: 'has very few ties', hubs: 'is a hub, with many ties', bridges: 'bridges parts of the network that would otherwise drift apart',
  oneWay: 'has ties that only run one way', overdue: 'has overdue work', blockedWork: 'has blocked work', unusedAssets: 'is not used by any plan yet',
  unplaced: 'is not on the place map', looseIdeas: 'is an idea nothing builds on yet', hollowObjectives: 'is an objective with nothing under it', hollowGoals: 'is a goal with nothing under it',
  unstaffed: 'has nobody on it', untestedLinks: 'rests on a link nobody has tested', unsupportedOutcomes: 'is an outcome nothing supports',
};
/** The same, for more than one. */
export const RULE_PLURAL = {
  isolates: 'have no ties on the map', fewLinks: 'have very few ties', hubs: 'are hubs, with many ties', bridges: 'bridge parts of the network that would otherwise drift apart',
  oneWay: 'have ties that only run one way', overdue: 'have overdue work', blockedWork: 'have blocked work', unusedAssets: 'are not used by any plan yet', unplaced: 'are not on the place map',
  looseIdeas: 'are ideas nothing builds on yet', hollowObjectives: 'are objectives with nothing under them', hollowGoals: 'are goals with nothing under them', unstaffed: 'have nobody on them',
  untestedLinks: 'rest on links nobody has tested', unsupportedOutcomes: 'are outcomes nothing supports',
};
const MEASURE_NAME = { isolates: 'isolates', fewLinks: 'few ties', hubs: 'hubs', bridges: 'bridges', oneWay: 'one-way ties', overdue: 'overdue', blockedWork: 'blocked work', unusedAssets: 'unused', unplaced: 'unplaced', looseIdeas: 'loose ideas' };

const stem = (w) => w.replace(/['’]s$/, '').replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1');
const wordsOf = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? []);

/** Step 1: the question as tokens, filler marked. */
export function tokenise(question) {
  return (String(question).match(/[A-Za-z0-9][A-Za-z0-9'’-]*|[?!.,;:]/g) ?? []).map((text, i) => {
    const low = text.toLowerCase();
    const punct = /^[?!.,;:]$/.test(text);
    return { i, text, low, filler: punct || STOP.has(low), punct };
  });
}

/** Lists of ids per measure (string entries, or records with an id). */
function listIds(measures) {
  const out = {};
  for (const [k, v] of Object.entries(measures?.lists ?? {})) out[k] = new Set((v ?? []).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean));
  return out;
}

/** The engine. Pure and synchronous: same question, same facts, same trace. */
export function visualise({ question = DEFAULT_QUESTION, rows = [], facts, measures, weights = DEFAULT_WEIGHTS, statement = null } = {}) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const E = facts.entities;
  const g = graphOf(facts);
  const lists = listIds(measures);
  const focus = new Set(rows.map((r) => r.id).filter((id) => E[id]));

  /* 1. tokens */
  const tokens = tokenise(question);
  const content = tokens.filter((t) => !t.filler);

  /* 2. meaning: names first (longest names win), then the vocabulary */
  const nameIndex = new Map(); // word → entity ids
  for (const e of Object.values(E)) {
    if (!['actor', 'person', 'group', 'asset', 'place', 'goal', 'objective', 'plan', 'outcome'].includes(e.type)) continue;
    for (const w of new Set(wordsOf(e.name).filter((x) => x.length >= 4 && !STOP.has(x)).map(stem))) {
      if (!nameIndex.has(w)) nameIndex.set(w, []);
      nameIndex.get(w).push(e.id);
    }
  }
  const meaning = content.map((t) => {
    const v = VOCAB[t.low] ?? VOCAB[stem(t.low)];
    if (v) {
      const [kind, id] = v;
      const label = kind === 'measure' ? `measure: ${MEASURE_NAME[id] ?? id}` : kind === 'type' ? `type: ${ENTITY_TYPES[id]?.plural ?? id}` : `${kind}: ${id}`;
      return { token: t.i, text: t.text, kind, id, label };
    }
    const ids = nameIndex.get(stem(t.low)) ?? [];
    if (ids.length) {
      // A word in many names is a weak clue: keep the ones in the patch first, then the best connected.
      const pick = [...ids].sort((a, b) => (focus.has(b) - focus.has(a)) || ((g.get(b)?.size ?? 0) - (g.get(a)?.size ?? 0))).slice(0, 4);
      return { token: t.i, text: t.text, kind: 'name', ids: pick, more: ids.length - pick.length, label: pick.length === 1 ? E[pick[0]].name : `${ids.length} names` };
    }
    return { token: t.i, text: t.text, kind: null, label: null };
  });
  const matched = meaning.filter((m) => m.kind);
  const asked = matched.filter((m) => m.kind === 'measure').map((m) => m.id);
  const types = matched.filter((m) => m.kind === 'type').map((m) => m.id);
  const cats = matched.filter((m) => m.kind === 'category').map((m) => m.id);
  const zones = matched.filter((m) => m.kind === 'zone').map((m) => m.id);

  /* 3. retrieval: seeds, then spreading activation, two hops */
  const seeds = new Map(); // id → { act, why }
  const seed = (id, act, why) => { if (E[id] && (seeds.get(id)?.act ?? 0) < act) seeds.set(id, { act, why }); };
  for (const m of matched.filter((x) => x.kind === 'name')) for (const id of m.ids) seed(id, 1, `the word “${m.text}”`);
  // A statement names its things outright: they are where the reading starts.
  if (statement) for (const id of focus) seed(id, 1, 'named in the statement');
  // Types, categories and zones narrow a pool: the patch's rows if there are any, otherwise every actor.
  const pool = focus.size ? [...focus] : Object.keys(E).filter((id) => E[id].type === 'actor');
  const fits = (id) => (!types.length || types.includes(E[id].type)) && (!cats.length || cats.includes(E[id].attrs?.category)) && (!zones.length || zones.includes(E[id].attrs?.zone));
  if (types.length || cats.length || zones.length) for (const id of pool.filter(fits).slice(0, 14)) seed(id, 0.8, [...types, ...cats, ...zones].join(' + '));
  for (const k of asked) for (const id of [...(lists[k] ?? [])].filter((x) => E[x] && (!(types.length || cats.length || zones.length) || fits(x))).slice(0, 10)) seed(id, 0.9, `the measure “${MEASURE_NAME[k] ?? k}”`);
  let fallback = false;
  if (!seeds.size) { fallback = true; for (const id of pool.slice(0, 8)) seed(id, 0.6, 'what is plugged in'); }
  const act = new Map([...seeds].map(([id, s]) => [id, { act: s.act, hop: 0, via: null }]));
  let frontier = [...seeds.keys()];
  for (let hop = 1; hop <= 2 && frontier.length; hop++) {
    const next = [];
    for (const id of frontier) {
      const a = act.get(id).act * 0.5;
      if (a < 0.1) continue;
      for (const x of [...(g.get(id) ?? [])].sort()) {
        if (!E[x] || E[x].type === 'map') continue;
        const cur = act.get(x);
        if (!cur) { act.set(x, { act: a, hop, via: id }); next.push(x); } else if (cur.hop === hop && cur.act < a) cur.act = a;
      }
    }
    frontier = next;
  }
  // Keep the strongest 48 so the mini graph stays readable.
  const kept = [...act.entries()].sort((a, b) => b[1].act - a[1].act || (g.get(b[0])?.size ?? 0) - (g.get(a[0])?.size ?? 0)).slice(0, 48);
  const keptIds = new Set(kept.map(([id]) => id));
  const retrievalNodes = kept.map(([id, a]) => ({ id, name: E[id].name, type: E[id].type, hop: a.hop, act: Math.round(a.act * 100) / 100, seed: seeds.has(id), why: seeds.get(id)?.why ?? null, inPatch: focus.has(id) }));
  const retrievalEdges = [];
  for (const id of keptIds) for (const x of g.get(id) ?? []) if (x > id && keptIds.has(x)) retrievalEdges.push([id, x]);
  const comparable = Object.values(E).filter((e) => !['map', 'block', 'context'].includes(e.type)).length;

  /* 4. attention */
  const degs = [...keptIds].map((id) => g.get(id)?.size ?? 0);
  const topDeg = Math.max(1, ...degs);
  const wordHit = new Set(matched.filter((m) => m.kind === 'name').flatMap((m) => m.ids));
  const attention = retrievalNodes.map((n) => {
    const deg = g.get(n.id)?.size ?? 0;
    const parts = { near: W.near * n.act, links: W.links * (deg / topDeg), words: W.words * (wordHit.has(n.id) || n.seed ? 1 : 0) };
    return { id: n.id, name: n.name, parts, raw: parts.near + parts.links + parts.words, deg };
  });
  const maxRaw = Math.max(1e-9, ...attention.map((a) => a.raw));
  for (const a of attention) a.weight = Math.round((a.raw / maxRaw) * 100) / 100;
  attention.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  // The same organisation drawn on two maps is two facts with one name: show it once, at its heaviest.
  const seenName = new Set();
  const attentionOnce = attention.filter((a) => (seenName.has(a.name) ? false : seenName.add(a.name)));
  const linkShare = attentionOnce.slice(0, 8).reduce((s, a) => s + a.parts.links, 0) / Math.max(1e-9, attentionOnce.slice(0, 8).reduce((s, a) => s + a.raw, 0));

  /* 5. reasoning: the top facts past the rules */
  const top = attentionOnce.slice(0, 6);
  // A rule fires for a name if it fires for any fact with that name.
  const sameName = (id) => attention.filter((a) => a.name === E[id].name).map((a) => a.id);
  const reasoning = [];
  for (const a of top) {
    const fired = Object.keys(RULE_TEXT).filter((k) => sameName(a.id).some((id) => lists[k]?.has(id)));
    const wanted = asked.length ? fired.filter((k) => asked.includes(k)) : fired;
    if (asked.length && !wanted.length) reasoning.push({ id: a.id, name: a.name, rule: null, fits: false, text: `doesn’t fit “${asked.map((k) => MEASURE_NAME[k] ?? k).join(', ')}”`, weight: a.weight });
    else if (!fired.length) reasoning.push({ id: a.id, name: a.name, rule: null, fits: null, text: 'no rule fires: it is just close to your words', weight: a.weight });
    else for (const k of wanted.slice(0, 2)) reasoning.push({ id: a.id, name: a.name, rule: k, fits: true, text: RULE_TEXT[k], weight: a.weight });
  }
  // A statement brings the rack's own trail: the filters it passed and how it was weighed. Those come first.
  if (statement) {
    const who = statement.rows?.[0]?.name ?? 'It';
    const trail = (statement.trail ?? []).map((t) => ({ id: statement.rows?.[0]?.id ?? null, name: t.kind === 'weigh' ? 'Weigh' : 'Filter', rule: null, fits: t.ok, text: t.kind === 'weigh' ? t.text : `${who}: ${t.text}`, weight: 1, rack: true }));
    trail.push({ id: null, name: 'Say', rule: null, fits: true, text: `the tip ${statement.tip ? `“${statement.tip}” ` : ''}turned it into this sentence`, weight: 1, rack: true });
    reasoning.unshift(...trail);
  }
  const firedSteps = reasoning.filter((r) => r.rule);

  /* 6. answer */
  const phrases = [];
  const names = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  if (asked.length) {
    const yes = firedSteps.filter((r) => r.fits);
    const byRule = {};
    for (const r of yes) (byRule[r.rule] ??= []).push(r);
    for (const [k, rs] of Object.entries(byRule)) {
      const ids = [...new Set(rs.map((r) => r.id))].slice(0, 3);
      phrases.push({ text: `${names(ids.map((id) => E[id].name))} ${ids.length === 1 ? RULE_TEXT[k] : RULE_PLURAL[k]}.`, facts: ids, rule: k });
    }
    if (!yes.length) phrases.push({ text: `Nothing it retrieved fits “${asked.map((k) => MEASURE_NAME[k] ?? k).join(', ')}”.`, facts: [], rule: asked[0] });
  } else if (top.length) {
    const lead = firedSteps[0];
    if (lead) phrases.push({ text: `${lead.name} stands out: it ${lead.text}.`, facts: [lead.id], rule: lead.rule });
    else phrases.push({ text: `${top[0].name} is closest to your words.`, facts: [top[0].id], rule: null });
  }
  const leadId = phrases[0]?.facts[0];
  if (leadId) {
    const ties = [...(g.get(leadId) ?? [])].filter((x) => keptIds.has(x) && E[x].type !== 'map' && E[x].name !== E[leadId].name).slice(0, 2);
    const tieNames = [...new Set(ties.map((x) => E[x].name))];
    if (tieNames.length) phrases.push({ text: `${E[leadId].name} is tied to ${names(tieNames)}.`, facts: [leadId, ...ties], rule: null });
  }
  if (statement) {
    // The answer is the rack's sentence; the reading above is how a language system would rebuild it.
    phrases.length = 0;
    phrases.push({ text: statement.text, facts: [...focus], rule: null, rack: true });
    const lost = [...focus].filter((id) => !keptIds.has(id));
    if (lost.length) phrases.push({ text: `Reading it back, the engine lost track of ${names(lost.map((id) => E[id].name))}.`, facts: [], rule: null });
  }
  const evidence = matched.length + firedSteps.length + (statement ? (statement.trail?.length ?? 0) + 1 : 0);
  const confidence = evidence >= 6 ? 'solid' : evidence >= 3 ? 'some' : 'thin';
  if (!phrases.length) phrases.push({ text: 'It found nothing to say.', facts: [], rule: null });

  /* the critical lens */
  const dropped = tokens.filter((t) => t.filler && !t.punct);
  const unmatched = meaning.filter((m) => !m.kind).map((m) => m.text);
  const lens = {
    tokens: dropped.some((t) => ['not', 'no'].includes(t.low))
      ? `It threw away “not”. A system that drops small words can turn a question upside down.`
      : `${dropped.length} of ${tokens.filter((t) => !t.punct).length} words were thrown away as filler. Real systems keep more, but they still split your words into pieces they never show you.`,
    meaning: unmatched.length
      ? `It has no word for ${unmatched.slice(0, 3).map((w) => `“${w}”`).join(', ')}. If a community calls itself something your maps don’t, the system can’t see it.`
      : 'Every word matched something. That is rare, and it only means the words were in its vocabulary, not that it understood you.',
    retrieval: fallback
      ? 'Nothing in the question matched, so it fell back on whatever was plugged in, and will still answer as if it knew.'
      : `${Math.max(0, comparable - act.size)} things in your facts were never reached. Anything that was never mapped can’t be found at all.`,
    attention: linkShare > 0.35
      ? `Links make up ${Math.round(linkShare * 100)}% of the top weights. Bigger organisations tend to have more links, so they get more attention, whatever you asked.`
      : 'The weights are someone’s choice. Move the sliders and watch the answer change, with the same facts.',
    reasoning: firedSteps.length
      ? `${firedSteps.length} rule${firedSteps.length === 1 ? '' : 's'} fired. A rule is somebody’s idea of what matters, written down.`
      : 'No rule fired. It will still give an answer, built only on closeness to your words.',
    answer: confidence === 'thin'
      ? `This sounds sure of itself, but rests on thin evidence: ${matched.length} matched word${matched.length === 1 ? '' : 's'} and ${firedSteps.length} rule${firedSteps.length === 1 ? '' : 's'}.`
      : 'Every phrase links back to its facts and rules. Most real AI answers don’t show you that.',
  };

  if (statement) {
    lens.reasoning = `The first ${reasoning.filter((r) => r.rack).length} steps are the rack’s own: filters and a weighing you can see and change, so the statement is exact. A language model has no trail like this unless it is made to show one, and even then it may be a story told afterwards.`;
    lens.answer = 'Same sentence, two ways: the rack made it from rules, and a language system would rebuild it from word pieces and weights. Check that both point at the same things.';
    if (!focus.size) lens.retrieval = 'This statement names nothing in your facts, so there was nothing for the reading to start from.';
  }
  const findings = phrases.filter((p) => p.facts.length).map((p, i) => ({ id: `vis:${i}`, score: Math.max(0.2, 0.9 - i * 0.2) * (confidence === 'thin' ? 0.6 : 1), text: p.text, items: p.facts, rows: p.facts.map((id) => ({ id, name: E[id].name })) }));

  return {
    question,
    lanes: {
      tokens,
      meaning,
      retrieval: { nodes: retrievalNodes, edges: retrievalEdges, reached: act.size, of: comparable, fallback },
      attention: { facts: attentionOnce.slice(0, 10), weights: W, linkShare },
      reasoning,
      answer: { phrases, confidence, evidence },
    },
    lens,
    findings,
    statement: !!statement,
  };
}
