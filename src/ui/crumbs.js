import { h } from './dom.js';
import { PLUGINS } from '../plugins.js';

/**
 * The breadcrumb trail at the top of every plugin's page:
 *
 *   Podcasts / STEM Voices / Season 2 · Episode 3
 *
 * The first step is the plugin (from the header), the second is the page
 * the sidebar has open (SideNav sets it), and a page adds anything deeper
 * with setCrumbs(). The trail is hidden on a plugin's own home page, where
 * the big header already says where you are. It is kept as the first thing
 * in the page's main column, whatever the page redraws.
 *
 *   setPlugin('podcasts')                      Shell does this
 *   setSection({ label, href }, { home })      SideNav does this
 *   setCrumbs([{ label, href }, { label }])    a page, for deeper steps
 */
let plugin = null;
let section = null;
let home = false;
let tail = [];
let queued = false;
// Made on first use, so the module also loads where there is no DOM (tests, the server).
let nav = null;
const trail = () => (nav ??= h('nav', { class: 'page-crumbs', 'aria-label': 'Breadcrumb' }));

export function setPlugin(id) { plugin = id; queue(); }
export function setSection(item, { isHome = false } = {}) { section = item; home = isHome; tail = []; queue(); }
export function setCrumbs(list = []) { tail = list.filter(Boolean); queue(); }

function queue() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; draw(); });
}

function draw() {
  const el = trail();
  const p = PLUGINS.find((x) => x.id === plugin);
  if (!p) { el.remove(); return; }
  const steps = [{ label: p.name, href: p.href }];
  if (section && !(home && !tail.length)) steps.push(section);
  steps.push(...tail);
  if (steps.length < 2) { el.remove(); return; }
  el.replaceChildren(h('ol', {}, steps.map((s, i) => {
    const last = i === steps.length - 1;
    return h('li', {}, !last && s.href ? h('a', { href: s.href }, s.label) : h('span', { 'aria-current': last ? 'page' : null }, s.label));
  })));
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
  const el = trail();
  if (!el.childNodes.length) return;
  const col = column();
  if (col && col.firstElementChild !== el) col.prepend(el);
}

// Pages redraw their main column often; put the trail back each time.
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const watch = () => {
    const app = document.querySelector('#app');
    if (!app) return;
    new MutationObserver(() => { const el = trail(); if (el.childNodes.length && !el.isConnected) place(); else if (el.isConnected && column()?.firstElementChild !== el) place(); }).observe(app, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
}
