import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGINS, PAGES, linkTo } from '../src/plugins.js';

/**
 * Alpha 0.2: no page hard-codes another plugin's address. A link into a
 * plugin goes through linkTo(), which leaves it out for someone who can't
 * use that plugin, so menus and links never lead into a closed plugin.
 * A plugin may link to its own pages and to its parent's.
 */
const PAGE_OF = Object.fromEntries([...PLUGINS.filter((p) => !p.installed && !p.core).map((p) => [p.href.replace('.html', ''), p.id]), ...Object.entries(PAGES).map(([k, v]) => [k, v.plugin])]);
// Which plugin each source folder (or file) belongs to; anything else is shared and may link nowhere directly.
const OWN = { 'src/mapper.js': 'mapper', 'src/assets': 'assets', 'src/strategy': 'strategy', 'src/plandoc': 'strategy', 'src/studio': 'studio', 'src/palette': 'palette', 'src/podcasts': 'podcasts', 'src/library': 'library', 'src/sites': 'pages' };
const ownerOf = (file) => Object.entries(OWN).find(([k]) => file === k || file.startsWith(`${k}/`))?.[1] ?? null;
const lineage = (id) => { const out = []; for (let p = PLUGINS.find((x) => x.id === id); p; p = PLUGINS.find((x) => x.id === p.parent)) out.push(p.id); return out; };

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) yield* files(f);
    else if (f.endsWith('.js')) yield f;
  }
}

test('no page hard-codes another plugin’s address', () => {
  const pages = Object.keys(PAGE_OF).join('|');
  const raw = new RegExp(`['\`"](${pages})\\.html`, 'g');
  const bad = [];
  for (const f of files('src')) {
    if (f === join('src', 'plugins.js')) continue;
    const mine = lineage(ownerOf(f.split('\\').join('/')));
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(raw)) if (!mine.includes(PAGE_OF[m[1]])) bad.push(`${f}:${i + 1} ${m[0]}.html`);
    });
  }
  assert.deepEqual(bad, [], 'use linkTo(plugin, route) for these');
});

test('linkTo leaves out a plugin the person can’t use', () => {
  const org = { plugins: { palette: false }, pluginRoles: { podcasts: { staff: false } }, pluginPeople: { mapper: { 's-1': false } }, staff: {} };
  assert.equal(linkTo('pages', '#look', org), 'pages.html#look');
  assert.equal(linkTo('palette', '#dashboards', org), null, 'off for the org');
  assert.equal(linkTo('plandoc', '#x', { plugins: { strategy: false } }), null, 'the Plan designer goes with Strategy & Work');
  assert.equal(linkTo('studio', '', { plugins: { strategy: false } }), null, 'a sub-plugin goes with its parent');
});

test('alpha 0.2 consolidations: one place for each major interaction', async () => {
  const { topOf } = await import('../src/plugins.js');
  assert.equal(topOf('studio'), 'strategy', 'Planning Studio is inside Strategy & Work');
  assert.equal(topOf('palette'), 'pages', 'the Data Workbench is inside the Public Portal');
  assert.equal(topOf('library'), 'assets', 'the Library is inside Assets');
  assert.equal(PLUGINS.find((p) => p.id === 'assets').name, 'Assets');
  assert.equal(linkTo('palette', '#dashboards', { plugins: { pages: false } }), null, 'no Portal, no Workbench');
  assert.equal(linkTo('library', '', { plugins: { assets: false } }), null, 'no Assets, no Library');
});
