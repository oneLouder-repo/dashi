import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { uiConfirm } from '../ui/dialog.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadAssets, loadMaps, loadLibrary, loadPodcasts, loadStrategy, loadStudio, loadRhizome } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { ABCD } from '../platform/assetHub.js';
import { enabledPlugins } from '../plugins.js';
import { buildFacts, factCounts, relationsOf, searchEntities, FACT_SOURCES, ENTITY_TYPES, typeLabel } from './facts.js';
import { measureFacts, SIGNALS, BANDS } from './measures.js';
import { SETUP_STEPS, STAGE_NOW, THEMES, SECTORS, themeById, nextStep, setupDone, runStep, resetSetup, profileFromOrg, cleanProfile, sinceBaseline, snapshot } from './setup.js';

/**
 * Rhizome (Rhizome stage 1, experimental): a systems analysis toolbox.
 * Stage 1 is its foundation: the fact layer, the measures, and the
 * switch-on set-up run. The rules engine, the patcher (a modular synth
 * rack), the AI visualiser and the Claude engine build on it.
 *
 *   #home      the set-up checklist until it's done, then the signals worth a look
 *   #facts     the fact layer: what came in from each plugin, every entity and its ties
 *   #measures  the network measures, calibrated to this org, and the ABCD balance
 *   #setup     the context profile and the set-up steps, to run again
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'rhizome', org });
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');
app.classList.add('frame', 'rz-app');
let side = h('nav');
const main = h('section', { class: 'palette-main rz-main' });
app.replaceChildren(side, main);

const canSet = canWriteDoc('rhizome');
let doc = loadRhizome();
function loadDocs() {
  const maps = plugins.has('mapper') ? loadMaps() : null;
  return {
    org, maps, mapContents: maps ? loadAllMaps(maps) : {},
    assets: plugins.has('assets') ? loadAssets() : null,
    library: plugins.has('library') ? loadLibrary() : null,
    podcasts: plugins.has('podcasts') ? loadPodcasts() : null,
    strategy: plugins.has('strategy') ? loadStrategy() : null,
    studio: plugins.has('studio') ? loadStudio() : null,
  };
}
const docs = loadDocs();
const today = new Date().toISOString().slice(0, 10);
let facts = null;
let m = null;
function rebuild() {
  facts = buildFacts(docs, { plugins });
  m = measureFacts(facts, { today });
}
rebuild();
function save(note) {
  saveDoc('rhizome', doc);
  if (note) toast(note);
}
// Opening the page with the plugin on is the first step done.
if (!doc.setup?.switchOn && canSet) { runStep(doc, 'switchOn', { docs, plugins }); save(); }
// Once set up, keep a daily snapshot so the home page can show change since the baseline.
if (setupDone(doc) && canSet && !(doc.snapshots ?? []).some((s) => s.at.slice(0, 10) === today)) { snapshot(doc, facts, m); save(); }

const n = (count, word, plural = `${word}s`) => `${count.toLocaleString()} ${count === 1 ? word : plural}`;
const route = () => {
  const raw = location.hash.slice(1) || 'home';
  const i = raw.indexOf('/');
  return i < 0 ? [raw, ''] : [raw.slice(0, i), decodeURIComponent(raw.slice(i + 1))];
};
const sourceOf = (id) => FACT_SOURCES.find((s) => s.id === id);
const mapName = (mapId) => facts.entities[`map:${mapId}`]?.name ?? '';
/** A short line under an entity's name: what it is, and where. */
function subOf(e) {
  const bits = [typeLabel(e.type)];
  if (e.type === 'actor') bits.push(mapName(e.attrs.mapId), e.attrs.zoneLabel);
  else if (e.type === 'group') bits.push(mapName(e.attrs.mapId));
  else if (e.type === 'soar') bits[0] = `SOAR · ${e.attrs.quadrantLabel}`;
  else if (e.type === 'outcome') bits.push(e.attrs.lane);
  else if (e.attrs.kindLabel) bits.push(e.attrs.kindLabel);
  return bits.filter(Boolean).join(' · ');
}

function render() {
  const [view, arg] = route();
  drawSide(view);
  const scroll = main.scrollTop;
  let page;
  if (view === 'facts') page = Facts(arg);
  else if (view === 'measures') page = Measures();
  else if (view === 'setup') page = Setup();
  else page = Home();
  main.replaceChildren(page);
  main.scrollTop = view === 'facts' ? scroll : 0;
}

function drawSide(view) {
  const fc = factCounts(facts);
  side = swapSide(side, SideNav({ label: 'Rhizome', sections: [
    { title: 'Rhizome · experimental', items: [
      { label: 'Home', sub: setupDone(doc) ? 'Signals worth a look' : 'Finish setting up', icon: 'home', href: '#home', on: view === 'home' },
      { label: 'Facts', sub: `${n(fc.entities, 'thing')} · ${n(fc.relations, 'tie')}`, icon: 'sec-rhizome', href: '#facts', on: view === 'facts' },
      { label: 'Measures', sub: 'Calibrated to this organisation', icon: 'chart', href: '#measures', on: view === 'measures' },
      { label: 'Set-up', sub: setupDone(doc) ? 'Context profile, run again' : `Next: ${nextStep(doc)?.label}`, icon: 'settings', href: '#setup', on: view === 'setup' },
    ] },
    { title: 'Coming next', items: [
      { label: 'Rules and tips', sub: 'Stage 2: canned analyses, tip library', icon: 'spark' },
      { label: 'The rack', sub: 'Stage 3: modules, cables, Patchbay', icon: 'connect' },
      { label: 'Visualiser and Claude', sub: 'Stages 4 and 5: the engines', icon: 'eye' },
    ] },
  ] }));
}

const tabs = (current) => PluginHeader('rhizome', {
  tabs: [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'facts', label: 'Facts', icon: 'sec-rhizome' },
    { id: 'measures', label: 'Measures', icon: 'chart' },
    { id: 'setup', label: 'Set-up', icon: 'settings' },
  ],
  current,
});

/* ------------------------------------------------------------------ home */

function Home() {
  setCrumbs([]);
  if (!setupDone(doc)) {
    return h('div', { class: 'rz-page' }, tabs('home'),
      h('div', { class: 'rz-intro' },
        h('h2', {}, 'Let’s get Rhizome ready for ', org.name),
        h('p', {}, 'Rhizome reads your maps, strategy, studio and assets as one set of facts, and measures the links between them. A short set-up tunes it to your context. Each step can be run again later.')),
      Checklist(), Preview());
  }
  const delta = sinceBaseline(doc, m);
  const fc = factCounts(facts);
  return h('div', { class: 'rz-page' }, tabs('home'),
    h('div', { class: 'rz-stats' },
      Stat(fc.entities, 'things', delta.entities), Stat(fc.relations, 'ties'), Stat(m.counts.actors, 'actors on maps'), Stat(m.counts.links, 'map links', delta.links),
      Stat(m.counts.assets, 'assets', delta.assets)),
    h('p', { class: 'rz-note' }, `Baseline ${String(doc.baseline?.at ?? '').slice(0, 10)}. `, doc.profile ? `Tuned for ${SECTORS.find((s) => s.id === doc.profile.sector)?.label.toLowerCase()}: ${doc.profile.themes.map((t) => themeById[t]?.label).filter(Boolean).join(', ')}.` : ''),
    // Signals with something in them first, the quiet ones after.
    h('div', { class: 'rz-grid' }, SIGNALS.filter((s) => plugins.has(s.source)).sort((a, b) => !(m.lists[a.id] ?? []).length - !(m.lists[b.id] ?? []).length).map((s) => Signal(s, delta[s.id]))),
    Coming());
}

const Stat = (v, label, delta = 0) => h('div', { class: 'rz-stat' }, h('strong', {}, v.toLocaleString()), h('span', {}, label),
  delta ? h('em', { class: delta > 0 ? 'up' : 'down' }, `${delta > 0 ? '+' : ''}${delta} since baseline`) : null);

/** One signal: a count, why it matters, and the first few things in it. */
function Signal(s, delta) {
  const items = m.lists[s.id] ?? [];
  const src = sourceOf(s.source);
  const rows = items.slice(0, 5).map((x) => {
    if (typeof x === 'string') return Row(x);
    if (s.id === 'oneWay') return h('li', { class: 'rz-row' }, Name(x.from), h('span', { class: 'rz-arrow' }, '→'), Name(x.to), h('small', {}, x.rel.replace('-', ' ')));
    if (s.id === 'zoneGaps') return h('li', { class: 'rz-row' }, h('span', { class: 'rz-name' }, x.kind === 'empty' ? `Nobody in ${x.label}` : `${x.label} never link`), h('small', {}, facts.entities[x.map]?.name));
    if (s.id === 'overdue') return h('li', { class: 'rz-row' }, Name(x.id), h('small', {}, `${n(x.open, 'open task')} · ${x.late} days late`));
    if (s.id === 'blockedWork') return h('li', { class: 'rz-row' }, Name(x.id), h('small', {}, `${x.blocked} of ${x.of} tasks blocked`));
    if (s.id === 'untestedLinks') return h('li', { class: 'rz-row' }, Name(x.from), h('span', { class: 'rz-arrow' }, '→'), Name(x.to), h('small', {}, x.confidence));
    return null;
  });
  return h('section', { class: `rz-signal${items.length ? '' : ' quiet'}`, style: `--src:${src?.id === 'mapper' ? '#3e8fa6' : src?.id === 'strategy' ? '#7b2fe8' : src?.id === 'assets' ? '#2c4fa3' : '#b05bd8'}` },
    h('header', {},
      h('span', { class: 'rz-signal-count' }, items.length.toLocaleString()),
      h('div', {}, h('h3', {}, s.label), h('small', {}, icon(src?.icon ?? 'dots', 12), src?.label, delta ? ` · ${delta > 0 ? '+' : ''}${delta} since baseline` : ''))),
    h('p', {}, s.why),
    items.length ? h('ul', { class: 'rz-rows' }, rows, items.length > 5 && h('li', { class: 'rz-more' }, `and ${items.length - 5} more`)) : h('p', { class: 'rz-none' }, 'Nothing here right now.'));
}
const Name = (id) => {
  const e = facts.entities[id];
  return e ? h('a', { class: 'rz-name', href: `#facts/${encodeURIComponent(id)}`, title: subOf(e) }, e.name) : h('span', { class: 'rz-name' }, id);
};
const Row = (id) => {
  const e = facts.entities[id];
  if (!e) return null;
  const a = m.actors[id];
  return h('li', { class: 'rz-row' }, Name(id), h('small', {}, a ? `${mapName(e.attrs.mapId)} · ${n(a.degree, 'link')}` : subOf(e)));
};

function Coming() {
  const stages = [
    ['Stage 2', 'Rules engine and tip library', 'Canned analyses, ranked tips with a Why?, the tip harvester and its review queue.'],
    ['Stage 3', 'The rack', 'Modules, cables and gadgets, with the Patchbay at the top: build your own analyses like a modular synth.'],
    ['Stage 4', 'Critical AI visualiser', 'A tiny inference engine that slowly shows what happens when you ask a system a question.'],
    ['Stage 5', 'Claude engine', 'Real questions of your graphs and links, through the server, with your own key and cost caps.'],
  ];
  return h('section', { class: 'rz-coming' }, h('h3', {}, 'Coming next'),
    h('ol', {}, stages.map(([k, t, d]) => h('li', {}, h('small', {}, k), h('b', {}, t), h('span', {}, d)))));
}

/** Before set-up is done: what the fact layer already sees, so the steps feel worth it. */
function Preview() {
  const fc = factCounts(facts);
  return h('section', { class: 'rz-panel' }, h('h3', {}, 'What Rhizome can see already'),
    h('ul', { class: 'rz-sources' }, FACT_SOURCES.filter((s) => fc.sources[s.id]).map((s) => h('li', {},
      icon(s.icon, 16), h('b', {}, s.label), h('span', {}, `${n(fc.sources[s.id].entities, 'thing')} · ${n(fc.sources[s.id].relations, 'tie')}`)))));
}

/* -------------------------------------------------------------- set-up */

function Checklist() {
  const next = nextStep(doc);
  return h('section', { class: 'rz-panel rz-steps' },
    h('h3', {}, 'Set-up'),
    h('ol', {}, SETUP_STEPS.map((s) => {
      const done = doc.setup?.[s.id];
      const later = s.stage > STAGE_NOW;
      const isNext = next?.id === s.id;
      return h('li', { class: `rz-step${done ? ' done' : ''}${isNext ? ' next' : ''}${later ? ' later' : ''}` },
        h('span', { class: 'rz-step-mark', 'aria-hidden': 'true' }, done ? icon('check', 14) : later ? '·' : ''),
        h('div', {}, h('b', {}, s.label, s.optional ? h('small', {}, ' optional') : null), h('span', {}, s.blurb),
          done ? h('small', {}, `Done ${String(done).slice(0, 10)}`) : later ? h('small', {}, `Arrives in stage ${s.stage}`) : null),
        isNext && canSet ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => doStep(s.id) }, s.id === 'profile' ? 'Fill in' : 'Run') : null,
        done && !later && canSet && s.id !== 'switchOn' ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => doStep(s.id) }, 'Run again') : null);
    })),
    !canSet && h('p', { class: 'rz-note' }, 'Ask an admin to finish setting up Rhizome.'));
}

function doStep(id) {
  if (id === 'profile' && !doc.profile) doc.profile = profileFromOrg(org, docs.strategy);
  if (id === 'profile' && route()[0] !== 'setup') { location.hash = '#setup'; return; }
  runStep(doc, id, { docs, plugins, profile: doc.profile });
  rebuild();
  save(id === 'index' ? `Read in ${n(factCounts(facts).entities, 'thing')} and kept a baseline` : id === 'calibrate' ? 'Thresholds set from your own data' : 'Saved');
  render();
}

function Setup() {
  setCrumbs([]);
  const p = doc.profile ?? profileFromOrg(org, docs.strategy);
  const draft = structuredClone(p);
  const field = (label, control, hint) => h('label', { class: 'rz-field' }, h('span', {}, label), control, hint && h('small', {}, hint));
  const ta = (key, rows = 3) => h('textarea', { class: 'textarea textarea-bordered', rows, disabled: !canSet, oninput: (e) => { draft[key] = e.target.value; } }, Array.isArray(draft[key]) ? draft[key].join('\n') : draft[key] ?? '');
  const themeChips = h('div', { class: 'rz-chips' }, THEMES.map((t) => {
    const b = h('button', { type: 'button', class: `rz-chip${draft.themes.includes(t.id) ? ' on' : ''}`, title: t.blurb, disabled: !canSet, onclick: () => {
      draft.themes = draft.themes.includes(t.id) ? draft.themes.filter((x) => x !== t.id) : [...draft.themes, t.id];
      b.classList.toggle('on');
    } }, t.label);
    return b;
  }));
  const spec = h('input', { type: 'range', min: 0, max: 1, step: 0.1, value: draft.weights?.speculative ?? 1, class: 'range range-xs', disabled: !canSet, oninput: (e) => { draft.weights = { ...draft.weights, speculative: Number(e.target.value) }; specOut.textContent = `${Math.round(Number(e.target.value) * 100)}%`; } });
  const specOut = h('b', {}, `${Math.round((draft.weights?.speculative ?? 1) * 100)}%`);
  const saveProfile = () => {
    runStep(doc, 'profile', { docs, plugins, profile: cleanProfile(draft) });
    save('Context profile saved');
    location.hash = '#home';
  };
  return h('div', { class: 'rz-page' }, tabs('setup'),
    h('div', { class: 'rz-two' },
      h('section', { class: 'rz-panel' },
        h('h3', {}, 'Context profile'),
        h('p', { class: 'rz-note' }, 'This tunes Rhizome to your work: which themes its tips come from, which words it listens for, and how much it trusts each kind of link.'),
        field('Sector', h('select', { class: 'select select-bordered select-sm', disabled: !canSet, onchange: (e) => { draft.sector = e.target.value; } }, SECTORS.map((s) => h('option', { value: s.id, selected: s.id === draft.sector }, s.label)))),
        field('Focus areas', ta('focus', 4), 'One a line.'),
        field('Who you serve', ta('serves', 2)),
        field('Your words', ta('words', 3), 'Words and phrases your field uses, one a line. Rhizome listens for them.'),
        field('Themes that matter', themeChips),
        field('Speculative links count for', h('div', { class: 'rz-range' }, spec, specOut), 'Map links marked speculative (not yet documented) weigh this much against documented ones.'),
        canSet && h('div', { class: 'rz-actions' }, h('button', { class: 'btn btn-primary btn-sm', onclick: saveProfile }, doc.setup?.profile ? 'Save profile' : 'Save and go on'))),
      h('div', { class: 'rz-stack' }, Checklist(),
        canSet && setupDone(doc) && h('section', { class: 'rz-panel' }, h('h3', {}, 'Start again'),
          h('p', { class: 'rz-note' }, 'Runs the whole set-up from the top: a new baseline and new thresholds. The profile is kept as a starting point.'),
          h('div', { class: 'rz-actions' }, h('button', { class: 'btn btn-sm btn-outline', onclick: async () => {
            if (!(await uiConfirm('Run the set-up again from the start? The baseline and snapshots are replaced.'))) return;
            resetSetup(doc); runStep(doc, 'switchOn', { docs, plugins }); save('Set-up started again'); render();
          } }, 'Run set-up again'))))));
}

/* --------------------------------------------------------------- facts */

let factType = null;
let factQuery = '';
function Facts(arg) {
  const focus = arg && facts.entities[arg] ? arg : null;
  setCrumbs(focus ? [{ label: facts.entities[focus].name }] : []);
  const fc = factCounts(facts);
  const types = Object.keys(ENTITY_TYPES).filter((t) => fc.types[t]);
  const listBox = h('ul', { class: 'rz-entities' });
  const fill = () => {
    const found = searchEntities(facts, factQuery, { type: factType, limit: 300 });
    listBox.replaceChildren(...found.map((e) => h('li', { class: e.id === focus ? 'on' : '' },
      h('a', { href: `#facts/${encodeURIComponent(e.id)}` }, h('b', {}, e.name), h('small', {}, subOf(e))))),
    found.length === 300 ? h('li', { class: 'rz-more' }, 'Showing the first 300. Narrow it with a type or a search.') : null);
  };
  fill();
  const search = h('input', { class: 'input input-bordered input-sm rz-search', type: 'search', placeholder: 'Find a thing by name or tag', value: factQuery, oninput: (e) => { factQuery = e.target.value; fill(); } });
  return h('div', { class: 'rz-page' }, tabs('facts'),
    h('div', { class: 'rz-sources-strip' }, FACT_SOURCES.filter((s) => fc.sources[s.id]).map((s) => h('div', { class: 'rz-stat' },
      h('strong', {}, fc.sources[s.id].entities.toLocaleString()), h('span', {}, icon(s.icon, 13), ' ', s.label), h('em', {}, n(fc.sources[s.id].relations, 'tie'))))),
    h('div', { class: 'rz-chips' },
      h('button', { class: `rz-chip${factType ? '' : ' on'}`, onclick: () => { factType = null; render(); } }, `All ${fc.entities}`),
      types.map((t) => h('button', { class: `rz-chip${factType === t ? ' on' : ''}`, onclick: () => { factType = t; render(); } }, `${typeLabel(t, 2)} ${fc.types[t]}`))),
    h('div', { class: 'rz-facts' },
      h('div', { class: 'rz-panel rz-list' }, search, listBox),
      focus ? Entity(focus) : h('div', { class: 'rz-panel rz-empty' }, h('p', {}, 'Pick a thing to see every fact about it: what it is, and everything it’s tied to, both ways.'))));
}

function Entity(id) {
  const e = facts.entities[id];
  const ties = relationsOf(facts, id);
  const a = m.actors[id];
  const attrs = Object.entries(e.attrs).filter(([k, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !['asset', 'mapId', 'planId', 'layerId', 'zone', 'quadrant', 'centre', 'collections'].includes(k));
  const val = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v));
  return h('section', { class: 'rz-panel rz-entity' },
    h('header', {}, h('small', {}, subOf(e)), h('h3', {}, e.name), h('small', {}, 'From ', sourceOf(e.source)?.label ?? e.source)),
    a && h('div', { class: 'rz-measure-strip' },
      Mini('Links', a.degree, BANDS[a.band.degree]), Mini('In', a.inDeg), Mini('Out', a.outDeg), Mini('Between', a.betweenness, BANDS[a.band.betweenness]),
      a.cut ? h('span', { class: 'rz-flag' }, 'Single point of failure') : null),
    attrs.length ? h('dl', { class: 'rz-attrs' }, attrs.flatMap(([k, v]) => [h('dt', {}, k.replace(/([A-Z])/g, ' $1').toLowerCase()), h('dd', {}, val(v))])) : null,
    h('h4', {}, n(ties.length, 'tie')),
    ties.length ? h('ul', { class: 'rz-ties' }, ties.map((t) => h('li', {},
      h('span', { class: 'rz-rel' }, t.out ? t.rel : `← ${t.rel}`), Name(t.other),
      h('small', {}, [t.weight && t.weight !== 1 ? `strength ${t.weight}` : null, t.basis, t.confidence].filter(Boolean).join(' · '))))) : h('p', { class: 'rz-none' }, 'Not tied to anything yet.'));
}
const Mini = (label, v, band = null) => h('div', { class: 'rz-mini' }, h('b', {}, v), h('span', {}, label), band && h('small', {}, band));

/* ------------------------------------------------------------ measures */

function Measures() {
  setCrumbs([]);
  const c = doc.calibration ?? m.calibration;
  const ids = Object.keys(m.actors).sort((x, y) => m.actors[y].degree - m.actors[x].degree || m.actors[y].betweenness - m.actors[x].betweenness);
  const abcdMax = Math.max(1, ...Object.values(m.abcd));
  const cut = (label, k) => h('tr', {}, h('th', {}, label), ['p25', 'p50', 'p75', 'p90'].map((p) => h('td', {}, c[k]?.[p] ?? '·')));
  return h('div', { class: 'rz-page' }, tabs('measures'),
    h('div', { class: 'rz-two' },
      h('section', { class: 'rz-panel' }, h('h3', {}, 'Calibration'),
        h('p', { class: 'rz-note' }, doc.calibration ? `Set from your own data on ${String(doc.calibration.at).slice(0, 10)}. “Few links” is at or under the 25th percentile; a hub is in the top 10%.` : 'Not calibrated yet: these are worked out live. Run the Calibrate step to keep them.'),
        h('table', { class: 'rz-table' }, h('thead', {}, h('tr', {}, h('th', {}), ['25%', 'Median', '75%', '90%'].map((x) => h('th', {}, x)))),
          h('tbody', {}, cut('Links per actor', 'degree'), cut('Betweenness', 'betweenness')))),
      h('section', { class: 'rz-panel' }, h('h3', {}, 'ABCD balance'),
        h('p', { class: 'rz-note' }, 'Assets by asset-based community development type, from the Asset manager.'),
        h('ul', { class: 'rz-bars' }, ABCD.map((t) => h('li', {}, h('span', {}, t.label),
          h('span', { class: 'rz-bar', style: `--c:${t.color}` }, h('span', { style: `width:${Math.round((100 * (m.abcd[t.id] ?? 0)) / abcdMax)}%` })), h('b', {}, m.abcd[t.id] ?? 0)))))),
    h('section', { class: 'rz-panel' }, h('h3', {}, 'The network, actor by actor'),
      h('p', { class: 'rz-note' }, 'Links count each map link once, either way. Betweenness is how often an actor sits on the shortest way between two others. A single point of failure is an actor whose loss splits its network.'),
      ids.length ? h('table', { class: 'rz-table rz-net' },
        h('thead', {}, h('tr', {}, ['Actor', 'Map', 'Zone', 'Links', 'In', 'Out', 'Betweenness', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, ids.map((id) => {
          const e = facts.entities[id];
          const a = m.actors[id];
          return h('tr', {}, h('td', {}, Name(id)), h('td', {}, mapName(e.attrs.mapId)), h('td', {}, e.attrs.zoneLabel ?? ''),
            h('td', {}, h('span', { class: `rz-band ${a.band.degree}` }, a.degree)), h('td', {}, a.inDeg), h('td', {}, a.outDeg),
            h('td', {}, h('span', { class: `rz-band ${a.band.betweenness}` }, a.betweenness)), h('td', {}, a.cut ? h('span', { class: 'rz-flag' }, 'Single point') : ''));
        }))) : h('p', { class: 'rz-none' }, 'No actors on your maps yet.')));
}

window.addEventListener('hashchange', render);
render();
