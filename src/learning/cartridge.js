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
 *               body, ref: { plugin, type, id } | null, settings, alts: [kinds], competencies: [ids],
 *               assets?: [{ key, title, kind, icon, href }] }   other things linked to it (teach/LinkPicker.js)
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
const edit = (c, fn) => { const x = clone(c); fn(x); tidy(x); x.updatedAt = new Date().toISOString(); return x; };
/**
 * Days of room shown before the pre-start and after the post-end, so a block
 * can always be dropped a little earlier or later. Dropping one there grows
 * the pre-start or post-end to fit it.
 */
export const ROOM = 7;
function tidy(x) {
  if (x.span && x.blocks) {
    let lo = 0, hi = x.span.length;
    for (const b of Object.values(x.blocks)) { lo = Math.min(lo, b.start); hi = Math.max(hi, b.start + b.length); }
    for (const p of x.pace ?? []) { lo = Math.min(lo, p.day); hi = Math.max(hi, p.day + 1); }
    x.span.pre = Math.max(x.span.pre ?? 0, -lo);
    x.span.post = Math.max(x.span.post ?? 0, hi - x.span.length);
  }
  // A stream with fewer than two blocks left is no longer a stream.
  if (x.streams) {
    for (const sid of Object.keys(x.streams)) {
      const members = Object.values(x.blocks ?? {}).filter((b) => b.streamId === sid);
      if (members.length < 2) { for (const b of members) delete b.streamId; delete x.streams[sid]; }
    }
  }
  for (const b of Object.values(x.blocks ?? {})) if (b.streamId && !x.streams?.[b.streamId]) delete b.streamId;
}
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
  // New in alpha 0.4, mocked: they sit on the timeline and take words and settings; learners see a placeholder for now.
  { id: 'page', label: 'Web page', group: 'Content', icon: 'globe', track: 'content', minutes: 10, length: 3, modes: ['text', 'visual'], presence: ['teaching'], preview: true, blurb: 'A page from Web, edited here in brief or in Web in full.' },
  { id: 'case', label: 'Case study', group: 'Content', icon: 'fileText', track: 'content', minutes: 25, length: 5, modes: ['text'], presence: ['teaching', 'reflective'], preview: true, blurb: 'A real story to work through, with questions.' },
  { id: 'flashcards', label: 'Flashcards', group: 'Practice and assessment', icon: 'collection', track: 'assess', minutes: 10, length: 7, modes: ['text', 'hands-on'], presence: ['reflective'], preview: true, blurb: 'Spaced practice: cards come back until they stick.' },
  { id: 'scenario', label: 'Branching scenario', group: 'Practice and assessment', icon: 'branch', track: 'assess', minutes: 20, length: 5, modes: ['text', 'hands-on'], presence: ['reflective'], preview: true, blurb: 'Choose what to do next and see what happens.' },
  { id: 'mapwalk', label: 'Ecosystem walk', group: 'Practice and assessment', icon: 'mapTrifold', track: 'assess', minutes: 20, length: 5, modes: ['visual', 'hands-on'], presence: ['reflective'], preview: true, blurb: 'Explore an Ecosystem map with prompts along the way.' },
  { id: 'checkpoint', label: 'Credential checkpoint', group: 'Practice and assessment', icon: 'seal', track: 'assess', minutes: 0, length: 1, modes: [], presence: [], preview: true, blurb: 'Where a microcredential is earned (with stage 5).' },
  { id: 'poll', label: 'Quick poll', group: 'Dialogue and care', icon: 'chart', track: 'support', minutes: 2, length: 3, modes: ['hands-on'], presence: ['social'], preview: true, blurb: 'One question, everyone answers, everyone sees.' },
  { id: 'voice', label: 'Voice note', group: 'Dialogue and care', icon: 'mic', track: 'support', minutes: 5, length: 4, modes: ['audio'], presence: ['social', 'reflective'], preview: true, blurb: 'Learners answer out loud instead of typing.' },
  { id: 'showcase', label: 'Showcase', group: 'Dialogue and care', icon: 'image', track: 'support', minutes: 15, length: 7, modes: ['visual'], presence: ['social'], preview: true, blurb: 'A gallery where learners share what they made.' },
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
      trackId: track, type, title: t.label, start: clampDay(x, start), length: t.length, at: null,
      minutes: t.minutes, required: !['office', 'resource', 'announce', 'email', 'release', 'checkin'].includes(type),
      after: [], body: '', ref: null, settings: {}, alts: [], competencies: [], ...patch, id,
    };
  });
  return { cartridge, id };
}
const clampDay = (c, d) => clampInt(d, -(c.span?.pre ?? 7) - ROOM, (c.span?.length ?? 28) + (c.span?.post ?? 7) + ROOM - 1);
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
  const { streamId, ...copy } = clone(b);
  return addBlock(c, { ...copy, id: undefined, start: b.start + 7, title: b.title });
}
export const blocksOn = (c, trackId) => Object.values(c.blocks).filter((b) => b.trackId === trackId).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
export const blockEnd = (b) => b.start + b.length;

/** A lesson's sections (the lesson builder); older lessons are their words and pictures. */
export function lessonSections(b) {
  if (b.settings?.sections?.length) return b.settings.sections;
  const out = [];
  if (b.body) out.push({ id: 'sec_body', kind: 'text', text: b.body });
  for (const im of b.settings?.images ?? []) if (im.src) out.push({ id: `sec_img_${out.length}`, kind: 'image', src: im.src, alt: im.alt ?? '', decorative: !!im.decorative });
  return out;
}

/* --------------------------------------------------------------- streams */

/**
 * A stream: blocks linked into one composite that moves together, like a
 * group of clips in a music editor ("lesson intro, slideshow, check, discussion,
 * wrap-up"). Blocks can sit on different tracks. A stream can be saved as a
 * template and dropped into any cartridge.
 *
 *   c.streams { [id]: { id, name, tone } }      Block.streamId
 *   Template { id, name, blurb, blocks: [{ type, offset, length, title, body, settings, minutes, required }] }
 */
export const STREAM_TONES = ['teal', 'violet', 'orange', 'green', 'blue', 'coral', 'amber', 'orchid'].map(hex);
export const streamBlocks = (c, sid) => Object.values(c.blocks).filter((b) => b.streamId === sid).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
export const streamSpan = (c, sid) => { const bs = streamBlocks(c, sid); return bs.length ? { start: Math.min(...bs.map((b) => b.start)), end: Math.max(...bs.map(blockEnd)) } : null; };

/** Link blocks into a new stream; a block leaves any stream it was in. Returns { cartridge, id }. */
export function linkStream(c, blockIds, name = null) {
  const id = rid('str');
  const ids = blockIds.filter((b) => c.blocks[b]);
  const n = Object.keys(c.streams ?? {}).length;
  const cartridge = edit(c, (x) => {
    x.streams ??= {};
    x.streams[id] = { id, name: name ?? `Pack ${n + 1}`, tone: STREAM_TONES[n % STREAM_TONES.length] };
    for (const b of ids) x.blocks[b].streamId = id;
  });
  return { cartridge, id: cartridge.streams?.[id] ? id : null };
}
export const updateStream = (c, sid, patch) => edit(c, (x) => { if (x.streams?.[sid]) Object.assign(x.streams[sid], patch); });
export const unlinkBlock = (c, bid) => edit(c, (x) => { if (x.blocks[bid]) delete x.blocks[bid].streamId; });
export const addToStream = (c, sid, bid) => edit(c, (x) => { if (x.streams?.[sid] && x.blocks[bid]) x.blocks[bid].streamId = sid; });
/** Unlink every block in a stream (the blocks stay). */
export const dissolveStream = (c, sid) => edit(c, (x) => { for (const b of Object.values(x.blocks)) if (b.streamId === sid) delete b.streamId; delete x.streams?.[sid]; });
/** Remove a stream and its blocks. */
export const removeStream = (c, sid) => edit(c, (x) => {
  const gone = new Set(Object.values(x.blocks).filter((b) => b.streamId === sid).map((b) => b.id));
  for (const id of gone) delete x.blocks[id];
  for (const b of Object.values(x.blocks)) b.after = (b.after ?? []).filter((a) => !gone.has(a));
  delete x.streams?.[sid];
});
/** Move every block in a stream by some days, together, keeping their spacing. */
export function moveStream(c, sid, delta) {
  const sp = streamSpan(c, sid);
  if (!sp || !delta) return c;
  const lo = -(c.span?.pre ?? 7) - ROOM;
  const hi = (c.span?.length ?? 28) + (c.span?.post ?? 7) + ROOM;
  const d = Math.max(lo - sp.start, Math.min(hi - sp.end, Math.round(delta)));
  return edit(c, (x) => { for (const b of Object.values(x.blocks)) if (b.streamId === sid) b.start += d; });
}

/** A stream as a reusable template: types, spacing and words, without dates or links. */
export function streamToTemplate(c, sid, { name = null, blurb = '' } = {}) {
  const bs = streamBlocks(c, sid);
  const start = Math.min(...bs.map((b) => b.start));
  return {
    id: rid('tpl'), name: name ?? c.streams?.[sid]?.name ?? 'My pack', blurb, saved: new Date().toISOString(),
    blocks: bs.map((b) => ({ type: b.type, offset: b.start - start, length: b.length, title: b.title, body: b.body ?? '', settings: clone(b.settings ?? {}), minutes: b.minutes, required: b.required, ...(b.at ? { at: b.at } : {}) })),
  };
}
/** Drop a template into a cartridge at a day: each block goes on a track of its kind, all linked. Returns { cartridge, id }. */
export function applyStream(c, tpl, start = 0) {
  let x = c;
  const ids = [];
  for (const t of tpl.blocks) {
    const kind = blockType(t.type).track;
    if (!x.tracks.some((tr) => tr.kind === kind)) x = addTrack(x, kind);
    const r = addBlock(x, { type: t.type, start: start + (t.offset ?? 0), ...(t.length ? { length: t.length } : {}), ...(t.title ? { title: t.title } : {}), ...(t.body ? { body: t.body } : {}), ...(t.settings ? { settings: clone(t.settings) } : {}), ...(t.minutes != null ? { minutes: t.minutes } : {}), ...(t.at ? { at: t.at } : {}), ...(t.required != null ? { required: t.required } : {}) });
    x = r.cartridge;
    ids.push(r.id);
  }
  const r = linkStream(x, ids, tpl.name);
  return { cartridge: r.cartridge, id: r.id, blockIds: ids };
}

/** Streams that come with Teach. */
export const STREAM_TEMPLATES = [
  { id: 'tpl_slideshow', name: 'Basic slideshow pack', blurb: 'Lesson intro, a slideshow, a quick check, a discussion and a wrap-up lesson.', builtIn: true, blocks: [
    { type: 'lesson', offset: 0, length: 2, title: 'Intro: what this week is about' },
    { type: 'slideshow', offset: 1, length: 3, title: 'Slideshow' },
    { type: 'quiz', offset: 2, length: 3, title: 'Check yourself', settings: { questions: [{ q: 'What was the main idea?', options: ['', '', ''], answer: 0 }] } },
    { type: 'discussion', offset: 3, length: 4, title: 'Talk it through', body: 'What surprised you in the slideshow?' },
    { type: 'lesson', offset: 5, length: 2, title: 'Wrap-up: what we learned' },
  ] },
  { id: 'tpl_live', name: 'Live session pack', blurb: 'A reading to prepare, an announcement, the session, and a reflection after.', builtIn: true, blocks: [
    { type: 'reading', offset: 0, length: 3, title: 'Read before the session' },
    { type: 'announce', offset: 1, length: 1, title: 'See you on the call' },
    { type: 'live', offset: 3, length: 1, title: 'Live session', at: '19:00' },
    { type: 'reflection', offset: 4, length: 3, title: 'What stayed with you?' },
  ] },
  { id: 'tpl_assign', name: 'Assignment pack', blurb: 'A brief, the assignment, peer review and feedback.', builtIn: true, blocks: [
    { type: 'lesson', offset: 0, length: 2, title: 'The brief' },
    { type: 'assignment', offset: 1, length: 7, title: 'Assignment' },
    { type: 'peer', offset: 8, length: 5, title: 'Swap with a partner' },
    { type: 'feedback', offset: 10, length: 5, title: 'Feedback on your work' },
  ] },
  { id: 'tpl_week', name: 'Week opener', blurb: 'The week opens, a note to everyone, a short lesson and a check-in.', builtIn: true, blocks: [
    { type: 'release', offset: 0, length: 1, title: 'The week opens' },
    { type: 'announce', offset: 0, length: 1, title: 'This week' },
    { type: 'lesson', offset: 0, length: 3, title: 'This week’s lesson' },
    { type: 'checkin', offset: 3, length: 2, title: 'How’s the week going?' },
  ] },
];

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
