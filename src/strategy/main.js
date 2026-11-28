import { h } from '../ui/dom.js';
import { Shell } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp } from '../core/collections.js';
import { autosaveDoc, saveDoc, onDocChange, loadDoc } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadMaps, loadData, loadLibrary, loadDashboards, loadStudio } from '../platform/docs.js';
import { savePlanFile, openPlanFile, addPlansOp, addStudioItems } from './planFileUi.js';
import { loadAllMaps } from '../platform/maps.js';
import { seedStrategy } from '../platform/strategySeed.js';
import { childrenOf, rootOf, migrateStrategy, strategyOps } from '../platform/strategy.js';
import { Tree } from './Tree.js';
import { Detail } from './Detail.js';
import { Overview } from './Overview.js';
import { StrategicData, Completion } from './Reports.js';
import { RoadmapRoad } from './Road.js';
import { icon } from '../ui/icons.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { swSections } from './swNav.js';
import { withoutLayers, layersInPlan } from '../platform/strategy.js';
import { short } from './dates.js';
import { uiConfirm, uiPrompt } from '../ui/dialog.js';
import { linkTo } from '../plugins.js';

/**
 * Plan, in sections listed down the shared sidebar:
 *
 *   #overview     the framework at a glance, with a treemap down to workplans
 *   #framework    the interactive framework: the strategy as a tree on the
 *                 left, the selected item on the right. #<id> opens an item,
 *                 so a link can point straight at a plan or task.
 *   #data         every measure against its target
 *   #completion   tasks done per workplan
 *   #roadmap      the roadmap as a road with traffic lights, milestones and goal signs
 *   #<id>/<view>  an item in one of its views: lanes, board, details or a full gantt
 */
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'home', render: Overview },
  { id: 'framework', label: 'Framework', icon: 'strategy' },
  { id: 'data', label: 'Strategic data', icon: 'chart', render: StrategicData },
  { id: 'completion', label: 'Workplan completion', icon: 'timeline', render: Completion },
  { id: 'roadmap', label: 'Roadmap', icon: 'mapTrifold', render: RoadmapRoad },
];
const org = loadOrg();
const store = new Store(loadStrategy(), applyCollectionOp);
autosaveDoc('strategy', store);
Shell(document.querySelector('#shell'), { current: 'strategy', org });

const ctx = {
  store,
  org,
  data: loadData(),
  /** The dashboards document, for the reports to funders on the Gantt (read only here). */
  get dashboards() { return (this._dash ??= loadDashboards()); },
  /** Which tab: a tab id, or 'framework' when the hash names an item. */
  get tab() {
    const hash = decodeURIComponent(location.hash.slice(1)).split('/')[0];
    return TABS.some((t) => t.id === hash) ? hash : store.doc.nodes[hash] ? 'framework' : 'overview';
  },
  /** The view of the selected item: lanes, board, details or gantt (Detail.js VIEWS). */
  get view() { return decodeURIComponent(location.hash.slice(1)).split('/')[1] ?? null; },
  // Other tools' documents, for assets that point into them.
  docs: (() => { const maps = loadMaps(); return { org, maps, mapContents: loadAllMaps(maps), library: loadLibrary() }; })(),
  collapsed: new Set(),
  get selectedId() {
    const id = decodeURIComponent(location.hash.slice(1)).split('/')[0];
    return store.doc.nodes[id] ? id : rootOf(store.doc)?.id;
  },
  select(id) {
    if (decodeURIComponent(location.hash.slice(1)).split('/')[0] !== id) location.hash = id;
    else render();
  },
  addChild(parentId, type) {
    const op = store.apply(strategyOps.addNode(store.doc, { type, parentId }));
    ctx.collapsed.delete(parentId);
    ctx.select(op.id);
  },
  render: () => render(),
};

// Start with tasks folded away under their workplans.
for (const n of Object.values(store.doc.nodes)) if (n.type === 'workplan') ctx.collapsed.add(n.id);

const OUTLINE_KEY = 'dashi.strategy.outline';
const outlineOpen = () => { try { return localStorage.getItem(OUTLINE_KEY) !== '0'; } catch { return true; } };
const treePane = h('aside', { class: 'tree-pane', 'aria-label': 'Outline' });
const detailPane = h('section', { class: 'detail-pane' });
const outlineTab = h('button', { class: 'outline-tab', title: 'Show the outline', hidden: true, onclick: () => { try { localStorage.setItem(OUTLINE_KEY, '1'); } catch { /* fine */ } if (ctx.view === 'gantt') location.hash = ctx.selectedId; else render(); } }, icon('chevronRight', 14), h('span', {}, 'Outline'));
const framework = h('div', { class: 'strategy-body' }, treePane, outlineTab, detailPane);
const report = h('section', { class: 'strategy-report' });
const head = h('div', { class: 'strategy-head' });
const tools = h('div', { class: 'plugin-header-actions' },
    h('button', { class: 'btn btn-sm', onclick: () => store.undo() }, 'Undo'),
    h('button', { class: 'btn btn-sm', onclick: () => store.redo() }, 'Redo'),
    h('button', { class: 'btn btn-sm', title: 'Replace with the example strategy', onclick: () => ctx.loadExample() }, 'Example'));
/** The example strategy, in place of this one (after asking). */
ctx.loadExample = async () => {
  if (!await uiConfirm('Load the example strategy? Your current strategy is replaced.')) return;
  store.load(migrateStrategy(seedStrategy()));
  saveDoc('strategy', store.doc);
  ctx.select(rootOf(store.doc).id);
};
/** A new plan under the framework, named first; it opens in the Framework. */
ctx.newPlan = async () => {
  const root = rootOf(store.doc);
  if (!root) return;
  const title = await uiPrompt('Name of the new strategic plan', 'Strategic plan');
  if (!title?.trim()) return;
  const op = store.apply(strategyOps.addNode(store.doc, { type: 'plan', parentId: root.id, title: title.trim() }));
  ctx.select(op.id);
};
ctx.openPlanFile = () => openPlanFile({ strategy: store.doc, org, apply: (result) => {
  store.apply(addPlansOp(result));
  saveDoc('studio', addStudioItems(loadStudio(), result));
  ctx.select(result.planIds[0]);
} });
/** Plan files: save plans as a .dashi-plan.json file, or open one as new plans. Fresh buttons for each header. */
const fileTools = () => [
  h('button', { class: 'btn btn-sm', title: 'Save plans as a .dashi-plan.json file', onclick: () => savePlanFile({ strategy: store.doc, studio: loadStudio(), org, current: planOfNode(store.doc.nodes[ctx.selectedId]) }) }, icon('download', 14), 'Save plan file'),
  h('button', { class: 'btn btn-sm', title: 'Add the plans in a .dashi-plan.json file', onclick: () => ctx.openPlanFile() }, icon('upload', 14), 'Open plan file'),
];
const app = document.querySelector('#app');
app.classList.add('strategy', 'frame');
let side = h('nav');
app.replaceChildren(side, h('div', { class: 'strategy-column' }, head, framework, report));

function drawSide(tab) {
  // The same panel on every Plan page (swNav.js): its tools, then the Planning Studio's.
  const sel = store.doc.nodes[ctx.selectedId];
  const planId = tab === 'framework' && sel ? planOfNode(sel) : null;
  side = swapSide(side, SideNav({ label: 'Plan', sections: swSections({ page: 'strategy', tab, planId, strategy: store.doc, studio: null, extra: [LayersSection()] }) }));
}

/*
 * Layers, like the mapper's: the plan as accepted, and each theory-of-change
 * layer whose drafts are in it. Hide a layer to see the plan without it, in
 * the outline and the framework sunburst. Remembered per browser.
 */
const LAYER_KEY = 'dashi.strategy.hidden-layers';
ctx.hiddenLayers = new Set((() => { try { return JSON.parse(localStorage.getItem(LAYER_KEY) ?? '[]'); } catch { return []; } })());
ctx.shown = (doc) => withoutLayers(doc, ctx.hiddenLayers);
function LayersSection() {
  const found = layersInPlan(store.doc);
  const names = (() => { try { return loadStudioNames(); } catch { return {}; } })();
  const row = (id, name, count, locked = false) => {
    const off = ctx.hiddenLayers.has(id);
    return h('li', { class: `sw-layer${off ? ' off' : ''}` },
      h('span', { class: 'sw-layer-swatch', style: `--h:${id === 'plan' ? 222 : names[id]?.hue ?? 32}` }),
      h('span', { class: 'sw-layer-name' }, name, h('small', {}, count)),
      !locked && h('button', { class: 'btn btn-ghost btn-xs btn-square', title: off ? 'Show this layer' : 'Hide this layer', 'aria-label': off ? `Show ${name}` : `Hide ${name}`, 'aria-pressed': String(!off),
        onclick: () => { off ? ctx.hiddenLayers.delete(id) : ctx.hiddenLayers.add(id); try { localStorage.setItem(LAYER_KEY, JSON.stringify([...ctx.hiddenLayers])); } catch { /* fine */ } render(); } }, icon(off ? 'eyeOff' : 'eye', 14)));
  };
  const accepted = Object.values(store.doc.nodes).filter((n) => !n.draft && n.type !== 'framework').length;
  return { title: 'Layers', fold: 'sw-layers', className: 'sw-section', body: h('ul', { class: 'sw-layers' },
    row('plan', 'The plan', `${accepted} accepted`, true),
    Object.entries(found).map(([id, c]) => row(id, `${names[id]?.name ?? (id === 'toc' ? 'Theory of change' : id === 'new' ? 'New thinking' : id)} (draft)`, `${c} from the theory of change`))),
  };
}
/** The theory layers' names and colours, from the Planning Studio, if this person can read it. */
function loadStudioNames() {
  const st = loadDoc('studio');
  const out = {};
  for (const p of Object.values(st?.plans ?? {})) for (const l of p.tocLayers ?? []) out[l.id] = l;
  return { new: { name: 'New thinking', hue: 32 }, ...out };
}
/** The plan an item sits under, if any. */
function planOfNode(n) {
  while (n && n.type !== 'plan') n = store.doc.nodes[n.parentId];
  return n?.id ?? null;
}

function render() {
  const tab = ctx.tab;
  drawSide(tab);
  head.replaceChildren(PluginHeader('strategy', { title: tab === 'overview' ? null : `${TABS.find((t) => t.id === tab).label}`, actions: tab === 'framework' ? [...fileTools(), tools] : tab === 'overview' ? fileTools() : null }));
  framework.hidden = tab !== 'framework';
  report.hidden = tab === 'framework';
  if (tab !== 'framework') {
    const scroll = report.scrollTop;
    report.replaceChildren(TABS.find((t) => t.id === tab).render(ctx));
    report.scrollTop = scroll;
    return;
  }
  // Open the path down to the selected item.
  let n = store.doc.nodes[ctx.selectedId];
  while (n?.parentId) {
    ctx.collapsed.delete(n.parentId);
    n = store.doc.nodes[n.parentId];
  }
  const scroll = detailPane.scrollTop;
  const focused = detailPane.contains(document.activeElement) ? document.activeElement.name : null;
  const wide = ctx.view === 'gantt' || !outlineOpen();
  framework.classList.toggle('outline-hidden', wide);
  treePane.replaceChildren(
    h('div', { class: 'tree-head' }, h('span', {}, 'Outline'), h('button', { class: 'btn btn-ghost btn-xs btn-square', title: 'Hide the outline', 'aria-label': 'Hide the outline', onclick: () => { try { localStorage.setItem(OUTLINE_KEY, '0'); } catch { /* fine */ } render(); } }, icon('chevronLeft', 14))),
    Tree(ctx));
  outlineTab.hidden = !wide;
  detailPane.replaceChildren(Detail(ctx));
  detailPane.scrollTop = scroll;
  // Fields carry a name so focus survives the redraw.
  if (focused) detailPane.querySelector(`[name="${focused}"]`)?.focus();
}

store.addEventListener('change', render);
window.addEventListener('hashchange', () => {
  detailPane.scrollTop = 0;
  report.scrollTop = 0;
  render();
});
// Program data entered in the Workbench shows up in the Strategic data tab.
onDocChange('data', (doc) => { ctx.data = doc; if (ctx.tab === 'data') render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  }
});
render();

// For poking at things from the browser console.
window.strategy = ctx;
window.strategy.childrenOf = (id) => childrenOf(store.doc, id);
