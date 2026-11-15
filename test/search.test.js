import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, parseQuery, snippet } from '../src/platform/search.js';
import { standIn, coverArt, SCENES } from '../src/ui/standIn.js';
import { seedPodcasts, migratePodcasts, toClock, fromClock, episodeCode, episodeHref } from '../src/platform/podcasts.js';

const docs = {
  org: { staff: { s1: { id: 's1', name: 'Amara Okafor', title: 'Director of Programs' } } },
  maps: { maps: { m1: { id: 'm1', name: 'North shore ecosystem' } } },
  mapContents: { m1: { actors: { a1: { id: 'a1', label: 'Food bank', kind: 'actor', meta: { description: 'Weekly hampers for families' } } } } },
  library: { items: { l1: { id: 'l1', kind: 'ref', meta: { title: 'Building communities from the inside out', abstract: 'Asset-based community development' }, tags: ['abcd', 'north'] } }, bibs: {} },
  podcasts: seedPodcasts(),
};
const plugins = new Set(['mapper', 'library', 'podcasts']);

test('search finds titles, raw text, actors and episodes across plugins', () => {
  const idx = buildIndex(docs, { plugins });
  const hit = (q) => search(idx, q).map((r) => r.entry.title);
  assert.ok(hit('hampers').includes('Food bank'), 'actor description');
  assert.ok(hit('inside out').includes('Building communities from the inside out'), 'library title');
  assert.ok(hit('polar night').includes('Robots in the Arctic'), 'episode description');
  assert.ok(hit('amara').includes('Amara Okafor'), 'staff');
  const ep = search(idx, 'arctic').find((r) => r.entry.title === 'Robots in the Arctic');
  assert.equal(ep.entry.href, 'podcasts.html#pod-stem-voices/ep-sv-1');
});

test('tag: and in: narrow a search; every word must appear', () => {
  const idx = buildIndex(docs, { plugins });
  assert.deepEqual(parseQuery('tag:north in:library food #abcd').tags.sort(), ['abcd', 'north']);
  assert.equal(parseQuery('in:maps x').group, 'maps');
  assert.ok(search(idx, '#robotics').some((r) => r.entry.title === 'Robots in the Arctic'));
  assert.ok(search(idx, 'in:library communities').every((r) => r.entry.group === 'library'));
  assert.equal(search(idx, 'hampers zebra').length, 0);
});

test('snippets mark the matching words, accents and all', () => {
  const parts = snippet('Café culture in Montréal', ['montreal']);
  assert.equal(parts.filter((p) => p.hit).map((p) => p.t).join(), 'Montréal');
});

test('stand-in art and cover art are drawn the same way every time, and vary by key', () => {
  assert.equal(standIn('a', '#2f8a5b'), standIn('a', '#2f8a5b'));
  assert.notEqual(standIn('a', '#2f8a5b'), standIn('b', '#2f8a5b'));
  assert.ok(standIn('x').startsWith('data:image/svg+xml,'));
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => standIn(`k${i}`))).size === 40);
  assert.ok(SCENES.length >= 8);
  const c = decodeURIComponent(coverArt({ id: 'p', title: 'Learning <with> the Land' }, { label: 'S1 · E2' }));
  assert.match(c, /&lt;with&gt;/);
  assert.match(c, /S1 · E2/);
});

test('podcast episodes carry chapters, tags and links into Dashi; clock times round-trip', () => {
  const doc = migratePodcasts({ podcasts: { p: { id: 'p', title: 'Show' } }, episodes: { e: { id: 'e', podcastId: 'p', type: 'full', season: 2, number: 3 } } });
  assert.deepEqual([doc.episodes.e.chapters, doc.episodes.e.tags, doc.episodes.e.related], [[], [], []]);
  assert.equal(doc.podcasts.p.links.spotify, '');
  assert.equal(episodeCode(doc.episodes.e), 'S2 · E3');
  assert.equal(episodeCode({ type: 'trailer', season: 1 }), 'S1 · Trailer');
  assert.equal(episodeHref(doc.episodes.e), 'podcasts.html#p/e');
  assert.equal(toClock(65), '1:05');
  assert.equal(toClock(3723), '1:02:03');
  assert.equal(fromClock('1:02:03'), 3723);
  assert.equal(fromClock('nope'), null);
});
