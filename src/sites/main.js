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
import { siteDesign, TEMPLATES, templateById, MASTHEADS, MASTHEAD_HEIGHTS, SITE_FONTS, HEADERS } from '../platform/siteDesign.js';
import { mastheadSvg } from '../site/mastheads.js';
import { DevicePreview, DeviceToggle, PhoneShell, deviceMode } from '../ui/DevicePreview.js';
import { setCrumbs } from '../ui/crumbs.js';
import { isLivePlan } from '../platform/plandocs.js';
import { applyTheme, paletteById, shapeById, PALETTES, SHAPES } from '../platform/themes.js';
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
import { uiAlert, uiConfirm, uiPrompt, uiPanel } from '../ui/dialog.js';

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
 *   #look         the look of every public site: colour palette and shapes
 *   #site/<id>    one site: its preview, settings, hero and type
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
      { label: 'Look and feel', sub: org.theme?.palette ? `${paletteById[org.theme.palette]?.label ?? 'Your'} colours, ${shapeById[org.theme.shape]?.label?.toLowerCase() ?? 'rounded'}` : 'Colours and shapes', icon: 'palette', href: '#look', on: r === 'look' || r.startsWith('look/') },
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
  org.sites[id] = { id, name: name.trim(), url: '', visibility: 'unlisted', shows: '', look: { template: 'harbour' } };
  saveDoc('org', org);
  location.hash = `site/${id}`;
}

function render() {
  renderSide();
  const r = route();
  const p = doc().pages[r];
  const site = r.startsWith('site/') && org.sites[r.slice(5)];
  main.replaceChildren(p ? Editor(p) : site ? SitePage(site) : r === 'look' || r.startsWith('look/') ? Look(r.slice(5)) : Sites());
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
    { done: publicSites.length > 0 && !!org.theme?.palette, title: 'Your look and your sites', text: org.theme?.palette ? `${paletteById[org.theme.palette]?.label ?? org.theme.palette} colours, ${shapeById[org.theme.shape]?.label?.toLowerCase() ?? 'rounded'} shapes, ${publicSites.length} public site${publicSites.length === 1 ? '' : 's'}.` : 'Pick your colours and shape, and name your public sites.', href: '#look', action: 'Look and feel' },
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
      h('span', { class: 'spacer' }),
      DeviceToggle(() => render()),
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
        h('span', {}, icon('lock', 13), 'Members only'),
        h('button', { class: 'btn btn-sm btn-primary pm-add', onclick: addProperty }, icon('plus', 14), 'Add property'))),
    h('div', { class: 'pm-scroll' }, el));
}

/**
 * The site itself, small: the real front page in a frame, scaled down, so the
 * preview is exactly what visitors get (in the site's look, with live data).
 */
function SitePreview(s, { width = 320, page = null, mode = deviceMode(), tpl = null, aspect = 0.62 } = {}) {
  const src = siteUrl(s.id, { frame: '1', ...(page ? { page } : {}), ...(tpl ? { tpl } : {}) });
  return DevicePreview({ src, title: `${s.name}, as visitors see it`, mode, width, aspect, url: s.url || `${org.name} · ${s.name}`, phoneHeight: 760 });
}
/** Tell open previews of the sites about a change, so they redraw without reloading. */
function tellPreviews() {
  for (const f of document.querySelectorAll('iframe')) {
    if (!/site\.html/.test(f.getAttribute('src') ?? '')) continue;
    try { f.contentWindow?.postMessage({ type: 'dashi:org', org: structuredClone(org) }, location.origin); } catch { /* not loaded yet: it reads the saved org */ }
  }
}

const visLabel = (v) => ({ public: 'Public', unlisted: 'Unlisted', private: 'Members only' })[v] ?? v;
const visBlurb = (v) => ({ public: 'Anyone can find it, and it is listed on your other sites.', unlisted: 'Anyone with the link can read it, but it is not listed anywhere yet.', private: 'Only people signed in to your organisation can open it: staff, board directors and guests.' })[v];

/** A site on the overview: its front page, small, what is on it, and the way in. */
function SiteCard(s) {
  const props = propertiesOf(s);
  const live = props.filter((p) => p.live).length;
  return h('article', { class: `wv-card ${s.visibility}` },
    h('a', { class: `wv-card-shot ${deviceMode()}`, href: `#site/${s.id}`, title: `Manage ${s.name}` }, SitePreview(s, { width: 300 })),
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
  const look = siteDesign(s);
  const saveSite = (patch, redraw = true) => { Object.assign(org.sites[s.id], patch); saveDoc('org', org); if (redraw) render(); };
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
    h('header', { class: 'wv-sitepage-head' },
      h('div', { class: 'wv-sitepage-title' },
        h('input', { class: 'title-input', name: 'site-name', value: s.name, 'aria-label': 'Site name', onchange: (e) => saveSite({ name: e.target.value.trim() || s.name }) }),
        h('span', { class: 'muted small' }, visBlurb(s.visibility))),
      h('div', { class: 'wv-sitepage-actions' },
        h('a', { class: 'btn btn-sm btn-primary', href: siteUrl(s.id), target: '_blank', rel: 'noopener' }, icon(isPublic ? 'globe' : 'lock', 14), isPublic ? 'Open the site' : 'Open the portal'))),
    h('div', { class: 'wv-sitepage-grid' },
      h('section', { class: 'wv-sitepage-preview' },
        h('div', { class: 'wv-preview-bar' },
          DeviceToggle(() => render()),
          h('span', { class: 'muted small' }, 'Live: this is the site as visitors get it today.')),
        h('div', { class: `wv-preview-stage ${deviceMode()}` }, SitePreview(s, { width: Math.max(420, Math.min(760, (main.clientWidth || 1100) - 460)) })),
        h('a', { class: 'wv-look-line', href: `#look/${s.id}` },
          h('span', { class: 'wv-look-text' }, h('strong', {}, `${templateById[look.template].label} template`), h('small', {}, [look.masthead.preset === 'none' ? 'No banner' : look.masthead.preset === 'upload' ? 'Your own banner' : `${MASTHEADS.find((m) => m.id === look.masthead.preset)?.label} banner`, SITE_FONTS.find((f) => f.id === look.type)?.label, paletteById[org.theme?.palette]?.label && `${paletteById[org.theme.palette].label} colours`].filter(Boolean).join(' · '))),
          h('span', { class: 'btn btn-sm' }, icon('palette', 14), 'Change the look'))),
      h('aside', { class: 'wv-sitepage-side' },
        h('section', { class: 'wv-box' },
          h('h3', {}, 'Settings'),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Who can see it'),
            h('select', { class: 'select select-sm w-full', name: 'site-vis', onchange: (e) => saveSite({ visibility: e.target.value }) },
              options([{ id: 'public', label: 'Public: listed and open to all' }, { id: 'unlisted', label: 'Unlisted: open to anyone with the link' }, { id: 'private', label: 'Members only: sign in to see it' }], s.visibility))),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Address'),
            h('input', { class: 'input input-sm w-full', name: 'site-url', value: s.url ?? '', placeholder: 'https://…', onchange: (e) => saveSite({ url: e.target.value.trim() }) })),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'What it shows (one line)'),
            h('input', { class: 'input input-sm w-full', name: 'site-shows', value: s.shows ?? '', onchange: (e) => saveSite({ shows: e.target.value }, false) })),
          h('button', { class: 'btn btn-xs btn-ghost btn-error wv-remove', onclick: async () => {
            if (!await uiConfirm(`Remove ${s.name}? What was on it (pages, dashboards, the station) is kept, and you can put it on another site.`)) return;
            delete org.sites[s.id];
            saveDoc('org', org);
            location.hash = 'sites';
          } }, icon('trash', 13), 'Remove this site')),
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

/**
 * Look and feel: how each public site and portal is dressed. Pick a site,
 * then its template (shown as real renders of your own site in each one),
 * its masthead banner (drawn in your colours, or your own picture), type
 * and header. Colours and shapes are shared by every site. The big preview
 * on the right is the real site, as a laptop or a phone, and follows every
 * change without reloading. Staff pages keep Dashi's own look.
 *
 *   #look            the first site
 *   #look/<site id>  that site
 */
function Look(siteId) {
  const sites = Object.values(org.sites);
  const s = org.sites[siteId] ?? sites.find((x) => x.visibility === 'public') ?? sites[0];
  if (!s) return h('div', { class: 'wv look' }, h('h1', {}, 'Look and feel'), h('p', { class: 'muted' }, 'Make a site first: its look is chosen here.'), h('button', { class: 'btn btn-sm btn-primary', onclick: newSite }, 'New site'));
  setCrumbs(sites.length > 1 ? [{ label: s.name }] : []);
  const theme = () => org.theme ?? {};
  const design = () => siteDesign(org.sites[s.id]);
  // A change saves, tells the previews, and redraws only the controls (so the previews never reload).
  const commit = () => { saveDoc('org', org); tellPreviews(); drawControls(); renderSide(); };
  const setLook = (patch) => { org.sites[s.id].look = { ...(org.sites[s.id].look ?? {}), ...design(), ...patch }; commit(); };
  const setMast = (patch) => setLook({ masthead: { ...design().masthead, ...patch } });
  const setTheme = (patch) => { org.theme = { ...org.theme, ...patch }; commit(); };

  const choice = (on, attrs, ...kids) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: `lk-choice${on ? ' on' : ''}`, ...attrs }, ...kids);
  const themed = (el) => { applyTheme(el, theme()); return el; };

  const rest = h('div', { class: 'lk-rest' });
  const tplBox = h('section', { class: 'lk-box' });
  const controls = h('div', { class: 'lk-controls' }, tplBox, rest);
  // The template renders are real iframes: drawn once, so changing other things never reloads them.
  const tplShots = Object.fromEntries(TEMPLATES.map((t) => [t.id, SitePreview(s, { width: 176, mode: 'desktop', tpl: t.id, aspect: 0.7 })]));
  tplBox.append(
    h('div', { class: 'lk-box-head' }, h('h2', {}, 'Template'), h('span', { class: 'muted small' }, 'How every page is laid out')),
    h('div', { class: 'lk-tpls', role: 'radiogroup', 'aria-label': 'Template' }, TEMPLATES.map((t) =>
      h('button', { type: 'button', role: 'radio', class: 'lk-choice lk-tpl', 'data-tpl': t.id, onclick: () => setLook({ template: t.id, header: undefined }) },
        h('span', { class: 'lk-tpl-shot' }, tplShots[t.id]),
        h('span', { class: 'lk-tpl-text' }, h('strong', {}, t.label), h('small', {}, t.blurb))))));
  function drawControls() {
    const d = design();
    const th = theme();
    const upload = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': 'Upload a banner picture', onchange: async (e) => {
      try { setMast({ preset: 'upload', image: await readImage(e.target.files[0], 2000) }); } catch (err) { uiAlert(err.message); }
    } });
    for (const b of tplBox.querySelectorAll('.lk-tpl')) { const on = b.dataset.tpl === d.template; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    rest.replaceChildren(
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Masthead banner'), h('span', { class: 'muted small' }, 'Across the top of the site, in your colours')),
        h('div', { class: 'lk-masts', role: 'radiogroup', 'aria-label': 'Masthead banner' },
          MASTHEADS.map((m) => {
            const art = themed(h('span', { class: 'lk-mast-art mh' }));
            art.innerHTML = mastheadSvg(m.id);
            return choice(d.masthead.preset === m.id, { class: `lk-mast${d.masthead.preset === m.id ? ' on' : ''}`, title: m.blurb, onclick: () => setMast({ preset: m.id }) }, art, h('small', {}, m.label));
          }),
          h('label', { class: `lk-mast lk-mast-upload${d.masthead.preset === 'upload' ? ' on' : ''}`, title: 'A wide picture, 2000 pixels across or more, works best' },
            d.masthead.image ? h('span', { class: 'lk-mast-art' }, h('img', { src: d.masthead.image, alt: '' })) : h('span', { class: 'lk-mast-art lk-mast-add' }, icon('upload', 18)),
            h('small', {}, d.masthead.image ? 'Your picture' : 'Upload your own'), upload),
          choice(d.masthead.preset === 'none', { class: `lk-mast${d.masthead.preset === 'none' ? ' on' : ''}`, onclick: () => setMast({ preset: 'none' }) }, h('span', { class: 'lk-mast-art lk-mast-none' }, 'None'), h('small', {}, 'No banner'))),
        d.masthead.preset !== 'none' && h('div', { class: 'lk-row' },
          h('span', { class: 'lk-label' }, 'Height'),
          h('div', { class: 'device-toggle xs', role: 'radiogroup', 'aria-label': 'Banner height' }, MASTHEAD_HEIGHTS.map((x) =>
            h('button', { type: 'button', role: 'radio', 'aria-checked': String(d.masthead.height === x.id), class: d.masthead.height === x.id ? 'on' : '', onclick: () => setMast({ height: x.id }) }, x.label)))),
        d.masthead.preset === 'upload' && h('div', { class: 'lk-row' },
          h('label', { class: 'lk-label', for: 'lk-focus' }, 'Show more of the'),
          h('input', { id: 'lk-focus', type: 'range', class: 'range range-xs', min: 0, max: 100, step: 5, value: d.masthead.focus ?? 50, 'aria-label': 'Banner focus, top to bottom', onchange: (e) => setMast({ focus: +e.target.value }) }),
          h('span', { class: 'muted small' }, 'top · bottom'),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => setMast({ preset: 'ripples', image: null }) }, 'Remove'))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Type and header')),
        h('div', { class: 'lk-fonts', role: 'radiogroup', 'aria-label': 'Type' }, SITE_FONTS.map((f) =>
          choice(d.type === f.id, { class: `lk-font f-${f.id}${d.type === f.id ? ' on' : ''}`, onclick: () => setLook({ type: f.id }) }, h('span', { class: 'lk-font-aa' }, 'Aa'), h('strong', {}, f.label), h('small', {}, f.blurb)))),
        h('div', { class: 'lk-row' },
          h('span', { class: 'lk-label' }, 'Header'),
          h('div', { class: 'device-toggle xs', role: 'radiogroup', 'aria-label': 'Header' }, HEADERS.map((x) =>
            h('button', { type: 'button', role: 'radio', title: x.blurb, 'aria-checked': String(d.header === x.id), class: d.header === x.id ? 'on' : '', onclick: () => setLook({ header: x.id }) }, x.label))))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Colours and shape'), h('span', { class: 'lk-shared' }, icon('globe', 12), 'Shared by all your sites')),
        h('div', { class: 'palette-grid', role: 'radiogroup', 'aria-label': 'Colour palette' }, PALETTES.map((p) => {
          const on = th.palette === p.id;
          const sw = h('button', { type: 'button', class: `palette-option${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), onclick: () => setTheme({ palette: p.id }) },
            h('span', { class: 'swatches' }, ['primary', 'secondary', 'accent', 'neutral', 'base-200'].map((c) => h('span', { style: `background:var(--color-${c})` }))),
            h('span', {}, p.label));
          sw.querySelector('.swatches').setAttribute('data-theme', p.id);
          return sw;
        })),
        h('div', { class: 'shape-grid', role: 'radiogroup', 'aria-label': 'Shape' }, SHAPES.map((x) =>
          h('button', { type: 'button', class: `shape-option${th.shape === x.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(th.shape === x.id), onclick: () => setTheme({ shape: x.id }), style: `--r:${x.vars['--radius-box']}` },
            h('span', { class: 'shape-sample' }), h('strong', {}, x.label), h('small', {}, x.blurb))))));
  }
  drawControls();

  const room = Math.max(420, Math.min(900, (main.clientWidth || 1100) - 520));
  return h('div', { class: 'wv look lk' },
    h('header', { class: 'lk-head' },
      h('div', {},
        h('h1', {}, 'Look and feel'),
        h('p', { class: 'muted' }, 'Dress each public site and portal: a template, a banner, type and colours. Every change is live on the site straight away. Staff pages keep Dashi’s own look.')),
      sites.length > 1 && h('nav', { class: 'lk-sites', 'aria-label': 'Which site' }, sites.map((x) =>
        h('a', { href: `#look/${x.id}`, class: x.id === s.id ? 'on' : '', 'aria-current': x.id === s.id ? 'page' : null }, icon(x.visibility === 'private' ? 'lock' : x.visibility === 'unlisted' ? 'eyeOff' : 'globe', 14), x.name)))),
    h('div', { class: 'lk-grid' },
      controls,
      h('aside', { class: 'lk-preview', 'aria-label': 'Preview' },
        h('div', { class: 'lk-preview-bar' },
          DeviceToggle(() => render()),
          h('span', { class: 'muted small' }, s.name),
          h('span', { class: 'spacer' }),
          h('a', { class: 'btn btn-sm btn-ghost', href: siteUrl(s.id), target: '_blank', rel: 'noopener' }, icon('share', 13), 'Open')),
        h('div', { class: `lk-stage ${deviceMode()}` }, SitePreview(s, { width: room, aspect: 0.66 })))));
}

/**
 * Add something to the portal from the overview: pick what, and (for pages
 * and articles) which site. Dashboards, forms, stories and the rest are made
 * in their own tools, so those open there.
 */
async function addProperty() {
  const sites = Object.values(org.sites);
  const KINDS = [
    { id: 'site', label: 'Site or portal', sub: 'A new public site, or a members-only portal', icon: 'globe' },
    { id: 'page', label: 'Page', sub: 'Who you are, how to get involved', icon: 'doc', needsSite: true },
    { id: 'article', label: 'News article', sub: 'What’s new, with a date', icon: 'news', needsSite: true },
    { id: 'dashboard', label: 'Dashboard', sub: 'In the Data Workbench', icon: 'chart', href: 'palette.html#dashboards' },
    { id: 'feedback', label: 'Feedback form', sub: 'In the Data Workbench', icon: 'chats', href: 'palette.html#feedback' },
    { id: 'story', label: 'Data story', sub: 'In the Data Workbench', icon: 'story', href: 'palette.html#stories' },
    { id: 'calculator', label: 'Impact calculator', sub: 'In the Data Workbench', icon: 'gift', href: 'palette.html#impact' },
    { id: 'plan', label: 'Strategic plan', sub: 'In the Plan designer', icon: 'strategy', href: 'plandoc.html' },
    pluginOn(org, 'podcasts') && { id: 'station', label: 'Podcast station', sub: 'In Podcasts', icon: 'mic', href: 'podcasts.html#station' },
  ].filter(Boolean);
  let pick = KINDS[1];
  let siteId = sites.find((s) => s.visibility === 'public')?.id ?? sites[0]?.id ?? null;
  const choice = await uiPanel({
    title: 'Add to your portal', message: 'Choose what to add. Pages and news are written here; the rest open in the tool that makes them.', ok: 'Add', cancel: 'Cancel',
    build: (set) => {
      set({ kind: pick, siteId });
      const siteRow = h('label', { class: 'dui-field ap-site' }, h('span', { class: 'dui-label' }, 'On which site'),
        h('select', { class: 'select w-full', onchange: (e) => { siteId = e.target.value; set({ kind: pick, siteId }); } },
          options(sites.map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (members only)' : ''}` })), siteId)));
      const grid = h('div', { class: 'ap-grid', role: 'radiogroup', 'aria-label': 'What to add' }, KINDS.map((k) =>
        h('button', { type: 'button', role: 'radio', class: `ap-kind${k === pick ? ' on' : ''}`, 'aria-checked': String(k === pick), onclick: (e) => {
          pick = k;
          grid.querySelectorAll('.ap-kind').forEach((b) => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-checked', String(b === e.currentTarget)); });
          siteRow.hidden = !k.needsSite || !sites.length;
          set({ kind: pick, siteId });
        } }, icon(k.icon, 18), h('span', {}, h('strong', {}, k.label), h('small', {}, k.sub)))));
      siteRow.hidden = !pick.needsSite || !sites.length;
      return h('div', { class: 'ap' }, grid, siteRow);
    },
  });
  if (!choice || choice === true) return;
  const { kind } = choice;
  if (kind.id === 'site') return newSite();
  if (kind.needsSite) return newPage(kind.id, choice.siteId);
  location.assign(kind.href);
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
      h('div', { class: `page-preview-wrap ${deviceMode()}` },
        h('div', { class: 'page-preview-bar' }, h('span', { class: 'fieldset-legend' }, 'Preview'), DeviceToggle(() => render(), { size: 'xs' })),
        deviceMode() === 'phone' ? h('div', { class: 'page-preview-phone' }, PhoneShell(preview, { scale: 0.8, height: 760 })) : preview)));
}

store.addEventListener('change', renderSide);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
render();
window.sites = { store, docs };
