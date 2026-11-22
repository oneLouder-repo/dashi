import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { swSections } from '../strategy/swNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { saveDoc, onDocChange } from '../platform/storage.js';
import { loadOrg, loadStrategy, loadData, loadPlanDocs } from '../platform/docs.js';
import { TEMPLATES, SECTIONS, newPlanDoc, planSnapshot, DOC_PALETTES, FONTS, BACKGROUNDS, COVERS, SCALES } from '../platform/plandocs.js';
import { PALETTES } from '../platform/themes.js';
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
const touch = (pd, patch, { redraw = true } = {}) => {
  Object.assign(pd, patch, { updatedAt: new Date().toISOString() });
  save();
  if (redraw) render(); else drawPanel(pd, planSnapshot(strategy, data, pd.planId, org));
};

function create(planId) {
  const pd = newPlanDoc(planId);
  doc.docs[pd.id] = pd;
  saveDoc('plandocs', doc);
  location.hash = pd.id;
}

function drawSide(pd) {
  // The same panel as the rest of Strategy & Work (strategy/swNav.js), then this page's own documents.
  side = swapSide(side, SideNav({ label: 'Strategy & Work', sections: swSections({ page: 'plandoc', planId: pd?.planId ?? null, strategy, extra: [
    { title: 'Plan documents', fold: 'sw-plandocs', items: Object.values(doc.docs).map((d) => ({
      label: strategy.nodes[d.planId]?.title ?? 'A removed plan', sub: d.status === 'published' ? 'Published' : 'Draft', icon: 'doc', href: `#${d.id}`, on: d.id === pd?.id,
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
        : h('p', {}, 'Add a strategic plan in Strategy & Work first: its mission, vision, objectives and goals fill the document.')));
    return;
  }
  const snap = planSnapshot(strategy, data, pd.planId, org);
  if (!snap) {
    panel.hidden = true;
    stage.replaceChildren(h('div', { class: 'card empty-card' }, h('p', {}, 'The plan this document was made from is gone from Strategy & Work.'),
      h('button', { class: 'btn btn-sm', onclick: () => { delete doc.docs[pd.id]; saveDoc('plandocs', doc); location.hash = ''; render(); } }, 'Delete this document')));
    return;
  }
  const scroll = stage.scrollTop;
  panel.hidden = false;
  const palette = pd.palette || org.theme?.palette;
  toolbar?.el.remove();
  toolbar = RichToolbar({ colours: docColours(pd, palette).c });
  const docEl = PlanDocument(pd, snap, {
    editable: true,
    palette,
    toolbar,
    onText: (key, value, html) => {
      const text = { ...pd.text };
      const rich = { ...pd.rich };
      if (value == null) delete text[key]; else text[key] = value;
      if (html) rich[key] = html; else delete rich[key];
      touch(pd, { text, rich }, { redraw: false });
    },
    onImage: (slot, seed) => ImagePicker({
      current: pd.images?.[slot], seed, palette: pd.palette || org.theme?.palette, slotLabel: slot === 'cover' ? 'the cover' : 'this objective’s page',
      onPick: (img) => touch(pd, { images: { ...pd.images, [slot]: img } }),
    }),
  });
  head.replaceChildren(PluginHeader('strategy', {
    title: snap.plan.title,
    blurb: '',
    actions: [
      panelState.hidden && h('button', { class: 'btn btn-sm', onclick: () => setPanel({ hidden: false }) }, icon('brush', 15), 'Design tools'),
      h('button', { class: 'btn btn-sm', title: 'Print it, or choose “Save as PDF” in the print window', onclick: () => printPlan(docEl.cloneNode(true), snap.plan.title) }, icon('download', 15), 'Print or save as PDF'),
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
  { id: 'template', label: 'Template', icon: 'rows' },
  { id: 'cover', label: 'Cover', icon: 'image' },
  { id: 'colour', label: 'Colour', icon: 'palette' },
  { id: 'type', label: 'Type', icon: 'textAa' },
  { id: 'page', label: 'Page', icon: 'doc' },
  { id: 'share', label: 'Share', icon: 'globe' },
];
let panelState = { x: null, y: 16, tool: 'template', folded: false, hidden: false, zoom: 'fit' };
try { panelState = { ...panelState, ...JSON.parse(localStorage.getItem(PANEL_KEY) ?? '{}') }; } catch { /* private window: defaults */ }
const keepPanel = () => { try { localStorage.setItem(PANEL_KEY, JSON.stringify(panelState)); } catch { /* fine */ } };
function setPanel(patch) { panelState = { ...panelState, ...patch }; keepPanel(); render(); }

/** Where the panel sits: dragged there, or tucked into the stage's top right corner. */
function placePanel() {
  const W = stageWrap.clientWidth, H = stageWrap.clientHeight, pw = panel.offsetWidth || 320, ph = panel.offsetHeight || 200;
  const x = panelState.x == null ? W - pw - 16 : Math.max(8, Math.min(W - pw - 8, panelState.x));
  const y = Math.max(8, Math.min(Math.max(8, H - Math.min(ph, 120)), panelState.y ?? 16));
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
  const tool = TOOLS.some((t) => t.id === panelState.tool) ? panelState.tool : 'template';
  const look = docColours(pd, pd.palette || org.theme?.palette);
  const summary = {
    template: TEMPLATES.find((t) => t.id === pd.template)?.label ?? 'Template',
    cover: COVERS.find((c) => c.id === (pd.cover ?? 'template'))?.label ?? 'As the template',
    colour: pd.colours ? 'Custom colours' : paletteLabel(pd.palette ?? ''),
    type: [FONTS.find((f) => f.id === pd.fonts?.head)?.label ?? 'Template type', SCALES.find((x) => x.id === (pd.scale ?? 'm'))?.label].filter(Boolean).join(' · '),
    page: BACKGROUNDS.find((b) => b.id === (pd.background?.kind ?? 'plain'))?.label ?? 'Plain',
    share: pd.status === 'published' ? 'Published' : 'Draft',
  };
  const body = { template: TemplateTool, cover: CoverTool, colour: ColourPicker, type: TypeTool, page: PageTool, share: ShareTool }[tool](pd, snap);
  panel.classList.toggle('folded', !!panelState.folded);
  panel.style.setProperty('--pd-c0', look.c[0]);
  panel.replaceChildren(
    h('header', { class: 'pd-float-head', onpointerdown: dragPanel, title: 'Drag to move' },
      h('span', { class: 'pd-grip', 'aria-hidden': 'true' }, '⋮⋮'),
      h('strong', {}, panelState.folded ? 'Design' : TOOLS.find((t) => t.id === tool).label),
      !panelState.folded && h('small', {}, summary[tool]),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', title: panelState.folded ? 'Open the panel' : 'Fold to the tool rail', 'aria-label': panelState.folded ? 'Open the panel' : 'Fold the panel', onclick: () => setPanel({ folded: !panelState.folded }) }, panelState.folded ? '▸' : '▾'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', title: 'Hide the design tools (bring them back from the header)', 'aria-label': 'Hide the design tools', onclick: () => setPanel({ hidden: true }) }, icon('close', 13))),
    h('div', { class: 'pd-float-body' },
      h('nav', { class: 'pd-rail', 'aria-label': 'Design tools' }, TOOLS.map((t) => h('button', {
        type: 'button', class: `pd-rail-btn${t.id === tool ? ' on' : ''}`, 'aria-pressed': String(t.id === tool), title: `${t.label}: ${summary[t.id]}`,
        onclick: () => setPanel({ tool: t.id, folded: false }),
      }, icon(t.icon, 18), h('span', {}, t.label)))),
      !panelState.folded && h('div', { class: 'pd-tool' }, body)));
  panel.hidden = false;
  requestAnimationFrame(placePanel);
}

const paletteLabel = (id) => (id === '' ? 'Our colours' : DOC_PALETTES.find((p) => `doc:${p.id}` === id)?.label ?? PALETTES.find((p) => p.id === id)?.label ?? 'Our colours');

function TemplateTool(pd) {
  return h('div', { class: 'pd-templates' }, TEMPLATES.map((t) => h('button', {
    type: 'button', class: `pd-template${t.id === pd.template ? ' on' : ''}`, 'aria-pressed': String(t.id === pd.template), onclick: () => touch(pd, { template: t.id }),
  }, h('span', { class: `pd-template-thumb pd-thumb-${t.id}`, 'aria-hidden': 'true' }), h('b', {}, t.label), h('small', {}, t.blurb))));
}

function CoverTool(pd) {
  const img = pd.images?.cover;
  return [
    h('p', { class: 'pd-hint' }, 'How the cover page is laid out.'),
    h('div', { class: 'pd-cover-grid' }, COVERS.map((c) => h('button', { type: 'button', class: `pd-cover-pick k-${c.id}${(pd.cover ?? 'template') === c.id ? ' on' : ''}`, 'aria-pressed': String((pd.cover ?? 'template') === c.id), onclick: () => touch(pd, { cover: c.id }) },
      h('span', { class: 'pd-cover-thumb', 'aria-hidden': 'true' }, h('i'), h('b')), h('span', {}, c.label)))),
    h('button', { type: 'button', class: 'btn btn-sm w-full', onclick: () => ImagePicker({ current: img, seed: 1, palette: pd.palette || org.theme?.palette, slotLabel: 'the cover', onPick: (pick) => touch(pd, { images: { ...pd.images, cover: pick } }) }) },
      icon('image', 14), img ? 'Change the cover picture' : 'Choose a cover picture'),
  ];
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
    h('h3', { class: 'pd-h3' }, 'Sections'),
    h('div', { class: 'pd-sections' }, SECTIONS.map((sec) => h('label', { class: 'pd-check' },
      h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: !pd.hidden?.[sec.id], onchange: (e) => { const hidden = { ...pd.hidden }; if (e.target.checked) delete hidden[sec.id]; else hidden[sec.id] = true; touch(pd, { hidden }); } }),
      sec.label))),
    changedWords > 0 && h('div', { class: 'pd-note' }, `${changedWords} piece${changedWords === 1 ? '' : 's'} of text changed from the strategy.`,
      h('button', { class: 'btn btn-xs btn-ghost', onclick: async () => { if (await uiConfirm('Go back to the words in the strategy? What you typed here is dropped.')) touch(pd, { text: {} }); } }, 'Reset the words')),
  ].filter(Boolean);
}

function ShareTool(pd, snap) {
  const sites = Object.values(org.sites ?? {});
  const site = org.sites?.[pd.siteId];
  const stale = pd.status === 'published' && pd.snapshot && JSON.stringify({ ...pd.snapshot, takenAt: 0 }) !== JSON.stringify({ ...snap, takenAt: 0 });
  return [
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Web view on'),
      h('select', { class: 'select select-sm w-full', onchange: (e) => touch(pd, { siteId: e.target.value || null }) },
        h('option', { value: '' }, 'Choose a site'), options(sites.map((x) => ({ id: x.id, label: `${x.name}${x.visibility === 'private' ? ' (private)' : ''}` })), pd.siteId))),
    pd.status === 'published'
      ? h('div', { class: 'pd-share' },
        h('p', { class: 'pd-status on' }, `Published ${pd.publishedAt ?? ''}`),
        stale && h('p', { class: 'muted small' }, 'The strategy or data has changed since. Update to show the latest.'),
        h('div', { class: 'pd-share-actions' },
          h('button', { class: `btn btn-sm ${stale ? 'btn-primary' : ''}`, onclick: () => publish(pd, snap) }, 'Update'),
          site && h('a', { class: 'btn btn-sm btn-ghost', href: `site.html?site=${site.id}&plan=${pd.id}`, target: '_blank' }, 'View it'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => touch(pd, { status: 'draft' }) }, 'Unpublish')))
      : h('div', { class: 'pd-share' },
        h('p', { class: 'pd-status' }, 'Draft: only staff can see it'),
        h('button', { class: 'btn btn-sm btn-primary', disabled: !pd.siteId, title: pd.siteId ? '' : 'Choose a site first', onclick: () => publish(pd, snap) }, 'Publish the web view')),
    h('p', { class: 'muted small' }, 'Visitors see the plan as it was when you last published or updated it. Link to it from emails and pages, or insert it into a Library doc.'),
    h('button', { class: 'btn btn-xs btn-ghost text-error', onclick: async () => { if (await uiConfirm('Delete this plan document?')) { delete doc.docs[pd.id]; saveDoc('plandocs', doc); location.hash = ''; render(); } } }, 'Delete this document'),
  ].filter(Boolean);
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
  touch(pd, { status: 'published', snapshot: snap, publishedAt: new Date().toISOString().slice(0, 10) });
  toast('Published');
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
window.addEventListener('hashchange', () => { stage.scrollTop = 0; render(); });
onDocChange('strategy', (d) => { strategy = d; render(); });
onDocChange('data', (d) => { data = d; render(); });
render();
window.plandoc = { doc, current };
