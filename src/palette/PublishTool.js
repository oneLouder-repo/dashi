import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';

/**
 * Publishing mini-tool: everything the Workbench makes that can go on a site
 * (dashboards, data stories, impact calculators, feedback forms), in one list
 * with who can see it and where. Sites themselves (their look, address and
 * who can open them) are managed in the Public Portal.
 */
const KINDS = [
  { id: 'dashboards', label: 'Dashboard', icon: 'chart', href: (x) => `#${x.id}` },
  { id: 'stories', label: 'Data story', icon: 'story', href: () => '#stories' },
  { id: 'calculators', label: 'Impact calculator', icon: 'gift', href: () => '#impact' },
  { id: 'forms', label: 'Feedback form', icon: 'chats', href: () => '#feedback' },
];

export function PublishTool(ctx) {
  const { org, dashboards } = ctx;
  const doc = dashboards.doc;
  const sites = org.sites;
  const items = KINDS.flatMap((k) => Object.values(doc[k.id] ?? {}).map((x) => ({ kind: k, x })));
  // Members-only sites show what is on them to members, whatever the item's own switch says.
  const liveOn = ({ x }) => {
    const s = sites[x.siteId];
    if (!s) return null;
    return s.visibility === 'private' || x.visibility === 'public' ? s : null;
  };
  const filter = ctx.publishFilter ?? 'all';
  const shown = items.filter((it) => filter === 'all' || (filter === 'live' ? liveOn(it) : !liveOn(it)));
  const update = (it, patch) => dashboards.apply(col.update(it.kind.id, it.x.id, patch));
  const status = (it) => {
    const s = liveOn(it);
    if (s) return h('span', { class: 'pub-status live' }, h('i'), s.visibility === 'private' ? `Members see it on ${s.name}` : `Live on ${s.name}`);
    if (!it.x.siteId) return h('span', { class: 'pub-status' }, h('i'), 'Pick a site to publish it');
    return h('span', { class: 'pub-status' }, h('i'), 'Ready, switched off');
  };

  return h('div', { class: 'pub' },
    h('h1', {}, 'Publishing'),
    h('p', { class: 'lede' }, 'Everything the Workbench makes that can go on a site, in one place: switch it on, and choose the site. To change a site itself (its look, its address, who can open it), go to the ', h('a', { href: 'pages.html' }, 'Public Portal'), '.'),
    h('div', { class: 'pub-sites' }, Object.values(sites).map((s) => {
      const on = items.filter((it) => liveOn(it)?.id === s.id);
      return h('a', { class: `pub-site ${s.visibility}`, href: `pages.html#site/${s.id}` },
        h('span', { class: 'pub-site-icon' }, icon(s.visibility === 'private' ? 'lock' : s.visibility === 'unlisted' ? 'eyeOff' : 'globe', 16)),
        h('span', { class: 'pub-site-text' }, h('strong', {}, s.name), h('small', {}, s.visibility === 'private' ? 'Members only' : s.visibility === 'unlisted' ? 'Unlisted' : 'Public')),
        h('span', { class: 'pub-site-n' }, String(on.length), h('small', {}, ' on it')));
    })),
    h('div', { class: 'pub-bar' },
      h('div', { class: 'seg', role: 'tablist' }, [['all', `All (${items.length})`], ['live', `Showing (${items.filter(liveOn).length})`], ['off', `Not showing (${items.filter((it) => !liveOn(it)).length})`]].map(([id, label]) =>
        h('button', { role: 'tab', class: filter === id ? 'on' : '', 'aria-selected': String(filter === id), onclick: () => { ctx.publishFilter = id; ctx.render(); } }, label)))),
    shown.length ? h('ul', { class: 'pub-list' }, shown.map((it) => {
      const site = sites[it.x.siteId];
      const membersOnly = site?.visibility === 'private';
      return h('li', { class: liveOn(it) ? 'live' : '' },
        h('span', { class: 'pub-kind' }, icon(it.kind.icon, 18)),
        h('div', { class: 'pub-main' },
          h('a', { href: it.kind.href(it.x) }, it.x.title),
          h('small', {}, it.kind.label, ' · ', status(it))),
        h('select', { class: 'select select-sm', 'aria-label': `Site for ${it.x.title}`, onchange: (e) => update(it, { siteId: e.target.value || null }) },
          h('option', { value: '' }, 'No site'), options(Object.values(sites).map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (members)' : ''}` })), it.x.siteId)),
        membersOnly
          ? h('span', { class: 'pub-toggle muted small', title: 'Everything on a members-only site is shown to members' }, icon('lock', 13), 'Members')
          : h('label', { class: 'pub-toggle' },
            h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-success', checked: it.x.visibility === 'public', disabled: !site, 'aria-label': `Show ${it.x.title} on the site`,
              onchange: (e) => update(it, { visibility: e.target.checked ? 'public' : 'private' }) }),
            h('span', { class: 'small' }, it.x.visibility === 'public' ? 'Showing' : 'Off')));
    })) : h('p', { class: 'empty' }, filter === 'live' ? 'Nothing is showing on a site yet.' : 'Everything is showing.'));
}
