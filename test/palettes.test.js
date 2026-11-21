import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normHex, hexToHsl, hslToHex, contrast, readability, readableOn, setColour, problems, customFrom, brandPalette } from '../src/platform/palettes.js';
import { themeLabel, isCustomTheme } from '../src/platform/themes.js';
import { splitBlocks, joinBlocks } from '../src/designer/BlockEditor.js';
import { stationTheme } from '../src/platform/podcasts.js';

test('palette sums: hex, HSL and contrast', () => {
  assert.equal(normHex('ABC'), '#aabbcc');
  assert.equal(normHex('#12345g'), null);
  assert.deepEqual(hexToHsl('#ff0000'), [0, 100, 50]);
  assert.equal(hslToHex([0, 100, 50]), '#ff0000');
  // Round trips stay within a step.
  for (const hex of ['#9b1d3a', '#0f8a5f', '#fffaf4', '#2a2130']) {
    const back = hslToHex(hexToHsl(hex));
    assert.ok(contrast(back, hex) < 1.05, `${hex} → ${back}`);
  }
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(readability('#ffffff', '#9b1d3a').ok, true);
  assert.equal(readability('#ffffff', '#ffe066').ok, false);
});

test('a colour keeps readable text on it', () => {
  for (const bg of ['#0f8a5f', '#ffe066', '#1d2230', '#e8a317', '#ffffff']) assert.ok(readability(readableOn(bg), bg).ok, bg);
  // A dark main colour with dark text: the text follows.
  const next = setColour({ primary: '#9b1d3a', 'primary-content': '#ffffff' }, 'primary', '#ffe066');
  assert.ok(readability(next['primary-content'], next.primary).ok);
  // Text the person chose that still reads is kept.
  const kept = setColour({ primary: '#0f8a5f', 'primary-content': '#ffffff' }, 'primary', '#0b6e4b');
  assert.equal(kept['primary-content'], '#ffffff');
  // The page colour brings its quieter tones along.
  const page = setColour({}, 'base-100', '#fffaf4');
  assert.ok(page['base-200'] && page['base-300'] && page['base-content']);
  assert.deepEqual(problems({ primary: '#ffe066', 'primary-content': '#ffffff' }).map((p) => p.bg), ['primary']);
});

test('adjusting a preset makes a custom theme that remembers where it started', () => {
  const t = customFrom('emerald', { primary: '#66cc8a' }, { palette: 'emerald', shape: 'squared' });
  assert.equal(isCustomTheme(t), true);
  assert.equal(t.shape, 'squared');
  assert.equal(themeLabel(t), 'Emerald, adjusted');
  assert.equal(themeLabel({ palette: 'emerald' }), 'Emerald');
  assert.equal(themeLabel({ palette: 'custom', base: 'light', colors: {} }), 'Your own');
  const b = brandPalette('SJR green', t);
  assert.equal(b.name, 'SJR green');
  assert.deepEqual(b.colors, t.colors);
});

test('the station wears its own colours, or the site’s, always in the site’s shape', () => {
  const org = { palette: 'corporate', shape: 'flat' };
  assert.equal(stationTheme({ look: {} }, org), org);
  const own = stationTheme({ look: { theme: { palette: 'custom', base: 'dim', colors: { primary: '#9b1d3a' } } } }, org);
  assert.equal(own.base, 'dim');
  assert.equal(own.shape, 'flat');
});

test('page bodies split into blocks and join back', () => {
  const body = '## Who we are\n\nWe make radio.\n\n\n- one\n- two\n\n[[dashboard:d1]]';
  const blocks = splitBlocks(body);
  assert.deepEqual(blocks, ['## Who we are', 'We make radio.', '- one\n- two', '[[dashboard:d1]]']);
  assert.equal(joinBlocks(blocks), '## Who we are\n\nWe make radio.\n\n- one\n- two\n\n[[dashboard:d1]]');
  assert.deepEqual(splitBlocks(''), []);
});
