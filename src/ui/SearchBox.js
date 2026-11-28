import { h } from './dom.js';
import { icon } from './icons.js';
import { enabledPlugins } from '../plugins.js';
import { buildIndex, buildHelpIndex, search, groupById, GROUPS } from '../platform/search.js';

/**
 * The header's search: type a few words and results from every plugin drop
 * down, grouped (maps and their actors, strategy, library, assets, people,
 * podcasts, pages). Arrow keys move, Enter opens, Esc closes; Ctrl/⌘ K
 * jumps to it from anywhere. "See all results" opens search.html.
 *
 * The index is built from the org's documents the first time the box is used.
 * Help pages are searched too, from a separate index (helpIndex) that never
 * touches the org's documents; their results always come last.
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
let helpIdx = null;
/** The help library's own index, apart from the org's (see buildHelpIndex). */
export async function helpIndex() {
  if (helpIdx) return helpIdx;
  try {
    const { loadHelp } = await import('../platform/help.js');
    helpIdx = buildHelpIndex((await loadHelp()).doc);
  } catch { helpIdx = []; }
  return helpIdx;
}
/** Org results and help results for one query, kept as two lists. */
export async function searchAll(org, q, { limit = 400 } = {}) {
  const [idx, hidx] = await Promise.all([orgIndex(org), helpIndex()]);
  return { results: search(idx, q, { limit }), help: search(hidx, q, { limit }) };
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
    const { results, help } = await searchAll(org, q);
    rows = [];
    at = -1;
    if (!results.length && !help.length) {
      panel.replaceChildren(h('p', { class: 'gs-empty' }, `Nothing found for “${q}”.`), h('p', { class: 'gs-help' }, 'Try fewer words, ', h('code', {}, 'tag:'), ' for a tag, or ', h('code', {}, 'in:maps'), ' (or people, strategy, library, assets, help) for one place.'));
      open(true);
      return;
    }
    const by = new Map();
    for (const r of results) by.set(r.entry.group, [...(by.get(r.entry.group) ?? []), r]);
    const groups = GROUPS.filter((g) => !g.separate && by.has(g.id)).sort((a, b) => by.get(b.id)[0].score - by.get(a.id)[0].score);
    // Help always comes last, in a group of its own.
    if (help.length) { by.set('help', help); groups.push(groupById.help); }
    const total = results.length + help.length;
    panel.replaceChildren(
      ...groups.map((g) => h('section', { class: `gs-group${g.separate ? ' gs-help-group' : ''}` },
        h('h4', {}, icon(g.icon, 14), g.label, h('span', {}, String(by.get(g.id).length))),
        by.get(g.id).slice(0, g.separate ? 3 : 4).map((r) => {
          const a = h('a', { class: 'gs-row', href: r.entry.href, role: 'option', tabindex: -1 },
            h('span', { class: 'gs-ico' }, icon(r.entry.icon, 15)),
            h('span', { class: 'gs-text' },
              h('strong', {}, r.entry.title),
              h('small', {}, [r.entry.kind, r.entry.sub].filter(Boolean).join(' · ')),
              r.snippet.length ? h('span', { class: 'gs-snip' }, Snippet(r.snippet)) : null));
          rows.push(a);
          return a;
        }))),
      h('a', { class: 'gs-all', href: `search.html?q=${encodeURIComponent(q)}` }, `See all ${total} result${total === 1 ? '' : 's'} →`));
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
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) run(); else { orgIndex(org); helpIndex(); } });
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
