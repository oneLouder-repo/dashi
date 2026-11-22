import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { enabledPlugins, linkTo } from '../plugins.js';
import { loadAll } from '../platform/docs.js';
import { currentUser } from '../platform/session.js';
import { statusById } from '../platform/strategy.js';
import { addDays, short, today } from '../strategy/dates.js';
import { libraryTags } from '../platform/library.js';
import { MiniMap } from '../ui/MiniMap.js';
import { SideNav } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';

/**
 * The organisation's home: what needs you, what's moving, where the
 * strategy stands, the ecosystem at a glance, the team and what you're
 * reading, then the plugins. Alpha 0.3 PR 9: laid out like a plugin, with
 * a left side nav of the things people reach for most (quick actions, your
 * tasks, recent assets, plugins and tags) and the plugin header and ribbon.
 */
const docs = loadAll();
const { org, strategy, dashboards } = docs;
Shell(document.querySelector('#shell'), { current: 'home', org });
const me = currentUser(org);
const plugins = enabledPlugins(org);
const has = (id) => plugins.some((p) => p.id === id);
const now = today();
const nodes = Object.values(strategy.nodes);
const tone = (id) => plugins.find((p) => p.id === id)?.tone ?? 'var(--accent)';

const ago = (iso) => {
  if (!iso) return '';
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const hour = new Date().getHours();
const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

function Card(title, glyph, { more, cls = '', toneId } = {}, ...body) {
  return h('section', { class: `card home-card ${cls}`, style: toneId ? `--tone:${tone(toneId)}` : '' },
    h('div', { class: 'home-card-head' }, h('h2', {}, icon(glyph, 18), title), more && h('a', { href: more.href }, more.label)),
    ...body);
}

/* What needs you: your open tasks, soonest first, then the team's overdue ones. */
function MyWork() {
  if (!has('strategy')) return null;
  const mine = nodes.filter((n) => n.type === 'task' && n.status !== 'done' && (n.assigneeIds ?? []).includes(me?.id)).sort((a, b) => (a.end ?? '9').localeCompare(b.end ?? '9'));
  const soon = addDays(now, 30);
  const team = nodes.filter((n) => n.type === 'task' && n.status !== 'done' && n.end && n.end <= soon && !mine.includes(n)).sort((a, b) => a.end.localeCompare(b.end)).slice(0, 5);
  const row = (t) => h('li', {},
    h('span', { class: 'dot', style: `background:${statusById[t.status]?.color ?? '#999'}`, title: statusById[t.status]?.label }),
    h('a', { href: linkTo('strategy', `#${t.id}`) }, t.title),
    h('span', { class: `when${t.end && t.end < now ? ' late' : ''}` }, t.end ? (t.end < now ? `Overdue · ${short(t.end)}` : short(t.end)) : 'No date'));
  return Card('What needs you', 'checklist', { more: { href: 'me.html', label: 'My work →' }, toneId: 'strategy' },
    mine.length ? h('ul', { class: 'home-tasks' }, mine.slice(0, 6).map(row)) : h('p', { class: 'muted' }, 'No open tasks assigned to you.'),
    team.length ? [h('h3', { class: 'home-sub' }, 'Due soon across the team'), h('ul', { class: 'home-tasks' }, team.map(row))] : null);
}

/* What's moving: recent changes anywhere in Dashi. */
function Moving() {
  const items = [];
  for (const [id, m] of Object.entries(docs.maps?.maps ?? {})) if (has('mapper') && m.updatedAt) items.push({ at: m.updatedAt, glyph: 'sec-mapper', toneId: 'mapper', text: h('span', {}, 'Map ', h('a', { href: linkTo('mapper', `#${id}`) }, m.title), ' was updated') });
  for (const it of Object.values(docs.library?.items ?? {})) if (has('library') && it.updatedAt) items.push({ at: it.updatedAt, glyph: 'sec-library', toneId: 'library', text: h('span', {}, it.kind === 'doc' ? 'Doc ' : 'Reading ', h('a', { href: linkTo('library', `#item/${it.id}`) }, it.meta?.title || 'Untitled'), it.kind === 'doc' ? ' was edited' : ' was added or changed') });
  for (const a of (docs.assets?.activity ?? []).slice(0, 3)) if (has('assets')) items.push({ at: a.at, glyph: 'sec-assets', toneId: 'assets', text: h('span', {}, h('b', {}, org.staff[a.by]?.name?.split(' ')[0] ?? 'Someone'), ` ${a.what}`), href: a.key ? linkTo('assets', `#key=${encodeURIComponent(a.key)}`) : linkTo('assets') });
  for (const e of Object.values(docs.podcasts?.episodes ?? {})) if (has('podcasts') && e.publishedAt) items.push({ at: e.publishedAt, glyph: 'sec-podcasts', toneId: 'podcasts', text: h('span', {}, 'Episode ', h('a', { href: linkTo('podcasts', `#episodes/${e.id}`) }, e.title), ' went out') });
  const t = (x) => (typeof x.at === 'number' ? x.at : new Date(x.at).getTime()) || 0;
  const recent = items.sort((a, b) => t(b) - t(a)).slice(0, 8);
  return Card('What’s moving', 'flow', {},
    recent.length ? h('ul', { class: 'home-feed' }, recent.map((x) => h('li', { style: `--tone:${tone(x.toneId)}` }, h('span', { class: 'home-feed-ico' }, icon(x.glyph, 14)), x.text, h('small', {}, ago(x.at)))))
      : h('p', { class: 'muted' }, 'Changes to maps, readings, assets and episodes show up here.'));
}

/* Strategy at a glance: each objective and how much of its work is done. */
function Strategy() {
  if (!has('strategy')) return null;
  const kids = new Map();
  for (const n of nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const tasksUnder = (id) => (kids.get(id) ?? []).flatMap((c) => (c.type === 'task' ? [c] : tasksUnder(c.id)));
  const objectives = nodes.filter((n) => n.type === 'objective').slice(0, 5);
  if (!objectives.length) return null;
  return Card('Strategy at a glance', 'target', { more: { href: linkTo('strategy'), label: 'Open the plan →' }, toneId: 'strategy' },
    h('ul', { class: 'home-objectives' }, objectives.map((o) => {
      const ts = tasksUnder(o.id);
      const done = ts.filter((x) => x.status === 'done').length;
      const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
      return h('li', {}, h('a', { href: linkTo('strategy', `#${o.id}`) }, o.title), h('div', { class: 'home-bar' }, h('span', { style: `width:${pct}%` })), h('small', {}, ts.length ? `${done} of ${ts.length} tasks done` : 'No tasks yet'));
    })));
}

/* The ecosystem: the most recently changed map, drawn small. */
function Ecosystem() {
  if (!has('mapper')) return null;
  const entries = Object.entries(docs.maps?.maps ?? {}).sort((a, b) => String(b[1].updatedAt ?? '').localeCompare(String(a[1].updatedAt ?? '')));
  if (!entries.length) return Card('Your ecosystem', 'sec-mapper', { toneId: 'mapper' }, h('p', { class: 'muted' }, h('a', { href: linkTo('mapper') }, 'Start a map'), ' of the people and organisations around your work.'));
  const [id, entry] = entries[0];
  const content = docs.mapContents[id];
  const pic = h('a', { class: 'home-map', href: linkTo('mapper', `#${id}`), 'aria-label': `Open ${entry.title}` });
  MiniMap(content, { width: 300, height: 190, label: entry.title }).then((s) => pic.replaceChildren(s)).catch(() => {});
  const actors = Object.values(content?.actors ?? {});
  return Card('Your ecosystem', 'sec-mapper', { more: { href: linkTo('mapper'), label: 'All maps →' }, toneId: 'mapper' },
    pic,
    h('p', { class: 'home-map-cap' }, h('a', { href: linkTo('mapper', `#${id}`) }, entry.title), h('span', {}, `${actors.filter((a) => a.kind !== 'agent').length} actors · ${actors.filter((a) => a.kind === 'agent').length} agents · ${Object.keys(content?.connectors ?? {}).length} links`)),
    entries.length > 1 && h('p', { class: 'muted small' }, `and ${entries.length - 1} more map${entries.length > 2 ? 's' : ''}`));
}

function Team() {
  const staff = Object.values(org.staff ?? {});
  return Card('The team', 'people', { more: { href: 'org.html#people', label: 'People →' }, toneId: 'org' },
    h('div', { class: 'home-team' }, staff.slice(0, 14).map((s) => h('span', { title: `${s.name}${s.title ? ` · ${s.title}` : ''}` }, Avatar(s, 34))), staff.length > 14 && h('span', { class: 'home-more' }, `+${staff.length - 14}`)),
    h('p', { class: 'muted small' }, `${staff.length} people · ${Object.keys(org.teams ?? {}).length} teams`));
}

function Reading() {
  if (!has('library')) return null;
  const tags = libraryTags(docs.library).slice(0, 18);
  if (!tags.length) return null;
  const top = tags[0].n;
  return Card('What we’re reading about', 'books', { more: { href: linkTo('library', '#tags'), label: 'Tags →' }, toneId: 'library' },
    h('div', { class: 'tag-cloud compact' }, [...tags].sort((a, b) => a.tag.localeCompare(b.tag)).map((t) => h('a', { class: 'cloud-tag', href: linkTo('library', `#tag/${encodeURIComponent(t.tag)}`), style: `font-size:${(0.8 + (t.n / top) * 0.55).toFixed(2)}rem; --w:${(0.35 + (t.n / top) * 0.65).toFixed(2)}` }, t.tag))));
}

function Sites() {
  const sites = Object.values(org.sites ?? {});
  if (!sites.length) return null;
  return Card('Public sites', 'globe', { more: { href: linkTo('pages'), label: 'Web →' }, toneId: 'pages' },
    h('ul', { class: 'home-sites' }, sites.map((s) => {
      const live = Object.values(dashboards.dashboards).filter((d) => d.siteId === s.id && d.visibility === 'public').length;
      return h('li', {}, h('a', { href: `site.html?site=${s.id}`, target: '_blank' }, s.name), h('span', { class: `badge badge-sm ${s.visibility}` }, s.visibility), h('small', {}, live ? `${live} live dashboard${live > 1 ? 's' : ''}` : ''));
    })));
}

/* Quick starts for the things people come to do. */
const QUICK = [
  { plugin: 'mapper', label: 'Map the ecosystem', sub: 'Add actors and links', glyph: 'sec-mapper', href: linkTo('mapper') },
  { plugin: 'strategy', label: 'Add a task', sub: 'In a workplan', glyph: 'checklist', href: linkTo('strategy', '#workplans') },
  { plugin: 'assets', label: 'Upload assets', sub: 'Files, photos, audio', glyph: 'cloudUpload', href: linkTo('assets') },
  { plugin: 'library', label: 'Add a reading', sub: 'A paper, report or link', glyph: 'books', href: linkTo('library', '#files/all') },
  { plugin: 'podcasts', label: 'New episode', sub: 'Record, upload or link', glyph: 'mic', href: linkTo('podcasts') },
  { plugin: 'social', label: 'Create a post', sub: 'For every network at once', glyph: 'share', href: linkTo('social', '#compose') },
];

/* The side nav: a few of the things people reach for most, kept short. */
function HomeNav() {
  const mine = has('strategy') ? nodes.filter((n) => n.type === 'task' && n.status !== 'done' && (n.assigneeIds ?? []).includes(me?.id)).sort((a, b) => (a.end ?? '9').localeCompare(b.end ?? '9')) : [];
  const recent = [];
  for (const [id, m] of Object.entries(docs.maps?.maps ?? {})) if (has('mapper')) recent.push({ at: m.updatedAt, label: m.title, sub: 'Ecosystem map', icon: 'sec-mapper', href: linkTo('mapper', `#${id}`) });
  for (const it of Object.values(docs.library?.items ?? {})) if (has('library')) recent.push({ at: it.updatedAt, label: it.meta?.title || 'Untitled', sub: it.kind === 'doc' ? 'Dashi doc' : 'Reading', icon: it.kind === 'doc' ? 'doc' : 'books', href: linkTo('library', `#item/${it.id}`) });
  for (const e of Object.values(docs.podcasts?.episodes ?? {})) if (has('podcasts') && e.publishedAt) recent.push({ at: e.publishedAt, label: e.title, sub: 'Episode', icon: 'mic', href: linkTo('podcasts', `#episodes/${e.id}`) });
  const t = (x) => (typeof x.at === 'number' ? x.at : new Date(x.at ?? 0).getTime()) || 0;
  const tags = has('library') ? libraryTags(docs.library).slice(0, 5) : [];
  const top = plugins.filter((p) => !p.parent);
  return SideNav({ label: 'Home', sections: [
    { title: 'Home', items: [
      { label: 'Overview', sub: me ? `${hello}, ${me.name.split(' ')[0]}` : 'Your organisation today', icon: 'home', href: 'index.html', on: true },
      has('strategy') && { label: 'My work', sub: mine.length ? `${mine.length} open task${mine.length === 1 ? '' : 's'}` : 'Nothing assigned to you', icon: 'checklist', href: 'me.html' },
      { label: 'People', sub: `${Object.keys(org.staff ?? {}).length} people · ${Object.keys(org.teams ?? {}).length} teams`, icon: 'people', href: 'org.html#people' },
    ] },
    { title: 'Quick actions', items: QUICK.filter((q) => has(q.plugin)).slice(0, 5).map((q) => ({ label: q.label, sub: q.sub, icon: q.glyph, href: q.href })) },
    mine.length > 0 && { title: 'Your tasks', items: mine.slice(0, 3).map((n) => ({ label: n.title, sub: n.end ? (n.end < now ? `Overdue · ${short(n.end)}` : `Due ${short(n.end)}`) : 'No date', icon: 'check', href: linkTo('strategy', `#${n.id}`) })) },
    recent.length > 0 && { title: 'Recently changed', items: recent.sort((a, b) => t(b) - t(a)).slice(0, 4).map(({ at, ...x }) => ({ ...x, sub: `${x.sub} · ${ago(at)}` })) },
    { title: 'Plugins', items: top.slice(0, 6).map((p) => ({ label: p.name, sub: p.stats(docs) || p.blurb || '', icon: p.icon, href: p.href })).concat(top.length > 6 ? [{ label: 'All plugins', sub: `${top.length} on for you`, icon: 'sec-plugins', href: '#plugins' }] : []) },
    tags.length > 0 && { title: 'Tags', items: tags.map((x) => ({ label: x.tag, sub: `${x.n} reading${x.n === 1 ? '' : 's'}`, icon: 'tag', href: linkTo('library', `#tag/${encodeURIComponent(x.tag)}`) })) },
  ].filter(Boolean) });
}

const app = document.querySelector('#app');
app.classList.add('frame', 'home-app');
app.replaceChildren(
  HomeNav(),
  h('section', { class: 'palette-main home-col' },
    PluginHeader('home', { title: org.name, blurb: org.mission || 'Your organisation today: what needs you, what’s moving, where the plan stands and who is around.' }),
    h('div', { class: 'page home' },
      h('div', { class: 'home-grid' },
        h('div', { class: 'home-main' }, MyWork(), Moving(), Strategy()),
        h('div', { class: 'home-side' }, Ecosystem(), Team(), Reading(), Sites())),
      h('h2', { class: 'home-plugins-title', id: 'plugins' }, 'Your plugins'),
      h('div', { class: 'home-plugins' },
        // Sub-plugins show inside their parent's tile (0.2: Data Workbench in the Portal, Library in Assets, Studio in Strategy).
        plugins.filter((p) => !p.parent).map((p) => {
          const kids = plugins.filter((k) => k.parent === p.id);
          return h('div', { class: 'plugin-tile', style: `--tone:${p.tone ?? 'var(--accent)'}` },
            h('a', { class: 'plugin-tile-main', href: p.href },
              h('span', { class: 'tone-tile', 'aria-hidden': 'true' }, icon(p.icon, 20)),
              h('span', { class: 'plugin-tile-text' }, h('strong', {}, p.name), h('small', {}, p.stats(docs)))),
            kids.length > 0 && h('span', { class: 'plugin-tile-kids' }, kids.map((k) => h('a', { href: k.href, title: k.stats(docs) }, icon(k.icon, 13), k.name))));
        })),
      h('p', { class: 'note' }, 'Dashi is in alpha. Something odd, or an idea? Use Feedback at the bottom right of any page.'))),
);
