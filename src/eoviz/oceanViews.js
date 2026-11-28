/**
 * EoViz's ocean pages (alpha 0.5): Ocean data, the windows grid and the 3D
 * studio. main.js routes to them and hands over a small context:
 *
 *   ctx = { doc(), save(note), canEdit, page(current, ...children), download(name, text, type) }
 *
 * Data in reach is the org's own collections, plus what its network shares
 * (GET /api/network/shared?kind=eco), each kept with the org it came from.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/Shell.js';
import { loadD3 } from '../ui/Sunburst.js';
import { isHosted } from '../platform/storage.js';
import { COLLECTION_KINDS, oceanParam, OCEAN_PARAMS, WOCE, detectOcean, spanOf } from './ocean.js';
import { FORMS, SEASONS, DEPTH_BANDS, bandOf, setsOf, yearsOf, titleOf, formsFor, blankWindow, vary, linkSlice, ordered, moveWindow, starters, draw, varsFor } from './windows.js';
import { layersOf, mount } from './studio.js';

/* ---------------------------------------------------------------- data in reach */

let network = null; // [{ org, collections }]
let loading = null;
/** The network's shared ocean data, fetched once a page load. */
export function loadNetworkEco(onDone) {
  if (network || loading || !isHosted()) return;
  loading = fetch('/api/network/shared?kind=eco').then((r) => (r.ok ? r.json() : { orgs: [] })).then((out) => {
    network = (out.orgs ?? []).map(({ org, data }) => ({ org, collections: data?.collections ?? {} }));
    onDone?.();
  }).catch(() => { network = []; });
}

/** All collections in reach: the org's own, then the network's (each tagged with its org). */
export function inReach(doc) {
  const out = {};
  for (const c of Object.values(doc.collections ?? {})) out[c.id] = { ...c, org: null };
  for (const { org, collections } of network ?? []) for (const c of Object.values(collections)) if (!out[c.id]) out[c.id] = { ...c, org: org.name };
  return out;
}

const n = (count, word, plural = `${word}s`) => `${Number(count).toLocaleString()} ${count === 1 ? word : plural}`;
const kindLabel = (id) => COLLECTION_KINDS.find((k) => k.id === id)?.label ?? id;

/* ---------------------------------------------------------------- ocean data */

/** Bring in an ocean file: returns true when it was one (GLODAP, exchange, float or mooring). */
export function takeOceanFile(ctx, name, text) {
  const f = detectOcean(text);
  if (!f) return false;
  const doc = ctx.doc();
  let made;
  try { made = f.read(text, name); } catch (err) { toast(`That ${f.label} file couldn’t be read: ${err.message}`); return true; }
  const partnerId = Object.values(doc.partners ?? {})[0]?.id ?? null;
  for (const c of made) {
    if (!c.rows.length) continue;
    const id = `col-${(c.meta?.expocode ?? c.meta?.wmo ?? c.name).toString().toLowerCase().replace(/[^\w]+/g, '-').slice(0, 40)}`;
    doc.collections[id] = { ...c, id, partnerId };
  }
  ctx.save(`${name}: ${n(made.length, 'collection')} brought in (${f.label})`);
  location.hash = '#ocean';
  return true;
}

export function OceanData(ctx) {
  const doc = ctx.doc();
  const all = inReach(doc);
  const list = Object.values(all);
  const flagsOf = (c) => { const t = { 2: 0, 3: 0, 4: 0 }; for (const f of c.flags ?? []) for (const ch of f) if (t[ch] != null) t[ch]++; return t; };
  const row = (c) => {
    const s = spanOf({ [c.id]: c });
    const f = flagsOf(c);
    return h('tr', {},
      h('td', {}, h('strong', {}, c.name), c.meta?.mock && h('span', { class: 'eo-share' }, 'mock'), h('div', { class: 'eo-note' }, c.platform || kindLabel(c.kind))),
      h('td', {}, kindLabel(c.kind)),
      h('td', {}, c.org ?? 'Ours'),
      h('td', {}, c.cols.map((k) => oceanParam(k)?.short ?? k).join(', ')),
      h('td', {}, Number(c.rows.length).toLocaleString()),
      h('td', {}, s.from === s.to ? s.from : `${s.from} → ${s.to}`),
      h('td', { title: `${f[3]} questionable, ${f[4]} bad: kept, and left out by windows that keep good data only` }, `${f[3] + f[4]} flagged`),
      h('td', { class: 'eo-cite' }, c.cite?.text ? h('span', { title: c.cite.text }, c.cite.license || 'Cite') : '–'));
  };
  const own = list.filter((c) => !c.org); const theirs = list.filter((c) => c.org);
  return ctx.page('ocean',
    h('div', { class: 'eo-intro eo-ocean-intro' }, h('h2', {}, icon('waves', 20), 'Ocean data'),
      h('p', {}, 'Cruises, floats and moorings, in four dimensions: where, when, how deep, what. Each keeps its quality flags (WOCE: 2 good, 3 questionable, 4 bad) and its citation, which travel with it into every window and the studio.')),
    h('div', { class: 'eo-row' },
      h('a', { class: 'btn btn-sm btn-primary', href: '#windows' }, icon('tiles', 15), 'Open the windows'),
      h('a', { class: 'btn btn-sm', href: '#studio' }, icon('layers', 15), 'The 3D studio'),
      ctx.canEdit && h('button', { class: 'btn btn-sm', onclick: () => ctx.pickFile() }, icon('upload', 15), 'Bring in GLODAP, exchange, float or mooring files')),
    h('section', { class: 'eo-panel' },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, 'Ours'), h('span', { class: 'eo-note' }, n(own.length, 'collection'))),
      own.length ? table(own.map(row)) : h('p', { class: 'eo-note' }, 'None yet. Bring in a GLODAP extract, a CCHDO bottle file, float profiles or a mooring CSV.')),
    h('section', { class: 'eo-panel' },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, 'From the network'), h('span', { class: 'eo-note' }, isHosted() ? (network ? n(theirs.length, 'collection') : 'Loading…') : 'On the hosted platform')),
      h('p', { class: 'eo-note' }, 'What linked organisations share with the network (Organisation → Network). Read only here, and cited to the org that holds it.'),
      theirs.length ? table(theirs.map(row)) : h('p', { class: 'eo-note' }, network ? 'Nothing shared yet.' : '')),
    h('section', { class: 'eo-panel' }, h('h3', {}, 'Formats EoViz reads for the ocean'),
      h('dl', { class: 'eo-ref' }, [
        ['GLODAP merged product', 'CSV with G2… columns; -9999 is missing; flags 0 (calculated), 2 (good), 9 (none). Cite the version (CC BY 4.0).'],
        ['WOCE / CCHDO exchange', 'BOTTLE line, # comments, names then units, _FLAG_W columns, END_DATA.'],
        ['Profiling floats', 'Argo-style CSV: PLATFORM_NUMBER, CYCLE_NUMBER, PRES, TEMP, PSAL, DOXY with _QC (Argo 1–9, mapped to WOCE).'],
        ['Moorings', '“# mooring:”, “# lat:”, “# lon:” lines, then time, depth and the variables, with _flag columns.'],
        ['Worked out', 'σθ (EOS-80 at the surface; use TEOS-10 for papers) and AOU (Garcia and Gordon 1992), from values that pass the flags.'],
      ].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))));
}
const table = (rows) => h('div', { class: 'eo-table-wrap' }, h('table', { class: 'eo-table' },
  h('thead', {}, h('tr', {}, ['Collection', 'Kind', 'Org', 'Variables', 'Rows', 'When', 'Flags', 'Licence'].map((t) => h('th', {}, t)))),
  h('tbody', {}, rows)));

/* ---------------------------------------------------------------- the windows grid */

const chip = (label, control) => h('label', { class: 'eo-chip' }, h('span', {}, label), control);
const sel = (name, value, opts, onchange) => h('select', { class: 'eo-chip-select', name, onchange: (e) => onchange(e.target.value) },
  opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
const sliceKey = (s) => (s?.kind === 'year' ? `y:${s.year}` : s?.kind === 'season' ? `s:${s.season}` : s?.kind === 'range' ? `r:${s.from}:${s.to}` : 'all');
const sliceOf = (key) => {
  if (key.startsWith('y:')) return { kind: 'year', year: Number(key.slice(2)) };
  if (key.startsWith('s:')) return { kind: 'season', season: key.slice(2) };
  if (key.startsWith('r:')) { const [, from, to] = key.split(':'); return { kind: 'range', from: Number(from), to: Number(to) }; }
  return { kind: 'all' };
};

let windowsDraft = null; // edits by someone who can't save, kept for the visit
export function Windows(ctx) {
  const doc = ctx.doc();
  const all = inReach(doc);
  const sets = setsOf(all);
  const windows = () => windowsDraft ?? doc.windows ?? {};
  const put = (next, note) => {
    if (ctx.canEdit) { doc.windows = next; ctx.save(note); } else { windowsDraft = next; ctx.rerender(); }
  };
  const change = (w, patch) => {
    let next = { ...windows(), [w.id]: { ...w, ...patch } };
    if (patch.slice) next = linkSlice(next, w.id);
    put(next);
  };
  const list = ordered(windows());
  const grid = h('div', { class: 'eo-windows' });
  const add = (w) => put({ ...windows(), [w.id]: { ...w, order: list.length } }, 'Window added');

  loadD3().then((d3) => {
    grid.replaceChildren(...list.map((w) => WindowCard(d3, w)));
    if (!list.length) grid.append(h('p', { class: 'eo-note' }, 'No windows yet: start from the gallery below, or add one.'));
  }).catch(() => grid.replaceChildren(h('p', { class: 'eo-note' }, 'The chart library could not load.')));

  function WindowCard(d3, w) {
    const set = sets.find((s) => s.key === w.set);
    const years = set ? yearsOf(all, set.ids) : [];
    const vars = set ? varsFor(set, all) : OCEAN_PARAMS.map((p) => p.id);
    let drawn;
    try { drawn = set ? draw(d3, w, set, all) : null; } catch (err) { drawn = { svg: h('p', { class: 'eo-note' }, `Couldn’t draw: ${err.message}`), n: 0 }; }
    const legend = drawn?.legend;
    const slices = [['all', 'All years'], ...years.map((y) => [`y:${y}`, String(y)]), ...SEASONS.map((s) => [`s:${s.id}`, s.label]),
      ...(years.length > 2 ? [[`r:${years[0]}:${years[Math.floor(years.length / 2)]}`, `${years[0]}–${years[Math.floor(years.length / 2)]}`], [`r:${years[Math.floor(years.length / 2) + 1]}:${years.at(-1)}`, `${years[Math.floor(years.length / 2) + 1]}–${years.at(-1)}`]] : [])];
    const btn = (label, ic, onclick, opts = {}) => h('button', { class: `btn btn-xs ${opts.on ? 'btn-active' : 'btn-ghost'}`, title: opts.title ?? label, 'aria-pressed': opts.on != null ? String(!!opts.on) : null, onclick }, icon(ic, 13), opts.text === false ? null : label);
    return h('article', { class: `eo-window${w.size === 2 ? ' wide' : ''}${w.studio ? ' in-studio' : ''}${w.link ? ' linked' : ''}` },
      h('header', { class: 'eo-window-head' },
        h('strong', {}, titleOf(w, set)),
        h('label', { class: 'eo-studio-toggle', title: 'Show this window in the 3D studio' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs', name: `studio-${w.id}`, checked: !!w.studio, onchange: (e) => change(w, { studio: e.target.checked }) }), 'Studio')),
      h('div', { class: 'eo-chips' },
        chip('Data', sel(`set-${w.id}`, w.set, sets.map((s) => [s.key, `${s.label}${s.org ? ` · ${s.org}` : ''}`]), (v) => { const s = sets.find((x) => x.key === v); change(w, { set: v, form: formsFor(s.kind).some((f) => f.id === w.form) ? w.form : formsFor(s.kind)[0].id }); })),
        chip('Query', h('span', { class: 'eo-chip-group' },
          sel(`var-${w.id}`, w.var, vars.map((k) => [k, oceanParam(k)?.short ?? k]), (v) => change(w, { var: v })),
          w.form === 'scatter' && sel(`y-${w.id}`, w.y ?? '', vars.filter((k) => k !== w.var).map((k) => [k, `against ${oceanParam(k)?.short ?? k}`]), (v) => change(w, { y: v })),
          sel(`band-${w.id}`, bandOf(w.depth).id, DEPTH_BANDS.map((b) => [b.id, b.label]), (v) => change(w, { depth: DEPTH_BANDS.find((b) => b.id === v).range })),
          sel(`keep-${w.id}`, w.keep ?? 'good', [['good', 'Good flags'], ['all', 'All flags']], (v) => change(w, { keep: v })))),
        chip('Time', sel(`slice-${w.id}`, sliceKey(w.slice), slices, (v) => change(w, { slice: sliceOf(v) }))),
        chip('Form', sel(`form-${w.id}`, w.form, (set ? formsFor(set.kind) : FORMS).map((f) => [f.id, f.label]), (v) => change(w, { form: v })))),
      h('div', { class: 'eo-window-chart' }, drawn?.svg ?? h('p', { class: 'eo-note' }, 'This window’s data isn’t in reach any more.')),
      h('footer', { class: 'eo-window-foot' },
        h('span', { class: 'eo-note eo-legend' }, legendOf(legend), drawn ? ` · ${n(drawn.n, 'row')}` : ''),
        h('span', { class: 'eo-window-actions' },
          btn('Vary time', 'clock', () => add(vary(w, 'time', set, all)), { title: 'A copy, one year on' }),
          btn('Vary query', 'sliders', () => add(vary(w, 'query', set, all)), { title: 'A copy, the next variable' }),
          btn('Vary form', 'chart', () => add(vary(w, 'form', set, all)), { title: 'A copy, the next form' }),
          btn('Link', 'link', () => change(w, { link: !w.link }), { on: w.link, title: 'Linked windows share their time slice', text: false }),
          btn('Size', w.size === 2 ? 'arrowsIn' : 'fit', () => change(w, { size: w.size === 2 ? 1 : 2 }), { title: w.size === 2 ? 'Make it small' : 'Make it wide', text: false }),
          btn('Left', 'chevronLeft', () => put(moveWindow(windows(), w.id, -1)), { title: 'Move left', text: false }),
          btn('Right', 'chevronRight', () => put(moveWindow(windows(), w.id, 1)), { title: 'Move right', text: false }),
          btn('Remove', 'trash', () => { const next = { ...windows() }; delete next[w.id]; put(next, 'Window removed'); }, { title: 'Remove this window', text: false }))));
  }

  const gallery = starters(sets, all);
  return ctx.page('windows',
    h('div', { class: 'eo-intro eo-ocean-intro' }, h('h2', {}, icon('tiles', 20), 'Windows'),
      h('p', {}, 'Small views of the data, side by side. Each window is four chips: data, query, time and form. Vary one chip to make a sibling, link windows so a time slice moves them together, and switch on the ones you want in the 3D studio.'),
      !ctx.canEdit && h('p', { class: 'eo-note' }, 'You can arrange windows for this visit; only people who edit EoViz can keep them.')),
    h('div', { class: 'eo-row' },
      sets.length ? h('label', { class: 'eo-note' }, 'Add a window on ', sel('add-set', '', [['', 'choose data…'], ...sets.map((s) => [s.key, `${s.label}${s.org ? ` · ${s.org}` : ''}`])], (v) => { if (v) add(blankWindow(sets.find((s) => s.key === v))); })) : h('p', { class: 'eo-note' }, 'No ocean data in reach yet: bring some in on Ocean data.'),
      h('a', { class: 'btn btn-sm btn-primary', href: '#studio' }, icon('layers', 15), `The 3D studio (${list.filter((w) => w.studio).length})`)),
    grid,
    gallery.length > 0 && h('details', { class: 'eo-panel eo-gallery', open: !list.length },
      h('summary', {}, h('strong', {}, 'Starter gallery'), h('span', { class: 'eo-note' }, ` ${n(gallery.length, 'window')} to begin from`)),
      h('ul', {}, gallery.map((g) => h('li', {}, h('div', {}, h('strong', {}, g.about), h('p', { class: 'eo-note' }, titleOf(g.window, sets.find((s) => s.key === g.window.set)))),
        h('button', { class: 'btn btn-xs', onclick: () => add(g.window) }, icon('plus', 13), 'Add'))))));
}

function legendOf(legend) {
  if (!legend) return '';
  if (legend.note) return legend.note;
  if (legend.years?.length) return `colour: year ${legend.years[0]}–${legend.years.at(-1)}`;
  if (legend.names) return `${n(legend.names.length, 'line')}`;
  if (legend.var) { const p = oceanParam(legend.var); const [a, b] = legend.scale.domain(); const f = (v) => (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2)); return `${p?.short ?? legend.var} ${f(a)}–${f(b)}${p?.unit ? ` ${p.unit}` : ''}`; }
  return '';
}

/* ---------------------------------------------------------------- the 3D studio */

let studio = null;
const studioState = { stretch: 1, hidden: new Set() };
export function Studio(ctx) {
  const doc = ctx.doc();
  const all = inReach(doc);
  const sets = setsOf(all);
  const wins = ordered(windowsDraft ?? doc.windows ?? {});
  const on = wins.filter((w) => w.studio);
  const layers = layersOf(wins, all, titleOf);
  const holder = h('div', { class: 'eo-studio-canvas' }, h('p', { class: 'eo-note eo-studio-wait' }, on.length ? 'Starting the studio…' : 'Switch on a window’s Studio toggle to bring it here.'));
  studio?.dispose(); studio = null;
  const paint = () => studio?.update(layers, { stretch: studioState.stretch, visible: new Set(layers.map((l) => l.id).filter((id) => !studioState.hidden.has(id.replace(/-curtain$/, '')))) });
  if (layers.length) {
    Promise.all([loadD3(), Promise.resolve()]).then(async ([d3]) => {
      try {
        holder.replaceChildren();
        studio = await mount(holder, { d3 });
        paint();
      } catch (err) { holder.replaceChildren(h('p', { class: 'eo-note' }, `The 3D studio couldn’t start here (${err.message}). It needs WebGL.`)); }
    });
  }
  const KIND = { cloud: 'bottle cloud', curtain: 'curtain', ribbons: 'float ribbons', helix: 'mooring helix' };
  return ctx.page('studio',
    h('div', { class: 'eo-intro eo-ocean-intro' }, h('h2', {}, icon('layers', 20), '3D studio'),
      h('p', {}, 'The windows you switched on, in one space: cruises as a bottle cloud and a curtain along the line, floats as ribbons along their tracks, moorings as a helix that turns once a year. Drag to turn, scroll to come closer.')),
    h('div', { class: 'eo-studio' },
      holder,
      h('aside', { class: 'eo-panel eo-studio-side' },
        h('h3', {}, 'In the studio'),
        on.length ? h('ul', { class: 'eo-studio-list' }, on.map((w) => {
          const set = sets.find((s) => s.key === w.set);
          const kinds = layers.filter((l) => l.id === w.id || l.id === `${w.id}-curtain`).map((l) => KIND[l.kind]);
          return h('li', {}, h('label', { class: 'eo-check' },
            h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', name: `show-${w.id}`, checked: !studioState.hidden.has(w.id), onchange: (e) => { if (e.target.checked) studioState.hidden.delete(w.id); else studioState.hidden.add(w.id); paint(); } }),
            h('span', {}, h('strong', {}, titleOf(w, set)), h('span', { class: 'eo-note' }, ` ${kinds.join(' and ') || 'nothing in reach'}`))));
        })) : h('p', { class: 'eo-note' }, 'None yet. On Windows, switch on Studio for the ones you want here.'),
        h('label', { class: 'eo-note eo-stretch' }, 'Depth stretch',
          h('input', { type: 'range', class: 'range range-xs', name: 'stretch', min: 0.2, max: 3, step: 0.1, value: studioState.stretch, oninput: (e) => { studioState.stretch = Number(e.target.value); paint(); } })),
        h('div', { class: 'eo-row' },
          h('button', { class: 'btn btn-xs', onclick: () => studio?.reset() }, icon('refresh', 13), 'Reset the view'),
          h('button', { class: 'btn btn-xs', onclick: () => { const url = studio?.snapshot(); if (url) { const a = h('a', { href: url, download: 'eoviz-studio.png' }); document.body.append(a); a.click(); a.remove(); } } }, icon('download', 13), 'Save a picture')),
        h('a', { class: 'btn btn-xs btn-ghost', href: '#windows' }, icon('tiles', 13), 'Back to the windows'),
        h('p', { class: 'eo-note' }, 'Colours follow each window’s variable over what is in view. Flags: only data that passes each window’s flag choice is drawn. Mock data is labelled on Ocean data.'))));
}
/** Stop the studio when leaving its page. */
export const leaveStudio = () => { studio?.dispose(); studio = null; };
export const OCEAN_WOCE = WOCE;
