// The tag suggester: themes, mentions and tags used on similar things.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, tagVocab, suggestTagsFor } from '../src/platform/tagSuggest.js';

const vocab = tagVocab([
  { text: 'Lobster fishers and the harbour authority meet about wharf repairs', tags: ['fisheries'] },
  { text: 'Harbour wharf survey with fishers in the spring', tags: ['fisheries', 'data'] },
  { text: 'Youth grant panel picks three projects', tags: ['youth', 'grants'] },
  { text: 'Food bank network annual report', tags: ['food'] },
]);

test('tokens drop stop words and stem plurals', () => {
  assert.deepEqual(tokens('The fishers and their harbours'), ['fish', 'harbour']);
});

test('suggests a tag the org uses on similar things', () => {
  const s = suggestTagsFor('Notes from the wharf meeting with lobster fishers', vocab);
  assert.equal(s[0].tag, 'fisheries');
  assert.equal(s[0].why, 'similar');
});

test('themes come in the org’s own spelling when it has one', () => {
  const s = suggestTagsFor('Hunger is rising: more families at the pantry and school breakfast program', vocab);
  assert.ok(s.some((x) => x.tag === 'food' && x.why === 'theme'), JSON.stringify(s));
  assert.ok(!s.some((x) => x.tag === 'food security'));
});

test('with no vocabulary, themes still work, and tags it has are left out', () => {
  const s = suggestTagsFor('A podcast interview with a young climate activist about flood resilience', null, { have: ['climate'] });
  const tags = s.map((x) => x.tag);
  assert.ok(tags.includes('interview') && tags.includes('youth'), tags.join());
  assert.ok(!tags.includes('climate'));
  assert.deepEqual(suggestTagsFor('', vocab), []);
});
