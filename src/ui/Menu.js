import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * A toolbar menu: a button that opens a small panel of actions under it.
 * Items are built fresh each time it opens, so ticks and labels are current.
 *
 *   Menu({ label: 'View', icon: 'eye', title, items: () => [
 *     { heading: 'Panel' },
 *     { label: 'Layers', checked: true, onclick, hint: 'Show or hide', kbd: 'L' },
 *     { label: 'Delete', danger: true, onclick, disabled: false },
 *     'sep',
 *     { custom: element },
 *   ] })
 *
 * Arrow keys move between items, Esc closes, and a click outside closes it.
 * Checkable items keep the menu open so several can be toggled in a row.
 */
let openMenu = null;

export function Menu({ label, icon: glyph = null, title = '', items, align = 'start', primary = false, className = '' }) {
  const panel = h('div', { class: `tb-menu${align === 'end' ? ' end' : ''}`, role: 'menu', hidden: true });
  const button = h('button', {
    type: 'button', class: `btn btn-sm ${primary ? 'btn-primary' : 'btn-ghost'} tb-menu-btn ${className}`.trim(), title,
    'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: (e) => { e.stopPropagation(); panel.hidden ? open() : close(); },
    onkeydown: (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); focusItem(0); } },
  }, glyph && icon(glyph, 16), label && h('span', {}, label), h('span', { class: 'tb-caret', 'aria-hidden': 'true' }, icon('chevronDown', 12)));
  const wrap = h('span', { class: 'tb-menu-wrap' }, button, panel);

  const entries = () => [...panel.querySelectorAll('[role^="menuitem"]:not([disabled])')];
  const focusItem = (i) => { const list = entries(); list[(i + list.length) % list.length]?.focus(); };

  function draw() {
    const rows = (typeof items === 'function' ? items() : items).filter(Boolean);
    panel.replaceChildren(...rows.map((it) => {
      if (it === 'sep') return h('div', { class: 'tb-sep', role: 'separator' });
      if (it.heading) return h('p', { class: 'tb-heading' }, it.heading);
      if (it.note) return h('p', { class: 'tb-note' }, it.note);
      if (it.custom) return it.custom;
      const checkable = typeof it.checked === 'boolean';
      return h('button', {
        type: 'button', class: `tb-item${it.danger ? ' danger' : ''}${checkable ? ' checkable' : ''}`,
        role: checkable ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': checkable ? String(it.checked) : null,
        disabled: !!it.disabled, title: it.title ?? null,
        onclick: (e) => {
          e.stopPropagation();
          if (!checkable && !it.keepOpen) close();
          it.onclick?.(e);
          if (checkable || it.keepOpen) { draw(); entries().find((x) => x.dataset.key === it.label)?.focus(); }
        },
        'data-key': it.label,
      },
      h('span', { class: 'tb-tick', 'aria-hidden': 'true' }, checkable ? (it.checked ? icon('check', 14) : null) : it.icon ? icon(it.icon, 15) : null),
      h('span', { class: 'tb-text' }, h('span', { class: 'tb-label' }, it.label), it.hint && h('small', {}, it.hint)),
      it.kbd && h('kbd', { class: 'tb-kbd' }, it.kbd));
    }));
  }

  function open() {
    if (openMenu && openMenu !== close) openMenu();
    draw();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    openMenu = close;
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
    if (openMenu === close) openMenu = null;
  }
  panel.addEventListener('keydown', (e) => {
    const list = entries();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); }
    e.stopPropagation();
  });
  document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) close(); });
  wrap.close = close;
  wrap.open = open;
  return wrap;
}
