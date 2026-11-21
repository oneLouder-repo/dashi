import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedPodcasts, migratePodcasts, podcastRoute, episodeHref, seriesHref } from '../src/platform/podcasts.js';

const doc = migratePodcasts(seedPodcasts());

test('the episode list is home, and anything unknown lands there', () => {
  assert.deepEqual(podcastRoute('', doc), { scope: 'episodes', seriesId: null, base: 'episodes', tray: null });
  assert.equal(podcastRoute('#nowhere/at-all', doc).base, 'episodes');
  assert.equal(podcastRoute('#series/gone', doc).base, 'episodes');
});

test('an episode, its form and a series’ settings open as trays over the page behind', () => {
  assert.deepEqual(podcastRoute('#episodes/ep-sv-1', doc).tray, { kind: 'episode', id: 'ep-sv-1' });
  assert.deepEqual(podcastRoute('#series/pod-stem-voices/ep-sv-1/edit', doc), { scope: 'series', seriesId: 'pod-stem-voices', base: 'series/pod-stem-voices', tray: { kind: 'edit', id: 'ep-sv-1' } });
  assert.deepEqual(podcastRoute('#series/pod-stem-voices/settings', doc).tray, { kind: 'settings', id: 'pod-stem-voices' });
  assert.deepEqual(podcastRoute('#station/new', doc), { scope: 'station', seriesId: null, base: 'station', tray: { kind: 'new', id: null } });
  assert.equal(podcastRoute('#episodes/settings', doc).tray, null, 'only a series has settings');
  assert.equal(podcastRoute('#episodes/no-such-episode', doc).tray, null);
});

test('older addresses (#<series>/<episode>) still land in the right place', () => {
  const r = podcastRoute('#pod-stem-voices/ep-sv-2', doc);
  assert.equal(r.base, 'series/pod-stem-voices');
  assert.deepEqual(r.tray, { kind: 'episode', id: 'ep-sv-2' });
  assert.equal(podcastRoute('#pod-land/settings', doc).tray.kind, 'settings');
});

test('links into Podcasts use the new addresses, and episodes can credit guests', () => {
  assert.equal(episodeHref(doc.episodes['ep-sv-1']), 'podcasts.html#episodes/ep-sv-1');
  assert.equal(seriesHref(doc.podcasts['pod-land']), 'podcasts.html#series/pod-land');
  assert.ok(Object.values(doc.episodes).every((e) => Array.isArray(e.guests)));
});
