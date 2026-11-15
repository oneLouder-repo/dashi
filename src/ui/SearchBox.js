import { h } from './dom.js';
import { icon } from './icons.js';
import { enabledPlugins } from '../plugins.js';
import { buildIndex, search, groupById, GROUPS } from '../platform/search.js';

/**
 * The header's search: type a few words and results from every plugin drop
 * down, grouped (maps and their actors, strategy, library, assets, people,
 * podcasts, pages). Arrow keys move, Enter opens, Esc closes; Ctrl/⌘ K
 * jumps to it from anywhere. "See all results" opens search.html.
 *
 * The index is built from the org's documents the first time the box is used.
 */
let index = null;
export async function orgIndex(org) {
  if (index) return index;
  const D = await import('../platform/docs.js');
  const { loadAllMaps } = await import('../platform/maps.js');
  const plugins = new Set(enabledPlugins(org).map((p) => p.id));
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  const maps = plugins.has('mapper') ? safe(D.loadMaps) : null;
  const docs = {
    org,
    maps,
    mapContents: maps ? safe(() => loadAllMaps(maps)) ?? {} : {},
    strategy: plugins.has('strategy') ? safe(D.loadStrategy) : null,
    library: plugins.has('library') ? safe(D.loadLibrary) : null,
    assets: plugins.has('assets') ? safe(D.loadAssets) : null,
    podcasts: plugins.has('podcasts') ? safe(D.loadPodcasts) : null,
    pages: plugins.has('pages') ? safe(D.loadPages) : null,
  };
  index = buildIndex(docs, { plugins });
  return index;
}
// Something changed somewhere: build the index again next time.
if (typeof window !== 'undefined') window.addEventListener('toolbox:saved', () => { index = null; });

export const Snippet = (parts) => parts.map((p) => (p.hit ? h('mark', {}, p.t) : p.t));

export function SearchBox(org) {
  const input = h('input', { type: 'search', class: 'gs-input', placeholder: 'Search everything', 'aria-label': 'Search everything in your organisation', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'gs-results' });
  const panel = h('div', { class: 'gs-panel', id: 'gs-results', role: 'listbox', hidden: true });
  const wrap = h('div', { class: 'gs' }, icon('search', 16), input, h('kbd', { class: 'gs-kbd', 'aria-hidden': 'true' }, /Mac|iPhone/.test(navigator.platform) ? '⌘K' : 'Ctrl K'), panel);
  let rows = [];
  let at = -1;
  let timer = 0;

  const open = (on) => { panel.hidden = !on; input.setAttribute('aria-expanded', String(on)); wrap.classList.toggle('open', on); };
  async function run() {
    const q = input.value.trim();
    if (q.length < 2) { open(false); return; }
    const idx = await orgIndex(org);
    const results = search(idx, q, { limit: 400 });
    rows = [];
    at = -1;
    if (!results.length) {
      panel.replaceChildren(h('p', { class: 'gs-empty' }, `Nothing found for “${q}”.`), h('p', { class: 'gs-help' }, 'Try fewer words, ', h('code', {}, 'tag:'), ' for a tag, or ', h('code', {}, 'in:maps'), ' (or people, strategy, library, assets) for one place.'));
      open(true);
      return;
    }
    const by = new Map();
    for (const r of results) by.set(r.entry.group, [...(by.get(r.entry.group) ?? []), r]);
    const groups = GROUPS.filter((g) => by.has(g.id)).sort((a, b) => by.get(b.id)[0].score - by.get(a.id)[0].score);
    panel.replaceChildren(
      ...groups.map((g) => h('section', { class: 'gs-group' },
        h('h4', {}, icon(g.icon, 14), g.label, h('span', {}, String(by.get(g.id).length))),
        by.get(g.id).slice(0, 4).map((r) => {
          const a = h('a', { class: 'gs-row', href: r.entry.href, role: 'option', tabindex: -1 },
            h('span', { class: 'gs-ico' }, icon(r.entry.icon, 15)),
            h('span', { class: 'gs-text' },
              h('strong', {}, r.entry.title),
              h('small', {}, [r.entry.kind, r.entry.sub].filter(Boolean).join(' · ')),
              r.snippet.length ? h('span', { class: 'gs-snip' }, Snippet(r.snippet)) : null));
          rows.push(a);
          return a;
        }))),
      h('a', { class: 'gs-all', href: `search.html?q=${encodeURIComponent(q)}` }, `See all ${results.length} result${results.length === 1 ? '' : 's'} →`));
    rows.push(panel.querySelector('.gs-all'));
    open(true);
  }
  const move = (d) => {
    if (!rows.length) return;
    rows[at]?.classList.remove('on');
    at = (at + d + rows.length) % rows.length;
    rows[at].classList.add('on');
    rows[at].scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) run(); else orgIndex(org); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const target = rows[at] ?? (input.value.trim() ? { href: `search.html?q=${encodeURIComponent(input.value.trim())}` } : null);
      if (target) location.assign(target.href);
    } else if (e.key === 'Escape') { open(false); input.blur(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) open(false); });
  return wrap;
}

let keyed = false;
/** Ctrl/⌘ K focuses the header search from anywhere. */
export function wireSearchKey() {
  if (keyed) return;
  keyed = true;
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      const box = document.querySelector('.gs-input');
      if (box) { e.preventDefault(); box.focus(); box.select(); }
    }
  });
}
export { groupById };
