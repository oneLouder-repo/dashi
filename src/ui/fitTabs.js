/**
 * Plugin tabs that fit (alpha 0.4): a plugin with lots of tabs (Rhizome)
 * keeps one row, like the plugin bar's More menu. Tabs marked `more` live
 * in the menu from the start; others move there, last first, when the row
 * runs out of room. The tab you're on always stays on the row.
 *
 *   fitTabs(navEl)   navEl = <nav class="plugin-tabs"> of <a> tabs, each
 *                    with data-i (its order) and data-more="1" if it starts in More
 */
import { h } from './dom.js';
import { icon } from './icons.js';

export function fitTabs(nav) {
  const label = h('span', {}, 'More');
  const count = h('span', { class: 'pt-more-count' });
  const more = h('details', { class: 'pt-more' },
    h('summary', { 'aria-label': 'More tabs' }, icon('dots', 15), label, count, icon('chevronDown', 12)),
    h('div', { class: 'pt-more-menu', role: 'menu' }));
  const menu = more.lastChild;
  nav.append(more);
  more.addEventListener('click', (e) => { if (e.target.closest('a')) more.open = false; });
  more.addEventListener('keydown', (e) => { if (e.key === 'Escape') { more.open = false; more.firstChild.focus(); } });
  const closeOutside = (e) => { if (!nav.isConnected) document.removeEventListener('pointerdown', closeOutside); else if (more.open && !more.contains(e.target)) more.open = false; };
  document.addEventListener('pointerdown', closeOutside);

  const tabs = () => [...nav.querySelectorAll('a[data-i]')].sort((a, b) => +a.dataset.i - +b.dataset.i);
  const fit = () => {
    if (!nav.isConnected) return;
    const all = tabs();
    for (const a of all) {
      const inMenu = a.dataset.more === '1' && !a.classList.contains('on');
      (inMenu ? menu : nav).insertBefore(a, inMenu ? null : more);
    }
    const onRow = () => [...nav.querySelectorAll(':scope > a')];
    more.hidden = false;
    while (nav.scrollWidth > nav.clientWidth + 1 && onRow().some((a) => !a.classList.contains('on'))) {
      const pick = onRow().reverse().find((a) => !a.classList.contains('on'));
      menu.prepend(pick);
    }
    [...menu.children].sort((a, b) => +a.dataset.i - +b.dataset.i).forEach((a) => { a.setAttribute('role', 'menuitem'); menu.append(a); });
    for (const a of onRow()) a.removeAttribute('role');
    more.hidden = !menu.children.length;
    count.textContent = menu.children.length ? String(menu.children.length) : '';
  };
  let w = -1;
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (nav.clientWidth !== w) { w = nav.clientWidth; fit(); } }).observe(nav);
  else requestAnimationFrame(fit);
  return fit;
}
