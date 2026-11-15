import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc, loadDoc, saveDoc } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts, loadPages, loadPlanDocs, loadLibrary } from '../platform/docs.js';
import { svg } from '../core/svg.js';
import { criticalOn, onSiteFor, migrateCritical, DOC as CRITICAL_DOC } from '../platform/criticalMedia.js';
import { SITE_HEROES, SITE_TYPES, siteLook } from '../platform/org.js';
import { isLivePlan } from '../platform/plandocs.js';
import { applyTheme, paletteById, shapeById } from '../platform/themes.js';
import { Logo } from '../ui/Shell.js';
import { PAGE_KINDS, uniqueSlug, isLive, embedsIn, siteContent } from '../platform/pages.js';
import { published } from '../platform/podcasts.js';
import { pluginOn, staffList } from '../platform/org.js';
import { currentUser } from '../platform/session.js';
import { DashboardView } from '../charts/DashboardView.js';
import { CalculatorView } from '../charts/CalculatorView.js';
import { StoryView } from '../charts/StoryView.js';
import { Markdown } from '../ui/markdown.js';
import { readImage } from '../ui/images.js';
import { EpisodeCard, ShowCard, Player } from '../site/station.js';
import { today, short } from '../strategy/dates.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/dialog.js';

/**
 * Public Portal (formerly Web views, and before that Sites & Pages): one
 * way in to everything the org shows outside, and to its members-only
 * portals (the board's). The overview opens on a map of the org's web
 * properties (each site, and what is live or still in design on it,
 * every piece a link to where it is made), walks through getting the
 * public side working, then shows each site as visitors meet it, with its
 * look. Pages and news articles are written here too.
 *
 *   #sites        the overview: the properties map, steps, then every site
 *   #<page id>    edit a page or article, with a live preview
 *
 * Bodies are light markdown with shortcodes for live embeds
 * ([[dashboard:id]], [[episode:id]], [[show:id]]); see platform/pages.js.
 */
const org = loadOrg();
const store = new Store(loadPages(), applyCollectionOp);
autosaveDoc('pages', store, 250);
Shell(document.querySelector('#shell'), { current: 'pages', org });
// Other plugins' content, for embeds and the site overview.
const docs = { org, strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards(), podcasts: loadPodcasts(), plandocs: loadPlanDocs(), library: loadLibrary(), critical: migrateCritical(loadDoc(CRITICAL_DOC)) };

const app = document.querySelector('#app');
app.classList.add('palette', 'sites-app', 'frame');
let side = h('nav');
const main = h('section', { class: 'palette-main' });
const player = Player(() => docs.podcasts);
player.el.classList.add('admin-player');
app.replaceChildren(side, main, player.el);

const now = today();
const route = () => decodeURIComponent(location.hash.slice(1)) || 'sites';
const doc = () => store.doc;
const siteUrl = (siteId, extra = {}) => `site.html?${new URLSearchParams({ site: siteId, ...extra })}`;
const ctx = { doc: docs.podcasts, org, today: now, player, link: () => '#' };
const publicDashboards = () => Object.values(docs.dashboards.dashboards).filter((d) => d.visibility === 'public');
const liveEpisodes = () => Object.values(docs.podcasts.episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

function renderSide() {
  const r = route();
  const list = (kind) => Object.values(doc().pages).filter((p) => p.kind === kind)
    .sort((a, b) => (kind === 'article' ? b.publishedAt.localeCompare(a.publishedAt) : (a.siteId ?? '').localeCompare(b.siteId ?? '') || a.order - b.order));
  const item = (p) => ({
    label: p.title, href: `#${p.id}`, on: r === p.id,
    lead: h('span', { class: 'side-lead' }, h('span', { class: `status-dot ${isLive(p, now) ? 'live' : p.status}`, title: isLive(p, now) ? 'Published' : p.status === 'draft' ? 'Draft' : 'Scheduled' })),
    sub: [org.sites[p.siteId]?.name ?? 'No site', p.kind === 'article' ? short(p.publishedAt) : p.inNav ? 'in menu' : null].filter(Boolean).join(' · '),
  });
  const siteItem = (x) => ({ label: x.name, href: `#site/${x.id}`, on: r === `site/${x.id}`, icon: x.visibility === 'private' ? 'lock' : x.visibility === 'unlisted' ? 'eyeOff' : 'globe',
    sub: x.visibility === 'private' ? 'Members only' : `${x.visibility === 'unlisted' ? 'Unlisted' : 'Public'} · ${propertiesOf(x).filter((q) => q.live).length} live` });
  const byVis = (v) => Object.values(org.sites).filter((x) => (v === 'private' ? x.visibility === 'private' : x.visibility !== 'private'));
  side = swapSide(side, SideNav({ label: 'Public Portal', sections: [
    { title: 'Public Portal', items: [
      { label: 'Overview', sub: 'Every site, and what is live', icon: 'home', href: '#sites', on: r === 'sites' },
      { label: 'Dashboards', sub: 'Data Workbench', icon: 'chart', href: 'palette.html#dashboards' },
      { label: 'Feedback forms', sub: 'Data Workbench', icon: 'chats', href: 'palette.html#feedback' },
      { label: 'Strategic plan', sub: 'Plan designer', icon: 'strategy', href: 'plandoc.html' },
      pluginOn(org, 'podcasts') && { label: 'Podcast station', sub: 'Podcasts', icon: 'mic', href: 'podcasts.html#station' },
      criticalOn(org) && { label: 'Media smart', sub: 'Critical Media', icon: 'news', href: 'plugin.html?id=critical-media' },
    ].filter(Boolean) },
    { title: 'Sites', action: { label: 'New site', onclick: newSite }, items: byVis('public').map(siteItem) },
    byVis('private').length > 0 && { title: 'Members only', items: byVis('private').map(siteItem) },
    { title: 'Pages', action: { label: 'New page', onclick: () => newPage('page') }, items: [...list('page').map(item), { label: 'New page', icon: 'plus', onclick: () => newPage('page') }] },
    { title: 'News articles', action: { label: 'New article', onclick: () => newPage('article') }, items: [...list('article').map(item), { label: 'New article', icon: 'plus', onclick: () => newPage('article') }] },
  ].filter(Boolean) }));
}

async function newSite() {
  const name = await uiPrompt('Name the new site (you can change it later)', 'New site');
  if (!name?.trim()) return;
  const id = `site-${Math.random().toString(36).slice(2, 8)}`;
  org.sites[id] = { id, name: name.trim(), url: '', visibility: 'unlisted', shows: '', look: { hero: 'soft', type: 'sans' } };
  saveDoc('org', org);
  location.hash = `site/${id}`;
}

function render() {
  renderSide();
  const r = route();
  const p = doc().pages[r];
  const site = r.startsWith('site/') && org.sites[r.slice(5)];
  main.replaceChildren(p ? Editor(p) : site ? SitePage(site) : Sites());
}

function newPage(kind, forSite = null) {
  const siteId = forSite ?? Object.values(org.sites).find((s) => s.visibility === 'public')?.id ?? Object.keys(org.sites)[0] ?? null;
  const title = kind === 'article' ? 'Untitled article' : 'Untitled page';
  const op = store.apply(col.add('pages', {
    kind, title, slug: uniqueSlug(doc(), title, siteId), summary: '', body: '', cover: null, siteId,
    status: 'draft', publishedAt: now, authorId: currentUser(org)?.id ?? null, inNav: kind === 'page',
    order: Object.values(doc().pages).filter((x) => x.kind === 'page' && x.siteId === siteId).length,
  }));
  location.hash = op.id;
}

function Sites() {
  const sites = Object.values(org.sites);
  const publicSites = sites.filter((s) => s.visibility === 'public');
  const pages = Object.values(doc().pages);
  const dashes = Object.values(docs.dashboards.dashboards);
  const plans = Object.values(docs.plandocs.docs);
  const hasPods = pluginOn(org, 'podcasts');
  const station = hasPods && org.sites[docs.podcasts.station.siteId];

  // Getting the public side working, step by step.
  const steps = [
    { done: publicSites.length > 0 && !!org.theme?.palette, title: 'Your look and your sites', text: org.theme?.palette ? `${paletteById[org.theme.palette]?.label ?? org.theme.palette} colours, ${shapeById[org.theme.shape]?.label?.toLowerCase() ?? 'rounded'} shapes, ${publicSites.length} public site${publicSites.length === 1 ? '' : 's'}.` : 'Pick your colours and shape, and name your public sites.', href: 'org.html#sites', action: 'Theme and sites' },
    { done: dashes.some((d) => d.visibility === 'public' && d.siteId), title: 'Live dashboards', text: `${dashes.filter((d) => d.visibility === 'public' && d.siteId).length} of ${dashes.length} dashboards are public. Design them as visitors will see them.`, href: 'palette.html#dashboards', action: 'Design dashboards' },
    { done: plans.some(isLivePlan), title: 'Your strategic plan', text: plans.some(isLivePlan) ? 'Your plan is online, and downloads as a PDF.' : 'Turn your strategy into a designed plan to read online or download as a PDF.', href: 'plandoc.html', action: 'Plan designer' },
    hasPods && { done: !!station, title: 'Your podcast station', text: station ? `On ${station.name}, with ${liveEpisodes().length} episodes out.` : 'Put the station on a site so listeners can find it.', href: 'podcasts.html#station', action: 'Station' },
    { done: pages.some((p) => p.kind === 'page' && isLive(p, now)), title: 'Pages and news', text: `${pages.filter((p) => p.kind === 'page' && isLive(p, now)).length} pages and ${pages.filter((p) => p.kind === 'article' && isLive(p, now)).length} articles are live. Say who you are and what’s new.`, onclick: () => newPage('page'), action: 'New page' },
  ].filter(Boolean);
  const doneCount = steps.filter((x) => x.done).length;

  return h('div', { class: 'wv' },
    PluginHeader('pages', { blurb: 'One way in to everything you show outside: your public sites, their dashboards, plan, station, pages and news, and the members-only portals for your board.' }),
    PropertiesMap(),
    h('section', { class: 'wv-steps' },
      h('div', { class: 'wv-steps-head' },
        h('h2', {}, 'Getting your public side working'),
        h('span', { class: 'wv-progress' }, h('span', { style: `width:${(doneCount / steps.length) * 100}%` })),
        h('span', { class: 'muted small' }, `${doneCount} of ${steps.length} done`)),
      h('ol', {}, steps.map((x, i) => h('li', { class: x.done ? 'done' : '' },
        h('span', { class: 'wv-step-num' }, x.done ? '✓' : String(i + 1)),
        h('div', {}, h('strong', {}, x.title), h('p', {}, x.text)),
        x.href ? h('a', { class: `btn btn-sm ${x.done ? 'btn-ghost' : 'btn-primary'}`, href: x.href }, x.action) : h('button', { class: `btn btn-sm ${x.done ? 'btn-ghost' : 'btn-primary'}`, onclick: x.onclick }, x.action))))),
    h('div', { class: 'wv-sites-head' },
      h('h2', { class: 'wv-h2' }, 'Your sites, as visitors see them'),
      h('button', { class: 'btn btn-sm', onclick: newSite }, icon('plus', 14), 'New site')),
    h('div', { class: 'wv-site-grid' }, sites.map((s) => SiteCard(s))));
}

/**
 * Every property on a site: what it is, whether it is live or still in design,
 * and where it is made. A members-only site's pieces are live when members can see them.
 */
function propertiesOf(site) {
  const out = [];
  const isPublic = site.visibility !== 'private';
  const add = (kind, icon, title, live, href) => out.push({ kind, icon, title, live, href });
  for (const d of Object.values(docs.dashboards.dashboards).filter((x) => x.siteId === site.id)) add('Dashboard', 'chart', d.title, !isPublic || (d.visibility === 'public' && site.visibility === 'public'), `palette.html#${d.id}`);
  for (const d of Object.values(docs.plandocs.docs).filter((x) => x.siteId === site.id)) add('Plan', 'strategy', docs.strategy.nodes[d.planId]?.title ?? d.snapshot?.plan?.title ?? 'Plan', isLivePlan(d), `plandoc.html#${d.id}`);
  if (pluginOn(org, 'podcasts') && docs.podcasts.station.siteId === site.id) add('Station', 'mic', docs.podcasts.station.name, liveEpisodes().length > 0, 'podcasts.html#station');
  for (const x of Object.values(docs.dashboards.stories ?? {}).filter((y) => y.siteId === site.id)) add('Story', 'story', x.title, x.visibility === 'public', 'palette.html#stories');
  for (const x of Object.values(docs.dashboards.calculators ?? {}).filter((y) => y.siteId === site.id)) add('Calculator', 'gift', x.title, x.visibility === 'public', 'palette.html#impact');
  const pages = Object.values(doc().pages).filter((p) => p.siteId === site.id);
  for (const p of pages.filter((x) => x.kind === 'page')) add('Page', 'doc', p.title, isLive(p, now), `#${p.id}`);
  const articles = pages.filter((x) => x.kind === 'article');
  if (articles.length) add('News', 'news', `${articles.filter((a) => isLive(a, now)).length} articles`, articles.some((a) => isLive(a, now)), `#${articles[0].id}`);
  for (const f of Object.values(docs.dashboards.forms ?? {}).filter((x) => x.siteId === site.id)) add('Feedback', 'chats', f.title, !isPublic || f.visibility === 'public', 'palette.html#feedback');
  if (site.visibility === 'public' && criticalOn(org) && docs.critical.settings?.corner !== false && onSiteFor(docs.critical.settings ?? {}, site.id)) add('Media smart', 'news', 'Lessons and tips', true, 'plugin.html?id=critical-media');
  if (!isPublic) {
    const board = Object.values(docs.library.items ?? {}).filter((it) => (it.tags ?? []).includes('board'));
    for (const [tag, label, icon] of [['governance', 'Governance', 'scales'], ['minutes', 'Minutes', 'notePencil'], ['finance', 'Finance', 'chart']]) {
      const n = board.filter((it) => it.tags.includes(tag)).length;
      add('Papers', icon, `${label}: ${n} document${n === 1 ? '' : 's'}`, n > 0, `library.html#tag/${tag}`);
    }
  }
  return out;
}

/**
 * The properties map: the portal in the middle of everything the org shows.
 * The portal on the left, each site in the middle, and its pieces to the
 * right as pills: solid when live, dashed while in design. Everything is a link.
 */
function PropertiesMap() {
  const sites = Object.values(org.sites).sort((a, b) => ({ public: 0, unlisted: 1, private: 2 })[a.visibility] - ({ public: 0, unlisted: 1, private: 2 })[b.visibility]);
  if (!sites.length) return null;
  const W = 1040, siteX = 250, siteW = 210, pillX = 520, pillMax = W - pillX - 10, rowH = 30;
  const textW = (t) => t.length * 6.3;
  const layout = sites.map((site) => {
    const props = propertiesOf(site);
    const rows = [[]];
    let x = 0;
    for (const p of props) {
      const label = `${p.title.length > 30 ? `${p.title.slice(0, 29)}…` : p.title}`;
      const w = Math.min(pillMax, 34 + textW(p.kind) + textW(label) + 8);
      if (x + w > pillMax && rows.at(-1).length) { rows.push([]); x = 0; }
      rows.at(-1).push({ ...p, label, x, w });
      x += w + 8;
    }
    return { site, props, rows, h: Math.max(64, rows.length * rowH + 20) };
  });
  const gap = 22;
  const H = layout.reduce((t, l) => t + l.h, 0) + gap * (layout.length - 1) + 40;
  const el = svg('svg', { class: 'pm', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Your public properties' });
  const hubY = H / 2;
  // The hub
  const hub = svg('g', { class: 'pm-hub' }, el);
  svg('circle', { cx: 92, cy: hubY, r: 58, class: 'pm-hub-ring' }, hub);
  svg('circle', { cx: 92, cy: hubY, r: 46, class: 'pm-hub-core' }, hub);
  svg('text', { x: 92, y: hubY - 4, 'text-anchor': 'middle', class: 'pm-hub-title' }, hub).textContent = 'Public';
  svg('text', { x: 92, y: hubY + 13, 'text-anchor': 'middle', class: 'pm-hub-title' }, hub).textContent = 'Portal';
  let y = 20;
  let live = 0, design = 0;
  for (const l of layout) {
    const cy = y + l.h / 2;
    const isPrivate = l.site.visibility === 'private';
    // Hub → site
    svg('path', { class: `pm-link${isPrivate ? ' private' : ''}`, d: `M150 ${hubY} C 200 ${hubY}, 200 ${cy}, ${siteX} ${cy}` }, el);
    // The site
    const a = svg('a', { href: `#site/${l.site.id}`, class: `pm-site ${l.site.visibility}` }, el);
    svg('title', {}, a).textContent = `${l.site.name} (${l.site.visibility}): see and change what is on it`;
    svg('rect', { x: siteX, y: cy - 28, width: siteW, height: 56, rx: 14, class: 'pm-site-box' }, a);
    const ic = h('span'); ic.append(icon(isPrivate ? 'lock' : l.site.visibility === 'unlisted' ? 'eyeOff' : 'globe', 18));
    const g = svg('g', { transform: `translate(${siteX + 14} ${cy - 9})`, class: 'pm-site-icon' }, a);
    g.innerHTML = ic.firstChild.innerHTML;
    g.setAttribute('transform', `translate(${siteX + 14} ${cy - 9}) scale(${18 / 256})`);
    svg('text', { x: siteX + 42, y: cy - 3, class: 'pm-site-name' }, a).textContent = l.site.name.length > 22 ? `${l.site.name.slice(0, 21)}…` : l.site.name;
    svg('text', { x: siteX + 42, y: cy + 14, class: 'pm-site-vis' }, a).textContent = isPrivate ? 'Members only' : `${l.site.visibility === 'unlisted' ? 'Unlisted' : 'Public'} · ${l.props.filter((p) => p.live).length ? `${l.props.filter((p) => p.live).length} live` : 'in design'}`;
    // Site → its pills
    const top = cy - (l.rows.length * rowH) / 2;
    if (l.props.length) svg('path', { class: 'pm-link thin', d: `M${siteX + siteW} ${cy} H ${pillX - 24} M${pillX - 24} ${top + rowH / 2 - 2} V ${top + (l.rows.length - 0.5) * rowH + 2}` }, el);
    else svg('text', { x: pillX, y: cy + 4, class: 'pm-empty' }, el).textContent = 'Nothing here yet';
    l.rows.forEach((row, ri) => {
      const ry = top + ri * rowH + 3;
      svg('path', { class: 'pm-link thin', d: `M${pillX - 24} ${ry + 12} H ${pillX - 2}` }, el);
      for (const p of row) {
        p.live ? live++ : design++;
        const pa = svg('a', { href: p.href, class: `pm-pill ${p.live ? 'live' : 'design'}` }, el);
        svg('title', {}, pa).textContent = `${p.kind}: ${p.title}. ${p.live ? 'Live' : 'In design'}. Open where it is made.`;
        svg('rect', { x: pillX + p.x, y: ry, width: p.w, height: 24, rx: 12, class: 'pm-pill-box' }, pa);
        svg('circle', { cx: pillX + p.x + 13, cy: ry + 12, r: 4, class: 'pm-pill-dot' }, pa);
        const t = svg('text', { x: pillX + p.x + 24, y: ry + 16, class: 'pm-pill-text' }, pa);
        svg('tspan', { class: 'pm-pill-kind' }, t).textContent = `${p.kind} `;
        svg('tspan', {}, t).textContent = p.label;
      }
    });
    y += l.h + gap;
  }
  return h('section', { class: 'pm-panel' },
    h('div', { class: 'pm-head' },
      h('div', {}, h('h2', {}, 'Your web properties'), h('p', { class: 'muted small' }, 'Everything you show outside, site by site. Click a site to manage it, or a piece to change it.')),
      h('div', { class: 'pm-legend' },
        h('span', {}, h('i', { class: 'pm-key live' }), `${live} live`),
        h('span', {}, h('i', { class: 'pm-key design' }), `${design} in design`),
        h('span', {}, icon('lock', 13), 'Members only'))),
    h('div', { class: 'pm-scroll' }, el));
}

/**
 * The site itself, small: the real front page in a frame, scaled down, so the
 * preview is exactly what visitors get (in the site's look, with live data).
 */
function SitePreview(s, { width = 1280, height = 900, scale = 0.25, page = null, phone = false } = {}) {
  const w = phone ? 390 : width, hgt = phone ? 780 : height;
  const src = siteUrl(s.id, { frame: '1', ...(page ? { page } : {}) });
  const frame = h('iframe', { src, title: `${s.name}, as visitors see it`, loading: 'lazy', tabindex: '-1', 'aria-hidden': 'true',
    style: `width:${w}px;height:${hgt}px;transform:scale(${scale})` });
  return h('div', { class: `wv-frame${phone ? ' phone' : ''}`, style: `width:${Math.round(w * scale)}px;height:${Math.round(hgt * scale)}px` },
    h('div', { class: 'wv-frame-bar' }, h('i'), h('i'), h('i'), h('span', {}, (s.url || `${org.name} · ${s.name}`).replace(/^https?:\/\//, ''))),
    h('div', { class: 'wv-frame-view' }, frame));
}

const visLabel = (v) => ({ public: 'Public', unlisted: 'Unlisted', private: 'Members only' })[v] ?? v;
const visBlurb = (v) => ({ public: 'Anyone can find it, and it is listed on your other sites.', unlisted: 'Anyone with the link can read it, but it is not listed anywhere yet.', private: 'Only signed-in staff and board members (Viewer role and up) can open it.' })[v];

/** A site on the overview: its front page, small, what is on it, and the way in. */
function SiteCard(s) {
  const props = propertiesOf(s);
  const live = props.filter((p) => p.live).length;
  return h('article', { class: `wv-card ${s.visibility}` },
    h('a', { class: 'wv-card-shot', href: `#site/${s.id}`, title: `Manage ${s.name}` }, SitePreview(s, { scale: 0.24 })),
    h('div', { class: 'wv-card-body' },
      h('div', { class: 'wv-card-title' },
        h('a', { href: `#site/${s.id}` }, h('strong', {}, s.name)),
        h('span', { class: `wv-vis ${s.visibility}` }, icon(s.visibility === 'private' ? 'lock' : s.visibility === 'unlisted' ? 'eyeOff' : 'globe', 12), visLabel(s.visibility))),
      h('p', { class: 'muted small' }, s.shows || s.url || 'Nothing described yet.'),
      h('div', { class: 'wv-card-kinds' }, [...new Set(props.map((p) => p.kind))].slice(0, 6).map((k) => {
        const of = props.filter((p) => p.kind === k);
        return h('span', { class: `wv-kind-pill ${of.some((p) => p.live) ? 'live' : 'design'}` }, `${k}${of.length > 1 ? ` · ${of.length}` : ''}`);
      })),
      h('div', { class: 'wv-card-foot' },
        h('span', { class: 'muted small' }, props.length ? `${live} live, ${props.length - live} in design` : 'Nothing on it yet'),
        h('a', { class: 'btn btn-xs btn-ghost', href: siteUrl(s.id), target: '_blank', rel: 'noopener' }, icon('share', 12), 'Open'),
        h('a', { class: 'btn btn-xs btn-primary', href: `#site/${s.id}` }, 'Manage'))));
}

/** One site: the real thing on the left, everything on it (and its settings) on the right. */
function SitePage(s) {
  const c = siteContent(doc(), s.id, now);
  const isPublic = s.visibility !== 'private';
  const drafts = Object.values(doc().pages).filter((p) => p.siteId === s.id && !isLive(p, now));
  const props = propertiesOf(s);
  const look = siteLook(s);
  const saveSite = (patch, redraw = true) => { Object.assign(org.sites[s.id], patch); saveDoc('org', org); if (redraw) render(); };
  const setLook = (patch) => saveSite({ look: { ...look, ...patch } });
  const phone = !!ctx.phone;
  const groups = {};
  for (const p of props) (groups[p.kind] ??= []).push(p);
  const kindLabel = { Dashboard: 'Dashboards', Plan: 'Strategic plan', Station: 'Podcast station', Story: 'Data stories', Calculator: 'Impact calculators', Page: 'Pages', News: 'News', Feedback: 'Feedback forms', 'Media smart': 'Media smart', Papers: 'Board papers' };
  const addLinks = [
    { label: 'Page', icon: 'doc', onclick: () => newPage('page', s.id) },
    { label: 'News article', icon: 'news', onclick: () => newPage('article', s.id) },
    { label: 'Dashboard', icon: 'chart', href: 'palette.html#dashboards' },
    { label: 'Feedback form', icon: 'chats', href: 'palette.html#feedback' },
    { label: 'Data story', icon: 'story', href: 'palette.html#stories' },
    !isPublic && { label: 'Board paper', icon: 'books', href: 'library.html#tag/board' },
  ].filter(Boolean);

  return h('div', { class: 'wv-sitepage' },
    h('nav', { class: 'crumbs muted small' }, h('a', { href: '#sites' }, 'Public Portal'), ' / ', s.name),
    h('header', { class: 'wv-sitepage-head' },
      h('div', { class: 'wv-sitepage-title' },
        h('input', { class: 'title-input', name: 'site-name', value: s.name, 'aria-label': 'Site name', onchange: (e) => saveSite({ name: e.target.value.trim() || s.name }) }),
        h('span', { class: 'muted small' }, visBlurb(s.visibility))),
      h('div', { class: 'wv-sitepage-actions' },
        h('a', { class: 'btn btn-sm btn-primary', href: siteUrl(s.id), target: '_blank', rel: 'noopener' }, icon(isPublic ? 'globe' : 'lock', 14), isPublic ? 'Open the site' : 'Open the portal'))),
    h('div', { class: 'wv-sitepage-grid' },
      h('section', { class: 'wv-sitepage-preview' },
        h('div', { class: 'wv-preview-bar' },
          h('div', { class: 'seg', role: 'tablist' },
            h('button', { role: 'tab', class: phone ? '' : 'on', onclick: () => { ctx.phone = false; render(); } }, icon('tiles', 14), 'Desktop'),
            h('button', { role: 'tab', class: phone ? 'on' : '', onclick: () => { ctx.phone = true; render(); } }, icon('phone', 14), 'Phone')),
          h('span', { class: 'muted small' }, 'Live: this is the site as visitors get it today.')),
        h('div', { class: 'wv-preview-stage' }, SitePreview(s, phone ? { phone: true, scale: 0.78 } : { scale: 0.5 })),
        h('div', { class: 'wv-look' },
          h('span', { class: 'wv-look-label' }, 'Hero'),
          h('div', { class: 'join' }, SITE_HEROES.map((x) => h('button', { class: `btn btn-xs join-item${look.hero === x.id ? ' btn-active' : ''}`, title: x.blurb, onclick: () => setLook({ hero: x.id }) }, x.label))),
          h('span', { class: 'wv-look-label' }, 'Type'),
          h('div', { class: 'join' }, SITE_TYPES.map((x) => h('button', { class: `btn btn-xs join-item${look.type === x.id ? ' btn-active' : ''}`, title: x.blurb, onclick: () => setLook({ type: x.id }) }, x.label))),
          h('a', { class: 'link small', href: 'org.html#sites' }, 'Colours and shapes'))),
      h('aside', { class: 'wv-sitepage-side' },
        h('section', { class: 'wv-box' },
          h('h3', {}, 'Settings'),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Who can see it'),
            h('select', { class: 'select select-sm w-full', name: 'site-vis', onchange: (e) => saveSite({ visibility: e.target.value }) },
              options([{ id: 'public', label: 'Public: listed and open to all' }, { id: 'unlisted', label: 'Unlisted: open to anyone with the link' }, { id: 'private', label: 'Members only: sign in to see it' }], s.visibility))),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Address'),
            h('input', { class: 'input input-sm w-full', name: 'site-url', value: s.url ?? '', placeholder: 'https://…', onchange: (e) => saveSite({ url: e.target.value.trim() }) })),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'What it shows (one line)'),
            h('input', { class: 'input input-sm w-full', name: 'site-shows', value: s.shows ?? '', onchange: (e) => saveSite({ shows: e.target.value }, false) }))),
        h('section', { class: 'wv-box' },
          h('h3', {}, 'On this site', h('small', { class: 'muted' }, ` ${props.filter((p) => p.live).length} live · ${props.filter((p) => !p.live).length} in design`)),
          props.length ? Object.entries(groups).map(([k, list]) => h('div', { class: 'wv-group' },
            h('h4', {}, kindLabel[k] ?? k),
            h('ul', {}, list.map((p) => h('li', {},
              icon(p.icon, 15),
              h('a', { class: 'wv-item', href: p.href }, p.title),
              h('span', { class: `wv-chip ${p.live ? 'on' : ''}` }, p.live ? 'Live' : 'In design')))))) : h('p', { class: 'muted small' }, 'Nothing here yet. Add something below.'),
          drafts.length > 0 && h('p', { class: 'muted small' }, `${drafts.length} page${drafts.length === 1 ? '' : 's'} not out yet: `, drafts.map((d, i) => [i ? ', ' : '', h('a', { href: `#${d.id}` }, d.title)])),
          c.nav.length > 0 && h('p', { class: 'muted small' }, 'Menu: Home, ', c.nav.map((p) => p.title).join(', '), '.')),
        h('section', { class: 'wv-box' },
          h('h3', {}, 'Add to this site'),
          h('div', { class: 'wv-add' }, addLinks.map((x) => x.href
            ? h('a', { class: 'btn btn-sm', href: x.href }, icon(x.icon, 14), x.label)
            : h('button', { class: 'btn btn-sm', onclick: x.onclick }, icon(x.icon, 14), x.label)))),
        !isPublic && h('p', { class: 'muted small wv-note' }, icon('info', 13), ' Board papers are Library documents tagged “board” plus governance, minutes or finance.'))));
}

function Editor(p) {
  const save = (patch) => store.apply(col.update('pages', p.id, patch));
  const cur = () => doc().pages[p.id];
  const preview = h('div', { class: 'page-preview site-page-preview' });
  const warnings = h('div', { class: 'embed-warnings' });

  const embed = ({ kind, id }) => {
    if (kind === 'dashboard') { const d = docs.dashboards.dashboards[id]; return d ? DashboardView(d, docs) : null; }
    if (kind === 'episode') { const e = docs.podcasts.episodes[id]; return e ? EpisodeCard(ctx, e, { embed: true }) : null; }
    if (kind === 'show') { const s = docs.podcasts.podcasts[id]; return s ? ShowCard(ctx, s) : null; }
    if (kind === 'calculator') { const c = docs.dashboards.calculators[id]; return c ? CalculatorView(c, docs) : null; }
    if (kind === 'story') { const s = docs.dashboards.stories[id]; return s ? StoryView(s, docs) : null; }
    return null;
  };
  const drawPreview = () => {
    const pg = cur();
    preview.replaceChildren(
      h('article', { class: `site-article ${pg.kind}` },
        h('header', {}, h('h1', {}, pg.title), pg.kind === 'article' && pg.summary && h('p', { class: 'lede' }, pg.summary)),
        pg.cover && h('img', { class: 'article-cover', src: pg.cover, alt: '' }),
        Markdown(pg.body, { embed })));
    // Embeds that won't show on the public site.
    const notes = embedsIn(pg.body).map(({ kind, id }) => {
      if (kind === 'dashboard') { const d = docs.dashboards.dashboards[id]; return !d ? `No dashboard “${id}”.` : d.visibility !== 'public' ? `“${d.title}” is private, so the public site leaves it out.` : null; }
      if (kind === 'episode') { const e = docs.podcasts.episodes[id]; return !e ? `No episode “${id}”.` : !published(e, now) ? `“${e.title}” isn’t published yet, so the public site leaves it out.` : null; }
      if (kind === 'show') return docs.podcasts.podcasts[id] ? null : `No show “${id}”.`;
      if (kind === 'calculator' || kind === 'story') {
        const x = docs.dashboards[kind === 'story' ? 'stories' : 'calculators'][id];
        return !x ? `No ${kind} “${id}”.` : x.visibility !== 'public' ? `“${x.title}” is private, so the public site leaves it out.` : null;
      }
      return null;
    }).filter(Boolean);
    warnings.replaceChildren(...notes.map((n) => h('div', { role: 'status', class: 'alert alert-warning alert-soft' }, n)));
  };

  let timer;
  const body = h('textarea', { class: 'textarea page-body', name: 'page-body', rows: 18, 'aria-label': 'Body', spellcheck: true,
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => { save({ body: body.value }); drawPreview(); }, 250); } }, p.body);
  const insert = (text) => {
    const at = body.selectionStart ?? body.value.length;
    const before = body.value.slice(0, at).replace(/\n*$/, '');
    const after = body.value.slice(at).replace(/^\n*/, '');
    body.value = `${before}${before ? '\n\n' : ''}${text}\n\n${after}`;
    save({ body: body.value });
    drawPreview();
    body.focus();
  };
  const wrap = (mark, placeholder) => {
    const [a, b] = [body.selectionStart, body.selectionEnd];
    const sel = body.value.slice(a, b) || placeholder;
    body.setRangeText(`${mark}${sel}${mark}`, a, b, 'end');
    save({ body: body.value });
    drawPreview();
    body.focus();
  };
  const linkIt = async () => {
    const url = await uiPrompt('Link to (https://…, mailto:…, or a page like site.html?site=site-main&view=station)');
    if (!url) return;
    const [a, b] = [body.selectionStart, body.selectionEnd];
    body.setRangeText(`[${body.value.slice(a, b) || 'link text'}](${url.trim()})`, a, b, 'end');
    save({ body: body.value });
    drawPreview();
  };
  const embedMenu = h('select', { class: 'select select-sm', 'aria-label': 'Insert live content', onchange: (e) => { if (e.target.value) insert(e.target.value); e.target.value = ''; } },
    h('option', { value: '' }, 'Insert…'),
    h('optgroup', { label: 'Dashboards' }, Object.values(docs.dashboards.dashboards).map((d) => h('option', { value: `[[dashboard:${d.id}]]` }, `${d.title}${d.visibility === 'public' ? '' : ' (private)'}`))),
    h('optgroup', { label: 'Impact calculators' }, Object.values(docs.dashboards.calculators).map((c) => h('option', { value: `[[calculator:${c.id}]]` }, `${c.title}${c.visibility === 'public' ? '' : ' (private)'}`))),
    h('optgroup', { label: 'Data stories' }, Object.values(docs.dashboards.stories).map((s) => h('option', { value: `[[story:${s.id}]]` }, `${s.title}${s.visibility === 'public' ? '' : ' (private)'}`))),
    pluginOn(org, 'podcasts') && h('optgroup', { label: 'Podcast episodes' }, liveEpisodes().map((e) => h('option', { value: `[[episode:${e.id}]]` }, `${docs.podcasts.podcasts[e.podcastId]?.title}: ${e.title}`))),
    pluginOn(org, 'podcasts') && h('optgroup', { label: 'Podcast shows' }, Object.values(docs.podcasts.podcasts).map((s) => h('option', { value: `[[show:${s.id}]]` }, s.title))));

  const statusSel = h('select', { class: 'select select-sm', name: 'page-status', 'aria-label': 'Status', onchange: (e) => { save({ status: e.target.value }); render(); } },
    options([{ id: 'draft', label: 'Draft' }, { id: 'published', label: 'Published' }], p.status));
  const live = isLive(p, now);
  const viewHref = siteUrl(p.siteId, { page: p.slug });

  const fields = h('div', { class: 'page-fields' },
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Kind'),
      h('select', { class: 'select select-sm', name: 'page-kind', onchange: (e) => { save({ kind: e.target.value, inNav: e.target.value === 'page' }); render(); } }, options(PAGE_KINDS, p.kind))),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Site'),
      h('select', { class: 'select select-sm', name: 'page-site', onchange: (e) => { save({ siteId: e.target.value, slug: uniqueSlug(doc(), cur().title, e.target.value, p.id) }); render(); } },
        options(Object.values(org.sites).map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), p.siteId))),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Status'), statusSel),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, p.kind === 'article' ? 'Date' : 'Publish from'),
      h('input', { class: 'input input-sm', type: 'date', name: 'page-date', value: p.publishedAt, onchange: (e) => { save({ publishedAt: e.target.value || now }); render(); } })),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Author'),
      h('select', { class: 'select select-sm', name: 'page-author', onchange: (e) => save({ authorId: e.target.value || null }) },
        h('option', { value: '' }, 'No byline'), options(staffList(org).map((s) => ({ id: s.id, label: s.name })), p.authorId))),
    p.kind === 'page' && h('label', { class: 'fieldset feature-toggle' },
      h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', name: 'page-nav', checked: p.inNav, onchange: (e) => save({ inNav: e.target.checked }) }), 'In the site menu'),
    h('label', { class: 'fieldset span-all' }, h('span', { class: 'fieldset-legend' }, 'Address'),
      h('div', { class: 'slug-row' }, h('span', { class: 'muted' }, `${org.sites[p.siteId]?.url || 'site'}/`),
        h('input', { class: 'input input-sm', name: 'page-slug', value: p.slug, onchange: (e) => { save({ slug: uniqueSlug(doc(), e.target.value, p.siteId, p.id) }); render(); } }))));

  drawPreview();
  return h('div', { class: 'page-editor' },
    h('div', { class: 'page-editor-head' },
      h('input', { class: 'title-input station-name', name: 'page-title', value: p.title, 'aria-label': 'Title', onchange: (e) => {
        const title = e.target.value.trim() || 'Untitled';
        // Keep the address in step with the title until the page goes live.
        save({ title, ...(p.status === 'draft' ? { slug: uniqueSlug(doc(), title, p.siteId, p.id) } : {}) });
        render();
      } }),
      h('span', { class: `badge ${live ? 'badge-success' : p.status === 'draft' ? 'badge-ghost' : 'badge-warning'}` }, live ? 'Published' : p.status === 'draft' ? 'Draft' : `Goes live ${short(p.publishedAt)}`),
      live && org.sites[p.siteId]?.visibility === 'public' && h('a', { class: 'btn btn-sm', href: viewHref, target: '_blank', rel: 'noopener' }, icon('globe', 14), 'View on site'),
      p.status === 'draft' && h('button', { class: 'btn btn-sm btn-primary', onclick: () => { save({ status: 'published' }); render(); } }, 'Publish'),
      h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: async () => { if (await uiConfirm(`Delete “${p.title}”?`)) { store.apply(col.remove('pages', p.id)); location.hash = 'sites'; } } }, 'Delete')),
    fields,
    h('div', { class: 'page-columns' },
      h('div', { class: 'page-write' },
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, p.kind === 'article' ? 'Summary (shown in the news list)' : 'Summary'),
          h('input', { class: 'input input-sm', name: 'page-summary', value: p.summary, onchange: (e) => { save({ summary: e.target.value }); drawPreview(); } })),
        h('div', { class: 'cover-row' },
          h('label', { class: 'btn btn-sm' }, icon('media', 14), p.cover ? 'Change cover image' : 'Add a cover image',
            h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (e) => { try { save({ cover: await readImage(e.target.files[0], 1200) }); render(); } catch (err) { uiAlert(err.message); } } })),
          p.cover && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { save({ cover: null }); render(); } }, 'Remove cover')),
        h('div', { class: 'md-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
          h('button', { class: 'btn btn-xs', title: 'Bold', onclick: () => wrap('**', 'bold text') }, h('strong', {}, 'B')),
          h('button', { class: 'btn btn-xs', title: 'Italic', onclick: () => wrap('_', 'italic text') }, h('em', {}, 'I')),
          h('button', { class: 'btn btn-xs', title: 'Heading', onclick: () => insert('## Heading') }, 'H'),
          h('button', { class: 'btn btn-xs', title: 'List', onclick: () => insert('- First\n- Second') }, '• List'),
          h('button', { class: 'btn btn-xs', title: 'Quote', onclick: () => insert('> A quote') }, '“ Quote'),
          h('button', { class: 'btn btn-xs', title: 'Link', onclick: linkIt }, icon('link', 12), 'Link'),
          embedMenu),
        body,
        h('p', { class: 'muted md-help' }, '## Heading · **bold** · _italic_ · - list · 1. numbered · > quote · [text](https://…) · a blank line starts a new paragraph.'),
        warnings),
      h('div', { class: 'page-preview-wrap' }, h('span', { class: 'fieldset-legend' }, 'Preview'), preview)));
}

store.addEventListener('change', renderSide);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
render();
window.sites = { store, docs };
