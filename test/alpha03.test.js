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

test('the Social Media Integrator fits a post to each network and pretends to push it', async () => {
  const { textFor, problemsFor, mockPush, totalStats, duePosts, migrateSocial } = await import('../src/platform/social.js');
  const settings = { hashtags: ['KestrelBay'], signoff: 'Give local.' };
  const post = { id: 'p1', kind: 'note', text: 'x'.repeat(290), media: null, networks: ['bluesky', 'instagram', 'linkedin'], perNetwork: {} };
  assert.match(textFor(post, 'bluesky', settings), /Give local\.\n\n#KestrelBay$/);
  assert.doesNotMatch(textFor(post, 'linkedin', settings), /#KestrelBay/);
  assert.match(problemsFor(post, 'bluesky', settings)[0], /too long for Bluesky/);
  assert.ok(problemsFor(post, 'instagram', settings).some((p) => /needs a picture/.test(p)));
  post.perNetwork.bluesky = { text: 'Short and sweet.' };
  assert.deepEqual(problemsFor(post, 'bluesky', settings), []);
  const a = mockPush(post, 'bluesky', { handle: '@kb' }, '2026-11-01T12:00:00Z');
  assert.equal(a.mock, true);
  assert.match(a.permalink, /^https:\/\/bsky\.example\/profile\/kb\/post\//);
  assert.deepEqual(mockPush(post, 'bluesky', { handle: '@kb' }, '2026-11-01T12:00:00Z').permalink, a.permalink);
  assert.ok(totalStats({ results: { bluesky: a } }).views > 0);
  const doc = migrateSocial({ posts: { s: { id: 's', status: 'scheduled', scheduledAt: '2026-11-20T10:00:00Z' }, t: { id: 't', status: 'scheduled', scheduledAt: '2026-12-20T10:00:00Z' } } });
  assert.deepEqual(duePosts(doc, new Date('2026-11-21')).map((p) => p.id), ['s']);
});

test('Kestrel Bay is a big client org: every plugin, overlapping plans, three sites and a busy queue', async () => {
  const { CLIENT_ORGS } = await import('../src/platform/clients/index.js');
  const spec = CLIENT_ORGS.find((o) => o.id === 'org-kestrel');
  assert.equal(spec.plan, 'custom');
  const { docs, files } = spec.bundle();
  assert.ok(Object.keys(docs.org.staff).length >= 30 && Object.keys(docs.org.staff).length <= 40);
  assert.equal(Object.keys(docs).filter((k) => k.startsWith('map/')).length, 3);
  const plans = Object.values(docs.strategy.nodes).filter((n) => n.type === 'plan');
  assert.equal(plans.length, 2);
  const [old, next] = plans.sort((x, y) => x.start.localeCompare(y.start));
  assert.ok(old.end > next.start, 'the three-year plan overlaps the five-year plan');
  assert.ok(Object.values(docs.org.plugins).every(Boolean));
  assert.deepEqual(Object.keys(docs.org.sites).sort(), ['site-board', 'site-data', 'site-main']);
  assert.equal(docs.org.sites['site-main'].home.kind, 'page');
  assert.ok(Object.values(docs.podcasts.episodes).length > 40);
  assert.ok(docs.podcasts.station.featuredEpisodes.length >= 3);
  const statuses = Object.values(docs.social.posts).map((p) => p.status);
  for (const s of ['posted', 'scheduled', 'draft']) assert.ok(statuses.includes(s), s);
  assert.ok(Object.values(docs.library.items).some((i) => i.tags?.includes('minutes')));
  assert.ok(files.length > 0);
});

test('the systems-change lenses run green (macro) through yellow to red (micro)', async () => {
  const { zoneColours } = await import('../src/display/LensView.js');
  const { SYSTEMS } = await import('../src/ui/wheel.js');
  const { readFileSync } = await import('node:fs');
  const lens = (id) => JSON.parse(readFileSync(new URL(`../src/lenses/${id}.json`, import.meta.url)));
  const mmm = zoneColours(lens('micro-meso-macro'));
  assert.equal(mmm.get('micro'), SYSTEMS.red[0]);
  assert.equal(mmm.get('meso'), SYSTEMS.yellow[0]);
  assert.equal(mmm.get('macro'), SYSTEMS.green[0]);
  const spheres = zoneColours(lens('spheres-of-systems-change'));
  assert.equal(spheres.get('internal'), SYSTEMS.red[0]);
  assert.ok(SYSTEMS.green.includes(spheres.get('cultural')));
  assert.equal(zoneColours(lens('water-of-systems-change')).get('structural'), SYSTEMS.green[0]);
});

test('an asset can wear a library photo, and Kestrel Bay has photos on over half its assets', async () => {
  const { gatherAssets, blankAssets } = await import('../src/platform/assetHub.js');
  const hub = blankAssets();
  hub.items.a = { id: 'a', kind: 'ref', ref: { type: 'staff', id: 's1' }, tags: [], collectionIds: [], photoId: 'john-lee-omne' };
  const [card] = gatherAssets(hub, { org: { staff: { s1: { id: 's1', name: 'Sam' } } } });
  assert.equal(card.photoId, 'john-lee-omne');
  assert.match(card.thumb, /john-lee-omne-thumb\.jpg$/);
  const { kestrelBundle } = await import('../src/platform/clients/kestrel.js');
  const d = kestrelBundle().docs;
  const mapContents = Object.fromEntries(Object.keys(d).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), d[k]]));
  const cards = gatherAssets(d.assets, { maps: d.maps, mapContents, org: d.org, library: d.library, podcasts: d.podcasts });
  const pictured = cards.filter((c) => c.photoId || c.source === 'episode').length / cards.length;
  assert.ok(pictured >= 0.5 && pictured <= 0.6, `pictured ${pictured}`);
  assert.equal(cards.filter((c) => c.missing).length, 0);
  assert.equal(Object.keys(d.studio.toc).length, 0, 'a blank theory of change');
});
