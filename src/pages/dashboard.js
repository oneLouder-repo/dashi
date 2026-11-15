import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { enabledPlugins } from '../plugins.js';
import { loadAll } from '../platform/docs.js';
import { currentUser } from '../platform/session.js';
import { statusById } from '../platform/strategy.js';
import { addDays, short, today } from '../strategy/dates.js';
import { libraryTags } from '../platform/library.js';
import { MiniMap } from '../ui/MiniMap.js';

/**
 * The organisation's home: what needs you, what's moving, where the
 * strategy stands, the ecosystem at a glance, the team and what you're
 * reading, then the plugins.
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
    h('a', { href: `strategy.html#${t.id}` }, t.title),
    h('span', { class: `when${t.end && t.end < now ? ' late' : ''}` }, t.end ? (t.end < now ? `Overdue · ${short(t.end)}` : short(t.end)) : 'No date'));
  return Card('What needs you', 'checklist', { more: { href: 'me.html', label: 'My work →' }, toneId: 'strategy' },
    mine.length ? h('ul', { class: 'home-tasks' }, mine.slice(0, 6).map(row)) : h('p', { class: 'muted' }, 'No open tasks assigned to you.'),
    team.length ? [h('h3', { class: 'home-sub' }, 'Due soon across the team'), h('ul', { class: 'home-tasks' }, team.map(row))] : null);
}

/* What's moving: recent changes anywhere in Dashi. */
function Moving() {
  const items = [];
  for (const [id, m] of Object.entries(docs.maps?.maps ?? {})) if (has('mapper') && m.updatedAt) items.push({ at: m.updatedAt, glyph: 'sec-mapper', toneId: 'mapper', text: h('span', {}, 'Map ', h('a', { href: `mapper.html#${id}` }, m.title), ' was updated') });
  for (const it of Object.values(docs.library?.items ?? {})) if (has('library') && it.updatedAt) items.push({ at: it.updatedAt, glyph: 'sec-library', toneId: 'library', text: h('span', {}, it.kind === 'doc' ? 'Doc ' : 'Reading ', h('a', { href: `library.html#item/${it.id}` }, it.meta?.title || 'Untitled'), it.kind === 'doc' ? ' was edited' : ' was added or changed') });
  for (const a of (docs.assets?.activity ?? []).slice(0, 3)) if (has('assets')) items.push({ at: a.at, glyph: 'sec-assets', toneId: 'assets', text: h('span', {}, h('b', {}, org.staff[a.by]?.name?.split(' ')[0] ?? 'Someone'), ` ${a.what}`), href: a.key ? `assets.html#key=${encodeURIComponent(a.key)}` : 'assets.html' });
  for (const e of Object.values(docs.podcasts?.episodes ?? {})) if (has('podcasts') && e.publishedAt) items.push({ at: e.publishedAt, glyph: 'sec-podcasts', toneId: 'podcasts', text: h('span', {}, 'Episode ', h('a', { href: `podcasts.html#${e.podcastId ?? ''}` }, e.title), ' went out') });
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
  return Card('Strategy at a glance', 'target', { more: { href: 'strategy.html', label: 'Open the plan →' }, toneId: 'strategy' },
    h('ul', { class: 'home-objectives' }, objectives.map((o) => {
      const ts = tasksUnder(o.id);
      const done = ts.filter((x) => x.status === 'done').length;
      const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
      return h('li', {}, h('a', { href: `strategy.html#${o.id}` }, o.title), h('div', { class: 'home-bar' }, h('span', { style: `width:${pct}%` })), h('small', {}, ts.length ? `${done} of ${ts.length} tasks done` : 'No tasks yet'));
    })));
}

/* The ecosystem: the most recently changed map, drawn small. */
function Ecosystem() {
  if (!has('mapper')) return null;
  const entries = Object.entries(docs.maps?.maps ?? {}).sort((a, b) => String(b[1].updatedAt ?? '').localeCompare(String(a[1].updatedAt ?? '')));
  if (!entries.length) return Card('Your ecosystem', 'sec-mapper', { toneId: 'mapper' }, h('p', { class: 'muted' }, h('a', { href: 'mapper.html' }, 'Start a map'), ' of the people and organisations around your work.'));
  const [id, entry] = entries[0];
  const content = docs.mapContents[id];
  const pic = h('a', { class: 'home-map', href: `mapper.html#${id}`, 'aria-label': `Open ${entry.title}` });
  MiniMap(content, { width: 300, height: 190, label: entry.title }).then((s) => pic.replaceChildren(s)).catch(() => {});
  const actors = Object.values(content?.actors ?? {});
  return Card('Your ecosystem', 'sec-mapper', { more: { href: 'mapper.html', label: 'All maps →' }, toneId: 'mapper' },
    pic,
    h('p', { class: 'home-map-cap' }, h('a', { href: `mapper.html#${id}` }, entry.title), h('span', {}, `${actors.filter((a) => a.kind !== 'agent').length} actors · ${actors.filter((a) => a.kind === 'agent').length} agents · ${Object.keys(content?.connectors ?? {}).length} links`)),
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
  return Card('What we’re reading about', 'books', { more: { href: 'library.html#tags', label: 'Tags →' }, toneId: 'library' },
    h('div', { class: 'tag-cloud compact' }, [...tags].sort((a, b) => a.tag.localeCompare(b.tag)).map((t) => h('a', { class: 'cloud-tag', href: `library.html#tag/${encodeURIComponent(t.tag)}`, style: `font-size:${(0.8 + (t.n / top) * 0.55).toFixed(2)}rem; --w:${(0.35 + (t.n / top) * 0.65).toFixed(2)}` }, t.tag))));
}

function Sites() {
  const sites = Object.values(org.sites ?? {});
  if (!sites.length) return null;
  return Card('Public sites', 'globe', { more: { href: 'pages.html', label: 'Public Portal →' }, toneId: 'pages' },
    h('ul', { class: 'home-sites' }, sites.map((s) => {
      const live = Object.values(dashboards.dashboards).filter((d) => d.siteId === s.id && d.visibility === 'public').length;
      return h('li', {}, h('a', { href: `site.html?site=${s.id}`, target: '_blank' }, s.name), h('span', { class: `badge badge-sm ${s.visibility}` }, s.visibility), h('small', {}, live ? `${live} live dashboard${live > 1 ? 's' : ''}` : ''));
    })));
}

/* Quick starts for the things people come to do. */
const QUICK = [
  { plugin: 'mapper', label: 'Map the ecosystem', glyph: 'sec-mapper', href: 'mapper.html' },
  { plugin: 'strategy', label: 'Add a task', glyph: 'checklist', href: 'strategy.html#workplans' },
  { plugin: 'library', label: 'Add a reading', glyph: 'books', href: 'library.html#files/all' },
  { plugin: 'assets', label: 'Upload assets', glyph: 'cloudUpload', href: 'assets.html' },
  { plugin: 'podcasts', label: 'New episode', glyph: 'mic', href: 'podcasts.html' },
];

document.querySelector('#app').replaceChildren(
  h('div', { class: 'page home' },
    h('header', { class: 'home-head' },
      h('div', {},
        h('p', { class: 'home-hello' }, me ? `${hello}, ${me.name.split(' ')[0]}` : hello),
        h('h1', {}, org.name),
        org.mission && h('p', { class: 'lede' }, org.mission)),
      h('div', { class: 'home-quick' }, QUICK.filter((q) => has(q.plugin)).map((q) => h('a', { class: 'home-quick-btn', href: q.href, style: `--tone:${tone(q.plugin)}` }, icon(q.glyph, 16), q.label)))),
    h('div', { class: 'home-grid' },
      h('div', { class: 'home-main' }, MyWork(), Moving(), Strategy()),
      h('div', { class: 'home-side' }, Ecosystem(), Team(), Reading(), Sites())),
    h('h2', { class: 'home-plugins-title' }, 'Your plugins'),
    h('div', { class: 'home-plugins' },
      plugins.map((p) => h('a', { class: 'plugin-tile', href: p.href, style: `--tone:${p.tone ?? 'var(--accent)'}` },
        h('span', { class: 'tone-tile', 'aria-hidden': 'true' }, icon(p.icon, 20)),
        h('span', { class: 'plugin-tile-text' }, h('strong', {}, p.name), h('small', {}, p.stats(docs)))))),
    h('p', { class: 'note' }, 'Dashi is in alpha. Something odd, or an idea? Use Feedback at the bottom right of any page.')),
);
