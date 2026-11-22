import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { swSections } from '../strategy/swNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { saveDoc, onDocChange, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadPlanDocs, loadAssets } from '../platform/docs.js';
import {
  TEMPLATES, SECTIONS, newPlanDoc, planSnapshot, DOC_PALETTES, FONTS, BACKGROUNDS, COVERS, SCALES, COVER_FILTERS,
  STARTERS, starterById, applyStarter, AREA_KINDS, areaKindById, newArea, layoutOf, allMeasures, MAX_AREA_STORIES, MAX_AREA_MEASURES,
  DESIGN_KEYS, designOf, releasePatch, unreleased, textOf,
} from '../platform/plandocs.js';
import { PALETTES } from '../platform/themes.js';
import { PHOTOS, photoUrl, photoThumb, photoCredit } from '../platform/photos.js';
import { storiesIn, storyOf, newStoryItem, applyStory } from '../platform/stories.js';
import { currentUser } from '../platform/session.js';
import { StoryEditor, StoryPicker } from '../ui/StoryEditor.js';
import { PlanPreview } from './preview.js';
import { PlanDocument, docColours, paletteColours } from './render.js';
import { RichToolbar } from './richText.js';
import { ImagePicker } from './ImagePicker.js';
import { printPlan } from './print.js';
import { short } from '../strategy/dates.js';
import { uiConfirm } from '../ui/dialog.js';
import { linkTo } from '../plugins.js';

/**
 * The Plan designer: a strategic plan document made from the org's own
 * strategy and data, edited in place (click any words to change them),
 * themed with a template, colours and pictures, printed or saved as PDF,
 * and published as a web view on a public site.
 *
 *   plandoc.html#<planDocId>
 */
const org = loadOrg();
let strategy = loadStrategy();
let data = loadData();
const doc = loadPlanDocs();
// Story cards live in the Asset manager (alpha 0.3); the designer reads them, and writes them when you may.
let assets = loadAssets();
const me = currentUser(org);
// The designer is part of the Planning Studio.
Shell(document.querySelector('#shell'), { current: 'studio', org });

const app = document.querySelector('#app');
app.classList.add('strategy', 'frame', 'plandoc-app');
let side = h('nav');
// Alpha 0.3 PR 12: laid out like every plugin (side nav, ribbon, header), with the pages on a
// canvas and the design tools in a floating panel over it that you can drag, fold or tuck away.
const head = h('div', { class: 'plandoc-head' });
const stage = h('div', { class: 'plandoc-stage' });
const panel = h('aside', { class: 'plandoc-panel pd-float', 'aria-label': 'Design tools' });
// Zoom (alpha 0.3 PR 13): the pages fill the canvas by default; zoom in or out and scroll around while
// the tool panel floats over them wherever it's wanted.
const zoomBox = h('div', { class: 'pd-zoom', role: 'group', 'aria-label': 'Zoom' });
const stageWrap = h('div', { class: 'plandoc-stage-wrap' }, stage, panel, zoomBox);
const main = h('section', { class: 'palette-main plandoc-main' }, head, stageWrap);
app.replaceChildren(side, main);

const plans = () => Object.values(strategy.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const current = () => doc.docs[decodeURIComponent(location.hash.slice(1))] ?? Object.values(doc.docs)[0];
let timer;
const save = () => { clearTimeout(timer); timer = setTimeout(() => saveDoc('plandocs', doc), 300); };
let toolbar = null;
/*
 * Undo and redo (alpha 0.3): every design change keeps the design as it was
 * (DESIGN_KEYS only, so publishing is never undone), per document.
 */
const undoLog = { id: null, undo: [], redo: [] };
const remember = (pd) => {
  if (undoLog.id !== pd.id) Object.assign(undoLog, { id: pd.id, undo: [], redo: [] });
  const now = JSON.stringify(designOf(pd));
  if (undoLog.undo.at(-1) !== now) undoLog.undo.push(now);
  if (undoLog.undo.length > 80) undoLog.undo.shift();
  undoLog.redo = [];
};
function restore(pd, from, to) {
  if (undoLog.id !== pd.id || !from.length) return;
  to.push(JSON.stringify(designOf(pd)));
  const was = JSON.parse(from.pop());
  for (const k of DESIGN_KEYS) { if (k in was) pd[k] = was[k]; else delete pd[k]; }
  pd.updatedAt = new Date().toISOString();
  save();
  render();
}
const undo = () => { const pd = current(); if (pd) restore(pd, undoLog.undo, undoLog.redo); };
const redo = () => { const pd = current(); if (pd) restore(pd, undoLog.redo, undoLog.undo); };
const touch = (pd, patch, { redraw = true, keep = true } = {}) => {
  if (keep) remember(pd);
  Object.assign(pd, patch, { updatedAt: new Date().toISOString() });
  save();
  if (redraw) render(); else drawPanel(pd, planSnapshot(strategy, data, pd.planId, org));
};
// The page picked on the canvas or in the Content tool.
let selectedId = null;

function create(planId) {
  const pd = newPlanDoc(planId);
  doc.docs[pd.id] = pd;
  saveDoc('plandocs', doc);
  location.hash = pd.id;
}

function drawSide(pd) {
  // The same panel as the rest of Plan (strategy/swNav.js), then this page's own documents.
  side = swapSide(side, SideNav({ label: 'Plan', sections: swSections({ page: 'plandoc', planId: pd?.planId ?? null, strategy, extra: [
    { title: 'Plan documents', fold: 'sw-plandocs', items: Object.values(doc.docs).map((d) => ({
      label: d.text?.title || strategy.nodes[d.planId]?.title || 'A removed plan', sub: [d.status === 'published' ? `Published${d.release ? `, v${d.release.version}` : ''}` : 'Draft', d.text?.title && strategy.nodes[d.planId]?.title].filter(Boolean).join(' · '), icon: 'doc', href: `#${d.id}`, on: d.id === pd?.id,
    })) },
    { title: 'Make one for a plan', fold: 'sw-plandoc-new', items: plans().map((p) => ({ label: p.title, sub: [p.start, p.end].filter(Boolean).map(short).join(' – '), icon: 'plus', onclick: () => create(p.id) })) },
  ] }) }));
}

function render() {
  const pd = current();
  drawSide(pd);
  if (!pd) {
    head.replaceChildren(PluginHeader('strategy', { title: 'Plan designer', blurb: 'Turn your strategy into a designed plan document to share, print or publish.' }));
    panel.hidden = true;
    stage.replaceChildren(
      h('div', { class: 'card empty-card' }, plans().length
        ? [h('p', {}, 'Pick a plan on the left to make its document.'), h('button', { class: 'btn btn-primary btn-sm', onclick: () => create(plans()[0].id) }, `Make one for “${plans()[0].title}”`)]
        : h('p', {}, 'Add a strategic plan in Plan first: its mission, vision, objectives and goals fill the document.')));
    return;
  }
  const snap = planSnapshot(strategy, data, pd.planId, org);
  if (!snap) {
    panel.hidden = true;
    stage.replaceChildren(h('div', { class: 'card empty-card' }, h('p', {}, 'The plan this document was made from is gone from Plan.'),
      h('button', { class: 'btn btn-sm', onclick: () => { delete doc.docs[pd.id]; saveDoc('plandocs', doc); location.hash = ''; render(); } }, 'Delete this document')));
    return;
  }
  const scroll = stage.scrollTop;
  panel.hidden = false;
  const palette = pd.palette || org.theme?.palette;
  refreshStories(pd);
  if (selectedId && !layoutOf(pd).includes(selectedId)) selectedId = null;
  toolbar?.el.remove();
  toolbar = RichToolbar({ colours: docColours(pd, palette).c });
  const docEl = PlanDocument(pd, snap, {
    editable: true,
    palette,
    toolbar,
    selected: selectedId,
    onPage: (id) => selectPage(id, { tool: pd.areas?.[id] ? 'content' : null }),
    onStory: (areaId, i) => editStory(pd, areaId, i),
    onText: (key, value, html) => {
      const text = { ...pd.text };
      const rich = { ...pd.rich };
      if (value == null) delete text[key]; else text[key] = value;
      if (html) rich[key] = html; else delete rich[key];
      touch(pd, { text, rich }, { redraw: false });
    },
    onImage: (slot, seed) => ImagePicker({
      current: pd.images?.[slot], seed, palette: pd.palette || org.theme?.palette, slotLabel: slot.startsWith('cover') ? 'the cover' : slot.startsWith('area:') ? 'this page' : 'this objective’s page',
      onPick: (img) => touch(pd, { images: { ...pd.images, [slot]: img } }),
    }),
  });
  const changed = unreleased(pd, snap);
  head.replaceChildren(PluginHeader('strategy', {
    title: textOf(pd, snap, 'title'),
    blurb: '',
    actions: [
      h('span', { class: `pd-live${pd.release && pd.status === 'published' ? ' on' : ''}`, title: pd.release ? `Version ${pd.release.version}, published ${short(pd.release.at.slice(0, 10))}` : '' },
        pd.release && pd.status === 'published' ? `Live: version ${pd.release.version}${changed ? ' · changes not published' : ''}` : 'Draft'),
      h('button', { class: 'btn btn-sm', title: 'See it as it will print and publish (P)', onclick: () => openPreview(pd, snap) }, icon('eye', 15), 'Preview'),
      h('button', { class: 'btn btn-sm', title: 'Print it, or choose “Save as PDF” in the print window', onclick: () => printPlan(PlanDocument(pd, snap, { palette }), textOf(pd, snap, 'title')) }, icon('download', 15), 'PDF'),
      (changed || pd.status !== 'published') && h('button', { class: 'btn btn-sm btn-primary', title: 'Publish this version: every link, site and download then shows it', onclick: () => publish(pd, snap) }, icon('globe', 15), publishLabel(pd, snap)),
    ].filter(Boolean),
  }));
  stage.replaceChildren(h('div', { class: 'plandoc-canvas' }, docEl));
  drawPanel(pd, snap);
  fitPages();
  stage.scrollTop = scroll;
}

/*
 * The floating design panel. Tools sit on a rail down its left side, like a
 * paint program's: one tool open at a time, each one small. The panel keeps
 * its place, size and open tool across redraws and visits (localStorage).
 */
const PANEL_KEY = 'dashi.plandoc-panel';
const TOOLS = [
  { id: 'starts', label: 'Starts', icon: 'sparkle' },
  { id: 'template', label: 'Template', icon: 'rows' },
  { id: 'cover', label: 'Cover', icon: 'image' },
  { id: 'content', label: 'Content', icon: 'layers' },
  { id: 'colour', label: 'Colour', icon: 'palette' },
  { id: 'type', label: 'Type', icon: 'textAa' },
  { id: 'page', label: 'Page', icon: 'doc' },
  { id: 'publish', label: 'Publish', icon: 'globe' },
];
let panelState = { x: null, y: 16, tool: 'starts', folded: false, hidden: false, zoom: 'fit' };
try { panelState = { ...panelState, ...JSON.parse(localStorage.getItem(PANEL_KEY) ?? '{}') }; } catch { /* private window: defaults */ }
if (panelState.tool === 'share') panelState.tool = 'publish';
// PR 14: the panel is always there when you open the designer (it used to be possible to hide it and lose it).
panelState.hidden = false;
if (!Number.isFinite(panelState.x)) panelState.x = null;
if (!Number.isFinite(panelState.y)) panelState.y = 16;
const keepPanel = () => { try { localStorage.setItem(PANEL_KEY, JSON.stringify(panelState)); } catch { /* fine */ } };
function setPanel(patch) { panelState = { ...panelState, ...patch }; keepPanel(); render(); }

/** Where the panel sits: dragged there, or tucked into the stage's top right corner. */
function placePanel() {
  const W = stageWrap.clientWidth, H = stageWrap.clientHeight, pw = panel.offsetWidth || 336;
  // Always somewhere you can grab it: its title bar stays inside the canvas, whatever size the window is now.
  const x = panelState.x == null || !W ? Math.max(8, W - pw - 16) : Math.max(8, Math.min(W - pw - 8, panelState.x));
  const y = Math.max(8, Math.min(Math.max(8, H - 44), panelState.y ?? 16));
  Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
  return { x, pw };
}

function dragPanel(e) {
  if (e.button !== 0 || e.target.closest('button')) return;
  e.preventDefault();
  const start = { mx: e.clientX, my: e.clientY, x: panel.offsetLeft, y: panel.offsetTop };
  panel.classList.add('dragging');
  const move = (ev) => {
    panelState.x = start.x + ev.clientX - start.mx;
    panelState.y = start.y + ev.clientY - start.my;
    placePanel();
  };
  const up = () => {
    panel.classList.remove('dragging');
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    panelState.x = panel.offsetLeft; panelState.y = panel.offsetTop;
    keepPanel();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

function drawPanel(pd, snap) {
  if (panelState.hidden) { panel.hidden = true; return; }
  const tool = TOOLS.some((t) => t.id === panelState.tool) ? panelState.tool : 'starts';
  const look = docColours(pd, pd.palette || org.theme?.palette);
  const summary = {
    starts: starterById[pd.starter]?.label ?? 'Set the whole document up',
    content: `${layoutOf(pd).filter((id) => !pd.hidden?.[id]).length} parts showing`,
    template: TEMPLATES.find((t) => t.id === pd.template)?.label ?? 'Template',
    cover: COVERS.find((c) => c.id === (pd.cover ?? 'template'))?.label ?? 'As the template',
    colour: pd.colours ? 'Custom colours' : paletteLabel(pd.palette ?? ''),
    type: [FONTS.find((f) => f.id === pd.fonts?.head)?.label ?? 'Template type', SCALES.find((x) => x.id === (pd.scale ?? 'm'))?.label].filter(Boolean).join(' · '),
    page: BACKGROUNDS.find((b) => b.id === (pd.background?.kind ?? 'plain'))?.label ?? 'Plain',
    publish: pd.status === 'published' && pd.release ? `Version ${pd.release.version}${unreleased(pd, snap) ? ', changes since' : ''}` : 'Draft',
  };
  const body = { starts: StartsTool, template: TemplateTool, cover: CoverTool, content: ContentTool, colour: ColourPicker, type: TypeTool, page: PageTool, publish: PublishTool }[tool](pd, snap);
  panel.classList.toggle('folded', !!panelState.folded);
  panel.style.setProperty('--pd-c0', look.c[0]);
  panel.replaceChildren(
    h('header', { class: 'pd-float-head', onpointerdown: dragPanel, title: 'Drag to move' },
      h('span', { class: 'pd-grip', 'aria-hidden': 'true' }, '⋮⋮'),
      h('strong', {}, panelState.folded ? 'Design tools' : TOOLS.find((t) => t.id === tool).label),
      !panelState.folded && h('small', {}, summary[tool]),
      h('span', { class: 'spacer' }),
      !panelState.folded && h('button', { type: 'button', class: 'pd-shutter', disabled: undoLog.id !== pd.id || !undoLog.undo.length, title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: (e) => { e.stopPropagation(); undo(); } }, icon('undo', 14)),
      !panelState.folded && h('button', { type: 'button', class: 'pd-shutter', disabled: undoLog.id !== pd.id || !undoLog.redo.length, title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', onclick: (e) => { e.stopPropagation(); redo(); } }, icon('redo', 14)),
      // The shutter: rolls the panel up to its title bar, and down again. (No close button: the tools are always to hand.)
      h('button', { type: 'button', class: 'pd-shutter', 'aria-expanded': String(!panelState.folded), title: panelState.folded ? 'Open the tools' : 'Roll the panel up', 'aria-label': panelState.folded ? 'Open the tools' : 'Roll the panel up', onclick: (e) => { e.stopPropagation(); setPanel({ folded: !panelState.folded }); } }, icon(panelState.folded ? 'chevronDown' : 'chevronUp', 14))),
    panelState.folded ? '' : h('div', { class: 'pd-float-body' },
      h('nav', { class: 'pd-rail', 'aria-label': 'Design tools' }, TOOLS.map((t) => h('button', {
        type: 'button', class: `pd-rail-btn${t.id === tool ? ' on' : ''}`, 'aria-pressed': String(t.id === tool), title: `${t.label}: ${summary[t.id]}`,
        onclick: () => setPanel({ tool: t.id, folded: false }),
      }, icon(t.icon, 18), h('span', {}, t.label)))),
      h('div', { class: 'pd-tool' }, body)));
  panel.hidden = false;
  requestAnimationFrame(placePanel);
}

const paletteLabel = (id) => (id === '' ? 'Our colours' : DOC_PALETTES.find((p) => `doc:${p.id}` === id)?.label ?? PALETTES.find((p) => p.id === id)?.label ?? 'Our colours');

function TemplateTool(pd) {
  return h('div', { class: 'pd-templates' }, TEMPLATES.map((t) => h('button', {
    type: 'button', class: `pd-template${t.id === pd.template ? ' on' : ''}`, 'aria-pressed': String(t.id === pd.template), onclick: () => touch(pd, { template: t.id }),
  }, h('span', { class: `pd-template-thumb pd-thumb-${t.id}`, 'aria-hidden': 'true' }), h('b', {}, t.label), h('small', {}, t.blurb))));
}

/** Doc starters: the whole document set up in one click (alpha 0.3). */
function StartsTool(pd) {
  return [
    h('p', { class: 'pd-hint' }, 'Start from a kind of document. Sections, pages, template and cover are set for you; words you typed are kept.'),
    h('div', { class: 'pd-starters' }, STARTERS.map((st) => h('button', {
      type: 'button', class: `pd-starter${pd.starter === st.id ? ' on' : ''}`, 'aria-pressed': String(pd.starter === st.id),
      onclick: async () => {
        const custom = Object.values(pd.areas ?? {}).some((x) => x.starter && x.starter !== st.id);
        if (custom && !(await uiConfirm(`Set this document up as “${st.label}”? The pages the last starter added are swapped for this one’s. Your words and your own pages stay.`, { ok: 'Set it up', danger: false }))) return;
        const p = st.photo && PHOTOS.find((x) => x.id === st.photo);
        const keepCover = pd.images?.cover?.kind === 'url' && pd.images.cover.source !== 'library';
        const patch = applyStarter(pd, st.id, { photo: p && !keepCover ? libraryImage(p) : null });
        // Story pages start with the newest story cards in Assets, so the page reads well straight away.
        const latest = storiesIn(assets);
        Object.values(patch.areas).filter((x) => x.kind === 'story' && !x.stories?.length).forEach((x, i) => { x.stories = latest.slice(i * 2, i * 2 + (x.style === 'feature' ? 3 : 2)); });
        touch(pd, patch);
        toast(`Set up as ${st.label.toLowerCase()}`);
      },
    }, h('span', { class: `pd-starter-thumb t-${st.template}`, 'aria-hidden': 'true' }, st.show.slice(0, 3).map(() => h('i')), st.areas.slice(0, 2).map(([k]) => h('i', { class: `a-${k}` }))),
    h('span', { class: 'pd-starter-text' }, h('b', {}, st.label), h('small', {}, st.blurb))))),
  ];
}

const libraryImage = (p) => ({ kind: 'url', url: photoUrl(p), alt: p.title, credit: photoCredit(p), license: 'Unsplash', source: 'library', photoId: p.id });

function CoverTool(pd) {
  const img = pd.images?.cover;
  const isPhoto = img?.kind === 'url';
  const pickCover = (slot, label) => ImagePicker({ current: pd.images?.[slot], seed: 1, palette: pd.palette || org.theme?.palette, slotLabel: label, onPick: (pick) => touch(pd, { images: { ...pd.images, [slot]: pick } }) });
  const nature = PHOTOS.filter((p) => p.group === 'nature');
  return [
    h('h3', { class: 'pd-h3' }, 'Layout'),
    h('div', { class: 'pd-cover-grid' }, COVERS.map((c) => h('button', { type: 'button', class: `pd-cover-pick k-${c.id}${(pd.cover ?? 'template') === c.id ? ' on' : ''}`, 'aria-pressed': String((pd.cover ?? 'template') === c.id), onclick: () => touch(pd, { cover: c.id }) },
      h('span', { class: 'pd-cover-thumb', 'aria-hidden': 'true' }, h('i'), h('b'), c.id === 'mosaic' && [h('em'), h('em')]), h('span', {}, c.label)))),
    h('h3', { class: 'pd-h3' }, 'Photo'),
    h('p', { class: 'pd-hint' }, 'Nature photos from the Web plugin's photo library. One click puts it on the cover.'),
    h('div', { class: 'pd-photo-strip' }, nature.map((p) => h('button', { type: 'button', class: `pd-photo${img?.photoId === p.id ? ' on' : ''}`, title: `${p.title} · ${photoCredit(p)}`, 'aria-label': p.title, 'aria-pressed': String(img?.photoId === p.id),
      onclick: () => touch(pd, { images: { ...pd.images, cover: libraryImage(p) } }) }, h('img', { src: photoThumb(p), alt: '', loading: 'lazy' })))),
    h('button', { type: 'button', class: 'btn btn-sm w-full', onclick: () => pickCover('cover', 'the cover') }, icon('image', 14), 'More pictures: art, photos, upload'),
    pd.cover === 'mosaic' && h('div', { class: 'pd-two' },
      h('button', { type: 'button', class: 'btn btn-xs', onclick: () => pickCover('cover2', 'the second cover photo') }, 'Second photo'),
      h('button', { type: 'button', class: 'btn btn-xs', onclick: () => pickCover('cover3', 'the third cover photo') }, 'Third photo')),
    h('h3', { class: 'pd-h3' }, 'Tone'),
    h('div', { class: 'pd-chips' }, COVER_FILTERS.map((f) => h('button', { type: 'button', class: `pd-chip${(pd.coverFilter ?? 'none') === f.id ? ' on' : ''}`, disabled: !isPhoto && f.id !== 'none', title: isPhoto ? '' : 'For photos: art is drawn in your colours already', onclick: () => touch(pd, { coverFilter: f.id }) }, f.label))),
  ];
}

/*
 * The content-area editor (alpha 0.3): every part of the document in order,
 * to show or hide, move, and add to: text, picture, data and story pages.
 * The picked part's own settings sit underneath.
 */
const partLabel = (pd, snap, id) => {
  const sec = SECTIONS.find((x) => x.id === id);
  if (sec) return { label: sec.label, sub: id === 'objectives' ? `${snap.objectives.length} page${snap.objectives.length === 1 ? '' : 's'}` : 'From the strategy', icon: { cover: 'image', letter: 'mail', foundations: 'compass', glance: 'tiles', objectives: 'target', numbers: 'chart', closing: 'phone' }[id] ?? 'doc' };
  const a = pd.areas[id];
  const k = areaKindById[a.kind];
  const title = textOf(pd, snap, `area:${id}:title`) || k.label;
  return { label: title, sub: `${k.label} · ${k.styles.find((x) => x.id === a.style)?.label ?? ''}`, icon: k.icon, area: true };
};

function ContentTool(pd, snap) {
  const order = layoutOf(pd);
  const move = (id, to) => { const list = order.filter((x) => x !== id); list.splice(Math.max(0, Math.min(list.length, to)), 0, id); touch(pd, { layout: list }); };
  let dragId = null;
  const rows = order.map((id, i) => {
    const info = partLabel(pd, snap, id);
    const shown = !pd.hidden?.[id];
    const row = h('li', { class: `pd-part${selectedId === id ? ' on' : ''}${shown ? '' : ' off'}`, draggable: 'true', 'data-id': id,
      ondragstart: (e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); row.classList.add('dragging'); },
      ondragend: () => row.classList.remove('dragging'),
      ondragover: (e) => { if (!dragId || dragId === id) return; e.preventDefault(); const r = row.getBoundingClientRect(); row.classList.toggle('drop-after', e.clientY > r.top + r.height / 2); row.classList.toggle('drop-before', e.clientY <= r.top + r.height / 2); },
      ondragleave: () => row.classList.remove('drop-after', 'drop-before'),
      ondrop: (e) => { e.preventDefault(); const after = row.classList.contains('drop-after'); row.classList.remove('drop-after', 'drop-before'); if (!dragId || dragId === id) return; const list = order.filter((x) => x !== dragId); list.splice(list.indexOf(id) + (after ? 1 : 0), 0, dragId); touch(pd, { layout: list }); },
    },
    h('span', { class: 'pd-part-grip', 'aria-hidden': 'true' }, icon('dragHandle', 14)),
    h('button', { type: 'button', class: 'pd-part-main', onclick: () => selectPage(id, { scroll: true }) }, icon(info.icon, 15), h('span', {}, h('b', {}, info.label), h('small', {}, info.sub))),
    h('span', { class: 'pd-part-tools' },
      h('button', { type: 'button', class: 'pd-mini', title: 'Move up', 'aria-label': `Move ${info.label} up`, disabled: i === 0, onclick: () => move(id, i - 1) }, icon('chevronUp', 13)),
      h('button', { type: 'button', class: 'pd-mini', title: 'Move down', 'aria-label': `Move ${info.label} down`, disabled: i === order.length - 1, onclick: () => move(id, i + 1) }, icon('chevronDown', 13)),
      h('button', { type: 'button', class: 'pd-mini', title: shown ? 'Hide it' : 'Show it', 'aria-label': shown ? `Hide ${info.label}` : `Show ${info.label}`, 'aria-pressed': String(shown),
        onclick: () => { const hidden = { ...pd.hidden }; if (shown) hidden[id] = true; else delete hidden[id]; touch(pd, { hidden }); } }, icon(shown ? 'eye' : 'eyeOff', 13))));
    return row;
  });
  const sel = selectedId && order.includes(selectedId) ? selectedId : null;
  return [
    h('h3', { class: 'pd-h3' }, 'Add a page'),
    h('div', { class: 'pd-add-areas' }, AREA_KINDS.map((k) => h('button', { type: 'button', class: 'pd-add-area', title: k.blurb, onclick: () => addArea(pd, k.id) }, icon(k.icon, 16), h('span', {}, k.label)))),
    // The picked part's settings first, so they're in view without scrolling the list.
    sel && PartSettings(pd, snap, sel),
    h('h3', { class: 'pd-h3' }, 'In this document'),
    h('p', { class: 'pd-hint' }, 'Drag to reorder. The eye shows or hides a part. Click a page to pick it.'),
    h('ol', { class: 'pd-parts' }, rows),
  ];
}

function addArea(pd, kind) {
  const { area, text } = newArea(kind);
  const order = layoutOf(pd);
  // After the picked page, or before the closing page.
  const at = selectedId && order.includes(selectedId) ? order.indexOf(selectedId) + 1 : Math.max(0, order.indexOf('closing'));
  order.splice(at, 0, area.id);
  selectedId = area.id;
  panelState.tool = 'content'; keepPanel();
  touch(pd, { areas: { ...pd.areas, [area.id]: area }, layout: order, text: { ...pd.text, ...text } });
  requestAnimationFrame(() => scrollToPage(area.id));
  if (kind === 'story') pickStories(pd, area.id);
}

function PartSettings(pd, snap, id) {
  const a = pd.areas?.[id];
  const box = (...kids) => h('div', { class: 'pd-part-settings' }, ...kids);
  if (!a) {
    const info = partLabel(pd, snap, id);
    return box(h('h3', { class: 'pd-h3' }, info.label), h('p', { class: 'pd-hint' }, id === 'cover' ? 'Change its layout and photo in the Cover tool. Click the words on the page to write.' : 'Words come from the strategy until you type over them on the page.'));
  }
  const k = areaKindById[a.kind];
  const setArea = (patch) => touch(pd, { areas: { ...pd.areas, [id]: { ...a, ...patch } } });
  const remove = async () => {
    if (!(await uiConfirm('Remove this page? Its words and pictures go with it.', { ok: 'Remove page' }))) return;
    const areas = { ...pd.areas }; delete areas[id];
    const text = Object.fromEntries(Object.entries(pd.text ?? {}).filter(([key]) => !key.startsWith(`area:${id}:`)));
    const rich = Object.fromEntries(Object.entries(pd.rich ?? {}).filter(([key]) => !key.startsWith(`area:${id}:`)));
    const images = Object.fromEntries(Object.entries(pd.images ?? {}).filter(([key]) => !key.startsWith(`area:${id}:`)));
    selectedId = null;
    touch(pd, { areas, text, rich, images, layout: layoutOf(pd).filter((x) => x !== id) });
  };
  const pic = (n, label) => h('button', { type: 'button', class: 'btn btn-xs', onclick: () => ImagePicker({ current: pd.images?.[`area:${id}:${n}`], seed: n + 3, palette: pd.palette || org.theme?.palette, slotLabel: 'this page', onPick: (img) => touch(pd, { images: { ...pd.images, [`area:${id}:${n}`]: img } }) }) }, icon('image', 13), label);
  const measures = allMeasures(snap);
  const chosen = a.measureIds ?? [];
  return box(
    h('div', { class: 'pd-part-settings-head' }, icon(k.icon, 15), h('b', {}, `${k.label} page`), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost', title: 'Make a copy', onclick: () => {
        const { area } = newArea(a.kind);
        const copy = { ...structuredClone(a), id: area.id, starter: undefined };
        const text = { ...pd.text }; const rich = { ...pd.rich }; const images = { ...pd.images };
        for (const [key, v] of Object.entries(pd.text ?? {})) if (key.startsWith(`area:${id}:`)) text[key.replace(id, area.id)] = v;
        for (const [key, v] of Object.entries(pd.rich ?? {})) if (key.startsWith(`area:${id}:`)) rich[key.replace(id, area.id)] = v;
        for (const [key, v] of Object.entries(pd.images ?? {})) if (key.startsWith(`area:${id}:`)) images[key.replace(id, area.id)] = v;
        const order = layoutOf(pd); order.splice(order.indexOf(id) + 1, 0, area.id);
        selectedId = area.id;
        touch(pd, { areas: { ...pd.areas, [area.id]: copy }, text, rich, images, layout: order });
      } }, icon('copy', 13)),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost text-error', title: 'Remove this page', 'aria-label': 'Remove this page', onclick: remove }, icon('trash', 13))),
    h('div', { class: 'segmented pd-seg' }, k.styles.map((x) => h('button', { type: 'button', class: (a.style ?? k.styles[0].id) === x.id ? 'on' : '', 'aria-pressed': String((a.style ?? k.styles[0].id) === x.id), onclick: () => setArea({ style: x.id }) }, x.label))),
    a.kind === 'text' && h('p', { class: 'pd-hint' }, a.style === 'quote' ? 'Click the quote on the page to write it, and the name under it.' : 'Click the words on the page to write. Select words for bold, lists and links.'),
    a.kind === 'image' && h('div', { class: 'pd-two' }, pic(0, a.style === 'pair' ? 'First photo' : 'Change the photo'), a.style === 'pair' && pic(1, 'Second photo')),
    a.kind === 'data' && [
      h('p', { class: 'pd-hint' }, measures.length ? `Pick up to ${MAX_AREA_MEASURES}. With none picked, the page shows the plan’s headline numbers.` : 'This plan has no measures yet. Add them in Plan.'),
      h('div', { class: 'pd-measure-pick' }, measures.map((m) => h('label', { class: 'pd-check' },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: chosen.includes(m.id), disabled: !chosen.includes(m.id) && chosen.length >= MAX_AREA_MEASURES,
          onchange: (e) => setArea({ measureIds: e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id) }) }),
        h('span', {}, m.name, !m.facts && h('small', { class: 'muted' }, ' · no data yet'))))),
    ],
    a.kind === 'story' && [
      h('ul', { class: 'pd-story-list' }, (a.stories ?? []).map((st, i) => h('li', {},
        st.images?.[0] ? h('img', { src: st.images[0].url, alt: '' }) : h('span', { class: 'pd-story-noimg' }, icon('story', 14)),
        h('span', { class: 'pd-story-name' }, h('b', {}, st.title || 'Untitled'), h('small', {}, st.assetId && assetById(st.assetId) ? 'In Assets' : st.assetId ? 'Removed from Assets: a copy is kept' : 'Only in this document')),
        h('button', { type: 'button', class: 'pd-mini', title: 'Edit', 'aria-label': `Edit ${st.title}`, onclick: () => editStory(pd, id, i) }, icon('pencil', 13)),
        h('button', { type: 'button', class: 'pd-mini', title: 'Take it off this page', 'aria-label': `Take ${st.title} off this page`, onclick: () => setArea({ stories: a.stories.filter((_, k2) => k2 !== i) }) }, icon('close', 13))))),
      h('div', { class: 'pd-two' },
        h('button', { type: 'button', class: 'btn btn-xs', disabled: (a.stories ?? []).length >= MAX_AREA_STORIES && !storiesIn(assets).length, onclick: () => pickStories(pd, id) }, icon('story', 13), 'Pick from Assets'),
        h('button', { type: 'button', class: 'btn btn-xs', disabled: (a.stories ?? []).length >= MAX_AREA_STORIES, onclick: () => newStory(pd, id) }, icon('plus', 13), 'Write a new one')),
      !canWriteDoc('assets') && h('p', { class: 'pd-hint' }, 'Assets isn’t switched on for you, so new cards are kept in this document only.'),
    ],
  );
}

/* ---------- Story cards on a page ---------- */
const assetById = (id) => (assets.items?.[id]?.kind === 'story' ? assets.items[id] : null);
/** Story copies on pages follow their cards in Assets (the copy is what gets published). */
function refreshStories(pd) {
  for (const a of Object.values(pd.areas ?? {})) {
    if (a.kind !== 'story') continue;
    a.stories = (a.stories ?? []).map((st) => { const it = st.assetId && assetById(st.assetId); return it ? storyOf(it) : st; });
  }
}
const storeAssets = () => { if (canWriteDoc('assets')) saveDoc('assets', assets); };
function setStories(pd, areaId, stories) {
  const a = pd.areas[areaId];
  touch(pd, { areas: { ...pd.areas, [areaId]: { ...a, stories: stories.slice(0, MAX_AREA_STORIES) } } });
}
function pickStories(pd, areaId) {
  const a = pd.areas[areaId];
  const own = (a.stories ?? []).filter((s) => !s.assetId || !assetById(s.assetId));
  StoryPicker({
    stories: storiesIn(assets), chosen: (a.stories ?? []).map((s) => s.assetId).filter(Boolean), max: MAX_AREA_STORIES - own.length,
    onPick: (list) => setStories(pd, areaId, [...list, ...own]),
    onNew: () => newStory(pd, areaId),
  });
}
function newStory(pd, areaId) {
  StoryEditor({ onSave: (st) => {
    let copy = { ...st };
    if (canWriteDoc('assets')) {
      const item = newStoryItem(st, me?.id ?? null);
      assets.items[item.id] = item;
      storeAssets();
      copy = storyOf(item);
      toast('Story card saved to Assets');
    }
    setStories(pd, areaId, [...(pd.areas[areaId].stories ?? []), copy]);
  } });
}
function editStory(pd, areaId, i) {
  const a = pd.areas[areaId];
  const st = a?.stories?.[i];
  if (!st) return;
  const item = st.assetId && assetById(st.assetId);
  StoryEditor({ story: st, title: item ? 'Edit story card (changes it in Assets too)' : 'Edit story', onSave: (next) => {
    let copy = { ...st, ...next };
    if (item && canWriteDoc('assets')) { applyStory(item, next, me?.id ?? null); storeAssets(); copy = storyOf(item); }
    const list = [...a.stories]; list[i] = copy;
    setStories(pd, areaId, list);
  }, onDelete: () => setStories(pd, areaId, a.stories.filter((_, k) => k !== i)) });
}

/* ---------- Picking a page ---------- */
function scrollToPage(id) {
  const el = stage.querySelector(`.pd-page[data-section="${CSS.escape(id)}"]`);
  el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function selectPage(id, { scroll = false, tool = null } = {}) {
  selectedId = id;
  stage.querySelectorAll('.pd-page').forEach((p) => p.classList.toggle('pd-selected', p.dataset.section === id));
  if (tool && panelState.tool !== tool) { panelState.tool = tool; keepPanel(); }
  const pd = current();
  if (pd) drawPanel(pd, planSnapshot(strategy, data, pd.planId, org));
  if (scroll) scrollToPage(id);
}

function TypeTool(pd) {
  const pick = (key, label) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label),
    h('div', { class: 'pd-font-list', role: 'radiogroup', 'aria-label': label },
      [{ id: '', label: 'As the template', stack: 'inherit' }, ...FONTS].map((f) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String((pd.fonts?.[key] ?? '') === f.id), class: `pd-font${(pd.fonts?.[key] ?? '') === f.id ? ' on' : ''}`, style: `font-family:${f.stack}`,
        onclick: () => touch(pd, { fonts: { ...pd.fonts, [key]: f.id || undefined } }),
      }, f.label))));
  return [
    pick('head', 'Headings'),
    pick('body', 'Body text'),
    h('div', { class: 'pd-chips' }, h('span', { class: 'muted small' }, 'Size'), SCALES.map((x) => h('button', { type: 'button', class: `pd-chip${(pd.scale ?? 'm') === x.id ? ' on' : ''}`, onclick: () => touch(pd, { scale: x.id }) }, x.label))),
  ];
}

function PageTool(pd) {
  const changedWords = Object.keys(pd.text ?? {}).length;
  return [
    h('h3', { class: 'pd-h3' }, 'Background'),
    BackgroundPicker(pd),
    h('p', { class: 'pd-hint' }, 'Show, hide, move and add pages in the Content tool.'),
    changedWords > 0 && h('div', { class: 'pd-note' }, `${changedWords} piece${changedWords === 1 ? '' : 's'} of text changed from the strategy.`,
      h('button', { class: 'btn btn-xs btn-ghost', onclick: async () => { if (await uiConfirm('Go back to the words in the strategy? What you typed here is dropped.')) touch(pd, { text: {} }); } }, 'Reset the words')),
  ].filter(Boolean);
}

/*
 * Publishing (alpha 0.3) freezes the design and the plan as a release. The
 * site page, the PDF download and every link show the latest release, so
 * designing goes on without visitors seeing half-done pages.
 */
function PublishTool(pd, snap) {
  const sites = Object.values(org.sites ?? {});
  const site = org.sites?.[pd.siteId];
  const live = pd.status === 'published' && pd.release;
  const changed = unreleased(pd, snap);
  const who = (id) => org.staff?.[id]?.name;
  return [
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Web view on'),
      h('select', { class: 'select select-sm w-full', onchange: (e) => touch(pd, { siteId: e.target.value || null }, { keep: false }) },
        h('option', { value: '' }, 'Choose a site'), options(sites.map((x) => ({ id: x.id, label: `${x.name}${x.visibility === 'private' ? ' (private)' : ''}` })), pd.siteId))),
    h('div', { class: `pd-release${live ? ' on' : ''}` },
      h('p', { class: `pd-status${live ? ' on' : ''}` }, live ? `Live: version ${pd.release.version}` : pd.release ? 'Unpublished' : 'Draft: only staff can see it'),
      live && h('p', { class: 'pd-hint' }, `Published ${short(pd.release.at.slice(0, 10))}${who(pd.release.by) ? ` by ${who(pd.release.by)}` : ''}. Links, the site and the PDF download all show this version.`),
      live && changed && h('p', { class: 'pd-hint pd-changed' }, 'You’ve changed things since. Visitors still see the last version until you publish again.'),
      h('div', { class: 'pd-share-actions' },
        changed || !live ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => publish(pd, snap) }, icon('globe', 14), publishLabel(pd, snap)) : h('span', { class: 'pd-uptodate' }, icon('check', 14), 'Up to date'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => openPreview(pd, snap) }, icon('eye', 14), 'Preview first'),
        live && site && h('a', { class: 'btn btn-sm btn-ghost', href: `site.html?site=${site.id}&plan=${pd.id}`, target: '_blank' }, 'View it'))),
    (pd.releases ?? []).length > 0 && h('details', { class: 'pd-more' },
      h('summary', {}, `Versions (${pd.releases.length})`),
      h('ol', { class: 'pd-versions' }, pd.releases.map((r) => h('li', { class: r.version === pd.release?.version ? 'on' : '' },
        h('b', {}, `Version ${r.version}`), h('span', {}, `${short(r.at.slice(0, 10))}${who(r.by) ? ` · ${who(r.by)}` : ''}`), r.version === pd.release?.version && h('small', {}, live ? 'live' : 'last'))))),
    h('p', { class: 'muted small' }, 'Link to it from emails and pages, or insert it into a Library doc: the link always opens the latest version.'),
    h('div', { class: 'pd-share-actions' },
      live && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => touch(pd, { status: 'draft' }, { keep: false }) }, 'Unpublish'),
      h('button', { class: 'btn btn-xs btn-ghost text-error', onclick: async () => { if (await uiConfirm('Delete this plan document?')) { delete doc.docs[pd.id]; saveDoc('plandocs', doc); location.hash = ''; render(); } } }, 'Delete this document')),
  ].filter(Boolean);
}

function publishLabel(pd, snap) {
  if (pd.status !== 'published' || !pd.release) return pd.release ? 'Publish again' : 'Publish';
  return unreleased(pd, snap) ? `Publish version ${pd.release.version + 1}` : 'Published';
}

function openPreview(pd, snap) {
  const palette = pd.palette || org.theme?.palette;
  const changed = unreleased(pd, snap);
  PlanPreview({
    doc: PlanDocument(pd, snap, { palette }),
    title: textOf(pd, snap, 'title'),
    status: pd.release && pd.status === 'published' ? (changed ? `Not published yet: visitors see version ${pd.release.version}` : `This is version ${pd.release.version}, live now`) : 'Draft: not published yet',
    onPrint: () => printPlan(PlanDocument(pd, snap, { palette }), textOf(pd, snap, 'title')),
    onPublish: changed || pd.status !== 'published' ? () => publish(pd, snap) : null,
    publishLabel: publishLabel(pd, snap),
  });
}

/** Palettes as swatches: the org's own, the app themes, and colour sets made for print; then custom colours. */
function ColourPicker(pd) {
  const now = pd.palette ?? '';
  const sw = (id, label, dots) => h('button', { type: 'button', class: `pd-sw${now === id ? ' on' : ''}`, title: label, onclick: () => touch(pd, { palette: id, colours: null, paper: null }) },
    h('span', { class: 'pd-sw-dots' }, dots.map((c) => h('i', { style: `background:${c}` }))), h('span', {}, label));
  const look = docColours(pd, pd.palette || org.theme?.palette);
  const custom = (i) => h('label', {}, ['Main', 'Second', 'Third'][i],
    h('input', { type: 'color', value: look.c[i], onchange: (e) => { const colours = [...(pd.colours ?? [null, null, null])]; colours[i] = e.target.value; touch(pd, { colours }); } }));
  // Grouped, so the long list reads: yours first, then sets made for print, then the app's themes (folded).
  const themes = PALETTES.filter((p) => !/dark/i.test(p.label));
  return h('div', { class: 'pd-colours' },
    h('div', { class: 'pd-now', style: `--p:${look.paper}` }, look.c.map((c) => h('i', { style: `background:${c}` })), h('span', {}, 'Now')),
    h('h3', { class: 'pd-h3' }, 'Yours'),
    h('div', { class: 'pd-swatch-grid' }, sw('', 'Our colours', paletteColours(org.theme?.palette))),
    h('h3', { class: 'pd-h3' }, 'Made for print'),
    h('div', { class: 'pd-swatch-grid' }, DOC_PALETTES.map((p) => sw(`doc:${p.id}`, p.label, p.c))),
    h('details', { class: 'pd-more', open: themes.some((p) => p.id === now) },
      h('summary', {}, `App themes (${themes.length})`),
      h('div', { class: 'pd-swatch-grid' }, themes.map((p) => sw(p.id, p.label, paletteColours(p.id))))),
    h('h3', { class: 'pd-h3' }, 'Your own'),
    h('div', { class: 'pd-custom-colours' },
      [0, 1, 2].map(custom),
      h('label', {}, 'Paper', h('input', { type: 'color', value: look.paper, onchange: (e) => touch(pd, { paper: e.target.value }) })),
      (pd.colours || pd.paper) && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => touch(pd, { colours: null, paper: null }) }, 'Reset')));
}

function BackgroundPicker(pd) {
  const bg = pd.background ?? { kind: 'plain', strength: 50 };
  const look = docColours(pd, pd.palette || org.theme?.palette);
  const img = pd.images?.background;
  return h('div', { class: 'pd-bgs' },
    h('div', { class: 'pd-bg-grid-pick', style: `--t0:${look.c[0]};--t1:${look.c[1]};--t2:${look.c[2]};${img?.kind === 'url' ? `--timg:url("${img.url}")` : ''}` },
      BACKGROUNDS.map((b) => h('button', { type: 'button', class: `pd-bg-tile k-${b.id}${bg.kind === b.id ? ' on' : ''}`, onclick: () => {
        if (b.id === 'image' && !img) return pickBackground(pd);
        touch(pd, { background: { ...bg, kind: b.id } });
      } }, h('span', {}, b.label)))),
    bg.kind !== 'plain' && h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Strength'),
      h('input', { type: 'range', class: 'range range-xs pd-range', min: 10, max: 100, step: 5, value: bg.strength ?? 50, onchange: (e) => touch(pd, { background: { ...bg, strength: +e.target.value } }) })),
    bg.kind === 'image' && h('button', { type: 'button', class: 'btn btn-xs', onclick: () => pickBackground(pd) }, icon('image', 14), 'Change the picture'));
}

function pickBackground(pd) {
  ImagePicker({ current: pd.images?.background, seed: 7, palette: pd.palette || org.theme?.palette, slotLabel: 'the page background',
    onPick: (img) => touch(pd, { images: { ...pd.images, background: img }, background: { strength: 25, ...pd.background, kind: 'image' } }) });
}

function publish(pd, snap) {
  // No site chosen yet: the first public one (and say so).
  let siteId = pd.siteId;
  if (!siteId) siteId = Object.values(org.sites ?? {}).find((x) => x.visibility === 'public')?.id ?? null;
  if (!siteId) { toast('Add a public site in Web first, then publish to it.'); return; }
  refreshStories(pd);
  const patch = releasePatch(pd, snap, me?.id ?? null);
  touch(pd, { ...patch, siteId }, { keep: false });
  toast(`Published version ${patch.release.version}${pd.siteId !== siteId ? ` on ${org.sites[siteId].name}` : ''}. Every link now shows it.`);
}

/** Shrink the pages to fit the space between the side panels (they print full size). */
function fitPages() {
  const docEl = stage.querySelector('.pd-doc');
  if (!docEl) { zoomBox.hidden = true; return; }
  if (!panel.hidden && !panelState.hidden) placePanel();
  // The pages fill the canvas; the floating panel sits over them, out of the way or not, as you like.
  const fit = Math.max(0.3, Math.min(2, (stage.clientWidth - 48) / 816));
  const z = panelState.zoom === 'fit' || !Number(panelState.zoom) ? fit : Number(panelState.zoom);
  docEl.style.zoom = String(z);
  zoomBox.hidden = false;
  const step = (k) => { const next = Math.max(0.3, Math.min(2, Math.round((z + k) * 10) / 10)); panelState.zoom = next; keepPanel(); fitPages(); };
  zoomBox.replaceChildren(
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => step(-0.1) }, '−'),
    h('span', { class: 'pd-zoom-n' }, `${Math.round(z * 100)}%`),
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => step(0.1) }, '+'),
    h('button', { type: 'button', class: `btn btn-ghost btn-xs${panelState.zoom === 'fit' ? ' on' : ''}`, title: 'Fit the pages to the canvas', onclick: () => { panelState.zoom = 'fit'; keepPanel(); fitPages(); } }, 'Fit'));
}
// Ctrl or ⌘ and the wheel zooms, like the mapper.
stage.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const docEl = stage.querySelector('.pd-doc');
  const z = Number(docEl?.style.zoom) || 1;
  panelState.zoom = Math.max(0.3, Math.min(2, Math.round((z * (e.deltaY < 0 ? 1.1 : 0.9)) * 100) / 100));
  keepPanel(); fitPages();
}, { passive: false });
window.addEventListener('resize', fitPages);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (!panel.hidden) placePanel(); }).observe(stageWrap);
window.addEventListener('hashchange', () => { stage.scrollTop = 0; selectedId = null; render(); });
// Undo, redo and preview from the keyboard, when you aren't typing.
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('[contenteditable="true"], input, textarea, select, dialog') || document.documentElement.classList.contains('pv-open')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (!mod && !e.altKey && e.key.toLowerCase() === 'p') { const pd = current(); const snap = pd && planSnapshot(strategy, data, pd.planId, org); if (snap) { e.preventDefault(); openPreview(pd, snap); } }
});
onDocChange('assets', (d) => { assets = d; render(); });
onDocChange('strategy', (d) => { strategy = d; render(); });
onDocChange('data', (d) => { data = d; render(); });
render();
window.plandoc = { doc, current };
