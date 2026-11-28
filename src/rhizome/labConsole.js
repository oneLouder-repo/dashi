/**
 * The Lab console: a small pipe language over the fact layer, so a question
 * about the network can be typed, saved as a patch and shared.
 *
 *   actors where ties < 2 | weigh broker | top 5 | say
 *   people | weigh core | show name core community
 *   all | predict 10
 *   communities
 *   shapes
 *
 * A command is stages joined by `|`. The first names what to start from;
 * each next stage reshapes the result. Every run is read-only: the console
 * never changes the facts. runCommand(text, { facts, g }) returns
 * { kind: 'rows' | 'pairs' | 'groups' | 'shapes' | 'text', ... } or { error }.
 */
import { ENTITY_TYPES, typeLabel } from './facts.js';
import { labMeasures, predictTies, checkShapes } from './labAlgo.js';

export const FIELDS = {
  name: 'its name',
  type: 'what kind of thing it is',
  ties: 'how many ties it has',
  broker: 'broker score, 0 to 1 (1 − Burt constraint): higher bridges more groups',
  effective: 'effective size: contacts that are not tied to each other',
  core: 'core number: how deep in the network it sits',
  community: 'its community (Leiden-style)',
};
const NUMERIC = new Set(['ties', 'broker', 'effective', 'core']);

export const VERBS = [
  ['where <field> <op> <value>', 'keep rows that match; ops: = != < <= > >= ~ (contains); join with and'],
  ['weigh <field>', 'sort by that field, biggest first'],
  ['sort <field> [asc]', 'sort by that field (A to Z with asc)'],
  ['top <n>', 'keep the first n'],
  ['show <field> …', 'choose the columns'],
  ['predict [n]', 'likely missing ties touching these rows (Adamic–Adar)'],
  ['count', 'how many rows'],
  ['say', 'a sentence about the result'],
];
export const SOURCES = [
  ['all', 'every thing in the facts'],
  ['actors, people, objectives …', 'one kind of thing (any kind Rhizome knows)'],
  ['communities', 'the network split into communities'],
  ['shapes', 'shape checks: what is missing a tie or a field'],
];

/** The kind of thing a word names: 'actors', 'actor', 'People' → 'actor', 'person'. */
export function typeFor(word) {
  const w = word.toLowerCase();
  for (const [id, t] of Object.entries(ENTITY_TYPES)) if (w === id || w === `${id}s` || w === t.label.toLowerCase() || w === t.plural.toLowerCase()) return id;
  return null;
}

/** Splits a command into stages of words, keeping "quoted phrases" whole. */
export function tokenize(text) {
  return String(text).split('|').map((stage) => (stage.match(/"[^"]*"|\S+/g) ?? []).map((w) => w.replace(/^"|"$/g, ''))).filter((s) => s.length);
}

/** Every entity as a console row, with the Lab's measures on it. */
export function labRows(facts, g) {
  const lab = labMeasures(g);
  const commName = new Map();
  for (const c of lab.communities) {
    const lead = [...c.ids].sort((a, b) => (g.get(b)?.size ?? 0) - (g.get(a)?.size ?? 0) || (a < b ? -1 : 1))[0];
    commName.set(c.label, facts.entities[lead]?.name ?? lead);
  }
  return Object.values(facts.entities).map((e) => {
    const b = lab.brokers.get(e.id);
    return {
      id: e.id, name: e.name, type: e.type,
      ties: g.get(e.id)?.size ?? 0,
      broker: b ? Math.round(b.broker * 100) / 100 : 0,
      effective: b ? Math.round(b.effective * 10) / 10 : 0,
      core: lab.core.get(e.id) ?? 0,
      community: lab.comm.has(e.id) ? commName.get(lab.comm.get(e.id)) : '',
    };
  });
}

const cmp = (op, a, b) => {
  if (op === '~') return String(a).toLowerCase().includes(String(b).toLowerCase());
  const num = typeof a === 'number';
  const x = num ? a : String(a).toLowerCase(), y = num ? Number(b) : String(b).toLowerCase();
  return { '=': x === y, '!=': x !== y, '<': x < y, '<=': x <= y, '>': x > y, '>=': x >= y }[op];
};

function where(rows, words) {
  const conds = [];
  let i = 0;
  while (i < words.length) {
    const [field, op, ...rest] = words.slice(i);
    if (!FIELDS[field]) throw new Error(`where: "${field ?? ''}" isn't a field. Try ${Object.keys(FIELDS).join(', ')}.`);
    if (!['=', '!=', '<', '<=', '>', '>=', '~'].includes(op)) throw new Error(`where: "${op ?? ''}" isn't a comparison. Try = != < <= > >= ~`);
    const and = rest.indexOf('and');
    const value = (and < 0 ? rest : rest.slice(0, and)).join(' ');
    if (value === '') throw new Error(`where ${field} ${op}: a value is missing.`);
    if (NUMERIC.has(field) && !Number.isFinite(Number(value))) throw new Error(`where: ${field} is a number, so "${value}" can't be compared.`);
    const val = field === 'type' ? (typeFor(value) ?? value) : value;
    conds.push((r) => cmp(op, r[field], val));
    if (and < 0) break;
    i += 3 + and;
  }
  return rows.filter((r) => conds.every((c) => c(r)));
}

/** What a result says, as one plain sentence. */
export function sayOf(res, facts) {
  if (res.kind === 'rows') {
    if (!res.rows.length) return 'Nothing matches.';
    const kinds = [...new Set(res.rows.map((r) => r.type))];
    const what = kinds.length === 1 ? typeLabel(kinds[0], res.rows.length).toLowerCase() : 'things';
    const names = res.rows.slice(0, 3).map((r) => r.name);
    const lead = res.sorted ? ` By ${res.sorted}, ${names.join(', ')} ${names.length === 1 ? 'leads' : 'lead'}.` : ` Among them: ${names.join(', ')}.`;
    return `${res.rows.length} ${what}.${lead}`;
  }
  if (res.kind === 'pairs') {
    if (!res.pairs.length) return 'No likely missing ties: everything two steps apart is already tied, or too far apart to guess.';
    const p = res.pairs[0];
    return `${res.pairs.length} likely missing ${res.pairs.length === 1 ? 'tie' : 'ties'}. The strongest: ${facts.entities[p.a]?.name} and ${facts.entities[p.b]?.name}, who share ${p.via.length} ${p.via.length === 1 ? 'contact' : 'contacts'}.`;
  }
  if (res.kind === 'groups') return `${res.groups.length} communities (modularity ${res.q.toFixed(2)}${res.q >= 0.3 ? ', a clear split' : res.q > 0.1 ? ', a loose split' : ', barely split'}). The biggest has ${res.groups[0]?.ids.length ?? 0} members.`;
  if (res.kind === 'shapes') {
    const bad = res.results.filter((r) => r.failing.length);
    return bad.length ? `${bad.length} of ${res.results.length} shapes have gaps: ${bad.map((r) => `${r.shape.label.toLowerCase()} (${r.failing.length} missing)`).join('; ')}.` : `All ${res.results.length} shapes hold.`;
  }
  return res.text ?? '';
}

export function runCommand(text, { facts, g }) {
  const stages = tokenize(text);
  if (!stages.length) return { error: 'Type a command, like: actors | weigh broker | top 5' };
  try {
    const [first, ...rest] = stages;
    /** @type {any} A result: rows, pairs, groups, shapes or text. */
    let res;
    const src = first[0].toLowerCase();
    if (src === 'communities' || src === 'community') {
      const lab = labMeasures(g);
      res = { kind: 'groups', q: lab.q, groups: lab.communities.filter((c) => c.ids.length > 1) };
    } else if (src === 'shapes') {
      res = { kind: 'shapes', results: checkShapes(facts, g) };
    } else {
      const type = src === 'all' ? null : typeFor(src);
      if (src !== 'all' && !type) throw new Error(`"${first[0]}" isn't something Rhizome knows. Start with all, communities, shapes, or a kind like actors or people.`);
      const all = labRows(facts, g);
      res = { kind: 'rows', rows: type ? all.filter((r) => r.type === type) : all, cols: ['name', 'type', 'ties', 'broker', 'core', 'community'] };
      if (first.length > 1) rest.unshift(first.slice(1));
    }
    for (const [verb, ...words] of rest) {
      const v = verb.toLowerCase();
      if (v === 'say') { res = { ...res, said: sayOf(res, facts) }; continue; }
      if (v === 'count') { res = { kind: 'text', text: res.kind === 'rows' ? `${res.rows.length}` : res.kind === 'pairs' ? `${res.pairs.length}` : res.kind === 'groups' ? `${res.groups.length}` : '0' }; continue; }
      if (v === 'top') {
        const n = Number(words[0]);
        if (!(n > 0)) throw new Error('top: give a number, like top 5.');
        if (res.kind === 'rows') res = { ...res, rows: res.rows.slice(0, n) };
        else if (res.kind === 'pairs') res = { ...res, pairs: res.pairs.slice(0, n) };
        else if (res.kind === 'groups') res = { ...res, groups: res.groups.slice(0, n) };
        continue;
      }
      if (res.kind !== 'rows') throw new Error(`${v}: works on rows of things, not on ${res.kind}.`);
      if (v === 'where') res = { ...res, rows: where(res.rows, words) };
      else if (v === 'weigh' || v === 'sort') {
        const f = words[0];
        if (!FIELDS[f]) throw new Error(`${v}: "${f ?? ''}" isn't a field. Try ${Object.keys(FIELDS).join(', ')}.`);
        const asc = v === 'sort' && words[1] === 'asc';
        const dir = v === 'weigh' || !asc ? -1 : 1;
        const rows = [...res.rows].sort((a, b) => {
          const x = a[f], y = b[f];
          const d = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
          return d * (v === 'sort' && typeof x !== 'number' && !words[1] ? 1 : dir) || a.name.localeCompare(b.name);
        });
        res = { ...res, rows, sorted: f, cols: res.cols.includes(f) ? res.cols : [...res.cols, f] };
      } else if (v === 'show') {
        const bad = words.find((w) => !FIELDS[w]);
        if (bad) throw new Error(`show: "${bad}" isn't a field. Try ${Object.keys(FIELDS).join(', ')}.`);
        res = { ...res, cols: words.length ? words : res.cols };
      } else if (v === 'predict') {
        const n = Number(words[0]) || 10;
        res = { kind: 'pairs', pairs: predictTies(g, { limit: n, among: res.rows.length === Object.keys(facts.entities).length ? null : res.rows.map((r) => r.id) }) };
      } else throw new Error(`"${verb}" isn't a verb. Try ${VERBS.map(([v]) => v.split(' ')[0]).join(', ')}.`);
    }
    return res;
  } catch (err) {
    return { error: err.message };
  }
}

/* ---------------------------------------------------------------- patches */

/**
 * Patch packs: named sets of saved commands that install into an org's Lab.
 * A pack is plain JSON, so one org can export theirs and another install it.
 */
export const PATCH_PACKS = [
  { id: 'starter', name: 'Lab starter', by: 'Dashi', note: 'Five first questions to ask any network.', patches: [
    { name: 'Who bridges groups', cmd: 'all | where ties >= 2 | weigh broker | top 8 | say', note: 'Brokers: people and orgs whose contacts would not otherwise meet.' },
    { name: 'The core', cmd: 'all | weigh core | top 10 | show name type core community', note: 'The most deeply tied-in part of the network.' },
    { name: 'Loose ends', cmd: 'actors where ties < 2 | say', note: 'Actors with one tie or none: an invitation, or a gap in the map.' },
    { name: 'Ties worth making', cmd: 'all | predict 10 | say', note: 'Pairs who share contacts but are not tied yet.' },
    { name: 'How it splits', cmd: 'communities | say', note: 'Communities, and how clearly the network splits.' },
  ] },
  { id: 'care', name: 'Care and gaps', by: 'Dashi', note: 'Where support may be thin.', patches: [
    { name: 'Gaps in the record', cmd: 'shapes | say', note: 'What is missing a tie or a field.' },
    { name: 'People on the edge', cmd: 'people where core <= 1 | say', note: 'People with the fewest ties into the team.' },
    { name: 'One person holding it together', cmd: 'people | weigh broker | top 3 | say', note: 'If these people left, which groups would lose touch?' },
  ] },
];

let seq = 0;
const patchId = () => `lp-${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Adds a pack's patches to doc.labPatches, skipping any whose command is already there. Returns how many were added. */
export function installPack(doc, pack) {
  doc.labPatches ??= {};
  const have = new Set(Object.values(doc.labPatches).map((p) => p.cmd));
  let added = 0;
  for (const p of pack.patches ?? []) {
    if (!p?.cmd || have.has(p.cmd)) continue;
    const id = patchId();
    doc.labPatches[id] = { id, name: String(p.name || p.cmd).slice(0, 80), cmd: String(p.cmd).slice(0, 400), note: String(p.note ?? '').slice(0, 240), pack: pack.id ?? null };
    have.add(p.cmd);
    added++;
  }
  return added;
}

/** An org's patches as a pack another org can install. */
export function exportPack(doc, name = 'Our patches') {
  return { id: `pack-${Date.now().toString(36)}`, name, by: 'Dashi Lab', patches: Object.values(doc.labPatches ?? {}).map(({ name: n, cmd, note }) => ({ name: n, cmd, note })) };
}

/** Reads a pasted pack; throws a plain message if it isn't one. */
export function readPack(text) {
  let p;
  try { p = JSON.parse(text); } catch { throw new Error('That isn’t a patch pack: it should be JSON.'); }
  if (!p || !Array.isArray(p.patches) || !p.patches.every((x) => x && typeof x.cmd === 'string')) throw new Error('That isn’t a patch pack: it needs a list of patches, each with a cmd.');
  return { id: String(p.id ?? 'pasted'), name: String(p.name ?? 'Pasted pack'), patches: p.patches };
}
