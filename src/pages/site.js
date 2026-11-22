import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { onDocChange, session, isHosted, canWriteDoc } from '../platform/storage.js';
import { BlockEditor } from '../designer/BlockEditor.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts, loadPages, loadPlanDocs, loadLibrary } from '../platform/docs.js';
import { loadDoc } from '../platform/storage.js';
import { migratePlanDocs, isLivePlan, publishedDoc } from '../platform/plandocs.js';
import { PlanDocument } from '../plandoc/render.js';
import { printPlan } from '../plandoc/print.js';
import { migrateStrategy } from '../platform/strategy.js';
import { migratePodcasts, published, stationTheme } from '../platform/podcasts.js';
import { migratePages, siteContent } from '../platform/pages.js';
import { pluginOn } from '../platform/org.js';
import { siteDesign, templateById } from '../platform/siteDesign.js';
import { Masthead } from '../site/mastheads.js';
import { fitNav } from '../site/fitNav.js';
import { measureIndex } from '../platform/strategy.js';
import { measureFacts, seriesOf } from '../platform/data.js';
import { migrateLibrary, yearOf, formatLabel } from '../platform/library.js';
import { formsAt, migrateFeedback, cleanResponse } from '../platform/feedback.js';
import { saveDoc } from '../platform/storage.js';
import { dashboardMonths } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';
import { CalculatorView } from '../charts/CalculatorView.js';
import { StoryView } from '../charts/StoryView.js';
import { migrateDashboards } from '../platform/dashboards.js';
import { applyTheme } from '../platform/themes.js';
import { Logo, Avatar } from '../ui/Shell.js';
import { Markdown } from '../ui/markdown.js';
import { FormView } from '../site/feedbackForm.js';
import { StationHome, ShowPage, EpisodePage, EpisodeCard, ShowCard, Player, lookClasses } from '../site/station.js';
import { today, short } from '../strategy/dates.js';
import { criticalOn, migrateCritical, onSiteFor, lessonsOf, suggestFor, STOP_THINK_CHECK, SIX_QUESTIONS, TRACE, CREDIT, DOC as CRITICAL_DOC } from '../platform/criticalMedia.js';
import { linkTo } from '../plugins.js';

/**
 * A sample public site: site.html?site=<id>, with its own pages:
 *
 *   ?site=x                   home: the site's public dashboards, calculators and stories, latest news, latest episode
 *   ?site=x&story=<id>        a data story (Workbench)
 *   ?site=x&page=<slug>       an information page or article (Web plugin)
 *   ?site=x&view=news         every article, newest first
 *   ?site=x&view=station      the podcast station, if this site hosts it (Listen plugin)
 *   ?site=x&show=<id>         a show, by season
 *   ?site=x&episode=<id>      an episode
 *   ?site=x&plan=<id>         a published strategic plan document (Plan designer), printable as PDF
 *
 * A private site is a members-only portal, e.g. the board's: signed-in
 * staff and viewers see it, everyone else gets a sign-in panel. A board
 * portal reads the Library's documents tagged `board` (and `governance`,
 * `minutes` or `finance`) and the dashboards on that site:
 *
 *   ?site=b                   the portal's home: welcome, scorecard, latest papers
 *   ?site=b&view=governance   governance guides and policies
 *   ?site=b&view=minutes      the minutes archive, by year, searchable
 *   ?site=b&view=finance      finance summaries
 *   ?site=b&doc=<id>          one document
 *
 * Feedback forms (Data Workbench) show where their `place` says.
 *
 * Links inside the site change the page without reloading, so the
 * podcast player keeps playing. It reads live data: when staff change
 * anything in another tab, the page redraws.
 *
 * In production this is served by the Node app (or a HubSpot module) from
 * a published snapshot holding only public content.
 */
const docs = {
  org: loadOrg(), strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards(),
  podcasts: loadPodcasts(), pages: loadPages(),
  critical: migrateCritical(loadDoc(CRITICAL_DOC)),
  // Members read the library for a board portal; visitors never get it.
  library: staffMember() ? loadLibrary() : migrateLibrary({}),
};
// Visitors get only published plan documents from the server; staff previews read their own.
docs.plandocs = migratePlanDocs((!isHosted() || session()?.member ? loadPlanDocs() : loadDoc('plandocs')) ?? { docs: {} }, docs.strategy);
function staffMember() { return !isHosted() || !!session()?.member; }
/** Critical Media prompts on this site, if the org has the plugin on: its settings, else null. */
const media = (siteId) => (criticalOn(docs.org) && onSiteFor(docs.critical.settings, siteId) ? docs.critical.settings : null);
const root = document.querySelector('#site');
const now = today();
const player = Player(() => docs.podcasts);
// Outside the redrawn part of the page, so redraws never interrupt it.
document.body.append(player.el);
// Where each dashboard's player is, so a live update doesn't rewind it.
const asOf = {};

const params = () => Object.fromEntries(new URLSearchParams(location.search));
// Without ?site=, the org's first public site.
const firstSite = () => Object.values(docs.org.sites).find((s) => s.visibility === 'public')?.id ?? Object.keys(docs.org.sites)[0];
const siteId = () => params().site || firstSite();
const staffView = !isHosted() || !!session()?.member;
const link = (p) => `?${new URLSearchParams({ site: siteId(), ...p })}`;
// Live edit: signed-in staff who can write pages edit a page where it stands (the Portal page editor has the rest).
const canLiveEdit = () => staffView && params().frame !== '1' && canWriteDoc('pages') && pluginOn(docs.org, 'pages');
let liveEdit = params().edit === '1' || (() => { try { return sessionStorage.getItem('dashi.liveEdit') === '1'; } catch { return false; } })();
const setLiveEdit = (on) => { liveEdit = on; try { sessionStorage.setItem('dashi.liveEdit', on ? '1' : ''); } catch { /* private window */ } render(); };
player.setLink(link);

/** The site's design; a staff preview of another template passes ?tpl= (Look and feel thumbnails). */
function designOf(site) {
  const d = siteDesign(site);
  const p = params();
  if (staffView && p.frame === '1' && templateById[p.tpl]) return siteDesign({ ...site, look: { ...(site?.look ?? {}), template: p.tpl, header: undefined, masthead: site?.look?.masthead } });
  return d;
}

function dashboard(d) {
  const months = dashboardMonths(d, docs.data);
  // Follow new data when the reader is on the latest month.
  const at = asOf[d.id] && asOf[d.id] !== asOf[`${d.id}:last`] ? asOf[d.id] : months.at(-1);
  const view = DashboardView(d, docs, { asOf: at });
  view.id = d.id;
  asOf[`${d.id}:last`] = months.at(-1);
  new MutationObserver(() => { asOf[d.id] = view.dataset.asOf; }).observe(view, { attributes: true, attributeFilter: ['data-as-of'] });
  return view;
}

function render() {
  const { org } = docs;
  const id = siteId();
  const site = org.sites[id];
  const p = params();
  const pod = docs.podcasts;
  const hasStation = pluginOn(org, 'podcasts') && pod.station.siteId === id;
  const content = pluginOn(org, 'pages') ? siteContent(docs.pages, id, now) : { nav: [], articles: [], bySlug: () => null };
  const publicSites = Object.values(org.sites).filter((s) => s.visibility === 'public');
  const plansHere = Object.values(docs.plandocs.docs).filter((d) => d.siteId === id && isLivePlan(d));
  const ctx = { doc: pod, org, site, today: now, player, link };
  player.setLook(pod.station.look);
  // In a staff preview of the station, show the player (not playing) so its style can be seen.
  if (hasStation && staffView && params().frame === '1' && (p.view === 'station' || p.show || p.episode)) player.show(Object.values(pod.episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0]);

  // The org's palette and look and feel (Web → Look and feel), then the station's look.
  // Station pages can wear their own colours (Listen → Public station).
  // A site's own homepage (alpha 0.3, Web → Sites → Homepage): the default, the podcast station, or one of its pages.
  const bare = !p.view && !p.page && !p.story && !p.plan && !p.show && !p.episode && !p.doc;
  const homeKind = site?.home?.kind ?? 'default';
  const stationHome = bare && homeKind === 'station' && hasStation && site?.visibility !== 'private';
  const onStation = hasStation && (p.view === 'station' || p.show || p.episode || stationHome);
  applyTheme(document.documentElement, onStation ? stationTheme(pod.station, org.theme) : org.theme);
  document.body.className = `site-page ${lookClasses(pod.station.look)}`;

  // Embeds in pages: only public content of this org.
  const embed = ({ kind, id: ref }) => {
    if (kind === 'dashboard') { const d = docs.dashboards.dashboards[ref]; return d?.visibility === 'public' ? dashboard(d) : null; }
    if (kind === 'episode') { const e = pod.episodes[ref]; return e && published(e, now) && pluginOn(org, 'podcasts') ? EpisodeCard(ctx, e, { embed: true }) : null; }
    if (kind === 'show') { const s = pod.podcasts[ref]; return s && pluginOn(org, 'podcasts') ? ShowCard(ctx, s) : null; }
    if (kind === 'calculator') { const c = docs.dashboards.calculators[ref]; return c?.visibility === 'public' ? CalculatorView(c, docs) : null; }
    if (kind === 'story') { const s = docs.dashboards.stories[ref]; return s?.visibility === 'public' ? StoryView(s, docs) : null; }
    return null;
  };

  let current = 'home';
  let title = site?.name;
  let body;
  let editable = null;
  const portal = site?.visibility === 'private';
  if (!site) body = h('p', { class: 'empty' }, 'There is no site here.');
  else if (portal && !staffView) { title = site.name; body = SignIn(site); }
  else if (portal && (p.view || p.doc)) ({ current, title, body } = BoardPage(site, p, current, title));
  else if (portal) body = BoardHome(site);
  else if (p.page) {
    const pg = content.bySlug(p.page);
    current = pg?.kind === 'article' ? 'news' : `page:${p.page}`;
    title = pg?.title ?? 'Not found';
    body = pg ? Article(pg, embed) : h('p', { class: 'empty' }, 'That page is not here.');
    editable = pg && canLiveEdit() ? pg : null;
  } else if (p.story) {
    const s = docs.dashboards.stories[p.story];
    const ok = s?.visibility === 'public' && s.siteId === id;
    title = ok ? s.title : 'Not found';
    body = ok ? h('div', { class: 'story-page' }, StoryView(s, docs)) : h('p', { class: 'empty' }, 'That story is not here.');
  } else if (p.plan) {
    const pd = docs.plandocs.docs[p.plan];
    const ok = pd && pd.siteId === id && isLivePlan(pd);
    current = 'plan';
    title = ok ? publishedDoc(pd).snapshot.plan.title : 'Not found';
    body = ok ? PlanView(publishedDoc(pd)) : h('p', { class: 'empty' }, 'That plan is not here.');
  } else if (p.episode && hasStation) {
    const e = pod.episodes[p.episode];
    current = 'station';
    title = e?.title;
    body = e && published(e, now) ? EpisodePage(ctx, e) : h('p', { class: 'empty' }, 'That episode is not here.');
  } else if (p.show && hasStation) {
    const s = pod.podcasts[p.show];
    current = 'station';
    title = s?.title;
    body = s ? ShowPage(ctx, s) : h('p', { class: 'empty' }, 'That show is not here.');
  } else if (p.view === 'station' && hasStation) {
    current = homeKind === 'station' ? 'home' : 'station';
    title = pod.station.name;
    body = StationHome(ctx);
  } else if (p.view === 'media' && media(id)?.corner) {
    current = 'media';
    title = 'Media smart';
    body = MediaCorner(p.lesson);
  } else if (p.view === 'news') {
    current = 'news';
    title = 'News';
    body = h('div', {}, h('section', { class: 'site-hero' }, h('h1', {}, 'News')), NewsList(content.articles));
  } else if (stationHome) {
    // The station is this site's front page: a client that is just a podcast station.
    title = pod.station.name;
    body = StationHome(ctx);
  } else if (homeKind === 'page' && site.home.slug && content.bySlug(site.home.slug)) {
    const pg = content.bySlug(site.home.slug);
    title = pg.title;
    body = Article(pg, embed);
    editable = canLiveEdit() ? pg : null;
  } else body = Home(site, content, hasStation, ctx);

  document.title = `${title ?? 'Site'} · ${org.name}`;
  const navLink = (key, href, label) => h('a', { href, 'aria-current': current === key ? 'page' : null }, label);
  const look = designOf(site);
  const isHome = body?.classList?.contains('site-home') || body?.classList?.contains('portal-home');
  document.body.classList.add(`tpl-${look.template}`, `look-hero-${look.hero}`, `look-type-${look.type}`, `head-${look.header}`, ...(isHome ? ['is-home'] : []), ...(portal ? ['site-portal'] : []), ...(params().frame === '1' ? ['site-framed'] : []));
  // Inner pages wear a slim strip of the banner under the header.
  const strip = !isHome && !body?.classList?.contains('station-home') && site && !(portal && !staffView) ? Masthead({ ...look.masthead, height: 's' }, { cls: 'site-strip' }) : null;
  const board = portal && staffView ? boardDocs() : null;

  root.replaceChildren(
    // replaceChildren would print a bare false, so an empty string when there's no banner.
    !staffView || params().frame === '1' ? '' : h('div', { class: 'preview-banner' }, portal ? `${site.name}: members only. Board members and staff who sign in see this. ` : isHosted() ? 'You’re signed in, so this is the public site as visitors see it. ' : 'Sample public site, made by Dashi from live data. ', h('a', { href: linkTo('pages') }, 'Back to Dashi'),
      editable && h('span', { class: 'live-edit' },
        h('button', { type: 'button', class: `live-edit-toggle${liveEdit ? ' on' : ''}`, role: 'switch', 'aria-checked': String(liveEdit), onclick: () => setLiveEdit(!liveEdit) }, h('span', { class: 'live-edit-knob' }), liveEdit ? 'Editing this page' : 'Edit this page'),
        liveEdit && h('a', { href: linkTo('pages', `#${editable.id}`) }, 'More in the page editor'))),
    h('header', { class: 'site-head' },
      h('div', { class: 'inner' },
        h('a', { class: 'site-brand', href: link({}) }, Logo(org, 36), h('span', {}, h('strong', {}, org.name), portal && h('small', {}, icon('lock', 11), site.name))),
        board && h('nav', { class: 'site-nav', 'aria-label': site.name },
          navLink('home', link({}), 'Home'),
          board.governance.length > 0 && navLink('governance', link({ view: 'governance' }), 'Governance'),
          board.minutes.length > 0 && navLink('minutes', link({ view: 'minutes' }), 'Minutes'),
          board.finance.length > 0 && navLink('finance', link({ view: 'finance' }), 'Finance')),
        site?.visibility === 'public' && h('nav', { class: 'site-nav', 'aria-label': site.name },
          navLink('home', link({}), 'Home'),
          content.nav.map((pg) => navLink(`page:${pg.slug}`, link({ page: pg.slug }), pg.title)),
          content.articles.length > 0 && navLink('news', link({ view: 'news' }), 'News'),
          plansHere.length > 0 && navLink('plan', link({ plan: plansHere[0].id }), 'Our plan'),
          // When the station is the homepage, Home is the station: no second link to it.
          hasStation && homeKind !== 'station' && navLink('station', link({ view: 'station' }), pod.station.name),
          media(id)?.corner && navLink('media', link({ view: 'media' }), 'Media smart')),
        publicSites.length > 1 && h('details', { class: 'site-switch' },
          h('summary', { 'aria-label': 'Our other sites', title: 'Our sites' }, icon('globe', 17), h('span', { class: 'site-switch-label' }, 'Our sites'), icon('chevronDown', 12)),
          h('div', { class: 'site-switch-menu', role: 'menu' },
            h('p', {}, 'Our sites'),
            publicSites.map((s) => h('a', { role: 'menuitem', href: `?site=${s.id}`, 'aria-current': s.id === id ? 'page' : null },
              h('strong', {}, s.name), s.shows && h('small', {}, s.shows))))))),
    strip ?? '',
    h('main', { class: 'site-main' }, body),
    h('footer', { class: 'site-foot' },
      h('div', {}, h('a', { class: 'site-brand foot', href: link({}) }, Logo(org, 30), h('strong', {}, org.name)), org.description && h('p', {}, org.description),
        publicSites.length > 1 && h('p', { class: 'foot-sites' }, publicSites.map((s2) => h('a', { href: `?site=${s2.id}` }, s2.name)))),
      h('address', {},
        org.contact.address && h('div', {}, org.contact.address),
        org.contact.email && h('div', {}, h('a', { href: `mailto:${org.contact.email}` }, org.contact.email)),
        org.contact.phone && h('div', {}, org.contact.phone)),
      h('p', { class: 'site-small' }, 'Every chart has a table view for screen readers and printing.',
        isHosted() && !staffView && [' · ', h('a', { href: '/login.html?next=/index.html' }, 'Staff sign in')])),
  );
  // One line of links that never runs off the edge: what doesn't fit goes under More (alpha 0.4).
  fitNav(root.querySelector('.site-head .site-nav'));
}

function Home(site, content, hasStation, ctx) {
  const shown = Object.values(docs.dashboards.dashboards).filter((d) => d.siteId === site.id && d.visibility === 'public');
  const mine = (coll) => Object.values(docs.dashboards[coll] ?? {}).filter((x) => x.siteId === site.id && x.visibility === 'public');
  const calcs = mine('calculators');
  const stories = mine('stories');
  const latest = hasStation ? Object.values(ctx.doc.episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] : null;
  const plan = Object.values(docs.plandocs.docs).find((d) => d.siteId === site.id && isLivePlan(d));
  const firstPage = content.nav[0];
  const glance = AtAGlance(shown);
  const design = designOf(site);
  return h('div', { class: 'site-home' },
    h('section', { class: `site-hero home${design.masthead.preset === 'none' ? ' no-media' : ''}` },
      h('div', { class: 'site-hero-text' },
        h('p', { class: 'site-eyebrow' }, site.id === firstSite() ? site.name : docs.org.name),
        h('h1', {}, site.id === firstSite() ? docs.org.mission || site.name : site.name),
        h('p', {}, site.id === firstSite() ? docs.org.description || '' : docs.org.mission || '', site.shows ? ` This site shares ${site.shows.charAt(0).toLowerCase()}${site.shows.slice(1)}.` : ''),
        h('div', { class: 'site-hero-actions' },
          firstPage && h('a', { class: 'btn btn-primary', href: link({ page: firstPage.slug }) }, firstPage.title),
          plan && h('a', { class: 'btn btn-ghost', href: link({ plan: plan.id }) }, 'Read our plan'),
          hasStation && h('a', { class: 'btn btn-ghost', href: link({ view: 'station' }) }, icon('mic', 15), ctx.doc.station.name)),
        shown.length > 0 && h('p', { class: 'live-dot' }, 'Live program data, updated as our programs report.')),
      Masthead(design.masthead, { cls: 'site-hero-media' })),
    glance,
    (content.articles.length > 0 || latest) && h('section', { class: 'site-band home-teasers' },
      content.articles.length > 0 && h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Latest news'), h('a', { href: link({ view: 'news' }) }, 'All news →')),
        NewsList(content.articles.slice(0, 3))),
      latest && h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'New on the station'), h('a', { href: link({ view: 'station' }) }, 'All shows →')),
        EpisodeCard(ctx, latest, { embed: true }))),
    stories.length > 0 && h('section', { class: 'story-teasers' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Stories from the data')),
      h('div', { class: 'news-list' }, stories.map((s) => h('a', { class: 'news-card story-card', href: link({ story: s.id }) },
        h('small', { class: 'muted' }, `${s.steps.length} steps${s.steps.some((st) => st.audio) ? ' · with audio' : ''}`),
        h('strong', {}, s.title), s.summary && h('span', {}, s.summary))))),
    shown.map((d) => h('div', { class: 'site-dash' }, dashboard(d), Forms(site.id, 'dashboards'))),
    shown.length > 0 && media(site.id)?.onDashboards && ChartTip(),
    calcs.map((c) => { const v = CalculatorView(c, docs); v.id = c.id; return h('div', { class: 'site-band soft' }, v); }),
    Forms(site.id, 'home'),
    !shown.length && !calcs.length && !stories.length && !content.articles.length && !latest && h('p', { class: 'empty' }, 'Nothing is published here yet.'));
}

/** Up to four headline numbers from the site's dashboards, as a strip under the hero. */
function AtAGlance(dashes) {
  const index = measureIndex(docs.strategy);
  const ids = [...new Set(dashes.flatMap((d) => d.widgets.filter((w) => w.type === 'kpi').map((w) => w.measureId)))].slice(0, 4);
  const facts = ids.map((id) => ({ m: index[id], f: index[id] && measureFacts(index[id], seriesOf(id, docs.data)) })).filter((x) => x.f);
  if (!facts.length) return null;
  const fmt = (v, unit = '') => (unit.startsWith('%') ? `${(+v).toFixed(v % 1 ? 1 : 0)}%` : Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}K` : Number(v).toLocaleString('en-CA'));
  return h('section', { class: 'site-glance', 'aria-label': 'At a glance' },
    facts.map(({ m, f }) => h('div', { class: 'glance' },
      h('strong', {}, fmt(f.value, m.unit), !m.unit.startsWith('%') && h('small', {}, m.unit.replace(/\s*\/\s*(yr|y)$/, ' a year').replace(/\s*\/\s*mo(nth)?$/, ' a month'))),
      h('span', {}, m.name),
      f.change != null && h('em', { class: f.change >= 0 ? 'up' : 'down' }, `${f.change >= 0 ? '▲' : '▼'} ${Math.abs(f.change)}% on a year ago`))));
}

/** The latest published version of a plan doc (alpha 0.3: the release, never the designer's draft). */
function PlanView(pd) {
  const make = () => PlanDocument(pd, pd.snapshot, { palette: pd.palette || docs.org.theme?.palette });
  if (params().print === '1') setTimeout(() => printPlan(make(), pd.snapshot.plan.title), 600);
  return h('div', { class: 'site-plan' },
    h('div', { class: 'site-plan-bar' },
      h('span', { class: 'muted small' }, `Published ${short(pd.publishedAt)}${pd.release?.version > 1 ? ` · version ${pd.release.version}` : ''}`),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => printPlan(make(), pd.snapshot.plan.title) }, icon('download', 15), 'Download as PDF')),
    make());
}

function NewsList(articles) {
  if (!articles.length) return h('p', { class: 'empty' }, 'No news yet.');
  return h('div', { class: 'news-list' }, articles.map((a) =>
    h('a', { class: 'news-card', href: link({ page: a.slug }) },
      a.cover && h('img', { src: a.cover, alt: '' }),
      h('small', { class: 'muted' }, short(a.publishedAt)),
      h('strong', {}, a.title),
      a.summary && h('span', {}, a.summary))));
}

function Article(pg, embed) {
  if (liveEdit && canLiveEdit() && docs.pages.pages[pg.id]) return LiveArticle(pg, embed);
  const author = docs.org.staff[pg.authorId];
  return h('article', { class: `site-article ${pg.kind}` },
    h('header', {},
      pg.kind === 'article' && h('p', { class: 'crumbs' }, h('a', { href: link({ view: 'news' }) }, 'News')),
      h('h1', {}, pg.title),
      pg.kind === 'article' && h('p', { class: 'byline' }, author && Avatar(author, 24), author?.name, author && ' · ', short(pg.publishedAt)),
      pg.summary && pg.kind === 'article' && h('p', { class: 'lede' }, pg.summary)),
    pg.cover && h('img', { class: 'article-cover', src: pg.cover, alt: '' }),
    Markdown(pg.body, { embed }),
    pg.kind === 'article' && media(siteId())?.onArticles && FactCheckTip(`${pg.title} ${pg.summary ?? ''} ${pg.body ?? ''}`));
}

/** A page in live edit: the same page, its title and blocks editable in place. Saves as it goes. */
function LiveArticle(pg, embed) {
  const embeds = [
    ...Object.values(docs.dashboards.dashboards).filter((d) => d.visibility === 'public').map((d) => ({ code: `[[dashboard:${d.id}]]`, label: `Dashboard: ${d.title}` })),
    ...Object.values(docs.dashboards.stories ?? {}).filter((d) => d.visibility === 'public').map((d) => ({ code: `[[story:${d.id}]]`, label: `Story: ${d.title}` })),
    ...Object.values(docs.podcasts.podcasts ?? {}).map((d) => ({ code: `[[show:${d.id}]]`, label: `Podcast: ${d.title}` })),
  ];
  return h('article', { class: `site-article ${pg.kind} live` },
    pg.cover && h('img', { class: 'article-cover', src: pg.cover, alt: '' }),
    BlockEditor({ title: pg.title, body: pg.body ?? '', embed, embeds, onChange: ({ title, body }) => {
      Object.assign(docs.pages.pages[pg.id], { title, body });
      saveDoc('pages', docs.pages);
    } }));
}

/* ---------------------------------------------------------------- Members-only portals (the board) */
const BOARD_KINDS = [
  { id: 'governance', label: 'Governance', blurb: 'By-laws, the board handbook, policies and committee terms of reference.', icon: 'scales' },
  { id: 'minutes', label: 'Minutes', blurb: 'Every board meeting, newest first.', icon: 'notePencil' },
  { id: 'finance', label: 'Finance', blurb: 'Quarterly finance summaries and the reserves position.', icon: 'chart' },
];
/** The library's board documents, by kind, newest first. */
function boardDocs() {
  const items = Object.values(docs.library.items ?? {}).filter((it) => (it.tags ?? []).includes('board'))
    .sort((a, b) => String(b.meta.issued ?? '').localeCompare(String(a.meta.issued ?? '')) || a.meta.title.localeCompare(b.meta.title));
  const of = (tag) => items.filter((it) => it.tags.includes(tag));
  return { all: items, governance: of('governance'), minutes: of('minutes'), finance: of('finance') };
}
const dateWords = (issued) => (/^\d{4}-\d\d-\d\d$/.test(issued ?? '') ? new Date(`${issued}T12:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : issued || '');
const docHref = (it) => (it.kind === 'link' || it.kind === 'gdoc' ? it.url : it.file?.url ?? it.url ?? null);

function DocRow(it) {
  const external = it.kind !== 'doc' && docHref(it);
  return h('a', { class: 'portal-doc', href: external || link({ doc: it.id }), target: external ? '_blank' : null, rel: external ? 'noopener' : null },
    h('span', { class: 'portal-doc-icon' }, icon(it.tags.includes('minutes') ? 'notePencil' : it.tags.includes('finance') ? 'chart' : it.kind === 'doc' ? 'fileText' : 'file', 18)),
    h('span', { class: 'portal-doc-text' }, h('strong', {}, it.meta.title || 'Untitled'), h('small', {}, [dateWords(it.meta.issued), formatLabel(it)].filter(Boolean).join(' · ')),
      it.meta.abstract && h('span', {}, it.meta.abstract)),
    h('span', { class: 'portal-doc-go' }, icon('chevronRight', 16)));
}

function SignIn(site) {
  return h('section', { class: 'portal-signin' },
    h('span', { class: 'portal-lock' }, icon('lock', 28)),
    h('h1', {}, site.name),
    h('p', {}, `${site.name} is for ${docs.org.name}’s board and staff. Sign in to see the board papers, minutes and the plan’s progress.`),
    isHosted() && h('a', { class: 'btn btn-primary', href: `/login.html?next=${encodeURIComponent(location.pathname + location.search)}` }, 'Sign in'),
    h('p', { class: 'site-small' }, 'Looking for our public reporting? ', h('a', { href: `?site=${firstSite()}` }, 'Visit our public site'), '.'));
}

function BoardHome(site) {
  const b = boardDocs();
  const dashes = Object.values(docs.dashboards.dashboards).filter((d) => d.siteId === site.id);
  const me = docs.org.staff[session()?.staffId] ?? null;
  const latestMinutes = b.minutes[0];
  const handbook = b.governance.find((it) => /handbook/i.test(it.meta.title)) ?? b.governance[0];
  const finance = b.finance.find((it) => /summary/i.test(it.meta.title)) ?? b.finance[0];
  return h('div', { class: 'portal-home' },
    h('section', { class: 'site-hero home portal' },
      h('div', { class: 'site-hero-text' },
      h('p', { class: 'site-eyebrow' }, icon('lock', 13), ' Members only'),
      h('h1', {}, me ? `Welcome, ${me.name.split(' ')[0]}` : `${site.name}`),
      h('p', {}, `Everything the board needs between meetings: where the plan stands, the papers, and the record of what we decided.`)),
      Masthead(designOf(site).masthead, { cls: 'site-hero-media' }),
      h('div', { class: 'portal-quick' },
        latestMinutes && h('a', { href: link({ doc: latestMinutes.id }) }, h('small', {}, 'Latest minutes'), h('strong', {}, dateWords(latestMinutes.meta.issued))),
        finance && h('a', { href: link({ doc: finance.id }) }, h('small', {}, 'Latest finance summary'), h('strong', {}, finance.meta.title.replace(/^Finance summary,\s*/, ''))),
        handbook && h('a', { href: link({ doc: handbook.id }) }, h('small', {}, 'New to the board?'), h('strong', {}, handbook.meta.title)))),
    dashes.map((d) => h('div', { class: 'site-dash' }, dashboard(d))),
    h('section', { class: 'portal-kinds' }, BOARD_KINDS.map((k) => {
      const list = b[k.id];
      return h('a', { class: 'portal-kind', href: link({ view: k.id }) },
        h('span', { class: 'portal-kind-icon' }, icon(k.icon, 22)),
        h('strong', {}, k.label), h('span', {}, k.blurb),
        h('small', {}, list.length ? `${list.length} document${list.length === 1 ? '' : 's'} · latest ${dateWords(list[0].meta.issued)}` : 'Nothing yet'));
    })),
    Forms(site.id, 'home', { members: true }),
    !isHosted() || session()?.canEdit ? h('p', { class: 'site-small portal-staff' }, 'Staff: board documents are Library documents tagged “board”, plus “governance”, “minutes” or “finance”. ', h('a', { href: linkTo('library', '#tag/board') }, 'Manage them in the Library'), '.') : '');
}

function BoardPage(site, p, current, title) {
  const b = boardDocs();
  if (p.doc) {
    const it = docs.library.items?.[p.doc];
    if (!it || !(it.tags ?? []).includes('board')) return { current, title: 'Not found', body: h('p', { class: 'empty' }, 'That document is not here.') };
    const kind = BOARD_KINDS.find((k) => it.tags.includes(k.id)) ?? BOARD_KINDS[0];
    const list = b[kind.id];
    const i = list.indexOf(it);
    const href = docHref(it);
    return { current: kind.id, title: it.meta.title, body: h('article', { class: 'site-article portal-article' },
      h('header', {},
        h('p', { class: 'crumbs' }, h('a', { href: link({}) }, 'Home'), ' / ', h('a', { href: link({ view: kind.id }) }, kind.label)),
        h('h1', {}, it.meta.title),
        h('p', { class: 'byline' }, [dateWords(it.meta.issued), (it.meta.creators ?? []).map((c) => c.literal ?? [c.given, c.family].filter(Boolean).join(' ')).join(', ')].filter(Boolean).join(' · '))),
      it.kind === 'doc' ? Markdown(it.body ?? '') : h('p', {}, it.meta.abstract ?? '', href && [' ', h('a', { class: 'btn btn-sm btn-primary', href, target: '_blank', rel: 'noopener' }, icon('download', 14), 'Open the document')]),
      h('nav', { class: 'portal-pager' },
        i > 0 ? h('a', { href: link({ doc: list[i - 1].id }) }, h('small', {}, '← Newer'), list[i - 1].meta.title) : h('span'),
        i < list.length - 1 ? h('a', { class: 'next', href: link({ doc: list[i + 1].id }) }, h('small', {}, 'Older →'), list[i + 1].meta.title) : h('span')),
      h('div', { class: 'portal-doc-tools' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => print() }, icon('download', 14), 'Print or save as PDF'),
        (!isHosted() || session()?.canEdit) && h('a', { class: 'btn btn-sm btn-ghost', href: linkTo('library', `#item/${it.id}`) }, icon('pencil', 14), 'Edit in the Library'))) };
  }
  const kind = BOARD_KINDS.find((k) => k.id === p.view);
  if (!kind) return { current, title, body: BoardHome(site) };
  const list = b[kind.id];
  const results = h('div', { class: 'portal-list' });
  const draw = (q = '') => {
    const term = q.trim().toLowerCase();
    const shown = list.filter((it) => !term || `${it.meta.title} ${it.meta.abstract ?? ''} ${it.body ?? ''}`.toLowerCase().includes(term));
    if (kind.id === 'minutes') {
      const years = [...new Set(shown.map((it) => yearOf(it.meta.issued)))];
      results.replaceChildren(...years.map((y) => h('section', { class: 'portal-year' }, h('h2', {}, y), h('div', { class: 'portal-docs' }, shown.filter((it) => yearOf(it.meta.issued) === y).map(DocRow)))));
    } else results.replaceChildren(h('div', { class: 'portal-docs' }, shown.map(DocRow)));
    if (!shown.length) results.replaceChildren(h('p', { class: 'empty' }, term ? 'Nothing matches.' : 'Nothing here yet.'));
  };
  draw();
  return { current: kind.id, title: kind.label, body: h('div', {},
    h('section', { class: 'site-hero portal slim' }, h('p', { class: 'crumbs' }, h('a', { href: link({}) }, 'Home')), h('h1', {}, kind.label), h('p', {}, kind.blurb)),
    list.length > 4 && h('label', { class: 'portal-search' }, icon('search', 16), h('input', { type: 'search', placeholder: kind.id === 'minutes' ? 'Search the minutes (a decision, a name, a year)' : `Search ${kind.label.toLowerCase()}`, oninput: (e) => draw(e.target.value) })),
    results) };
}

/* ---------------------------------------------------------------- Feedback forms */
function Forms(siteId, place, { members = false } = {}) {
  const list = formsAt(docs.dashboards.forms, siteId, place, { members: members || (staffView && docs.org.sites[siteId]?.visibility === 'private') });
  return list.length ? list.map(FeedbackCard) : null;
}
function FeedbackCard(form) {
  // The same form the designer edits, ready to answer.
  return FormView(form, { onSubmit: async (answers) => {
    const r = cleanResponse(form, answers, { siteId: form.siteId });
    if (!r) throw new Error('answer at least one question first');
    if (isHosted()) {
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify({ formId: form.id, answers }) });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Not sent');
    } else {
      const fb = migrateFeedback(loadDoc('feedback'));
      fb.responses[r.id] = r;
      saveDoc('feedback', fb);
    }
  } });
}

/* Critical Media on the public site: prompts that help visitors read what we publish. */
function FactCheckTip(text) {
  const lessons = lessonsOf(docs.critical);
  const l = suggestFor(text, lessons);
  return h('aside', { class: 'cm-site-tip' },
    h('strong', {}, icon('news', 16), 'Read it like a fact-checker'),
    h('ol', { class: 'cm-site-stc' }, STOP_THINK_CHECK.map((s) => h('li', {}, h('b', {}, s.label), ' ', s.text))),
    l && media(siteId())?.corner && h('p', { class: 'small' }, 'Try the lesson: ', h('a', { href: link({ view: 'media', lesson: l.id }) }, l.title), '.'));
}
function ChartTip() {
  const l = lessonsOf(docs.critical).find((x) => (x.tags ?? []).includes('charts'));
  return h('aside', { class: 'cm-site-tip' },
    h('strong', {}, icon('chart', 16), 'How to read a chart, ours included'),
    h('p', {}, 'Look at the axis: does it start at zero? Check the dates and the source under the chart. Ask what is not shown. Every chart here has a table view, so you can see the numbers themselves.'),
    l && media(siteId())?.corner && h('p', { class: 'small' }, 'More in the lesson ', h('a', { href: link({ view: 'media', lesson: l.id }) }, l.title), '.'));
}
function MediaCorner(lessonId) {
  const lessons = lessonsOf(docs.critical);
  const l = lessons.find((x) => x.id === lessonId);
  if (l) {
    return h('article', { class: 'site-article cm-site-lesson' },
      h('header', {}, h('p', { class: 'crumbs' }, h('a', { href: link({ view: 'media' }) }, 'Media smart')), h('h1', {}, l.title), h('p', { class: 'lede' }, l.takeAway)),
      h('h2', {}, 'What it is for'), h('ul', {}, (l.aims ?? []).map((a) => h('li', {}, a))),
      h('h2', {}, 'Start here'), h('p', {}, l.warmUp),
      h('h2', {}, 'Try this'), h('p', {}, l.activity),
      (l.talk ?? []).length > 0 && [h('h2', {}, 'Talk about it'), h('ul', {}, l.talk.map((q) => h('li', {}, q)))],
      l.stem && [h('h2', {}, 'For STEM learners'), h('p', {}, l.stem)],
      h('p', { class: 'site-small' }, 'After ', h('a', { href: CREDIT.url, target: '_blank', rel: 'noopener' }, 'NALA’s Facts Matter'), '. Our own words; their guide is free and goes further.'));
  }
  return h('div', { class: 'cm-site-corner' },
    h('section', { class: 'site-hero' }, h('h1', {}, 'Media smart'), h('p', {}, 'Ways to read the news, posts and charts (ours too) with a critical eye.')),
    h('section', { class: 'cm-site-stc-big' }, STOP_THINK_CHECK.map((s, i) => h('div', { class: `s${i}` }, h('strong', {}, s.label), h('p', {}, s.text)))),
    h('div', { class: 'section-head' }, h('h2', {}, 'Lessons')),
    h('div', { class: 'news-list' }, lessons.map((x) => h('a', { class: 'news-card', href: link({ view: 'media', lesson: x.id }) }, h('small', { class: 'muted' }, `Lesson ${x.n} · ${x.minutes ?? 60} minutes`), h('strong', {}, x.title), h('span', {}, x.takeAway)))),
    h('div', { class: 'section-head' }, h('h2', {}, 'Six questions to ask')),
    h('div', { class: 'cm-site-six' }, SIX_QUESTIONS.map((q) => h('div', {}, h('b', {}, q.q), h('p', {}, q.text)))),
    h('div', { class: 'section-head' }, h('h2', {}, 'Trace a claim')),
    h('ol', { class: 'cm-site-trace' }, TRACE.map((t) => h('li', {}, h('b', {}, t.label), ' ', t.text))),
    h('p', { class: 'site-small' }, 'Our lessons follow the shape of ', h('a', { href: CREDIT.url, target: '_blank', rel: 'noopener' }, CREDIT.title), ' (', CREDIT.by, ') and use ', h('a', { href: CREDIT.also.url, target: '_blank', rel: 'noopener' }, CREDIT.also.title), ' from ', CREDIT.also.by, '.'));
}

// Move between the site's pages without a reload, so the player keeps playing.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.download || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || !url.search) return;
  e.preventDefault();
  history.pushState(null, '', url);
  render();
  scrollTo(0, 0);
});
window.addEventListener('popstate', render);
// A see-through header turns solid once the page scrolls under it.
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 24), { passive: true });
// Look and feel previews send the org's design as it changes, so the preview follows without a reload.
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'dashi:org' || !e.data.org) return;
  docs.org = e.data.org;
  render();
});
// The station designer (Listen → Public station) sends the station the same way.
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'dashi:podcasts' || !e.data.doc) return;
  docs.podcasts = migratePodcasts(e.data.doc);
  render();
});

onDocChange('dashboards', (doc) => { docs.dashboards = migrateDashboards(doc); render(); });
onDocChange('data', (doc) => { docs.data = doc; render(); });
onDocChange('strategy', (doc) => { docs.strategy = migrateStrategy(doc); render(); });
onDocChange('org', (doc) => { docs.org = doc; render(); });
onDocChange('podcasts', (doc) => { docs.podcasts = migratePodcasts(doc); render(); });
// While a page is being edited live, the editor holds the words: someone else's save waits for Done.
onDocChange('pages', (doc) => { docs.pages = migratePages(doc); if (!(liveEdit && document.querySelector('.be'))) render(); });
onDocChange('library', (doc) => { if (staffMember()) { docs.library = migrateLibrary(doc); render(); } });
onDocChange(CRITICAL_DOC, (doc) => { docs.critical = migrateCritical(doc); render(); });
render();
// ?plan=…&pdf=1 opens a plan ready to save as PDF.
if (params().plan && params().pdf) setTimeout(() => document.querySelector('.site-plan-bar .btn')?.click(), 600);
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
window.site = { docs, player, render };
