import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { rhizomeTabs } from './tabs.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { uiConfirm } from '../ui/dialog.js';
import { saveDoc, canWriteDoc, loadDoc } from '../platform/storage.js';
import { loadOrg, loadAssets, loadMaps, loadLibrary, loadPodcasts, loadStrategy, loadStudio, loadRhizome } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { ABCD } from '../platform/assetHub.js';
import { enabledPlugins } from '../plugins.js';
import { buildFacts, factCounts, relationsOf, searchEntities, FACT_SOURCES, ENTITY_TYPES, typeLabel } from './facts.js';
import { measureFacts, SIGNALS, BANDS } from './measures.js';
import { SETUP_STEPS, STAGE_NOW, THEMES, SECTORS, themeById, nextStep, setupDone, runStep, resetSetup, profileFromOrg, cleanProfile, sinceBaseline, snapshot, recordRun } from './setup.js';
import { RULES, ANALYSES, analysisById, ruleById, runAnalysis, describeCheck, OPS } from './rules.js';
import { tipById, SOURCES, TIPS, TIP_PACK_VERSION } from './tips.js';
import { RHIZOME_HELP, RHIZOME_HELP_ID } from './help.js';
import { loadHelp } from '../platform/help.js';
import { HELP_SHOTS } from '../help/library.js';
import { Markdown } from '../ui/markdown.js';
import { linkTo } from '../plugins.js';
import './adapters.js';
import { Rack, rackVersion } from './RackView.js';
import { Lab, LAB_EXPERIMENTS } from './LabView.js';
import { Output } from './OutputView.js'; // not Rack.js: macOS would mix it up with rack.js
import { loadTips, saveTips } from '../platform/tipsLibrary.js';
import { can } from '../platform/session.js';
import { harvest, mergeHarvest, knownTexts, approve, reject, needsRewrite, sourceLabel, readingFor } from './harvest.js';
import { HARVEST_SOURCES, harvestSourceById, resourcesFor } from './harvestSources.js';

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
const doc = loadRhizome();
function loadDocs() {
  const maps = plugins.has('mapper') ? loadMaps() : null;
  return {
    org, maps, mapContents: maps ? loadAllMaps(maps) : {},
    assets: plugins.has('assets') ? loadAssets() : null,
    library: plugins.has('library') ? loadLibrary() : null,
    podcasts: plugins.has('podcasts') ? loadPodcasts() : null,
    strategy: plugins.has('strategy') ? loadStrategy() : null,
    studio: plugins.has('studio') ? loadStudio() : null,
    // Place's own document, read as it is (Place makes it); its adapter turns it into facts.
    place: plugins.has('place') ? loadDoc('place') : null,
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
  // Alpha 0.4: Output became Report; old #output links still land there.
  const raw = (location.hash.slice(1) || 'home').replace(/^output\b/, 'report');
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
  if (view === 'analyses') page = Analyses(arg);
  else if (view === 'tips') page = Tips(arg);
  else if (view === 'rack') page = RackPage(arg);
  else if (view === 'lab') page = LabPage(arg);
  else if (view === 'report') page = ReportPage();
  else if (view === 'about') page = About(arg);
  else if (view === 'facts') page = Facts(arg);
  else if (view === 'measures') page = Measures();
  else if (view === 'setup') page = Setup();
  else page = Home();
  main.replaceChildren(page);
  main.scrollTop = view === 'facts' ? scroll : 0;
}

function drawSide(view) {
  const fc = factCounts(facts);
  // Rack 2.0 gives the rack the room: the side nav starts folded there, and keeps its own fold.
  const rack2 = view === 'rack' && rackVersion() === '2';
  side = swapSide(side, SideNav({ label: 'Rhizome', ...(rack2 ? { foldKey: 'dashi.rhizome.rack2-nav', foldDefault: true } : {}), sections: [
    { title: 'Rhizome · experimental', items: [
      { label: 'Home', sub: setupDone(doc) ? 'Signals worth a look' : 'Finish setting up', icon: 'home', href: '#home', on: view === 'home' },
      { label: 'Analyses', sub: `${n(ANALYSES.length, 'canned analysis', 'canned analyses')} · ${n(RULES.length, 'rule')}`, icon: 'spark', href: '#analyses', on: view === 'analyses' },
      { label: 'Lab', sub: `${LAB_EXPERIMENTS.length} experiments · console and patches`, icon: 'flask', href: '#lab', on: view === 'lab' },
      { label: 'The rack', sub: `In the Lab · ${n(Math.max(1, Object.keys(doc.patches ?? {}).length), 'patch', 'patches')}`, icon: 'connect', href: '#rack', on: view === 'rack' },
      linkTo('graph') && { label: 'Graph', sub: 'Search, loops, hubs and bridges, linked data', icon: 'sec-graph', href: linkTo('graph', '#explore') },
      { label: 'Facts', sub: `${n(fc.entities, 'thing')} · ${n(fc.relations, 'tie')}`, icon: 'sec-rhizome', href: '#facts', on: view === 'facts' },
      { label: 'Report', sub: 'Everything Rhizome found, to print or save as PDF', icon: 'file', href: '#report', on: view === 'report' },
      { label: 'Tips', sub: `${n(TIPS.length + (tipsDoc?.approved.length ?? 0) + Object.keys(doc.ownTips ?? {}).length, 'tip')} · reading list`, icon: 'book', href: '#tips', on: view === 'tips' },
      { label: 'Measures', sub: 'Calibrated to this organisation', icon: 'chart', href: '#measures', on: view === 'measures' },
      { label: 'Set-up', sub: setupDone(doc) ? 'Context profile, run again' : `Next: ${nextStep(doc)?.label}`, icon: 'settings', href: '#setup', on: view === 'setup' },
      { label: 'About', sub: 'Quick reference and tutorials', icon: 'help', href: '#about', on: view === 'about' },
    ] },
    { title: 'Coming next', items: [
      { label: 'Claude engine', sub: 'Stage 5: real questions, your own key', icon: 'eye' },
    ] },
  ] }));
}

const tabs = (current) => PluginHeader('rhizome', { tabs: rhizomeTabs('rhizome'), current });

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
    Welcome(),
    h('h2', { class: 'rz-h2' }, 'Signals'),
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
        s.optional && !done && !later && canSet ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => doStep(s.id) }, 'Run') : null,
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

/* ------------------------------------------------------------ analyses */

// Your own rules (made in the rack) run as one more analysis, "Your rules".
const ownAnalysis = () => (Object.keys(doc.ownRules ?? {}).length ? { own: { id: 'own', name: 'Your rules', blurb: 'Rules you built in the rack.', icon: 'connect', rules: Object.keys(doc.ownRules) } } : {});
const ctx = () => ({ facts, measures: m, calibration: doc.calibration ?? m.calibration, profile: doc.profile, plugins, customRules: doc.ownRules ?? {}, custom: ownAnalysis() });
const mySet = () => doc.analyses ?? ANALYSES.map((a) => a.id);
const THEME_TONE = { network: '#3e8fa6', leverage: '#7b2fe8', water: '#2c4fa3', abcd: '#ef7f2d', soar: '#4da65c', toc: '#c77deb', impact: '#e35a2c', hygiene: '#56657f', equity: '#c8432f', ai: '#2c4fa3', curriculum: '#4da65c', evaluation: '#f4a93b', place: '#3f8f6b' };

/** The welcome report: the latest run's top findings, on Home. */
function Welcome() {
  const run = doc.runs?.[0];
  if (!run) return null;
  const live = runAnalysis(mySet(), ctx(), { dismissed: doc.dismissed ?? {} });
  return h('section', { class: 'rz-panel rz-welcome' },
    h('header', { class: 'rz-welcome-head' },
      h('div', {}, h('h3', {}, run.analysis === 'welcome' ? 'Your welcome report' : 'Your latest findings'),
        h('small', {}, `${n(live.length, 'finding')} from ${n(mySet().length, 'analysis', 'analyses')} · last run ${String(run.at).slice(0, 10)}`)),
      h('a', { class: 'btn btn-sm btn-outline', href: '#analyses' }, 'See them all', icon('chevronRight', 13))),
    // The best finding from each rule, so the report shows a spread, not one rule four times.
    h('ol', { class: 'rz-findings compact' }, live.filter((f, i) => live.findIndex((x) => x.ruleId === f.ruleId) === i).slice(0, 4).map((f) => Finding(f, { compact: true }))));
}

let openWhy = null;
function Analyses(arg) {
  const A = { ...analysisById, ...ownAnalysis() };
  const current = arg === 'set' || !arg ? 'set' : arg === 'dismissed' ? 'dismissed' : A[arg] ? arg : 'set';
  setCrumbs(current === 'set' ? [] : [{ label: current === 'dismissed' ? 'Dismissed' : A[current].name }]);
  const findings = current === 'dismissed' ? [] : runAnalysis(current === 'set' ? mySet() : current, ctx(), { dismissed: doc.dismissed ?? {} });
  const dismissedCount = Object.keys(doc.dismissed ?? {}).length;
  const card = (a) => {
    const count = runAnalysis(a.id, ctx(), { dismissed: doc.dismissed ?? {} }).length;
    const inSet = mySet().includes(a.id);
    return h('li', { class: `rz-analysis${current === a.id ? ' on' : ''}` },
      h('a', { href: `#analyses/${a.id}` }, icon(a.icon, 16), h('span', {}, h('b', {}, a.name), h('small', {}, `${n(a.rules.length, 'rule')} · ${n(count, 'finding')}`))),
      canSet ? h('label', { class: 'rz-inset', title: 'In my set' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: inSet, onchange: (e) => {
        doc.analyses = e.target.checked ? [...new Set([...mySet(), a.id])] : mySet().filter((x) => x !== a.id);
        save(); render();
      } }), 'In my set') : null);
  };
  const head = current === 'set'
    ? h('div', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, 'My set'), h('p', { class: 'rz-note' }, `${n(mySet().length, 'analysis', 'analyses')} chosen for your context. Tick or untick them on the left.`)),
      canSet && h('button', { class: 'btn btn-sm btn-primary', onclick: () => { recordRun(doc, 'set', findings); save(`Ran your set: ${n(findings.length, 'finding')}`); render(); } }, icon('play', 14), 'Run my set'))
    : current === 'dismissed'
      ? h('div', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, 'Dismissed'), h('p', { class: 'rz-note' }, 'Findings you put away. Each comes back by itself if what it rests on changes.')),
        canSet && dismissedCount ? h('button', { class: 'btn btn-sm btn-outline', onclick: () => { doc.dismissed = {}; save('All findings brought back'); render(); } }, 'Bring them all back') : null)
      : h('div', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, A[current].name), h('p', { class: 'rz-note' }, A[current].blurb)));
  const body = current === 'dismissed'
    ? (dismissedCount ? h('ul', { class: 'rz-rows rz-dismissed' }, Object.entries(doc.dismissed).map(([id, d]) => h('li', { class: 'rz-row' }, h('span', { class: 'rz-name' }, d.title ?? id), h('small', {}, `put away ${String(d.at).slice(0, 10)}`),
      canSet ? h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { delete doc.dismissed[id]; save('Brought back'); render(); } }, 'Bring back') : null))) : h('p', { class: 'rz-none' }, 'Nothing dismissed.'))
    : findings.length ? h('ol', { class: 'rz-findings' }, findings.map((f) => Finding(f))) : h('p', { class: 'rz-none' }, 'Nothing found. Either all is well here, or the facts it needs aren’t there yet.');
  return h('div', { class: 'rz-page' }, tabs('analyses'),
    h('div', { class: 'rz-analyses' },
      h('aside', { class: 'rz-panel rz-alist' },
        h('ul', {}, h('li', { class: `rz-analysis${current === 'set' ? ' on' : ''}` }, h('a', { href: '#analyses/set' }, icon('star', 16), h('span', {}, h('b', {}, 'My set'), h('small', {}, `${n(mySet().length, 'analysis', 'analyses')}`))))),
        h('h4', {}, 'Canned analyses'),
        h('ul', {}, [...ANALYSES, ...Object.values(ownAnalysis())].map(card)),
        h('ul', {}, h('li', { class: `rz-analysis${current === 'dismissed' ? ' on' : ''}` }, h('a', { href: '#analyses/dismissed' }, icon('eyeOff', 16), h('span', {}, h('b', {}, 'Dismissed'), h('small', {}, n(dismissedCount, 'finding'))))))),
      h('div', { class: 'rz-stack' }, h('section', { class: 'rz-panel' }, head, body), RulesList())));
}

/** One finding: its score, the tip, what it's about, and Why?, Dismiss and Show on map. */
function Finding(f, { compact = false } = {}) {
  const rule = ruleById[f.ruleId] ?? doc.ownRules?.[f.ruleId];
  const tone = THEME_TONE[rule?.theme] ?? '#56657f';
  const first = facts.entities[f.items[0]];
  const mapHref = f.show === 'map' && first?.attrs.mapId ? linkTo('mapper', `#${f.items[0].startsWith('actor:') ? f.items[0].slice(6) : first.attrs.mapId}`) : null;
  // Things with a real-world location can be shown on Place's map (only for people who can open Place).
  const placeHref = f.placed?.length && plugins.has('place') ? linkTo('place', `#show/${f.placed.slice(0, 40).map(encodeURIComponent).join(',')}`) : null;
  const whyOpen = openWhy === f.id;
  return h('li', { class: 'rz-finding', style: `--t:${tone}` },
    h('div', { class: 'rz-score', title: `Score ${f.score}` }, h('span', { style: `height:${Math.round(f.score * 100)}%` })),
    h('div', { class: 'rz-finding-body' },
      h('header', {}, h('b', {}, f.title), h('span', { class: 'rz-theme' }, themeById[rule?.theme]?.label ?? rule?.theme)),
      h('p', {}, f.text),
      !compact && resourcesFor(rule?.theme).length ? h('p', { class: 'rz-readmore' }, 'Read more: ', resourcesFor(rule.theme).slice(0, 2).flatMap((s, i) => [i ? ' · ' : '', ext(s.url, s.title)])) : null,
      !compact && f.items.length ? h('div', { class: 'rz-items' }, f.items.slice(0, 8).map((id) => facts.entities[id] ? h('a', { class: 'rz-item', href: `#facts/${encodeURIComponent(id)}` }, facts.entities[id].name) : null),
        f.items.length > 8 ? h('span', { class: 'rz-more' }, `+${f.items.length - 8}`) : null) : null,
      !compact && h('div', { class: 'rz-finding-actions' },
        h('button', { class: `btn btn-xs ${whyOpen ? 'btn-active' : 'btn-ghost'}`, onclick: () => { openWhy = whyOpen ? null : f.id; render(); } }, 'Why?'),
        mapHref && h('a', { class: 'btn btn-xs btn-ghost', href: mapHref }, icon('sec-mapper', 13), 'Show on map'),
        rule?.own && rule.patchId && doc.patches?.[rule.patchId] ? h('a', { class: 'btn btn-xs btn-ghost', href: `#rack/${rule.patchId}` }, icon('connect', 13), 'Open in the rack') : null,
        placeHref && h('a', { class: 'btn btn-xs btn-ghost', href: placeHref }, icon('globe', 13), 'Show on Place'),
        canSet && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { (doc.dismissed ??= {})[f.id] = { sig: f.sig, at: new Date().toISOString(), title: f.title, text: f.text }; save('Dismissed'); render(); } }, 'Dismiss')),
      !compact && whyOpen ? Why(f) : null));
}

/** Why?: the rule behind a finding, laid bare. */
function Why(f) {
  const rule = ruleById[f.ruleId] ?? doc.ownRules?.[f.ruleId];
  const w = f.why.weigh;
  const tip = tipById[f.why.tip];
  return h('div', { class: 'rz-why' },
    h('dl', {},
      h('dt', {}, 'Rule'), h('dd', {}, rule.name, h('code', {}, rule.id)),
      h('dt', {}, 'Looked at'), h('dd', {}, rule.from.list ? `the “${rule.from.list}” measure` : `every ${typeLabel(rule.from.type)}`, f.why.matched > 1 ? `, ${n(f.why.matched, 'match', 'matches')}` : ''),
      h('dt', {}, 'When'), h('dd', {}, f.why.checks.length ? h('ul', {}, f.why.checks.map((c) => h('li', {}, c.ok ? '✓ ' : '✗ ', describeCheck(c), h('small', {}, ` (here: ${c.got ?? 'none'})`)))) : 'Everything in that measure'),
      h('dt', {}, 'Weigh'), h('dd', {}, `${w.base} to start`, w.terms.map((t) => `, + ${t.part} for ${t.field} (${t.value})`).join(''), w.themed ? ', + 0.06 for a theme in your profile' : '', w.speculative != null ? `, × ${w.speculative} for a speculative link` : '', ` = ${w.score}`),
      h('dt', {}, 'Say'), h('dd', {}, `Tip “${tip?.id}”, ${themeById[tip?.theme]?.label ?? tip?.theme}`, f.why.source ? h('small', {}, ` · after ${f.why.source}`) : null),
      h('dt', {}, 'Show'), h('dd', {}, rule.show === 'map' ? 'On the map' : rule.show === 'geo' ? 'On Place’s map' : 'As a list', f.placed?.length ? ` · ${n(f.placed.length, 'thing')} with a location` : '')));
}

let rulesAsData = false;
function RulesList() {
  return h('section', { class: 'rz-panel rz-rules' },
    h('header', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, 'Every rule'), h('p', { class: 'rz-note' }, `${n(RULES.length, 'rule')} and ${n(TIPS.length, 'tip')} (tip pack ${TIP_PACK_VERSION}). Rules are data: this is exactly what Rhizome runs. Open any of them in the rack, or build your own there.`)),
      h('button', { class: 'btn btn-xs btn-outline', onclick: () => { rulesAsData = !rulesAsData; render(); } }, rulesAsData ? 'View as a table' : 'View as data')),
    rulesAsData ? h('pre', { class: 'rz-json' }, JSON.stringify(RULES, null, 2))
      : h('table', { class: 'rz-table' }, h('thead', {}, h('tr', {}, ['Rule', 'Theme', 'Looks at', 'When', 'Says'].map((x) => h('th', {}, x)))),
        h('tbody', {}, RULES.map((r) => h('tr', {}, h('td', {}, h('b', {}, r.name)), h('td', {}, themeById[r.theme]?.label ?? r.theme),
          h('td', {}, r.from.list ? r.from.list : `every ${typeLabel(r.from.type)}`, r.group ? h('small', {}, ' (grouped)') : null),
          h('td', {}, r.when.length ? r.when.map((c) => `${c.field} ${OPS[c.op]?.label} ${c.pct ? `your ${c.pct}` : c.value ?? ''}`.trim()).join('; ') : '·'),
          h('td', {}, h('code', {}, r.say)))))));
}

/* ---------------------------------------------------------------- rack */

function RackPage(arg) {
  const p = doc.patches?.[arg];
  setCrumbs(p ? [{ label: p.name }] : []);
  return h('div', { class: 'rz-page rz-page-wide' }, tabs('lab'),
    Rack({ doc, save, render, ctx, canSet, toast, confirm: uiConfirm }, arg));
}

/* ----------------------------------------------------------------- lab */

function LabPage(arg) {
  const x = LAB_EXPERIMENTS.find((e) => e.id === arg);
  setCrumbs(x ? [{ label: x.name }] : []);
  return h('div', { class: 'rz-page rz-page-wide' }, tabs('lab'),
    Lab({ doc, facts, save, render, canSet, toast }, x ? arg : null));
}

/* -------------------------------------------------------------- report */

function ReportPage() {
  setCrumbs([]);
  return h('div', { class: 'rz-page rz-page-wide' }, tabs('report'),
    Output({ ctx, doc, save, render, canSet, toast, org, tipsDoc: () => tipsDoc }));
}

/* ---------------------------------------------------------------- tips */

// The platform's tip library and review queue (the tip harvester), loaded once.
let tipsDoc = null;
const reviewer = can.editHelp();
loadTips().then((t) => { tipsDoc = t; if (['tips', 'home', 'analyses', 'report'].includes(route()[0])) render(); }).catch(() => { tipsDoc = { queue: [], approved: [], rejected: [], runs: [] }; });
let tipTheme = null;
const tipWords = (text) => String(text).split(/(\{\w+\})/).map((bit) => (/^\{\w+\}$/.test(bit) ? h('span', { class: 'rz-slot', title: 'Filled in from what matched' }, bit.slice(1, -1)) : bit));
const ThemePill = (theme) => h('span', { class: 'rz-theme', style: `--t:${THEME_TONE[theme] ?? '#56657f'}` }, themeById[theme]?.label ?? theme);
const ext = (url, label) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'rz-ext' }, label, icon('link', 11));

function Tips(arg) {
  const part = ['reading', 'own', 'queue'].includes(arg) ? arg : 'library';
  setCrumbs(part === 'library' ? [] : [{ label: { reading: 'Reading list', own: 'Your tips', queue: 'Review queue' }[part] }]);
  const approved = tipsDoc?.approved ?? [];
  const own = Object.values(doc.ownTips ?? {});
  const queue = tipsDoc?.queue ?? [];
  const sub = [
    ['library', 'Library', TIPS.length + approved.length + own.length],
    ['reading', 'Reading list', (doc.reading ?? readingFor(doc.profile)).length],
    ['own', 'Your tips', own.length],
    ...(reviewer ? [['queue', 'Review queue', queue.length]] : []),
  ];
  return h('div', { class: 'rz-page' }, tabs('tips'),
    h('div', { class: 'rz-chips' }, sub.map(([id, label, count]) => h('a', { class: `rz-chip${part === id ? ' on' : ''}`, href: `#tips/${id}` }, `${label} ${count}`))),
    part === 'reading' ? Reading() : part === 'own' ? OwnTips() : part === 'queue' ? Queue() : Library(approved, own));
}

function Library(approved, own) {
  const all = [
    ...TIPS.map((t) => ({ ...t, from: 'Built-in', sourceText: SOURCES[t.source] })),
    ...approved.map((t) => ({ ...t, from: `Harvested ${String(t.approvedAt).slice(0, 10)}`, sourceText: sourceLabel(t.source) })),
    ...own.map((t) => ({ ...t, from: t.visibility === 'private' ? 'Yours · private' : 'Yours · public', sourceText: t.source })),
  ];
  const themes = THEMES.filter((t) => all.some((x) => x.theme === t.id));
  const shown = all.filter((t) => !tipTheme || t.theme === tipTheme);
  return h('section', { class: 'rz-panel' },
    h('div', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, 'The tip library'),
      h('p', { class: 'rz-note' }, `Tip pack ${TIP_PACK_VERSION}, the tips the harvester has brought in and a reviewer approved, and your own. Built-in tips are filled in with names from what a rule matched (the shaded words).`))),
    h('div', { class: 'rz-chips' },
      h('button', { class: `rz-chip${tipTheme ? '' : ' on'}`, onclick: () => { tipTheme = null; render(); } }, `All ${all.length}`),
      themes.map((t) => h('button', { class: `rz-chip${tipTheme === t.id ? ' on' : ''}`, onclick: () => { tipTheme = t.id; render(); } }, `${t.label} ${all.filter((x) => x.theme === t.id).length}`))),
    h('ul', { class: 'rz-tips' }, shown.map((t) => h('li', { class: 'rz-tip', style: `--t:${THEME_TONE[t.theme] ?? '#56657f'}` },
      h('p', {}, tipWords(t.text)),
      h('footer', {}, ThemePill(t.theme), h('small', {}, t.from), t.sourceText ? h('small', {}, `After ${t.sourceText}`) : null)))));
}

function Reading() {
  const picked = doc.reading ?? readingFor(doc.profile);
  const rest = HARVEST_SOURCES.filter((s) => s.url && !picked.includes(s.id));
  const card = (s) => h('li', { class: 'rz-read', style: `--t:${THEME_TONE[s.theme] ?? '#56657f'}` },
    h('div', {}, ext(s.url, s.title), h('small', {}, [s.author, s.year, s.kind].filter(Boolean).join(' · '))),
    h('p', {}, s.points?.[0] ?? ''), ThemePill(s.theme));
  return h('div', { class: 'rz-stack' },
    h('section', { class: 'rz-panel' },
      h('div', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, 'Your reading list'),
        h('p', { class: 'rz-note' }, doc.setup?.harvest ? `Picked for your themes on ${String(doc.setup.harvest).slice(0, 10)}.` : 'Picked for your themes. Run the context harvest in Set-up to keep it.')),
        canSet && h('button', { class: 'btn btn-sm btn-outline', onclick: () => { runStep(doc, 'harvest', { docs, plugins }); save('Reading list picked for your themes'); render(); } }, doc.setup?.harvest ? 'Pick again' : 'Keep this list')),
      h('ul', { class: 'rz-reading' }, picked.map((id) => harvestSourceById[id]).filter(Boolean).map(card))),
    rest.length ? h('section', { class: 'rz-panel' }, h('h3', {}, 'More from the harvester’s sources'), h('ul', { class: 'rz-reading' }, rest.map(card))) : null);
}

function OwnTips() {
  const draft = { theme: doc.profile?.themes?.[0] ?? 'network', text: '', source: '', visibility: 'public' };
  const add = () => {
    const text = draft.text.trim();
    if (!text) return toast('Write the tip first');
    const id = `own-${Date.now().toString(36)}`;
    (doc.ownTips ??= {})[id] = { id, theme: draft.theme, text: text.slice(0, 500), source: draft.source.trim().slice(0, 200), visibility: draft.visibility, at: new Date().toISOString() };
    save('Tip added'); render();
  };
  const list = Object.values(doc.ownTips ?? {}).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return h('div', { class: 'rz-two' },
    canSet ? h('section', { class: 'rz-panel' }, h('h3', {}, 'Add a tip of your own'),
      h('p', { class: 'rz-note' }, 'Something your organisation has learned. Your own tips sit apart from the built-in pack and the harvester, so a refresh never touches them.'),
      h('label', { class: 'rz-field' }, h('span', {}, 'Theme'), h('select', { class: 'select select-bordered select-sm', onchange: (e) => { draft.theme = e.target.value; } }, THEMES.map((t) => h('option', { value: t.id, selected: t.id === draft.theme }, t.label)))),
      h('label', { class: 'rz-field' }, h('span', {}, 'The tip'), h('textarea', { class: 'textarea textarea-bordered', rows: 3, maxlength: 500, oninput: (e) => { draft.text = e.target.value; } })),
      h('label', { class: 'rz-field' }, h('span', {}, 'Where it comes from'), h('input', { class: 'input input-bordered input-sm', placeholder: 'A person, a project, a book (optional)', oninput: (e) => { draft.source = e.target.value; } })),
      h('label', { class: 'rz-field rz-inline' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: true, onchange: (e) => { draft.visibility = e.target.checked ? 'public' : 'private'; } }), h('span', {}, 'Public'), h('small', {}, 'Public tips will be offered to the shared library when it opens. Private ones stay with your organisation.')),
      h('div', { class: 'rz-actions' }, h('button', { class: 'btn btn-sm btn-primary', onclick: add }, 'Add tip'))) : null,
    h('section', { class: 'rz-panel' }, h('h3', {}, n(list.length, 'tip of your own', 'tips of your own')),
      list.length ? h('ul', { class: 'rz-tips' }, list.map((t) => h('li', { class: 'rz-tip', style: `--t:${THEME_TONE[t.theme] ?? '#56657f'}` },
        h('p', {}, t.text),
        h('footer', {}, ThemePill(t.theme), t.source ? h('small', {}, `From ${t.source}`) : null,
          canSet ? h('label', { class: 'rz-vis' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: t.visibility !== 'private', onchange: (e) => { t.visibility = e.target.checked ? 'public' : 'private'; save(e.target.checked ? 'Public' : 'Private'); render(); } }), t.visibility === 'private' ? 'Private' : 'Public') : h('small', {}, t.visibility),
          canSet ? h('button', { class: 'btn btn-xs btn-ghost', onclick: async () => { if (await uiConfirm('Delete this tip?')) { delete doc.ownTips[t.id]; save('Deleted'); render(); } } }, 'Delete') : null)))) : h('p', { class: 'rz-none' }, 'None yet.')));
}

function Queue() {
  if (!tipsDoc) return h('p', { class: 'rz-none' }, 'Loading…');
  const store = async (note) => { try { await saveTips(tipsDoc); toast(note); } catch (err) { toast(`Not saved: ${err.message}`); } render(); };
  const distil = () => {
    const res = harvest({ known: knownTexts(tipsDoc, TIPS), rejectedIds: tipsDoc.rejected.map((r) => r.id) });
    const run = mergeHarvest(tipsDoc, res, { mode: 'offline', by: 'Rhizome' });
    store(`${n(run.added, 'new candidate')} in the queue`);
  };
  const last = tipsDoc.runs?.[0];
  return h('div', { class: 'rz-stack' },
    h('section', { class: 'rz-panel' },
      h('div', { class: 'rz-ahead' }, h('div', {}, h('h3', {}, 'Review queue'),
        h('p', { class: 'rz-note' }, 'Candidates from the tip harvester. Approve the ones worth keeping (in your own words) and reject the rest; a rejected one is never offered again. Approved tips are public unless you say otherwise.')),
        h('button', { class: 'btn btn-sm btn-outline', onclick: distil }, icon('download', 14), 'Distil from the registry')),
      h('p', { class: 'rz-note' }, last ? `Last run ${String(last.at).slice(0, 16).replace('T', ' ')}, ${last.mode}: ${last.sources} sources, ${last.fetched} pages fetched, ${last.added} new.` : 'Not run yet.',
        ' For fresh excerpts from the web, run ', h('code', {}, 'npm run tips:refresh -- --online'), ' on the server.')),
    queue().length ? h('ol', { class: 'rz-queue' }, [...queue()].sort((a, b) => (a.kind !== 'excerpt') - (b.kind !== 'excerpt') || b.score - a.score).map(Candidate)) : h('section', { class: 'rz-panel' }, h('p', { class: 'rz-none' }, 'Nothing waiting.')));
  function queue() { return tipsDoc.queue ?? []; }
  function Candidate(c) {
    let text = c.text;
    let visibility = 'public';
    const warn = h('small', { class: 'rz-warn', hidden: !needsRewrite(c, text) }, 'Still close to the source: put it in your own words before approving.');
    const ok = h('button', { class: 'btn btn-xs btn-primary', disabled: needsRewrite(c, text), onclick: () => {
      try { approve(tipsDoc, c.id, { text, visibility, by: signedName() }); store('Approved: it’s in the library now'); } catch (err) { toast(err.message); }
    } }, 'Approve');
    return h('li', { class: 'rz-panel rz-cand', style: `--t:${THEME_TONE[c.theme] ?? '#56657f'}` },
      h('header', {}, ThemePill(c.theme), h('span', { class: `rz-kind ${c.kind}` }, c.kind === 'excerpt' ? 'Excerpt: rewrite' : 'From the registry'), h('small', {}, `Score ${c.score}`),
        h('small', {}, 'After ', harvestSourceById[c.source]?.url ? ext(harvestSourceById[c.source].url, sourceLabel(c.source)) : sourceLabel(c.source))),
      h('textarea', { class: 'textarea textarea-bordered', rows: 2, oninput: (e) => { text = e.target.value; const bad = needsRewrite(c, text); warn.hidden = !bad; ok.disabled = bad; } }, c.text),
      warn,
      h('div', { class: 'rz-actions' },
        h('select', { class: 'select select-bordered select-xs', onchange: (e) => { visibility = e.target.value; } }, h('option', { value: 'public' }, 'Public'), h('option', { value: 'private' }, 'Private')),
        ok,
        h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { reject(tipsDoc, c.id); store('Rejected'); } }, 'Reject')));
  }
}
const signedName = () => org.staff?.[Object.keys(org.staff ?? {}).find((k) => org.staff[k].userId)]?.name ?? null;

/* --------------------------------------------------------------- about */

let helpDoc = null;
loadHelp().then(({ doc: hd }) => { helpDoc = hd.sections.find((s) => s.id === RHIZOME_HELP_ID) ?? RHIZOME_HELP; if (route()[0] === 'about') render(); }).catch(() => { helpDoc = RHIZOME_HELP; });
const helpHref = (pageId) => `help.html#${RHIZOME_HELP_ID}/${pageId}`;

/** About: an immediate reference beside the work, and the same tutorials as Help. */
function About(arg) {
  // A help library saved before a page was added still gets the new built-in pages.
  const saved = helpDoc ?? RHIZOME_HELP;
  const missing = RHIZOME_HELP.pages.filter((p) => !saved.pages.some((x) => x.id === p.id));
  const section = missing.length ? { ...saved, pages: [...missing.filter((p) => p.id === 'rhizome-how'), ...saved.pages, ...missing.filter((p) => p.id !== 'rhizome-how')] } : saved;
  const page = section.pages.find((p) => p.id === arg) ?? null;
  setCrumbs(page ? [{ label: page.title }] : []);
  const flow = [['Facts', 'Everything your plugins know, as things and ties', 'sec-rhizome'], ['Measures', 'Numbers over the facts, calibrated to you', 'chart'], ['Rules', 'When, weigh, say, show', 'spark'], ['Findings', 'Ranked tips, each with a Why?', 'check']];
  const ref = (title, rows) => h('section', { class: 'rz-panel' }, h('h3', {}, title), h('dl', { class: 'rz-ref' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  return h('div', { class: 'rz-page' }, tabs('about'),
    h('div', { class: 'rz-intro' },
      h('h2', {}, 'What Rhizome does'),
      h('p', {}, 'Rhizome reads your maps, strategy, studio and assets as one set of facts, measures the links between them, and runs rules that offer tips you can act on. It works offline and never changes another plugin. Like a rhizome’s roots, it follows the connections in every direction.')),
    h('ol', { class: 'rz-flow' }, flow.map(([t, d, ic], i) => h('li', {}, h('span', {}, icon(ic, 16)), h('b', {}, t), h('small', {}, d), i < flow.length - 1 ? h('i', { 'aria-hidden': 'true' }, '→') : null))),
    page
      ? h('article', { class: 'rz-panel rz-help' }, h('header', { class: 'rz-ahead' }, h('h3', {}, page.title), h('a', { class: 'btn btn-xs btn-outline', href: helpHref(page.id) }, 'Open in Help')), Markdown(page.body, { embeds: ['shot'], embed: ({ id }) => HELP_SHOTS[id] ? h('figure', { class: 'rz-shot' }, h('img', { src: `media/help/${id}.jpg`, alt: HELP_SHOTS[id], loading: 'lazy' }), h('figcaption', {}, HELP_SHOTS[id])) : null }),
        h('a', { class: 'rz-back', href: '#about' }, '← Quick reference'))
      : h('div', { class: 'rz-stack' },
        h('a', { class: 'rz-panel rz-how', href: '#about/rhizome-how' },
          h('div', {}, h('h3', {}, 'How Rhizome thinks'), h('p', { class: 'rz-note' }, 'What happens between your data and a tip, how a question is built out of modules (with examples), what every module does, and how this fits with modern AI such as Claude.'), h('span', { class: 'rz-how-go' }, 'Read the introduction →')),
          h('ol', { class: 'rz-sentence', 'aria-label': 'A graph question, as modules' }, [['Which things', 'Facts · Measure'], ['that meet conditions', 'Filter · Gate'], ['ranked by', 'Weigh'], ['and so…', 'Say']].map(([w, m]) => h('li', {}, h('b', {}, w), h('small', {}, m))))),
        h('div', { class: 'rz-two' },
        h('div', { class: 'rz-stack' },
          ref('The tabs', [['Home', 'Your welcome report and the signals worth a look'], ['Analyses', 'Canned analyses, your set, findings with Why?, every rule'], ['Lab', 'Experiments: the console and patch packs, the rack, communities, brokers, ties worth making, shape checks, a hive plot'], ['Facts', 'Every thing Rhizome knows, and its ties'], ['Measures', 'The network actor by actor, your calibration, the ABCD balance'], ['Set-up', 'Your context profile and the set-up steps'], ['About', 'This page']]),
          ref('Words you’ll see', [['Single point of failure', 'An actor whose loss splits its network'], ['Hub', 'Top 10% for links, for your organisation'], ['Betweenness', 'How often an actor sits on the shortest way between two others'], ['One-way flow', 'Resources, information or power with nothing coming back'], ['Zone gap', 'A part of a lens with nobody in it, or zones that never link'], ['Calibration', 'Cut-offs from your own data, so “few” means few for you']]),
          ref('A rule has four parts', [['When', 'What it looks for'], ['Weigh', 'A score from 0 to 1, for ranking'], ['Say', 'A tip from the library, with names filled in'], ['Show', 'On the map, or as a list']])),
        h('div', { class: 'rz-stack' },
          h('section', { class: 'rz-panel' }, h('h3', {}, 'Tutorials'), h('p', { class: 'rz-note' }, 'The same pages are in Help, under Rhizome.'),
            h('ul', { class: 'rz-tutorials' }, section.pages.map((p) => h('li', {}, h('a', { href: `#about/${p.id}` }, icon('book', 15), p.title), h('a', { class: 'rz-out', href: helpHref(p.id), title: 'Open in Help' }, 'Help'))))),
          h('section', { class: 'rz-panel' }, h('h3', {}, 'Your data'), h('p', { class: 'rz-note' }, 'Rhizome only reads the plugins you can open. Everything runs in your browser. Nothing is sent anywhere. Only your instance (profile, baseline, runs and dismissals) is saved, in your organisation’s Rhizome document.')),
          h('section', { class: 'rz-panel' }, h('h3', {}, 'Where the tips come from'), h('ul', { class: 'rz-sourcelist' }, Object.values(SOURCES).map((s) => h('li', {}, s))))))));
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
    // replaceChildren turns null into the text "null" (unlike h()), so leave the note out rather than pass null.
    const rows = found.map((e) => h('li', { class: e.id === focus ? 'on' : '' },
      h('a', { href: `#facts/${encodeURIComponent(e.id)}` }, h('b', {}, e.name), h('small', {}, subOf(e)))));
    if (found.length === 300) rows.push(h('li', { class: 'rz-more' }, 'Showing the first 300. Narrow it with a type or a search.'));
    if (!found.length) rows.push(h('li', { class: 'rz-more' }, 'Nothing matches that.'));
    listBox.replaceChildren(...rows);
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
  const val = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v && typeof v === 'object' && 'lat' in v ? `${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} (${v.precision})` : String(v));
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
