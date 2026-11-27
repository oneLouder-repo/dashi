import { h } from './dom.js';
import { icon } from './icons.js';
import { suggestTagsFor, WHY } from '../platform/tagSuggest.js';

/**
 * Suggested tags as one-click chips (platform/tagSuggest.js), under any tag field.
 *
 *   TagSuggest({ text, have, vocab, onAdd, limit, extra })
 *     text    what the thing says (title, description, notes…)
 *     have    tags it already has, left out
 *     vocab   tagVocab(...) of the org's tagged things, or null for themes only
 *     extra   suggestions from elsewhere to show first: [{ tag, why, title }]
 *   → an element, or null when there is nothing to suggest
 */
export function TagSuggest({ text, have = [], vocab = null, onAdd, limit = 6, extra = [] }) {
  const seen = new Set(have.map((t) => String(t).toLowerCase()));
  const list = [];
  for (const x of [...extra, ...suggestTagsFor(text, vocab, { have, limit: limit + extra.length })]) {
    if (seen.has(x.tag) || list.length >= limit + Math.min(2, extra.length)) continue;
    seen.add(x.tag);
    list.push(x);
  }
  if (!list.length) return null;
  return h('div', { class: 'tag-suggest', role: 'group', 'aria-label': 'Suggested tags' },
    h('span', { class: 'tag-suggest-label' }, icon('sparkle', 12), 'Suggested'),
    list.map((x) => h('button', { type: 'button', class: `tag-suggest-chip why-${x.why}`, title: x.title ?? WHY[x.why] ?? '', onclick: () => onAdd(x.tag) }, '+ ', x.tag)));
}
