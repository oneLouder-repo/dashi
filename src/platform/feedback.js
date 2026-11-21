/**
 * Feedback forms: ask visitors what they make of the data, on a public
 * site or the board portal. Forms live in the dashboards document (they
 * publish like dashboards, by visibility and site); answers live in a
 * document of their own, "feedback", which visitors append to through the
 * server and never read.
 *
 * Form { id, title, intro, thanks, visibility: 'private' | 'public', siteId,
 *        place: 'home' | 'dashboards' | <dashboard id>,   where on the site it shows
 *        questions: [{ id, kind, text, help?, required?, options?, low?, high?, placeholder? }],
 *          kind: 'rating' (1–5 stars) | 'scale' (0–10) | 'yesno' | 'choice' (one) | 'multi' (several)
 *                | 'text' | 'long' | 'section' (a heading between questions; no answer)
 *        style: { layout: 'card' | 'plain' | 'steps', button },   how it looks (the form designer)
 *        createdAt }
 * feedback = { id: 'feedback', responses: { [id]: { id, formId, siteId, at, answers: { [questionId]: value } } } }
 */
import { uid } from '../core/ops.js';

export const QUESTION_KINDS = [
  { id: 'rating', label: '1 to 5 rating', blurb: 'Stars, for how clear or useful something is', icon: 'star' },
  { id: 'scale', label: '0 to 10 scale', blurb: 'How likely, how much: with words at each end', icon: 'sliders' },
  { id: 'yesno', label: 'Yes or no', blurb: 'One quick question', icon: 'check' },
  { id: 'choice', label: 'Pick one', blurb: 'A short list of options', icon: 'list' },
  { id: 'multi', label: 'Pick several', blurb: 'Tick all that apply', icon: 'checklist' },
  { id: 'text', label: 'In their words', blurb: 'A short written answer', icon: 'chats' },
  { id: 'long', label: 'A longer answer', blurb: 'Room for a story or a suggestion', icon: 'notePencil' },
  { id: 'section', label: 'Heading', blurb: 'A title and a line between questions', icon: 'textAa' },
];
export const LAYOUTS = [
  { id: 'card', label: 'Card', blurb: 'A card on the page' },
  { id: 'plain', label: 'Plain', blurb: 'Sits in the page, no box' },
  { id: 'steps', label: 'One at a time', blurb: 'A question per step, with progress' },
];
const ANSWERS = new Set(['rating', 'scale', 'yesno', 'choice', 'multi', 'text', 'long']);
const STARTERS = {
  choice: ['First', 'Second'], multi: ['First', 'Second', 'Third'],
};
/** A new block of a kind, with sensible words to change. */
export const starter = (kind) => ({ ...question(kind, { rating: 'How clear was this?', scale: 'How likely are you to tell a friend?', yesno: 'Did you find what you came for?', choice: 'Which matters most to you?', multi: 'Which of these would you use?', text: 'Anything we missed?', long: 'Tell us more', section: 'A few more questions' }[kind] ?? '', STARTERS[kind] ?? []), ...(kind === 'scale' ? { low: 'Not at all likely', high: 'Very likely' } : {}) });
export const PLACES = [
  { id: 'home', label: 'Bottom of the front page' },
  { id: 'dashboards', label: 'Under every dashboard' },
];

export const question = (kind, text = '', options = []) => ({ id: uid('q'), kind, text, options, required: false, help: '' });

export const blankForm = (siteId = null) => ({
  title: 'What do you make of these numbers?',
  intro: 'A minute of your time helps us report better.',
  thanks: 'Thank you. We read every answer.',
  visibility: 'private', siteId, place: 'dashboards',
  questions: [
    question('rating', 'How clear are these numbers?'),
    question('choice', 'Which would you like to see more of?', ['Where the money goes', 'Stories from programs', 'How we compare with last year', 'Regional numbers']),
    question('text', 'Anything the numbers miss?'),
  ],
  createdAt: new Date().toISOString().slice(0, 10),
});

/** Starter forms, so there is something to look at and answer. */
export function seedForms(org) {
  const siteId = org?.sites?.['site-impact']?.id ?? Object.values(org?.sites ?? {}).find((s) => s.visibility === 'public')?.id ?? null;
  const board = Object.values(org?.sites ?? {}).find((s) => s.visibility === 'private')?.id ?? null;
  const forms = {};
  if (siteId) forms['form-numbers'] = { ...blankForm(siteId), id: 'form-numbers', visibility: 'public', createdAt: '2026-10-01' };
  if (board) forms['form-board-pack'] = {
    id: 'form-board-pack', title: 'Was this pack what you needed?', intro: 'Two questions after each meeting, so the next pack is better.', thanks: 'Thanks. The Chair sees these before the next agenda is set.',
    visibility: 'private', siteId: board, place: 'home', createdAt: '2026-09-01',
    questions: [question('rating', 'Did the pack give you what you needed to decide?'), question('yesno', 'Was it the right length?'), question('text', 'What should the next pack include?')],
  };
  return forms;
}

export const blankFeedback = () => ({ id: 'feedback', responses: {} });
export function migrateFeedback(doc) {
  doc ??= blankFeedback();
  doc.id ??= 'feedback';
  doc.responses ??= {};
  return doc;
}

/** Keep only answers to questions the form has, in a shape the server can store. */
export function cleanResponse(form, answers = {}, { siteId = null, at = new Date().toISOString() } = {}) {
  const out = {};
  for (const q of form.questions ?? []) {
    const v = answers[q.id];
    if (v == null || v === '') continue;
    if (!ANSWERS.has(q.kind)) continue;
    if (q.kind === 'rating') { const n = Math.round(Number(v)); if (n >= 1 && n <= 5) out[q.id] = n; }
    else if (q.kind === 'scale') { const n = Math.round(Number(v)); if (n >= 0 && n <= 10) out[q.id] = n; }
    else if (q.kind === 'multi') { const picked = [...new Set((Array.isArray(v) ? v : [v]).map(String))].filter((x) => (q.options ?? []).includes(x)); if (picked.length) out[q.id] = picked; }
    else if (q.kind === 'yesno') { if (v === 'yes' || v === 'no') out[q.id] = v; }
    else if (q.kind === 'choice') { if ((q.options ?? []).includes(String(v))) out[q.id] = String(v); }
    else out[q.id] = String(v).slice(0, 1000);
  }
  if (!Object.keys(out).length) return null;
  return { id: uid('fb'), formId: form.id, siteId, at, answers: out };
}

/** What the answers add up to, question by question. */
export function summarise(form, responses) {
  const mine = Object.values(responses ?? {}).filter((r) => r.formId === form.id).sort((a, b) => b.at.localeCompare(a.at));
  const questions = (form.questions ?? []).map((q) => {
    const vals = mine.map((r) => r.answers?.[q.id]).filter((v) => v != null && v !== '');
    const s = { q, n: vals.length };
    if (q.kind === 'section') return null;
    if (q.kind === 'rating') { s.avg = vals.length ? Math.round((vals.reduce((t, v) => t + v, 0) / vals.length) * 10) / 10 : null; s.counts = [1, 2, 3, 4, 5].map((k) => vals.filter((v) => v === k).length); }
    else if (q.kind === 'scale') { s.avg = vals.length ? Math.round((vals.reduce((t, v) => t + v, 0) / vals.length) * 10) / 10 : null; s.counts = Array.from({ length: 11 }, (_, k) => vals.filter((v) => v === k).length); }
    else if (q.kind === 'multi') s.counts = (q.options ?? []).map((o) => ({ option: o, n: vals.filter((v) => Array.isArray(v) && v.includes(o)).length }));
    else if (q.kind === 'yesno') s.counts = { yes: vals.filter((v) => v === 'yes').length, no: vals.filter((v) => v === 'no').length };
    else if (q.kind === 'choice') s.counts = (q.options ?? []).map((o) => ({ option: o, n: vals.filter((v) => v === o).length }));
    else s.texts = vals;
    return s;
  }).filter(Boolean);
  return { total: mine.length, latest: mine[0]?.at ?? null, questions, responses: mine };
}

/** Which forms show at a place on a site (public ones on public sites; any on the board's own site). */
export const formsAt = (forms, siteId, place, { members = false } = {}) =>
  Object.values(forms ?? {}).filter((f) => f.siteId === siteId && (members || f.visibility === 'public') && f.place === place);

/** Questions marked as needing an answer that have none. */
export function missingRequired(form, answers = {}) {
  return (form.questions ?? []).filter((q) => q.required && ANSWERS.has(q.kind)).filter((q) => {
    const v = answers[q.id];
    return v == null || v === '' || (Array.isArray(v) && !v.length);
  }).map((q) => q.id);
}
