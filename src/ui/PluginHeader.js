import { h } from './dom.js';
import { icon } from './icons.js';
import { PLUGINS } from '../plugins.js';

/**
 * The header at the top of a plugin's page: its icon and name, with optional
 * actions on the right and tabs underneath. Alpha 0.3 PR 17: just the title,
 * no sub-title line; a `blurb` passed in is ignored.
 *
 *   PluginHeader('strategy', { tabs: [{ id, label, href }], current: 'overview' })
 */
export function PluginHeader(id, { title, actions, tabs, current } = {}) {
  const p = PLUGINS.find((x) => x.id === id) ?? { name: id, icon: 'home', blurb: '' };
  return h('header', { class: 'plugin-header' },
    h('div', { class: 'plugin-header-row' },
      h('span', { class: 'plugin-header-icon', 'aria-hidden': 'true' }, icon(p.icon, 21)),
      h('div', { class: 'plugin-header-text' }, h('h1', {}, title ?? p.name)),
      actions && h('div', { class: 'plugin-header-actions' }, actions)),
    tabs && h('nav', { class: 'plugin-tabs', 'aria-label': `${p.name} sections` },
      tabs.map((t) => h('a', { href: t.href ?? `#${t.id}`, class: t.id === current ? 'on' : '', 'aria-current': t.id === current ? 'page' : null },
        t.icon && icon(t.icon, 15), t.label))));
}
