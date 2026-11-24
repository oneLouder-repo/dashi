import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { svg } from '../core/svg.js';
import { wheel, tint, inkOn } from '../ui/wheel.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Markdown } from '../ui/markdown.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadTeach, loadLearn, loadPodcasts } from '../platform/docs.js';
import { enabledPlugins, linkTo, currentWho } from '../plugins.js';
import { lessonSections, blockType, pathByWeek, dateOf, shortDate, kindLabel, weekOf, weekLabel, phaseOf } from '../learning/cartridge.js';
import { personOf, settingsOf, enrol, leave, markDone, saveNote, saveAnswer, setLast, saveSettings, progress, isOpen, nextBlock, dueSoon, todayDay, startFor, recordLines, toStatement } from '../learning/records.js';
import { bestInk } from '../learning/checks.js';
import { getBoard, templateLabel } from '../learning/collab.js';
import { playShow } from '../learning/show.js';
import { About } from '../learning/About.js';
import { uiConfirm } from '../ui/dialog.js';
import { shelfFor, suggestedFor, setShelf, sortShelf, SHELF_FILTERS, SHELF_SORTS, STATUS_LABEL } from '../learning/distribution.js';

/**
 * Learn (eLearning stage 2, experimental): the learner's own space. It
 * plays published cartridges made in Teach, keeps each person's progress,
 * reflections and settings in Learn's own document, and shows the learner
 * everything it keeps. No leaderboards, no tracking beyond what's shown.
 *
 *   #home                      My learning: up next, this week, your courses
 *   #courses                   my courses: filter, sort, pin, hide, leave
 *   #catalogue                 published cartridges to join
 *   #play/<cartridge>[/<block>] the player
 *   #preview/<cartridge>[/<block>] a teacher's preview, nothing saved
 *   #record                    everything Learn keeps about you
 *   #settings                  text size, font, motion, captions
 *   #about                     quick reference and tutorials
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'learn', org });
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');
app.classList.add('frame', 'ln-app');
let side = h('nav');
const main = h('section', { class: 'palette-main ln-main' });
app.replaceChildren(side, main);

const canSave = canWriteDoc('learn');
const teach = loadTeach();
let doc = loadLearn();
const podcasts = plugins.has('podcasts') ? loadPodcasts() : null;
const meId = currentWho(org).staffId ?? 'me';
const me = org.staff?.[meId] ?? null;
const today = new Date().toISOString().slice(0, 10);
let show = null; // the playing slideshow, stopped when the block changes

const route = () => (location.hash.slice(1) || 'home').split('/').map(decodeURIComponent);
const published = () => Object.values(teach.cartridges ?? {}).filter((c) => c.status === 'published');
const mine = () => personOf(doc, meId);
const enrolment = (cid) => mine().enrolments?.[cid] ?? null;
const myCourses = () => Object.keys(mine().enrolments ?? {}).map((id) => teach.cartridges?.[id]).filter(Boolean);
/** My list, as Learn shows it: joined courses and assigned ones, with how I've arranged them. */
const shelf = () => shelfFor(teach, doc, org, meId, today);
const shelfItem = (cid) => shelf().find((x) => x.c.id === cid) ?? null;
/** Courses I'm in and haven't hidden, for what's next and this week. */
const activeCourses = () => myCourses().filter((c) => !mine().shelf?.[c.id]?.hidden);
const SHELF_KEY = 'dashi.learn.shelf';
let shelfView = (() => { try { return { filter: 'all', sort: 'due', q: '', ...JSON.parse(localStorage.getItem(SHELF_KEY) ?? '{}') }; } catch { return { filter: 'all', sort: 'due', q: '' }; } })();
const keepShelfView = () => { try { localStorage.setItem(SHELF_KEY, JSON.stringify({ filter: shelfView.filter, sort: shelfView.sort })); } catch { /* fine for this page */ } };
function save(next, note) {
  doc = next;
  if (canSave) saveDoc('learn', doc);
  if (note) toast(note);
}
const toneOf = (c, b) => c.tracks.find((t) => t.id === b.trackId)?.tone ?? '#3e8fa6';
const n = (k, word, plural = `${word}s`) => `${k} ${k === 1 ? word : plural}`;

function applySettings() {
  const s = settingsOf(doc, meId);
  document.body.classList.toggle('ln-text-l', s.textSize === 'l');
  document.body.classList.toggle('ln-text-xl', s.textSize === 'xl');
  document.body.classList.toggle('ln-font-readable', s.font === 'readable');
  document.body.classList.toggle('ln-calm', s.motion === 'calm');
}

function render() {
  show?.destroy?.();
  show = null;
  applySettings();
  const [view, a, b] = route();
  document.body.classList.toggle('ln-focus', (view === 'play' || view === 'preview') && !!teach.cartridges?.[a] && focusOn());
  drawSide(view, a);
  let page;
  if ((view === 'play' || view === 'preview') && teach.cartridges?.[a]) page = Player(teach.cartridges[a], b, view === 'preview');
  else if (view === 'catalogue') page = Catalogue();
  else if (view === 'courses') page = Courses();
  else if (view === 'record') page = Record();
  else if (view === 'settings') page = Settings();
  else if (view === 'about') page = h('div', { class: 'lx-wrap' }, tabs('about'), About({ arg: a, title: 'What Learn does', rerender: render,
    intro: 'Learn is your own learning space. Take the courses, workshops and modules your organisation makes in Teach, week by week, at your own pace or with a group. Your progress, notes and reflections are yours, and Learn shows you everything it keeps.',
    refs: [
      ['The pages', [['My learning', 'What’s next, what’s due this week, your courses'], ['Catalogue', 'Courses you can join'], ['My record', 'Everything Learn keeps about you, in plain words'], ['Settings', 'Text size, a readable font, less motion, captions']]],
      ['In a course', [['The path', 'Each week on the left, ticked as you go'], ['Mark done', 'When you’ve finished a block; shows and quizzes mark themselves'], ['A dashed circle', 'A block that opens later, or after another one'], ['Optional', 'Nice to do, never needed to finish']]],
    ],
    data: 'Learn keeps your enrolments, what you’ve finished, your answers and reflections, and your settings, in your organisation’s Learn document. Nothing tracks where you look or how long you linger, and nothing ranks you against anyone.' }));
  else page = Home();
  main.replaceChildren(page);
  main.scrollTop = 0;
}

function drawSide(view, a) {
  const courses = myCourses();
  side = swapSide(side, SideNav({ label: 'Learn', sections: [
    { title: 'Learn · experimental', items: [
      { label: 'My learning', sub: `${n(courses.length, 'course')} · what’s next`, icon: 'graduation', href: '#home', on: view === 'home' },
      { label: 'My courses', sub: shelfSub(), icon: 'checklist', href: '#courses', on: view === 'courses' },
      { label: 'Catalogue', sub: `${n(published().filter((c) => !enrolment(c.id)).length, 'course')} to join`, icon: 'books', href: '#catalogue', on: view === 'catalogue' },
      { label: 'My record', sub: 'Everything Learn keeps about you', icon: 'history', href: '#record', on: view === 'record' },
      { label: 'Settings', sub: 'Text, font, motion, captions', icon: 'textAa', href: '#settings', on: view === 'settings' },
      { label: 'About', sub: 'Quick reference and tutorials', icon: 'help', href: '#about', on: view === 'about' },
    ] },
    courses.length && { title: 'Your courses', items: courses.filter((c) => !mine().shelf?.[c.id]?.hidden).sort((a, b) => !!mine().shelf?.[b.id]?.pinned - !!mine().shelf?.[a.id]?.pinned).map((c) => ({ label: c.title, sub: `${progress(c, enrolment(c.id)).pct}% · ${kindLabel(c.kind).toLowerCase()}`, icon: 'sec-learn', href: `#play/${c.id}`, on: view === 'play' && a === c.id })) },
    { title: 'Elsewhere in Dashi', items: [{ label: 'Teach', sub: 'Make a course', icon: 'sec-teach', href: linkTo('teach', '#home') }] },
    { title: 'Coming next', items: [{ label: 'Credentials', sub: 'Microcredentials you earn', icon: 'seal' }, { label: 'Lyceum', sub: 'Open learning across Dashi', icon: 'globe' }] },
  ].filter(Boolean) }));
}

const tabs = (current) => PluginHeader('learn', {
  tabs: [{ id: 'home', label: 'My learning', icon: 'graduation' }, { id: 'courses', label: 'My courses', icon: 'checklist' }, { id: 'catalogue', label: 'Catalogue', icon: 'books' }, { id: 'record', label: 'My record', icon: 'history' }, { id: 'settings', label: 'Settings', icon: 'textAa' }, { id: 'about', label: 'About', icon: 'help' }],
  current,
});

/* ------------------------------------------------------------------ home */

function shelfSub() {
  const list = shelf();
  const due = list.filter((x) => x.assigned && x.status !== 'finished').length;
  return due ? `${n(due, 'course')} assigned to you` : 'Filter, sort, pin and hide';
}

function Home() {
  setCrumbs([]);
  const courses = activeCourses();
  const list = shelf().filter((x) => !x.hidden);
  const ordered = list.filter((x) => x.e).sort((a, b) => (b.pinned - a.pinned) || (b.last ?? '').localeCompare(a.last ?? ''));
  const waiting = list.filter((x) => !x.e).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const first = (me?.name ?? '').split(' ')[0];
  const next = courses.map((c) => ({ c, b: nextBlock(c, enrolment(c.id), today) })).filter((x) => x.b);
  const due = courses.flatMap((c) => dueSoon(c, enrolment(c.id), today, 7).map((d) => ({ ...d, c }))).sort((x, y) => x.date.localeCompare(y.date));
  return h('div', { class: 'lx-wrap' }, tabs('home'),
    h('div', { class: 'ln-hello' }, h('h2', {}, first ? `Hello, ${first}` : 'Hello'), h('p', { class: 'lx-note' }, list.length ? 'Here’s where you are. Go at a pace that works for you.' : 'You’re not in a course yet. Have a look in the catalogue.')),
    list.length ? h('div', { class: 'ln-grid' },
      h('section', { class: 'lx-stack' },
        next.length ? Hero(next[0].c, next[0].b) : h('section', { class: 'lx-panel' }, h('h3', {}, icon('play', 15), 'Up next'), h('p', { class: 'lx-note' }, 'You’re all caught up. Well done.')),
        next.length > 1 && h('section', { class: 'lx-panel' }, h('h3', {}, icon('play', 15), 'Also up next'), h('div', { class: 'ln-next' }, next.slice(1).map(({ c, b }) => NextCard(c, b)))),
        waiting.length > 0 && h('section', { class: 'lx-panel ln-assigned' }, h('h3', {}, icon('flag', 15), 'Assigned to you'),
          h('p', { class: 'lx-note' }, 'Your organisation asked you to take these. Start whenever suits you before the date.'),
          h('ul', { class: 'ln-shelf' }, waiting.map(ShelfRow))),
        h('section', { class: 'lx-panel' }, h('div', { class: 'lx-ahead' }, h('h3', {}, icon('graduation', 15), 'Your courses'), h('a', { class: 'lx-more', href: '#courses' }, 'Manage your courses →')),
          h('div', { class: 'ln-courses' }, ordered.map((x) => CourseCard(x.c))))),
      h('section', { class: 'lx-panel' }, h('h3', {}, icon('calendar', 15), 'This week'),
        due.length ? h('ul', { class: 'ln-due' }, due.map(({ block, date, c }) => h('li', {}, h('time', { datetime: date }, date === today ? 'Today' : shortDate(date)),
          h('span', {}, h('a', { href: `#play/${c.id}/${block.id}` }, block.title), h('small', {}, `${blockType(block.type).label}${block.at ? ` at ${block.at}` : ''} · ${c.title}`))))) : h('p', { class: 'lx-note' }, 'Nothing due in the next seven days.'),
        h('p', { class: 'lx-note' }, 'Dates are reminders, not deadlines carved in stone. If life gets in the way, tell your teacher: that’s what office hours are for.')))
      : h('a', { class: 'btn btn-primary btn-sm', href: '#catalogue' }, icon('books', 14), 'Browse the catalogue'));
}

function Hero(c, b) {
  const t = blockType(b.type);
  const tone = toneOf(c, b);
  const e = enrolment(c.id);
  const p = progress(c, e);
  return h('section', { class: 'ln-hero', style: `--tone:${tone};--wash:${tint(tone, 0.86)};--cover:${coverOf(c)}` },
    h('span', { class: 'ln-hero-ic', style: `color:${inkOn(tone)}`, 'aria-hidden': 'true' }, icon(t.icon, 28)),
    h('div', { class: 'ln-hero-text' },
      h('span', { class: 'ln-eyebrow' }, `Up next · ${c.title}`),
      h('h3', {}, b.title),
      h('p', {}, `${t.label}${b.minutes ? ` · about ${b.minutes} minutes` : ''}${b.required ? '' : ' · optional'}`)),
    h('div', { class: 'ln-hero-go' },
      Ring(p.pct, 48),
      h('a', { class: 'btn btn-primary', href: `#play/${c.id}/${b.id}` }, e?.done && Object.keys(e.done).length ? 'Continue' : 'Start', icon('chevronRight', 14))));
}

function NextCard(c, b) {
  const t = blockType(b.type);
  const tone = toneOf(c, b);
  return h('div', { class: 'ln-next-card', style: `--tone:${tone};--ink:${bestInk(tone)}` },
    h('span', { class: 'ln-ic', 'aria-hidden': 'true' }, icon(t.icon, 20)),
    h('div', {}, h('b', {}, b.title), h('small', {}, `${t.label} · ${c.title}${b.minutes ? ` · about ${b.minutes} min` : ''}`)),
    h('a', { class: 'btn btn-sm btn-primary', href: `#play/${c.id}/${b.id}` }, 'Open'));
}

function CourseCard(c, { join = false, note = '' } = {}) {
  const e = enrolment(c.id);
  const p = progress(c, e);
  const day = todayDay(c, e, today);
  const where = c.pacing === 'self' ? 'Self-paced' : day < 0 ? `Starts ${shortDate(c.run.start)}` : phaseOf(c, day) === 'session' ? `${weekLabel(weekOf(day))} of ${Math.ceil(c.span.length / 7)}` : phaseOf(c, day) === 'post' ? 'Wrapping up' : 'Finished';
  const cover = coverOf(c);
  return h(join ? 'div' : 'a', { class: 'ln-course', style: `--cover:${cover};--cover-ink:${inkOn(cover)}`, ...(join ? {} : { href: `#play/${c.id}` }) },
    h('div', { class: 'ln-cover', 'aria-hidden': 'true' }, h('span', {}, c.series ? `${c.series} · ${kindLabel(c.kind)}` : kindLabel(c.kind)), e && Ring(p.pct, 48)),
    h('div', { class: 'ln-course-text' },
      h('h3', {}, c.title),
      c.subtitle && h('p', {}, c.subtitle),
      h('p', { class: 'ln-course-meta' }, `${where} · about ${c.hoursPerWeek} h a week`),
      !join && Badges(shelfItem(c.id)),
      e ? h('span', { class: 'ln-progress-label' }, `${p.done} of ${p.of} required blocks done`)
        : join && h('div', { class: 'lx-row' },
          c.summary && h('p', {}, c.summary),
          note && h('p', { class: 'ln-offer-note' }, icon('quotes', 13), note),
          h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: !canSave, onclick: () => { save(enrol(doc, meId, c), `You joined ${c.title}`); location.hash = `#play/${c.id}`; } }, icon('plus', 14), 'Join'))));
}

/* ------------------------------------------------------------ my courses */

/** Little tags on a course: assigned and when by, pinned. */
function Badges(x) {
  if (!x || (!x.assigned && !x.pinned)) return null;
  return h('div', { class: 'ln-badges' },
    x.pinned && h('span', { class: 'ln-badge pin' }, icon('pin', 11), 'Pinned'),
    x.assigned && h('span', { class: `ln-badge${x.overdue ? ' late' : ''}` }, icon('flag', 11), x.due ? `${x.overdue ? 'Was due' : 'Assigned · by'} ${shortDate(x.due)}` : 'Assigned'));
}

function arrange(x, patch, note) {
  if (!canSave) return;
  save(setShelf(doc, meId, x.c.id, patch), note);
  render();
}

/** One row on My courses: the course, where you are, and what you can do with it. */
function ShelfRow(x) {
  const { c, e } = x;
  const cover = coverOf(c);
  const go = e
    ? h('a', { class: 'btn btn-sm btn-primary', href: `#play/${c.id}` }, x.status === 'finished' ? 'Revisit' : x.status === 'not-started' ? 'Start' : 'Continue')
    : h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: !canSave, onclick: () => { save(enrol(doc, meId, c), `You started ${c.title}`); location.hash = `#play/${c.id}`; } }, 'Start');
  return h('li', { class: `ln-row s-${x.status}${x.hidden ? ' hidden' : ''}`, style: `--cover:${cover}` },
    h('span', { class: 'ln-row-swatch', 'aria-hidden': 'true' }),
    h('div', { class: 'ln-row-main' },
      h('a', { class: 'ln-row-title', href: `#play/${c.id}` }, c.title),
      h('small', {}, [c.series, kindLabel(c.kind), c.pacing === 'self' ? (c.kind === 'self' ? '' : 'self-paced') : `starts ${shortDate(c.run.start)}`, `about ${c.hoursPerWeek} h a week`].filter(Boolean).join(' · ')),
      Badges(x)),
    h('div', { class: 'ln-row-prog' },
      h('span', { class: `ln-status s-${x.status}` }, STATUS_LABEL[x.status]),
      h('span', { class: 'ln-bar', role: 'img', 'aria-label': `${x.pct}% done` }, h('i', { style: `width:${x.pct}%` })),
      h('small', {}, e ? `${x.p.done} of ${x.p.of} required${x.last ? ` · last ${shortDate(x.last.slice(0, 10))}` : ''}` : 'Not started yet')),
    h('div', { class: 'ln-row-act' }, go,
      h('button', { type: 'button', class: `btn btn-sm btn-icon${x.pinned ? ' on' : ''}`, 'aria-pressed': String(x.pinned), title: x.pinned ? 'Unpin' : 'Pin to the top of your lists', 'aria-label': x.pinned ? `Unpin ${c.title}` : `Pin ${c.title}`, disabled: !canSave, onclick: () => arrange(x, { pinned: !x.pinned }, x.pinned ? 'Unpinned' : 'Pinned to the top') }, icon('pin', 14)),
      h('button', { type: 'button', class: 'btn btn-sm btn-icon', title: x.hidden ? 'Show it again' : 'Hide it from My learning (it stays in your record)', 'aria-label': x.hidden ? `Show ${c.title}` : `Hide ${c.title}`, disabled: !canSave, onclick: () => arrange(x, { hidden: !x.hidden, pinned: false }, x.hidden ? 'Back on your list' : 'Hidden. Find it under Hidden') }, icon(x.hidden ? 'eye' : 'eyeOff', 14)),
      e && !x.assigned && h('button', { type: 'button', class: 'btn btn-sm btn-icon', title: 'Leave this course', 'aria-label': `Leave ${c.title}`, disabled: !canSave, onclick: async () => { if (await uiConfirm(`Leave “${c.title}”? Your progress and notes in it will be cleared.`, { ok: 'Leave', danger: true })) { save(leave(doc, meId, c.id), `You left ${c.title}`); render(); } } }, icon('close', 14))));
}

function Courses() {
  setCrumbs([]);
  const all = shelf();
  const f = SHELF_FILTERS.find((x) => x.id === shelfView.filter) ?? SHELF_FILTERS[0];
  const q = shelfView.q.trim().toLowerCase();
  const list = sortShelf(all.filter(f.test).filter((x) => !q || `${x.c.title} ${x.c.subtitle ?? ''} ${x.c.series ?? ''}`.toLowerCase().includes(q)), shelfView.sort);
  const set = (patch) => { shelfView = { ...shelfView, ...patch }; keepShelfView(); render(); };
  const late = all.filter((x) => x.overdue && !x.hidden);
  const search = h('input', { type: 'search', class: 'input input-sm', placeholder: 'Find a course', value: shelfView.q, 'aria-label': 'Find a course',
    oninput: (ev) => { shelfView.q = ev.target.value; const pos = ev.target.selectionStart; render(); const el = main.querySelector('.ln-shelf-bar input[type=search]'); el?.focus(); el?.setSelectionRange(pos, pos); } });
  return h('div', { class: 'lx-wrap' }, tabs('courses'),
    h('p', { class: 'lx-note' }, 'Every course you’re in, and the ones assigned to you. Pin the ones you’re working on, hide the ones you’re done with. Hiding never deletes anything.'),
    late.length > 0 && h('p', { class: 'ln-late' }, icon('clock', 14), ` ${late.map((x) => x.c.title).join(', ')} ${late.length === 1 ? 'was' : 'were'} due. No stress: start when you can, or have a word with whoever assigned it.`),
    h('div', { class: 'ln-shelf-bar' },
      h('div', { class: 'tc-seg ln-filters', role: 'group', 'aria-label': 'Show' }, SHELF_FILTERS.map((x) => {
        const k = all.filter(x.test).length;
        return h('button', { type: 'button', class: f.id === x.id ? 'on' : '', 'aria-pressed': String(f.id === x.id), onclick: () => set({ filter: x.id }) }, x.label, h('small', {}, String(k)));
      })),
      h('span', { class: 'tc-grow' }),
      search,
      h('label', { class: 'ln-sort' }, h('span', {}, 'Sort'), h('select', { class: 'input input-sm', onchange: (ev) => set({ sort: ev.target.value }) }, options(SHELF_SORTS, shelfView.sort)))),
    list.length ? h('ul', { class: 'ln-shelf' }, list.map(ShelfRow))
      : h('section', { class: 'lx-panel' }, h('p', { class: 'lx-note' }, q ? 'No course matches that.' : f.id === 'hidden' ? 'Nothing hidden.' : f.id === 'done' ? 'Nothing finished yet. You’ll get there.' : 'Nothing here.'), h('a', { class: 'btn btn-sm', href: '#catalogue' }, icon('books', 14), 'Browse the catalogue')));
}

function Catalogue() {
  setCrumbs([]);
  const list = published();
  const joined = list.filter((c) => enrolment(c.id));
  const suggested = suggestedFor(teach, doc, org, meId).filter((s) => s.c);
  const sids = new Set(suggested.map((s) => s.cid));
  const open = list.filter((c) => !enrolment(c.id) && !sids.has(c.id));
  return h('div', { class: 'lx-wrap' }, tabs('catalogue'),
    h('p', { class: 'lx-note' }, 'Courses, workshops and modules your organisation has published in Teach.'),
    suggested.length > 0 && h('section', { class: 'lx-panel ln-suggested' }, h('h3', {}, icon('sparkle', 15), 'Suggested for you'),
      h('p', { class: 'lx-note' }, 'Offered to you, or to a team or role you’re in. Join if it’s useful; no one is counting.'),
      h('div', { class: 'ln-courses' }, suggested.map((s) => CourseCard(s.c, { join: true, note: s.note })))),
    open.length ? h('div', { class: 'ln-courses' }, open.map((c) => CourseCard(c, { join: true }))) : h('p', { class: 'lx-note' }, 'You’ve joined everything on offer.'),
    joined.length > 0 && h('section', { class: 'lx-panel' }, h('h3', {}, 'Already joined'), h('div', { class: 'ln-courses' }, joined.map((c) => CourseCard(c)))));
}

/* ---------------------------------------------------------------- player */

function Player(c, blockId, preview) {
  const e = preview ? null : enrolment(c.id);
  if (!preview && !e) {
    setCrumbs([{ label: c.title }]);
    return h('div', { class: 'lx-wrap' }, tabs('catalogue'), h('section', { class: 'lx-panel' }, h('h3', {}, c.title), h('p', {}, c.summary),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: !canSave || c.status !== 'published', onclick: () => { save(enrol(doc, meId, c), `You joined ${c.title}`); render(); } }, icon('plus', 14), 'Join this course')));
  }
  const weeks = pathByWeek(c);
  const all = weeks.flatMap((w) => w.blocks);
  // Opening a course goes back to where you were, unless you finished that block; then on to what's next.
  const last = !preview && e.last && c.blocks[e.last] && all.includes(c.blocks[e.last]) && !e.done?.[e.last] ? c.blocks[e.last] : null;
  const fallback = preview ? all[0] : last ?? nextBlock(c, e, today) ?? (e.last && c.blocks[e.last]) ?? all[0];
  const b = c.blocks[blockId] && all.includes(c.blocks[blockId]) ? c.blocks[blockId] : fallback;
  if (!b) return h('div', { class: 'lx-wrap' }, tabs('home'), h('p', { class: 'lx-note' }, 'This course has nothing in it yet.'));
  if (!preview && e.last !== b.id && canSave) { doc = setLast(doc, meId, c.id, b.id); saveDoc('learn', doc); }
  setCrumbs(preview ? [{ label: c.title }, { label: b.title }] : [{ label: b.title }]);
  const p = progress(c, e);
  const start = startFor(c, e);
  const day = todayDay(c, e, today);
  const base = preview ? 'preview' : 'play';
  const path = h('nav', { class: 'ln-path', 'aria-label': 'Course path' }, weeks.map((w) => [
    h('h4', {}, h('span', {}, w.label), h('span', {}, w.week === 0 ? '' : shortDate(dateOf(start, w.from))),
      h('small', {}, `${w.blocks.filter((x) => e?.done?.[x.id]).length}/${w.blocks.length}`)),
    h('ol', {}, w.blocks.map((x) => {
      const done = !!e?.done?.[x.id];
      const op = preview ? { open: true } : isOpen(c, e, x, today);
      return h('li', {}, h('a', { href: `#${base}/${c.id}/${x.id}`, class: `${x.id === b.id ? 'on' : ''}${op.open ? '' : ' locked'}`, 'aria-current': x.id === b.id ? 'step' : null },
        h('span', { class: `ln-state${done ? ' done' : op.open ? '' : ' locked'}`, 'aria-label': done ? 'Done' : op.open ? 'Not done yet' : 'Opens later' }, done ? icon('check', 12) : null),
        h('span', { class: 'ln-path-title' }, x.title), h('small', {}, `${blockType(x.type).label}${x.required ? '' : ' · optional'}${op.open ? '' : ` · ${op.why}`}`)));
    })),
  ]));
  const i = all.indexOf(b);
  const prev = all[i - 1];
  const next = all[i + 1];
  // Keep the block you're on in view inside the rail, without moving the page.
  requestAnimationFrame(() => {
    const on = path.querySelector('a.on');
    if (on && path.scrollHeight > path.clientHeight) path.scrollTop = Math.max(0, on.getBoundingClientRect().top - path.getBoundingClientRect().top + path.scrollTop - path.clientHeight / 3);
  });
  const focus = focusOn();
  const ring = Ring(p.pct);
  return h('div', { class: `lx-wrap ln-playwrap${focus ? ' focus' : ''}` }, focus ? null : tabs('home'),
    preview && h('p', { class: 'ln-preview' }, icon('eye', 14), ` Preview: you’re seeing “${c.title}”${c.status === 'published' ? '' : ' (a draft)'} as a learner would. Nothing you do here is saved.`),
    h('div', { class: 'ln-courseline' },
      h('div', { class: 'ln-course-id' },
        h('span', { class: 'ln-eyebrow' }, c.pacing === 'self' ? 'Self-paced' : day < 0 ? `Starts ${shortDate(c.run.start)}` : `Day ${day + 1} of ${c.span.length}`),
        h('h2', {}, c.title)),
      h('span', { class: 'tc-grow' }),
      !preview && h('span', { class: 'ln-progress-label' }, `${p.done} of ${p.of} required done`),
      !preview && ring,
      h('button', { type: 'button', class: `btn btn-sm${focus ? ' on' : ''}`, 'aria-pressed': String(focus), title: 'Hide the menus and the path, for reading (F)', onclick: () => toggleFocus() },
        icon(focus ? 'eyeOff' : 'eye', 14), focus ? 'Leave focus' : 'Focus')),
    h('div', { class: 'ln-player' }, path, BlockView(c, e, b, { preview, start, prev, next, base, pos: `${i + 1} of ${all.length}` })));
}

/* A progress ring: the share of required blocks done. */
function Ring(pct, size = 44) {
  const R = 20, C = 2 * Math.PI * R;
  const el = svg('svg', { viewBox: '0 0 48 48', width: String(size), height: String(size), 'aria-hidden': 'true' });
  svg('circle', { cx: '24', cy: '24', r: String(R), class: 'ln-ring-bg' }, el);
  svg('circle', { cx: '24', cy: '24', r: String(R), class: 'ln-ring-fg', 'stroke-dasharray': `${(C * pct) / 100} ${C}`, transform: 'rotate(-90 24 24)' }, el);
  return h('span', { class: 'ln-ring', role: 'img', 'aria-label': `${pct}% done`, style: `width:${size}px;height:${size}px` }, el, h('b', {}, `${pct}%`));
}

/* Each course gets a steady colour from the wheel: its cover tone, or one picked from its id. */
const COVER = ['teal', 'green', 'blue', 'orange', 'violet', 'coral', 'amber', 'red'];
function coverOf(c) {
  if (c.cover?.tone) return c.cover.tone;
  let k = 0;
  for (const ch of c.id) k = (k * 31 + ch.charCodeAt(0)) >>> 0;
  return wheel(COVER[k % COVER.length]);
}

/* Focus mode hides the side nav and the path; remembered per browser. */
function focusOn() {
  try { return localStorage.getItem('dashi.learn.focus') === '1'; } catch { return false; }
}
function toggleFocus() {
  const v = !focusOn();
  try { localStorage.setItem('dashi.learn.focus', v ? '1' : '0'); } catch { /* the class still applies for this page */ }
  render();
}

/* Keys in a course: ← and → move, D marks done, F toggles focus. */
addEventListener('keydown', (ev) => {
  if (!/^#(play|preview)\//.test(location.hash) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target.closest?.('input, textarea, select, [contenteditable="true"], button, .ln-show-host')) return;
  const k = ev.key.toLowerCase();
  const click = (sel) => { const el = main.querySelector(sel); if (el) { ev.preventDefault(); el.click(); } };
  if (ev.key === 'ArrowLeft') click('.ln-foot [data-go="prev"]');
  else if (ev.key === 'ArrowRight') click('.ln-foot [data-go="next"]');
  else if (k === 'd') click('.ln-foot [data-go="done"]');
  else if (k === 'f') { ev.preventDefault(); toggleFocus(); }
});

function BlockView(c, e, b, { preview, start, prev, next, base, pos }) {
  const t = blockType(b.type);
  const tone = toneOf(c, b);
  const done = !!e?.done?.[b.id];
  const op = preview ? { open: true } : isOpen(c, e, b, today);
  const mark = (v = true, note = null) => { if (preview) { toast('Preview: nothing is saved'); return; } save(markDone(doc, meId, c.id, b.id, v), note ?? (v ? 'Marked done' : 'Marked not done')); render(); };
  const opens = dateOf(start, b.start);
  const closes = dateOf(start, b.start + b.length - 1);
  const live = ['live', 'office', 'whiteboard', 'meetup'].includes(b.type);
  const when = live ? `${shortDate(opens)}${b.at ? ` at ${b.at} (${c.run.tz.replace('America/', '').replace('_', ' ')} time)` : ''}` : b.length > 1 ? `Open ${shortDate(opens)} to ${shortDate(closes)}` : shortDate(opens);
  const content = op.open ? Content(c, e, b, { preview, mark }) : h('p', { class: 'ln-locked' }, icon('lock', 14), ` ${op.why}. It’ll be here when it’s ready.`);
  return h('article', { class: 'ln-block', style: `--tone:${tone}` },
    h('header', { class: 'ln-block-head' },
      h('div', { class: 'ln-block-meta' },
        h('span', { class: 'ln-kind' }, icon(t.icon, 13), t.label, b.required ? '' : ' · optional'),
        pos && h('span', { class: 'ln-pos' }, pos)),
      h('h2', {}, b.title),
      h('p', { class: 'ln-when' }, `${when}${b.minutes ? ` · about ${b.minutes} minutes` : ''}`)),
    h('div', { class: 'ln-content' }, content),
    h('footer', { class: 'ln-foot' },
      prev ? h('a', { class: 'btn btn-sm btn-ghost', 'data-go': 'prev', href: `#${base}/${c.id}/${prev.id}`, title: `Back: ${prev.title} (←)` }, icon('chevronLeft', 14), 'Back') : h('span', { class: 'ln-foot-gap' }),
      op.open && !['quiz', 'slideshow'].includes(b.type) && (done
        ? [h('span', { class: 'ln-done-note' }, icon('check', 15), 'Done'), h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => mark(false) }, 'Not done yet')]
        : h('button', { type: 'button', class: 'btn btn-sm btn-primary', 'data-go': 'done', title: 'Mark done (D)', onclick: () => mark(true) }, icon('check', 14), 'Mark done')),
      op.open && ['quiz', 'slideshow'].includes(b.type) && done && h('span', { class: 'ln-done-note' }, icon('check', 15), 'Done'),
      h('span', { class: 'tc-grow' }),
      next ? h('a', { class: 'btn btn-sm ln-next-btn', 'data-go': 'next', href: `#${base}/${c.id}/${next.id}`, title: `Next: ${next.title} (→)` }, h('span', {}, h('small', {}, 'Next'), h('b', {}, next.title)), icon('chevronRight', 14))
        : h('span', { class: 'ln-done-note' }, icon('check', 15), 'End of the course')));
}

function Content(c, e, b, { preview, mark }) {
  const text = b.body ? h('div', { class: 'ln-body' }, Markdown(b.body)) : null;
  const img = (b.settings?.images ?? []).filter((x) => x.src).map((x) => h('img', { src: x.src, alt: x.decorative ? '' : x.alt ?? '', loading: 'lazy' }));
  const note = (prompt) => {
    const box = h('textarea', { class: 'textarea textarea-sm w-full', rows: 5, 'aria-label': prompt, placeholder: 'Your own words. Only you and your teacher can see them.', value: e?.notes?.[b.id] ?? '' });
    return h('div', { class: 'lx-field' }, h('span', {}, prompt), box,
      h('div', { class: 'lx-row' }, h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { if (preview) return toast('Preview: nothing is saved'); save(saveNote(doc, meId, c.id, b.id, box.value), 'Saved to your record'); } }, icon('check', 14), 'Save')));
  };
  if (b.type === 'lesson' && b.settings?.sections?.length) {
    return h('div', { class: 'lx-stack ln-lesson' }, lessonSections(b).map((x) => x.kind === 'image' ? (x.src ? h('img', { src: x.src, alt: x.decorative ? '' : x.alt ?? '', loading: 'lazy' }) : null)
      : x.kind === 'video' ? (x.src ? h('a', { class: 'btn btn-sm', href: x.src, target: '_blank', rel: 'noopener' }, icon('video', 14), x.text || 'Watch (opens in a new tab)') : null)
        : x.kind === 'callout' ? h('div', { class: 'ln-callout' }, icon('lightbulb', 16), h('div', {}, Markdown(x.text ?? '')))
          : x.kind === 'question' ? h('div', { class: 'ln-think' }, h('b', {}, 'Think about'), h('p', {}, x.text ?? ''))
            : h('div', { class: 'ln-body' }, Markdown(x.text ?? ''))));
  }
  if (blockType(b.type).preview) return h('div', { class: 'lx-stack' }, text, h('p', { class: 'ln-soon' }, icon('sparkle', 14), ` ${blockType(b.type).label} is new in Dashi. The full version is on its way; for now, read the words above and mark it done when you’re ready.`));
  switch (b.type) {
    case 'slideshow': case 'podcast': {
      const stage = h('div', { class: 'ln-show-host' }, h('p', { class: 'lx-note' }, 'Loading the show…'));
      queueMicrotask(async () => {
        show = await playShow(stage, podcasts, b.ref, { reducedMotion: settingsOf(doc, meId).motion === 'calm' || matchMedia('(prefers-reduced-motion: reduce)').matches, onEnd: () => { if (!preview && !e?.done?.[b.id]) mark(true, 'Show finished: marked done'); } });
      });
      return h('div', { class: 'lx-stack' }, text, b.ref ? stage : h('p', { class: 'ln-locked' }, 'No show chosen yet.'));
    }
    case 'video': return h('div', { class: 'lx-stack' }, text, b.settings?.url ? h('a', { class: 'btn btn-sm', href: b.settings.url, target: '_blank', rel: 'noopener' }, icon('video', 14), 'Watch (opens in a new tab)') : null, (b.alts ?? []).includes('captions') && h('p', { class: 'lx-note' }, 'Captions are on.'));
    case 'live': case 'office': case 'meetup': {
      const startAt = new Date(`${dateOf(startFor(c, e), b.start)}T${b.at ?? '12:00'}:00`);
      const mins = (startAt - Date.now()) / 6e4;
      const soon = mins <= 10 && mins > -(b.minutes || 60);
      return h('div', { class: 'lx-stack' }, text,
        h('div', { class: 'ln-live' },
          h('b', {}, icon('clock', 14), ` ${startAt.toLocaleString([], { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (your time)`),
          b.type === 'office' && b.settings?.repeat === 'weekly' && h('span', { class: 'lx-note' }, 'Every week at this time, while the course runs.'),
          b.settings?.url ? h('a', { class: `btn btn-sm${soon ? ' btn-primary' : ''}`, href: b.settings.url, target: '_blank', rel: 'noopener' }, icon('video', 14), soon ? 'Join now' : 'Join link (lights up 10 minutes before)') : h('span', { class: 'lx-note' }, 'The link will be here before it starts.'),
          h('span', { class: 'lx-note' }, 'Can’t make it? A recording and notes will follow.')));
    }
    case 'whiteboard': {
      const board = b.ref?.plugin === 'collab' ? getBoard(b.ref.id, { title: b.title, template: b.settings?.template }) : null;
      return h('div', { class: 'lx-stack' }, text,
        h('div', { class: 'ln-board' }, h('b', {}, icon('brush', 14), ` ${templateLabel(b.settings?.template)}`),
          board ? h('div', { class: 'ln-sticky-notes', 'aria-label': 'Sticky notes on the board' }, board.snapshot.notes.map((x) => h('span', {}, x))) : null,
          h('span', { class: 'lx-note' }, 'Whiteboards arrive with Collab, Dashi’s whiteboard plugin. This is a preview of the board.')));
    }
    case 'quiz': case 'exam': return Quiz(c, e, b, { preview, mark });
    case 'reflection': return h('div', { class: 'lx-stack' }, text, note('Your reflection'));
    case 'discussion': return h('div', { class: 'lx-stack' }, text, note('Your reply (shared with your group when discussions arrive; kept in your record for now)'));
    case 'assignment': return h('div', { class: 'lx-stack' }, text, h('p', { class: 'lx-note' }, b.settings?.handIn === 'any' ? 'Hand in a Dashi doc, a file, or an audio or video note: whatever suits you.' : b.settings?.handIn === 'file' ? 'Hand in a file.' : 'Hand in a Dashi doc. Handing in arrives in the next stage; for now, note where your work is.'), note('Notes on your work'));
    case 'checkin': {
      const moods = [['great', 'Going well'], ['ok', 'Getting there'], ['stuck', 'A bit stuck'], ['swamped', 'Swamped']];
      const was = e?.answers?.[b.id]?.mood;
      return h('div', { class: 'lx-stack' }, text ?? h('p', {}, 'How are you doing? Only your teacher sees this, so they know who might like a hand.'),
        h('div', { class: 'ln-moods', role: 'group', 'aria-label': 'How are you doing?' }, moods.map(([k, label]) => h('button', { type: 'button', class: `btn btn-sm${was === k ? ' on' : ''}`, 'aria-pressed': String(was === k), onclick: () => { if (preview) return toast('Preview: nothing is saved'); doc = saveAnswer(doc, meId, c.id, b.id, { mood: k }); save(markDone(doc, meId, c.id, b.id, true), 'Thanks for telling us'); render(); } }, label))));
    }
    case 'feedback': return h('div', { class: 'lx-stack' }, text, h('p', { class: 'lx-note' }, 'Your teacher’s feedback will appear here.'), note('Your feedback on the course (what to keep, change or drop)'));
    case 'resource': return h('div', { class: 'lx-stack' }, text, b.settings?.url && h('a', { class: 'btn btn-sm', href: b.settings.url, target: '_blank', rel: 'noopener' }, icon('link', 14), 'Open'));
    default: return h('div', { class: 'lx-stack' }, ...img, text ?? h('p', { class: 'lx-note' }, 'Nothing more to read here.'));
  }
}

function Quiz(c, e, b, { preview, mark }) {
  const qs = b.settings?.questions ?? [];
  if (!qs.length) return h('p', { class: 'lx-note' }, 'No questions yet.');
  const prev = e?.answers?.[b.id];
  const form = h('form', { class: 'ln-quiz' });
  const picks = prev?.picks ? [...prev.picks] : qs.map(() => null);
  const shown = !!prev;
  qs.forEach((q, i) => form.append(h('fieldset', {}, h('legend', {}, `${i + 1}. ${q.q}`),
    q.options.map((o, k) => h('label', { class: shown && k === q.answer ? 'right' : shown && picks[i] === k ? 'wrong' : '' },
      h('input', { type: 'radio', name: `q${i}`, value: String(k), checked: picks[i] === k, onchange: () => { picks[i] = k; } }), o, shown && k === q.answer ? ' ✓' : '')))));
  form.append(h('div', { class: 'lx-row' },
    h('button', { type: 'submit', class: 'btn btn-sm btn-primary' }, shown ? 'Check again' : 'Check my answers'),
    shown && h('span', { class: 'lx-note' }, `${prev.right} of ${qs.length} right. Try again as often as you like: this is for you, not a mark.`),
    b.settings?.timeLimit > 0 && h('span', { class: 'lx-note' }, `Time limit ${b.settings.timeLimit} minutes${b.settings.extensions ? '; ask your teacher for more time' : ''}.`)));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const right = qs.filter((q, i) => picks[i] === q.answer).length;
    if (preview) { toast(`${right} of ${qs.length} right (preview: not saved)`); return; }
    doc = saveAnswer(doc, meId, c.id, b.id, { picks, right });
    save(markDone(doc, meId, c.id, b.id, true), `${right} of ${qs.length} right`);
    render();
  });
  return form;
}

/* --------------------------------------------------------- record, settings */

function Record() {
  setCrumbs([]);
  const courses = myCourses();
  const download = () => {
    const out = { learner: meId, exported: new Date().toISOString(), courses: courses.map((c) => ({ id: c.id, title: c.title, enrolment: enrolment(c.id), statements: (enrolment(c.id)?.log ?? []).map((l) => toStatement(c, meId, l)) })) };
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })), download: 'my-learning-record.json' });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return h('div', { class: 'lx-wrap' }, tabs('record'),
    h('div', { class: 'tc-toolbar' }, h('p', { class: 'lx-note' }, 'Everything Learn keeps about you, in plain words, newest first. It’s yours: download it whenever you like, as xAPI statements any learning record store can read.'), h('span', { class: 'tc-grow' }),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: download }, icon('download', 14), 'Download my record')),
    courses.length ? courses.map((c) => {
      const e = enrolment(c.id);
      const notes = Object.entries(e?.notes ?? {}).filter(([, v]) => v);
      return h('section', { class: 'lx-panel' }, h('h3', {}, c.title, h('small', {}, ` joined ${shortDate((e?.at ?? today).slice(0, 10))}`)),
        notes.length > 0 && h('div', { class: 'lx-stack' }, h('h4', { class: 'ln-kind' }, 'Your notes and reflections'), notes.map(([bid, v]) => h('blockquote', { class: 'lx-note' }, h('b', {}, `${c.blocks[bid]?.title ?? 'A removed block'}: `), v))),
        h('ul', { class: 'ln-record' }, recordLines(c, e).map((l) => h('li', {}, h('time', { datetime: l.at }, `${shortDate(l.at.slice(0, 10))} ${l.at.slice(11, 16)}`), h('span', {}, l.text)))),
        canSave && h('div', { class: 'lx-row' }, h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => { save(leave(doc, meId, c.id), `You left ${c.title}`); render(); } }, 'Leave this course and forget my record')));
    }) : h('p', { class: 'lx-note' }, 'Nothing yet.'));
}

function Settings() {
  setCrumbs([]);
  const s = settingsOf(doc, meId);
  const set = (patch) => { save(saveSettings(doc, meId, patch), 'Saved'); render(); };
  const group = (label, key, choices) => h('fieldset', { class: 'lx-panel' }, h('legend', { class: 'sr-only' }, label), h('h3', {}, label),
    h('div', { class: 'lx-row' }, choices.map(([v, l]) => h('label', { class: 'lx-chip' }, h('input', { type: 'radio', name: key, checked: s[key] === v, onchange: () => set({ [key]: v }) }), l))));
  return h('div', { class: 'lx-wrap' }, tabs('settings'),
    h('p', { class: 'lx-note' }, 'These follow you into every course. Your device’s own settings (like reduced motion) are always respected too.'),
    h('div', { class: 'lx-two' },
      h('div', { class: 'lx-stack' },
        group('Text size', 'textSize', [['m', 'Standard'], ['l', 'Large'], ['xl', 'Extra large']]),
        group('Font', 'font', [['standard', 'Standard'], ['readable', 'More space between letters and lines (easier for many dyslexic readers)']])),
      h('div', { class: 'lx-stack' },
        group('Motion', 'motion', [['full', 'Slides move gently'], ['calm', 'No movement']]),
        group('Captions', 'captions', [[true, 'Captions and transcripts open'], [false, 'Closed until I open them']]))));
}

addEventListener('hashchange', render);
render();
