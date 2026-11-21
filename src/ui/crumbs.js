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
 * the tools: what the page adds with setRibbon(), and the plugins this one
 * works with (only the ones this person can open). Help lives in the top
 * bar only (PR 10), so the ribbon has no help button of its own.
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
  graph: ['assets', 'mapper', 'strategy'],
  strategy: ['studio', 'assets', 'pages'],
  studio: ['strategy', 'assets'],
  podcasts: ['pages', 'assets'],
  pages: ['palette', 'podcasts'],
  palette: ['strategy', 'pages'],
  org: ['pages'],
};
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
  box.replaceChildren(el, h('div', { class: 'ribbon-tools' }, tools, worksWith(p.id)));
  place();
}

/** The "Works with" links for a plugin: the ones it works with most that this person can open. The mapper's top bar uses it too. */
export function worksWith(id) {
  const related = (RELATED[id] ?? []).map((rid) => {
    const q = PLUGINS.find((x) => x.id === rid);
    const href = q && linkTo(rid);
    return href && h('a', { class: 'ribbon-link', href, style: `--tone:${q.tone ?? 'var(--color-primary)'}`, title: `Open ${q.name}` }, icon(q.icon, 15), h('span', {}, q.name));
  }).filter(Boolean);
  return related.length ? h('span', { class: 'ribbon-group', role: 'group', 'aria-label': 'Works with' }, h('span', { class: 'ribbon-label' }, 'Works with'), related) : null;
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
  const cs = getComputedStyle(col);
  const [pt, pl, pr] = [cs.paddingTop, cs.paddingLeft, cs.paddingRight].map(parseFloat);
  const pad = pl < 8;
  el.classList.toggle('pad', pad);
  // A column with its own gutter: the ribbon still runs edge to edge at the very top, so it
  // sits at the same place and height in every plugin (PR 10: the portal's sat lower and inset).
  if (!pad && (pt || pl || pr)) Object.assign(el.style, { margin: `-${pt}px -${pr}px ${Math.max(6, pt * 0.6)}px -${pl}px`, padding: `0 ${pr}px 0 ${pl}px`, width: `calc(100% + ${pl + pr}px)` });
  else el.removeAttribute('style');
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
