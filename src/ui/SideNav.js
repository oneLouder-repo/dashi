import { h } from './dom.js';
import { icon } from './icons.js';
import { setSection } from './crumbs.js';

/**
 * The left sidebar every plugin shares, built on DaisyUI's menu. Sections
 * have a title and items; an item is a link (href) or a button (onclick).
 * The sidebar folds down to icons, and every plugin remembers that.
 *
 *   SideNav({ label: 'Workbench', sections: [
 *     { title: 'Mini-tools', items: [{ label, sub, icon, href, on, badge }] },
 *     { title: 'Layers', action: { icon: 'plus', label: 'Add layer', onclick }, body: element },
 *   ] })
 *
 * A section's `head` is an element above its items (a picker, say); `fold: key` lets it fold.
 * A section's `body` is any element shown in place of items (the mapper's
 * layers list, say); it hides when the sidebar is folded. `menu` is a
 * ready-made ul.menu that someone else keeps drawn (the mapper's tools).
 */
const KEY = 'dashi.side-folded';
/**
 * An item whose link came back empty (linkTo: a plugin this person can't
 * use) and has nothing else to do is left out, and so is a section left
 * with no items. Menus never point somewhere closed.
 */
export const reachable = (it) => !!it && (it instanceof Node || !('href' in it) || it.href != null || !!it.onclick || !!it.disabled);
const keepSection = (s) => {
  if (!s) return null;
  if (!s.items) return s;
  const items = s.items.filter(reachable);
  return items.length || s.body || s.menu || s.action ? { ...s, items } : null;
};
const folded = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export function SideNav({ label, sections }) {
  foldTips();
  const nav = h('nav', { class: `side-nav${folded() ? ' folded' : ''}`, 'aria-label': label });
  const toggleLabel = () => (nav.classList.contains('folded') ? 'Open the side nav' : 'Fold the side nav');
  const toggle = h('button', { class: 'btn btn-ghost btn-xs btn-square side-fold', 'aria-expanded': String(!folded()),
    onclick: () => {
      const now = !nav.classList.toggle('folded') ? '0' : '1';
      try { localStorage.setItem(KEY, now); } catch { /* private window: fold just for now */ }
      toggle.setAttribute('aria-expanded', String(now === '0'));
      toggle.setAttribute('aria-label', toggleLabel());
      toggle.dataset.tip = toggleLabel();
      hideTip();
      document.dispatchEvent(new CustomEvent('dashi:side-fold'));
    } }, h('span', { 'aria-hidden': 'true' }, '‹'));
  toggle.setAttribute('aria-label', toggleLabel());
  toggle.dataset.tip = toggleLabel();
  sections = sections.map(keepSection).filter(Boolean)
    // Every titled section folds, like the mapper's tool panel, unless it says not to (fold: false).
    .map((sec) => (sec.fold === undefined && sec.title ? { ...sec, fold: `${label}:${sec.title}`.toLowerCase().replace(/[^\w:]+/g, '-') } : sec));
  nav.append(toggle, ...sections.map(Section));
  keepScroll(nav, label);
  // The open item is the second step of the page's breadcrumb trail.
  const all = sections.flatMap((s) => (s.items ?? []).filter((it) => it && !(it instanceof Node)));
  const on = all.find((it) => it.on);
  if (on) setSection({ label: on.label, href: on.href }, { isHome: on === all[0] });
  return nav;
}

/*
 * Alpha 0.3: a folded side nav is only icons, so every row (and the open
 * button) shows a tooltip beside it, quickly, with the row's name and its
 * second line. Keyboard focus shows it too. One listener for every side
 * nav on the page, the mapper's included.
 */
let tipEl = null, tipTimer = 0, tipFor = null;
const hideTip = () => { clearTimeout(tipTimer); tipFor = null; if (tipEl) tipEl.hidden = true; };
function showTip(el) {
  tipEl ??= document.body.appendChild(h('div', { class: 'side-tip', role: 'tooltip', hidden: true }));
  // Keep the words off `title` so the browser's slow tooltip doesn't show as well.
  if (el.hasAttribute('title')) { el.dataset.sideTitle = el.getAttribute('title'); el.removeAttribute('title'); }
  const text = el.querySelector(':scope > .side-text');
  const name = text ? text.firstChild?.textContent : el.dataset.tip ?? el.dataset.sideTitle ?? el.getAttribute('aria-label') ?? '';
  const sub = text?.querySelector('small')?.textContent ?? '';
  if (!name) return;
  tipEl.replaceChildren(h('b', {}, name), sub && h('small', {}, sub));
  tipEl.hidden = false;
  const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const y = Math.max(8, Math.min(innerHeight - t.height - 8, r.top + r.height / 2 - t.height / 2));
  tipEl.style.transform = `translate(${Math.round(r.right + 10)}px, ${Math.round(y)}px)`;
}
let tipsOn = false;
function foldTips() {
  if (tipsOn || typeof document === 'undefined') return;
  tipsOn = true;
  const target = (e) => e.target.closest?.('.side-nav.folded :where(.side-menu li > a, .side-menu li > button, .side-fold)');
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = target(e);
    if (el === tipFor) return;
    hideTip();
    if (!el) return;
    tipFor = el;
    tipTimer = setTimeout(() => showTip(el), 120);
  });
  document.addEventListener('pointerout', (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener('focusin', (e) => { const el = target(e); if (el?.matches(':focus-visible')) { tipFor = el; showTip(el); } });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('pointerdown', hideTip, true);
  addEventListener('scroll', hideTip, true);
}

/** A section that folds (`fold: '<key>'`), like the mapper's tool panel: remembered per browser. */
const foldKey = (k) => `dashi.side-section.${k}`;
const sectionFolded = (k) => { try { return localStorage.getItem(foldKey(k)) === '1'; } catch { return false; } };

function Section({ title, items, menu, body, head, action, className, fold }) {
  const sec = h('section', { class: `side-section ${className ?? ''}${fold ? ' foldable' : ''}${fold && sectionFolded(fold) ? ' section-folded' : ''}` });
  const chevron = fold && h('button', { type: 'button', class: 'side-section-fold', 'aria-expanded': String(!sectionFolded(fold)), 'aria-label': `Fold ${title}`, title: 'Fold or open this section',
    onclick: () => {
      const now = sec.classList.toggle('section-folded');
      chevron.setAttribute('aria-expanded', String(!now));
      try { localStorage.setItem(foldKey(fold), now ? '1' : '0'); } catch { /* private window */ }
    } }, icon('chevronDown', 13));
  sec.append(...[
    (title || action) && h('div', { class: 'side-title' },
      chevron,
      // The title folds too, not just the chevron (0.2 polish).
      fold ? h('span', { class: 'side-title-text', role: 'button', tabindex: -1, onclick: () => chevron.click() }, title) : h('span', {}, title),
      action && h('button', { class: 'btn btn-ghost btn-xs btn-square', title: action.label, 'aria-label': action.label, onclick: action.onclick }, icon(action.icon ?? 'plus', 15))),
    head && h('div', { class: 'side-body side-head' }, head),
    items && h('ul', { class: 'menu side-menu' }, items.filter(Boolean).map(Item)),
    menu,
    body && h('div', { class: 'side-body' }, body),
  ].filter(Boolean));
  return sec;
}

export function Item(it) {
  if (it instanceof Node) return h('li', {}, it);
  const inner = [
    it.lead ?? (it.icon ? icon(it.icon, 18) : h('span', { class: 'side-dot', 'aria-hidden': 'true' })),
    h('span', { class: 'side-text' }, it.label, it.sub && h('small', {}, it.sub)),
    it.badge && h('span', { class: `badge badge-xs ${it.badgeClass ?? 'badge-ghost'}` }, it.badge),
  ];
  const props = {
    class: [it.on && 'menu-active', it.className].filter(Boolean).join(' ') || null,
    title: it.title ?? (it.sub ? `${it.label}: ${it.sub}` : it.label),
    'aria-current': it.on ? 'page' : null,
    ...(it.props ?? {}),
  };
  return h('li', { class: it.disabled ? 'menu-disabled' : null },
    it.href ? h('a', { href: it.href, ...props }, ...inner) : h('button', { type: 'button', onclick: it.onclick, disabled: it.disabled, ...props }, ...inner));
}

/** Put a freshly drawn sidebar in place of the old one, keeping its scroll. */
export function swapSide(old, next) {
  // Swap first: an element that isn't on the page can't be scrolled, so setting it before did nothing.
  const top = old.scrollTop;
  old.replaceWith(next);
  if (next.isConnected) next.scrollTop = top;
  return next;
}

/*
 * The sidebar keeps its place: clicking far down a long list (a tag in
 * Assets, say) opens the next page with the sidebar where it was, not
 * back at the top. Kept per sidebar, for this tab only.
 */
const scrollKey = (label) => `dashi.side-scroll:${label}`;
function keepScroll(nav, label) {
  let t = 0;
  nav.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => { try { sessionStorage.setItem(scrollKey(label), String(Math.round(nav.scrollTop))); } catch { /* private window */ } }, 80);
  }, { passive: true });
  nav.addEventListener('click', () => { try { sessionStorage.setItem(scrollKey(label), String(Math.round(nav.scrollTop))); } catch { /* private window */ } });
  // A fresh page: put the sidebar back where it was once it's on the page (swapSide handles redraws).
  requestAnimationFrame(() => {
    if (!nav.isConnected || nav.scrollTop) return;
    let top = 0;
    try { top = Number(sessionStorage.getItem(scrollKey(label))) || 0; } catch { /* private window */ }
    if (top) nav.scrollTop = top;
    // Whatever happens, the open item is in view.
    const on = nav.querySelector('.menu-active');
    if (on) {
      const a = on.getBoundingClientRect(); const b = nav.getBoundingClientRect();
      if (a.top < b.top || a.bottom > b.bottom) on.scrollIntoView({ block: 'nearest' });
    }
  });
}
