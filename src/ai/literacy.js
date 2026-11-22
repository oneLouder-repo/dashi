/**
 * AI literacy checks (alpha 0.4): a prompt is looked over before it goes
 * anywhere, in the browser, with no AI involved. Like a spell checker for
 * care: personal data stops it, risky uses and weak prompts get a note.
 * Nothing here calls out; the AI plugin's future Claude proxy will run the
 * same checks on the server before a prompt leaves Dashi.
 *
 *   checkPrompt(text, { staffNames = [] })
 *     → { level: 'stop' | 'care' | 'ok', findings: [{ id, level, title, note, hits? }],
 *         redacted, words }
 *   redact(text, { staffNames })   the text with personal details swapped for [email], [phone]…
 */

const PATTERNS = [
  { id: 'email', label: '[email]', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, title: 'An email address', note: 'Take it out, or swap it for a role (“the board chair”).' },
  { id: 'phone', label: '[phone]', re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, title: 'A phone number', note: 'Phone numbers identify people. Leave them out.' },
  { id: 'sin', label: '[id number]', re: /\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/g, title: 'Something like a SIN or ID number', note: 'Never put government ID numbers into an AI tool.' },
  { id: 'postal', label: '[postal code]', re: /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi, title: 'A postal code', note: 'With other details, a postal code can point to a person or a household.' },
  { id: 'birth', label: '[date of birth]', re: /\b(?:born|DOB|date of birth)\b[^.\n]{0,24}\d/gi, title: 'A date of birth', note: 'Dates of birth identify people.' },
];
const SENSITIVE = [
  { id: 'health', re: /\b(diagnos\w*|mental health|medication|prescription|disabilit\w*|HIV|pregnan\w*|addiction|overdose|therap(y|ist))\b/i, title: 'Health information', note: 'Health details about a person are restricted data. Check the AI policy before going on.' },
  { id: 'client', re: /\b(client file|case notes?|caseworker notes|intake form|our clients? (named|called))\b/i, title: 'Client records', note: 'Case notes and client files stay out of AI tools unless the policy and consent say otherwise.' },
  { id: 'community', re: /\b(First Nations?|Indigenous|Métis|Inuit|band council|treaty)\b[^.\n]{0,40}\b(data|records|survey|knowledge|stories)\b/i, title: 'Community-held data', note: 'Data held with or about Indigenous communities follows their rules (OCAP® and the CARE principles). Ask before it goes in.' },
  { id: 'money', re: /\b(bank account|account number|credit card|donor list|salar(y|ies) of)\b/i, title: 'Financial details', note: 'Bank details, donor lists and salaries are restricted.' },
];
const DECISIONS = /\b(decide|choose|rank|score|screen|reject|approve|shortlist)\b[^.\n]{0,40}\b(applicants?|candidates?|grantees?|clients?|staff|tenants?|students?|who (gets|should))\b/i;
const FACTS = /\b(statistics?|stats|how many|percent(age)?|cite|citation|sources?|studies show|research shows|exact figures?)\b/i;

const words = (t) => (String(t).trim().match(/\S+/g) ?? []).length;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function redact(text, { staffNames = [] } = {}) {
  let out = String(text ?? '');
  for (const p of PATTERNS) out = out.replace(p.re, p.label);
  for (const name of staffNames.filter((n) => n && n.trim().length > 2)) out = out.replace(new RegExp(`\\b${escape(name.trim())}\\b`, 'gi'), '[person]');
  return out;
}

export function checkPrompt(text, { staffNames = [] } = {}) {
  const t = String(text ?? '');
  const findings = [];
  for (const p of PATTERNS) {
    const hits = t.match(p.re);
    if (hits) findings.push({ id: p.id, level: 'stop', title: p.title, note: p.note, hits: [...new Set(hits)].slice(0, 4) });
  }
  const named = staffNames.filter((n) => n && n.trim().length > 2 && new RegExp(`\\b${escape(n.trim())}\\b`, 'i').test(t));
  if (named.length) findings.push({ id: 'names', level: 'care', title: 'Names of people you work with', note: 'Use a role instead of a name unless they’ve said yes. Names become [person] in the log.', hits: named.slice(0, 4) });
  for (const s of SENSITIVE) if (s.re.test(t)) findings.push({ id: s.id, level: 'stop', title: s.title, note: s.note });
  if (DECISIONS.test(t)) findings.push({ id: 'decision', level: 'care', title: 'A decision about people', note: 'AI can help you think, but a person decides who gets a grant, a job or a service. Keep a human in the loop and say how you used it.' });
  if (FACTS.test(t)) findings.push({ id: 'facts', level: 'care', title: 'Asking for facts or figures', note: 'AI can make up numbers and sources that look real. Check every figure and citation against the original before you use it.' });
  const n = words(t);
  // Prompt craft: gentle notes, never a stop.
  if (n > 0 && n < 12) findings.push({ id: 'short', level: 'tip', title: 'Say a bit more', note: 'Short prompts get generic answers. Add who it’s for, what you already know, and what a good answer looks like.' });
  if (n >= 12 && !/\b(for|audience|readers?|board|funders?|youth|community|members|staff|volunteers?|donors?)\b/i.test(t)) findings.push({ id: 'audience', level: 'tip', title: 'Who is it for?', note: 'Naming the audience (the board, funders, young people) changes the tone and the words.' });
  if (n >= 12 && !/\b(bullet|list|table|paragraph|words|sentences?|email|summary|outline|format|steps?|draft)\b/i.test(t)) findings.push({ id: 'format', level: 'tip', title: 'What shape should the answer take?', note: 'Ask for a format: three bullet points, a 150-word paragraph, a table.' });
  const level = findings.some((f) => f.level === 'stop') ? 'stop' : findings.some((f) => f.level === 'care') ? 'care' : 'ok';
  return { level, findings, redacted: redact(t, { staffNames }), words: n };
}

export const LEVELS = {
  stop: { label: 'Stop and fix', note: 'Something here should not go into an AI tool. Fix the red items first.' },
  care: { label: 'Go ahead with care', note: 'Fine to use, with a person checking what comes back.' },
  ok: { label: 'Looks fine', note: 'Nothing worrying. A person still reads and owns what comes back.' },
};
