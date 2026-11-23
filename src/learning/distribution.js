/**
 * Sharing courses out, and each learner's own shelf (eLearning, alpha 0.4).
 * Pure functions only.
 *
 * Teach keeps who a cartridge is shared with, in its own document:
 *   teach.offers { [id]: Offer }
 *   Offer { id, cid, to: { kind: 'everyone' | 'team' | 'role' | 'person', id }, mode: 'assigned' | 'offered',
 *           due: ISO date | null, note, by, at }
 *   An *assigned* course goes on the learner's list and has a date to finish by.
 *   An *offered* one is suggested to them in the catalogue, to join if they like.
 *
 * Learn keeps how each learner arranges their own list, in its document:
 *   learn.people[staffId].shelf { [cid]: { pinned, hidden } }
 */
import { progress } from './records.js';
import { ROLES } from '../platform/org.js';

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const rid = () => `off_${Math.random().toString(36).slice(2, 9)}`;
const people = (org) => Object.values(org?.staff ?? {});

export const AUDIENCES = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'team', label: 'A team' },
  { id: 'role', label: 'A role' },
  { id: 'person', label: 'One person' },
];
export const MODES = [
  { id: 'assigned', label: 'Assign', blurb: 'On their list, with a date to finish by' },
  { id: 'offered', label: 'Offer', blurb: 'Suggested in their catalogue, to join if they like' },
];

/** The staff ids an offer reaches. */
export function audienceOf(org, to) {
  // Guests and viewers read along; courses go to the people who work here.
  const all = people(org).filter((s) => to.kind === 'person' || !['guest', 'viewer'].includes(s.roleId));
  if (to.kind === 'everyone') return all.map((s) => s.id);
  if (to.kind === 'team') return all.filter((s) => (s.teamIds ?? []).includes(to.id)).map((s) => s.id);
  if (to.kind === 'role') return all.filter((s) => s.roleId === to.id).map((s) => s.id);
  return org?.staff?.[to.id] ? [to.id] : [];
}
export function audienceLabel(org, to) {
  if (to.kind === 'everyone') return 'Everyone on staff';
  if (to.kind === 'team') return org?.teams?.[to.id]?.name ?? 'A team that has gone';
  if (to.kind === 'role') { const r = ROLES.find((x) => x.id === to.id); return r ? `Every ${r.label.toLowerCase()}` : 'A role'; }
  return org?.staff?.[to.id]?.name ?? 'Someone who has left';
}

export function addOffer(teach, { cid, to, mode = 'assigned', due = null, note = '', by = null, at = new Date().toISOString(), id = rid() }) {
  const x = clone(teach);
  x.offers ??= {};
  x.offers[id] = { id, cid, to, mode, due: mode === 'assigned' ? due : null, note, by, at };
  return x;
}
export function removeOffer(teach, id) {
  const x = clone(teach);
  if (x.offers) delete x.offers[id];
  return x;
}
export const offersOf = (teach, cid) => Object.values(teach.offers ?? {}).filter((o) => o.cid === cid).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));

/**
 * What's been shared with one person, one entry per cartridge: assigned wins
 * over offered, and the earliest date to finish by wins.
 */
export function sharedWith(teach, org, staffId) {
  const out = {};
  for (const o of Object.values(teach.offers ?? {})) {
    const c = teach.cartridges?.[o.cid];
    if (!c || c.status !== 'published' || !audienceOf(org, o.to).includes(staffId)) continue;
    const cur = out[o.cid];
    if (!cur) { out[o.cid] = { cid: o.cid, assigned: o.mode === 'assigned', due: o.due ?? null, by: o.by, note: o.note, offers: [o.id] }; continue; }
    cur.offers.push(o.id);
    if (o.mode === 'assigned') {
      cur.assigned = true;
      if (o.due && (!cur.due || o.due < cur.due)) cur.due = o.due;
    }
  }
  return out;
}

/** Where a learner is in a course: not-joined, not-started, in-progress or finished. */
export function statusOf(c, e) {
  if (!e) return 'not-joined';
  const p = progress(c, e);
  if (p.of && p.done >= p.of) return 'finished';
  return Object.keys(e.done ?? {}).length ? 'in-progress' : 'not-started';
}
export const STATUS_LABEL = { 'not-joined': 'Not joined', 'not-started': 'Not started', 'in-progress': 'In progress', finished: 'Finished' };
const lastAt = (e) => (e?.log ?? []).reduce((m, l) => (l.at > m ? l.at : m), e?.at ?? '');

/* ------------------------------------------------------------- the shelf */

export const shelfPrefs = (learn, staffId) => learn.people?.[staffId]?.shelf ?? {};
export function setShelf(learn, staffId, cid, patch) {
  const x = clone(learn);
  x.people ??= {};
  x.people[staffId] ??= { enrolments: {}, settings: {} };
  const s = (x.people[staffId].shelf ??= {});
  s[cid] = { ...(s[cid] ?? {}), ...patch };
  return x;
}

/**
 * Every course on one learner's list: the ones they've joined, and the ones
 * assigned to them that they haven't started yet.
 */
export function shelfFor(teach, learn, org, staffId, today) {
  const enr = learn.people?.[staffId]?.enrolments ?? {};
  const shared = sharedWith(teach, org, staffId);
  const prefs = shelfPrefs(learn, staffId);
  const ids = new Set([...Object.keys(enr), ...Object.values(shared).filter((s) => s.assigned).map((s) => s.cid)]);
  return [...ids].map((cid) => {
    const c = teach.cartridges?.[cid];
    if (!c) return null;
    const e = enr[cid] ?? null;
    const s = shared[cid];
    const status = statusOf(c, e);
    const due = s?.assigned ? s.due : null;
    return { c, e, status, pct: progress(c, e).pct, p: progress(c, e), assigned: !!s?.assigned, due, overdue: !!due && due < today && status !== 'finished', last: lastAt(e), pinned: !!prefs[cid]?.pinned, hidden: !!prefs[cid]?.hidden };
  }).filter(Boolean);
}
/** Courses offered to a learner that they haven't joined. */
export const suggestedFor = (teach, learn, org, staffId) => Object.values(sharedWith(teach, org, staffId))
  .filter((s) => !s.assigned && !learn.people?.[staffId]?.enrolments?.[s.cid])
  .map((s) => ({ ...s, c: teach.cartridges[s.cid] }));

export const SHELF_FILTERS = [
  { id: 'all', label: 'All', test: (x) => !x.hidden },
  { id: 'assigned', label: 'Assigned to me', test: (x) => !x.hidden && x.assigned },
  { id: 'progress', label: 'In progress', test: (x) => !x.hidden && x.status === 'in-progress' },
  { id: 'todo', label: 'Not started', test: (x) => !x.hidden && (x.status === 'not-started' || x.status === 'not-joined') },
  { id: 'done', label: 'Finished', test: (x) => !x.hidden && x.status === 'finished' },
  { id: 'hidden', label: 'Hidden', test: (x) => x.hidden },
];
export const SHELF_SORTS = [
  { id: 'due', label: 'Due first' },
  { id: 'recent', label: 'Recently opened' },
  { id: 'progress', label: 'Most done' },
  { id: 'title', label: 'A to Z' },
];
/** Pinned first, then by the chosen order. */
export function sortShelf(list, by = 'due') {
  const cmp = {
    due: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (b.last ?? '').localeCompare(a.last ?? ''),
    recent: (a, b) => (b.last ?? '').localeCompare(a.last ?? ''),
    progress: (a, b) => b.pct - a.pct,
    title: (a, b) => a.c.title.localeCompare(b.c.title),
  }[by] ?? (() => 0);
  return [...list].sort((a, b) => (b.pinned - a.pinned) || cmp(a, b) || a.c.title.localeCompare(b.c.title));
}

/* ----------------------------------------------------------- the roster */

/**
 * Everyone a course reaches, or who joined it: what was shared with them,
 * and where they are. For Teach's Learners view.
 */
export function rosterFor(teach, learn, org, cid, today) {
  const c = teach.cartridges?.[cid];
  if (!c) return [];
  const ids = new Set();
  for (const o of offersOf(teach, cid)) for (const id of audienceOf(org, o.to)) ids.add(id);
  for (const [sid, p] of Object.entries(learn.people ?? {})) if (p.enrolments?.[cid]) ids.add(sid);
  return [...ids].filter((id) => org?.staff?.[id]).map((id) => {
    const e = learn.people?.[id]?.enrolments?.[cid] ?? null;
    const s = sharedWith(teach, org, id)[cid];
    const status = statusOf(c, e);
    const due = s?.assigned ? s.due : null;
    return { staff: org.staff[id], e, status, pct: progress(c, e).pct, assigned: !!s?.assigned, offered: !!s && !s.assigned, chose: !s, due, overdue: !!due && due < today && status !== 'finished', last: lastAt(e) };
  }).sort((a, b) => (b.overdue - a.overdue) || a.staff.name.localeCompare(b.staff.name));
}

/** Counts for a course: reached, joined, in progress, finished, overdue. */
export function courseSummary(teach, learn, org, cid, today) {
  const r = rosterFor(teach, learn, org, cid, today);
  const k = (f) => r.filter(f).length;
  const dues = offersOf(teach, cid).map((o) => o.due).filter((d) => d && d >= today).sort();
  return { reached: r.length, joined: k((x) => x.e), progress: k((x) => x.status === 'in-progress'), finished: k((x) => x.status === 'finished'), notJoined: k((x) => !x.e), overdue: k((x) => x.overdue), assigned: k((x) => x.assigned), nextDue: dues[0] ?? null, offers: offersOf(teach, cid).length };
}
