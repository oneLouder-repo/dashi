/**
 * Teach's checks (eLearning stage 1): accessibility, Universal Design for
 * Learning and good course design, run live in the editor like a spell
 * checker. Pure functions only.
 *
 *   runChecks(cartridge) → [{ id, rule, level: 'block' | 'warn' | 'hint', blockId, week, title, why, fix }]
 *
 * `block` issues stop a cartridge being published (WCAG 2.2 AA basics);
 * warnings and hints explain themselves and never stop anyone.
 */
import { BLOCK_TYPES, blockType, pathByWeek, weekLoad, weekOf, dateOf, weekLabel } from './cartridge.js';
import { INK } from '../ui/wheel.js';

export const LEVELS = [
  { id: 'block', label: 'Needs fixing before publishing' },
  { id: 'warn', label: 'Worth fixing' },
  { id: 'hint', label: 'Ideas' },
];

export const RULES = [
  { id: 'alt', label: 'Alt text', why: 'People using screen readers hear the alt text in place of a picture. Without it, they miss what the picture says.' },
  { id: 'transcript', label: 'Transcripts and captions', why: 'Deaf and hard of hearing learners, people in noisy places and people who read faster than they listen all need a text version of audio and video.' },
  { id: 'contrast', label: 'Colour contrast', why: 'Text needs a contrast of at least 4.5 to 1 against its background (WCAG 2.2 AA) to be read by people with low vision.' },
  { id: 'reading', label: 'Reading level', why: 'Plain language helps everyone, including people reading in a second language and people who are tired. Aim for grade 8 to 10.' },
  { id: 'timing', label: 'Time limits', why: 'Some learners need more time (WCAG 2.2.1). A timed quiz or exam should let a teacher grant an extension.' },
  { id: 'load', label: 'Weekly load', why: 'Overloaded weeks are the most common design fault. Learners juggling work and family drop out when a week asks for more than you promised.' },
  { id: 'udl', label: 'Many ways in', why: 'Universal Design for Learning: offering content in more than one way (read, listen, watch, do) lets more people learn.' },
  { id: 'presence', label: 'Presence', why: 'A community of inquiry has teaching, social and reflective presence each week. A week with one of them missing can feel lonely or flat.' },
  { id: 'feedback', label: 'Feedback loop', why: 'Learning happens in the loop: work handed in should get feedback, and a feedback block makes the time for it.' },
  { id: 'dates', label: 'Kind dates', why: 'Nothing should be due in the first 48 hours or on a public holiday, so people can settle in and rest.' },
  { id: 'ref', label: 'Missing content', why: 'A content block with nothing in it shows learners an empty card.' },
];
export const ruleLabel = (id) => RULES.find((r) => r.id === id)?.label ?? id;
export const ruleWhy = (id) => RULES.find((r) => r.id === id)?.why ?? '';

/** Nova Scotia public holidays and widely kept days, 2026 to 2027 (a starter list; orgs will add their own). */
export const HOLIDAYS = {
  '2026-11-11': 'Remembrance Day', '2026-12-25': 'Christmas Day', '2026-12-26': 'Boxing Day',
  '2027-01-01': 'New Year’s Day', '2027-02-15': 'Heritage Day', '2027-03-26': 'Good Friday', '2027-05-24': 'Victoria Day',
  '2027-07-01': 'Canada Day', '2027-08-02': 'Natal Day', '2027-09-06': 'Labour Day', '2027-09-30': 'National Day for Truth and Reconciliation',
  '2027-10-11': 'Thanksgiving', '2027-11-11': 'Remembrance Day', '2027-12-25': 'Christmas Day',
};

/* -------------------------------------------------------------- measures */

const syllables = (w) => {
  const s = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return 0;
  if (s.length <= 3) return 1;
  const m = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
};
/** Flesch-Kincaid grade level of a text (null when there's too little to judge). */
export function readingGrade(text) {
  const plain = String(text ?? '').replace(/[#*_>`[\]()]/g, ' ');
  const words = plain.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length < 30) return null;
  const sentences = Math.max(1, (plain.match(/[.!?]+(\s|$)/g) ?? []).length);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return Math.round((0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59) * 10) / 10;
}

const lum = (hex) => {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
/** WCAG contrast ratio of two colours. */
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };

/** Black or white text, whichever has more contrast on a colour. */
export const bestInk = (bg) => (contrast(INK, bg) >= contrast('#ffffff', bg) ? INK : '#ffffff');

/* ---------------------------------------------------------------- checks */

const PRESENCE = { teaching: 'teaching (a lesson, show or live session)', social: 'social (a discussion, meet-up or live session)', reflective: 'reflective (a reflection, check-in or self-check quiz)' };

export function runChecks(c) {
  const out = [];
  const add = (rule, level, title, { blockId = null, week = null, fix = null } = {}) => out.push({ id: `${rule}:${blockId ?? week ?? out.length}:${out.length}`, rule, level, blockId, week, title, why: ruleWhy(rule), fix });
  const blocks = Object.values(c.blocks);
  const muted = new Set(c.tracks.filter((t) => t.muted).map((t) => t.id));
  const live = blocks.filter((b) => !muted.has(b.trackId));

  for (const b of live) {
    const t = blockType(b.type);
    // Pictures need alt text (or to be marked decorative).
    for (const img of b.settings?.images ?? []) {
      if (img?.src && !img.decorative && !String(img.alt ?? '').trim()) add('alt', 'block', `“${b.title}” has a picture with no alt text`, { blockId: b.id, fix: 'alt' });
    }
    // Audio and video need a transcript or captions.
    if (t.media && !(b.alts ?? []).some((a) => a === 'transcript' || a === 'captions')) add('transcript', 'block', `“${b.title}” needs a transcript or captions`, { blockId: b.id, fix: 'transcript' });
    // Content blocks with nothing in them.
    if (['slideshow', 'podcast', 'video', 'resource'].includes(b.type) && !b.ref && !b.settings?.url) add('ref', 'warn', `“${b.title}” has no ${t.label.toLowerCase()} chosen yet`, { blockId: b.id, fix: 'ref' });
    if (['lesson', 'reading', 'discussion', 'reflection'].includes(b.type) && !String(b.body ?? '').trim()) add('ref', 'hint', `“${b.title}” has no words yet`, { blockId: b.id });
    // Reading level.
    const g = readingGrade(b.body);
    if (g != null && g > 10) add('reading', 'hint', `“${b.title}” reads at about grade ${g > 16 ? '16 or above' : Math.round(g)}`, { blockId: b.id });
    // Timed quizzes and exams allow extensions.
    if (['quiz', 'exam'].includes(b.type) && Number(b.settings?.timeLimit) > 0 && !b.settings?.extensions) add('timing', 'warn', `“${b.title}” has a ${b.settings.timeLimit}-minute limit with no extensions`, { blockId: b.id, fix: 'extensions' });
    // Kind dates.
    if (t.assessed && b.start + b.length <= 2 && b.start >= 0) add('dates', 'hint', `“${b.title}” is due in the first 48 hours`, { blockId: b.id });
    const due = dateOf(c.run.start, b.start + b.length - 1);
    if (t.assessed && HOLIDAYS[due]) add('dates', 'hint', `“${b.title}” is due on ${HOLIDAYS[due]}`, { blockId: b.id });
    if (['live', 'office', 'whiteboard', 'meetup'].includes(b.type) && HOLIDAYS[dateOf(c.run.start, b.start)]) add('dates', 'hint', `“${b.title}” falls on ${HOLIDAYS[dateOf(c.run.start, b.start)]}`, { blockId: b.id });
    // Feedback after assessed work.
    if (t.assessed && b.type !== 'milestone') {
      const end = b.start + b.length;
      const fb = live.some((x) => blockType(x.type).feedback && x.start >= end - 1 && x.start <= end + 14);
      if (!fb) add('feedback', 'hint', `No feedback block in the two weeks after “${b.title}”`, { blockId: b.id, fix: 'feedback' });
    }
  }

  // Colour contrast of each track's blocks.
  for (const t of c.tracks) {
    const ink = bestInk(t.tone);
    if (contrast(ink, t.tone) < 4.5) add('contrast', 'warn', `Text on “${t.name}” blocks has a contrast of ${contrast(ink, t.tone)} to 1`, {});
  }

  // Weekly load against the promise.
  const promise = (Number(c.hoursPerWeek) || 3) * 60;
  for (const w of weekLoad(c)) {
    if (w.minutes > promise * 1.15) add('load', w.minutes > promise * 1.5 ? 'warn' : 'hint', `${weekLabel(w.week)} asks about ${Math.round(w.minutes / 6) / 10} hours, over the ${c.hoursPerWeek} promised`, { week: w.week });
  }

  // Per week in session: many ways in, and presence.
  const weeks = pathByWeek(c).filter((w) => w.week >= 1 && w.from < (c.span?.length ?? 28));
  for (const w of weeks) {
    const types = w.blocks.map((b) => blockType(b.type));
    const content = types.filter((t) => t.group === 'Content');
    // Alternatives count too: a transcript is a way to read, an audio version a way to listen.
    const ALT_MODE = { transcript: 'text', captions: 'text', reading: 'text', audio: 'audio' };
    const modes = new Set([...content.flatMap((t) => t.modes), ...w.blocks.filter((b) => blockType(b.type).group === 'Content').flatMap((b) => (b.alts ?? []).map((a) => ALT_MODE[a]))].filter((m) => ['text', 'audio', 'visual'].includes(m)));
    if (content.length && modes.size === 1) add('udl', 'hint', `${w.label} offers content one way only (${[...modes][0]})`, { week: w.week });
    else if (content.length && !modes.size) add('udl', 'hint', `${w.label} has nothing to read, listen to or watch`, { week: w.week });
    const have = new Set(types.flatMap((t) => t.presence));
    const missing = Object.keys(PRESENCE).filter((p) => !have.has(p));
    if (missing.length && w.blocks.length) add('presence', 'hint', `${w.label} has no ${missing.map((m) => PRESENCE[m]).join(' or ')} block`, { week: w.week });
  }
  const order = { block: 0, warn: 1, hint: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** The issues for one block, for the dot on its clip. */
export const issuesFor = (issues, blockId) => issues.filter((i) => i.blockId === blockId);
/** Can it be published? Only when nothing blocks it. */
export const canPublish = (issues) => !issues.some((i) => i.level === 'block');

/** UDL balance: how many blocks serve each of the three principles, by what they are. */
export function udlBalance(c) {
  const out = { engage: 0, represent: 0, express: 0 };
  for (const b of Object.values(c.blocks)) {
    const t = blockType(b.type);
    if (t.presence.includes('social') || t.presence.includes('reflective') || b.type === 'checkin') out.engage += 1;
    if (t.group === 'Content' || (b.alts ?? []).length) out.represent += 1;
    if (t.assessed || ['quiz', 'reflection', 'discussion'].includes(b.type)) out.express += 1;
  }
  return out;
}

export const blockTypesCount = () => BLOCK_TYPES.length;
export { weekOf };
