import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
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
const main = h('section', { class: 'plandoc-main' });
const panel = h('aside', { class: 'plandoc-panel' });
app.replaceChildren(side, main, panel);

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
  side = swapSide(side, SideNav({ label: 'Planning Studio', sections: [
    { title: 'Planning Studio', items: [
      { label: 'Framework and plans', sub: 'Mission, vision, values', icon: 'strategy', href: linkTo('studio', '#framework') },
      { label: 'Plan designer', sub: 'Designed plans to print or publish', icon: 'brush', href: 'plandoc.html', on: true },
      { label: 'Strategy & Work', sub: 'The plans as work', icon: 'mapTrifold', href: 'strategy.html' },
    ] },
    { title: 'Plan documents', items: Object.values(doc.docs).map((d) => ({
      label: strategy.nodes[d.planId]?.title ?? 'A removed plan', sub: d.status === 'published' ? 'Published' : 'Draft', icon: 'doc', href: `#${d.id}`, on: d.id === pd?.id,
    })) },
    { title: 'Make one for a plan', items: plans().map((p) => ({ label: p.title, sub: [p.start, p.end].filter(Boolean).map(short).join(' – '), icon: 'plus', onclick: () => create(p.id) })) },
  ] }));
}

function render() {
  const pd = current();
  drawSide(pd);
  if (!pd) {
    main.replaceChildren(PluginHeader('strategy', { title: 'Plan designer', blurb: 'Turn your strategy into a designed plan document to share, print or publish.' }),
      h('div', { class: 'card empty-card' }, plans().length
        ? [h('p', {}, 'Pick a plan on the left to make its document.'), h('button', { class: 'btn btn-primary btn-sm', onclick: () => create(plans()[0].id) }, `Make one for “${plans()[0].title}”`)]
        : h('p', {}, 'Add a strategic plan in Strategy & Work first: its mission, vision, objectives and goals fill the document.')));
    panel.replaceChildren();
    return;
  }
  const snap = planSnapshot(strategy, data, pd.planId, org);
  if (!snap) {
    main.replaceChildren(h('div', { class: 'card empty-card' }, h('p', {}, 'The plan this document was made from is gone from Strategy & Work.'),
      h('button', { class: 'btn btn-sm', onclick: () => { delete doc.docs[pd.id]; saveDoc('plandocs', doc); location.hash = ''; render(); } }, 'Delete this document')));
    panel.replaceChildren();
    return;
  }
  const scroll = main.scrollTop;
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
  main.replaceChildren(
    h('div', { class: 'plandoc-bar' },
      h('div', {},
        h('h1', {}, snap.plan.title),
        h('p', { class: 'muted' }, 'Click any words on the pages to change them; select words to format them. Your changes stay with this document; the strategy itself isn’t touched.')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', title: 'Print it, or choose “Save as PDF” in the print window', onclick: () => printPlan(docEl.cloneNode(true), snap.plan.title) }, icon('download', 15), 'Print or save as PDF')),
    h('div', { class: 'plandoc-canvas' }, docEl));
  fitPages();
  main.scrollTop = scroll;
  drawPanel(pd, snap);
}

function drawPanel(pd, snap) {
  const sites = Object.values(org.sites ?? {});
  const site = org.sites?.[pd.siteId];
  const changedWords = Object.keys(pd.text ?? {}).length;
  const stale = pd.status === 'published' && pd.snapshot && JSON.stringify({ ...pd.snapshot, takenAt: 0 }) !== JSON.stringify({ ...snap, takenAt: 0 });
  panel.replaceChildren(...[
    h('h2', {}, 'Design'),
    h('div', { class: 'pd-templates' }, TEMPLATES.map((t) => h('button', {
      type: 'button', class: `pd-template${t.id === pd.template ? ' on' : ''}`, 'aria-pressed': String(t.id === pd.template), onclick: () => touch(pd, { template: t.id }),
    }, h('span', { class: `pd-template-thumb pd-thumb-${t.id}`, 'aria-hidden': 'true' }), h('b', {}, t.label), h('small', {}, t.blurb)))),
    h('h3', { class: 'pd-h3' }, 'Cover'),
    h('div', { class: 'pd-chips' }, COVERS.map((c) => h('button', { type: 'button', class: `pd-chip${(pd.cover ?? 'template') === c.id ? ' on' : ''}`, onclick: () => touch(pd, { cover: c.id }) }, c.label))),
    h('h3', { class: 'pd-h3' }, 'Colours'),
    ColourPicker(pd),
    h('h3', { class: 'pd-h3' }, 'Type'),
    h('div', { class: 'pd-type-row' },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Headings'),
        h('select', { class: 'select select-sm w-full', onchange: (e) => touch(pd, { fonts: { ...pd.fonts, head: e.target.value || undefined } }) },
          h('option', { value: '' }, 'As the template'), FONTS.map((f) => h('option', { value: f.id, selected: pd.fonts?.head === f.id, style: `font-family:${f.stack}` }, f.label)))),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Body text'),
        h('select', { class: 'select select-sm w-full', onchange: (e) => touch(pd, { fonts: { ...pd.fonts, body: e.target.value || undefined } }) },
          h('option', { value: '' }, 'As the template'), FONTS.map((f) => h('option', { value: f.id, selected: pd.fonts?.body === f.id, style: `font-family:${f.stack}` }, f.label))))),
    h('div', { class: 'pd-chips' }, h('span', { class: 'muted small' }, 'Size'), SCALES.map((x) => h('button', { type: 'button', class: `pd-chip${(pd.scale ?? 'm') === x.id ? ' on' : ''}`, onclick: () => touch(pd, { scale: x.id }) }, x.label))),
    h('h3', { class: 'pd-h3' }, 'Page background'),
    BackgroundPicker(pd),
    h('fieldset', { class: 'fieldset' }, h('legend', { class: 'fieldset-legend' }, 'Sections'),
      SECTIONS.map((s) => h('label', { class: 'pd-check' },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !pd.hidden?.[s.id], onchange: (e) => { const hidden = { ...pd.hidden }; if (e.target.checked) delete hidden[s.id]; else hidden[s.id] = true; touch(pd, { hidden }); } }),
        s.label))),
    changedWords > 0 && h('div', { class: 'pd-note' }, `${changedWords} piece${changedWords === 1 ? '' : 's'} of text changed from the strategy.`,
      h('button', { class: 'btn btn-xs btn-ghost', onclick: async () => { if (await uiConfirm('Go back to the words in the strategy? What you typed here is dropped.')) touch(pd, { text: {} }); } }, 'Reset the words')),
    h('h2', {}, 'Share'),
    h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Web view on'),
      h('select', { class: 'select select-sm w-full', onchange: (e) => touch(pd, { siteId: e.target.value || null }) },
        h('option', { value: '' }, 'Choose a site'), options(sites.map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), pd.siteId))),
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
    h('button', { class: 'btn btn-xs btn-ghost text-error', onclick: async () => { if (await uiConfirm('Delete this plan document?')) { delete doc.docs[pd.id]; saveDoc('plandocs', doc); location.hash = ''; render(); } } }, 'Delete this document')].filter(Boolean));
}

/** Palettes as swatches: the org's own, the app themes, and colour sets made for print; then custom colours. */
function ColourPicker(pd) {
  const now = pd.palette ?? '';
  const sw = (id, label, dots) => h('button', { type: 'button', class: `pd-sw${now === id ? ' on' : ''}`, title: label, onclick: () => touch(pd, { palette: id, colours: null, paper: null }) },
    h('span', { class: 'pd-sw-dots' }, dots.map((c) => h('i', { style: `background:${c}` }))), h('span', {}, label));
  const look = docColours(pd, pd.palette || org.theme?.palette);
  const custom = (i) => h('label', {}, ['Main', 'Second', 'Third'][i],
    h('input', { type: 'color', value: look.c[i], onchange: (e) => { const colours = [...(pd.colours ?? [null, null, null])]; colours[i] = e.target.value; touch(pd, { colours }); } }));
  return h('div', { class: 'pd-colours' },
    h('div', { class: 'pd-swatch-grid' },
      sw('', 'Our colours', paletteColours(org.theme?.palette)),
      DOC_PALETTES.map((p) => sw(`doc:${p.id}`, p.label, p.c)),
      PALETTES.filter((p) => !/dark/i.test(p.label)).map((p) => sw(p.id, p.label, paletteColours(p.id)))),
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
  const docEl = main.querySelector('.pd-doc');
  if (!docEl) return;
  const room = main.clientWidth - 48;
  docEl.style.zoom = String(Math.min(1, room / 816));
}
window.addEventListener('resize', fitPages);
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });
onDocChange('strategy', (d) => { strategy = d; render(); });
onDocChange('data', (d) => { data = d; render(); });
render();
window.plandoc = { doc, current };
