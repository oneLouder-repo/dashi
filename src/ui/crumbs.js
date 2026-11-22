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
 * the tools: what the page adds with setRibbon(), then (alpha 0.3) quick
 * actions for where you are, in place of the old "Works with" links. Help lives in the top
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
  pages: ['palette', 'podcasts', 'social'],
  social: ['pages', 'podcasts'],
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
  // Home (alpha 0.3 PR 9) has the ribbon too, so it sits like every plugin.
  const p = plugin === 'home' ? { id: 'home', name: 'Home', href: 'index.html' } : PLUGINS.find((x) => x.id === plugin);
  if (!p) { box.remove(); return; }
  // A sub-plugin's trail starts at its parent: Web / Data Workbench / Dashboards.
  const parent = p.parent && PLUGINS.find((x) => x.id === p.parent);
  // The studio is part of Plan now (0.2), so its own name drops out: Plan / Framework and plans.
  const steps = [...(parent ? [{ label: parent.name, href: parent.href }] : []), ...(p.id === 'studio' && parent ? [] : [{ label: p.name, href: p.href }])];
  if (section && !(home && !tail.length)) steps.push(section);
  steps.push(...tail);
  el.replaceChildren(h('ol', {}, steps.map((s, i) => {
    const last = i === steps.length - 1;
    return h('li', {}, !last && s.href ? h('a', { href: s.href }, s.label) : h('span', { 'aria-current': last ? 'page' : null }, s.label));
  })));
  // Alpha 0.3: no "Works with" any more. The right side is a toolbar: the page's own
  // tools (setRibbon), then the actions people reach for most where they are.
  box.replaceChildren(el, h('div', { class: 'ribbon-tools' }, tools, contextActions(p.id)));
  place();
}

/**
 * The often-used actions for each plugin, shown in its ribbon. Alpha 0.3
 * PR 11: three per plugin, set at the plugin level, so the ribbon never
 * shifts as you move around inside a plugin; `here` marks the one for the
 * page you're on (it isn't hidden any more). Links to another plugin go
 * through linkTo, so they only show to people who can open it.
 */
export const RIBBON_SIZE = 3;
const own = (pid, hash) => linkTo(pid, hash);
const ACTIONS = {
  home: () => [
    { label: 'My work', icon: 'checklist', href: 'me.html' },
    { label: 'People', icon: 'people', href: 'org.html#people' },
    { label: 'Search', icon: 'search', href: 'search.html' },
  ],
  strategy: () => [
    { label: 'Roadmap', icon: 'mapTrifold', href: own('strategy', '#roadmap'), here: '#roadmap' },
    { label: 'Framework', icon: 'strategy', href: own('strategy', '#framework'), here: '#framework' },
    { label: 'Plan designer', icon: 'brush', href: linkTo('plandoc'), title: 'Design the plan as pages, then print, save as PDF or publish' },
  ],
  studio: () => [
    { label: 'Framework and plans', icon: 'strategy', href: own('studio', '#framework'), here: '#framework' },
    { label: 'Roadmap', icon: 'mapTrifold', href: linkTo('strategy', '#roadmap') },
    { label: 'Plan designer', icon: 'brush', href: linkTo('plandoc') },
  ],
  assets: () => [
    { label: 'Asset map', icon: 'mapTrifold', href: own('assets', '#view=map'), here: '#view=map' },
    { label: 'Asset graph', icon: 'spark', href: linkTo('graph') },
    { label: 'Ecosystem map', icon: 'mapper', href: linkTo('mapper') },
  ],
  graph: () => [
    { label: 'Explore', icon: 'spark', href: own('graph', '#explore'), here: '#explore' },
    { label: 'Insights', icon: 'chart', href: own('graph', '#insights'), here: '#insights' },
    { label: 'Export', icon: 'download', href: own('graph', '#export'), here: '#export' },
  ],
  rhizome: () => [
    { label: 'Analyses', icon: 'spark', href: own('rhizome', '#analyses'), here: '#analyses' },
    { label: 'Rack', icon: 'connect', href: own('rhizome', '#rack'), here: '#rack' },
    { label: 'About', icon: 'help', href: own('rhizome', '#about'), here: '#about' },
  ],
  teach: () => [
    { label: 'Cartridges', icon: 'tiles', href: own('teach', '#home'), here: '#home' },
    { label: 'New cartridge', icon: 'plus', href: own('teach', '#new'), here: '#new' },
    { label: 'About', icon: 'help', href: own('teach', '#about'), here: '#about' },
  ],
  learn: () => [
    { label: 'My learning', icon: 'graduation', href: own('learn', '#home'), here: '#home' },
    { label: 'Catalogue', icon: 'books', href: own('learn', '#catalogue'), here: '#catalogue' },
    { label: 'About', icon: 'help', href: own('learn', '#about'), here: '#about' },
  ],
  place: () => [
    { label: 'Map', icon: 'mapTrifold', href: own('place', '#map'), here: '#map' },
    { label: 'Places', icon: 'pin', href: own('place', '#places'), here: '#places' },
    { label: 'About', icon: 'help', href: own('place', '#about'), here: '#about' },
  ],
  library: () => [
    { label: 'Documents', icon: 'doc', href: own('library', '#files/all'), here: '#files' },
    { label: 'Bibliographies', icon: 'book', href: own('library', '#bibs'), here: '#bibs' },
    { label: 'Tags', icon: 'tag', href: own('library', '#tags'), here: '#tags' },
  ],
  podcasts: () => [
    { label: 'New episode', icon: 'plus', href: own('podcasts', '#episodes/new'), here: '#episodes/new' },
    { label: 'Studio', icon: 'mic', href: own('podcasts', '#studio'), here: '#studio' },
    { label: 'Station', icon: 'radio', href: own('podcasts', '#station'), here: '#station' },
  ],
  pages: () => [
    { label: 'Pages', icon: 'doc', href: own('pages', '#cms/pages'), here: '#cms/pages' },
    { label: 'Look and feel', icon: 'palette', href: own('pages', '#look'), here: '#look' },
    { label: 'Social media', icon: 'share', href: linkTo('social') },
  ],
  social: () => [
    { label: 'Create a post', icon: 'plus', href: own('social', '#compose'), here: '#compose' },
    { label: 'Calendar', icon: 'calendar', href: own('social', '#calendar'), here: '#calendar' },
    { label: 'Web', icon: 'globe', href: linkTo('pages') },
  ],
  palette: () => [
    { label: 'Dashboards', icon: 'chart', href: own('palette', '#dashboards'), here: '#dashboards' },
    { label: 'Program data', icon: 'timeline', href: own('palette', '#data'), here: '#data' },
    { label: 'Feedback forms', icon: 'chats', href: own('palette', '#feedback'), here: '#feedback' },
  ],
  org: () => [
    { label: 'People', icon: 'person', href: own('org', '#people'), here: '#people' },
    { label: 'Teams', icon: 'people', href: own('org', '#teams'), here: '#teams' },
    { label: 'Plugins', icon: 'settings', href: own('org', '#plugins'), here: '#plugins' },
  ],
};
export function contextActions(id) {
  const tone = PLUGINS.find((x) => x.id === id)?.tone ?? 'var(--color-primary)';
  const list = (ACTIONS[id]?.() ?? []).filter((a) => a.href).slice(0, RIBBON_SIZE);
  const at = (a) => {
    if (typeof location === 'undefined') return false;
    if (a.here) return location.hash.startsWith(a.here);
    const page = String(a.href).split(/[?#]/)[0].split('/').pop();
    return !!page && location.pathname.endsWith('/' + page) && !a.href.includes('#');
  };
  return list.length ? h('span', { class: 'ribbon-group ribbon-actions', role: 'group', 'aria-label': 'Quick actions' },
    list.map((a) => h('a', { class: `ribbon-link${at(a) ? ' on' : ''}`, href: a.href, style: `--tone:${tone}`, title: a.title ?? a.label, 'aria-current': at(a) ? 'page' : null }, icon(a.icon, 15), h('span', {}, a.label)))) : null;
}
export const ribbonActions = (id) => (ACTIONS[id]?.() ?? []);
// Moving between a plugin's own pages only changes which action is marked, never which show.
if (typeof addEventListener !== 'undefined') addEventListener('hashchange', () => queue());

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
