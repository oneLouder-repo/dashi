/**
 * The cartridge (eLearning stage 1): Dashi's one unit of learning, shared by
 * Teach (the editor) and Learn (the learner's space). A course, a workshop or
 * a professional development block, laid out like a song in a DAW: tracks of
 * blocks on a timeline of course days. Pure functions only (no DOM), so the
 * tests and the server can use them.
 *
 * Times are days relative to day 0 (the start), so a cartridge can run again
 * next term or for another cohort: a run pins day 0 to a real date.
 *
 *   Cartridge { id, title, subtitle, summary, cover, kind, pacing, licence, visibility,
 *               span: { pre, length, post }, run: { start, tz }, hoursPerWeek,
 *               tracks: [{ id, name, kind, tone, muted }], blocks: { [id]: Block },
 *               pace: [{ id, day, text, to, send }], competencies: [{ id, name, framework, level }],
 *               credential: { name, rule }, status, version, publishedAt, updatedAt, by }
 *   Block     { id, trackId, type, title, start, length, at, minutes, required, after: [ids],
 *               body, ref: { plugin, type, id } | null, settings, alts: [kinds], competencies: [ids] }
 *
 * A block points at other plugins' things by `ref` (a podcast episode, an
 * asset, a Collab board) and never copies them.
 */
import { WHEEL } from '../ui/wheel.js';

export const FORMAT = 'dashi.cartridge';
export const FORMAT_VERSION = 1;

const hex = (id) => WHEEL.find((w) => w.id === id)?.hex ?? '#888888';
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const edit = (c, fn) => { const x = clone(c); fn(x); x.updatedAt = new Date().toISOString(); return x; };
const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/** The kinds of track, each with its colour from the wheel. */
export const TRACK_KINDS = [
  { id: 'content', label: 'Learning content', tone: hex('teal'), icon: 'book' },
  { id: 'live', label: 'Live sessions', tone: hex('violet'), icon: 'video' },
  { id: 'assess', label: 'Practice and assessment', tone: hex('orange'), icon: 'checklist' },
  { id: 'support', label: 'Dialogue and care', tone: hex('green'), icon: 'chats' },
  { id: 'comms', label: 'Comms and pace', tone: hex('blue'), icon: 'mail' },
  { id: 'custom', label: 'Other', tone: hex('orchid'), icon: 'tiles' },
];
export const trackKind = (id) => TRACK_KINDS.find((k) => k.id === id) ?? TRACK_KINDS.at(-1);

/**
 * The block types. `track` is the kind of track a new one goes on, `minutes`
 * a learner's effort by default, `modes` how it carries content (for the UDL
 * check: text, audio, visual, live, hands-on), `presence` which part of a
 * community of inquiry it gives (teaching, social, reflective), `assessed`
 * whether it asks learners to show what they know.
 */
export const BLOCK_TYPES = [
  { id: 'lesson', label: 'Lesson', group: 'Content', icon: 'story', track: 'content', minutes: 15, length: 3, modes: ['text', 'visual'], presence: ['teaching'], blurb: 'A short text with an image or two: story-card sized.' },
  { id: 'slideshow', label: 'Slideshow podcast', group: 'Content', icon: 'tiles', track: 'content', minutes: 5, length: 3, modes: ['audio', 'visual'], presence: ['teaching'], media: true, blurb: 'A podcast with slides, from the Studio.' },
  { id: 'podcast', label: 'Podcast', group: 'Content', icon: 'mic', track: 'content', minutes: 20, length: 3, modes: ['audio'], presence: ['teaching'], media: true, blurb: 'An episode from your station.' },
  { id: 'video', label: 'Video', group: 'Content', icon: 'video', track: 'content', minutes: 10, length: 3, modes: ['visual', 'audio'], presence: ['teaching'], media: true, blurb: 'A video, with captions.' },
  { id: 'reading', label: 'Reading', group: 'Content', icon: 'books', track: 'content', minutes: 30, length: 5, modes: ['text'], presence: ['teaching'], blurb: 'A document or article to read.' },
  { id: 'resource', label: 'Resource', group: 'Content', icon: 'paperclip', track: 'content', minutes: 10, length: 7, modes: ['hands-on'], presence: [], blurb: 'Any asset: a map, a dataset, a template.' },
  { id: 'live', label: 'Live session', group: 'Live', icon: 'video', track: 'live', minutes: 60, length: 1, modes: ['live', 'audio', 'visual'], presence: ['teaching', 'social'], blurb: 'A Zoom or Meet session at a set time.' },
  { id: 'office', label: 'Office hours', group: 'Live', icon: 'clock', track: 'live', minutes: 0, length: 1, modes: ['live'], presence: ['teaching', 'social'], blurb: 'Drop-in time with the teacher.' },
  { id: 'whiteboard', label: 'Whiteboard session', group: 'Live', icon: 'brush', track: 'live', minutes: 45, length: 1, modes: ['live', 'visual', 'hands-on'], presence: ['social'], blurb: 'A shared board in Collab (coming soon).' },
  { id: 'meetup', label: 'Cohort meet-up', group: 'Live', icon: 'users', track: 'live', minutes: 60, length: 1, modes: ['live'], presence: ['social'], blurb: 'Learners meet each other.' },
  { id: 'quiz', label: 'Quiz', group: 'Practice and assessment', icon: 'checklist', track: 'assess', minutes: 10, length: 4, modes: ['hands-on'], presence: ['reflective'], blurb: 'A short self-check, as often as you like.' },
  { id: 'exam', label: 'Exam', group: 'Practice and assessment', icon: 'seal', track: 'assess', minutes: 60, length: 3, modes: ['hands-on'], presence: [], assessed: true, blurb: 'A marked test.' },
  { id: 'assignment', label: 'Assignment', group: 'Practice and assessment', icon: 'notePencil', track: 'assess', minutes: 120, length: 7, modes: ['hands-on'], presence: ['reflective'], assessed: true, blurb: 'Hand in a Dashi doc or a file.' },
  { id: 'peer', label: 'Peer review', group: 'Practice and assessment', icon: 'handshake', track: 'assess', minutes: 45, length: 5, modes: ['hands-on'], presence: ['social', 'reflective'], assessed: true, blurb: 'Learners give each other feedback.' },
  { id: 'milestone', label: 'Project milestone', group: 'Practice and assessment', icon: 'flag', track: 'assess', minutes: 0, length: 1, modes: [], presence: [], assessed: true, blurb: 'A point a project should reach.' },
  { id: 'discussion', label: 'Discussion', group: 'Dialogue and care', icon: 'chats', track: 'support', minutes: 20, length: 7, modes: ['text'], presence: ['social'], blurb: 'A question for the group.' },
  { id: 'reflection', label: 'Reflection', group: 'Dialogue and care', icon: 'lightbulb', track: 'support', minutes: 15, length: 3, modes: ['text'], presence: ['reflective'], blurb: 'A prompt for the learner’s own journal.' },
  { id: 'checkin', label: 'Check-in', group: 'Dialogue and care', icon: 'heart', track: 'support', minutes: 2, length: 2, modes: [], presence: ['social', 'reflective'], blurb: 'How are you doing? Asked kindly.' },
  { id: 'feedback', label: 'Feedback', group: 'Dialogue and care', icon: 'quotes', track: 'support', minutes: 10, length: 5, modes: ['text'], presence: ['teaching'], feedback: true, blurb: 'Teacher to learner, and learner to teacher.' },
  { id: 'announce', label: 'Announcement', group: 'Comms', icon: 'news', track: 'comms', minutes: 2, length: 1, modes: ['text'], presence: ['teaching'], blurb: 'A note to everyone.' },
  { id: 'email', label: 'Pace email', group: 'Comms', icon: 'mail', track: 'comms', minutes: 0, length: 1, modes: ['text'], presence: ['teaching'], blurb: 'Sent automatically on its day.' },
  { id: 'release', label: 'Release', group: 'Comms', icon: 'unlock', track: 'comms', minutes: 0, length: 1, modes: [], presence: [], blurb: 'New lessons open (“week 3 opens”).' },
];
export const blockType = (id) => BLOCK_TYPES.find((t) => t.id === id) ?? BLOCK_TYPES[0];
export const BLOCK_GROUPS = [...new Set(BLOCK_TYPES.map((t) => t.group))];

export const KINDS = [
  { id: 'course', label: 'Course' },
  { id: 'workshop', label: 'Workshop' },
  { id: 'pd', label: 'Professional development' },
  { id: 'self', label: 'Self-paced module' },
  { id: 'open', label: 'Open offering' },
];
export const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label ?? 'Course';

/** The four phases of a run, as day ranges: pre-start, in session, post-end, archive (after). */
export function phases(c) {
  const { pre = 7, length = 28, post = 7 } = c.span ?? {};
  return [
    { id: 'pre', label: 'Pre-start', from: -pre, to: 0 },
    { id: 'session', label: 'In session', from: 0, to: length },
    { id: 'post', label: 'Post-end', from: length, to: length + post },
  ];
}
export const phaseOf = (c, day) => (day < 0 ? 'pre' : day < (c.span?.length ?? 28) ? 'session' : day < (c.span?.length ?? 28) + (c.span?.post ?? 7) ? 'post' : 'archive');

/* ---------------------------------------------------------------- dates */

const DAY = 864e5;
/** The ISO date of a course day for a run start (day 0 = start). */
export const dateOf = (start, day) => new Date(Date.parse(`${start}T12:00:00Z`) + Math.round(day) * DAY).toISOString().slice(0, 10);
/** The course day of an ISO date. */
export const dayOf = (start, iso) => Math.round((Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
/** Week number of a course day: week 1 is days 0 to 6; pre-start days are week 0 ("Before"). */
export const weekOf = (day) => (day < 0 ? 0 : Math.floor(day / 7) + 1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Jan 11" from an ISO date, without time zone surprises. */
export const shortDate = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
export const weekLabel = (w) => (w === 0 ? 'Before we start' : `Week ${w}`);

/* -------------------------------------------------------------- creating */

const TEMPLATE_TRACKS = ['content', 'live', 'assess', 'support', 'comms'];
export const makeTrack = (kind = 'custom', name = null) => ({ id: rid('trk'), name: name ?? trackKind(kind).label, kind, tone: trackKind(kind).tone, muted: false });

export function blankCartridge({ title = 'New cartridge', start = null, kind = 'course', by = null, weeks = 4 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    format: FORMAT, formatVersion: FORMAT_VERSION,
    id: rid('crt'), title, subtitle: '', summary: '', cover: null, kind, pacing: kind === 'self' ? 'self' : 'cohort',
    licence: 'CC BY 4.0', visibility: 'org',
    span: { pre: 7, length: weeks * 7, post: 7 }, run: { start: start ?? dateOf(today, 14), tz: 'America/Halifax' },
    hoursPerWeek: 3,
    tracks: TEMPLATE_TRACKS.map((k) => makeTrack(k)),
    blocks: {}, pace: [], competencies: [], credential: { name: '', rule: 'required-done' },
    status: 'draft', version: 0, publishedAt: null, updatedAt: new Date().toISOString(), by,
  };
}
export const blankTeach = () => ({ cartridges: {}, offers: {}, version: 1 });

/* ---------------------------------------------------------------- tracks */

export const addTrack = (c, kind = 'custom', name = null) => edit(c, (x) => { x.tracks.push(makeTrack(kind, name)); });
export const updateTrack = (c, id, patch) => edit(c, (x) => { const t = x.tracks.find((y) => y.id === id); if (t) Object.assign(t, patch); });
export function removeTrack(c, id) {
  return edit(c, (x) => {
    x.tracks = x.tracks.filter((t) => t.id !== id);
    for (const b of Object.values(x.blocks)) if (b.trackId === id) delete x.blocks[b.id];
  });
}
export function moveTrack(c, id, by) {
  return edit(c, (x) => {
    const i = x.tracks.findIndex((t) => t.id === id);
    const j = Math.max(0, Math.min(x.tracks.length - 1, i + by));
    if (i < 0 || i === j) return;
    const [t] = x.tracks.splice(i, 1);
    x.tracks.splice(j, 0, t);
  });
}

/* ---------------------------------------------------------------- blocks */

/** A track for a block type: the first of its kind, else the first track. */
export const trackFor = (c, type) => c.tracks.find((t) => t.kind === blockType(type).track) ?? c.tracks[0] ?? null;

/** Add a block; returns { cartridge, id }. */
export function addBlock(c, { type = 'lesson', trackId = null, start = 0, ...patch } = {}) {
  const t = blockType(type);
  const id = patch.id ?? rid('blk');
  const track = trackId ?? trackFor(c, type)?.id ?? null;
  const cartridge = edit(c, (x) => {
    x.blocks[id] = {
      id, trackId: track, type, title: t.label, start: clampDay(x, start), length: t.length, at: null,
      minutes: t.minutes, required: !['office', 'resource', 'announce', 'email', 'release', 'checkin'].includes(type),
      after: [], body: '', ref: null, settings: {}, alts: [], competencies: [], ...patch, id,
    };
  });
  return { cartridge, id };
}
const clampDay = (c, d) => clampInt(d, -(c.span?.pre ?? 7), (c.span?.length ?? 28) + (c.span?.post ?? 7) - 1);
export const updateBlock = (c, id, patch) => edit(c, (x) => { if (x.blocks[id]) Object.assign(x.blocks[id], patch); });
export const removeBlock = (c, id) => edit(c, (x) => {
  delete x.blocks[id];
  for (const b of Object.values(x.blocks)) b.after = (b.after ?? []).filter((a) => a !== id);
});
/** Move a block to a day (and a track). */
export const moveBlock = (c, id, { start, trackId }) => edit(c, (x) => {
  const b = x.blocks[id];
  if (!b) return;
  if (start != null) b.start = clampDay(x, start);
  if (trackId && x.tracks.some((t) => t.id === trackId)) b.trackId = trackId;
});
/** Stretch a block by its left or right edge to a day. A block is at least 1 day long. */
export function resizeBlock(c, id, edge, day) {
  return edit(c, (x) => {
    const b = x.blocks[id];
    if (!b) return;
    const end = b.start + b.length;
    if (edge === 'left') { const s = Math.min(clampDay(x, day), end - 1); b.length = end - s; b.start = s; }
    else b.length = Math.max(1, clampDay(x, day) + 1 - b.start);
  });
}
export function duplicateBlock(c, id) {
  const b = c.blocks[id];
  if (!b) return { cartridge: c, id: null };
  return addBlock(c, { ...clone(b), id: undefined, start: b.start + 7, title: b.title });
}
export const blocksOn = (c, trackId) => Object.values(c.blocks).filter((b) => b.trackId === trackId).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
export const blockEnd = (b) => b.start + b.length;

/* ----------------------------------------------------------------- pace */

export const addPace = (c, day, text = 'A note for this day', to = 'learners') => edit(c, (x) => { x.pace = [...(x.pace ?? []), { id: rid('pace'), day: clampDay(x, day), text, to, send: 'none' }].sort((a, b) => a.day - b.day); });
export const updatePace = (c, id, patch) => edit(c, (x) => { x.pace = x.pace.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort((a, b) => a.day - b.day); });
export const removePace = (c, id) => edit(c, (x) => { x.pace = x.pace.filter((p) => p.id !== id); });

/* ------------------------------------------------------------- reading */

/** Learner effort in minutes per week (week 0 = pre-start), counting a block in the week it starts. */
export function weekLoad(c) {
  const weeks = Math.ceil((c.span?.length ?? 28) / 7) + Math.ceil((c.span?.post ?? 0) / 7);
  const out = Array.from({ length: weeks + 1 }, (_, w) => ({ week: w, minutes: 0, blocks: 0 }));
  for (const b of Object.values(c.blocks)) {
    if (c.tracks.find((t) => t.id === b.trackId)?.muted) continue;
    const w = Math.min(weekOf(b.start), weeks);
    out[w].minutes += Number(b.minutes) || 0;
    out[w].blocks += 1;
  }
  return out;
}

/**
 * The cartridge as a learner sees it: weeks in order, each with its blocks
 * by start day (muted tracks and teacher-only blocks left out).
 */
export function pathByWeek(c, { teacher = false } = {}) {
  const muted = new Set(c.tracks.filter((t) => t.muted).map((t) => t.id));
  const order = new Map(c.tracks.map((t, i) => [t.id, i]));
  const blocks = Object.values(c.blocks)
    .filter((b) => teacher || (!muted.has(b.trackId) && b.settings?.visibility !== 'teachers'))
    .sort((a, b) => a.start - b.start || (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.title.localeCompare(b.title));
  const weeks = new Map();
  for (const b of blocks) {
    const w = weekOf(b.start);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(b);
  }
  return [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([week, list]) => ({
    week, label: weekLabel(week),
    from: week === 0 ? -(c.span?.pre ?? 7) : (week - 1) * 7, to: week === 0 ? 0 : week * 7,
    blocks: list,
  }));
}

export function cartridgeStats(c) {
  const blocks = Object.values(c.blocks);
  return {
    blocks: blocks.length,
    weeks: Math.ceil((c.span?.length ?? 28) / 7),
    hours: Math.round(blocks.reduce((n, b) => n + (Number(b.minutes) || 0), 0) / 6) / 10,
    live: blocks.filter((b) => ['live', 'office', 'whiteboard', 'meetup'].includes(b.type)).length,
    assessed: blocks.filter((b) => blockType(b.type).assessed).length,
  };
}

/** Publish: a new version learners can play. */
export const publish = (c, by = null) => edit(c, (x) => { x.status = 'published'; x.version = (x.version ?? 0) + 1; x.publishedAt = new Date().toISOString(); x.publishedBy = by; });
export const unpublish = (c) => edit(c, (x) => { x.status = 'draft'; });
export const updateCartridge = (c, patch) => edit(c, (x) => Object.assign(x, patch));

/** The cartridge in Dashi's own lossless format, ready to save as a .json file. */
export const exportCartridge = (c) => JSON.stringify({ ...clone(c), format: FORMAT, formatVersion: FORMAT_VERSION }, null, 2);
/** Read a cartridge from its JSON, with fresh ids so it never collides with one already here. */
export function importCartridge(text) {
  const raw = typeof text === 'string' ? JSON.parse(text) : text;
  if (raw?.format !== FORMAT) throw new Error('That isn’t a Dashi cartridge.');
  const c = { ...blankCartridge(), ...clone(raw), id: rid('crt'), status: 'draft', version: 0, publishedAt: null };
  c.tracks = (c.tracks ?? []).map((t) => ({ ...makeTrack(t.kind, t.name), ...t }));
  return c;
}
