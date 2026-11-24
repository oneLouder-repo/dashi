import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Drawer } from '../ui/drawer.js';
import { uiConfirm } from '../ui/dialog.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadTeach, loadLearn, loadPodcasts, loadAssets } from '../platform/docs.js';
import { blankLearn } from '../learning/records.js';
import { AUDIENCES, MODES, audienceOf, audienceLabel, addOffer, removeOffer, offersOf, rosterFor, courseSummary, STATUS_LABEL } from '../learning/distribution.js';
import { ROLES, teamList } from '../platform/org.js';
import { enabledPlugins, linkTo, currentWho } from '../plugins.js';
import {
  BLOCK_TYPES, BLOCK_GROUPS, TRACK_KINDS, KINDS, blockType, trackKind, kindLabel, blankCartridge, addBlock, updateBlock, removeBlock, duplicateBlock,
  addTrack, updateTrack, removeTrack, moveTrack, addPace, updatePace, removePace, updateCartridge, publish, unpublish, phases, dateOf, dayOf, shortDate,
  pathByWeek, weekLoad, cartridgeStats, exportCartridge, importCartridge, weekOf, weekLabel,
  ROOM, lessonSections, STREAM_TEMPLATES, applyStream, linkStream, updateStream, unlinkBlock, dissolveStream, removeStream, streamBlocks, streamToTemplate, addToStream, STREAM_TONES,
} from '../learning/cartridge.js';
import { runChecks, canPublish, LEVELS, RULES, ruleLabel, udlBalance, issuesFor } from '../learning/checks.js';
import { TEMPLATES, createBoard, templateLabel } from '../learning/collab.js';
import { About } from '../learning/About.js';
import { Timeline, ZOOMS, HEAD_WIDTH } from './Timeline.js';
import { WHEEL } from '../ui/wheel.js';
import { Markdown } from '../ui/markdown.js';

/**
 * Teach (eLearning stage 1, experimental): the cartridge editor. A DAW
 * turned towards a calendar: tracks of blocks on a timeline of course days.
 *
 *   #home                  every cartridge
 *   #new                   start a new one
 *   #c/<id>                the timeline, with the checks beside it
 *   #c/<id>/path           the learner's-eye outline, week by week
 *   #c/<id>/checks         every check, with why it matters
 *   #c/<id>/people         who it's shared with, and where each learner is
 *   #people                every course shared out: reached, joined, finished, overdue
 *   #blocks                the block types, what each is for
 *   #about                 quick reference and tutorials
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'teach', org });
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');
app.classList.add('frame', 'tc-app');
let side = h('nav');
const main = h('section', { class: 'palette-main tc-main' });
app.replaceChildren(side, main);

const canEdit = canWriteDoc('teach');
let doc = loadTeach();
const podcasts = plugins.has('podcasts') ? loadPodcasts() : null;
const assets = plugins.has('assets') ? loadAssets() : null;
/** Learn's records, read-only here, for who has joined and how far they are. */
const learn = plugins.has('learn') ? loadLearn() : blankLearn();
const me = currentWho(org).staffId;
const today = new Date().toISOString().slice(0, 10);
const ZOOM_KEY = 'dashi.teach-zoom';
let zoom = (() => { try { return localStorage.getItem(ZOOM_KEY) || 'fit'; } catch { return 'fit'; } })();
let selected = null;
let drawer = null;
/** Blocks picked with Shift-click, to link into a stream. */
let picked = new Set();
const TRAY_KEY = 'dashi.teach-tray';
const trayOn = () => { try { return localStorage.getItem(TRAY_KEY) !== '0'; } catch { return true; } };
function toggleTray() { try { localStorage.setItem(TRAY_KEY, trayOn() ? '0' : '1'); } catch { /* fine */ } render(); }
const templates = () => [...STREAM_TEMPLATES, ...Object.values(doc.streamTemplates ?? {})];

const route = () => {
  const raw = location.hash.slice(1) || 'home';
  const parts = raw.split('/').map(decodeURIComponent);
  return parts;
};
const cartridges = () => Object.values(doc.cartridges ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
const save = (note) => { saveDoc('teach', doc); if (note) toast(note); };
function setCartridge(c, note) {
  doc = { ...doc, cartridges: { ...doc.cartridges, [c.id]: c } };
  save(note);
}
const n = (k, word, plural = `${word}s`) => `${k} ${k === 1 ? word : plural}`;

function render() {
  const [view, id, sub] = route();
  drawSide(view, id, sub);
  if (view === 'new') return newCartridge();
  let page;
  if (view === 'c' && doc.cartridges[id]) page = sub === 'path' ? PathPage(doc.cartridges[id]) : sub === 'checks' ? ChecksPage(doc.cartridges[id]) : sub === 'people' ? LearnersPage(doc.cartridges[id]) : TimelinePage(doc.cartridges[id]);
  else if (view === 'people') page = PeoplePage();
  else if (view === 'blocks') page = BlocksPage();
  else if (view === 'about') page = h('div', { class: 'lx-wrap' }, tabs('about'), About({ arg: id, title: 'What Teach does', rerender: render,
    intro: 'Teach is where you make learning: courses, workshops, professional development and open offerings, each as a cartridge. A cartridge lays out tracks of blocks on a timeline of course days, like a song in a music editor, and checks itself for accessibility and good design as you work. Learners take it in Learn.',
    refs: [
      ['Words you’ll see', [['Cartridge', 'One course, workshop or module, ready to run again'], ['Track', 'A lane of blocks: content, live, assessment, dialogue, comms'], ['Block', 'One thing to do: a lesson, a show, a live session, a quiz'], ['Day 0', 'The start. Blocks sit on course days, so a run can move'], ['Run', 'A cartridge on real dates, for one cohort'], ['Pace note', 'What happens when, for learners or teachers']]],
      ['On the timeline', [['Drag a block', 'Move it to another day or track'], ['Drag its right edge', 'Make it longer'], ['Click it', 'Edit it in the drawer'], ['Arrow keys', 'Move a picked block a day; with Shift, stretch it'], ['Load meter', 'Hours a week, against what you promised'], ['Dot on a block', 'A check to look at: red must be fixed before publishing']]],
    ],
    data: 'Cartridges live in your organisation’s Teach document. Slideshows, episodes and assets are linked, never copied. Teach checks the design, never the learners.' }));
  else page = Home();
  main.replaceChildren(page);
}

function drawSide(view, id, id2) {
  const list = cartridges();
  side = swapSide(side, SideNav({ label: 'Teach', sections: [
    { title: 'Teach · experimental', items: [
      { label: 'Cartridges', sub: `${n(list.length, 'cartridge')} · ${list.filter((c) => c.status === 'published').length} published`, icon: 'tiles', href: '#home', on: view === 'home' },
      { label: 'Learners', sub: `${n(Object.keys(doc.offers ?? {}).length, 'share')} · who’s taking what`, icon: 'users', href: '#people', on: view === 'people' },
      { label: 'Block types', sub: `${BLOCK_TYPES.length} kinds of block`, icon: 'listBullets', href: '#blocks', on: view === 'blocks' },
      { label: 'About', sub: 'Quick reference and tutorials', icon: 'help', href: '#about', on: view === 'about' },
    ] },
    view === 'c' && doc.cartridges[id] && !id2 && { title: 'Tools', items: [
      { label: 'Tool tray', sub: trayOn() ? 'Showing · click to hide' : 'Hidden · click to show', icon: 'tiles', onclick: toggleTray },
      { label: 'Streams', sub: `${n(Object.keys(doc.cartridges[id].streams ?? {}).length, 'stream')} · Shift-click blocks to link`, icon: 'link', onclick: () => { if (!trayOn()) toggleTray(); paletteTab = 'streams'; render(); } },
    ] },
    list.length && { title: 'Your cartridges', items: list.map((c) => ({ label: c.title, sub: `${kindLabel(c.kind)} · ${c.status === 'published' ? `v${c.version}` : 'draft'}`, icon: 'sec-teach', href: `#c/${c.id}`, on: view === 'c' && id === c.id })) },
    { title: 'Elsewhere in Dashi', items: [
      { label: 'Learn', sub: 'Take a course as a learner', icon: 'sec-learn', href: linkTo('learn', '#home') },
      { label: 'Studio', sub: 'Make slideshow podcasts', icon: 'mic', href: linkTo('podcasts', '#studio') },
    ] },
    { title: 'Coming next', items: [
      { label: 'Convene', sub: 'Run a cartridge for a cohort', icon: 'users' },
      { label: 'Lyceum', sub: 'Share cartridges across Dashi', icon: 'globe' },
    ] },
  ].filter(Boolean) }));
}

const tabs = (current) => PluginHeader('teach', {
  tabs: [{ id: 'home', label: 'Cartridges', icon: 'tiles' }, { id: 'people', label: 'Learners', icon: 'users' }, { id: 'blocks', label: 'Block types', icon: 'listBullets' }, { id: 'about', label: 'About', icon: 'help' }],
  current,
});

/* ------------------------------------------------------------------ home */

function Home() {
  setCrumbs([]);
  const list = cartridges();
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async () => {
    const f = input.files?.[0];
    if (!f) return;
    try { const c = importCartridge(await f.text()); setCartridge(c, `Imported “${c.title}”`); location.hash = `#c/${c.id}`; } catch (e) { toast(e.message, 'error'); }
  } });
  return h('div', { class: 'lx-wrap' }, tabs('home'),
    h('div', { class: 'tc-toolbar' },
      h('p', { class: 'lx-note' }, 'A cartridge is one course, workshop or module: tracks of blocks on a timeline of course days. Open one to edit it, or start a new one.'),
      h('span', { class: 'tc-grow' }),
      canEdit && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => input.click() }, icon('upload', 14), 'Import'), input,
      canEdit && h('a', { class: 'btn btn-sm btn-primary', href: '#new' }, icon('plus', 14), 'New cartridge')),
    list.length ? h('div', { class: 'tc-cards' }, list.map(Card)) : h('p', { class: 'lx-note' }, 'No cartridges yet.'));
}

/** A cartridge card: a little picture of its timeline, so each looks like itself. */
function Card(c) {
  const ph = phases(c);
  const from = ph[0].from;
  const days = ph.at(-1).to - from;
  const st = cartridgeStats(c);
  const issues = runChecks(c);
  const mustFix = issues.filter((i) => i.level === 'block').length;
  const mini = h('div', { class: 'tc-mini', 'aria-hidden': 'true' },
    h('i', { class: 'tc-mini-session', style: `left:${(-from / days) * 100}%;width:${(c.span.length / days) * 100}%` }),
    c.tracks.map((t, r) => Object.values(c.blocks).filter((b) => b.trackId === t.id).map((b) => h('b', { style: `left:${((b.start - from) / days) * 100}%;width:${Math.max(1.2, (b.length / days) * 100)}%;top:${6 + r * 9}px;background:${t.tone}` }))));
  return h('a', { class: 'tc-card', href: `#c/${c.id}` }, mini,
    h('div', { class: 'tc-card-body' },
      h('span', { class: `tc-status s-${c.status}` }, c.status === 'published' ? `Published · v${c.version}` : 'Draft'),
      h('h3', {}, c.title),
      c.subtitle && h('p', { class: 'tc-sub' }, c.subtitle),
      h('p', { class: 'tc-meta' }, `${kindLabel(c.kind)} · ${c.pacing === 'self' ? 'self-paced' : `starts ${shortDate(c.run.start)} ${c.run.start.slice(0, 4)}`} · ${st.weeks} weeks · ${n(st.blocks, 'block')}`),
      c.status === 'published' && CardReach(c),
      h('p', { class: `tc-checks${mustFix ? ' bad' : ''}` }, icon(mustFix ? 'warn' : 'check', 13), mustFix ? `${n(mustFix, 'thing')} to fix before publishing` : issues.length ? `${n(issues.length, 'idea')} from the checks` : 'All checks pass')));
}

function newCartridge() {
  if (!canEdit) { location.hash = '#home'; return; }
  const c = blankCartridge({ title: 'New cartridge', by: me });
  setCartridge(c, 'New cartridge made');
  history.replaceState(null, '', `#c/${c.id}`);
  render();
  openSettings(c.id);
}

/* -------------------------------------------------------------- timeline */

function CartridgeBar(c, current) {
  const issues = runChecks(c);
  const ok = canPublish(issues);
  const preview = linkTo('learn', `#preview/${c.id}`);
  return h('div', { class: 'tc-bar' },
    h('div', { class: 'tc-bar-title' },
      h('h2', {}, c.title),
      h('small', {}, `${kindLabel(c.kind)} · ${c.pacing === 'self' ? 'self-paced, from each learner’s start' : `day 0 is ${c.run.start}`} · ${c.status === 'published' ? `published v${c.version}` : 'draft'}`)),
    h('nav', { class: 'tc-seg', 'aria-label': 'Cartridge views' },
      [['', 'Timeline', 'timeline'], ['path', 'Path', 'listNumbers'], ['checks', `Checks${issues.length ? ` (${issues.length})` : ''}`, 'checklist'], ['people', 'Learners', 'users']].map(([s, label, ic]) =>
        h('a', { href: `#c/${c.id}${s ? `/${s}` : ''}`, class: current === s ? 'on' : '', 'aria-current': current === s ? 'page' : null }, icon(ic, 14), label))),
    h('span', { class: 'tc-grow' }),
    current === '' && h('div', { class: 'tc-seg tc-zoom', role: 'group', 'aria-label': 'Zoom' }, ZOOMS.map((z) => h('button', { type: 'button', class: zoom === z.id ? 'on' : '', 'aria-pressed': String(zoom === z.id), onclick: () => { zoom = z.id; try { localStorage.setItem(ZOOM_KEY, zoom); } catch { /* fine */ } render(); } }, z.label))),
    preview && h('a', { class: 'btn btn-sm', href: preview, title: 'See it as a learner will' }, icon('eye', 14), 'Preview'),
    canEdit && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openSettings(c.id) }, icon('settings', 14), 'Settings'),
    canEdit && (c.status === 'published'
      ? h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: !ok, title: ok ? 'Publish your changes as a new version' : 'Fix the red checks first', onclick: () => { setCartridge(publish(c, me), `Published version ${c.version + 1}`); render(); } }, icon('upload', 14), 'Publish changes')
      : h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: !ok, title: ok ? 'Learners can take it once published' : 'Fix the red checks first', onclick: () => { setCartridge(publish(c, me), 'Published: learners can take it in Learn'); render(); } }, icon('upload', 14), 'Publish')));
}

function TimelinePage(c) {
  setCrumbs([]);
  const issues = runChecks(c);
  const days = c.span.pre + c.span.length + c.span.post + 2 * ROOM;
  // Fit: the whole run in the window, from pre-start to post-end.
  const wide = main.clientWidth || 1100;
  const asideW = wide > 1500 ? 314 : 0;
  const fit = Math.max(8, Math.floor((wide - 60 - asideW - HEAD_WIDTH - 4) / days));
  const ppd = ZOOMS.find((z) => z.id === zoom)?.ppd ?? fit;
  const tl = Timeline({
    cartridge: c, issues, ppd, today, selected, canEdit, picked,
    onPick: (id) => { if (picked.has(id)) picked.delete(id); else picked.add(id); render(); },
    onStream: (sid) => openStream(c.id, sid),
    onAddStream: ({ tplId, start }) => dropStream(c.id, tplId, start),
    onChange: (next, id) => { selected = id; setCartridge(next); render(); },
    onOpen: (id) => { selected = id; render(); openBlock(c.id, id); },
    onAdd: ({ type, trackId, start }) => add(c.id, { type, trackId, start }),
    onPace: (pid, day) => (pid ? openPace(c.id, pid) : add(c.id, null, day)),
    onTrack: (tid, what) => {
      if (what === 'mute') { const t = c.tracks.find((x) => x.id === tid); setCartridge(updateTrack(c, tid, { muted: !t.muted }), t.muted ? `${t.name} shows to learners` : `${t.name} hidden from learners`); render(); }
      else openTrack(c.id, tid);
    },
  });
  for (const id of picked) if (!c.blocks[id]) picked.delete(id);
  const pickBar = canEdit && picked.size > 0 && h('div', { class: 'tc-pickbar', role: 'status' },
    icon('link', 14), h('span', {}, `${n(picked.size, 'block')} picked`),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: picked.size < 2, title: picked.size < 2 ? 'Pick at least two' : 'They’ll move together', onclick: () => {
      const r = linkStream(doc.cartridges[c.id], [...picked]);
      picked = new Set();
      setCartridge(r.cartridge, 'Linked into a stream: drag any of them to move them all');
      render();
      if (r.id) openStream(c.id, r.id);
    } }, 'Link into a stream'),
    h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { picked = new Set(); render(); } }, 'Clear'),
    h('small', {}, 'Shift-click blocks to pick more. Esc clears.'));
  return h('div', { class: 'lx-wrap tc-wide' }, tabs('home'),
    CartridgeBar(c, ''),
    pickBar,
    h('div', { class: 'tc-work' },
      h('div', { class: 'tc-stage' }, tl, canEdit && trayOn() && Palette(c)),
      ChecksAside(c, issues)));
}

function add(cid, block, paceDay) {
  const c = doc.cartridges[cid];
  if (block === null) {
    const old = new Set((c.pace ?? []).map((p) => p.id));
    const next = addPace(c, paceDay);
    setCartridge(next, 'Pace note added');
    render();
    openPace(cid, next.pace.find((p) => !old.has(p.id))?.id);
    return;
  }
  const { cartridge, id } = addBlock(c, block);
  selected = id;
  setCartridge(cartridge, `${blockType(block.type).label} added`);
  render();
  openBlock(cid, id);
}

/** Drop a stream template into a cartridge at a day: its blocks, linked. */
function dropStream(cid, tplId, start) {
  const tpl = templates().find((t) => t.id === tplId);
  if (!tpl) return;
  const r = applyStream(doc.cartridges[cid], tpl, start);
  setCartridge(r.cartridge, `${tpl.name} added: ${n(tpl.blocks.length, 'block')}, linked`);
  render();
}

/** Tools for the tray. Mocked for now: each says what it will do. */
const TRAY_TOOLS = [
  { id: 'spread', label: 'Even out the weeks', icon: 'sliders', blurb: 'Nudge blocks so no week runs over the hours you promised.' },
  { id: 'access', label: 'Accessibility pass', icon: 'eye', blurb: 'Walk through every block missing captions, alt text or a reading version.' },
  { id: 'quizgen', label: 'Draft a quiz from a lesson', icon: 'sparkle', blurb: 'With the AI plugin: questions drafted from a lesson’s words, for you to edit.' },
  { id: 'cohort', label: 'Clone for a new cohort', icon: 'copy', blurb: 'The same cartridge, a new start date, a fresh run in Convene.' },
  { id: 'import', label: 'Import a Common Cartridge', icon: 'upload', blurb: 'Bring in a course from Moodle, Canvas or Brightspace.' },
  { id: 'align', label: 'Map to competencies', icon: 'target', blurb: 'See which blocks build which skill, and where the gaps are.' },
];

/** The tool tray: a floating, draggable panel (the Plan designer's tool panel) with blocks, streams and tools. */
const PAL_KEY = 'dashi.teach-palette';
let paletteTab = 'blocks';
function Palette(c) {
  let pos = { x: null, y: 430, folded: false };
  try { pos = { ...pos, ...JSON.parse(localStorage.getItem(PAL_KEY) ?? '{}') }; } catch { /* fine */ }
  const keep = () => { try { localStorage.setItem(PAL_KEY, JSON.stringify(pos)); } catch { /* fine */ } };
  // Never under the plugin bar: the panel's top stays below the header, even if it was left over it.
  const minTop = () => Math.ceil((document.querySelector('#shell')?.getBoundingClientRect().bottom ?? 60) + 8);
  const panel = h('aside', { class: `tc-palette${pos.folded ? ' folded' : ''}`, 'aria-label': 'Tool tray' });
  const place = () => {
    pos.y = Math.max(minTop(), Math.min(innerHeight - 60, pos.y));
    if (pos.x != null) { pos.x = Math.max(0, Math.min(innerWidth - 120, pos.x)); panel.style.left = `${pos.x}px`; panel.style.right = 'auto'; }
    panel.style.top = `${pos.y}px`;
  };
  place();
  requestAnimationFrame(place);
  const head = h('header', { class: 'tc-pal-head' }, icon('dragHandle', 14), h('b', {}, 'Tool tray'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': pos.folded ? 'Open the tray' : 'Fold the tray', onclick: () => { pos.folded = !pos.folded; panel.classList.toggle('folded', pos.folded); keep(); } }, icon(pos.folded ? 'chevronDown' : 'chevronUp', 14)),
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Hide the tray (Tools in the side nav brings it back)', title: 'Hide the tray', onclick: toggleTray }, icon('close', 13)));
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev) => { pos.x = ev.clientX - dx; pos.y = ev.clientY - dy; place(); };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); keep(); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
  const todayDay = Math.max(0, Math.min(c.span.length - 1, dayOf(c.run.start, today)));
  const tabBar = h('div', { class: 'tc-pal-tabs', role: 'tablist' }, [['blocks', 'Blocks'], ['streams', 'Streams'], ['tools', 'Tools']].map(([id, label]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(paletteTab === id), class: paletteTab === id ? 'on' : '', onclick: () => { paletteTab = id; panel.replaceWith(Palette(c)); } }, label)));
  let body;
  if (paletteTab === 'streams') {
    body = h('div', { class: 'tc-pal-body' },
      h('p', { class: 'tc-pal-tip' }, 'A stream is blocks linked to move together. Drag one onto a track, or click to add it on today. Shift-click blocks on the timeline to make your own.'),
      templates().map((tpl) => {
        const card = h('button', { type: 'button', class: 'tc-pal-stream', draggable: 'true', title: tpl.blurb,
          onclick: () => dropStream(c.id, tpl.id, todayDay) },
        h('b', {}, tpl.name, !tpl.builtIn && h('span', { class: 'tc-new' }, 'Yours')),
        h('span', { class: 'tc-pal-seq', 'aria-hidden': 'true' }, tpl.blocks.map((b) => { const t = blockType(b.type); return h('i', { style: `--tone:${trackKind(t.track).tone}`, title: t.label }, icon(t.icon, 11)); })),
        h('small', {}, tpl.blurb || `${n(tpl.blocks.length, 'block')}`));
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-dashi-stream', tpl.id); e.dataTransfer.effectAllowed = 'copy'; });
        return card;
      }));
  } else if (paletteTab === 'tools') {
    body = h('div', { class: 'tc-pal-body' },
      h('p', { class: 'tc-pal-tip' }, 'Coming tools, shown so you can see where Teach is going.'),
      h('ul', { class: 'tc-pal-tools' }, TRAY_TOOLS.map((t) => h('li', {}, h('button', { type: 'button', onclick: () => toast(`${t.label} is coming: ${t.blurb}`) },
        icon(t.icon, 14), h('span', {}, h('b', {}, t.label), h('small', {}, t.blurb)), h('span', { class: 'tc-soon' }, 'Soon'))))));
  } else {
    body = h('div', { class: 'tc-pal-body' },
      h('p', { class: 'tc-pal-tip' }, 'Drag onto a track, or click to add.'),
      BLOCK_GROUPS.map((g) => h('section', {}, h('h4', {}, g),
        BLOCK_TYPES.filter((t) => t.group === g).map((t) => {
          const tone = trackKind(t.track).tone;
          const item = h('button', { type: 'button', class: `tc-pal-item${t.preview ? ' new' : ''}`, draggable: 'true', style: `--tone:${tone}`, title: `${t.blurb}${t.preview ? ' (new: a preview for now)' : ''}`,
            onclick: () => add(c.id, { type: t.id, start: todayDay }) },
          icon(t.icon, 14), h('span', {}, t.label), t.preview && h('i', { class: 'tc-new-dot', 'aria-label': 'new' }));
          item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-dashi-block', t.id); e.dataTransfer.effectAllowed = 'copy'; });
          return item;
        }))));
  }
  panel.append(head, tabBar, body);
  return panel;
}

/** A stream's drawer: name and colour, its blocks, save as a template, unlink. */
function openStream(cid, sid) {
  const draw = () => {
    const c = doc.cartridges[cid];
    const st = c?.streams?.[sid];
    if (!st) { drawer?.close(); return h('div'); }
    const bs = streamBlocks(c, sid);
    const set = (patch, note) => { setCartridge(updateStream(doc.cartridges[cid], sid, patch), note); render(); drawer?.setBody(draw()); };
    const nearby = Object.values(c.blocks).filter((b) => !b.streamId).sort((a, b) => a.start - b.start);
    return h('div', { class: 'lx-form' },
      field('Name', text(st.name, (v) => set({ name: v || 'Stream' }))),
      field('Colour', h('div', { class: 'tc-swatches' }, STREAM_TONES.map((tone) => h('button', { type: 'button', class: `tc-swatch${tone === st.tone ? ' on' : ''}`, style: `background:${tone}`, 'aria-label': 'Use this colour', 'aria-pressed': String(tone === st.tone), disabled: !canEdit, onclick: () => set({ tone }) })))),
      h('section', { class: 'lx-field' }, h('span', {}, `Blocks in it (${bs.length})`),
        h('ol', { class: 'tc-stream-list' }, bs.map((b) => {
          const t = blockType(b.type);
          const tr = c.tracks.find((x) => x.id === b.trackId);
          return h('li', { style: `--tone:${tr?.tone ?? '#999'}` },
            h('span', { class: 'tc-stream-ic' }, icon(t.icon, 13)),
            h('button', { type: 'button', class: 'tc-linkish', onclick: () => openBlock(cid, b.id) }, h('b', {}, b.title), h('small', {}, `${t.label} · ${shortDate(dateOf(c.run.start, b.start))} · ${tr?.name ?? ''}`)),
            canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs', title: 'Take it out of the stream', onclick: () => { setCartridge(unlinkBlock(doc.cartridges[cid], b.id), 'Unlinked'); render(); drawer?.setBody(draw()); } }, icon('close', 12), 'Unlink'));
        })),
        canEdit && nearby.length > 0 && h('div', { class: 'lx-row' }, field('Add a block', h('select', { class: 'select select-sm', onchange: (e) => { if (e.target.value) { setCartridge(addToStream(doc.cartridges[cid], sid, e.target.value), 'Added to the stream'); render(); drawer?.setBody(draw()); } } },
          h('option', { value: '' }, '— pick a block —'), nearby.map((b) => h('option', { value: b.id }, `${b.title} (${shortDate(dateOf(c.run.start, b.start))})`)))))),
      h('p', { class: 'lx-note' }, 'Drag any block in a stream and the rest come with it. Hold Alt (Option) to move one on its own.'),
      canEdit && h('div', { class: 'lx-row' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => {
          const tpl = streamToTemplate(doc.cartridges[cid], sid);
          doc = { ...doc, streamTemplates: { ...(doc.streamTemplates ?? {}), [tpl.id]: tpl } };
          save(`“${tpl.name}” saved: find it under Streams in the tool tray`);
          render();
        } }, icon('download', 14), 'Save as a template'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { setCartridge(dissolveStream(doc.cartridges[cid], sid), 'Unlinked: the blocks stay'); drawer?.close(); render(); } }, icon('link', 14), 'Unlink all'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (await uiConfirm(`Remove “${st.name}” and its ${bs.length} blocks?`, { ok: 'Remove', danger: true })) { setCartridge(removeStream(doc.cartridges[cid], sid), 'Stream removed'); drawer?.close(); render(); } } }, icon('trash', 14), 'Remove with its blocks')));
  };
  const st = doc.cartridges[cid]?.streams?.[sid];
  if (!st) return;
  openDrawer({ title: st.name, sub: 'A stream of linked blocks', lead: h('span', { class: 'tc-lead', style: `background:${st.tone}` }, icon('link', 18)), actions: [h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => drawer?.close() }, 'Done')] });
  drawer.setBody(draw());
}

/* Esc clears picked blocks. */
addEventListener('keydown', (e) => { if (e.key === 'Escape' && picked.size && !document.querySelector('dialog[open]')) { picked = new Set(); render(); } });

function ChecksAside(c, issues) {
  const counts = Object.fromEntries(LEVELS.map((l) => [l.id, issues.filter((i) => i.level === l.id).length]));
  const udl = udlBalance(c);
  const max = Math.max(1, udl.engage, udl.represent, udl.express);
  return h('aside', { class: 'tc-aside', 'aria-label': 'Checks' },
    h('section', { class: 'lx-panel' },
      h('h3', {}, icon('checklist', 15), 'Checks'),
      h('div', { class: 'tc-counts' }, LEVELS.map((l) => h('span', { class: `l-${l.id}` }, h('b', {}, counts[l.id]), l.id === 'block' ? 'to fix' : l.id === 'warn' ? 'worth fixing' : 'ideas'))),
      issues.length ? h('ul', { class: 'tc-issues' }, issues.slice(0, 8).map(Issue(c))) : h('p', { class: 'lx-note' }, 'Everything checks out.'),
      issues.length > 8 && h('a', { class: 'lx-more', href: `#c/${c.id}/checks` }, `All ${issues.length} checks →`)),
    h('section', { class: 'lx-panel' },
      h('h3', {}, icon('target', 15), 'UDL balance'),
      h('p', { class: 'lx-note' }, 'Blocks serving each principle of Universal Design for Learning.'),
      h('div', { class: 'tc-udl' }, [['engage', 'Engagement', 'why: belonging, choice, reflection'], ['represent', 'Representation', 'what: many ways to take it in'], ['express', 'Action and expression', 'how: many ways to show it']].map(([k, label, sub]) =>
        h('div', {}, h('span', {}, h('b', {}, label), h('small', {}, sub)), h('i', { style: `--w:${(udl[k] / max) * 100}%` }), h('em', {}, udl[k]))))));
}
const Issue = (c) => (i) => h('li', { class: `l-${i.level}` },
  h('i', { class: `tc-lvl l-${i.level}`, 'aria-label': LEVELS.find((l) => l.id === i.level).label }),
  i.blockId ? h('a', { href: `#c/${c.id}`, onclick: (e) => { e.preventDefault(); selected = i.blockId; if (route()[2]) { pendingOpen = [c.id, i.blockId]; location.hash = `#c/${c.id}`; } else { render(); openBlock(c.id, i.blockId); } } }, i.title) : h('span', {}, i.title));

/* ------------------------------------------------------------ path, checks */

/* The path as a mixing desk: each week is a channel strip, with a master strip at the end. */
const WAYS = [['text', 'Read'], ['audio', 'Listen'], ['visual', 'Watch'], ['live', 'Live'], ['hands-on', 'Do']];
const PRES = [['teaching', 'T', 'Teaching'], ['social', 'S', 'Social'], ['reflective', 'R', 'Reflective']];
const ALT_WAY = { transcript: 'text', captions: 'text', reading: 'text', audio: 'audio' };
const hrs = (min) => `${Math.round(min / 6) / 10} h`;

function weekProfile(c, blocks, issues) {
  const muted = new Set(c.tracks.filter((t) => t.muted).map((t) => t.id));
  const live = blocks.filter((b) => !muted.has(b.trackId));
  const ways = new Set(live.flatMap((b) => [...blockType(b.type).modes, ...(b.alts ?? []).map((a) => ALT_WAY[a])]).filter(Boolean));
  const pres = new Set(live.flatMap((b) => blockType(b.type).presence));
  const ids = new Set(blocks.map((b) => b.id));
  return {
    minutes: live.reduce((k, b) => k + (Number(b.minutes) || 0), 0),
    ways, pres,
    required: live.filter((b) => b.required !== false).length,
    optional: live.filter((b) => b.required === false).length,
    assessed: live.filter((b) => blockType(b.type).assessed).length,
    issues: issues.filter((i) => ids.has(i.blockId)),
  };
}

function Meter(minutes, promise, tall = false) {
  const r = promise ? minutes / promise : 0;
  const state = r > 1.5 ? 'over' : r > 1.15 ? 'high' : r === 0 ? 'none' : 'ok';
  const segs = 12;
  const lit = Math.min(segs, Math.round((r / 1.5) * segs));
  return h('div', { class: `tc-meter ${state}${tall ? ' tall' : ''}`, title: `${hrs(minutes)} of ${hrs(promise)} promised` },
    h('div', { class: 'tc-meter-col' }, Array.from({ length: segs }, (_, i) => h('i', { class: i < lit ? (i >= segs * (1.15 / 1.5) ? 'on hot' : 'on') : '' })).reverse(),
      h('span', { class: 'tc-meter-line', style: `bottom:${(1 / 1.5) * 100}%` })),
    h('b', {}, hrs(minutes)), h('small', {}, `of ${hrs(promise)}`));
}

const Leds = (title, list, on, short = false) => h('div', { class: 'tc-leds' }, h('small', {}, title),
  h('div', {}, list.map(([id, a, b]) => h('span', { class: on.has(id) ? 'on' : '', title: b ?? a }, short ? a : a))));

function PathPage(c) {
  setCrumbs([{ label: 'Path' }]);
  const issues = runChecks(c);
  const weeks = pathByWeek(c, { teacher: true });
  const promise = (Number(c.hoursPerWeek) || 3) * 60;
  const muted = new Set(c.tracks.filter((t) => t.muted).map((t) => t.id));
  const all = weekProfile(c, Object.values(c.blocks), issues);
  const inSession = weeks.filter((w) => w.week >= 1);
  const strip = (w) => {
    const p = weekProfile(c, w.blocks, issues);
    const weekIssues = issues.filter((i) => i.week === w.week).concat(p.issues);
    const worst = weekIssues.some((i) => i.level === 'block') ? 'block' : weekIssues.some((i) => i.level === 'warn') ? 'warn' : weekIssues.length ? 'hint' : 'ok';
    return h('section', { class: `tc-strip${w.week === 0 ? ' pre' : ''}` },
      h('header', {}, h('b', {}, w.label), h('small', {}, `${shortDate(dateOf(c.run.start, w.from))} – ${shortDate(dateOf(c.run.start, w.to - 1))}`)),
      h('div', { class: 'tc-strip-body' },
        Meter(p.minutes, w.week === 0 ? promise / 2 : promise),
        h('div', { class: 'tc-strip-side' },
          Leds('Ways in', WAYS, p.ways),
          Leds('Presence', PRES, p.pres, true),
          h('dl', { class: 'tc-strip-counts' },
            h('div', {}, h('dt', {}, 'Blocks'), h('dd', {}, w.blocks.length)),
            h('div', {}, h('dt', {}, 'Required'), h('dd', {}, p.required)),
            h('div', {}, h('dt', {}, 'Assessed'), h('dd', {}, p.assessed))))),
      h('a', { class: `tc-strip-check l-${worst}`, href: `#c/${c.id}/checks` }, worst === 'ok' ? icon('check', 13) : h('i', { class: `tc-lvl l-${worst}` }), worst === 'ok' ? 'All clear' : `${weekIssues.length} to look at`),
      h('ol', { class: 'tc-strip-blocks' }, w.blocks.map((b) => {
        const t = c.tracks.find((x) => x.id === b.trackId);
        const st = b.stream && c.streams?.[b.stream];
        const bad = issuesFor(issues, b.id);
        return h('li', { class: muted.has(b.trackId) ? 'muted' : '', style: `--tone:${t?.tone ?? '#999'}` },
          h('button', { type: 'button', onclick: () => openBlock(c.id, b.id), title: `${blockType(b.type).label} · ${shortDate(dateOf(c.run.start, b.start))}${b.minutes ? ` · ${b.minutes} min` : ''}${b.required === false ? ' · optional' : ''}` },
            icon(blockType(b.type).icon, 13), h('span', {}, b.title),
            st && h('i', { class: 'tc-sdot', style: `background:${st.tone}`, title: st.name }),
            bad.length ? h('i', { class: `tc-lvl l-${bad[0].level}` }) : null,
            h('small', {}, `${shortDate(dateOf(c.run.start, b.start))}${b.minutes ? ` · ${b.minutes}m` : ''}${b.required === false ? ' · opt' : ''}`)));
      })));
  };
  const avg = inSession.length ? inSession.reduce((k, w) => k + weekProfile(c, w.blocks, issues).minutes, 0) / inSession.length : 0;
  const master = h('section', { class: 'tc-strip master' },
    h('header', {}, h('b', {}, 'Whole course'), h('small', {}, `${inSession.length} weeks in session`)),
    h('div', { class: 'tc-strip-body' },
      Meter(avg, promise, true),
      h('div', { class: 'tc-strip-side' },
        Leds('Ways in', WAYS, all.ways),
        Leds('Presence', PRES, all.pres, true),
        h('dl', { class: 'tc-strip-counts' },
          h('div', {}, h('dt', {}, 'Blocks'), h('dd', {}, Object.keys(c.blocks).length)),
          h('div', {}, h('dt', {}, 'Total'), h('dd', {}, hrs(all.minutes))),
          h('div', {}, h('dt', {}, 'Assessed'), h('dd', {}, all.assessed)),
          h('div', {}, h('dt', {}, 'Streams'), h('dd', {}, Object.keys(c.streams ?? {}).length))))),
    h('p', { class: 'tc-strip-note' }, 'The meter shows an average week in session against the hours promised. The line marks the promise.'));
  return h('div', { class: 'lx-wrap' }, tabs('home'), CartridgeBar(c, 'path'),
    h('p', { class: 'lx-note' }, 'The course as a learner moves through it, one strip per week. Meters show the week’s hours against what you promised; lights show the ways in and the kinds of presence. Greyed blocks are on hidden tracks.'),
    h('div', { class: 'tc-mixer' }, h('div', { class: 'tc-mixer-strips' }, weeks.map(strip)), master));
}

/* Checks: a full report, rule by rule, whether or not anything is wrong. */
const PASS = {
  alt: (n) => `${n.images} picture${n.images === 1 ? '' : 's'} checked: each has alt text or is marked decorative.`,
  transcript: (n) => `${n.media} audio or video block${n.media === 1 ? '' : 's'}, each with a transcript or captions.`,
  contrast: (n) => `Text on all ${n.tracks} track colours reads at 4.5 to 1 or better.`,
  reading: () => 'Every block with words reads at about grade 10 or below.',
  timing: () => 'No timed quiz or exam is missing extensions.',
  load: (n) => `Every week stays within the ${n.hours} hours promised (with a little give).`,
  udl: () => 'Each week offers content more than one way: read, listen or watch.',
  presence: () => 'Each week in session has teaching, social and reflective presence.',
  feedback: (n) => `${n.assessed} assessed block${n.assessed === 1 ? '' : 's'}, each followed by feedback within two weeks.`,
  dates: () => 'Nothing is due in the first 48 hours or on a public holiday.',
  ref: () => 'Every content block has its content chosen or written.',
};

function ChecksPage(c) {
  setCrumbs([{ label: 'Checks' }]);
  const issues = runChecks(c);
  const blocks = Object.values(c.blocks);
  const n = {
    images: blocks.reduce((k, b) => k + (b.settings?.images ?? []).filter((i) => i?.src).length, 0),
    media: blocks.filter((b) => blockType(b.type).media).length,
    tracks: c.tracks.length, hours: c.hoursPerWeek || 3,
    assessed: blocks.filter((b) => blockType(b.type).assessed && b.type !== 'milestone').length,
  };
  const count = (lvl) => issues.filter((i) => i.level === lvl).length;
  const passed = RULES.filter((r) => !issues.some((i) => i.rule === r.id)).length;
  const state = count('block') ? 'bad' : count('warn') ? 'good' : 'great';
  const sevOf = (r) => { const l = issues.filter((i) => i.rule === r.id); return l.some((i) => i.level === 'block') ? 0 : l.some((i) => i.level === 'warn') ? 1 : l.length ? 2 : 3; };
  const rules = [...RULES].sort((a, b) => sevOf(a) - sevOf(b));
  const weeks = weekLoad(c).filter((w) => w.minutes || w.week);
  const promise = (Number(c.hoursPerWeek) || 3) * 60;
  const maxMin = Math.max(promise * 1.5, ...weeks.map((w) => w.minutes));
  const path = pathByWeek(c).filter((w) => w.week >= 1);
  const udl = udlBalance(c);
  const udlMax = Math.max(1, udl.engage, udl.represent, udl.express);
  const head = h('section', { class: `tc-report-head ${state}` },
    h('div', { class: 'tc-report-badge' }, icon(state === 'bad' ? 'warn' : 'check', 26)),
    h('div', {},
      h('h2', {}, state === 'great' ? 'Ready to publish, and nothing to tidy' : state === 'good' ? 'Ready to publish, with a few things worth a look' : `${count('block')} thing${count('block') === 1 ? '' : 's'} to fix before publishing`),
      h('p', {}, `${RULES.length} checks ran over ${blocks.length} blocks, ${c.tracks.length} tracks and ${path.length} weeks in session. ${passed} of ${RULES.length} pass cleanly.`)),
    h('dl', { class: 'tc-report-stats' },
      h('div', { class: 'l-block' }, h('dt', {}, 'To fix'), h('dd', {}, count('block'))),
      h('div', { class: 'l-warn' }, h('dt', {}, 'Worth fixing'), h('dd', {}, count('warn'))),
      h('div', { class: 'l-hint' }, h('dt', {}, 'Ideas'), h('dd', {}, count('hint'))),
      h('div', { class: 'l-ok' }, h('dt', {}, 'Passing'), h('dd', {}, passed))));
  const list = h('ol', { class: 'tc-rulelist' }, rules.map((r) => {
    const mine = issues.filter((i) => i.rule === r.id);
    const lvl = mine[0]?.level;
    return h('li', { class: mine.length ? `l-${lvl}` : 'pass' },
      h('details', { open: !!mine.length && lvl !== 'hint' },
        h('summary', {},
          mine.length ? h('i', { class: `tc-lvl l-${lvl}` }) : h('span', { class: 'tc-pass' }, icon('check', 12)),
          h('b', {}, r.label),
          h('span', { class: 'tc-rule-sum' }, mine.length ? `${mine.length} ${lvl === 'block' ? 'to fix' : lvl === 'warn' ? 'worth fixing' : mine.length === 1 ? 'idea' : 'ideas'}` : 'Passes')),
        h('div', { class: 'tc-rule-body' },
          !mine.length && h('p', { class: 'tc-rule-pass' }, PASS[r.id]?.(n) ?? 'Passes.'),
          h('p', { class: 'tc-rule-why' }, r.why),
          mine.length ? h('ul', { class: 'tc-issues' }, mine.map(Issue(c))) : null)));
  }));
  const aside = h('aside', { class: 'tc-report-aside' },
    h('section', { class: 'lx-panel' }, h('h3', {}, icon('gauge', 15), 'Load by week'),
      h('div', { class: 'tc-loadbars', style: `--p:${promise / maxMin}` }, weeks.map((w) => {
        const r = w.minutes / promise;
        return h('div', { class: r > 1.5 ? 'over' : r > 1.15 ? 'high' : '', title: `${weekLabel(w.week)}: ${hrs(w.minutes)}` }, h('i', { style: `--h:${(w.minutes / maxMin) * 100}%` }), h('small', {}, w.week === 0 ? 'Pre' : `W${w.week}`));
      })),
      h('p', { class: 'lx-note' }, `The line is the ${c.hoursPerWeek || 3} hours a week you promised.`)),
    h('section', { class: 'lx-panel' }, h('h3', {}, icon('users', 15), 'Presence by week'),
      h('table', { class: 'tc-pres' }, h('thead', {}, h('tr', {}, h('th', {}, ''), PRES.map(([, s, l]) => h('th', { title: l }, s)))),
        h('tbody', {}, path.map((w) => { const have = new Set(w.blocks.flatMap((b) => blockType(b.type).presence)); return h('tr', {}, h('th', {}, `W${w.week}`), PRES.map(([id]) => h('td', { class: have.has(id) ? 'on' : '' }, have.has(id) ? '●' : '○'))); }))),
      h('p', { class: 'lx-note' }, 'Teaching, social and reflective presence, from the community of inquiry.')),
    h('section', { class: 'lx-panel' }, h('h3', {}, icon('target', 15), 'UDL balance'),
      h('div', { class: 'tc-udl' }, [['engage', 'Engagement'], ['represent', 'Representation'], ['express', 'Action and expression']].map(([k, label]) =>
        h('div', {}, h('span', {}, h('b', {}, label)), h('i', { style: `--w:${(udl[k] / udlMax) * 100}%` }), h('em', {}, udl[k]))))));
  return h('div', { class: 'lx-wrap' }, tabs('home'), CartridgeBar(c, 'checks'),
    head,
    h('div', { class: 'tc-report' },
      h('div', {}, h('p', { class: 'lx-note' }, 'Teach checks the design as you work, never the learners. Red stops publishing; the rest explain themselves. Open a row for why it matters.'), list),
      aside));
}

/* -------------------------------------------------------------- learners */

const fmtDue = (d) => (d ? `${shortDate(d)}${d.slice(0, 4) !== today.slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}` : '');
function CardReach(c) {
  const k = courseSummary(doc, learn, org, c.id, today);
  if (!k.reached) return h('p', { class: 'tc-meta' }, icon('users', 13), ' Not shared with anyone yet');
  return h('p', { class: 'tc-meta tc-reach' }, icon('users', 13), ` ${k.joined} of ${k.reached} joined · ${k.finished} finished`, k.overdue ? h('b', { class: 'tc-late' }, ` · ${k.overdue} overdue`) : null);
}

/** Every course and who it's shared with: Teach's distribution overview. */
function PeoplePage() {
  setCrumbs([]);
  const pub = cartridges().filter((c) => c.status === 'published');
  const rows = pub.map((c) => ({ c, k: courseSummary(doc, learn, org, c.id, today), offers: offersOf(doc, c.id) }));
  const onStaff = (id) => org.staff?.[id] && !['guest', 'viewer'].includes(org.staff[id].roleId);
  const learners = new Set(Object.entries(learn.people ?? {}).filter(([id]) => onStaff(id)).filter(([, p]) => Object.keys(p.enrolments ?? {}).some((cid) => doc.cartridges[cid])).map(([id]) => id));
  const sum = (f) => rows.reduce((t, r) => t + f(r.k), 0);
  const tile = (label, value, sub, cls = '') => h('div', { class: `tc-tile ${cls}` }, h('b', {}, String(value)), h('span', {}, label), sub && h('small', {}, sub));
  return h('div', { class: 'lx-wrap' }, tabs('people'),
    h('p', { class: 'lx-note' }, 'Share a published course with everyone, a team, a role or one person. Assign it with a date to finish by, or offer it so it’s suggested in their catalogue. Learn keeps each learner’s record; Teach only counts.'),
    h('div', { class: 'tc-tiles' },
      tile('people learning', learners.size, `of ${Object.values(org.staff ?? {}).filter((s) => !['guest', 'viewer'].includes(s.roleId)).length} on staff`),
      tile('courses shared', rows.filter((r) => r.offers.length).length, `of ${pub.length} published`),
      tile('finished', sum((k) => k.finished), `of ${sum((k) => k.joined)} enrolments`),
      tile('overdue', sum((k) => k.overdue), 'assigned, past the date, not finished', sum((k) => k.overdue) ? 'late' : '')),
    h('section', { class: 'lx-panel' },
      h('div', { class: 'lx-ahead' }, h('h3', {}, icon('users', 15), 'Courses and who they reach')),
      pub.length ? h('div', { class: 'tc-table-wrap' }, h('table', { class: 'tc-table' },
        h('thead', {}, h('tr', {}, ['Course', 'Shared with', 'Reached', 'Joined', 'Progress', 'Overdue', 'Next date', ''].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, rows.map(({ c, k, offers }) => h('tr', {},
          h('th', { scope: 'row' }, h('a', { href: `#c/${c.id}/people` }, c.title), h('small', {}, [c.series, kindLabel(c.kind), `v${c.version}`].filter(Boolean).join(' · '))),
          h('td', {}, offers.length ? h('div', { class: 'tc-aud' }, offers.map((o) => h('span', { class: `tc-aud-chip m-${o.mode}` }, o.mode === 'assigned' ? icon('flag', 11) : icon('sparkle', 11), audienceLabel(org, o.to)))) : h('span', { class: 'tc-muted' }, 'Anyone can join from the catalogue')),
          h('td', { class: 'num' }, String(k.reached)),
          h('td', { class: 'num' }, String(k.joined)),
          h('td', {}, Stack(k)),
          h('td', { class: `num${k.overdue ? ' tc-late' : ''}` }, k.overdue ? String(k.overdue) : '–'),
          h('td', { class: 'tc-nowrap' }, k.nextDue ? fmtDue(k.nextDue) : '–'),
          h('td', {}, canEdit && h('button', { type: 'button', class: 'btn btn-xs', onclick: () => openShare(c.id) }, icon('share', 12), 'Share')))))))
        : h('p', { class: 'lx-note' }, 'Publish a cartridge to share it.')),
    cartridges().some((c) => c.status !== 'published') && h('p', { class: 'lx-note' }, `${n(cartridges().filter((c) => c.status !== 'published').length, 'draft')} not shown: publish a cartridge to share it.`));
}

/** Finished, in progress, not started and not joined, as one bar. */
function Stack(k) {
  const notStarted = k.joined - k.progress - k.finished;
  const parts = [['finished', k.finished], ['progress', k.progress], ['todo', notStarted], ['none', k.notJoined]];
  const total = parts.reduce((t, [, v]) => t + v, 0) || 1;
  return h('span', { class: 'tc-stack', role: 'img', 'aria-label': `${k.finished} finished, ${k.progress} in progress, ${notStarted} not started, ${k.notJoined} not joined` },
    parts.map(([cls, v]) => v ? h('i', { class: `p-${cls}`, style: `width:${(v / total) * 100}%`, title: `${v} ${{ finished: 'finished', progress: 'in progress', todo: 'not started', none: 'not joined' }[cls]}` }) : null));
}

let rosterFilter = 'all';
const ROSTER_FILTERS = [
  { id: 'all', label: 'Everyone', test: () => true },
  { id: 'none', label: 'Not joined', test: (r) => r.status === 'not-joined' },
  { id: 'todo', label: 'Not started', test: (r) => r.status === 'not-started' },
  { id: 'progress', label: 'In progress', test: (r) => r.status === 'in-progress' },
  { id: 'done', label: 'Finished', test: (r) => r.status === 'finished' },
  { id: 'late', label: 'Overdue', test: (r) => r.overdue },
];

/** One course: who it's shared with, and where each learner is. */
function LearnersPage(c) {
  setCrumbs([{ label: 'Learners' }]);
  const offers = offersOf(doc, c.id);
  const roster = rosterFor(doc, learn, org, c.id, today);
  const k = courseSummary(doc, learn, org, c.id, today);
  const f = ROSTER_FILTERS.find((x) => x.id === rosterFilter) ?? ROSTER_FILTERS[0];
  const shown = roster.filter(f.test);
  const nudgeable = shown.filter((r) => r.status !== 'finished');
  const how = (r) => (r.assigned ? 'Assigned' : r.offered ? 'Offered' : 'Chose it');
  return h('div', { class: 'lx-wrap' }, tabs('home'), CartridgeBar(c, 'people'),
    c.status !== 'published' ? h('section', { class: 'lx-panel' }, h('p', {}, icon('info', 15), ' This cartridge is a draft. Publish it first, then share it with people here.'))
      : h('div', { class: 'tc-learners' },
        h('section', { class: 'lx-panel' },
          h('div', { class: 'lx-ahead' }, h('h3', {}, icon('share', 15), 'Shared with'), canEdit && h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => openShare(c.id) }, icon('plus', 14), 'Share')),
          offers.length ? h('ul', { class: 'tc-offers' }, offers.map((o) => {
            const reach = audienceOf(org, o.to).length;
            return h('li', { class: `m-${o.mode}` },
              h('span', { class: 'tc-offer-ic', 'aria-hidden': 'true' }, icon(o.mode === 'assigned' ? 'flag' : 'sparkle', 14)),
              h('div', {}, h('b', {}, audienceLabel(org, o.to)),
                h('small', {}, `${o.mode === 'assigned' ? `Assigned${o.due ? `, finish by ${fmtDue(o.due)}` : ''}` : 'Offered in their catalogue'} · ${n(reach, 'person', 'people')}${o.by && org.staff?.[o.by] ? ` · by ${org.staff[o.by].name}` : ''}`),
                o.note && h('small', { class: 'tc-offer-note' }, `“${o.note}”`)),
              canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Stop sharing with ${audienceLabel(org, o.to)}`, title: 'Stop sharing (people who joined keep their place)', onclick: async () => { if (await uiConfirm(`Stop sharing “${c.title}” with ${audienceLabel(org, o.to)}? Anyone who joined keeps their place and progress.`, { ok: 'Stop sharing' })) { doc = removeOffer(doc, o.id); save('No longer shared'); render(); } } }, icon('close', 13)));
          })) : h('p', { class: 'lx-note' }, 'Not shared with anyone yet. People can still find it in Learn’s catalogue.'),
          h('div', { class: 'tc-tiles small' },
            h('div', { class: 'tc-tile' }, h('b', {}, String(k.joined)), h('span', {}, `of ${k.reached} joined`)),
            h('div', { class: 'tc-tile' }, h('b', {}, String(k.finished)), h('span', {}, 'finished')),
            h('div', { class: `tc-tile${k.overdue ? ' late' : ''}` }, h('b', {}, String(k.overdue)), h('span', {}, 'overdue'))),
          Stack(k)),
        h('section', { class: 'lx-panel' },
          h('div', { class: 'lx-ahead' }, h('h3', {}, icon('users', 15), 'Learners'),
            canEdit && nudgeable.length > 0 && h('button', { type: 'button', class: 'btn btn-sm', title: 'A friendly reminder, sent with the course’s pace emails once Convene is in', onclick: () => toast(`A kind nudge is queued for ${n(nudgeable.length, 'person', 'people')}. It goes out with the pace emails once Convene is in.`) }, icon('mail', 14), `Nudge ${nudgeable.length}`)),
          h('div', { class: 'tc-seg', role: 'group', 'aria-label': 'Show' }, ROSTER_FILTERS.map((x) => h('button', { type: 'button', class: f.id === x.id ? 'on' : '', 'aria-pressed': String(f.id === x.id), onclick: () => { rosterFilter = x.id; render(); } }, x.label, h('small', { class: 'tc-count' }, String(roster.filter(x.test).length))))),
          shown.length ? h('div', { class: 'tc-table-wrap' }, h('table', { class: 'tc-table' },
            h('thead', {}, h('tr', {}, ['Person', 'How', 'Where they are', 'Finish by', 'Last active'].map((x) => h('th', { scope: 'col' }, x)))),
            h('tbody', {}, shown.map((r) => h('tr', { class: r.overdue ? 'late' : '' },
              h('th', { scope: 'row' }, h('span', {}, r.staff.name), h('small', {}, r.staff.title ?? '')),
              h('td', {}, how(r)),
              h('td', {}, h('div', { class: 'tc-where' }, h('span', { class: `tc-st s-${r.status}` }, STATUS_LABEL[r.status]), r.e && h('span', { class: 'tc-mbar' }, h('i', { style: `width:${r.pct}%` })), r.e && h('small', {}, `${r.pct}%`))),
              h('td', { class: r.overdue ? 'tc-late' : '' }, r.due ? `${fmtDue(r.due)}${r.overdue ? ' · overdue' : ''}` : '–'),
              h('td', {}, r.last ? shortDate(r.last.slice(0, 10)) : '–'))))))
            : h('p', { class: 'lx-note' }, 'No one here.'),
          h('p', { class: 'lx-note' }, 'Teach sees where people are in the course, never their notes, answers or reflections. Those stay with the learner in Learn.'))));
}

/** Share a course: assign it or offer it, to everyone, a team, a role or one person. */
function openShare(cid) {
  const c = doc.cartridges[cid];
  if (!canEdit || !c) return;
  const st = { mode: 'assigned', kind: 'team', id: teamList(org)[0]?.id ?? '', due: dateOf(today, 28), note: '' };
  const staffList = Object.values(org.staff ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  const targets = () => (st.kind === 'team' ? teamList(org).map((t) => ({ id: t.id, label: t.name }))
    : st.kind === 'role' ? ROLES.filter((r) => !['guest', 'viewer'].includes(r.id)).map((r) => ({ id: r.id, label: r.label }))
      : st.kind === 'person' ? staffList.map((s) => ({ id: s.id, label: `${s.name}${s.title ? ` · ${s.title}` : ''}` })) : []);
  const draw = () => {
    const to = { kind: st.kind, id: st.kind === 'everyone' ? null : st.id };
    const reach = audienceOf(org, to);
    const already = reach.filter((id) => learn.people?.[id]?.enrolments?.[cid]).length;
    return h('div', { class: 'lx-form' },
      h('div', { class: 'tc-modes', role: 'radiogroup', 'aria-label': 'How' }, MODES.map((m) => h('label', { class: `tc-mode${st.mode === m.id ? ' on' : ''}` },
        h('input', { type: 'radio', name: 'share-mode', value: m.id, checked: st.mode === m.id, onchange: () => { st.mode = m.id; d.setBody(draw()); } }),
        icon(m.id === 'assigned' ? 'flag' : 'sparkle', 16), h('b', {}, m.label), h('small', {}, m.blurb)))),
      h('div', { class: 'lx-row' },
        field('With', h('select', { class: 'select select-sm', onchange: (e) => { st.kind = e.target.value; st.id = targets()[0]?.id ?? ''; d.setBody(draw()); } }, options(AUDIENCES, st.kind))),
        st.kind !== 'everyone' && field(st.kind === 'team' ? 'Team' : st.kind === 'role' ? 'Role' : 'Person', h('select', { class: 'select select-sm', onchange: (e) => { st.id = e.target.value; d.setBody(draw()); } }, options(targets(), st.id)))),
      st.mode === 'assigned' && field('Finish by', h('input', { type: 'date', class: 'input input-sm', value: st.due, min: today, onchange: (e) => { st.due = e.target.value; } }), 'A kind date, not a hard deadline. Learn shows it to them; Teach flags it once it passes.'),
      field('A note for them (optional)', h('input', { class: 'input input-sm', value: st.note, placeholder: 'e.g. Before the strategy retreat', oninput: (e) => { st.note = e.target.value; } })),
      h('p', { class: 'tc-reach-preview' }, icon('users', 14), ` Reaches ${n(reach.length, 'person', 'people')}${already ? `, ${already} already in it` : ''}.`));
  };
  const d = openDrawer({ title: `Share “${c.title}”`, sub: 'Assign it or offer it', actions: [
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => d.close() }, 'Cancel'),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
      const to = { kind: st.kind, id: st.kind === 'everyone' ? null : st.id };
      if (st.kind !== 'everyone' && !st.id) { toast('Pick who to share it with', 'error'); return; }
      doc = addOffer(doc, { cid, to, mode: st.mode, due: st.mode === 'assigned' ? st.due || null : null, note: st.note.trim(), by: me });
      save(`${st.mode === 'assigned' ? 'Assigned' : 'Offered'} to ${audienceLabel(org, to)}`);
      d.close();
      render();
    } }, icon('share', 14), 'Share'),
  ] });
  d.setBody(draw());
}

/* ---------------------------------------------------------------- blocks */

function BlocksPage() {
  setCrumbs([]);
  return h('div', { class: 'lx-wrap' }, tabs('blocks'),
    h('p', { class: 'lx-note' }, 'Every kind of block a cartridge can hold. Each goes on its usual track, with a learner’s effort to start from; change both in the block’s drawer.'),
    h('div', { class: 'tc-rules' }, BLOCK_GROUPS.map((g) => h('section', { class: 'lx-panel' }, h('h3', {}, g),
      h('ul', { class: 'tc-types' }, BLOCK_TYPES.filter((t) => t.group === g).map((t) => h('li', { style: `--tone:${trackKind(t.track).tone}` }, icon(t.icon, 15), h('b', {}, t.label), h('small', {}, `${t.blurb}${t.minutes ? ` About ${t.minutes} minutes.` : ''}`))))))));
}

/* --------------------------------------------------------------- drawers */

/** One drawer at a time; a closing one never clears the one that replaced it. */
function openDrawer(opts) {
  drawer?.close();
  const d = Drawer({ ...opts, body: h('div'), onClose: () => { if (drawer === d) drawer = null; } });
  drawer = d;
  return d;
}
const field = (label, input, help = null) => h('label', { class: 'lx-field' }, h('span', {}, label), input, help && h('small', {}, help));
const text = (value, onchange, attrs = {}) => h('input', { class: 'input input-sm', value: value ?? '', disabled: !canEdit, onchange: (e) => onchange(e.target.value), ...attrs });

/* ------------------------------------------------------- the block tray */

let blockTab = 'content';
let trayFull = false;
const TEXT_TYPES = ['reading', 'case', 'page', 'announce', 'discussion', 'reflection', 'feedback', 'assignment', 'peer', 'email', 'milestone', 'checkin', 'release', 'voice', 'showcase', 'checkpoint', 'resource', 'video', 'live', 'office', 'meetup', 'whiteboard', 'mapwalk'];
/** Where each kind of block is made in full, in another plugin. Hidden if that plugin is off for you. */
function fullEditor(b) {
  const go = (plugin, hash, label) => { const href = linkTo(plugin, hash); return href ? { href, label } : null; };
  if (b.type === 'slideshow') return go('podcasts', '#studio', 'Open in the Studio');
  if (b.type === 'podcast') return go('podcasts', b.ref?.id ? `#episodes/${b.ref.id}` : '#episodes', 'Open in Listen');
  if (b.type === 'page') return go('pages', '#pages', 'Open in Web');
  if (['reading', 'case'].includes(b.type)) return go('library', '#', 'Open the Library');
  if (b.type === 'resource') return go('assets', '#', 'Open the Asset manager');
  if (b.type === 'mapwalk') return go('mapper', '#', 'Open Ecosystem');
  return null;
}

/** The block tray: a large drawer with a quick editor and a learner's-eye preview side by side. */
function openBlock(cid, bid) {
  drawer?.close();
  const sub = () => { const c = doc.cartridges[cid]; const x = c.blocks[bid]; return `${blockType(x.type).label} · ${shortDate(dateOf(c.run.start, x.start))}${x.length > 1 ? ` – ${shortDate(dateOf(c.run.start, x.start + x.length - 1))}` : ''}${x.streamId ? ` · in ${c.streams?.[x.streamId]?.name ?? 'a stream'}` : ''}`; };
  const draw = () => {
    const c = doc.cartridges[cid];
    const b = c?.blocks[bid];
    if (!b) { drawer?.close(); return h('div'); }
    const t = blockType(b.type);
    const set = (patch, note) => { setCartridge(updateBlock(doc.cartridges[cid], bid, patch), note); render(); drawer?.setBody(draw()); drawer?.setTitle(doc.cartridges[cid].blocks[bid].title, sub()); };
    const issues = runChecks(c).filter((i) => i.blockId === bid);
    const full = fullEditor(b);
    const tabsEl = h('div', { class: 'tc-tray-tabs', role: 'tablist' },
      [['content', 'Content', t.icon], ['when', 'When and where', 'calendar'], ['access', 'Access and links', 'eye'], ['checks', `Checks${issues.length ? ` (${issues.length})` : ''}`, 'checklist']].map(([id, label, ic]) =>
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(blockTab === id), class: blockTab === id ? 'on' : '', onclick: () => { blockTab = id; drawer?.setBody(draw()); } }, icon(ic, 14), label)),
      h('span', { class: 'tc-grow' }),
      full && h('a', { class: 'btn btn-sm', href: full.href }, icon('export', 14), full.label),
      h('button', { type: 'button', class: `btn btn-sm${trayFull ? ' on' : ''}`, 'aria-pressed': String(trayFull), title: trayFull ? 'Back to a tray' : 'Use the whole screen', onclick: () => { trayFull = !trayFull; drawer?.el.classList.toggle('full', trayFull); drawer?.setBody(draw()); } }, icon(trayFull ? 'arrowsIn' : 'fit', 14), trayFull ? 'Tray' : 'Full screen'));
    let pane;
    if (blockTab === 'when') pane = h('div', { class: 'tc-tray-split' }, WhenPane(c, b, set), Glance(c, b, issues));
    else if (blockTab === 'access') pane = h('div', { class: 'tc-tray-split' }, AccessPane(c, b, set), Glance(c, b, issues));
    else if (blockTab === 'checks') pane = issues.length ? h('ul', { class: 'tc-issues tc-drawer-issues' }, issues.map((i) => h('li', { class: `l-${i.level}` }, h('i', { class: `tc-lvl l-${i.level}` }), h('span', {}, i.title, h('small', {}, i.why))))) : h('p', { class: 'lx-note' }, icon('check', 14), ' Nothing to look at for this block.');
    else pane = h('div', { class: 'tc-tray-split' },
      h('div', { class: 'tc-tray-edit lx-form' },
        t.preview && h('p', { class: 'tc-preview-note' }, icon('sparkle', 14), ` ${t.label} is new: you can place it, write it and schedule it. Learners see a simple version until it’s built in full.`),
        ContentEditor(c, b, set, field('Title', text(b.title, (v) => set({ title: v || t.label }))))),
      h('aside', { class: 'tc-tray-preview', 'aria-label': 'What learners see' }, h('h4', {}, icon('eye', 13), 'What learners see'), LearnerPreview(c, b)));
    drawer?.setActions?.(canEdit ? [
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (await uiConfirm(`Remove “${b.title}”?`, { ok: 'Remove', danger: true })) { setCartridge(removeBlock(doc.cartridges[cid], bid), 'Block removed'); selected = null; drawer.close(); render(); } } }, icon('trash', 14), 'Remove'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { const r = duplicateBlock(doc.cartridges[cid], bid); setCartridge(r.cartridge, 'Copied a week later'); selected = r.id; render(); openBlock(cid, r.id); } }, icon('copy', 14), 'Copy to next week'),
      b.streamId && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => openStream(cid, b.streamId) }, icon('link', 14), 'Its stream'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => drawer.close() }, 'Done'),
    ].filter(Boolean) : []);
    return h('div', { class: 'tc-tray' }, tabsEl, pane);
  };
  const c = doc.cartridges[cid];
  const b = c.blocks[bid];
  const t = blockType(b.type);
  const tone = c.tracks.find((x) => x.id === b.trackId)?.tone ?? '#888';
  openDrawer({ title: b.title, sub: sub(), wide: 'xl', lead: h('span', { class: 'tc-lead', style: `background:${tone}` }, icon(t.icon, 18)) });
  drawer.el.classList.toggle('full', trayFull);
  drawer.setBody(draw());
}

const formSec = (title, ic, ...kids) => h('section', { class: 'tc-fsec' }, h('h4', {}, icon(ic, 14), title), ...kids);

function WhenPane(c, b, set) {
  const start = c.run.start;
  const end = b.start + b.length - 1;
  return h('div', { class: 'tc-tray-narrow tc-fsecs' },
    formSec('Where it sits', 'rows',
      h('div', { class: 'tc-grid-2' },
        field('Track', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ trackId: e.target.value }) }, options(c.tracks.map((x) => ({ id: x.id, label: x.name })), b.trackId))),
        field('Kind of block', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ type: e.target.value }) }, BLOCK_GROUPS.map((g) => h('optgroup', { label: g }, options(BLOCK_TYPES.filter((x) => x.group === g).map((x) => ({ id: x.id, label: x.label })), b.type)))))),
      b.streamId && h('p', { class: 'tc-fnote' }, icon('link', 13), ` Part of “${c.streams?.[b.streamId]?.name ?? 'a stream'}”: moving it moves the whole stream.`)),
    formSec('When', 'calendar',
      h('div', { class: 'tc-grid-3' },
        field('Opens', h('input', { type: 'date', class: 'input input-sm', disabled: !canEdit, value: dateOf(start, b.start), onchange: (e) => e.target.value && set({ start: dayOf(start, e.target.value) }) }), `Course day ${b.start}${c.pacing === 'self' ? ', from each learner’s start' : ''}`),
        field('Days open', h('input', { type: 'number', min: '1', max: '120', class: 'input input-sm', disabled: !canEdit, value: String(b.length), onchange: (e) => set({ length: Math.max(1, Number(e.target.value) || 1) }) }), b.length > 1 ? `Until ${shortDate(dateOf(start, end))}` : 'Just that day'),
        field('Time', h('input', { type: 'time', class: 'input input-sm', disabled: !canEdit, value: b.at ?? '', onchange: (e) => set({ at: e.target.value || null }) }), b.at ? c.run.tz : 'Any time that day')),
      DayStrip(c, b)),
    formSec('Effort', 'clock',
      h('div', { class: 'tc-grid-3' },
        field('Learner effort (minutes)', h('input', { type: 'number', min: '0', max: '600', step: '5', class: 'input input-sm', disabled: !canEdit, value: String(b.minutes ?? 0), onchange: (e) => set({ minutes: Math.max(0, Number(e.target.value) || 0) }) }), 'Counts towards the week’s load'),
        h('div', { class: 'lx-field' }, h('span', {}, 'To finish the course'), h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!b.required, onchange: (e) => set({ required: e.target.checked }) }), 'Required'), h('small', {}, b.required ? 'Learners need it to finish' : 'Nice to do, never needed')),
        h('div', { class: 'lx-field' }, h('span', {}, 'Who sees it'), h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: b.settings?.visibility === 'teachers', onchange: (e) => set({ settings: { ...b.settings, visibility: e.target.checked ? 'teachers' : 'learners' } }) }), 'Teachers only'), h('small', {}, 'A note to yourself, hidden from learners')))),
    formSec('Order', 'flow', WaitsFor(c, b, set)));
}

/** A little strip of the run with this block on it, so the dates mean something. */
function DayStrip(c, b) {
  const from = -c.span.pre;
  const to = c.span.length + c.span.post;
  const pct = (d) => ((d - from) / (to - from)) * 100;
  return h('div', { class: 'tc-daystrip', 'aria-hidden': 'true' },
    h('i', { class: 'tc-ds-session', style: `left:${pct(0)}%;width:${pct(c.span.length) - pct(0)}%` }),
    h('b', { class: 'tc-ds-block', style: `left:${pct(b.start)}%;width:${Math.max(0.8, pct(b.start + b.length) - pct(b.start))}%` }),
    h('small', { style: 'left:0' }, shortDate(dateOf(c.run.start, from))),
    h('small', { style: `left:${pct(0)}%` }, 'Day 0'),
    h('small', { style: 'right:0' }, shortDate(dateOf(c.run.start, to - 1))));
}

/** Waits for: the earlier blocks as a list to tick, by week, instead of a multi-select. */
function WaitsFor(c, b, set) {
  const earlier = Object.values(c.blocks).filter((x) => x.id !== b.id && x.start <= b.start).sort((x, y) => x.start - y.start || x.title.localeCompare(y.title));
  const after = new Set(b.after ?? []);
  if (!earlier.length) return h('p', { class: 'tc-fnote' }, 'Nothing comes before this block yet, so it can’t wait for anything.');
  const byWeek = new Map();
  for (const x of earlier) { const w = weekLabel(weekOf(x.start)); if (!byWeek.has(w)) byWeek.set(w, []); byWeek.get(w).push(x); }
  const toggle = (id, on) => set({ after: on ? [...after, id] : [...after].filter((x) => x !== id) });
  const list = h('div', { class: 'tc-waits' }, [...byWeek].map(([w, xs]) => h('div', { class: 'tc-waits-week' }, h('h5', {}, w),
    xs.map((x) => {
      const t = blockType(x.type);
      const tone = c.tracks.find((tr) => tr.id === x.trackId)?.tone ?? '#999';
      return h('label', { class: `tc-wait${after.has(x.id) ? ' on' : ''}`, style: `--tone:${tone}` },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', disabled: !canEdit, checked: after.has(x.id), onchange: (e) => toggle(x.id, e.target.checked) }),
        h('span', { class: 'tc-wait-ic' }, icon(t.icon, 12)),
        h('span', { class: 'tc-wait-t' }, x.title), h('small', {}, shortDate(dateOf(c.run.start, x.start))));
    }))));
  return h('div', { class: 'lx-field' },
    h('span', {}, after.size ? `Waits for ${n(after.size, 'block')}` : 'Waits for nothing (learners choose freely)'),
    after.size > 0 && h('div', { class: 'tc-wait-chips' }, [...after].filter((id) => c.blocks[id]).map((id) => h('button', { type: 'button', class: 'tc-wait-chip', disabled: !canEdit, title: 'Remove', onclick: () => toggle(id, false) }, c.blocks[id].title, icon('close', 11)))),
    list,
    h('small', {}, 'Learners can open this once the ticked blocks are done.'));
}

function AccessPane(c, b, set) {
  const t = blockType(b.type);
  return h('div', { class: 'tc-fsecs tc-tray-narrow' },
    formSec('Other ways in', 'eye', field('Alternatives', h('div', { class: 'lx-chips' }, [['transcript', 'Transcript'], ['captions', 'Captions'], ['reading', 'Reading version'], ['audio', 'Audio version']].map(([k, label]) =>
      h('label', { class: 'lx-chip' }, h('input', { type: 'checkbox', disabled: !canEdit, checked: (b.alts ?? []).includes(k), onchange: (e) => set({ alts: e.target.checked ? [...(b.alts ?? []), k] : (b.alts ?? []).filter((a) => a !== k) }) }), label))),
      t.media ? 'Audio and video need a transcript or captions before publishing.' : 'Alternatives let learners choose how they take it in.')),
    c.competencies?.length > 0 && formSec('Builds towards', 'target', field('Competencies', h('div', { class: 'lx-chips' }, c.competencies.map((k) => h('label', { class: 'lx-chip' }, h('input', { type: 'checkbox', disabled: !canEdit, checked: (b.competencies ?? []).includes(k.id), onchange: (e) => set({ competencies: e.target.checked ? [...(b.competencies ?? []), k.id] : (b.competencies ?? []).filter((x) => x !== k.id) }) }), k.name))))),
    formSec('Stream', 'link', field('Linked to', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => { const v = e.target.value; setCartridge(v ? addToStream(doc.cartridges[c.id], v, b.id) : unlinkBlock(doc.cartridges[c.id], b.id), v ? 'Added to the stream' : 'Unlinked'); render(); openBlock(c.id, b.id); } },
      h('option', { value: '' }, '— not linked —'), Object.values(c.streams ?? {}).map((st) => h('option', { value: st.id, selected: b.streamId === st.id }, st.name))), 'Blocks in a stream move together. Shift-click blocks on the timeline to link new ones.')));
}

/** The quick editor for the block's content, by kind. */
function ContentEditor(c, b, set, titleEl = null) {
  const parts = [];
  const extra = [];
  const secs = [];
  if (b.type === 'lesson') parts.push(LessonBuilder(b, set));
  else if (['slideshow', 'podcast'].includes(b.type)) parts.push(ShowEditor(b, set));
  else if (['quiz', 'exam'].includes(b.type)) {
    extra.push(
      field('Time limit (minutes)', h('input', { type: 'number', min: '0', class: 'input input-sm', disabled: !canEdit, value: String(b.settings?.timeLimit ?? 0), onchange: (e) => set({ settings: { ...b.settings, timeLimit: Math.max(0, Number(e.target.value) || 0) } }) }), '0 means no limit'),
      h('div', { class: 'lx-field' }, h('span', {}, 'More time'), h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!b.settings?.extensions, onchange: (e) => set({ settings: { ...b.settings, extensions: e.target.checked } }) }), 'Teachers can grant extensions'), h('small', {}, 'Needed for any timed quiz (WCAG 2.2.1)')));
    parts.push(QuestionsField(b, set),
    DocEditor(b, set, { label: 'Before they start (optional)', rows: 3 }));
  } else if (b.type === 'flashcards') parts.push(CardsField(b, set), DocEditor(b, set, { label: 'A note for learners', rows: 3 }));
  else if (b.type === 'poll') parts.push(PollField(b, set));
  else if (b.type === 'scenario') parts.push(DocEditor(b, set, { label: 'The situation', rows: 4 }), ScenarioField(b, set));
  else {
    const label = { page: 'The page', reading: 'The reading', case: 'The case', assignment: 'The brief', discussion: 'The question for the group', reflection: 'The prompt', voice: 'What to talk about', showcase: 'What to share', mapwalk: 'Prompts along the walk', live: 'Agenda', office: 'What to bring', meetup: 'What it’s for', whiteboard: 'What you’ll do on the board' }[b.type] ?? 'Words';
    parts.push(DocEditor(b, set, { label, rows: ['page', 'reading', 'case'].includes(b.type) ? 12 : 6 }));
  }
  // Type-specific settings.
  if (b.type === 'resource') {
    const assetItems = Object.values(assets?.items ?? {}).filter((a) => a.kind !== 'ref').slice(0, 200);
    extra.push(field('Asset', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ ref: e.target.value ? { plugin: 'assets', type: 'item', id: e.target.value } : null }) },
      h('option', { value: '' }, '— a link instead —'), assetItems.map((a) => h('option', { value: a.id, selected: b.ref?.id === a.id }, a.title ?? a.id)))));
  }
  if (['live', 'office', 'meetup', 'whiteboard'].includes(b.type)) secs.push(SessionFields(c, b, set));
  if (['resource', 'video'].includes(b.type)) extra.push(field(b.type === 'video' ? 'Video link' : b.type === 'resource' ? 'Link' : 'Meeting link (Zoom, Meet, Teams)', text(b.settings?.url, (v) => set({ settings: { ...b.settings, url: v } }), { type: 'url', placeholder: 'https://' })));
  if (false) extra.push(field('Repeats', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ settings: { ...b.settings, repeat: e.target.value } }) }, options([{ id: 'none', label: 'Just this once' }, { id: 'weekly', label: 'Every week of the run' }], b.settings?.repeat ?? 'none'))));
  if (b.type === 'whiteboard') secs.push(formSec('The board', 'palette', WhiteboardField(c, b, set)));
  if (b.type === 'assignment') extra.push(field('Learners hand in', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ settings: { ...b.settings, handIn: e.target.value } }) }, options([{ id: 'doc', label: 'A Dashi doc' }, { id: 'file', label: 'A file' }, { id: 'any', label: 'Their choice: a doc, a file, audio or video' }], b.settings?.handIn ?? 'doc')), 'Offering a choice of format is the UDL way.'));
  if (b.type === 'page') extra.push(field('Web page', text(b.settings?.slug, (v) => set({ settings: { ...b.settings, slug: v } }), { placeholder: 'e.g. grants/how-to-apply' }), 'Link this block to a page in Web, or write a short one here.'));
  const t = blockType(b.type);
  return h('div', { class: 'tc-fsecs' },
    formSec(t.label, t.icon, h('div', { class: 'lx-form' }, titleEl, parts)),
    extra.length > 0 && formSec('Settings', 'settings', h('div', { class: 'tc-grid-2' }, extra)),
    ...secs);
}

/** At a glance: the block's facts in one card, beside the When and Access forms. */
function Glance(c, b, issues) {
  const t = blockType(b.type);
  const tr = c.tracks.find((x) => x.id === b.trackId);
  const st = b.streamId && c.streams?.[b.streamId];
  const row = (k, v) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
  return h('aside', { class: 'tc-tray-preview tc-glance', 'aria-label': 'At a glance' }, h('h4', {}, icon('eye', 13), 'At a glance'),
    h('div', { class: 'tc-glance-card', style: `--tone:${tr?.tone ?? '#999'}` },
      h('header', {}, h('span', { class: 'tc-wait-ic' }, icon(t.icon, 13)), h('b', {}, b.title)),
      h('dl', {},
        row('Kind', t.label),
        row('Track', tr?.name ?? '—'),
        row('Opens', `${shortDate(dateOf(c.run.start, b.start))}${b.at ? ` at ${b.at}` : ''}`),
        row('Open for', n(b.length, 'day')),
        row('Effort', b.minutes ? `${b.minutes} min` : 'None counted'),
        row('Needed', b.required ? 'Required' : 'Optional'),
        row('Seen by', b.settings?.visibility === 'teachers' ? 'Teachers only' : 'Learners'),
        row('Waits for', b.after?.length ? n(b.after.length, 'block') : 'Nothing'),
        row('Other ways in', (b.alts ?? []).length ? b.alts.join(', ') : 'None yet'),
        st && row('Stream', st.name),
        row('Checks', issues.length ? `${issues.length} to look at` : 'All clear'))));
}

/** A live session's details: when, how long, where, who hosts, and what happens after. */
function SessionFields(c, b, set) {
  const st = b.settings ?? {};
  const put = (patch) => set({ settings: { ...st, ...patch } });
  return formSec('The session', 'video',
    h('p', { class: 'tc-fnote' }, icon('calendar', 13), ` ${shortDate(dateOf(c.run.start, b.start))}${b.at ? ` at ${b.at}` : ', no time set yet'} (${c.run.tz}). Change it under When and where.`),
    h('div', { class: 'tc-grid-2' },
      b.type !== 'whiteboard' && field('Meeting link', text(st.url, (v) => put({ url: v }), { type: 'url', placeholder: 'https://zoom.us/j/…' }), 'Zoom, Meet or Teams'),
      field('Length (minutes)', h('input', { type: 'number', min: '0', max: '480', step: '5', class: 'input input-sm', disabled: !canEdit, value: String(b.minutes ?? 60), onchange: (e) => set({ minutes: Math.max(0, Number(e.target.value) || 0) }) })),
      field('Host', text(st.host, (v) => put({ host: v }), { placeholder: 'e.g. Programme lead' })),
      field('Repeats', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => put({ repeat: e.target.value }) }, options([{ id: 'none', label: 'Just this once' }, { id: 'weekly', label: 'Every week of the run' }], st.repeat ?? 'none')))),
    h('div', { class: 'tc-grid-2' },
      h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!st.recording, onchange: (e) => put({ recording: e.target.checked }) }), 'Share a recording after, with captions'),
      h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!st.reminder, onchange: (e) => put({ reminder: e.target.checked }) }), 'Remind learners the day before')));
}

/** A light markdown editor: a few buttons, the words, and the preview beside it in the tray. */
function DocEditor(b, set, { label = 'Words', rows = 6, key = 'body' } = {}) {
  const area = h('textarea', { class: 'textarea textarea-sm tc-doc-area', rows, disabled: !canEdit, value: b[key] ?? '', onchange: (e) => set({ [key]: e.target.value }) });
  const wrap = (before, after = before, placeholder = 'text') => {
    const { selectionStart: s0, selectionEnd: s1, value } = area;
    const mid = value.slice(s0, s1) || placeholder;
    area.value = value.slice(0, s0) + before + mid + after + value.slice(s1);
    area.focus();
    area.setSelectionRange(s0 + before.length, s0 + before.length + mid.length);
    set({ [key]: area.value });
  };
  const line = (prefix) => {
    const { selectionStart: s0, value } = area;
    const at = value.lastIndexOf('\n', s0 - 1) + 1;
    area.value = value.slice(0, at) + prefix + value.slice(at);
    set({ [key]: area.value });
  };
  const words = String(b[key] ?? '').trim().split(/\s+/).filter(Boolean).length;
  return h('div', { class: 'lx-field' }, h('span', {}, label),
    canEdit && h('div', { class: 'tc-doc-bar', role: 'toolbar', 'aria-label': 'Formatting' },
      h('button', { type: 'button', title: 'Bold', 'aria-label': 'Bold', onclick: () => wrap('**') }, h('b', {}, 'B')),
      h('button', { type: 'button', title: 'Italic', 'aria-label': 'Italic', onclick: () => wrap('*') }, h('i', {}, 'I')),
      h('button', { type: 'button', title: 'Heading', 'aria-label': 'Heading', onclick: () => line('## ') }, 'H'),
      h('button', { type: 'button', title: 'Bullet list', 'aria-label': 'Bullet list', onclick: () => line('- ') }, icon('listBullets', 13)),
      h('button', { type: 'button', title: 'Numbered list', 'aria-label': 'Numbered list', onclick: () => line('1. ') }, icon('listNumbers', 13)),
      h('button', { type: 'button', title: 'Quote', 'aria-label': 'Quote', onclick: () => line('> ') }, icon('quotes', 13)),
      h('button', { type: 'button', title: 'Link', 'aria-label': 'Link', onclick: () => wrap('[', '](https://)', 'link text') }, icon('link', 13)),
      h('span', { class: 'tc-grow' }),
      h('small', {}, `${words} word${words === 1 ? '' : 's'}${words > 400 ? ' · long for one block' : ''}`)),
    area);
}

/**
 * The lesson builder (lite): a lesson as a short run of sections. Text,
 * a picture, a callout, a question to think about, a video. The words are
 * kept in the block's body too, so the checks and Learn read them as before.
 */
const SECTION_KINDS = [
  { id: 'text', label: 'Text', icon: 'alignLeft' },
  { id: 'image', label: 'Picture', icon: 'image' },
  { id: 'callout', label: 'Callout', icon: 'lightbulb' },
  { id: 'question', label: 'Think about', icon: 'question' },
  { id: 'video', label: 'Video', icon: 'video' },
];
function LessonBuilder(b, set) {
  const secs = lessonSections(b);
  const put = (list, note) => set({
    body: list.filter((x) => x.kind === 'text').map((x) => x.text ?? '').join('\n\n'),
    settings: { ...b.settings, sections: list, images: list.filter((x) => x.kind === 'image' && x.src).map((x) => ({ src: x.src, alt: x.alt ?? '', decorative: !!x.decorative })) },
  }, note);
  const patch = (i, p) => put(secs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i, d) => { const l = [...secs]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); put(l); };
  const addSec = (kind) => put([...secs, { id: `sec_${Math.random().toString(36).slice(2, 8)}`, kind, text: '', src: '', alt: '' }], `${SECTION_KINDS.find((k) => k.id === kind).label} added`);
  return h('div', { class: 'lx-field tc-lesson' }, h('span', {}, `Lesson builder · ${n(secs.length, 'section')}`),
    secs.length ? h('ol', { class: 'tc-secs' }, secs.map((x, i) => {
      const k = SECTION_KINDS.find((y) => y.id === x.kind) ?? SECTION_KINDS[0];
      let bodyEl;
      if (x.kind === 'image') bodyEl = h('div', { class: 'lx-row' }, field('Picture address', text(x.src, (v) => patch(i, { src: v }), { placeholder: '/media/photos/…' })), field('Alt text', text(x.alt, (v) => patch(i, { alt: v }), { placeholder: 'What it shows' })));
      else if (x.kind === 'video') bodyEl = h('div', { class: 'lx-row' }, field('Video link', text(x.src, (v) => patch(i, { src: v }), { type: 'url', placeholder: 'https://' })), field('Caption', text(x.text, (v) => patch(i, { text: v }))));
      else bodyEl = h('textarea', { class: 'textarea textarea-sm', rows: x.kind === 'text' ? 4 : 2, disabled: !canEdit, value: x.text ?? '', placeholder: x.kind === 'callout' ? 'Something to remember' : x.kind === 'question' ? 'A question to sit with (no answer needed)' : 'A short paragraph or two', onchange: (e) => patch(i, { text: e.target.value }) });
      return h('li', { class: `tc-sec k-${x.kind}` },
        h('header', {}, icon(k.icon, 13), h('b', {}, k.label), h('span', { class: 'tc-grow' }),
          canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(i, -1) }, icon('chevronUp', 12)),
          canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', disabled: i === secs.length - 1, 'aria-label': 'Move down', onclick: () => move(i, 1) }, icon('chevronDown', 12)),
          canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove section', onclick: () => put(secs.filter((_, j) => j !== i)) }, icon('trash', 12))),
        bodyEl);
    })) : h('p', { class: 'lx-note' }, 'Empty so far. Start with a little text.'),
    canEdit && h('div', { class: 'tc-sec-add' }, h('small', {}, 'Add'), SECTION_KINDS.map((k) => h('button', { type: 'button', class: 'btn btn-xs', onclick: () => addSec(k.id) }, icon(k.icon, 12), k.label))));
}

/** The slideshow editor (lite): pick a show, see its slides, leave a note per slide. The show itself is made in the Studio. */
function ShowEditor(b, set) {
  const episodes = Object.values(podcasts?.episodes ?? {}).sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
  const ep = b.ref?.id ? podcasts?.episodes?.[b.ref.id] : null;
  const slides = (ep?.show?.slides ?? ep?.slides ?? []).length ? (ep.show?.slides ?? ep.slides).map((s, i) => ({ title: s.title ?? s.text ?? `Slide ${i + 1}` }))
    : ['Title', 'The question', 'What we found', 'One story', 'What it means', 'Thanks'].map((title) => ({ title }));
  const notes = b.settings?.slideNotes ?? {};
  return h('div', { class: 'lx-form' },
    field(b.type === 'slideshow' ? 'Slideshow podcast' : 'Episode',
      h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ ref: e.target.value ? { plugin: 'podcasts', type: 'episode', id: e.target.value } : null }) },
        h('option', { value: '' }, '— choose a show —'),
        b.ref && !ep && h('option', { value: b.ref.id, selected: true }, `${b.ref.id} (not in the station yet: a sample deck plays)`),
        episodes.map((e) => h('option', { value: e.id, selected: b.ref?.id === e.id }, e.title))),
      'Shows are made in the Studio; the cartridge links to them and never copies them.'),
    b.type === 'slideshow' && h('div', { class: 'lx-field' }, h('span', {}, `Slides${ep ? '' : ' (a sample deck until the show is in)'}`),
      h('ol', { class: 'tc-slides' }, slides.map((sl, i) => h('li', {},
        h('span', { class: 'tc-slide-thumb', 'aria-hidden': 'true' }, String(i + 1)),
        h('div', {}, h('b', {}, sl.title),
          h('input', { class: 'input input-xs', disabled: !canEdit, value: notes[i] ?? '', placeholder: 'A note or question for learners on this slide', onchange: (e) => set({ settings: { ...b.settings, slideNotes: { ...notes, [i]: e.target.value } } }) })))))),
    DocEditor(b, set, { label: 'Introduce it', rows: 3 }));
}

function CardsField(b, set) {
  const cards = b.settings?.cards ?? [];
  const put = (list) => set({ settings: { ...b.settings, cards: list } });
  return h('div', { class: 'lx-field' }, h('span', {}, `Cards (${cards.length})`),
    h('ol', { class: 'tc-cardlist' }, cards.map((cd, i) => h('li', {},
      text(cd.front, (v) => put(cards.map((x, j) => (j === i ? { ...x, front: v } : x))), { placeholder: 'Front: a word or question' }),
      text(cd.back, (v) => put(cards.map((x, j) => (j === i ? { ...x, back: v } : x))), { placeholder: 'Back: the answer' }),
      canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove card', onclick: () => put(cards.filter((_, j) => j !== i)) }, icon('trash', 12))))),
    canEdit && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => put([...cards, { front: '', back: '' }]) }, icon('plus', 14), 'Add a card'));
}

function PollField(b, set) {
  const opts = b.settings?.options ?? ['', ''];
  const put = (list) => set({ settings: { ...b.settings, options: list } });
  return h('div', { class: 'lx-form' },
    field('The question', text(b.body, (v) => set({ body: v }), { placeholder: 'e.g. Which of these matters most where you live?' })),
    h('div', { class: 'lx-field' }, h('span', {}, 'Choices'),
      h('ol', { class: 'tc-cardlist' }, opts.map((o, i) => h('li', {}, text(o, (v) => put(opts.map((x, j) => (j === i ? v : x))), { placeholder: `Choice ${i + 1}` }),
        canEdit && opts.length > 2 && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove choice', onclick: () => put(opts.filter((_, j) => j !== i)) }, icon('trash', 12))))),
      canEdit && opts.length < 8 && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => put([...opts, '']) }, icon('plus', 14), 'Add a choice')),
    h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: b.settings?.showResults !== false, onchange: (e) => set({ settings: { ...b.settings, showResults: e.target.checked } }) }), 'Show everyone the results after they answer'));
}

function ScenarioField(b, set) {
  const ch = b.settings?.choices ?? [{ text: '', outcome: '' }, { text: '', outcome: '' }];
  const put = (list) => set({ settings: { ...b.settings, choices: list } });
  return h('div', { class: 'lx-field' }, h('span', {}, 'What could they do? (one step for now; branches deeper come later)'),
    h('ol', { class: 'tc-cardlist' }, ch.map((x, i) => h('li', {},
      text(x.text, (v) => put(ch.map((y, j) => (j === i ? { ...y, text: v } : y))), { placeholder: `Choice ${i + 1}` }),
      text(x.outcome, (v) => put(ch.map((y, j) => (j === i ? { ...y, outcome: v } : y))), { placeholder: 'What happens' }),
      canEdit && ch.length > 2 && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove choice', onclick: () => put(ch.filter((_, j) => j !== i)) }, icon('trash', 12))))),
    canEdit && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => put([...ch, { text: '', outcome: '' }]) }, icon('plus', 14), 'Add a choice'));
}

/** A learner's-eye view of the block, updated as you type. */
function LearnerPreview(c, b) {
  const t = blockType(b.type);
  const tone = c.tracks.find((x) => x.id === b.trackId)?.tone ?? '#888';
  const head = h('div', { class: 'tc-pv-head', style: `--tone:${tone}` }, h('span', {}, icon(t.icon, 14)), h('small', {}, `${t.label}${b.minutes ? ` · about ${b.minutes} min` : ''}${b.required ? '' : ' · optional'}`));
  let bodyEl;
  if (b.type === 'lesson') {
    bodyEl = lessonSections(b).map((x) => x.kind === 'image' ? (x.src ? h('img', { src: x.src, alt: x.decorative ? '' : x.alt ?? '' }) : h('div', { class: 'tc-pv-ph' }, icon('image', 18), 'A picture'))
      : x.kind === 'video' ? h('div', { class: 'tc-pv-ph' }, icon('video', 18), x.text || 'A video')
        : x.kind === 'callout' ? h('div', { class: 'tc-pv-callout' }, icon('lightbulb', 14), h('div', {}, Markdown(x.text || '…')))
          : x.kind === 'question' ? h('div', { class: 'tc-pv-question' }, h('b', {}, 'Think about'), h('p', {}, x.text || '…'))
            : h('div', { class: 'tc-pv-text' }, Markdown(x.text || '')));
  } else if (b.type === 'slideshow') {
    bodyEl = [h('div', { class: 'tc-pv-show' }, icon('play', 22), h('span', {}, b.ref ? 'The slideshow plays here' : 'Choose a show')), b.body && Markdown(b.body)];
  } else if (['quiz', 'exam'].includes(b.type)) {
    bodyEl = (b.settings?.questions ?? []).slice(0, 3).map((q, i) => h('div', { class: 'tc-pv-q' }, h('b', {}, `${i + 1}. ${q.q || 'A question'}`), h('ul', {}, q.options.map((o) => h('li', {}, o || '…')))));
  } else if (b.type === 'poll') {
    bodyEl = [h('b', {}, b.body || 'A question'), h('ul', { class: 'tc-pv-poll' }, (b.settings?.options ?? []).map((o) => h('li', {}, o || '…')))];
  } else if (b.type === 'flashcards') {
    const cd = b.settings?.cards?.[0];
    bodyEl = h('div', { class: 'tc-pv-card' }, h('b', {}, cd?.front || 'Front of a card'), h('small', {}, `Tap to turn over · ${n(b.settings?.cards?.length ?? 0, 'card')}`));
  } else {
    bodyEl = b.body ? h('div', { class: 'tc-pv-text' }, Markdown(b.body)) : h('p', { class: 'lx-note' }, 'Nothing written yet.');
  }
  return h('div', { class: 'tc-pv' }, head, h('h3', {}, b.title), bodyEl);
}

function WhiteboardField(c, b, set) {
  const board = b.ref?.plugin === 'collab' ? b.ref : null;
  return h('div', { class: 'lx-field' }, h('span', {}, 'Whiteboard (Collab, coming soon)'),
    h('div', { class: 'lx-row' },
      field('Template', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ settings: { ...b.settings, template: e.target.value } }) }, options(TEMPLATES, b.settings?.template ?? 'blank'))),
      canEdit && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { const brd = createBoard({ title: b.title, template: b.settings?.template, cartridgeId: c.id, blockId: b.id }); set({ ref: { plugin: 'collab', type: 'board', id: brd.id } }, 'Board made (pretend, until Collab arrives)'); } }, icon('brush', 14), board ? 'Make a new board' : 'Make the board')),
    h('small', {}, board ? `Board ${board.id}: ${templateLabel(b.settings?.template)}. A mock: the real board comes with the Collab plugin.` : 'Collab is Dashi’s whiteboard plugin to come. Making a board now reserves it for this block.'));
}

function QuestionsField(b, set) {
  const qs = b.settings?.questions ?? [];
  const put = (list) => set({ settings: { ...b.settings, questions: list } });
  return h('div', { class: 'lx-field' }, h('span', {}, `Questions (${qs.length})`),
    h('ol', { class: 'tc-qs' }, qs.map((q, i) => h('li', {},
      text(q.q, (v) => put(qs.map((x, j) => (j === i ? { ...x, q: v } : x))), { placeholder: 'The question' }),
      h('div', { class: 'tc-opts' }, q.options.map((o, k) => h('label', {},
        h('input', { type: 'radio', name: `q-${b.id}-${i}`, disabled: !canEdit, checked: q.answer === k, title: 'The right answer', onchange: () => put(qs.map((x, j) => (j === i ? { ...x, answer: k } : x))) }),
        text(o, (v) => put(qs.map((x, j) => (j === i ? { ...x, options: x.options.map((y, m) => (m === k ? v : y)) } : x))))))),
      canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: () => put(qs.filter((_, j) => j !== i)) }, icon('trash', 12), 'Remove question')))),
    canEdit && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => put([...qs, { q: '', options: ['', '', ''], answer: 0 }]) }, icon('plus', 14), 'Add a question'));
}

function ImageField(b, set) {
  const img = b.settings?.images?.[0] ?? null;
  const put = (patch) => set({ settings: { ...b.settings, images: [{ ...(img ?? {}), ...patch }] } });
  return h('div', { class: 'lx-field' }, h('span', {}, 'Picture'),
    h('div', { class: 'lx-row' },
      field('Picture address', text(img?.src, (v) => (v ? put({ src: v }) : set({ settings: { ...b.settings, images: [] } })), { placeholder: '/media/photos/nature/…' })),
      field('Alt text', text(img?.alt, (v) => put({ alt: v }), { placeholder: 'What the picture shows' }))),
    img?.src && h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!img.decorative, onchange: (e) => put({ decorative: e.target.checked }) }), 'Decorative only (screen readers skip it)'));
}

function openSettings(cid) {
  drawer?.close();
  const draw = () => {
    const c = doc.cartridges[cid];
    const set = (patch, note) => { setCartridge(updateCartridge(doc.cartridges[cid], patch), note); render(); drawer?.setBody(draw()); drawer?.setTitle(doc.cartridges[cid].title, 'Cartridge settings'); };
    return h('div', { class: 'lx-form' },
      field('Title', text(c.title, (v) => set({ title: v || 'Untitled cartridge' }))),
      field('Subtitle', text(c.subtitle, (v) => set({ subtitle: v }))),
      field('Summary', h('textarea', { class: 'textarea textarea-sm', rows: 3, disabled: !canEdit, value: c.summary ?? '', onchange: (e) => set({ summary: e.target.value }) }), 'Learners see this in the catalogue.'),
      h('div', { class: 'lx-row' },
        field('Kind', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ kind: e.target.value }) }, options(KINDS, c.kind))),
        field('Pacing', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ pacing: e.target.value }) }, options([{ id: 'cohort', label: 'Together, on the run’s dates' }, { id: 'self', label: 'Self-paced, from each learner’s start' }], c.pacing)))),
      h('div', { class: 'lx-row' },
        field('Day 0 (the start)', h('input', { type: 'date', class: 'input input-sm', disabled: !canEdit, value: c.run.start, onchange: (e) => e.target.value && set({ run: { ...c.run, start: e.target.value } }) }), 'Move the whole run; blocks keep their days.'),
        field('Hours a week, promised', h('input', { type: 'number', min: '0.5', step: '0.5', class: 'input input-sm', disabled: !canEdit, value: String(c.hoursPerWeek), onchange: (e) => set({ hoursPerWeek: Math.max(0.5, Number(e.target.value) || 3) }) }))),
      h('div', { class: 'lx-row' },
        field('Pre-start (days)', h('input', { type: 'number', min: '0', max: '60', class: 'input input-sm', disabled: !canEdit, value: String(c.span.pre), onchange: (e) => set({ span: { ...c.span, pre: Math.max(0, Number(e.target.value) || 0) } }) })),
        field('In session (weeks)', h('input', { type: 'number', min: '1', max: '52', class: 'input input-sm', disabled: !canEdit, value: String(Math.round(c.span.length / 7)), onchange: (e) => set({ span: { ...c.span, length: Math.max(1, Number(e.target.value) || 1) * 7 } }) })),
        field('Post-end (days)', h('input', { type: 'number', min: '0', max: '60', class: 'input input-sm', disabled: !canEdit, value: String(c.span.post), onchange: (e) => set({ span: { ...c.span, post: Math.max(0, Number(e.target.value) || 0) } }) }))),
      h('div', { class: 'lx-row' },
        field('Who can see it', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ visibility: e.target.value }) }, options([{ id: 'org', label: 'People in the organisation' }, { id: 'public', label: 'Anyone (an open offering)' }, { id: 'lyceum', label: 'Shared in the Lyceum (coming soon)' }], c.visibility))),
        field('Licence', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ licence: e.target.value }) }, options(['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'All rights reserved'].map((x) => ({ id: x, label: x })), c.licence)))),
      h('section', { class: 'lx-field' }, h('span', {}, 'Tracks'),
        h('ul', { class: 'tc-track-list' }, c.tracks.map((t, i) => h('li', { style: `--tone:${t.tone}` },
          h('i', { 'aria-hidden': 'true' }), h('b', {}, t.name), h('small', {}, trackKind(t.kind).label),
          canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', disabled: i === 0, 'aria-label': `Move ${t.name} up`, onclick: () => { setCartridge(moveTrack(doc.cartridges[cid], t.id, -1)); render(); drawer.setBody(draw()); } }, icon('chevronUp', 13)),
          canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Edit ${t.name}`, onclick: () => openTrack(cid, t.id) }, icon('pencil', 13))))),
        canEdit && h('div', { class: 'lx-row' }, TRACK_KINDS.map((k) => h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { setCartridge(addTrack(doc.cartridges[cid], k.id), `${k.label} track added`); render(); drawer.setBody(draw()); } }, icon('plus', 12), k.label)))),
      field('Credential (coming in a later stage)', text(c.credential?.name, (v) => set({ credential: { ...c.credential, name: v } }), { placeholder: 'e.g. Kestrel Grantmaking Volunteer' }), c.competencies?.length ? `Builds: ${c.competencies.map((k) => k.name).join(', ')}` : 'Microcredentials arrive with stage 5.'),
      h('div', { class: 'lx-row' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { const blob = new Blob([exportCartridge(c)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `${c.title.replace(/[^\w]+/g, '-').toLowerCase()}.cartridge.json` }); a.click(); URL.revokeObjectURL(a.href); } }, icon('download', 14), 'Save as .json'),
        canEdit && c.status === 'published' && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { set({ status: 'draft' }, 'Back to draft: learners keep the version they have'); } }, 'Unpublish'),
        canEdit && h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (await uiConfirm(`Delete “${c.title}” and all its blocks?`, { ok: 'Delete', danger: true })) { const next = { ...doc.cartridges }; delete next[cid]; doc = { ...doc, cartridges: next }; save('Cartridge deleted'); drawer.close(); location.hash = '#home'; } } }, icon('trash', 14), 'Delete')));
  };
  openDrawer({ title: doc.cartridges[cid].title, sub: 'Cartridge settings', wide: true, actions: [h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => drawer.close() }, 'Done')] });
  drawer.setBody(draw());
}

function openTrack(cid, tid) {
  drawer?.close();
  const draw = () => {
    const c = doc.cartridges[cid];
    const t = c.tracks.find((x) => x.id === tid);
    if (!t) return h('p', {}, 'That track is gone.');
    const set = (patch) => { setCartridge(updateTrack(doc.cartridges[cid], tid, patch)); render(); drawer.setBody(draw()); };
    return h('div', { class: 'lx-form' },
      field('Name', text(t.name, (v) => set({ name: v || trackKind(t.kind).label }))),
      field('Kind', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ kind: e.target.value }) }, options(TRACK_KINDS, t.kind))),
      field('Colour', h('div', { class: 'tc-swatches' }, WHEEL.map((w) => h('button', { type: 'button', class: t.tone === w.hex ? 'on' : '', style: `background:${w.hex}`, 'aria-label': w.label, title: w.label, disabled: !canEdit, onclick: () => set({ tone: w.hex }) })))),
      h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!t.muted, onchange: (e) => set({ muted: e.target.checked }) }), 'Hidden from learners while you draft'),
      canEdit && h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: async () => { const k = Object.values(c.blocks).filter((b) => b.trackId === tid).length; if (await uiConfirm(k ? `Remove “${t.name}” and its ${k} blocks?` : `Remove “${t.name}”?`, { ok: 'Remove', danger: true })) { setCartridge(removeTrack(doc.cartridges[cid], tid), 'Track removed'); drawer.close(); render(); } } }, icon('trash', 14), 'Remove track'));
  };
  openDrawer({ title: 'Track', sub: doc.cartridges[cid].tracks.find((x) => x.id === tid)?.name, actions: [h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => drawer.close() }, 'Done')] });
  drawer.setBody(draw());
}

function openPace(cid, pid) {
  if (!pid) return;
  drawer?.close();
  const draw = () => {
    const c = doc.cartridges[cid];
    const p = c.pace.find((x) => x.id === pid);
    if (!p) return h('p', {}, 'That note is gone.');
    const set = (patch) => { setCartridge(updatePace(doc.cartridges[cid], pid, patch)); render(); drawer.setBody(draw()); };
    return h('div', { class: 'lx-form' },
      field('Note', h('textarea', { class: 'textarea textarea-sm', rows: 3, disabled: !canEdit, value: p.text, onchange: (e) => set({ text: e.target.value }) })),
      h('div', { class: 'lx-row' },
        field('Day', h('input', { type: 'date', class: 'input input-sm', disabled: !canEdit, value: dateOf(c.run.start, p.day), onchange: (e) => e.target.value && set({ day: dayOf(c.run.start, e.target.value) }) })),
        field('For', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ to: e.target.value }) }, options([{ id: 'learners', label: 'Learners' }, { id: 'teachers', label: 'Teachers' }], p.to))),
        field('Send', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ send: e.target.value }) }, options([{ id: 'none', label: 'Just a note' }, { id: 'email', label: 'Email on the day (stage 3)' }], p.send)))),
      canEdit && h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: () => { setCartridge(removePace(doc.cartridges[cid], pid), 'Pace note removed'); drawer.close(); render(); } }, icon('trash', 14), 'Remove note'));
  };
  openDrawer({ title: 'Pace note', actions: [h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => drawer.close() }, 'Done')] });
  drawer.setBody(draw());
}

let pendingOpen = null;
addEventListener('hashchange', () => {
  drawer?.close();
  render();
  if (pendingOpen) { const [cid, bid] = pendingOpen; pendingOpen = null; openBlock(cid, bid); }
});
render();
