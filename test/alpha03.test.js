import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatherAssets, blankAssets } from '../src/platform/assetHub.js';
import { podcastRoute, blankPodcasts } from '../src/platform/podcasts.js';

test('studio audio files show in Assets as their own kind', () => {
  const podcasts = blankPodcasts();
  podcasts.files.aud1 = { id: 'aud1', name: 'Music bed', mediaId: 'm1', duration: 4, size: 1000, type: 'audio/wav', origin: 'import', tags: ['bed'] };
  const cards = gatherAssets(blankAssets(), { podcasts });
  const card = cards.find((c) => c.key === 'audio:aud1');
  assert.ok(card);
  assert.equal(card.source, 'audio');
  assert.equal(card.file.mediaId, 'm1');
  assert.deepEqual(card.tagsFrom, ['bed']);
});

test('#studio/files routes to the audio files page', () => {
  const r = podcastRoute('#studio/files', blankPodcasts());
  assert.equal(r.scope, 'studio');
  assert.equal(r.page, 'files');
  assert.equal(r.projectId, null);
});

test('podBeam opens zips, matches names loosely and reads mp3 lengths', async () => {
  const { unzipEntries, nameKey, mp3Duration } = await import('../server/podBeam.js');
  const { zipBytes } = await import('../src/core/zip.js');
  const { readFileSync } = await import('node:fs');
  const { deflateRawSync } = await import('node:zlib');
  // Stored entries, from Dashi's own zip writer.
  const zip = Buffer.from(await zipBytes([{ name: 'SJR/show one.mp3', data: 'abc' }, { name: 'readme.txt', data: 'hi' }, { name: '__MACOSX/._show one.mp3', data: 'x' }]));
  const got = unzipEntries(zip, (n) => /\.mp3$/.test(n));
  assert.deepEqual(got.map((e) => [e.name, e.bytes.toString()]), [['SJR/show one.mp3', 'abc']]);
  // A deflated entry, laid out by hand.
  const data = Buffer.from('hello hello hello hello');
  const comp = deflateRawSync(data);
  const name = Buffer.from('a.mp3');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdAt = 30 + name.length + comp.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(cdAt, 16);
  const deflated = unzipEntries(Buffer.concat([local, name, comp, central, name, end]));
  assert.equal(deflated[0].bytes.toString(), data.toString());
  assert.equal(nameKey('SJR-S14-E9-AI DATA CENTER.mp3'), nameKey('sjr s14 e9 ai data center.MP3'));
  assert.notEqual(nameKey('SJR-S14-E9.mp3'), nameKey('SJR-S14-E8.mp3'));
  const secs = mp3Duration(readFileSync(new URL('../media/podcasts/land-learning-1.mp3', import.meta.url)));
  assert.ok(secs >= 29 && secs <= 31, `about 30 seconds, got ${secs}`);
});

test('the colour wheel gives harmonies, snaps colours and picks readable ink', async () => {
  const { scheme, snap, inkOn, WHEEL, INK } = await import('../src/ui/wheel.js');
  assert.equal(WHEEL.length, 12);
  assert.deepEqual(scheme('triadic', 'orange', 3), ['#ef7f2d', '#c77deb', '#4da65c']);
  assert.deepEqual(scheme('complementary', 'yellow', 2), ['#f7c744', '#c77deb']);
  assert.equal(scheme('square', 'yellow', 4).length, 4);
  assert.equal(snap('#3d63dd'), '#2c4fa3');
  assert.equal(snap('#888888'), '#888888');
  assert.equal(inkOn('#f7c744'), INK);
  assert.equal(inkOn('#2c4fa3'), '#ffffff');
});

test('the station features published episodes in order, up to seven', async () => {
  const { featuredEpisodes } = await import('../src/platform/podcasts.js');
  const ep = (id, status = 'published') => ({ id, podcastId: 'p', status, publishedAt: '2026-01-01', title: id });
  const doc = { podcasts: { p: { id: 'p' } }, episodes: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => [x, ep(x)])), station: {} };
  doc.episodes.c.status = 'draft';
  doc.station.featuredEpisodes = ['b', 'c', 'a', 'gone', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ episodeId: id, blurb: `why ${id}` }));
  const got = featuredEpisodes(doc, '2026-11-21');
  assert.deepEqual(got.map((f) => f.episode.id), ['b', 'a', 'd', 'e', 'f', 'g', 'h']);
  assert.equal(got[0].blurb, 'why b');
});
