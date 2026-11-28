/**
 * Mobilize (alpha 0.5, stage 1): knowledge mobilization. The knowledge
 * object holds one thing worth sharing (a finding, a practice, a lesson, a
 * resource, an open question) and the loop around it: who it is for, who
 * carries it, what is made from it, what comes back, and what changes.
 *
 * Its fields follow Lavis's five questions for knowledge transfer (what,
 * to whom, by whom, how, with what effect), plus its evidence, its links
 * to the plan, and consent: whose knowledge it is and how far it may go.
 *
 * The document "mobilize" (Mobilize owns it and writes no other):
 *
 *   {
 *     id: 'mobilize',
 *     objects: { <id>: KnowledgeObject },
 *     settings: { reviewEvery: 90 },      days between reviews, by default
 *   }
 *
 *   KnowledgeObject = {
 *     id, title, kind, message, summary, strength, stage, stream,
 *     audiences:  [{ id, group, who, use }],          to whom, and what they would do with it
 *     messengers: [{ id, name, staffId?, for? }],     by whom (for: audience ids)
 *     outputs:    [{ id, kind, title, status, audienceIds, ref?, note }],   how
 *     effect:     { hoped, signs },                   with what effect, and how we'd know
 *     uptake:     [{ id, at, kind, text, n?, outputId?, by? }],   what came back
 *     reviews:    [{ id, at, by, heard, change, loop, next }],    each look back
 *     evidence:   { sources: [libraryItemId], from, notes },
 *     links:      { plan: [strategyNodeId], related: [objectId] },
 *     consent:    { share, holders, terms, ocap, signedOff },
 *     ownerId, nextReview, tags, createdAt, updatedAt,
 *   }
 *
 * A review's loop is 'single' (change the next output) or 'double'
 * (question the plan itself: it carries a proposed workplan change).
 * Everything here is pure: the page and the tests call the same functions.
 */

export const MOBILIZE_DOC = 'mobilize';

export const KINDS = [
  { id: 'finding', label: 'Finding', icon: 'lightbulb', about: 'Something research or evaluation showed' },
  { id: 'practice', label: 'Practice', icon: 'hand', about: 'A way of working worth spreading' },
  { id: 'lesson', label: 'Lesson learned', icon: 'refresh', about: 'What we would do differently' },
  { id: 'resource', label: 'Resource', icon: 'book', about: 'A tool, guide or curriculum and how it fits' },
  { id: 'question', label: 'Open question', icon: 'question', about: 'Something we are still learning, shared to learn with others' },
];

/** How sure we are. Plain words, so a reader outside research can weigh it. */
export const STRENGTHS = [
  { id: 'emerging', label: 'Emerging', about: 'Early signs, one source or a small group' },
  { id: 'tested', label: 'Tested', about: 'Tried more than once, or checked against other sources' },
  { id: 'established', label: 'Established', about: 'Strong, repeated evidence' },
];

/** The lifecycle (plan → act → observe → reflect, then again). */
export const STAGES = [
  { id: 'draft', label: 'Draft', loop: 'make', about: 'Being shaped: the message, who it is for, the evidence' },
  { id: 'ready', label: 'Ready to share', loop: 'make', about: 'Checked and signed off; outputs can go out' },
  { id: 'out', label: 'Out in the world', loop: 'share', about: 'Outputs are out; listening for what happens' },
  { id: 'reviewed', label: 'Reviewed', loop: 'review', about: 'Looked back on: what we heard and what we change' },
  { id: 'revised', label: 'Revised', loop: 'make', about: 'Changed after a review, ready to go round again' },
  { id: 'retired', label: 'Retired', loop: null, about: 'No longer shared; kept for its history' },
];
export const stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]));

/** The four turns of the loop, as the Loop page draws them. */
export const LOOP = [
  { id: 'make', label: 'Make', step: 'Plan', about: 'Draft the object: the five questions, the hoped-for change' },
  { id: 'share', label: 'Share', step: 'Act', about: 'Outputs reach the people who can use them' },
  { id: 'listen', label: 'Listen', step: 'Observe', about: 'Signals, stories, citations and decisions come back' },
  { id: 'review', label: 'Review', step: 'Reflect', about: 'What changed, for whom, and what we do next' },
];

/** Two lanes: practice outputs run in weeks, academic ones in months with strict formats. */
export const STREAMS = [
  { id: 'practice', label: 'Practice' },
  { id: 'academic', label: 'Academic' },
  { id: 'both', label: 'Practice and academic' },
];

export const AUDIENCES = [
  { id: 'staff', label: 'Our staff and instructors' },
  { id: 'members', label: 'Member organizations' },
  { id: 'educators', label: 'Educators' },
  { id: 'youth', label: 'Youth' },
  { id: 'families', label: 'Families and caregivers' },
  { id: 'communities', label: 'Communities and partners' },
  { id: 'funders', label: 'Funders' },
  { id: 'policy', label: 'Policy makers' },
  { id: 'researchers', label: 'Researchers' },
  { id: 'media', label: 'Media and the public' },
];
export const audienceLabel = (id) => AUDIENCES.find((a) => a.id === id)?.label ?? id;

/**
 * What an object can become, and the plugin that makes it. Mobilize starts
 * the draft; the plugin's own editor finishes it (each plugin uses only its
 * own designer).
 */
export const OUTPUTS = [
  { id: 'brief', label: 'Plain-language brief', plugin: 'pages', alt: 'plandoc', icon: 'fileText', stream: 'practice' },
  { id: 'posts', label: 'Social posts', plugin: 'social', icon: 'news', stream: 'practice' },
  { id: 'episode', label: 'Podcast episode', plugin: 'podcasts', icon: 'mic', stream: 'practice' },
  { id: 'talk', label: 'Conference talk', plugin: 'studio', icon: 'studio', stream: 'academic' },
  { id: 'poster', label: 'Poster', plugin: 'studio', icon: 'tiles', stream: 'academic' },
  { id: 'paper', label: 'Paper or chapter', plugin: 'plandoc', icon: 'notePencil', stream: 'academic' },
  { id: 'module', label: 'Course module', plugin: 'teach', icon: 'graduation', stream: 'practice' },
  { id: 'story', label: 'Story card', plugin: 'assets', icon: 'story', stream: 'practice' },
  { id: 'report', label: 'Funder report section', plugin: 'strategy', icon: 'chart', stream: 'practice' },
  { id: 'session', label: 'Workshop or webinar', plugin: null, icon: 'users', stream: 'practice' },
];
export const outputById = Object.fromEntries(OUTPUTS.map((o) => [o.id, o]));
export const OUTPUT_STATUS = { idea: 'Idea', drafting: 'Drafting', out: 'Out' };

/** What comes back. */
export const UPTAKE = [
  { id: 'count', label: 'Count', icon: 'chart', about: 'Views, plays, replies, completions' },
  { id: 'story', label: 'Story of use', icon: 'quotes', about: '“What did you do differently after this?”' },
  { id: 'citation', label: 'Pickup or citation', icon: 'link', about: 'A talk accepted, a policy that quotes it, a partner that reuses it' },
  { id: 'decision', label: 'Decision', icon: 'check', about: 'A decision that names it' },
];

/**
 * Consent first: whose knowledge this is and how far it may go. Community
 * and Indigenous knowledge follows its holders' terms (OCAP: ownership,
 * control, access, possession); `held` keeps it with the holders only.
 */
export const SHARES = {
  open: { label: 'Open', icon: 'globe', about: 'Anyone: public outputs are fine' },
  partners: { label: 'Partners', icon: 'handshake', about: 'Named partners and members only' },
  internal: { label: 'Internal', icon: 'lock', about: 'Our own staff only' },
  held: { label: 'Held by its holders', icon: 'shield', about: 'Shared only as and when the holders decide' },
};

export const blankMobilize = () => ({ id: MOBILIZE_DOC, objects: {}, settings: { reviewEvery: 90 } });

let seq = 0;
export const mid = (prefix) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function blankObject(data = {}) {
  const at = new Date().toISOString();
  return migrateObject({ id: mid('ko'), title: '', kind: 'finding', message: '', summary: '', strength: 'emerging', stage: 'draft', stream: 'practice', createdAt: at, updatedAt: at, ...data });
}

const list = (v) => (Array.isArray(v) ? v : []);

export function migrateObject(o) {
  const ob = { ...(o ?? {}) };
  ob.title ??= '';
  ob.kind = KINDS.some((k) => k.id === ob.kind) ? ob.kind : 'finding';
  ob.message ??= '';
  ob.summary ??= '';
  ob.strength = STRENGTHS.some((s) => s.id === ob.strength) ? ob.strength : 'emerging';
  ob.stage = stageById[ob.stage] ? ob.stage : 'draft';
  ob.stream = STREAMS.some((s) => s.id === ob.stream) ? ob.stream : 'practice';
  for (const k of ['audiences', 'messengers', 'outputs', 'uptake', 'reviews', 'tags']) ob[k] = list(ob[k]);
  ob.effect = { hoped: '', signs: '', ...(ob.effect ?? {}) };
  ob.evidence = { from: '', notes: '', ...(ob.evidence ?? {}) };
  ob.evidence.sources = list(ob.evidence.sources);
  ob.links = { ...(ob.links ?? {}) };
  ob.links.plan = list(ob.links.plan);
  ob.links.related = list(ob.links.related);
  ob.consent = { share: 'internal', holders: '', terms: '', ocap: false, signedOff: null, ...(ob.consent ?? {}) };
  if (!SHARES[ob.consent.share]) ob.consent.share = 'internal';
  ob.ownerId ??= null;
  ob.nextReview ??= null;
  return ob;
}

export function migrateMobilize(d) {
  const doc = { ...blankMobilize(), ...(d ?? {}) };
  if (!doc.objects || typeof doc.objects !== 'object') doc.objects = {};
  doc.settings = { reviewEvery: 90, ...(doc.settings ?? {}) };
  for (const [id, o] of Object.entries(doc.objects)) doc.objects[id] = migrateObject({ ...o, id });
  return doc;
}

/* ---------------------------------------------------------------- readiness */

/**
 * The readiness check: Lavis's five questions, then consent and a review
 * date. An object is ready to share when every check passes. Each check
 * says plainly what is missing.
 */
export function readiness(o) {
  const checks = [
    { id: 'what', q: 'What?', label: 'A message in plain words', ok: o.message.trim().length >= 20, hint: 'Write the finding in one plain sentence someone outside the team would understand.' },
    { id: 'whom', q: 'To whom?', label: 'At least one audience, with what they would do', ok: o.audiences.some((a) => a.group && (a.use ?? '').trim()), hint: 'Name who needs this, and what they could do with it.' },
    { id: 'by', q: 'By whom?', label: 'A messenger each audience trusts', ok: o.messengers.length > 0, hint: 'Name who should carry it. Often not the person who did the work.' },
    { id: 'how', q: 'How?', label: 'At least one output planned', ok: o.outputs.length > 0, hint: 'Pick the routes: a brief, an episode, a module, a talk…' },
    { id: 'effect', q: 'With what effect?', label: 'The change hoped for, and how we’d know', ok: !!(o.effect.hoped.trim() && o.effect.signs.trim()), hint: 'Say what should change, and the lightest way to notice it.' },
    { id: 'evidence', q: 'Evidence', label: 'Where it comes from', ok: o.evidence.sources.length > 0 || o.evidence.from.trim().length > 0, hint: 'Link a library source, or say which project or practice it came from.' },
    { id: 'consent', q: 'Consent', label: o.consent.share === 'held' || o.consent.ocap ? 'Holders have signed off' : 'Sharing level set', ok: (o.consent.share === 'held' || o.consent.ocap) ? !!o.consent.signedOff : !!o.consent.share, hint: 'Community knowledge is shared on its holders’ terms: record who agreed, and when.' },
    { id: 'review', q: 'Review', label: 'An owner and a review date', ok: !!(o.ownerId && o.nextReview), hint: 'Someone keeps it current and looks back on a date.' },
  ];
  return { checks, ready: checks.every((c) => c.ok), done: checks.filter((c) => c.ok).length };
}

/* ---------------------------------------------------------------- lifecycle */

const addDays = (iso, days) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Where an object may go next. Ready needs the readiness check; held knowledge never skips sign-off. */
export function nextStages(o) {
  const ok = readiness(o).ready;
  switch (o.stage) {
    case 'draft': return ok ? ['ready'] : [];
    case 'ready': return ['out', 'draft'];
    case 'out': return ['retired'];
    case 'reviewed': return ['revised', 'out', 'retired'];
    case 'revised': return ok ? ['ready', 'out'] : ['draft'];
    case 'retired': return ['draft'];
    default: return [];
  }
}

/** Move an object to a stage, if that move is allowed. Returns a new object. */
export function moveTo(o, stage, at = new Date().toISOString()) {
  if (!nextStages(o).includes(stage)) throw new Error(`An object can't go from ${o.stage} to ${stage}`);
  return { ...o, stage, updatedAt: at };
}

/**
 * A review: what we heard, what we change, and which loop. A double-loop
 * review carries a proposed change to the plan (`planChange`), so the
 * workplan learns from the work. Sets the next review date.
 */
export function addReview(o, { heard, change, loop = 'single', planChange = '', by = null, at = new Date().toISOString(), every = 90 }) {
  const next = addDays(at, every);
  const review = { id: mid('rv'), at, by, heard: heard ?? '', change: change ?? '', loop: loop === 'double' ? 'double' : 'single', planChange: loop === 'double' ? planChange : '', next };
  return { ...o, reviews: [...o.reviews, review], stage: o.stage === 'retired' ? 'retired' : 'reviewed', nextReview: next, updatedAt: at };
}

export function addUptake(o, { kind = 'story', text = '', n = null, outputId = null, by = null, at = new Date().toISOString() }) {
  const u = { id: mid('up'), at, kind: UPTAKE.some((k) => k.id === kind) ? kind : 'story', text, n: Number.isFinite(n) ? n : null, outputId, by };
  return { ...o, uptake: [...o.uptake, u], updatedAt: at };
}

/* ---------------------------------------------------------------- signals */

/** Reviews that are due on or before a day (YYYY-MM-DD), oldest first. */
export function dueReviews(doc, today = new Date().toISOString().slice(0, 10)) {
  return Object.values(doc.objects)
    .filter((o) => o.stage !== 'retired' && o.nextReview && o.nextReview <= today)
    .sort((a, b) => a.nextReview.localeCompare(b.nextReview));
}

/**
 * An object's signal, as a workplan item would show it: 'heard' (something
 * came back in the last 90 days), 'quiet' (out, but nothing back yet),
 * 'look' (a review is overdue), or null (not out yet).
 */
export function signalOf(o, today = new Date().toISOString().slice(0, 10)) {
  if (o.stage === 'retired' || o.stage === 'draft' || o.stage === 'ready') return null;
  if (o.nextReview && o.nextReview < today) return 'look';
  const recent = addDays(today, -90);
  if (o.uptake.some((u) => (u.at ?? '').slice(0, 10) >= recent)) return 'heard';
  return 'quiet';
}
export const SIGNALS = {
  heard: { label: 'Heard back', icon: 'chats', tone: 'ok' },
  quiet: { label: 'Quiet', icon: 'clock', tone: 'muted' },
  look: { label: 'Needs a look', icon: 'warn', tone: 'warn' },
};

/** Double-loop findings: reviews that propose changing the plan, newest first. */
export function planProposals(doc) {
  return Object.values(doc.objects)
    .flatMap((o) => o.reviews.filter((r) => r.loop === 'double' && r.planChange).map((r) => ({ object: o, review: r })))
    .sort((a, b) => b.review.at.localeCompare(a.review.at));
}

/** Objects linked to a plan node (or anything under it, when `under` gives the node ids beneath). */
export function objectsForPlan(doc, nodeId, under = []) {
  const ids = new Set([nodeId, ...under]);
  return Object.values(doc.objects).filter((o) => o.links.plan.some((p) => ids.has(p)));
}

/** Counts for the side nav and the dashboard card. */
export function tally(doc, today) {
  const all = Object.values(doc.objects);
  return {
    objects: all.length,
    out: all.filter((o) => o.stage === 'out' || o.stage === 'reviewed').length,
    due: dueReviews(doc, today).length,
    outputs: all.reduce((n, o) => n + o.outputs.length, 0),
    uptake: all.reduce((n, o) => n + o.uptake.length, 0),
  };
}

/** Knowledge objects as cards for the asset library (live, never copied). */
export function assetCards(doc) {
  return Object.values(doc?.objects ?? {}).filter((o) => o.consent.share !== 'held').map((o) => ({
    ref: { type: 'knowledge', id: o.id },
    card: {
      source: 'knowledge', title: o.title || 'Untitled knowledge object', description: o.message,
      kindLabel: 'Knowledge object', icon: 'lightbulb', sub: `${KINDS.find((k) => k.id === o.kind)?.label ?? ''} · ${stageById[o.stage]?.label ?? ''}`,
      updatedAt: o.updatedAt, by: o.ownerId, abcd: 'cultural', tagsFrom: o.tags,
      sensitivity: o.consent.share === 'open' ? 'public' : 'internal', text: o.summary || null,
    },
  }));
}
