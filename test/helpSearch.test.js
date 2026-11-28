import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, buildHelpIndex, search } from '../src/platform/search.js';
import { HELP_SEED } from '../src/help/library.js';

test('help search finds tutorials and links to the page', () => {
  const idx = buildHelpIndex(HELP_SEED);
  const r = search(idx, 'bluesky app password');
  assert.ok(r.length);
  assert.equal(r[0].entry.group, 'help');
  assert.match(r[0].entry.href, /^help\.html#new-in-0-4\/social-posting$/);
  assert.ok(!r[0].entry.text.includes('[['), 'shortcodes are stripped');
});

test('in:help narrows to help, and the org index never holds help', () => {
  const idx = buildHelpIndex(HELP_SEED);
  assert.ok(search(idx, 'plan file in:help').length);
  assert.equal(search(idx, 'plan file in:maps').length, 0);
  const org = buildIndex({ org: { staff: {} } });
  assert.equal(org.filter((e) => e.group === 'help').length, 0);
});
