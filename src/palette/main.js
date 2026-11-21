import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc, onDocChange } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadDashboards } from '../platform/docs.js';
import { migrateStrategy } from '../platform/strategy.js';
import { dashboardFromNode, scorecardDashboard, boardDashboard } from '../platform/dashboards.js';
import { uid } from '../core/ops.js';
import { currentUser } from '../platform/session.js';
import { DashboardsTool } from './DashboardsTool.js';
import { DataTool } from './DataTool.js';
import { HomeTool } from './HomeTool.js';
import { PostcardTool } from './PostcardTool.js';
import { ImpactTool } from './ImpactTool.js';
import { StoriesTool } from './StoriesTool.js';
import { FeedbackTool } from './FeedbackTool.js';
import { FunderReportsTool } from './FunderReportsTool.js';

/**
 * The Workbench: a suite of mini-tools for bringing people into the
 * data dialogue. Each mini-tool is a function (ctx) → element, listed in
 * MINI_TOOLS. To add one, write the function and add an entry; it gets the
 * same ctx (the org, strategy, data and dashboards, plus helpers).
 *
 * `when(org)` limits a mini-tool to orgs with what it needs (a plugin).
 * The route lives in the URL hash: #home, #dashboards, #<dashboard id>,
 * #data, #postcards, #impact, #stories, #feedback, #reports. (0.2: the Workbench lives inside the
 * Public Portal; podcast publishing is in Podcasts, and each site chooses what it shows in the Portal.)
 */
const MINI_TOOLS = [
  { id: 'home', name: 'Overview', blurb: 'Everything in the Data Workbench', icon: 'workbench', render: HomeTool },
  { id: 'dashboards', name: 'Dashboards', blurb: 'Design private and public dashboards', about: 'Build dashboards from your strategy measures: for staff, for the board, or for a public site.', icon: 'chart', render: DashboardsTool },
  { id: 'data', name: 'Program data', blurb: 'The numbers behind the measures', about: 'Keep the monthly numbers behind each measure current. Every dashboard and site using them updates.', icon: 'timeline', render: DataTool },
  { id: 'postcards', name: 'Data postcards', blurb: 'Share one number, beautifully', about: 'Turn a measure into a shareable picture in your colours, with alt text, for newsletters, social posts and slides.', icon: 'media', render: PostcardTool },
  { id: 'impact', name: 'Impact calculator', blurb: 'What a gift makes possible', about: 'A slider for your site: “a gift of $50 means 3 more youth in a program”, worked out from your own program data.', icon: 'gift', render: ImpactTool },
  { id: 'stories', name: 'Data stories', blurb: 'Words, charts and voices', about: 'Tell what the numbers mean a step at a time, with a chart that changes as readers scroll and audio clips from your programs.', icon: 'story', render: StoriesTool },
  { id: 'feedback', name: 'Feedback forms', blurb: 'Ask readers what they make of it', about: 'A few short questions under your dashboards or on a site’s front page, so the community and the board can say what is clear and what is missing. Answers come back here.', icon: 'chats', render: FeedbackTool, isNew: true },
  { id: 'reports', name: 'Funder reports', blurb: 'A first draft, from your data', about: 'Pick a funder, a period and the work they fund, and get a draft report from your measures, workplans, milestones and stories, ready to edit, print or keep in the Library.', icon: 'handshake', render: FunderReportsTool, isNew: true },
];
const COMING = [];

const org = loadOrg();
let strategy = loadStrategy();
const dashboards = new Store(loadDashboards(), applyCollectionOp);
// Strategic data (the road, goal lights, milestones) reads the whole strategy.
const data = new Store(loadData(), applyCollectionOp);
autosaveDoc('dashboards', dashboards, 150);
autosaveDoc('data', data, 150);
const tools = MINI_TOOLS.filter((t) => !t.when || t.when(org));
Shell(document.querySelector('#shell'), { current: 'palette', org });

const app = document.querySelector('#app');
app.classList.add('palette', 'frame');
let side = h('nav');
const main = h('section', { class: 'palette-main' });
app.replaceChildren(side, main);

const ctx = {
  org,
  dashboards,
  data,
  tools,
  coming: COMING,
  get strategy() { return strategy; },
  get route() { return decodeURIComponent(location.hash.slice(1)) || 'home'; },
  go(route) {
    if (location.hash !== `#${route}`) location.hash = route;
    else render();
  },
  /** Make a dashboard (blank, or from an objective or goal) and open it. */
  create(nodeId, { template = null, copyOf = null } = {}) {
    const me = currentUser(org)?.id ?? null;
    const dash = copyOf
      ? (({ id, ...rest }) => ({ ...structuredClone(rest), title: `${copyOf.title} (copy)`, visibility: 'private', createdBy: me, widgets: rest.widgets.map((w) => ({ ...w, id: uid('w') })) }))(copyOf)
      : template === 'scorecard'
      ? scorecardDashboard(strategy, me)
      : template === 'board'
      ? boardDashboard(strategy, me, { sites: org.sites })
      : nodeId
      ? dashboardFromNode(strategy, nodeId, me)
      : { title: 'Untitled dashboard', description: '', visibility: 'private', siteId: null, createdBy: me, widgets: [] };
    const op = dashboards.apply(col.add('dashboards', dash));
    ctx.go(op.id);
  },
  asOf: {},
  render: () => render(),
};

function render() {
  const route = ctx.route;
  const dashList = Object.values(dashboards.doc.dashboards);
  const tool = tools.find((t) => t.id === route) ?? (dashboards.doc.dashboards[route] ? tools.find((t) => t.id === 'dashboards') : tools[0]);
  const next = SideNav({ label: 'Public Portal', sections: [
    { title: 'Public Portal', items: [
      { label: 'Overview', sub: 'Every site, and what is live', icon: 'home', href: 'pages.html#sites' },
      { label: 'Look and feel', sub: 'Colours and shapes', icon: 'palette', href: 'pages.html#look' },
    ] },
    { title: 'Data', items: [
      ...tools.map((t) => ({ label: t.name, sub: t.blurb, icon: t.icon, href: `#${t.id}`, on: t === tool, badge: t.isNew ? 'New' : null, badgeClass: 'badge-primary badge-soft' })),
      ...COMING.map((t) => ({ label: t.name, sub: 'Coming soon', icon: 'plus', disabled: true, title: t.blurb })),
    ] },
    { title: 'Dashboards', action: { label: 'New dashboard', onclick: () => ctx.create() }, items: dashList.map((d) => ({
      label: d.title, href: `#${d.id}`, on: route === d.id, badge: d.visibility, badgeClass: d.visibility === 'public' ? 'badge-success badge-soft' : 'badge-ghost',
    })) },
  ] });
  side = swapSide(side, next);

  // Keep the focused field and scroll position across the redraw.
  const scroll = main.scrollTop;
  const active = main.contains(document.activeElement) ? document.activeElement : null;
  const focused = active?.name ?? null;
  const sel = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  // Inner panes that scroll on their own (data-keep-scroll="key") keep their place too.
  const inner = Object.fromEntries([...main.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollTop]));
  main.replaceChildren(tool.render(ctx));
  main.scrollTop = scroll;
  for (const el of main.querySelectorAll('[data-keep-scroll]')) el.scrollTop = inner[el.dataset.keepScroll] ?? 0;
  if (focused) {
    const el = main.querySelector(`[name="${focused}"]`);
    el?.focus({ preventScroll: true });
    try { if (sel && el) el.setSelectionRange(...sel); } catch { /* not a text field */ }
  }
}

dashboards.addEventListener('change', render);
data.addEventListener('change', render);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
// Measures edited in Strategy & Work in another tab show up here.
onDocChange('strategy', (doc) => { strategy = migrateStrategy(doc); render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    const store = ctx.route === 'data' ? data : dashboards;
    e.shiftKey ? store.redo() : store.undo();
  }
});
render();

window.palette = ctx;
