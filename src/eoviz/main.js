import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { EmptyState } from '../ui/EmptyState.js';
import { setCrumbs } from '../ui/crumbs.js';
import { uiConfirm } from '../ui/dialog.js';
import { Markdown } from '../ui/markdown.js';
import { loadD3 } from '../ui/Sunburst.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadEco } from '../platform/docs.js';
import { loadHelp } from '../platform/help.js';
import { WHEEL } from '../ui/wheel.js';
import { KINDS, PARAMS, paramById, paramLabel, judge, latest, seriesOf, stats, toDisplay, addParsed, removeFile, matchBottles, migrateEco, PARTNER_KINDS, SHARES, FLAGS } from './model.js';
import { FORMATS, FAMILIES, formatById, readFile, mockFile, toDataStream } from './formats.js';
import { datasetFromParsed, datasetFromDoc, shapeOf, suggest, VIZ, vizById, GREEN } from './viz.js';
import { EOVIZ_HELP, EOVIZ_HELP_ID } from './help.js';

/**
 * EoViz (stage 1, experimental): the eco data lens.
 *
 *   #overview[/<partner>]   each partner's own dashboard (partners are separate)
 *   #site/<id>              one site: the bench strip, each reading, what to draw
 *   #files                  bring in a file: detect, preview, match, import; export to DataStream
 *   #sea                    the vessel workflow: cast + bottles + lab carbon → a profile
 *   #finder[/<source>]      the viz finder: a mock (mock:<format>), a site (site:<id>) or the file in hand
 *   #formats                file types, their specs, and a mock of each
 *   #sketchbook[/<site>]    generative drawings, the process drawing first
 *   #about[/<page>]         the quick reference, and the same tutorials as Help
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'eoviz', org });
const app = document.querySelector('#app');
app.classList.add('frame', 'eo-app');
let side = h('nav');
const main = h('section', { class: 'palette-main eo-main' });
app.replaceChildren(side, main);

const canEdit = canWriteDoc('eco');
let doc = loadEco();
let pending = null; // the file in hand on Files: { name, size, text, format, parsed, partnerId }

function save(note) {
  doc = migrateEco(doc);
  saveDoc('eco', doc);
  if (note) toast(note);
  render();
}

const hex = (id) => WHEEL.find((w) => w.id === id)?.hex ?? GREEN;
const n = (count, word, plural = `${word}s`) => `${Number(count).toLocaleString()} ${count === 1 ? word : plural}`;
const fmt = (v) => (!Number.isFinite(v) ? '–' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const kindOf = (id) => KINDS.find((k) => k.id === id) ?? KINDS[0];
const partners = () => Object.values(doc.partners ?? {});
const partnerOf = (thing) => doc.partners?.[thing?.partnerId] ?? null;
const sitesOf = (pid) => Object.values(doc.sites).filter((s) => !pid || s.partnerId === pid);
/** A site's series as a time view: a real profile (three depths or more) keeps only its no-depth series; a sample taken at one or two depths counts as flat, one series per parameter. */
const depthsOf = (list) => new Set(list.filter((s) => s.depth != null).map((s) => s.depth)).size;
const flatOf = (list) => { const l = depthsOf(list) >= 3 ? list.filter((s) => s.depth == null) : list; const seen = new Set(); return l.filter((s) => !seen.has(s.param) && seen.add(s.param)); };
/** A time view of some series: depths dropped, so charts read them as one site's readings over time. */
const timeDataset = (list, title) => { const ds = datasetFromDoc(doc, list.map((x) => x.id), title); for (const x of ds.series) delete x.depth; return ds; };
const filesOf = (pid) => Object.values(doc.files).filter((f) => !pid || f.partnerId === pid).sort((a, b) => String(b.at).localeCompare(String(a.at)));

/** Draw a viz type into a holder once D3 is in. */
function chart(vizId, ds, opts = {}) {
  const holder = h('div', { class: 'eo-chart' }, h('p', { class: 'eo-note' }, 'Drawing…'));
  loadD3().then((d3) => {
    const v = vizById(vizId);
    try { holder.replaceChildren(v.draw(d3, ds, opts)); } catch (err) { holder.replaceChildren(h('p', { class: 'eo-note' }, `This chart couldn’t draw this data (${err.message}).`)); }
  }).catch(() => holder.replaceChildren(h('p', { class: 'eo-note' }, 'The chart library could not load.')));
  return holder;
}
function download(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------ routes */

const route = () => {
  const raw = location.hash.slice(1) || 'overview';
  const i = raw.indexOf('/');
  return i < 0 ? [raw, ''] : [raw.slice(0, i), decodeURIComponent(raw.slice(i + 1))];
};
const VIEWS = { overview: Overview, site: Site, files: Files, sea: AtSea, finder: Finder, formats: Formats, sketchbook: Sketchbook, about: About };

function render() {
  const [view, arg] = route();
  drawSide(view, arg);
  setCrumbs([]);
  main.replaceChildren((VIEWS[view] ?? Overview)(arg));
  main.scrollTop = 0;
}
addEventListener('hashchange', render);

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'gauge' },
  { id: 'files', label: 'Files', icon: 'file' },
  { id: 'sea', label: 'At sea', icon: 'waves' },
  { id: 'finder', label: 'Finder', icon: 'chart' },
  { id: 'formats', label: 'Formats', icon: 'fileText' },
  { id: 'sketchbook', label: 'Sketchbook', icon: 'brush' },
  { id: 'about', label: 'About', icon: 'help' },
];
const tabs = (current, actions = null) => PluginHeader('eoviz', { tabs: TABS, current, actions });
const page = (current, ...children) => h('div', { class: 'eo-page' }, tabs(current, current === 'files' || current === 'overview' ? bringInButton() : null), ...children);
const bringInButton = () => canEdit && h('button', { class: 'btn btn-sm btn-primary', onclick: () => fileIn.click() }, icon('upload', 15), 'Bring in a file');

const fileIn = h('input', { type: 'file', class: 'sr-only', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) takeFile(f); } });
document.body.append(fileIn);

/* ------------------------------------------------------------ side nav */

function drawSide(view, arg) {
  side = swapSide(side, SideNav({ label: 'EoViz', sections: [
    { title: 'EoViz · experimental', items: [
      { label: 'Overview', sub: `${n(Object.keys(doc.sites).length, 'site')} · ${n(Object.keys(doc.series).length, 'series', 'series')}`, icon: 'gauge', href: '#overview', on: view === 'overview' && !arg },
      { label: 'Files', sub: `${n(Object.keys(doc.files).length, 'file')} brought in`, icon: 'file', href: '#files', on: view === 'files' },
      { label: 'At sea', sub: 'Cast, bottles and carbon', icon: 'waves', href: '#sea', on: view === 'sea' },
      { label: 'Finder', sub: 'The right chart for your data', icon: 'chart', href: '#finder', on: view === 'finder' },
      { label: 'Formats', sub: `${FORMATS.length} file types, with specs`, icon: 'fileText', href: '#formats', on: view === 'formats' },
      { label: 'Sketchbook', sub: 'The process drawing and friends', icon: 'brush', href: '#sketchbook', on: view === 'sketchbook' },
      { label: 'About', sub: 'Quick reference and tutorials', icon: 'help', href: '#about', on: view === 'about' },
    ] },
    { title: 'Partners', items: partners().length ? partners().map((p) => ({
      label: p.name, sub: `${PARTNER_KINDS.find((k) => k.id === p.kind)?.label ?? ''} · ${SHARES[p.share]?.label ?? 'Own'}`,
      lead: h('span', { class: 'eo-swatch', style: `--c:${hex(p.colour)}` }),
      href: `#overview/${p.id}`, on: (view === 'overview' && arg === p.id) || (view === 'site' && doc.sites[arg]?.partnerId === p.id),
    })) : [{ label: 'No partners yet', sub: 'Files can still be brought in', icon: 'info' }] },
    { title: 'Coming next', items: [
      { label: 'Campaigns', sub: 'Stage 2: “Swim or not?” boards and posts', icon: 'flag' },
      { label: 'Open data feeds', sub: 'Stage 3: DataStream, ECCC, OpenAQ live', icon: 'cloudUp' },
      { label: 'Choosing to share', sub: 'Stage 3: a partner opens data, on its terms', icon: 'handshake' },
    ] },
  ] }));
  side.classList.add('eo-side');
}

/* ------------------------------------------------------------ overview: each partner on its own */

function Overview(pid) {
  const partner = doc.partners?.[pid] ?? null;
  if (!Object.keys(doc.sites).length) return page('overview', firstRun());
  if (!partner && partners().length) {
    return page('overview',
      h('div', { class: 'eo-intro' }, h('h2', {}, 'Partners'), h('p', {}, 'Each group keeps its own sites, files and dashboard. Open one to see its water, air and soil.')),
      h('div', { class: 'eo-partners' }, partners().map(PartnerCard)),
      unassigned());
  }
  const sites = sitesOf(partner?.id);
  const firstSite = sites.find((s) => flatOf(seriesOf(doc, s.id)).some((x) => x.points.length > 20)) ?? sites[0];
  return page('overview',
    partner && h('div', { class: 'eo-intro', style: `--c:${hex(partner.colour)}` },
      h('h2', {}, partner.name, h('span', { class: 'eo-share', title: SHARES[partner.share]?.about }, icon(partner.share === 'open' ? 'globe' : 'lock', 13), SHARES[partner.share]?.label ?? 'Own')),
      h('p', {}, partner.about)),
    h('div', { class: 'eo-sites' }, sites.map(SiteCard)),
    firstSite && h('section', { class: 'eo-panel' },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, `Bench strip · ${firstSite.name}`), h('a', { class: 'btn btn-xs', href: `#site/${firstSite.id}` }, 'Open the site')),
      chart('bench', timeDataset(flatOf(seriesOf(doc, firstSite.id)), firstSite.name), { w: 960 })));
}

function PartnerCard(p) {
  const sites = sitesOf(p.id), files = filesOf(p.id);
  const kind = PARTNER_KINDS.find((k) => k.id === p.kind);
  const exceed = sites.flatMap((s) => seriesOf(doc, s.id)).filter((s) => ['low', 'high'].includes(judge(s.param, toDisplay(latest(s)?.[1], s.unit, s.param)))).length;
  return h('a', { class: 'eo-partner', href: `#overview/${p.id}`, style: `--c:${hex(p.colour)}` },
    h('span', { class: 'eo-partner-icon' }, icon(kind?.icon ?? 'users', 22)),
    h('strong', {}, p.name),
    h('span', { class: 'eo-note' }, `${kind?.label ?? ''} · ${SHARES[p.share]?.label ?? 'Own'} data`),
    h('p', {}, p.about),
    h('span', { class: 'eo-partner-stats' }, `${n(sites.length, 'site')} · ${n(files.length, 'file')}`, exceed ? h('b', { class: 'eo-warn' }, ` · ${n(exceed, 'reading')} past a guide`) : null));
}
function unassigned() {
  const loose = Object.values(doc.sites).filter((s) => !partnerOf(s));
  return loose.length ? h('section', { class: 'eo-panel' }, h('h3', {}, 'Sites with no partner'), h('div', { class: 'eo-sites' }, loose.map(SiteCard))) : null;
}

function SiteCard(site) {
  const list = seriesOf(doc, site.id);
  const flat = flatOf(list);
  const depths = new Set(depthsOf(list) >= 3 ? list.filter((s) => s.depth != null).map((s) => s.depth) : []);
  const shown = flat.length ? flat : [];
  return h('a', { class: 'eo-site', href: `#site/${site.id}` },
    h('header', {}, h('span', { class: `eo-kind eo-kind-${site.kind}` }, icon(kindOf(site.kind).icon, 15)), h('strong', {}, site.name), site.held && h('span', { class: 'eo-held', title: 'The place is held back: not shown outside the group' }, icon('lock', 12))),
    shown.length ? h('ul', { class: 'eo-readings' }, shown.slice(0, 6).map((s) => {
      const last = latest(s), v = toDisplay(last?.[1], s.unit, s.param), j = judge(s.param, v);
      return h('li', { class: j ? `eo-${j}` : '' }, h('span', {}, paramById(s.param)?.short ?? s.param), h('b', {}, fmt(v), last?.[2] ? h('sup', { title: FLAGS[last[2]] }, last[2]) : null), h('small', {}, s.unit));
    })) : depths.size ? h('p', { class: 'eo-note' }, `A profile: ${n(depths.size, 'depth')}, ${n(new Set(list.map((s) => s.param)).size, 'parameter')}`) : h('p', { class: 'eo-note' }, 'No readings yet'),
    h('footer', { class: 'eo-note' }, list.length ? `Last reading ${when(list.map((s) => latest(s)?.[0]).filter(Boolean).sort().at(-1))}` : site.geo ? 'A place, waiting for readings' : ''));
}

function firstRun() {
  return EmptyState({ icon: 'sec-eoviz', tone: GREEN, title: 'Bring in your first data',
    text: 'EoViz reads what loggers, sondes, labs and open data portals write, and keeps each reading with its unit and flag.',
    steps: [
      { title: 'Bring in a file', text: 'A CSV, a DataStream file, a HOBO or EXO export, a CTD cast, a lab’s results…' },
      { title: 'Check what EoViz found', text: 'The format, the sites, and which columns became which parameters.' },
      { title: 'Find the right chart', text: 'The finder reads the shape of your data and ranks the charts that suit it.' },
    ],
    actions: [canEdit && h('button', { class: 'btn btn-primary', onclick: () => fileIn.click() }, icon('upload', 16), 'Bring in a file'), h('a', { class: 'btn', href: '#formats' }, 'Try a mock file')] });
}

/* ------------------------------------------------------------ a site */

function Site(id) {
  const site = doc.sites[id];
  if (!site) return page('overview', h('p', { class: 'eo-note' }, 'That site isn’t here any more.'));
  setCrumbs([{ label: site.name }]);
  const list = seriesOf(doc, site.id);
  const profile = depthsOf(list) >= 3;
  const ds = profile ? datasetFromDoc(doc, list.map((s) => s.id), site.name) : timeDataset(flatOf(list), site.name);
  const shape = shapeOf(ds), picks = suggest(shape).slice(0, 3);
  const flat = flatOf(list);
  return page('overview',
    h('div', { class: 'eo-intro' },
      h('h2', {}, h('span', { class: `eo-kind eo-kind-${site.kind}` }, icon(kindOf(site.kind).icon, 16)), site.name),
      h('p', {}, shape.about, site.note ? ` ${site.note}` : ''),
      site.geo && !site.held && h('p', { class: 'eo-note' }, `${site.geo.lat.toFixed(4)}, ${site.geo.lng.toFixed(4)}`)),
    flat.length > 0 && h('section', { class: 'eo-panel' }, h('h3', {}, 'Every parameter'),
      h('table', { class: 'eo-table' },
        h('thead', {}, h('tr', {}, ['Parameter', 'Latest', 'Min', 'Mean', 'Max', 'Readings', 'Past a guide', 'Guide'].map((t) => h('th', {}, t)))),
        h('tbody', {}, flat.map((s) => {
          const st = stats(s), g = paramById(s.param)?.guide, v = toDisplay(latest(s)?.[1], s.unit, s.param), j = judge(s.param, v);
          return h('tr', {}, h('td', {}, paramLabel(s.param)), h('td', { class: j ? `eo-${j}` : '' }, `${fmt(v)} ${s.unit}`), h('td', {}, fmt(st.min)), h('td', {}, fmt(st.mean)), h('td', {}, fmt(st.max)), h('td', {}, st.n?.toLocaleString() ?? 0), h('td', {}, st.exceed ? h('b', { class: 'eo-warn' }, st.exceed) : '0'),
            h('td', { class: 'eo-note' }, g ? `${g.min != null ? `≥ ${g.min}` : ''}${g.min != null && g.max != null ? ', ' : ''}${g.max != null ? `≤ ${g.max}` : ''} (${g.note})` : '–'));
        })))),
    picks.map((p) => h('section', { class: 'eo-panel' },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, p.viz.label), h('span', { class: 'eo-note' }, p.why)),
      chart(p.viz.id, ds, { w: 960 }))),
    h('p', {}, h('a', { class: 'btn btn-sm', href: `#finder/site:${site.id}` }, icon('chart', 15), 'Every chart for this site'), ' ', h('a', { class: 'btn btn-sm', href: `#sketchbook/${site.id}` }, icon('brush', 15), 'Sketchbook')));
}

/* ------------------------------------------------------------ files */

async function takeFile(file) {
  if (file.size > 20 * 1024 * 1024) { toast('That file is over 20 MB: split it, or bring in a month at a time.'); return; }
  if (/\.(xlsx?|nc|hex)$/i.test(file.name)) { toast(/\.xls/i.test(file.name) ? 'Save the sheet as CSV first: EoViz reads CSV for now.' : 'Binary netCDF and raw .hex come in a later stage. Try CDL (ncdump) or the converted .cnv.'); return; }
  const text = await file.text();
  holdFile(file.name, file.size, text);
}
function holdFile(name, size, text, formatId = null) {
  const { format, parsed } = readFile(text, name, formatId);
  pending = { name, size, text, format, parsed, partnerId: pending?.partnerId ?? (route()[0] === 'overview' ? route()[1] : null) ?? partners()[0]?.id ?? null };
  pending.bottles = matchBottles(doc, parsed);
  // A lab file follows its cast: file it with the partner who brought in the bottle file.
  if (pending.bottles?.matched) { const btl = filesOf().find((f) => f.format === 'btl' && f.partnerId); if (btl) pending.partnerId = btl.partnerId; }
  if (route()[0] !== 'files') location.hash = '#files'; else render();
}

function Files() {
  return page('files',
    pending ? Preview() : h('div', { class: 'eo-intro' }, h('h2', {}, 'Files'), h('p', {}, 'Bring in what your instruments, labs and portals write. EoViz finds the format, matches the columns to parameters, and keeps the original values and flags.')),
    filesOf().length ? h('section', { class: 'eo-panel' },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, 'Brought in'), h('button', { class: 'btn btn-xs', onclick: () => download('eoviz-datastream.csv', toDataStream(doc, Object.keys(doc.series)), 'text/csv'), title: 'Every water series, in DataStream’s open schema' }, icon('download', 14), 'Export to DataStream')),
      h('table', { class: 'eo-table' },
        h('thead', {}, h('tr', {}, ['File', 'Format', 'Partner', 'Readings', 'Series', 'Brought in', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, filesOf().map((f) => h('tr', {},
          h('td', {}, h('strong', {}, f.name)),
          h('td', {}, formatById(f.format)?.label ?? f.format),
          h('td', {}, partnerOf(f)?.name ?? '–'),
          h('td', {}, (f.rows ?? 0).toLocaleString()),
          h('td', {}, f.seriesIds.length),
          h('td', { class: 'eo-note' }, `${when(f.at)}${f.by ? ` · ${f.by}` : ''}`),
          h('td', {}, canEdit && h('button', { class: 'btn btn-ghost btn-xs', title: 'Remove this file and its readings', onclick: async () => {
            if (!(await uiConfirm(`Remove ${f.name} and its ${n(f.rows ?? 0, 'reading')}?`))) return;
            removeFile(doc, f.id); save('File removed');
          } }, icon('trash', 14)))))))) : !pending && firstRun());
}

function Preview() {
  const { name, format, parsed } = pending;
  const ds = datasetFromParsed(parsed, name), shape = shapeOf(ds), picks = suggest(shape).slice(0, 2);
  const sites = [...new Set((parsed.records ?? []).map((r) => r.site).filter(Boolean))];
  const params = [...new Set((parsed.records ?? []).map((r) => r.param))];
  const unknown = (parsed.records ?? []).filter((r) => !paramById(r.param)).length;
  const sample = (parsed.records ?? []).slice(0, 6);
  return h('section', { class: 'eo-panel eo-preview' },
    h('header', { class: 'eo-panel-head' }, h('h3', {}, icon('file', 16), name), h('button', { class: 'btn btn-ghost btn-xs', onclick: () => { pending = null; render(); } }, 'Put it down')),
    h('div', { class: 'eo-two' },
      h('dl', { class: 'eo-ref' },
        h('dt', {}, 'Read as'), h('dd', {}, h('select', { class: 'select select-sm', onchange: (e) => holdFile(pending.name, pending.size, pending.text, e.target.value) }, FORMATS.map((f) => h('option', { value: f.id, selected: f.id === format.id }, f.label)))),
        h('dt', {}, 'Spec'), h('dd', {}, h('a', { href: format.spec.url, target: '_blank', rel: 'noopener' }, format.spec.name)),
        h('dt', {}, 'Found'), h('dd', {}, shape.about),
        h('dt', {}, 'Sites'), h('dd', {}, sites.length ? sites.join(', ') : Object.keys(parsed.sites ?? {}).join(', ') || 'One, named after the file'),
        h('dt', {}, 'Parameters'), h('dd', {}, params.map((p) => h('span', { class: `eo-chip${paramById(p) ? '' : ' eo-chip-unknown'}` }, paramById(p)?.label ?? `${p} (unknown)`))),
        parsed.meta?.matched && h('dt', {}, 'Columns'), parsed.meta?.matched && h('dd', { class: 'eo-note' }, parsed.meta.matched.join(' · ')),
        pending.bottles && h('dt', {}, 'Bottles'), pending.bottles && h('dd', {}, pending.bottles.matched ? `${n(pending.bottles.matched, 'sample')} matched to ${pending.bottles.cast}: depth and time from the bottle file.${pending.bottles.unmatched ? ` ${pending.bottles.unmatched} found no bottle.` : ''}` : h('span', { class: 'eo-warn' }, 'No bottle file matches yet: bring in the cast’s .btl first, then this file, to place each sample by depth.')),
        parsed.meta?.skipped ? h('dt', {}, 'Left out') : null, parsed.meta?.skipped ? h('dd', {}, `${n(parsed.meta.skipped, 'row')}: check standards, blanks and excluded injections`) : null,
        parsed.error && h('dt', {}, 'Problem'), parsed.error && h('dd', { class: 'eo-warn' }, parsed.error),
        unknown ? h('dt', {}, 'Unknown') : null, unknown ? h('dd', { class: 'eo-warn' }, `${n(unknown, 'reading')} in columns EoViz doesn’t know yet: they are kept, but not on guides.`) : null),
      h('div', {},
        sample.length ? h('table', { class: 'eo-table eo-table-small' },
          h('thead', {}, h('tr', {}, ['Site', 'Parameter', 'Time', 'Value', 'Depth', 'Flag'].map((t) => h('th', {}, t)))),
          h('tbody', {}, sample.map((r) => h('tr', {}, h('td', {}, r.site ?? '–'), h('td', {}, paramById(r.param)?.short ?? r.param), h('td', {}, r.t ? r.t.replace('T', ' ').slice(0, 16) : '–'), h('td', {}, `${r.v} ${r.unit ?? ''}`), h('td', {}, r.depth ?? ''), h('td', {}, r.flag ?? ''))))) : h('p', { class: 'eo-note' }, 'No readings in this file.'),
        canEdit && h('div', { class: 'eo-import' },
          partners().length > 0 && h('label', { class: 'eo-note' }, 'For ', h('select', { class: 'select select-sm', onchange: (e) => { pending.partnerId = e.target.value || null; } },
            h('option', { value: '' }, 'No partner'), partners().map((p) => h('option', { value: p.id, selected: p.id === pending.partnerId }, p.name)))),
          h('button', { class: 'btn btn-primary btn-sm', disabled: !(parsed.records?.length || Object.keys(parsed.sites ?? {}).length), onclick: () => importPending() }, icon('check', 15), 'Bring it in'),
          h('a', { class: 'btn btn-sm', href: '#finder/file' }, icon('chart', 15), 'All charts for it')))),
    picks.length > 0 && h('div', { class: 'eo-picks' }, picks.map((p) => h('figure', {}, chart(p.viz.id, ds, { w: 640 }), h('figcaption', {}, h('strong', {}, p.viz.label), ' · ', p.why)))));
}

function importPending() {
  const { name, size, format, parsed, partnerId } = pending;
  if (!parsed.records?.length && parsed.sites) {
    for (const [siteName, info] of Object.entries(parsed.sites)) {
      const has = Object.values(doc.sites).find((s) => s.name.toLowerCase() === siteName.toLowerCase());
      if (has) { if (!has.geo) has.geo = info.geo; continue; }
      const id = `s-${siteName.toLowerCase().replace(/[^\w]+/g, '-')}-${Math.random().toString(36).slice(2, 5)}`;
      doc.sites[id] = { id, name: siteName, kind: info.kind ?? 'water', geo: info.geo ?? null, note: '', tags: [], ...(partnerId && { partnerId }) };
    }
  } else addParsed(doc, parsed, { name, size, format: format.id, partnerId, by: org.me?.name ?? null });
  pending = null;
  save(`${name} brought in`);
}

/* ------------------------------------------------------------ at sea: the vessel chemist's day */

function AtSea() {
  const byFormat = (id) => filesOf().filter((f) => f.format === id)[0] ?? null;
  const cast = byFormat('cnv'), btl = byFormat('btl'), lab = byFormat('toc');
  const labSeries = (lab?.seriesIds ?? []).map((id) => doc.series[id]).filter(Boolean);
  const matched = labSeries.some((s) => s.depth != null);
  const step = (nth, title, file, text, fmtId) => h('li', { class: `eo-step${file ? ' done' : ''}` },
    h('span', { class: 'eo-step-n' }, file ? icon('check', 14) : nth),
    h('div', {}, h('strong', {}, title), h('p', { class: 'eo-note' }, text),
      file ? h('p', { class: 'eo-file' }, icon('file', 13), file.name, h('span', { class: 'eo-note' }, ` · ${when(file.at)}${file.by ? ` · ${file.by}` : ''}`))
        : h('div', { class: 'eo-row' }, h('a', { class: 'btn btn-xs', href: formatById(fmtId).spec.url, target: '_blank', rel: 'noopener' }, 'The spec'), canEdit && h('button', { class: 'btn btn-xs', onclick: () => { const m = mockFile(fmtId); holdFile(m.name, m.text.length, m.text, fmtId); } }, 'Try the mock'))));
  const ids = [
    ...(cast?.seriesIds ?? []).filter((id) => ['temp', 'do'].includes(doc.series[id]?.param)),
    ...labSeries.filter((s) => s.depth != null).map((s) => s.id),
  ];
  const ds = datasetFromDoc(doc, ids, 'The cast and its carbon');
  const bottles = btl?.meta?.bottles ?? [];
  const lv = (b, param) => labSeries.find((s) => s.param === param && s.depth === b.depth)?.points[0];
  return page('sea',
    h('div', { class: 'eo-intro' }, h('h2', {}, 'At sea: casts, bottles and carbon'),
      h('p', {}, 'The vessel chemist’s day in three files. The CTD cast gives the water column; the bottle file says where each bottle closed; the carbon analyser gives DOC and DIC for each sample. EoViz joins them by cast and bottle, so every carbon reading sits at its depth and the time it was taken.')),
    h('ol', { class: 'eo-steps' },
      step(1, 'The cast', cast, 'Sea-Bird .cnv: temperature, salinity, oxygen and fluorescence on the way down.', 'cnv'),
      step(2, 'The bottles', btl, 'Sea-Bird .btl: each rosette bottle’s number, depth and closing time on the way up.', 'btl'),
      step(3, 'The lab’s carbon', lab, 'TOC analyser export: NPOC (DOC) and IC (DIC) per sample, with check standards and blanks.', 'toc')),
    lab && !matched && h('p', { class: 'eo-warn' }, 'The lab file came in before its bottle file, so its samples have no depth. Remove it and bring it in again after the .btl.'),
    ids.length > 0 && h('section', { class: 'eo-panel' },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, 'The profile'), h('span', { class: 'eo-note' }, 'Lines: the CTD cast. Dots: bottle samples (hollow where the lab questioned a result).')),
      chart('profile', ds, { w: 960, h: 420 })),
    bottles.length > 0 && h('section', { class: 'eo-panel' }, h('h3', {}, `Bottles · ${btl.meta.station}, cast ${btl.meta.cast}`),
      h('table', { class: 'eo-table eo-table-small' },
        h('thead', {}, h('tr', {}, ['Bottle', 'Depth', 'Closed', 'DOC µmol/L', 'DIC µmol/L', 'Note'].map((t) => h('th', {}, t)))),
        h('tbody', {}, bottles.map((b) => { const d = lv(b, 'doc'), c = lv(b, 'dic'); return h('tr', {}, h('td', {}, b.bottle), h('td', {}, `${b.depth} m`), h('td', {}, b.t.slice(11, 16)), h('td', {}, d ? fmt(d[1]) : '–'), h('td', {}, c ? fmt(c[1]) : '–'), h('td', { class: 'eo-note' }, [d?.[2] && `DOC ${FLAGS[d[2]].toLowerCase()} (high CV)`, lab && !c && 'IC injection excluded'].filter(Boolean).join(' · '))); })))));
}

/* ------------------------------------------------------------ the finder */

let mockCache = null;
const mocks = () => (mockCache ??= FORMATS.map((f) => { const m = mockFile(f.id); const { parsed } = readFile(m.text, m.name, f.id); const ds = datasetFromParsed(parsed, m.name); return { format: f, ds, shape: shapeOf(ds) }; }));

function Finder(arg) {
  let ds, title, source = arg || 'mock:exo';
  if (source === 'file' && pending) { ds = datasetFromParsed(pending.parsed, pending.name); title = pending.name; }
  else if (source.startsWith('site:') && doc.sites[source.slice(5)]) { const s = doc.sites[source.slice(5)], list = seriesOf(doc, s.id); ds = depthsOf(list) >= 3 ? datasetFromDoc(doc, list.map((x) => x.id), s.name) : timeDataset(flatOf(list), s.name); title = s.name; }
  else { const m = mocks().find((x) => x.format.id === source.slice(5)) ?? mocks()[0]; ds = m.ds; title = `Mock ${m.format.label}`; source = `mock:${m.format.id}`; }
  const shape = shapeOf(ds), ranked = suggest(shape);
  return page('finder',
    h('div', { class: 'eo-intro' }, h('h2', {}, 'Viz finder'),
      h('p', {}, 'Pick some data. EoViz reads its shape (how many sites and parameters, how often, for how long, by depth or by wavelength) and ranks the charts that suit it, each drawn live.')),
    h('div', { class: 'eo-row eo-source' }, h('label', { class: 'eo-note' }, 'Data ',
      h('select', { class: 'select select-sm', onchange: (e) => { location.hash = `#finder/${e.target.value}`; } },
        pending && h('option', { value: 'file', selected: source === 'file' }, `The file in hand: ${pending.name}`),
        Object.values(doc.sites).length > 0 && h('optgroup', { label: 'Your sites' }, Object.values(doc.sites).filter((s) => seriesOf(doc, s.id).length).map((s) => h('option', { value: `site:${s.id}`, selected: source === `site:${s.id}` }, s.name))),
        h('optgroup', { label: 'Mock files' }, FORMATS.map((f) => h('option', { value: `mock:${f.id}`, selected: source === `mock:${f.id}` }, f.label)))))),
    h('section', { class: 'eo-panel eo-shape' }, h('span', { class: 'eo-shape-kind' }, shape.kind), h('div', {}, h('strong', {}, title), h('p', { class: 'eo-note' }, shape.about))),
    ranked.length ? h('div', { class: 'eo-ranked' }, ranked.slice(0, 6).map((p, i) => h('section', { class: `eo-panel${i === 0 ? ' eo-best' : ''}` },
      h('header', { class: 'eo-panel-head' }, h('h3', {}, p.viz.label, h('span', { class: `eo-fam eo-fam-${p.viz.family.toLowerCase()}` }, p.viz.family)), h('span', { class: 'eo-score', title: 'How well it fits, out of 10' }, `${p.score}/10`)),
      h('p', { class: 'eo-note' }, p.why),
      chart(p.viz.id, ds, { w: 640 })))) : h('p', { class: 'eo-note' }, 'Nothing to draw yet: this data has places but no readings.'),
    Matrix(source));
}

/** Every mock file against every viz type: a dot where it fits, bigger for a better fit. Click one to see it. */
function Matrix(source) {
  const holder = h('div', { class: 'eo-chart eo-matrix' });
  loadD3().then((d3) => {
    const rows = mocks(), cols = VIZ, cw = 46, rh = 24, left = 230, top = 120;
    const w = left + cols.length * cw + 80, hgt = top + rows.length * rh + 10;
    const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${hgt}`).attr('class', 'eo-svg').attr('role', 'img').attr('aria-label', 'File types against viz types');
    cols.forEach((v, j) => svg.append('text').attr('class', `eo-row-label${v.family === 'Sketchbook' ? ' eo-sketch' : ''}`).attr('transform', `translate(${left + j * cw + cw / 2},${top - 8}) rotate(-50)`).text(v.label));
    rows.forEach((r, i) => {
      const y = top + i * rh + rh / 2, on = source === `mock:${r.format.id}`;
      svg.append('rect').attr('x', 0).attr('y', y - rh / 2).attr('width', w).attr('height', rh).attr('fill', on ? '#eaf4ee' : i % 2 ? '#faf9f6' : 'transparent');
      svg.append('text').attr('class', 'eo-row-label').attr('x', 8).attr('y', y + 4).text(r.format.label.slice(0, 34));
      cols.forEach((v, j) => {
        const [score] = v.fit(r.shape);
        if (!score || !r.shape.points) return;
        svg.append('a').attr('href', `#finder/mock:${r.format.id}`).append('circle').attr('cx', left + j * cw + cw / 2).attr('cy', y).attr('r', 2 + score * 0.85)
          .attr('fill', v.family === 'Sketchbook' ? '#7b2fe8' : GREEN).attr('fill-opacity', 0.25 + score / 14).append('title').text(`${r.format.label} → ${v.label}: ${score}/10`);
      });
    });
    holder.replaceChildren(svg.node());
  });
  return h('section', { class: 'eo-panel' },
    h('header', { class: 'eo-panel-head' }, h('h3', {}, 'File types × viz types'), h('span', { class: 'eo-note' }, 'Each mock file’s shape, scored against every viz type. Green: charts. Violet: sketches. Click a row’s dot to try it.')),
    holder);
}

/* ------------------------------------------------------------ formats */

function Formats() {
  return page('formats',
    h('div', { class: 'eo-intro' }, h('h2', {}, 'File types'),
      h('p', {}, 'The files working scientists and monitoring groups write, each read to its spec. Every one has a mock: the real layout, with made-up numbers, for trying the finder and the sketchbook.')),
    h('div', { class: 'eo-formats' }, FAMILIES.flatMap((fam) => FORMATS.filter((f) => f.family === fam)).map((f) => h('article', { class: 'eo-format' },
        h('span', { class: 'eo-format-fam' }, f.family),
        h('header', {}, h('strong', {}, f.label), h('code', {}, f.ext.join(' '))),
        h('p', {}, f.about),
        h('p', { class: 'eo-note' }, 'Spec: ', h('a', { href: f.spec.url, target: '_blank', rel: 'noopener' }, f.spec.name)),
        h('div', { class: 'eo-row' },
          h('a', { class: 'btn btn-xs btn-primary', href: `#finder/mock:${f.id}` }, icon('chart', 13), 'Try in the finder'),
          h('button', { class: 'btn btn-xs', onclick: () => { const m = mockFile(f.id); download(m.name, m.text); } }, icon('download', 13), 'The mock file'),
          canEdit && h('button', { class: 'btn btn-xs', onclick: () => { const m = mockFile(f.id); holdFile(m.name, m.text.length, m.text, f.id); } }, icon('upload', 13), 'Bring it in'))))));
}

/* ------------------------------------------------------------ sketchbook */

function Sketchbook(arg) {
  const withData = Object.values(doc.sites).filter((s) => flatOf(seriesOf(doc, s.id)).some((x) => x.points.length > 40));
  const site = doc.sites[arg] ?? withData.find((s) => seriesOf(doc, s.id).length >= 3) ?? withData[0];
  const ds = site ? timeDataset(flatOf(seriesOf(doc, site.id)), site.name) : mocks().find((m) => m.format.id === 'exo').ds;
  const sketches = VIZ.filter((v) => v.family === 'Sketchbook').sort((a, b) => (a.id === 'process' ? -1 : b.id === 'process' ? 1 : 0));
  return page('sketchbook',
    h('div', { class: 'eo-intro' }, h('h2', {}, 'Sketchbook'),
      h('p', {}, 'The same readings as drawings, after Ben Fry, Casey Reas and yugop: for a campaign, a wall, a council meeting. Each says what it shows; the charts are a click away.')),
    h('div', { class: 'eo-row eo-source' }, h('label', { class: 'eo-note' }, 'Draw ',
      h('select', { class: 'select select-sm', onchange: (e) => { location.hash = `#sketchbook/${e.target.value}`; } },
        withData.length ? withData.map((s) => h('option', { value: s.id, selected: s.id === site?.id }, s.name)) : h('option', {}, 'The mock sonde file')))),
    sketches.map((v, i) => {
      const [score] = v.fit(shapeOf(ds));
      return h('section', { class: `eo-panel eo-sketch-panel${i === 0 ? ' eo-best' : ''}` },
        h('header', { class: 'eo-panel-head' }, h('h3', {}, v.label), i === 0 && canEdit && h('button', { class: 'btn btn-xs', onclick: (e) => { const holder = e.target.closest('section').querySelector('.eo-chart'); holder.replaceWith(chart(v.id, ds, { w: 960, h: 480, seed: Math.floor(Math.random() * 1e6) })); } }, icon('refresh', 13), 'Walk again')),
        h('p', { class: 'eo-note' }, v.about),
        score ? chart(v.id, ds, { w: 960, h: i === 0 ? 480 : 340 }) : h('p', { class: 'eo-note' }, 'This data doesn’t suit this sketch: try another site.'));
    }));
}

/* ------------------------------------------------------------ about */

let helpDoc = null;
loadHelp().then(({ doc: hd }) => { helpDoc = hd.sections.find((s) => s.id === EOVIZ_HELP_ID) ?? EOVIZ_HELP; if (route()[0] === 'about') render(); }).catch(() => { helpDoc = EOVIZ_HELP; });
const helpHref = (pageId) => `help.html#${EOVIZ_HELP_ID}/${pageId}`;

function About(arg) {
  const section = helpDoc ?? EOVIZ_HELP;
  const pg = section.pages.find((p) => p.id === arg) ?? null;
  setCrumbs(pg ? [{ label: pg.title }] : []);
  const ref = (title, rows) => h('section', { class: 'eo-panel' }, h('h3', {}, title), h('dl', { class: 'eo-ref' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  return page('about',
    pg ? h('article', { class: 'eo-panel eo-help' }, h('header', { class: 'eo-panel-head' }, h('h3', {}, pg.title), h('a', { class: 'btn btn-xs btn-outline', href: helpHref(pg.id) }, 'Open in Help')), Markdown(pg.body), h('a', { href: '#about' }, '← Quick reference'))
      : h('div', { class: 'eo-two' },
        h('div', { class: 'eo-stack' },
          ref('Parameters and guide values', PARAMS.filter((p) => p.guide).map((p) => [`${p.label} (${p.unit})`, `${p.guide.min != null ? `≥ ${p.guide.min} ` : ''}${p.guide.max != null ? `≤ ${p.guide.max} ` : ''}· ${p.guide.note}`])),
          ref('Flags', Object.entries(FLAGS).map(([k, v]) => [k, v]))),
        h('div', { class: 'eo-stack' },
          h('section', { class: 'eo-panel' }, h('h3', {}, 'Tutorials'), h('p', { class: 'eo-note' }, 'The same pages are in Help, under EoViz.'),
            h('ul', { class: 'eo-tutorials' }, section.pages.map((p) => h('li', {}, h('a', { href: `#about/${p.id}` }, icon('book', 15), p.title))))),
          h('section', { class: 'eo-panel' }, h('h3', {}, 'Care with data'), h('p', { class: 'eo-note' }, 'Each partner’s data is its own. Mock files are made up: for trying charts, never for decisions. Guide values are guides: check the one for your water body, its use and your province.')),
          h('section', { class: 'eo-panel' }, h('h3', {}, 'Built with'), h('p', { class: 'eo-note' }, 'D3 (ISC licence). Specs from Sea-Bird, OGC, Unidata (CF and netCDF), IUPAC (JCAMP-DX), DataStream, the US Water Quality Portal, OpenAQ and PurpleAir.')))));
}

render();
