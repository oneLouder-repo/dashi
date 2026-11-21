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
