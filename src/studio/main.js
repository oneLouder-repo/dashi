import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { swSections } from '../strategy/swNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp } from '../core/collections.js';
import { autosaveDoc, saveDoc, onDocChange } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadStudio, loadMaps, loadLibrary } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { migrateStrategy, strategyOps, rootOf } from '../platform/strategy.js';
import { currentUser } from '../platform/session.js';
import { mergeStudio, migrateStudio, plansOf, studioOps, ofPlan, QUADRANTS } from '../platform/studio.js';
import { short, range, today, daysBetween } from '../strategy/dates.js';
import { taskSummary } from '../platform/strategy.js';
import { loadPlanDocs } from '../platform/docs.js';
import { LevelBadge, ProgressRing, AvatarStack, objectiveOrder } from '../ui/strategyLook.js';
import { PlanHome } from './PlanHome.js';
import { SoarBoard } from './SoarBoard.js';
import { SoarList } from './SoarList.js';
import { Results } from './Results.js';
import { Assemble, assembleLayers } from './Assemble.js';
import { Change } from './Change.js';
import { uiPrompt } from '../ui/dialog.js';

/** Where a plan sits in time: running now, still ahead, or finished. */
const PHASE_LABEL = { now: 'Running now', ahead: 'Up next', done: 'Finished' };
const planPhase = (p, now) => (!p.start || !p.end ? null : now < p.start ? 'ahead' : now > p.end ? 'done' : 'now');

/**
 * Planning Studio: facilitating a strategic plan, online and together.
 *
 *   #framework             the org's framework (mission, vision, values) and its plans
 *   #<planId>              a plan's home: context, team, what it serves
 *   #<planId>/soar         the shared SOAR whiteboard
 *   #<planId>/s|o|a        Strengths, Opportunities, Aspirations as lists, with assets
 *   #<planId>/results      the results framework, on a grid
 *   #<planId>/assemble     the canvas where ideas are wired into goals and objectives
 *   #<planId>/change       the theory of change: "so that" pathways, assumptions, evidence, signposts
 *
 * The side list keeps you inside the Studio: every plan, and under the open
 * one its planning tools in the order a planning season runs. A plan opens
 * where you last left it. Plan and the Plan designer sit apart at
 * the bottom, marked as other plugins.
 *
 * The framework and plans are Plan's (the strategy document);
 * the planning around them is the studio document (platform/studio.js).
 * Other people's saves merge in as they arrive, so a session can run live.
 */
export const TABS = [
  { id: 'home', label: 'Plan home', icon: 'home', blurb: 'Dates, context and team' },
  { id: 'soar', label: 'SOAR board', icon: 'workbench', blurb: 'Strengths, opportunities, aspirations, results' },
  { id: 's', label: 'Strengths', icon: 'star', list: true },
  { id: 'o', label: 'Opportunities', icon: 'globe', list: true },
  { id: 'a', label: 'Aspirations', icon: 'eye', list: true },
  { id: 'assemble', label: 'Assemble', icon: 'connect', blurb: 'Wire ideas into objectives and goals' },
  { id: 'change', label: 'Theory of change', icon: 'flow', blurb: 'Why it works, and what you watch' },
  { id: 'results', label: 'Results', icon: 'chart', blurb: 'Outcomes and indicators' },
];
const TOOL_TABS = TABS.filter((t) => !t.list);
const TAB_LABEL = { s: 'Strengths', o: 'Opportunities', a: 'Aspirations' };
/** Where each plan was last left, so it opens there again. */
const lastTab = (planId) => { try { return localStorage.getItem(`dashi.studio.last.${planId}`) || 'home'; } catch { return 'home'; } };
const rememberTab = (planId, tab) => { try { localStorage.setItem(`dashi.studio.last.${planId}`, tab); } catch { /* private window */ } };
const tabHref = (planId, tab) => `#${planId}${tab === 'home' ? '' : `/${tab}`}`;

const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'studio', org });
const store = new Store(loadStudio(), applyCollectionOp);
const strategy = new Store(loadStrategy(), applyCollectionOp);
autosaveDoc('strategy', strategy);

// Save our changes; merge other people's as they arrive, saving back only if we had something they didn't.
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDoc('studio', store.doc), 200); };
store.addEventListener('change', (e) => { if (e.op?.op !== 'remote') save(); });
onDocChange('studio', (theirs) => {
  theirs = migrateStudio(theirs);
  const merged = mergeStudio(store.doc, theirs);
  const ahead = JSON.stringify(merged) !== JSON.stringify(mergeStudio(theirs, theirs));
  store.map = merged;
  store.dispatchEvent({ type: 'change', op: { op: 'remote' } });
  if (ahead) save();
  live.flash();
});
onDocChange('strategy', (doc) => strategy.load(migrateStrategy(doc)));

const app = document.querySelector('#app');
app.classList.add('frame', 'studio-app');
let side = h('nav');
const main = h('section', { class: 'studio-main' });
app.replaceChildren(side, main);

const live = (() => {
  const el = h('span', { class: 'live-chip', title: 'Changes other people make show up here as they save' }, h('span', { class: 'live-dot-mini' }), 'Live');
  return { el, flash: () => { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } };
})();

const ctx = {
  org,
  store,
  strategy,
  me: currentUser(org),
  get doc() { return store.doc; },
  get route() {
    const [planId, tab = 'home'] = decodeURIComponent(location.hash.slice(1)).split('/');
    const plans = plansOf(strategy.doc);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return { planId: null, tab: 'framework' };
    return { planId, tab: TABS.some((t) => t.id === tab) ? tab : 'home' };
  },
  go(route) { if (location.hash !== `#${route}`) location.hash = route; else render(); },
  add: (collection, data) => store.apply(studioOps.add(collection, data)),
  put: (collection, id, patch) => store.apply(studioOps.update(collection, id, patch)),
  remove: (collection, ids) => store.apply(studioOps.remove(store.doc, collection, ids)),
  /** Documents the asset chooser and asset chips read. */
  get docs() {
    docsCache.strategy = strategy.doc;
    return docsCache;
  },
  // A drag in progress holds redraws until it ends, so the dragged thing doesn't vanish under the pointer.
  dragging: false,
  pending: false,
  render: () => render(),
  live,
};
const docsCache = (() => { const maps = loadMaps(); return { org, maps, mapContents: loadAllMaps(maps), strategy: strategy.doc, library: loadLibrary() }; })();

/** The studio's record for a plan, made the first time someone opens it. */
ctx.planRecord = (planId) => store.doc.plans[planId] ?? { id: planId, team: [], notes: '' };
ctx.savePlan = (planId, patch) => (store.doc.plans[planId] ? ctx.put('plans', planId, patch) : store.apply(studioOps.add('plans', { id: planId, team: [], notes: '', ...patch })));

function drawSide({ planId, tab }) {
  // The same panel on every Plan page (strategy/swNav.js), plus the theory's layers when it's open.
  const extra = planId && tab === 'assemble' ? [assembleLayers(ctx, planId)] : [];
  side = swapSide(side, SideNav({ label: 'Plan', sections: swSections({ page: 'studio', tab, planId, strategy: strategy.doc, studio: store.doc, extra, onNewPlan: newPlan }) }));
}

async function newPlan() {
  const root = rootOf(strategy.doc);
  if (!root) { location.href = 'strategy.html'; return; }  // plans sit under the framework: start that in Plan first
  const title = await uiPrompt('Name of the new strategic plan', 'Strategic plan');
  if (!title?.trim()) return;
  const op = strategy.apply(strategyOps.addNode(strategy.doc, { type: 'plan', parentId: root.id, title: title.trim() }));
  ctx.savePlan(op.id, { team: ctx.me ? [{ staffId: ctx.me.id, role: 'facilitator' }] : [] });
  ctx.go(`${op.id}/soar`);
}

/**
 * The Studio's front page: the framework (editable, in the same look as
 * Plan), then the plans as a tree of cards, each with where its
 * planning stands (SOAR cards, results, team) and where its work stands
 * (tasks done), and the designed plan documents.
 */
function Framework() {
  const root = rootOf(strategy.doc);
  const plans = plansOf(strategy.doc);
  const sdoc = strategy.doc;
  const designs = Object.values(loadPlanDocs().docs ?? {});
  const now = today();
  // Plans sit side by side and can overlap (the old plan winding down as the new one starts).
  const running = plans.filter((x) => planPhase(x, now) === 'now');
  const planCard = (p) => {
    const phase = planPhase(p, now);
    const alongside = phase === 'now' ? running.filter((x) => x.id !== p.id) : [];
    const rec = store.doc.plans[p.id];
    const cards = ofPlan(store.doc, 'cards', p.id);
    const results = ofPlan(store.doc, 'results', p.id).length;
    const objectives = objectiveOrder(sdoc).filter(({ node }) => ancestorsOf(node.id).includes(p.id));
    const t = taskSummary(sdoc, p.id);
    const total = p.start && p.end ? Math.max(1, daysBetween(p.start, p.end)) : 0;
    const gone = total ? Math.max(0, Math.min(1, daysBetween(p.start, now) / total)) : 0;
    const team = (rec?.team ?? []).map((m) => org.staff[m.staffId]);
    const design = designs.find((d) => d.planId === p.id);
    return h('article', { class: `sw-card studio-plan${p.depth ? ' nested' : ''}`, style: `--depth:${p.depth}` },
      h('header', { class: 'studio-plan-top' },
        LevelBadge('plan', { plain: true }),
        h('a', { class: 'studio-plan-name', href: `#${p.id}` }, p.title),
        h('span', { class: 'muted small' }, range(p.start, p.end)),
        phase && h('span', { class: `studio-phase ${phase}` }, PHASE_LABEL[phase]),
        alongside.length > 0 && h('span', { class: 'muted small' }, `Alongside ${alongside.map((x) => x.title).join(', ')}`),
        h('span', { class: 'spacer' }),
        ProgressRing(t.total ? t.done / t.total : 0, { size: 36, label: `${t.done} of ${t.total} tasks done` })),
      total > 0 && h('div', { class: 'sw-plan-time', title: `${Math.round(gone * 100)}% of the way through its dates` }, h('i', { style: `width:${gone * 100}%` }), h('b', { style: `left:${gone * 100}%` })),
      objectives.length > 0 && h('div', { class: 'studio-plan-objs' }, objectives.map(({ node, hue }) => h('a', { class: 'studio-obj-chip', href: `strategy.html#${node.id}`, style: `--hue:${hue}` }, node.title))),
      h('div', { class: 'soar-mini' }, QUADRANTS.map((q) => h('a', { href: `#${p.id}/${q.id === 'r' ? 'results' : ['s', 'o', 'a'].includes(q.id) ? q.id : 'soar'}`, style: `--q:${q.color}` }, h('strong', {}, String(q.id === 'r' ? results || cards.filter((c) => c.quadrant === 'r').length : cards.filter((c) => c.quadrant === q.id).length)), q.label))),
      h('nav', { class: 'studio-plan-tools', 'aria-label': `Planning tools for ${p.title}` },
        TOOL_TABS.filter((t) => t.id !== 'home').map((t) => h('a', { class: `studio-tool${lastTab(p.id) === t.id ? ' last' : ''}`, href: tabHref(p.id, t.id), title: t.blurb }, icon(t.icon, 15), h('span', {}, t.label), badgeFor(p.id, t.id)))),
      h('footer', { class: 'studio-plan-foot' },
        AvatarStack(team, { max: 6, size: 24 }),
        h('span', { class: 'spacer' }),
        h('a', { class: 'btn btn-xs btn-ghost', href: `strategy.html#${p.id}`, title: 'Opens Plan' }, icon('share', 13), 'Work'),
        design ? h('a', { class: 'btn btn-xs btn-ghost', href: `plandoc.html#${design.id}` }, icon('brush', 13), design.status === 'published' ? 'Design · published' : 'Design')
          : h('a', { class: 'btn btn-xs btn-ghost', href: 'plandoc.html', title: 'Make a designed plan document from this plan' }, icon('brush', 13), 'Design it'),
        h('a', { class: 'btn btn-xs btn-primary', href: tabHref(p.id, lastTab(p.id)) }, lastTab(p.id) === 'home' ? 'Open the plan' : `Continue: ${TABS.find((t) => t.id === lastTab(p.id))?.label ?? 'Plan home'}`, icon('chevronRight', 13))));
  };
  const badgeFor = (pid, t) => {
    const k = { soar: ofPlan(store.doc, 'cards', pid).length, change: ofPlan(store.doc, 'toc', pid).length, results: ofPlan(store.doc, 'results', pid).length, assemble: ofPlan(store.doc, 'blocks', pid).length }[t];
    return k ? h('small', {}, String(k)) : null;
  };
  return h('div', { class: 'studio-page-body studio-front' },
    // Not "Planning Studio" any more: it is part of Plan (0.2). Mission and vision live in the Framework.
    PluginHeader('studio', { title: 'Framework and plans', blurb: 'Every plan your organisation has, where its planning stands, and the tools to plan it together.', actions: [
      h('a', { class: 'btn btn-sm btn-ghost', href: 'plandoc.html', title: 'Opens the Plan designer' }, icon('share', 14), 'Plan designer'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: newPlan }, icon('plus', 14), 'New plan')] }),
    !root ? h('p', { class: 'empty' }, 'Start a framework in Plan first.') : [
      h('div', { class: 'sw-section-head' }, h('h2', {}, 'Plans'), h('span', { class: 'muted small' }, 'Plan together here; the plans become work in Plan.')),
      h('div', { class: 'studio-plans' }, plans.map(planCard)),
      h('div', { class: 'sw-section-head' }, h('h2', {}, 'Designed plans'), h('a', { class: 'small', href: 'plandoc.html' }, 'Open the plan designer →')),
      designs.length
        ? h('div', { class: 'studio-designs' }, designs.map((d) => h('a', { class: 'sw-card studio-design', href: `plandoc.html#${d.id}` },
          h('span', { class: `studio-design-thumb pd-thumb-${d.template ?? 'modern'}` }),
          h('div', {}, h('strong', {}, sdoc.nodes[d.planId]?.title ?? 'A removed plan'), h('span', { class: 'muted small' }, d.status === 'published' ? `Published ${d.publishedAt ?? ''}` : 'Draft')))))
        : h('p', { class: 'muted' }, 'No designed plans yet. The plan designer turns a plan into pages to print, save as PDF or publish.'),
    ]);
}
const ancestorsOf = (id) => { const out = []; let n = strategy.doc.nodes[id]; while (n?.parentId) { out.push(n.parentId); n = strategy.doc.nodes[n.parentId]; } return out; };

const VIEWS = { home: PlanHome, soar: SoarBoard, s: SoarList, o: SoarList, a: SoarList, results: Results, assemble: Assemble, change: Change };

function render() {
  if (ctx.dragging) { ctx.pending = true; return; }
  const route = ctx.route;
  drawSide(route);
  const scroll = main.scrollTop;
  const focused = main.contains(document.activeElement) ? document.activeElement.name : null;
  const sel = focused && document.activeElement.selectionStart;
  if (route.tab === 'framework') main.replaceChildren(Framework());
  else {
    const plan = strategy.doc.nodes[route.planId];
    main.replaceChildren(h('div', { class: `studio-page-body tab-${route.tab}` },
      h('header', { class: 'studio-plan-head' },
        h('div', { class: 'studio-plan-title' },
          h('span', { class: 'plugin-header-icon', 'aria-hidden': 'true' }, icon('studio', 22)),
          h('div', {}, h('div', { class: 'studio-plan-kicker' }, LevelBadge('plan', { long: true }), h('a', { class: 'small', href: '#framework' }, '← Framework and plans')), h('h1', {}, plan.title)),
          h('span', { class: 'spacer' }),
          live.el,
          AvatarStack(ctx.planRecord(plan.id).team.map((t) => org.staff[t.staffId]), { max: 8, size: 28 })),
        // The plan's tools are in the left panel (swNav.js), so there are no tabs here to repeat them.
        (route.tab === 'soar' || TAB_LABEL[route.tab]) && h('div', { class: 'device-toggle xs studio-soar-views', role: 'radiogroup', 'aria-label': 'SOAR view' },
          [['soar', 'Board'], ['s', 'Strengths'], ['o', 'Opportunities'], ['a', 'Aspirations']].map(([id, label]) =>
            h('button', { type: 'button', role: 'radio', 'aria-checked': String(route.tab === id), class: route.tab === id ? 'on' : '', onclick: () => ctx.go(tabHref(plan.id, id).slice(1)) }, label)))),
      VIEWS[route.tab](ctx, plan, route.tab)));
    rememberTab(plan.id, route.tab);
  }
  main.scrollTop = scroll;
  if (focused) {
    const el = main.querySelector(`[name="${focused}"]`);
    el?.focus();
    if (el && sel != null && 'setSelectionRange' in el) try { el.setSelectionRange(sel, sel); } catch { /* not a text field */ }
  }
}
ctx.endDrag = () => { ctx.dragging = false; if (ctx.pending) { ctx.pending = false; render(); } };

store.addEventListener('change', render);
strategy.addEventListener('change', render);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    try { e.shiftKey ? store.redo() : store.undo(); } catch { /* someone else removed what that undo touches */ }
  }
});
// Open on the framework and its plans.
if (!location.hash) history.replaceState(null, '', '#framework');
render();
window.studio = ctx;
