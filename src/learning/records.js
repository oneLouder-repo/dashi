/**
 * Learner records (eLearning stage 2): what Learn keeps for each person, in
 * its own document `learn`, so the learner's record lives in the plugin the
 * learner uses. Pure functions only.
 *
 *   learn { people: { [staffId]: { enrolments: { [cartridgeId]: Enrolment }, settings } }, version }
 *   Enrolment { at (ISO), start (day 0 for self-paced), version, done: { [blockId]: ISO },
 *               notes: { [blockId]: text }, answers: { [blockId]: {...} }, last: blockId }
 *
 * Statements (xAPI-shaped, kept inside Dashi in this stage) describe what
 * happened in plain words; the learner can see every one of them.
 */
import { pathByWeek, dayOf, blockType, dateOf } from './cartridge.js';

export const blankLearn = () => ({ people: {}, version: 1 });
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export const DEFAULT_SETTINGS = { textSize: 'm', font: 'standard', motion: 'full', captions: true, speed: 1 };
export const personOf = (doc, staffId) => doc.people?.[staffId] ?? { enrolments: {}, settings: { ...DEFAULT_SETTINGS } };
export const settingsOf = (doc, staffId) => ({ ...DEFAULT_SETTINGS, ...(personOf(doc, staffId).settings ?? {}) });

function withPerson(doc, staffId, fn) {
  const x = clone(doc);
  x.people ??= {};
  x.people[staffId] ??= { enrolments: {}, settings: { ...DEFAULT_SETTINGS } };
  fn(x.people[staffId]);
  return x;
}

export const enrol = (doc, staffId, c, at = new Date().toISOString()) => withPerson(doc, staffId, (p) => {
  if (p.enrolments[c.id]) return;
  p.enrolments[c.id] = { at, start: at.slice(0, 10), version: c.version ?? 1, done: {}, notes: {}, answers: {}, last: null, log: [{ at, verb: 'registered', object: c.id }] };
});
export const leave = (doc, staffId, cid) => withPerson(doc, staffId, (p) => { delete p.enrolments[cid]; });

/** Mark a block done (or not). */
export const markDone = (doc, staffId, cid, blockId, done = true, at = new Date().toISOString()) => withPerson(doc, staffId, (p) => {
  const e = p.enrolments[cid];
  if (!e) return;
  if (done) e.done[blockId] = at; else delete e.done[blockId];
  e.last = blockId;
  (e.log ??= []).push({ at, verb: done ? 'completed' : 'reopened', object: blockId });
});
export const saveNote = (doc, staffId, cid, blockId, text) => withPerson(doc, staffId, (p) => { const e = p.enrolments[cid]; if (e) e.notes[blockId] = text; });
export const saveAnswer = (doc, staffId, cid, blockId, answer, at = new Date().toISOString()) => withPerson(doc, staffId, (p) => {
  const e = p.enrolments[cid];
  if (!e) return;
  e.answers[blockId] = answer;
  (e.log ??= []).push({ at, verb: 'answered', object: blockId });
});
export const setLast = (doc, staffId, cid, blockId) => withPerson(doc, staffId, (p) => { const e = p.enrolments[cid]; if (e) e.last = blockId; });
export const saveSettings = (doc, staffId, patch) => withPerson(doc, staffId, (p) => { p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), ...patch }; });

/** The day 0 a learner's run counts from: the cartridge's run, or their own start when self-paced. */
export const startFor = (c, e) => (c.pacing === 'self' && e?.start ? e.start : c.run.start);
/** Today as a course day for this learner. */
export const todayDay = (c, e, today = new Date().toISOString().slice(0, 10)) => dayOf(startFor(c, e), today);

/** Progress through the required blocks. */
export function progress(c, e) {
  const learner = pathByWeek(c).flatMap((w) => w.blocks);
  const req = learner.filter((b) => b.required);
  const done = req.filter((b) => e?.done?.[b.id]).length;
  return { done, of: req.length, all: learner.length, doneAll: learner.filter((b) => e?.done?.[b.id]).length, pct: req.length ? Math.round((done / req.length) * 100) : 0 };
}

/** Is a block open to this learner? Released by its start day, and its `after` blocks done. */
export function isOpen(c, e, b, today) {
  const t = todayDay(c, e, today);
  if (b.start > t && !c.settings?.openEarly) return { open: false, why: `Opens ${dateOf(startFor(c, e), b.start)}` };
  const waiting = (b.after ?? []).filter((id) => c.blocks[id] && !e?.done?.[id]);
  if (waiting.length) return { open: false, why: `After ${waiting.map((id) => c.blocks[id].title).join(', ')}` };
  return { open: true, why: '' };
}

/** What's next: the first open, required, not-done block; else the first open not-done one. */
export function nextBlock(c, e, today) {
  const all = pathByWeek(c).flatMap((w) => w.blocks).filter((b) => !e?.done?.[b.id] && isOpen(c, e, b, today).open);
  return all.find((b) => b.required) ?? all[0] ?? null;
}

/** Things due in the next `days` days (blocks ending soon, not done) and live sessions coming up. */
export function dueSoon(c, e, today, days = 7) {
  const t = todayDay(c, e, today);
  return pathByWeek(c).flatMap((w) => w.blocks)
    .filter((b) => !e?.done?.[b.id])
    .filter((b) => {
      const end = b.start + b.length;
      const live = ['live', 'office', 'whiteboard', 'meetup'].includes(b.type);
      return live ? b.start >= t && b.start <= t + days : b.required && end > t && end <= t + days + 1;
    })
    .map((b) => ({ block: b, day: ['live', 'office', 'whiteboard', 'meetup'].includes(b.type) ? b.start : b.start + b.length - 1, date: dateOf(startFor(c, e), ['live', 'office', 'whiteboard', 'meetup'].includes(b.type) ? b.start : b.start + b.length - 1) }))
    .sort((a, b) => a.day - b.day);
}

/** The learner's record in plain words, newest first: "You completed Lesson: Why grants?" */
export function recordLines(c, e) {
  const verbs = { registered: 'You joined', completed: 'You finished', reopened: 'You reopened', answered: 'You answered' };
  return [...(e?.log ?? [])].reverse().map((l) => ({
    at: l.at, verb: l.verb,
    text: `${verbs[l.verb] ?? l.verb} ${l.object === c.id ? c.title : c.blocks[l.object] ? `${blockType(c.blocks[l.object].type).label.toLowerCase()} “${c.blocks[l.object].title}”` : 'a block that has since been removed'}`,
  }));
}

/**
 * An xAPI statement for a log line, ready for an LRS in a later stage. The
 * actor is a Dashi account id, never an email, so nothing personal leaves
 * without the org setting it up.
 */
export function toStatement(c, staffId, l, base = 'https://dashi.example/xapi') {
  const verbs = { registered: 'http://adlnet.gov/expapi/verbs/registered', completed: 'http://adlnet.gov/expapi/verbs/completed', answered: 'http://adlnet.gov/expapi/verbs/answered', reopened: 'http://id.tincanapi.com/verb/reopened' };
  const b = c.blocks[l.object];
  return {
    actor: { objectType: 'Agent', account: { homePage: base, name: staffId } },
    verb: { id: verbs[l.verb] ?? `${base}/verbs/${l.verb}`, display: { 'en-CA': l.verb } },
    object: { objectType: 'Activity', id: `${base}/cartridges/${c.id}${b ? `/blocks/${b.id}` : ''}`, definition: { name: { 'en-CA': b ? b.title : c.title } } },
    context: { contextActivities: { parent: [{ id: `${base}/cartridges/${c.id}` }] }, extensions: { [`${base}/version`]: c.version ?? 1 } },
    timestamp: l.at,
  };
}
