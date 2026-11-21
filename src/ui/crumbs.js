import { h } from './dom.js';
import { icon } from './icons.js';
import { PLUGINS, linkTo } from '../plugins.js';

/**
 * The breadcrumb trail at the top of every plugin's page:
 *
 *   Podcasts / STEM Voices / Season 2 · Episode 3
 *
 * The first step is the plugin (from the header), the second is the page
 * the sidebar has open (SideNav sets it), and a page adds anything deeper
 * with setCrumbs(). It is kept as the first thing in the page's main
 * column, whatever the page redraws.
 *
 * Since 0.2 (PR 8) the trail sits in a ribbon, like the mapper's top bar,
 * that is always there and always the same height (on a plugin's home page
 * too), so moving between pages never shifts the page. Its right side has
 * the tools: what the page adds with setRibbon(), the plugins this one
 * works with (only the ones this person can open), and this plugin's help.
 *
 *   setPlugin('podcasts')                      Shell does this
 *   setSection({ label, href }, { home })      SideNav does this
 *   setCrumbs([{ label, href }, { label }])    a page, for deeper steps
 *   setRibbon([element, …])                    a page's own tools, on the right
 */

/** The plugins each one works with most, offered in its ribbon. linkTo leaves out any this person can't open. */
const RELATED = {
  mapper: ['assets', 'strategy'],
  assets: ['mapper', 'strategy'],
  library: ['mapper', 'strategy'],
  strategy: ['studio', 'assets', 'pages'],
  studio: ['strategy', 'assets'],
  podcasts: ['pages', 'assets'],
  pages: ['palette', 'podcasts'],
  palette: ['strategy', 'pages'],
  org: ['pages'],
};
/** Each plugin's guide in Help. */
const HELP = { mapper: 'ecosystem-mapping', podcasts: 'podcasting', palette: 'dashboards', studio: 'studio', pages: 'public-sites', strategy: 'studio' };
let tools = [];
let plugin = null;
let section = null;
let home = false;
let tail = [];
let queued = false;
// Made on first use, so the module also loads where there is no DOM (tests, the server).
let nav = null;
let ribbon = null;
const trail = () => (nav ??= h('nav', { class: 'page-crumbs', 'aria-label': 'Breadcrumb' }));
const bar = () => (ribbon ??= h('div', { class: 'page-ribbon' }));

export function setPlugin(id) { plugin = id; queue(); }
export function setSection(item, { isHome = false } = {}) { section = item; home = isHome; tail = []; queue(); }
export function setCrumbs(list = []) { tail = list.filter(Boolean); queue(); }
export function setRibbon(list = []) { tools = [list].flat(Infinity).filter(Boolean); queue(); }

function queue() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; draw(); });
}

function draw() {
  const el = trail();
  const box = bar();
  const p = PLUGINS.find((x) => x.id === plugin);
  if (!p || p.id === 'home') { box.remove(); return; }
  // A sub-plugin's trail starts at its parent: Public Portal / Data Workbench / Dashboards.
  const parent = p.parent && PLUGINS.find((x) => x.id === p.parent);
  const steps = [...(parent ? [{ label: parent.name, href: parent.href }] : []), { label: p.name, href: p.href }];
  if (section && !(home && !tail.length)) steps.push(section);
  steps.push(...tail);
  el.replaceChildren(h('ol', {}, steps.map((s, i) => {
    const last = i === steps.length - 1;
    return h('li', {}, !last && s.href ? h('a', { href: s.href }, s.label) : h('span', { 'aria-current': last ? 'page' : null }, s.label));
  })));
  const related = (RELATED[p.id] ?? []).map((id) => {
    const q = PLUGINS.find((x) => x.id === id);
    const href = q && linkTo(id);
    return href && h('a', { class: 'ribbon-link', href, style: `--tone:${q.tone ?? 'var(--color-primary)'}`, title: `Open ${q.name}` }, icon(q.icon, 15), h('span', {}, q.name));
  }).filter(Boolean);
  const helpId = HELP[p.id] ?? HELP[p.parent];
  box.replaceChildren(el, h('div', { class: 'ribbon-tools' },
    tools,
    related.length ? h('span', { class: 'ribbon-group', role: 'group', 'aria-label': 'Works with' }, h('span', { class: 'ribbon-label' }, 'Works with'), related) : null,
    helpId ? h('a', { class: 'ribbon-help', href: `help.html#${helpId}`, title: `Help with ${p.name}`, 'aria-label': `Help with ${p.name}` }, icon('question', 16)) : null));
  place();
}

/** The page's main column: the first thing beside the sidebar. */
function column() {
  const app = document.querySelector('#app');
  const side = app?.querySelector(':scope > .side-nav');
  let next = side?.nextElementSibling;
  while (next && (next.tagName === 'DIALOG' || next.classList.contains('station-player'))) next = next.nextElementSibling;
  return next ?? null;
}
function place() {
  const el = bar();
  if (!el.childNodes.length) return;
  const col = column();
  if (!col) return;
  // A column with no gutter of its own (its content pads itself) gets the trail padded to match.
  const pad = parseFloat(getComputedStyle(col).paddingLeft) < 8;
  el.classList.toggle('pad', pad);
  if (col.firstElementChild !== el) col.prepend(el);
}

// Pages redraw their main column often; put the trail back each time.
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const watch = () => {
    const app = document.querySelector('#app');
    if (!app) return;
    new MutationObserver(() => { const el = bar(); if (el.childNodes.length && !el.isConnected) place(); else if (el.isConnected && column()?.firstElementChild !== el) place(); }).observe(app, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
}
