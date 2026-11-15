import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { onDocChange, session, isHosted } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards, loadPodcasts, loadPages, loadPlanDocs } from '../platform/docs.js';
import { loadDoc } from '../platform/storage.js';
import { migratePlanDocs, isLivePlan } from '../platform/plandocs.js';
import { PlanDocument } from '../plandoc/render.js';
import { printPlan } from '../plandoc/print.js';
import { migrateStrategy } from '../platform/strategy.js';
import { migratePodcasts, published } from '../platform/podcasts.js';
import { migratePages, siteContent } from '../platform/pages.js';
import { pluginOn } from '../platform/org.js';
import { dashboardMonths } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';
import { CalculatorView } from '../charts/CalculatorView.js';
import { StoryView } from '../charts/StoryView.js';
import { migrateDashboards } from '../platform/dashboards.js';
import { applyTheme } from '../platform/themes.js';
import { Logo, Avatar } from '../ui/Shell.js';
import { Markdown } from '../ui/markdown.js';
import { StationHome, ShowPage, EpisodePage, EpisodeCard, ShowCard, Player, lookClasses } from '../site/station.js';
import { today, short } from '../strategy/dates.js';
import { criticalOn, migrateCritical, onSiteFor, lessonsOf, suggestFor, STOP_THINK_CHECK, SIX_QUESTIONS, TRACE, CREDIT, DOC as CRITICAL_DOC } from '../platform/criticalMedia.js';

/**
 * A sample public site: site.html?site=<id>, with its own pages:
 *
 *   ?site=x                   home: the site's public dashboards, calculators and stories, latest news, latest episode
 *   ?site=x&story=<id>        a data story (Workbench)
 *   ?site=x&page=<slug>       an information page or article (Web views plugin)
 *   ?site=x&view=news         every article, newest first
 *   ?site=x&view=station      the podcast station, if this site hosts it (Podcasts plugin)
 *   ?site=x&show=<id>         a show, by season
 *   ?site=x&episode=<id>      an episode
 *   ?site=x&plan=<id>         a published strategic plan document (Plan designer), printable as PDF
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
  // Visitors get only published plan documents from the server; staff previews read their own.
  plandocs: migratePlanDocs((!isHosted() || session()?.member ? loadPlanDocs() : loadDoc('plandocs')) ?? { docs: {} }),
  critical: migrateCritical(loadDoc(CRITICAL_DOC)),
};
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
player.setLink(link);

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
  const ctx = { doc: pod, org, today: now, player, link };
  player.setLook(pod.station.look);

  // The org's palette and look and feel (Organisation → Public sites and theme), then the station's look.
  applyTheme(document.documentElement, org.theme);
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
  if (!site) body = h('p', { class: 'empty' }, 'There is no site here.');
  else if (site.visibility === 'private') body = h('p', { class: 'empty' }, `${site.name} is private. Staff and board members sign in to see it.`);
  else if (p.page) {
    const pg = content.bySlug(p.page);
    current = pg?.kind === 'article' ? 'news' : `page:${p.page}`;
    title = pg?.title ?? 'Not found';
    body = pg ? Article(pg, embed) : h('p', { class: 'empty' }, 'That page is not here.');
  } else if (p.story) {
    const s = docs.dashboards.stories[p.story];
    const ok = s?.visibility === 'public' && s.siteId === id;
    title = ok ? s.title : 'Not found';
    body = ok ? h('div', { class: 'story-page' }, StoryView(s, docs)) : h('p', { class: 'empty' }, 'That story is not here.');
  } else if (p.plan) {
    const pd = docs.plandocs.docs[p.plan];
    const ok = pd && pd.siteId === id && isLivePlan(pd);
    current = 'plan';
    title = ok ? pd.snapshot.plan.title : 'Not found';
    body = ok ? PlanView(pd) : h('p', { class: 'empty' }, 'That plan is not here.');
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
    current = 'station';
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
  } else body = Home(site, content, hasStation, ctx);

  document.title = `${title ?? 'Site'} · ${org.name}`;
  const navLink = (key, href, label) => h('a', { href, 'aria-current': current === key ? 'page' : null }, label);

  root.replaceChildren(
    // replaceChildren would print a bare false, so an empty string when there's no banner.
    !staffView ? '' : h('div', { class: 'preview-banner' }, isHosted() ? 'You’re signed in, so this is the public site as visitors see it. ' : 'Sample public site, made by Dashi from live data. ', h('a', { href: 'pages.html' }, 'Back to Dashi')),
    h('header', { class: 'site-head' },
      h('div', { class: 'inner' },
        h('a', { class: 'site-brand', href: link({}) }, Logo(org, 36), h('strong', {}, org.name)),
        site?.visibility === 'public' && h('nav', { 'aria-label': site.name },
          navLink('home', link({}), 'Home'),
          content.nav.map((pg) => navLink(`page:${pg.slug}`, link({ page: pg.slug }), pg.title)),
          content.articles.length > 0 && navLink('news', link({ view: 'news' }), 'News'),
          plansHere.length > 0 && navLink('plan', link({ plan: plansHere[0].id }), 'Our plan'),
          hasStation && navLink('station', link({ view: 'station' }), pod.station.name),
          media(id)?.corner && navLink('media', link({ view: 'media' }), 'Media smart')),
        publicSites.length > 1 && h('details', { class: 'dropdown dropdown-end site-switch' },
          h('summary', { class: 'btn btn-ghost btn-sm' }, icon('globe', 16), h('span', { class: 'sr-only' }, 'Our sites')),
          h('ul', { class: 'menu dropdown-content bg-base-100 rounded-box shadow' },
            publicSites.map((s) => h('li', {}, h('a', { href: `?site=${s.id}` }, s.name))))))),
    h('main', { class: 'site-main' }, body),
    h('footer', { class: 'site-foot' },
      h('div', {}, h('strong', {}, org.name), org.description && h('p', {}, org.description)),
      h('address', {},
        org.contact.address && h('div', {}, org.contact.address),
        org.contact.email && h('div', {}, h('a', { href: `mailto:${org.contact.email}` }, org.contact.email)),
        org.contact.phone && h('div', {}, org.contact.phone)),
      h('p', { class: 'site-small' }, 'Every chart has a table view for screen readers and printing.',
        isHosted() && !staffView && [' · ', h('a', { href: '/login.html?next=/index.html' }, 'Staff sign in')])),
  );
}

function Home(site, content, hasStation, ctx) {
  const shown = Object.values(docs.dashboards.dashboards).filter((d) => d.siteId === site.id && d.visibility === 'public');
  const mine = (coll) => Object.values(docs.dashboards[coll] ?? {}).filter((x) => x.siteId === site.id && x.visibility === 'public');
  const calcs = mine('calculators');
  const stories = mine('stories');
  const latest = hasStation ? Object.values(ctx.doc.episodes).filter((e) => published(e, now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] : null;
  return h('div', {},
    h('section', { class: 'site-hero' },
      h('h1', {}, site.name),
      h('p', {}, docs.org.mission, site.shows ? ` This site shares ${site.shows.charAt(0).toLowerCase()}${site.shows.slice(1)}.` : ''),
      shown.length > 0 && h('p', { class: 'live-dot', style: 'margin-top:12px' }, 'Live program data, updated as our programs report.')),
    (content.articles.length > 0 || latest) && h('section', { class: 'home-teasers' },
      content.articles.length > 0 && h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Latest news'), h('a', { href: link({ view: 'news' }) }, 'All news')),
        NewsList(content.articles.slice(0, 3))),
      latest && h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'New on the station'), h('a', { href: link({ view: 'station' }) }, 'All shows')),
        EpisodeCard(ctx, latest, { embed: true }))),
    stories.length > 0 && h('section', { class: 'story-teasers' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Stories from the data')),
      h('div', { class: 'news-list' }, stories.map((s) => h('a', { class: 'news-card story-card', href: link({ story: s.id }) },
        h('small', { class: 'muted' }, `${s.steps.length} steps${s.steps.some((st) => st.audio) ? ' · with audio' : ''}`),
        h('strong', {}, s.title), s.summary && h('span', {}, s.summary))))),
    shown.map(dashboard),
    shown.length > 0 && media(site.id)?.onDashboards && ChartTip(),
    calcs.map((c) => { const v = CalculatorView(c, docs); v.id = c.id; return v; }),
    !shown.length && !calcs.length && !stories.length && !content.articles.length && !latest && h('p', { class: 'empty' }, 'Nothing is published here yet.'));
}

function PlanView(pd) {
  const make = () => PlanDocument(pd, pd.snapshot, { palette: pd.palette || docs.org.theme?.palette });
  return h('div', { class: 'site-plan' },
    h('div', { class: 'site-plan-bar' },
      h('span', { class: 'muted small' }, `Published ${short(pd.publishedAt)}`),
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

onDocChange('dashboards', (doc) => { docs.dashboards = migrateDashboards(doc); render(); });
onDocChange('data', (doc) => { docs.data = doc; render(); });
onDocChange('strategy', (doc) => { docs.strategy = migrateStrategy(doc); render(); });
onDocChange('org', (doc) => { docs.org = doc; render(); });
onDocChange('podcasts', (doc) => { docs.podcasts = migratePodcasts(doc); render(); });
onDocChange('pages', (doc) => { docs.pages = migratePages(doc); render(); });
onDocChange(CRITICAL_DOC, (doc) => { docs.critical = migrateCritical(doc); render(); });
render();
// ?plan=…&pdf=1 opens a plan ready to save as PDF.
if (params().plan && params().pdf) setTimeout(() => document.querySelector('.site-plan-bar .btn')?.click(), 600);
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
window.site = { docs, player, render };
