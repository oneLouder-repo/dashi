import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { searchAll, Snippet } from '../ui/SearchBox.js';
import { loadOrg } from '../platform/docs.js';
import { GROUPS } from '../platform/search.js';

/**
 * search.html?q=<words>[&in=<group>]: every result for a search, across the
 * organisation's plugins, with a filter for each place. Help pages come
 * last, from their own index, under "From Dashi's help".
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'search', org });
const app = document.querySelector('#app');
app.classList.add('sr');

const params = () => new URLSearchParams(location.search);
const input = h('input', { class: 'input sr-input', type: 'search', placeholder: 'Search maps, plans, readings, assets, people, help…', value: params().get('q') ?? '', 'aria-label': 'Search' });
const filters = h('div', { class: 'sr-filters', role: 'group', 'aria-label': 'Where' });
const list = h('div', { class: 'sr-list' });
app.replaceChildren(h('div', { class: 'page sr-page' },
  h('h1', {}, 'Search'),
  h('form', { class: 'sr-form', onsubmit: (e) => { e.preventDefault(); go({ q: input.value.trim(), in: params().get('in') }); } }, icon('search', 18), input, h('button', { class: 'btn btn-primary btn-sm' }, 'Search')),
  h('p', { class: 'muted small' }, 'Words must all appear. Narrow with ', h('code', {}, 'tag:north'), ' or ', h('code', {}, '#north'), ' for a tag, and ', h('code', {}, 'in:maps'), ' for one place (or ', h('code', {}, 'in:help'), ' for help only).'),
  filters, list));

function go(p) {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v));
  history.replaceState(null, '', `search.html?${q}`);
  draw();
}

async function draw() {
  const q = params().get('q') ?? '';
  const where = params().get('in');
  document.title = q ? `${q} · Search · Dashi` : 'Search · Dashi';
  if (!q.trim()) { filters.replaceChildren(); list.replaceChildren(h('p', { class: 'muted' }, 'Type a few words to search everything your organisation keeps in Dashi.')); return; }
  const { results, help } = await searchAll(org, q, { limit: 1000 });
  const all = [...results, ...help];
  const shown = where ? all.filter((r) => r.entry.group === where) : all;
  const count = (g) => all.filter((r) => r.entry.group === g).length;
  filters.replaceChildren(
    h('button', { type: 'button', class: `sr-chip${!where ? ' on' : ''}`, onclick: () => go({ q }) }, 'Everything', h('span', {}, String(all.length))),
    ...GROUPS.filter((g) => count(g.id)).map((g) => h('button', { type: 'button', class: `sr-chip${where === g.id ? ' on' : ''}`, onclick: () => go({ q, in: g.id }) }, icon(g.icon, 14), g.label, h('span', {}, String(count(g.id))))));
  const row = (r) => h('a', { class: 'sr-row', href: r.entry.href },
    h('span', { class: 'gs-ico' }, icon(r.entry.icon, 17)),
    h('span', { class: 'sr-text' },
      h('strong', {}, r.entry.title),
      h('small', {}, [r.entry.kind, r.entry.sub].filter(Boolean).join(' · ')),
      r.snippet.length ? h('span', { class: 'sr-snip' }, Snippet(r.snippet)) : null,
      r.entry.tags.length ? h('span', { class: 'sr-tags' }, r.entry.tags.slice(0, 5).map((t) => h('span', {}, `#${t}`))) : null));
  const mine = shown.filter((r) => r.entry.group !== 'help');
  const helps = shown.filter((r) => r.entry.group === 'help');
  list.replaceChildren(...(shown.length
    ? [...mine.map(row), helps.length && mine.length ? h('h2', { class: 'sr-divider' }, icon('help', 15), 'From Dashi’s help') : null, ...helps.map(row)]
    : [h('p', { class: 'muted' }, `Nothing found for “${q}”.`)]));
}
draw();
input.focus();
