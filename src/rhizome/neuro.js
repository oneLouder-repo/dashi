import { tokens } from '../platform/tagSuggest.js';
import { FIELDS } from './rack.js';

/**
 * The neuro-symbolic tools (d, 2026-11-27): Claude tools for the rack,
 * mocked in the browser until the AI plugin's Claude proxy arrives (alpha
 * 0.7). Each one shows the prompt it would send and an estimate of what it
 * would cost, so nothing about it is hidden. The mocks are deterministic:
 * the same patch always gives the same words.
 *
 * Neural to symbolic:
 *   translate(question, ctx)        plain words → a proposed patch (modules and cables)
 *   conceptLens(rows, seed, ctx)    rows ranked by meaning, not ties (an embedding stand-in)
 * Symbolic to neural:
 *   narrate(findings, { imagination })  findings → a short summary, every sentence citing its findings
 * Each checks the other:
 *   verify(findings, ctx)           flags names and numbers the facts don't back
 *   critique(patch, run, ctx)       reads a patch and says what might be missing
 */

export const MOCK_MODEL = 'Claude (mocked)';
/** A rough estimate only: four characters a token, and placeholder prices per million tokens. */
export const PRICE = { in: 3, out: 15 };
export function usageOf(prompt, reply) {
  const inTok = Math.ceil(String(prompt).length / 4), outTok = Math.ceil(String(reply).length / 4);
  return { inTok, outTok, cost: (inTok * PRICE.in + outTok * PRICE.out) / 1e6 };
}

const lc = (s) => String(s ?? '').toLowerCase();
const has = (q, ...words) => words.some((w) => new RegExp(`(^|[^a-z])${w}`, 'i').test(q));

/* ------------------------------------------------------------ translate */

const TYPE_WORDS = [
  ['actor', ['partner', 'actor', 'organi[sz]ation', 'org', 'group', 'funder', 'ally', 'allies', 'gatekeeper', 'who ']],
  ['objective', ['objective']], ['goal', ['goal']], ['plan', ['plan']], ['workplan', ['workplan', 'work plan']], ['task', ['task']],
  ['asset', ['asset', 'resource']], ['person', ['people', 'staff', 'person', 'team member']], ['soar', ['soar', 'strength', 'idea']],
  ['place', ['place', 'location']],
];
const CATEGORY_WORDS = [['community', ['community']], ['gatekeeper', ['gatekeeper', 'council', 'government']], ['resource', ['funder', 'resource']], ['ally', ['ally', 'allies']], ['problem', ['problem']]];

/**
 * Plain words into a patch, the way a language model would propose one: a
 * small grammar here, Claude later. Returns
 * { modules: [{ type, params }], cables: [[from, port, to, port]], steps: [text], unknown: [word], confidence, prompt, reply }.
 * Module indexes in cables refer to `modules`. The spec never holds a
 * neuro-symbolic module, so running it can't loop.
 */
export function translate(question, ctx = null) {
  const q = ` ${lc(question)} `;
  const mods = [], cables = [], steps = [];
  const add = (type, params, why) => { mods.push({ type, params }); steps.push(why); return mods.length - 1; };
  const wire = (a, pa, b, pb) => cables.push([a, pa, b, pb]);
  let type = TYPE_WORDS.find(([, ws]) => has(q, ...ws))?.[0] ?? 'actor';
  const typeName = { actor: 'actors', objective: 'objectives', goal: 'goals', plan: 'plans', workplan: 'workplans', task: 'tasks', asset: 'assets', person: 'people', soar: 'SOAR ideas', place: 'places' }[type];

  // Where the rows come from: a list the measures made, or every thing of a type.
  let src, tip = null, group = false;
  if (has(q, 'isolat', 'no links', 'not linked', 'alone', 'unlinked')) { src = add('measure', { list: 'isolates' }, 'Measure: the isolates, things with no links'); tip = 'net-isolates'; group = true; type = 'actor'; }
  else if (has(q, 'hub', 'most connected', 'best connected')) { src = add('measure', { list: 'hubs' }, 'Measure: your hubs'); tip = 'net-hub'; type = 'actor'; }
  else if (has(q, 'only way', 'split', 'single point', 'lose', 'loss')) { src = add('measure', { list: 'bridges' }, 'Measure: bridges, whose loss would split a network'); tip = 'net-bridge'; type = 'actor'; }
  else if (has(q, 'one-way', 'one way', 'nothing back', 'reciproc')) { src = add('measure', { list: 'oneWay' }, 'Measure: flows that run one way'); tip = 'net-reciprocity'; group = true; }
  else if (type === 'asset' && has(q, 'unused', 'not used', 'nobody uses')) { src = add('measure', { list: 'unusedAssets' }, 'Measure: assets no plan uses'); tip = 'abcd-unused'; group = true; }
  else src = add('facts', { type }, `Facts: every one of your ${typeName}`);
  let last = src, port = 'out';
  const filter = (params, why) => { const f = add('filter', params, why); wire(last, port, f, 'in'); last = f; port = 'pass'; return f; };

  // Conditions.
  const cat = type === 'actor' ? CATEGORY_WORDS.find(([, ws]) => has(q, ...ws))?.[0] : null;
  if (cat && mods[src].type === 'facts') { filter({ field: 'category', op: 'eq', pct: null, value: cat }, `Filter: category is ${cat}`); tip ??= { community: 'eq-community-thin', gatekeeper: 'lev-gatekeeper', problem: 'lev-problem-central' }[cat] ?? null; }
  if (has(q, 'barely', 'few links', 'least connected', 'weakly', 'poorly connected', 'thin')) filter({ field: 'degree', op: 'lte', pct: 'p25', value: null }, 'Filter: links at most your 25th percentile');
  if (has(q, 'well connected', 'many links', 'strongly')) filter({ field: 'degree', op: 'gte', pct: 'p75', value: null }, 'Filter: links at least your 75th percentile');
  if (has(q, 'between', 'broker', 'bridge group', 'connect groups', 'across groups')) filter({ field: 'betweenness', op: 'gte', pct: 'p75', value: null }, 'Filter: betweenness at least your 75th percentile');
  const noMeasure = has(q, 'no measure', 'without a measure', 'unmeasured');
  const nobody = has(q, 'nobody', 'no one', 'no owner', 'unstaffed', 'without people');
  if (noMeasure && nobody) {
    // Either condition: two filters joined by an OR gate.
    const a = add('filter', { field: 'measures', op: 'eq', pct: null, value: 0 }, 'Filter: no measures');
    const b = add('filter', { field: 'staff', op: 'eq', pct: null, value: 0 }, 'Filter: nobody on it');
    wire(last, port, a, 'in'); wire(last, port, b, 'in');
    const g = add('gate', { mode: 'or' }, 'Gate OR: either one');
    wire(a, 'pass', g, 'a'); wire(b, 'pass', g, 'b');
    last = g; port = 'out'; tip ??= 'hyg-no-measure';
  } else if (noMeasure) { filter({ field: 'measures', op: 'eq', pct: null, value: 0 }, 'Filter: no measures'); tip ??= 'hyg-no-measure'; }
  else if (nobody) { filter({ field: 'staff', op: 'eq', pct: null, value: 0 }, 'Filter: nobody on it'); tip ??= 'hyg-unstaffed'; }

  // Around something: walk one or two hops out.
  if (has(q, 'near', 'around', 'next to', 'one step', 'two step', 'introduce', 'close to', 'neighbour', 'neighbor')) {
    const hops = has(q, 'two step', 'two hop', 'friends of friends') ? 2 : 1;
    const nb = add('neighbours', { hops }, `Neighbours: ${hops} hop${hops > 1 ? 's' : ''} out, only the new ones (ring)`);
    wire(last, port, nb, 'in'); last = nb; port = 'ring';
  }

  // Ranking: betweenness when the question is about sitting between, links otherwise.
  const by = has(q, 'between', 'broker', 'bridge') ? 'betweenness' : 'degree';
  const w = add('weigh', { base: 0.5, field: by, w: 0.4 }, `Weigh: start at 0.5, add 0.4 of ${FIELDS[by]}`);
  wire(last, port, w, 'in');
  const say = add('say', { tip: tip ?? (by === 'betweenness' ? 'lev-gatekeeper' : 'net-hub'), group }, `Say: the ${tip ?? (by === 'betweenness' ? 'lev-gatekeeper' : 'net-hub')} tip${group ? ', grouped' : ''}`);
  wire(w, 'out', say, 'in');

  const known = new Set(['which', 'who', 'what', 'our', 'are', 'that', 'have', 'with', 'and', 'the', 'but', 'not', 'yet', 'should', 'could', 'would']);
  const words = (lc(question).match(/[a-z][a-z'-]+/g) ?? []).filter((x) => x.length > 2 && !known.has(x));
  const matched = (x) => [...TYPE_WORDS, ...CATEGORY_WORDS].some(([, ws]) => ws.some((wd) => new RegExp(`^${wd.trim()}`).test(x)))
    || /^(isolat|hub|connect|link|between|broker|bridge|measure|nobody|owner|near|around|introduce|step|hop|unused|split|single|barely|few|least|well|many|one-way|loss|lose)/.test(x);
  const unknown = words.filter((x) => !matched(x));
  const confidence = Math.max(0.2, Math.min(0.95, 0.35 + 0.12 * (steps.length - 2) - 0.05 * unknown.length));

  const prompt = promptFor('translate', {
    task: 'Turn the question into a Rhizome patch. Use only these modules: facts, measure, filter, weigh, gate, neighbours, say. Answer as JSON: { modules, cables }.',
    question,
    vocabulary: { types: Object.keys(Object.fromEntries(TYPE_WORDS)), fields: Object.keys(FIELDS), lists: ctx ? Object.keys(ctx.measures?.lists ?? {}) : [] },
  });
  const reply = JSON.stringify({ modules: mods, cables });
  return { modules: mods, cables, steps, unknown, confidence, prompt, reply, usage: usageOf(prompt, reply) };
}

/* ------------------------------------------------------------ narrate */

const INVENTED = ['the Harbourview Alliance', 'Seaside Futures Network', 'the Tidewater Collective'];

/**
 * Findings into a short summary, sentence by sentence, each citing the
 * findings it rests on: { sentences: [{ text, cites: [i], invented }], text, prompt, reply, usage }.
 * `imagination` (0–1) is the mock's temperature: above 0.6 it adds a
 * plausible sentence that rests on nothing, so the Verifier has something to catch.
 */
export function narrate(findings, { imagination = 0.2, audience = 'board' } = {}) {
  const fs = (findings ?? []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const sentences = [];
  if (!fs.length) return { sentences, text: '', prompt: '', reply: '', usage: usageOf('', '') };
  const top = fs.slice(0, 4);
  const names = (f) => (f.rows ?? []).map((r) => r.name).filter(Boolean);
  const intro = audience === 'board' ? 'For the board' : audience === 'team' ? 'For the team' : 'In short';
  sentences.push({ text: `${intro}: Rhizome raised ${fs.length} finding${fs.length === 1 ? '' : 's'}, and ${top.length === 1 ? 'one stands' : `${top.length} stand`} out.`, cites: top.map((f) => fs.indexOf(f)) });
  for (const f of top) {
    const n = names(f);
    const who = n.length > 2 ? `${n.slice(0, 2).join(' and ')} and ${n.length - 2} more` : n.join(' and ');
    const first = String(f.text ?? '').split(/(?<=[.!?])\s/)[0];
    sentences.push({ text: who && !first.includes(n[0]) ? `${who}: ${first}` : first, cites: [fs.indexOf(f)] });
  }
  if (fs.length > top.length) sentences.push({ text: `${fs.length - top.length} more finding${fs.length - top.length === 1 ? '' : 's'} follow the same pattern and are listed in full.`, cites: fs.slice(top.length).map((f) => fs.indexOf(f)) });
  if (imagination > 0.6) {
    const made = INVENTED[Math.floor(imagination * 10) % INVENTED.length];
    sentences.push({ text: `Working more closely with ${made} would likely strengthen these ties.`, cites: [], invented: true });
  }
  const text = sentences.map((s) => s.text).join(' ');
  const prompt = promptFor('narrate', {
    task: `Write a short summary of these findings for the ${audience}. Every sentence must cite the findings it rests on, as [n]. Do not add names that are not in the findings.`,
    findings: fs.map((f, i) => ({ n: i + 1, score: f.score, text: f.text, names: names(f) })),
  });
  return { sentences, text, prompt, reply: text, usage: usageOf(prompt, text) };
}

/* ------------------------------------------------------------ verify */

/**
 * Checks text against the facts: names in it must be things Rhizome knows,
 * and numbers must match the counts behind it. Returns per finding
 * { ok, problems: [text], checked: [text] }.
 */
export function verify(findings, ctx) {
  const known = new Set(Object.values(ctx.facts.entities).map((e) => lc(e.name)));
  const nameish = /(?:the\s+)?(?:[A-Z][\w'’-]+(?:\s+(?:of|and|for|the|de|du)\s+|\s+)){1,5}[A-Z][\w'’-]+/g;
  return (findings ?? []).map((f) => {
    const text = String(f.text ?? '');
    const problems = [], checked = [];
    for (const raw of text.match(nameish) ?? []) {
      const name = raw.replace(/^the\s+/i, '').trim();
      if (/^(Rhizome|For|In|Working|The|This|These|Show|Read)\b/.test(name) && name.split(/\s+/).length < 3) continue;
      const hit = known.has(lc(name)) || known.has(lc(raw)) || [...known].some((k) => k.length > 4 && (k.includes(lc(name)) || lc(name).includes(k)));
      (hit ? checked : problems).push(hit ? `“${name}” is in your facts` : `“${name}” is not in your facts`);
    }
    for (const r of f.rows ?? []) if (r.name && text.includes(r.name)) checked.push(`“${r.name}” is the thing this finding rests on`);
    if (f.cites && !f.cites.length) problems.push('It cites no finding');
    return { ok: !problems.length, problems, checked: [...new Set(checked)] };
  });
}

/* ------------------------------------------------------------ critique */

/**
 * Reads a patch and the run it gave, and suggests what might be missing,
 * as a reviewer would. Returns [{ text, module, score }].
 */
export function critique(patch, run, defs) {
  const notes = [];
  const into = (id, port) => patch.cables.find((c) => c.to.m === id && (!port || c.to.port === port));
  const outOf = (id, port) => patch.cables.filter((c) => c.from.m === id && (!port || c.from.port === port));
  const rows = (id, port) => { const s = run.signals[id]?.[port]; return s?.kind === 'rows' ? s.rows.length : s?.kind === 'findings' ? s.findings.length : 0; };
  const upstream = (id, type, seen = new Set()) => {
    if (seen.has(id)) return false; seen.add(id);
    return patch.cables.filter((c) => c.to.m === id).some((c) => { const m = patch.modules.find((x) => x.id === c.from.m); return m?.type === type || upstream(c.from.m, type, seen); });
  };
  for (const m of patch.modules) {
    const label = defs[m.type]?.label ?? m.type;
    if (m.type === 'say') {
      if (!into(m.id)) continue;
      if (!upstream(m.id, 'weigh')) notes.push({ module: m.id, score: 0.7, text: `${label} has no Weigh before it, so every finding scores the same and nothing ranks them. Add a Weigh to put the strongest first.` });
      const n = run.signals[m.id]?.out?.findings?.length ?? 0;
      if (!m.params.group && n > 20) notes.push({ module: m.id, score: 0.65, text: `${label} makes ${n} findings, one per row. Switch it to grouped, or add a Filter, so the tip reads as one point instead of a list.` });
      if (/isolates|unused|reciprocity|unstaffed|loose|untested/.test(m.params.tip ?? '') && !m.params.group) notes.push({ module: m.id, score: 0.6, text: `The tip on ${label} is written for a group (“{count} …”). Switch ${label} to grouped so it reads well.` });
    }
    if (m.type === 'filter' && into(m.id)) {
      const pass = rows(m.id, 'pass'), rej = rows(m.id, 'reject');
      if (pass + rej > 0 && pass === 0) notes.push({ module: m.id, score: 0.55, text: `This ${label} lets nothing through (${FIELDS[m.params.field] ?? m.params.field}). It may be too strict for your data.` });
      if (pass + rej > 0 && rej === 0) notes.push({ module: m.id, score: 0.4, text: `This ${label} lets everything through, so it isn’t doing anything yet.` });
      if (rej > 0 && !outOf(m.id, 'reject').length && rej > pass * 3) notes.push({ module: m.id, score: 0.3, text: `Most rows (${rej}) leave this ${label} by reject. Patch reject into a Scope to see who you’re leaving out.` });
    }
    if (m.type === 'gate' && into(m.id) && (!into(m.id, 'a') || !into(m.id, 'b'))) notes.push({ module: m.id, score: 0.5, text: `The Gate has only one input. ${m.params.mode === 'not' ? 'NOT needs B to take anything away.' : 'Patch a second stream into it.'}` });
    if (defs[m.type]?.outs.length && !['Displays', 'Engines'].includes(defs[m.type].cat) && !outOf(m.id).length && !['say', 'translator'].includes(m.type) && m.type !== 'patchbay' && into(m.id)) notes.push({ module: m.id, score: 0.25, text: `Nothing listens to the ${label}. Patch it into a display, or into Say.` });
  }
  if (!patch.modules.some((m) => m.type === 'say')) notes.push({ module: null, score: 0.45, text: 'The patch has no Say, so it finds rows but tells nobody. Add a Say to turn them into findings.' });
  return notes.sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------ concept lens */

const textOf = (r, E) => {
  const e = E[r.id];
  return [r.name, r.category, r.zone, r.abcd, e?.attrs?.description, ...(e?.attrs?.tags ?? [])].filter(Boolean).join(' ');
};

/**
 * Rows ranked by how close their words are to a concept, an embedding
 * stand-in: weighted word overlap over stems, rare words counting more.
 * Returns [{ row, sim, words }], best first.
 */
export function conceptLens(rows, seed, ctx) {
  const E = ctx.facts.entities;
  const docs = rows.map((r) => new Set(tokens(textOf(r, E))));
  const df = new Map();
  for (const d of docs) for (const w of d) df.set(w, (df.get(w) ?? 0) + 1);
  const seedToks = [...new Set(tokens(seed))];
  if (!seedToks.length) return rows.map((row) => ({ row, sim: 0, words: [] }));
  const idf = (w) => Math.log(1 + (docs.length + 1) / ((df.get(w) ?? 0) + 1));
  const total = seedToks.reduce((s, w) => s + idf(w), 0) || 1;
  return rows.map((row, i) => {
    const words = seedToks.filter((w) => docs[i].has(w) || [...docs[i]].some((x) => x.length > 3 && (x.startsWith(w) || w.startsWith(x))));
    return { row, sim: Math.round((words.reduce((s, w) => s + idf(w), 0) / total) * 100) / 100, words };
  }).sort((a, b) => b.sim - a.sim || String(a.row.name).localeCompare(String(b.row.name)));
}

/* ------------------------------------------------------------ prompts */

/** The prompt a tool would send, as readable text (shown by Show prompt). */
export function promptFor(tool, body) {
  return [
    `# Rhizome · ${tool}`,
    'You are working inside Rhizome, a rules-based systems analysis tool for a nonprofit. Facts come from the organisation’s own data. Never invent names, ties or numbers. Say when the facts are too thin to answer.',
    '',
    ...Object.entries(body).map(([k, v]) => `## ${k}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`),
  ].join('\n');
}
