import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/platform/assetHub.js';
import { STYLES, referenceList, toBibtex, toRis } from '../src/platform/citeStyles.js';
import { parseBibtex, parseRis, runsToText } from '../src/platform/library.js';
import { sniffDocument } from '../server/uploads.js';

const docs = {
  org: { staff: { s1: { id: 's1', name: 'Amara Okafor', title: 'Director' } } },
  maps: { maps: { m1: { title: 'North shore', updatedAt: '2026-01-01' } } },
  mapContents: { m1: { actors: { a1: { id: 'a1', label: 'Food bank', kind: 'actor', category: 'resource', meta: { description: 'Weekly hampers' } }, a2: { id: 'a2', label: 'Elder council', kind: 'agent' } } } },
  library: { items: { l1: { id: 'l1', kind: 'ref', meta: { title: 'Building communities' }, tags: ['abcd'] } } },
};

test('the asset manager gathers its own items and live Dashi things into one list', () => {
  const hub = A.migrateAssets(A.blankAssets());
  A.newItem(hub, { kind: 'file', title: 'Workshop photo', file: { mediaId: 'x', name: 'photo.jpg', size: 2048, type: 'image/jpeg' }, tags: ['north'] });
  A.newItem(hub, { kind: 'link', title: 'Toolkit', url: 'https://example.org' });
  const cards = A.gatherAssets(hub, docs, { plugins: new Set(['mapper', 'library']) });
  const by = (key) => cards.find((c) => c.key === key);
  assert.equal(cards.length, 2 + 1 + 2 + 1 + 1, 'two own items, a map, two actors, a person, a library item');
  assert.equal(by('map:m1').title, 'North shore');
  assert.equal(by('actor:m1/a1').abcd, 'economic', 'a resource actor starts as an economic asset');
  assert.equal(by('actor:m1/a2').abcd, 'individual', 'agents are individuals');
  assert.equal(by('staff:s1').abcd, 'individual');
  assert.equal(by('library:l1').tagsFrom[0], 'abcd');
  assert.equal(cards.find((c) => c.source === 'upload').group, 'image');
  // Without the mapper plugin, maps and actors stay out.
  assert.equal(A.gatherAssets(hub, docs, { plugins: new Set(['library']) }).filter((c) => c.source === 'map' || c.source === 'actor').length, 0);
});

test('notes and collections on a Dashi thing live in a ref item, and survive it being removed', () => {
  const hub = A.migrateAssets(A.blankAssets());
  const card = A.gatherAssets(hub, docs).find((c) => c.key === 'actor:m1/a1');
  const it = A.ensureItem(hub, card, 's1');
  it.tags.push('food');
  it.abcd = 'association';
  const again = A.gatherAssets(hub, docs).find((c) => c.key === 'actor:m1/a1');
  assert.deepEqual(again.tags, ['food']);
  assert.equal(again.abcd, 'association', 'the user’s choice beats the guess');
  assert.equal(A.ensureItem(hub, again), it, 'one item per thing');
  const gone = A.gatherAssets(hub, { ...docs, mapContents: { m1: { actors: {} } } }).find((c) => c.key === 'actor:m1/a1');
  assert.ok(gone.missing);
  assert.deepEqual(A.refOfKey('actor:m1/a1'), { type: 'actor', id: 'a1', mapId: 'm1' });
  assert.equal(A.keyOf({ type: 'map', id: 'm1' }), 'map:m1');
});

test('collections nest, tags count, and the search box understands tag:, type: and abcd:', () => {
  const hub = A.migrateAssets(A.blankAssets());
  hub.collections = { c1: { id: 'c1', name: 'Partners' }, c2: { id: 'c2', name: 'North', parentId: 'c1' }, c3: { id: 'c3', name: 'Deep', parentId: 'c2' }, c4: { id: 'c4', name: 'Other' } };
  assert.deepEqual([...A.collectionTree(hub, 'c1')].sort(), ['c1', 'c2', 'c3']);
  const cards = A.gatherAssets(hub, docs);
  const tagged = [{ ...cards[0], tags: ['North', 'food'] }, { ...cards[1], tags: ['north'] }];
  assert.deepEqual(A.tagCounts(tagged)[0], { tag: 'north', n: 2 });
  assert.deepEqual(A.searchCards(cards, 'abcd:econ').map((c) => c.key), ['actor:m1/a1']);
  assert.deepEqual(A.searchCards(cards, 'type:person').map((c) => c.key), ['staff:s1']);
  assert.deepEqual(A.searchCards(cards, 'hampers').map((c) => c.key), ['actor:m1/a1']);
  assert.deepEqual(A.searchCards(cards, 'tag:abc').map((c) => c.key), ['library:l1']);
  assert.equal(A.prettySize(1536), '2 KB');
  assert.equal(A.prettySize(5 * 1048576), '5.0 MB');
});

test('uploads to the asset manager are checked by their first bytes, and web pages are refused', () => {
  assert.ok(sniffDocument(Buffer.from('%PDF-1.7 ...'), 'paper.pdf'));
  assert.equal(sniffDocument(Buffer.from('<html><script>alert(1)</script>'), 'notes.txt'), null);
  assert.equal(sniffDocument(Buffer.from('not a pdf'), 'fake.pdf'), null);
  const mp4 = Buffer.alloc(16); mp4.write('ftypisom', 4, 'latin1');
  assert.ok(sniffDocument(mp4, 'clip.mp4'));
  assert.equal(sniffDocument(Buffer.from('<svg onload=x>'), 'logo.svg'), null, 'SVG is not an accepted type');
});

const article = { type: 'article-journal', title: 'Mapping community assets', creators: [{ role: 'author', family: 'Okafor', given: 'Amara B.' }, { role: 'author', family: 'Lee', given: 'Jin' }], issued: '2021-03', containerTitle: 'Journal of Community Practice', volume: '29', issue: '2', page: '113-130', DOI: '10.1080/1234' };
const book = { type: 'book', title: 'Building communities from the inside out', creators: [{ role: 'author', family: 'Kretzmann', given: 'John P.' }, { role: 'author', family: 'McKnight', given: 'John L.' }], issued: '1993', publisher: 'ACTA Publications', publisherPlace: 'Chicago' };

test('Chicago, MLA and Harvard references and citations', () => {
  const t = (style, meta) => runsToText(STYLES[style].reference(meta));
  assert.equal(t('chicago', article), 'Okafor, Amara B., and Jin Lee. 2021. “Mapping community assets.” Journal of Community Practice 29 (2): 113–130. https://doi.org/10.1080/1234.');
  assert.equal(t('mla', article), 'Okafor, Amara B., and Jin Lee. “Mapping community assets.” Journal of Community Practice, vol. 29, no. 2, 2021, pp. 113–130, https://doi.org/10.1080/1234.');
  assert.equal(t('harvard', book), 'Kretzmann, J.P. and McKnight, J.L. (1993) Building communities from the inside out. Chicago: ACTA Publications.');
  assert.equal(STYLES.chicago.citation(article, { page: '14' }), '(Okafor and Lee 2021, 14)');
  assert.equal(STYLES.mla.citation(article, { page: '14' }), '(Okafor and Lee 14)');
  assert.equal(STYLES.harvard.citation(article), '(Okafor and Lee, 2021)');
  assert.equal(STYLES.apa.citation(article, { page: '14' }), '(Okafor & Lee, 2021, p. 14)');
  // Titles of whole works are italic, articles in quotes.
  assert.ok(STYLES.mla.reference(book).some((r) => r.i && r.t.startsWith('Building')));
  assert.deepEqual(referenceList('mla', [article, book]).map((r) => r[0].t.slice(0, 6)), ['Kretzm', 'Okafor']);
});

test('BibTeX and RIS exports read back in with the same details', () => {
  const items = [{ id: 'a', meta: article, tags: ['abcd'] }, { id: 'b', meta: book, tags: [] }];
  const bib = toBibtex(items);
  assert.match(bib, /@article\{okafor2021mapping,/);
  assert.match(bib, /pages = \{113--130\}/);
  const back = parseBibtex(bib);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, article.title);
  assert.equal(back[0].creators.length, 2);
  assert.equal(back[1].publisher, 'ACTA Publications');
  const ris = parseRis(toRis(items));
  assert.equal(ris[0].containerTitle, article.containerTitle);
  assert.equal(ris[0].issued, '2021-03');
  assert.deepEqual(ris[0].keywords, ['abcd']);
  assert.equal(ris[1].type, 'book');
});
