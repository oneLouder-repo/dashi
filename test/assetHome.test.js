import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeOf } from '../src/platform/assetHub.js';

test('every asset has a home, so the asset map never needs “Not filed”', () => {
  assert.equal(homeOf({ source: 'episode', sub: 'The Bay Today' }), 'The Bay Today');
  assert.equal(homeOf({ source: 'episode' }), 'Podcast episodes');
  assert.equal(homeOf({ source: 'library' }), 'Library');
  assert.equal(homeOf({ source: 'audio' }), 'Studio audio');
  assert.equal(homeOf({ source: 'actor', sub: 'Community partners' }), 'Community partners');
  assert.equal(homeOf({ source: 'staff' }), 'Staff');
  assert.equal(homeOf({ source: 'upload' }), 'Uploaded files');
  assert.equal(homeOf({ source: 'story' }), 'Story cards');
  assert.equal(homeOf({ source: 'map', missing: true }), 'Removed elsewhere');
});
