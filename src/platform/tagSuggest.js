/**
 * The tag suggester (d, 2026-11-27): tags for a thing from what it says,
 * worked out in the browser with no AI service (AI tools come in 0.7).
 * Three kinds of evidence, best first:
 *
 *   'similar'  a tag the org already uses on things that read like this one
 *              (word overlap, weighted so rare words count more)
 *   'mention'  a tag the org already uses that the text names outright
 *   'theme'    a community-sector theme the text points at through its
 *              cue words ("hunger", "meals", "pantry" → food security),
 *              in the org's own spelling of that tag when it has one
 *
 *   tagVocab(items)                      items: [{ text, tags }] → the org's vocabulary
 *   suggestTagsFor(text, vocab, { have, limit }) → [{ tag, why, score }]
 */

const STOP = new Set(('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its '
  + 'just may more most my no not of on or our out over she so some than that the their them then there these they this those to too '
  + 'up us was we were what when where which who why will with would you your about after all also any around because before being '
  + 'between both each every get got here like make many much new now off one only other own same see should such take two very way '
  + 'well while year years per via etc').split(' '));

/** A rough stem, enough to match plurals and simple endings. */
export const stem = (w) => w.toLowerCase()
  .replace(/(ies)$/, 'y').replace(/(sses)$/, 'ss').replace(/([^s])s$/, '$1')
  .replace(/(ing|ed|ment|ness|ation|ations|ions|ion|ly|al|er|ers)$/, '')
  .slice(0, 8);

export function tokens(text) {
  return String(text ?? '').toLowerCase().match(/\p{L}[\p{L}'-]+/gu)?.filter((w) => w.length > 2 && !STOP.has(w)).map(stem).filter((w) => w.length > 2) ?? [];
}

/**
 * Themes for community, nonprofit and public work. Cues are words or short
 * phrases; any one of them in the text counts, and more of them count more.
 */
export const THEMES = [
  { tag: 'food security', cues: ['food', 'hunger', 'meal', 'nutrition', 'grocery', 'pantry', 'food bank', 'breakfast program', 'community garden'] },
  { tag: 'housing', cues: ['housing', 'homeless', 'shelter', 'rent', 'tenant', 'affordable home', 'landlord', 'eviction'] },
  { tag: 'youth', cues: ['youth', 'young', 'teen', 'adolescent', 'student', 'kids', 'children', 'child'] },
  { tag: 'seniors', cues: ['senior', 'elder', 'older adult', 'aging', 'ageing', 'retire'] },
  { tag: 'indigenous', cues: ['indigenous', 'first nation', 'métis', 'metis', 'inuit', 'treaty', 'reconciliation', 'mi\'kmaq', 'two-eyed seeing'] },
  { tag: 'newcomers', cues: ['newcomer', 'immigrant', 'refugee', 'settlement', 'migrant', 'esl'] },
  { tag: 'mental health', cues: ['mental health', 'wellbeing', 'well-being', 'anxiety', 'depression', 'counselling', 'counseling', 'crisis line', 'addiction'] },
  { tag: 'health', cues: ['health', 'clinic', 'care', 'nurse', 'doctor', 'hospital', 'patient', 'public health'] },
  { tag: 'education', cues: ['education', 'school', 'learning', 'teacher', 'curriculum', 'course', 'classroom', 'training', 'literacy'] },
  { tag: 'employment', cues: ['employment', 'job', 'jobs', 'work placement', 'career', 'skills', 'labour', 'labor', 'hiring', 'apprentice'] },
  { tag: 'poverty', cues: ['poverty', 'low income', 'low-income', 'income support', 'basic income', 'welfare', 'cost of living'] },
  { tag: 'climate', cues: ['climate', 'carbon', 'emission', 'resilience', 'flood', 'storm', 'heat wave', 'adaptation'] },
  { tag: 'environment', cues: ['environment', 'conservation', 'habitat', 'biodiversity', 'watershed', 'pollution', 'wetland', 'species'] },
  { tag: 'ocean', cues: ['ocean', 'coast', 'coastal', 'fisher', 'fishery', 'fisheries', 'harbour', 'harbor', 'marine', 'bay', 'shore'] },
  { tag: 'arts and culture', cues: ['art', 'arts', 'artist', 'culture', 'cultural', 'music', 'theatre', 'theater', 'festival', 'heritage', 'museum'] },
  { tag: 'equity', cues: ['equity', 'inclusion', 'diversity', 'anti-racism', 'racism', 'discrimination', 'belonging', 'dei'] },
  { tag: 'accessibility', cues: ['accessib', 'disabilit', 'barrier-free', 'wheelchair', 'deaf', 'blind', 'neurodiver'] },
  { tag: 'justice', cues: ['justice', 'legal aid', 'court', 'police', 'prison', 'restorative', 'human rights'] },
  { tag: 'funding', cues: ['grant', 'funding', 'funder', 'donor', 'donation', 'endowment', 'philanthrop', 'fundrais', 'budget'] },
  { tag: 'governance', cues: ['board', 'governance', 'bylaw', 'policy', 'policies', 'trustee', 'annual general meeting', 'agm'] },
  { tag: 'partnerships', cues: ['partner', 'partnership', 'collaborat', 'coalition', 'network', 'alliance', 'collective impact'] },
  { tag: 'volunteers', cues: ['volunteer', 'volunteering', 'mentor'] },
  { tag: 'evaluation', cues: ['evaluation', 'outcome', 'indicator', 'measure', 'impact', 'metric', 'kpi', 'logic model', 'theory of change'] },
  { tag: 'data', cues: ['data', 'dataset', 'survey', 'census', 'statistic', 'dashboard', 'open data'] },
  { tag: 'strategy', cues: ['strategy', 'strategic', 'plan', 'planning', 'priorit', 'vision', 'mission', 'goal'] },
  { tag: 'advocacy', cues: ['advocacy', 'advocate', 'campaign', 'petition', 'policy change', 'lobby'] },
  { tag: 'community', cues: ['community', 'neighbourhood', 'neighborhood', 'resident', 'local', 'town hall', 'gathering'] },
  { tag: 'technology', cues: ['technology', 'digital', 'software', 'app', 'online', 'website', 'internet', 'broadband', 'coding'] },
  { tag: 'ai', cues: ['artificial intelligence', ' ai ', 'machine learning', 'chatbot', 'llm', 'claude', 'generative'] },
  { tag: 'transportation', cues: ['transit', 'transport', 'bus', 'ferry', 'bike', 'cycling', 'road', 'commute'] },
  { tag: 'interview', cues: ['interview', 'conversation with', 'in conversation', 'q&a', 'guest'] },
  { tag: 'story', cues: ['story', 'stories', 'storytelling', 'narrative', 'testimonial'] },
  { tag: 'research', cues: ['research', 'study', 'paper', 'journal', 'literature', 'findings', 'report'] },
  { tag: 'media', cues: ['media', 'press', 'news', 'newspaper', 'radio', 'podcast', 'journalist', 'social media'] },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** How many of a theme's cues the text has (a cue can be the start of a word, like "accessib"). */
function cueHits(lower, cues) {
  let n = 0;
  for (const c of cues) {
    const re = c.startsWith(' ') ? new RegExp(escapeRe(c), 'i') : new RegExp(`(^|[^\\p{L}])${escapeRe(c)}`, 'iu');
    if (re.test(lower)) n++;
  }
  return n;
}

/** Does the text name a tag (as words, allowing plurals)? */
function names(textToks, tag) {
  const t = tokens(tag);
  if (!t.length) return false;
  for (let i = 0; i + t.length <= textToks.length; i++) if (t.every((w, j) => textToks[i + j] === w)) return true;
  return false;
}

/**
 * The org's tag vocabulary: each tag with the words of the things that carry
 * it, and how rare each word is across everything.
 */
export function tagVocab(items) {
  const df = new Map();
  const byTag = new Map();
  let docs = 0;
  for (const it of items) {
    const toks = new Set(tokens(it.text));
    if (!toks.size && !(it.tags ?? []).length) continue;
    docs++;
    for (const w of toks) df.set(w, (df.get(w) ?? 0) + 1);
    for (const raw of it.tags ?? []) {
      const tag = String(raw).trim().toLowerCase().replace(/^#/, '');
      if (!tag) continue;
      if (!byTag.has(tag)) byTag.set(tag, { tag, n: 0, words: new Map() });
      const e = byTag.get(tag);
      e.n++;
      for (const w of toks) e.words.set(w, (e.words.get(w) ?? 0) + 1);
    }
  }
  return { docs, df, tags: [...byTag.values()] };
}

/** Tags to suggest for some text, leaving out the ones it already has. */
export function suggestTagsFor(text, vocab = null, { have = [], limit = 6 } = {}) {
  const lower = ` ${String(text ?? '').toLowerCase()} `;
  const toks = tokens(text);
  if (!toks.length) return [];
  const own = new Set(toks);
  const has = new Set(have.map((t) => String(t).toLowerCase()));
  const scores = new Map();
  const add = (tag, score, why) => {
    const t = tag.toLowerCase();
    if (has.has(t) || score <= 0) return;
    const cur = scores.get(t);
    if (!cur) { scores.set(t, { tag: t, score, why }); return; }
    // More than one kind of evidence counts a little extra; the strongest names the reason.
    if (score > cur.score) cur.why = why;
    cur.score = Math.max(cur.score, score) + Math.min(cur.score, score) * 0.25;
  };

  const v = vocab ?? { docs: 0, df: new Map(), tags: [] };
  const idf = (w) => Math.log(1 + (v.docs + 1) / ((v.df.get(w) ?? 0) + 1));
  const ownWeight = [...own].reduce((s, w) => s + idf(w), 0) || 1;
  for (const e of v.tags) {
    // Words of this text that things with the tag also use, the rarer the better.
    let overlap = 0;
    for (const w of own) if (e.words.has(w)) overlap += idf(w) * Math.min(1, e.words.get(w) / e.n + 0.3);
    const similar = overlap / ownWeight;
    if (similar > 0.12) add(e.tag, Math.min(1, similar * 1.6) * (0.7 + Math.min(0.3, e.n / 20)), 'similar');
    if (names(toks, e.tag)) add(e.tag, 0.9, 'mention');
  }

  for (const th of THEMES) {
    const hits = cueHits(lower, th.cues);
    if (!hits) continue;
    // Use the org's own word for the theme when it has one ("food" for food security).
    const themeToks = new Set([...tokens(th.tag), ...th.cues.flatMap((c) => tokens(c))]);
    const theirs = v.tags.filter((e) => tokens(e.tag).length && tokens(e.tag).every((w) => themeToks.has(w))).sort((a, b) => b.n - a.n)[0];
    add(theirs?.tag ?? th.tag, Math.min(0.85, 0.45 + hits * 0.15), 'theme');
  }

  return [...scores.values()].sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag)).slice(0, limit).map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }));
}

export const WHY = {
  similar: 'You use this tag on similar things',
  mention: 'The text names this tag',
  theme: 'A theme the text points to',
};
