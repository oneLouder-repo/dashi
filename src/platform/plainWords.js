/**
 * Plain Words: how easy a passage is to read, worked out in the browser
 * with no service to call. Uses the Flesch reading ease and Flesch–Kincaid
 * grade formulas (good enough to compare drafts; no formula replaces a
 * reader), flags long sentences and long words, and suggests plainer words.
 *
 *   readability(text) → { words, sentences, syllables, ease, grade, longSentences, hardWords, swaps, verdict }
 */

/** Plainer words for common wordy ones (lower case). */
export const SWAPS = {
  'utilise': 'use', 'utilize': 'use', 'utilised': 'used', 'utilized': 'used', 'are required to': 'need to', 'is required to': 'needs to', 'utilisation': 'use', 'utilization': 'use', 'commence': 'start', 'facilitate': 'help', 'approximately': 'about',
  'in order to': 'to', 'prior to': 'before', 'subsequently': 'later', 'endeavour': 'try', 'endeavor': 'try', 'individuals': 'people',
  'assistance': 'help', 'demonstrate': 'show', 'numerous': 'many', 'sufficient': 'enough', 'regarding': 'about', 'obtain': 'get',
  'purchase': 'buy', 'require': 'need', 'additional': 'more', 'initiate': 'start', 'terminate': 'end', 'leverage': 'use',
  'stakeholders': 'the people involved', 'capacity building': 'training and support', 'in the event that': 'if', 'at this point in time': 'now',
  'due to the fact that': 'because', 'with regard to': 'about', 'a number of': 'some', 'the majority of': 'most', 'in addition': 'also',
  'ascertain': 'find out', 'disseminate': 'share', 'implement': 'carry out', 'optimal': 'best', 'participate': 'take part',
  'remuneration': 'pay', 'whilst': 'while', 'thereby': 'so', 'therefore': 'so', 'nevertheless': 'still', 'commencement': 'start',
  'modification': 'change', 'objective': 'aim', 'beneficial': 'helpful', 'comprehensive': 'full', 'equitable': 'fair',
  'synergies': 'working together', 'deliverables': 'what we will make', 'going forward': 'from now on', 'impactful': 'useful',
};

const VOWELS = /[aeiouy]+/g;
/** A fair guess at the syllables in an English word. */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (trimmed.match(VOWELS) ?? []).length);
}

export const sentencesOf = (text) => String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])|\n{2,}/).map((s) => s.trim()).filter((s) => /[a-z0-9]/i.test(s));
export const wordsOf = (text) => String(text).match(/[A-Za-z’'-]+|\d[\d,.]*/g) ?? [];

export function readability(text) {
  const sentences = sentencesOf(text);
  const words = wordsOf(text);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const nW = words.length || 1;
  const nS = sentences.length || 1;
  const ease = Math.round(206.835 - 1.015 * (nW / nS) - 84.6 * (syl / nW));
  const grade = Math.max(0, Math.round((0.39 * (nW / nS) + 11.8 * (syl / nW) - 15.59) * 10) / 10);
  const longSentences = sentences.filter((s) => wordsOf(s).length > 25);
  const hardWords = [...new Set(words.filter((w) => syllables(w) >= 4 && !/^[A-Z]/.test(w)).map((w) => w.toLowerCase()))];
  const lower = ` ${String(text).toLowerCase().replace(/\s+/g, ' ')} `;
  const swaps = Object.entries(SWAPS).filter(([from]) => new RegExp(`[^a-z]${from.replace(/ /g, '\\s+')}[^a-z]`).test(lower)).map(([from, to]) => ({ from, to }));
  return { words: words.length, sentences: sentences.length, syllables: syl, avgSentence: Math.round((nW / nS) * 10) / 10, ease, grade, longSentences, hardWords, swaps, verdict: verdict(grade) };
}

export function verdict(grade) {
  if (grade <= 6) return { level: 'easy', label: 'Easy to read', note: 'Most people, including many who find reading hard, can read this.' };
  if (grade <= 8) return { level: 'plain', label: 'Plain', note: 'Most adults can read this comfortably. A good target for public writing.' };
  if (grade <= 11) return { level: 'fair', label: 'Fairly hard', note: 'Shorter sentences and everyday words would let more people in.' };
  return { level: 'hard', label: 'Hard', note: 'Many readers will struggle. Split long sentences and swap long words for short ones.' };
}

/** The text with each wordy phrase swapped for its plainer word (a starting point, not a final draft). */
export function applySwaps(text) {
  let out = String(text);
  for (const [from, to] of Object.entries(SWAPS).sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`\\b${from.replace(/ /g, '\\s+')}\\b`, 'gi'), (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to));
  }
  return out;
}
