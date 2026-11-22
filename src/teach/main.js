import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Drawer } from '../ui/drawer.js';
import { uiConfirm } from '../ui/dialog.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadTeach, loadPodcasts, loadAssets } from '../platform/docs.js';
import { enabledPlugins, linkTo, currentWho } from '../plugins.js';
import {
  BLOCK_TYPES, BLOCK_GROUPS, TRACK_KINDS, KINDS, blockType, trackKind, kindLabel, blankCartridge, addBlock, updateBlock, removeBlock, duplicateBlock,
  addTrack, updateTrack, removeTrack, moveTrack, addPace, updatePace, removePace, updateCartridge, publish, unpublish, phases, dateOf, dayOf, shortDate,
  pathByWeek, cartridgeStats, exportCartridge, importCartridge,
} from '../learning/cartridge.js';
import { runChecks, canPublish, LEVELS, ruleLabel, udlBalance } from '../learning/checks.js';
import { TEMPLATES, createBoard, templateLabel } from '../learning/collab.js';
import { About } from '../learning/About.js';
import { Timeline, ZOOMS, HEAD_WIDTH } from './Timeline.js';
import { WHEEL } from '../ui/wheel.js';

/**
 * Teach (eLearning stage 1, experimental): the cartridge editor. A DAW
 * turned towards a calendar: tracks of blocks on a timeline of course days.
 *
 *   #home                  every cartridge
 *   #new                   start a new one
 *   #c/<id>                the timeline, with the checks beside it
 *   #c/<id>/path           the learner's-eye outline, week by week
 *   #c/<id>/checks         every check, with why it matters
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
const me = currentWho(org).staffId;
const today = new Date().toISOString().slice(0, 10);
const ZOOM_KEY = 'dashi.teach-zoom';
let zoom = (() => { try { return localStorage.getItem(ZOOM_KEY) || 'fit'; } catch { return 'fit'; } })();
let selected = null;
let drawer = null;

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
  drawSide(view, id);
  if (view === 'new') return newCartridge();
  let page;
  if (view === 'c' && doc.cartridges[id]) page = sub === 'path' ? PathPage(doc.cartridges[id]) : sub === 'checks' ? ChecksPage(doc.cartridges[id]) : TimelinePage(doc.cartridges[id]);
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

function drawSide(view, id) {
  const list = cartridges();
  side = swapSide(side, SideNav({ label: 'Teach', sections: [
    { title: 'Teach · experimental', items: [
      { label: 'Cartridges', sub: `${n(list.length, 'cartridge')} · ${list.filter((c) => c.status === 'published').length} published`, icon: 'tiles', href: '#home', on: view === 'home' },
      { label: 'Block types', sub: `${BLOCK_TYPES.length} kinds of block`, icon: 'listBullets', href: '#blocks', on: view === 'blocks' },
      { label: 'About', sub: 'Quick reference and tutorials', icon: 'help', href: '#about', on: view === 'about' },
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
  tabs: [{ id: 'home', label: 'Cartridges', icon: 'tiles' }, { id: 'blocks', label: 'Block types', icon: 'listBullets' }, { id: 'about', label: 'About', icon: 'help' }],
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
      [['', 'Timeline', 'timeline'], ['path', 'Path', 'listNumbers'], ['checks', `Checks${issues.length ? ` (${issues.length})` : ''}`, 'checklist']].map(([s, label, ic]) =>
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
  const days = c.span.pre + c.span.length + c.span.post;
  // Fit: the whole run in the window, from pre-start to post-end.
  const wide = main.clientWidth || 1100;
  const asideW = wide > 1500 ? 314 : 0;
  const fit = Math.max(8, Math.floor((wide - 60 - asideW - HEAD_WIDTH - 4) / days));
  const ppd = ZOOMS.find((z) => z.id === zoom)?.ppd ?? fit;
  const tl = Timeline({
    cartridge: c, issues, ppd, today, selected, canEdit,
    onChange: (next, id) => { selected = id; setCartridge(next); render(); },
    onOpen: (id) => { selected = id; render(); openBlock(c.id, id); },
    onAdd: ({ type, trackId, start }) => add(c.id, { type, trackId, start }),
    onPace: (pid, day) => (pid ? openPace(c.id, pid) : add(c.id, null, day)),
    onTrack: (tid, what) => {
      if (what === 'mute') { const t = c.tracks.find((x) => x.id === tid); setCartridge(updateTrack(c, tid, { muted: !t.muted }), t.muted ? `${t.name} shows to learners` : `${t.name} hidden from learners`); render(); }
      else openTrack(c.id, tid);
    },
  });
  return h('div', { class: 'lx-wrap tc-wide' }, tabs('home'),
    CartridgeBar(c, ''),
    h('div', { class: 'tc-work' },
      h('div', { class: 'tc-stage' }, tl, canEdit && Palette(c)),
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

/** The block palette: a floating, draggable panel (the Plan designer's tool panel). */
const PAL_KEY = 'dashi.teach-palette';
function Palette(c) {
  let pos = { x: null, y: 430, folded: false };
  try { pos = { ...pos, ...JSON.parse(localStorage.getItem(PAL_KEY) ?? '{}') }; } catch { /* fine */ }
  const keep = () => { try { localStorage.setItem(PAL_KEY, JSON.stringify(pos)); } catch { /* fine */ } };
  const panel = h('aside', { class: `tc-palette${pos.folded ? ' folded' : ''}`, 'aria-label': 'Block palette' });
  if (pos.x != null) { panel.style.left = `${pos.x}px`; panel.style.right = 'auto'; }
  panel.style.top = `${pos.y}px`;
  const head = h('header', { class: 'tc-pal-head' }, icon('dragHandle', 14), h('b', {}, 'Blocks'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': pos.folded ? 'Open the palette' : 'Fold the palette', onclick: () => { pos.folded = !pos.folded; panel.classList.toggle('folded', pos.folded); keep(); } }, icon(pos.folded ? 'chevronDown' : 'chevronUp', 14)));
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = (ev) => { pos.x = Math.max(0, Math.min(innerWidth - 120, ev.clientX - dx)); pos.y = Math.max(60, Math.min(innerHeight - 60, ev.clientY - dy)); panel.style.left = `${pos.x}px`; panel.style.right = 'auto'; panel.style.top = `${pos.y}px`; };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); keep(); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
  panel.append(head, h('div', { class: 'tc-pal-body' },
    h('p', { class: 'tc-pal-tip' }, 'Drag onto a track, or click to add.'),
    BLOCK_GROUPS.map((g) => h('section', {}, h('h4', {}, g),
      BLOCK_TYPES.filter((t) => t.group === g).map((t) => {
        const tone = trackKind(t.track).tone;
        const item = h('button', { type: 'button', class: 'tc-pal-item', draggable: 'true', style: `--tone:${tone}`, title: t.blurb,
          onclick: () => add(c.id, { type: t.id, start: Math.max(0, Math.min(c.span.length - 1, dayOf(c.run.start, today))) }) },
        icon(t.icon, 14), t.label);
        item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-dashi-block', t.id); e.dataTransfer.effectAllowed = 'copy'; });
        return item;
      })))));
  return panel;
}

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

function PathPage(c) {
  setCrumbs([{ label: 'Path' }]);
  const weeks = pathByWeek(c, { teacher: true });
  const muted = new Set(c.tracks.filter((t) => t.muted).map((t) => t.id));
  return h('div', { class: 'lx-wrap' }, tabs('home'), CartridgeBar(c, 'path'),
    h('p', { class: 'lx-note' }, 'The cartridge as a learner moves through it, week by week. Greyed blocks are on hidden tracks.'),
    h('div', { class: 'tc-path' }, weeks.map((w) => h('section', { class: 'lx-panel' },
      h('h3', {}, w.label, h('small', {}, ` ${shortDate(dateOf(c.run.start, w.from))} – ${shortDate(dateOf(c.run.start, w.to - 1))} · about ${Math.round(w.blocks.reduce((k, b) => k + (Number(b.minutes) || 0), 0) / 6) / 10} h`)),
      h('ol', { class: 'tc-path-list' }, w.blocks.map((b) => {
        const t = c.tracks.find((x) => x.id === b.trackId);
        return h('li', { class: muted.has(b.trackId) ? 'muted' : '', style: `--tone:${t?.tone ?? '#999'}` },
          h('button', { type: 'button', onclick: () => openBlock(c.id, b.id) }, icon(blockType(b.type).icon, 14), h('b', {}, b.title),
            h('small', {}, `${blockType(b.type).label} · ${shortDate(dateOf(c.run.start, b.start))}${b.at ? ` ${b.at}` : ''}${b.minutes ? ` · ${b.minutes} min` : ''}${b.required ? '' : ' · optional'}${b.after?.length ? ' · waits for another block' : ''}`)));
      }))))));
}

function ChecksPage(c) {
  setCrumbs([{ label: 'Checks' }]);
  const issues = runChecks(c);
  const byRule = [...new Set(issues.map((i) => i.rule))];
  return h('div', { class: 'lx-wrap' }, tabs('home'), CartridgeBar(c, 'checks'),
    h('p', { class: 'lx-note' }, 'Teach checks the design as you work, never the learners. Red ones stop publishing; the rest explain themselves.'),
    issues.length ? h('div', { class: 'tc-rules' }, byRule.map((r) => {
      const list = issues.filter((i) => i.rule === r);
      return h('section', { class: 'lx-panel' }, h('h3', {}, ruleLabel(r), h('small', {}, ` ${list.length}`)), h('p', { class: 'lx-note' }, list[0].why), h('ul', { class: 'tc-issues' }, list.map(Issue(c))));
    })) : h('section', { class: 'lx-panel' }, h('p', {}, icon('check', 15), ' Everything checks out.')));
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

function openBlock(cid, bid) {
  drawer?.close();
  const draw = () => {
    const c = doc.cartridges[cid];
    const b = c?.blocks[bid];
    if (!b) { drawer?.close(); return null; }
    const t = blockType(b.type);
    const set = (patch, note) => { setCartridge(updateBlock(doc.cartridges[cid], bid, patch), note); render(); drawer?.setBody(draw()); drawer?.setTitle(doc.cartridges[cid].blocks[bid].title, sub()); };
    const sub = () => { const x = doc.cartridges[cid].blocks[bid]; return `${blockType(x.type).label} · ${shortDate(dateOf(c.run.start, x.start))}${x.length > 1 ? ` – ${shortDate(dateOf(c.run.start, x.start + x.length - 1))}` : ''}`; };
    const issues = runChecks(c).filter((i) => i.blockId === bid);
    const others = Object.values(c.blocks).filter((x) => x.id !== bid && x.start <= b.start).sort((x, y) => x.start - y.start);
    const episodes = Object.values(podcasts?.episodes ?? {}).sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
    const refPicker = ['slideshow', 'podcast'].includes(b.type) && field(b.type === 'slideshow' ? 'Slideshow podcast' : 'Episode',
      h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ ref: e.target.value ? { plugin: 'podcasts', type: 'episode', id: e.target.value } : null }) },
        h('option', { value: '' }, '— choose a show —'),
        b.ref && !podcasts?.episodes?.[b.ref.id] && h('option', { value: b.ref.id, selected: true }, `${b.ref.id} (not in the station yet: a sample deck plays)`),
        episodes.map((e) => h('option', { value: e.id, selected: b.ref?.id === e.id }, e.title))),
      b.type === 'slideshow' ? 'Shows are made in the Studio; the cartridge links to them and never copies them.' : null);
    const assetItems = Object.values(assets?.items ?? {}).filter((a) => a.kind !== 'ref').slice(0, 200);
    const body = h('div', { class: 'lx-form' },
      issues.length > 0 && h('ul', { class: 'tc-issues tc-drawer-issues' }, issues.map((i) => h('li', { class: `l-${i.level}` }, h('i', { class: `tc-lvl l-${i.level}` }), h('span', {}, i.title, h('small', {}, i.why))))),
      field('Title', text(b.title, (v) => set({ title: v || t.label }))),
      h('div', { class: 'lx-row' },
        field('Track', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ trackId: e.target.value }) }, options(c.tracks.map((x) => ({ id: x.id, label: x.name })), b.trackId))),
        field('Kind', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ type: e.target.value }) }, BLOCK_GROUPS.map((g) => h('optgroup', { label: g }, options(BLOCK_TYPES.filter((x) => x.group === g).map((x) => ({ id: x.id, label: x.label })), b.type)))))),
      h('div', { class: 'lx-row' },
        field('Opens', h('input', { type: 'date', class: 'input input-sm', disabled: !canEdit, value: dateOf(c.run.start, b.start), onchange: (e) => e.target.value && set({ start: dayOf(c.run.start, e.target.value) }) }), `Day ${b.start}${c.pacing === 'self' ? ', from each learner’s start' : ''}`),
        field('Days open', h('input', { type: 'number', min: '1', max: '120', class: 'input input-sm', disabled: !canEdit, value: String(b.length), onchange: (e) => set({ length: Math.max(1, Number(e.target.value) || 1) }) })),
        field('Time', h('input', { type: 'time', class: 'input input-sm', disabled: !canEdit, value: b.at ?? '', onchange: (e) => set({ at: e.target.value || null }) }), c.run.tz)),
      h('div', { class: 'lx-row' },
        field('Learner effort (minutes)', h('input', { type: 'number', min: '0', max: '600', step: '5', class: 'input input-sm', disabled: !canEdit, value: String(b.minutes ?? 0), onchange: (e) => set({ minutes: Math.max(0, Number(e.target.value) || 0) }) })),
        h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!b.required, onchange: (e) => set({ required: e.target.checked }) }), 'Required to finish')),
      refPicker,
      b.type === 'resource' && field('Asset', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ ref: e.target.value ? { plugin: 'assets', type: 'item', id: e.target.value } : null }) },
        h('option', { value: '' }, '— a link instead —'), assetItems.map((a) => h('option', { value: a.id, selected: b.ref?.id === a.id }, a.title ?? a.id)))),
      ['live', 'office', 'meetup', 'resource', 'video'].includes(b.type) && field(b.type === 'video' ? 'Video link' : b.type === 'resource' ? 'Link' : 'Meeting link (Zoom, Meet, Teams)', text(b.settings?.url, (v) => set({ settings: { ...b.settings, url: v } }), { type: 'url', placeholder: 'https://' })),
      b.type === 'office' && field('Repeats', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ settings: { ...b.settings, repeat: e.target.value } }) }, options([{ id: 'none', label: 'Just this once' }, { id: 'weekly', label: 'Every week of the run' }], b.settings?.repeat ?? 'none'))),
      b.type === 'whiteboard' && WhiteboardField(c, b, set),
      ['quiz', 'exam'].includes(b.type) && h('div', { class: 'lx-row' },
        field('Time limit (minutes, 0 for none)', h('input', { type: 'number', min: '0', class: 'input input-sm', disabled: !canEdit, value: String(b.settings?.timeLimit ?? 0), onchange: (e) => set({ settings: { ...b.settings, timeLimit: Math.max(0, Number(e.target.value) || 0) } }) })),
        h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: !!b.settings?.extensions, onchange: (e) => set({ settings: { ...b.settings, extensions: e.target.checked } }) }), 'Teachers can grant extensions')),
      ['quiz', 'exam'].includes(b.type) && QuestionsField(b, set),
      b.type === 'assignment' && field('Learners hand in', h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => set({ settings: { ...b.settings, handIn: e.target.value } }) }, options([{ id: 'doc', label: 'A Dashi doc' }, { id: 'file', label: 'A file' }, { id: 'any', label: 'Their choice: a doc, a file, audio or video' }], b.settings?.handIn ?? 'doc')), 'Offering a choice of format is the UDL way.'),
      field(['lesson', 'reading'].includes(b.type) ? 'Words' : 'Instructions or prompt', h('textarea', { class: 'textarea textarea-sm', rows: ['lesson', 'reading'].includes(b.type) ? 7 : 4, disabled: !canEdit, value: b.body ?? '', onchange: (e) => set({ body: e.target.value }) }), 'Short and plain: a few hundred words at most. **Bold** and *italic* work.'),
      ['lesson'].includes(b.type) && ImageField(b, set),
      field('Other ways in', h('div', { class: 'lx-chips' }, [['transcript', 'Transcript'], ['captions', 'Captions'], ['reading', 'Reading version'], ['audio', 'Audio version']].map(([k, label]) =>
        h('label', { class: 'lx-chip' }, h('input', { type: 'checkbox', disabled: !canEdit, checked: (b.alts ?? []).includes(k), onchange: (e) => set({ alts: e.target.checked ? [...(b.alts ?? []), k] : (b.alts ?? []).filter((a) => a !== k) }) }), label))),
        t.media ? 'Audio and video need a transcript or captions before publishing.' : 'Alternatives let learners choose how they take it in.'),
      others.length > 0 && field('Waits for', h('select', { class: 'select select-sm', multiple: true, size: Math.min(5, others.length), disabled: !canEdit, onchange: (e) => set({ after: [...e.target.selectedOptions].map((o) => o.value) }) },
        others.map((x) => h('option', { value: x.id, selected: (b.after ?? []).includes(x.id) }, `${x.title} (${shortDate(dateOf(c.run.start, x.start))})`))), 'Learners can open this once those are done. Leave empty for a free choice.'),
      c.competencies?.length > 0 && field('Builds towards', h('div', { class: 'lx-chips' }, c.competencies.map((k) => h('label', { class: 'lx-chip' }, h('input', { type: 'checkbox', disabled: !canEdit, checked: (b.competencies ?? []).includes(k.id), onchange: (e) => set({ competencies: e.target.checked ? [...(b.competencies ?? []), k.id] : (b.competencies ?? []).filter((x) => x !== k.id) }) }), k.name)))),
      h('label', { class: 'lx-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', disabled: !canEdit, checked: b.settings?.visibility === 'teachers', onchange: (e) => set({ settings: { ...b.settings, visibility: e.target.checked ? 'teachers' : 'learners' } }) }), 'Teachers only (a note to yourself)'));
    drawer?.setActions?.(canEdit ? [
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (await uiConfirm(`Remove “${b.title}”?`, { ok: 'Remove', danger: true })) { setCartridge(removeBlock(doc.cartridges[cid], bid), 'Block removed'); selected = null; drawer.close(); render(); } } }, icon('trash', 14), 'Remove'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { const r = duplicateBlock(doc.cartridges[cid], bid); setCartridge(r.cartridge, 'Copied a week later'); selected = r.id; render(); openBlock(cid, r.id); } }, icon('copy', 14), 'Copy to next week'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => drawer.close() }, 'Done'),
    ] : []);
    return body;
  };
  const c = doc.cartridges[cid];
  const b = c.blocks[bid];
  const t = blockType(b.type);
  const tone = c.tracks.find((x) => x.id === b.trackId)?.tone ?? '#888';
  openDrawer({ title: b.title, sub: `${t.label} · ${shortDate(dateOf(c.run.start, b.start))}`, lead: h('span', { class: 'tc-lead', style: `background:${tone}` }, icon(t.icon, 18)),  });
  drawer.setBody(draw());
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
