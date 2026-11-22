/**
 * The public site's top nav, fitted to the window (alpha 0.4).
 *
 * Every link stays on one line, never wrapping or running off the edge.
 * Links that don't fit move, last first, into a "More" menu at the end of
 * the bar; the page you're on is the last to go. On a phone (under 640px)
 * the whole nav folds into one Menu button that opens a full-width sheet.
 * It measures again whenever the header changes size.
 *
 *   fitNav(navEl)   navEl = <nav class="site-nav"> holding <a> links and a
 *                   <details class="site-more"> (made here if missing)
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const PHONE = 640;
const watched = new WeakMap();

export function fitNav(nav) {
  if (!nav) return;
  let more = nav.querySelector(':scope > .site-more');
  if (!more) {
    const label = h('span', { class: 'site-more-label' }, 'More');
    more = h('details', { class: 'site-more' },
      h('summary', { 'aria-label': 'More pages' }, icon('menu', 16), label, icon('chevronDown', 12)),
      h('div', { class: 'site-more-menu', role: 'menu' }));
    nav.append(more);
    // A tap on a link, or anywhere outside, closes the menu.
    more.addEventListener('click', (e) => { if (e.target.closest('a')) more.open = false; });
    document.addEventListener('click', (e) => { if (more.open && !more.contains(e.target)) more.open = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && more.open) { more.open = false; more.querySelector('summary').focus(); } });
  }
  const menu = more.querySelector('.site-more-menu');
  const label = more.querySelector('.site-more-label');
  const fit = () => {
    // Put every link back on the bar, in order, then take off what doesn't fit.
    const links = [...nav.querySelectorAll(':scope > a'), ...menu.querySelectorAll('a')].sort((a, b) => +a.dataset.i - +b.dataset.i);
    links.forEach((a, i) => { a.dataset.i ??= String(i); a.removeAttribute('role'); });
    nav.insertBefore(document.createDocumentFragment(), more);
    for (const a of links) nav.insertBefore(a, more);
    more.hidden = false;
    const phone = window.innerWidth < PHONE;
    nav.classList.toggle('site-nav-phone', phone);
    label.textContent = phone ? 'Menu' : 'More';
    const over = () => nav.scrollWidth > nav.clientWidth + 1;
    const onBar = () => [...nav.querySelectorAll(':scope > a')];
    if (phone) {
      for (const a of onBar()) menu.append(a);
    } else {
      // The current page goes last; otherwise from the end of the bar.
      while (over() && onBar().length) {
        const bar = onBar();
        const pick = [...bar].reverse().find((a) => !a.hasAttribute('aria-current')) ?? bar[bar.length - 1];
        menu.prepend(pick);
      }
      // Keep the menu in the bar's order.
      [...menu.querySelectorAll('a')].sort((a, b) => +a.dataset.i - +b.dataset.i).forEach((a) => menu.append(a));
    }
    for (const a of menu.querySelectorAll('a')) a.setAttribute('role', 'menuitem');
    const n = menu.querySelectorAll('a').length;
    more.hidden = n === 0;
    more.classList.toggle('has-current', !!menu.querySelector('[aria-current]'));
  };
  fit();
  // Fonts arriving can change widths: fit again once they're in.
  document.fonts?.ready?.then(fit);
  const head = nav.closest('.site-head') ?? nav.parentElement;
  watched.get(head)?.disconnect();
  if (typeof ResizeObserver === 'function') {
    let w = head.clientWidth;
    const ro = new ResizeObserver(() => { if (head.clientWidth !== w) { w = head.clientWidth; fit(); } });
    ro.observe(head);
    watched.set(head, ro);
  }
  return fit;
}
