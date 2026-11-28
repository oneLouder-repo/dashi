import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { EmptyState } from '../ui/EmptyState.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Drawer } from '../ui/drawer.js';
import { uiConfirm } from '../ui/dialog.js';
import { Markdown } from '../ui/markdown.js';
import { saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadMobilize, loadStrategy, loadLibrary } from '../platform/docs.js';
import { loadHelp } from '../platform/help.js';
import { linkTo, currentWho, enabledPlugins, PLUGINS } from '../plugins.js';
import { NODE_TYPES } from '../platform/strategy.js';
import {
  KINDS, STRENGTHS, STAGES, stageById, LOOP, STREAMS, AUDIENCES, audienceLabel, OUTPUTS, outputById, OUTPUT_STATUS, UPTAKE, SHARES, SIGNALS,
  migrateMobilize, blankObject, readiness, nextStages, moveTo, addReview, addUptake, dueReviews, signalOf, planProposals, tally, mid,
} from './model.js';
import { MOBILIZE_HELP, MOBILIZE_HELP_ID } from './help.js';

/**
 * Mobilize (alpha 0.5, stage 1, experimental): knowledge mobilization.
 *
 *   #objects[/<stream>]   the board: knowledge objects by where they are in the loop
 *   #object/<id>          one object: the five questions, readiness, plan links, evidence, consent, listening, reviews
 *   #loop                 the loop: reviews due, what is coming back, and proposals for the plan
 *   #about[/<page>]       the quick reference, and the same pages as Help
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'mobilize', org });
const app = document.querySelector('#app');
app.classList.add('frame', 'mb-app');
let side = h('nav');
const main = h('section', { class: 'palette-main mb-main' });
app.replaceChildren(side, main);

const canEdit = canWriteDoc('mobilize');
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const me = () => (/** @type {any} */ (currentWho(org))).staffId ?? null;
let doc = loadMobilize();
const strategy = plugins.has('strategy') ? loadStrategy() : null;
const library = plugins.has('library') ? loadLibrary() : null;
const today = () => new Date().toISOString().slice(0, 10);

function save(note) {
  doc = migrateMobilize(doc);
  saveDoc('mobilize', doc);
  if (note) toast(note);
  render();
}
const put = (o, note) => { doc.objects[o.id] = { ...o, updatedAt: new Date().toISOString() }; save(note); };

const n = (count, word, plural = `${word}s`) => `${Number(count).toLocaleString()} ${count === 1 ? word : plural}`;
const when = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const kindOf = (id) => KINDS.find((k) => k.id === id) ?? KINDS[0];
const staffName = (id) => org.staff?.[id]?.name ?? null;
const node = (id) => strategy?.nodes?.[id] ?? null;
const source = (id) => library?.items?.[id] ?? null;
const pluginName = (id) => (id === 'plandoc' ? 'the Plan designer' : PLUGINS.find((p) => p.id === id)?.name ?? id);

/* ------------------------------------------------------------ routes */

const route = () => {
  const raw = location.hash.slice(1) || 'objects';
  const i = raw.indexOf('/');
  return i < 0 ? [raw, ''] : [raw.slice(0, i), decodeURIComponent(raw.slice(i + 1))];
};

function render() {
  const [view, arg] = route();
  drawSide(view, arg);
  setCrumbs([]);
  // A plain switch, so the route's word is never used as a lookup key.
  let body;
  switch (view) {
    case 'object': body = ObjectPage(arg); break;
    case 'loop': body = LoopPage(); break;
    case 'about': body = About(arg); break;
    default: body = Board(arg);
  }
  main.replaceChildren(body);
  main.scrollTop = 0;
}
addEventListener('hashchange', render);

const TABS = [
  { id: 'objects', label: 'Objects', icon: 'lightbulb' },
  { id: 'loop', label: 'Loop', icon: 'refresh' },
  { id: 'about', label: 'About', icon: 'help' },
];
const newButton = () => canEdit && h('button', { class: 'btn btn-sm btn-primary', onclick: () => editObject(null) }, icon('plus', 15), 'New knowledge object');
const page = (current, ...children) => h('div', { class: 'mb-page' }, PluginHeader('mobilize', { tabs: TABS, current, actions: current === 'objects' ? newButton() : null }), ...children);

/* ------------------------------------------------------------ side nav */

function drawSide(view, arg) {
  const t = tally(doc, today());
  const recent = Object.values(doc.objects).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6);
  side = swapSide(side, SideNav({ label: 'Mobilize', sections: [
    { title: 'Mobilize · experimental', items: [
      { label: 'Objects', sub: `${n(t.objects, 'knowledge object')} · ${t.out} out`, icon: 'lightbulb', href: '#objects', on: view === 'objects' || (!view) },
      { label: 'Loop', sub: t.due ? `${n(t.due, 'review')} due` : 'Nothing due', icon: 'refresh', href: '#loop', on: view === 'loop' },
      { label: 'About', sub: 'Quick reference and guides', icon: 'help', href: '#about', on: view === 'about' },
    ] },
    { title: 'Recently changed', items: recent.length ? recent.map((o) => ({ label: o.title || 'Untitled', sub: `${kindOf(o.kind).label} · ${stageById[o.stage].label}`, icon: kindOf(o.kind).icon, href: `#object/${o.id}`, on: view === 'object' && arg === o.id })) : [{ label: 'No objects yet', sub: 'Start with one finding', icon: 'info' }] },
    { title: 'Coming next', items: [
      { label: 'Output starters', sub: 'Stage 2: drafts handed to each plugin', icon: 'fileText' },
      { label: 'Signals on the plan', sub: 'Stage 3: heard back, quiet, needs a look', icon: 'chats' },
      { label: 'Academic stream', sub: 'Stage 4: calls, abstracts, authorship', icon: 'graduation' },
    ] },
  ] }));
  side.classList.add('mb-side');
}

/* ------------------------------------------------------------ small parts */

const chip = (text, { ic = null, cls = '', title = null } = {}) => h('span', { class: `mb-chip ${cls}`, title }, ic && icon(ic, 12), text);
const shareChip = (o) => chip(SHARES[o.consent.share].label, { ic: SHARES[o.consent.share].icon, cls: `mb-share-${o.consent.share}`, title: SHARES[o.consent.share].about });
const signalChip = (o) => { const s = signalOf(o, today()); return s ? chip(SIGNALS[s].label, { ic: SIGNALS[s].icon, cls: `mb-sig-${s}` }) : null; };
const meter = (r) => h('span', { class: 'mb-meter', title: `${r.done} of ${r.checks.length} readiness checks` }, r.checks.map((c) => h('i', { class: c.ok ? 'on' : '' })), h('small', {}, `${r.done}/${r.checks.length}`));

/* ------------------------------------------------------------ board */

const COLUMNS = [
  { id: 'make', label: 'Making', stages: ['draft', 'revised'], about: 'Being shaped' },
  { id: 'ready', label: 'Ready to share', stages: ['ready'], about: 'Checked and signed off' },
  { id: 'out', label: 'Out in the world', stages: ['out'], about: 'Listening for what happens' },
  { id: 'reviewed', label: 'Reviewed', stages: ['reviewed'], about: 'Looked back on' },
];

function Board(stream) {
  const all = Object.values(doc.objects);
  if (!all.length) return page('objects', firstRun());
  const list = all.filter((o) => !stream || o.stream === stream || o.stream === 'both');
  const retired = list.filter((o) => o.stage === 'retired');
  return page('objects',
    doc.settings.note && h('p', { class: 'mb-seed-note' }, icon('info', 14), doc.settings.note),
    h('div', { class: 'mb-row mb-filters' },
      h('span', { class: 'mb-note' }, 'Stream'),
      [{ id: '', label: 'All' }, ...STREAMS.filter((s) => s.id !== 'both')].map((s) => h('a', { class: `btn btn-xs ${stream === s.id || (!stream && !s.id) ? 'btn-primary' : 'btn-ghost'}`, href: s.id ? `#objects/${s.id}` : '#objects' }, s.label)),
      h('span', { class: 'mb-note mb-push' }, `${n(dueReviews(doc, today()).length, 'review')} due · ${n(planProposals(doc).length, 'proposal')} for the plan`)),
    h('div', { class: 'mb-board' }, COLUMNS.map((c) => {
      const items = list.filter((o) => c.stages.includes(o.stage));
      return h('section', { class: `mb-col mb-col-${c.id}` },
        h('header', {}, h('strong', {}, c.label), h('span', { class: 'mb-note' }, `${items.length} · ${c.about}`)),
        items.length ? items.map(Card) : h('p', { class: 'mb-note mb-empty' }, 'None here yet'));
    })),
    retired.length > 0 && h('details', { class: 'mb-panel' }, h('summary', {}, `Retired (${retired.length})`), h('div', { class: 'mb-retired' }, retired.map(Card))));
}

function Card(o) {
  const r = readiness(o);
  const k = kindOf(o.kind);
  return h('a', { class: `mb-card mb-kind-${o.kind}`, href: `#object/${o.id}` },
    h('header', {}, h('span', { class: 'mb-kind' }, icon(k.icon, 14), k.label), o.stream !== 'practice' && chip(o.stream === 'academic' ? 'Academic' : 'Both streams', { ic: 'graduation' })),
    h('strong', {}, o.title || 'Untitled'),
    o.message && h('p', {}, o.message),
    h('footer', {},
      ['draft', 'revised'].includes(o.stage) ? meter(r) : signalChip(o),
      shareChip(o),
      o.outputs.length > 0 && chip(n(o.outputs.length, 'output'), { ic: 'fileText' }),
      o.uptake.length > 0 && chip(String(o.uptake.length), { ic: 'chats', title: n(o.uptake.length, 'thing came back', 'things came back') }),
      staffName(o.ownerId) && h('span', { class: 'mb-note mb-push' }, staffName(o.ownerId))));
}

function firstRun() {
  return EmptyState({ icon: 'sec-mobilize', title: 'Start with one thing worth sharing',
    text: 'A knowledge object holds one finding, practice, lesson, resource or open question, and the loop around it: who it is for, who carries it, what is made from it and what comes back.',
    steps: [
      { title: 'Write the message', text: 'The finding in one plain sentence someone outside the team would understand.' },
      { title: 'Answer the five questions', text: 'What, to whom, by whom, how, and with what effect.' },
      { title: 'Share, listen, review', text: 'Log what comes back, look back on a date, and change what you do.' },
    ],
    actions: [newButton()] });
}

/* ------------------------------------------------------------ one object */

function ObjectPage(id) {
  const o = doc.objects[id];
  if (!o) return page('objects', EmptyState({ icon: 'warn', title: 'That knowledge object isn’t here', text: 'It may have been removed.', actions: [h('a', { class: 'btn btn-sm', href: '#objects' }, 'All objects')] }));
  // The side nav already names the open object in the crumbs.
  setCrumbs([]);
  const k = kindOf(o.kind);
  const r = readiness(o);
  const strength = STRENGTHS.find((s) => s.id === o.strength);
  return page('objects',
    h('section', { class: `mb-intro mb-kind-${o.kind}` },
      h('div', { class: 'mb-row' }, h('span', { class: 'mb-kind' }, icon(k.icon, 14), k.label), chip(stageById[o.stage].label, { cls: 'mb-stage' }), chip(strength.label, { title: strength.about }), shareChip(o), signalChip(o),
        canEdit && h('button', { class: 'btn btn-xs mb-push', onclick: () => editObject(o) }, icon('pencil', 13), 'Edit')),
      h('h2', {}, o.title || 'Untitled'),
      o.message && h('p', { class: 'mb-message' }, o.message),
      o.summary && h('p', { class: 'mb-note' }, o.summary)),
    h('div', { class: 'mb-two' },
      h('div', { class: 'mb-stack' },
        Panel('To whom?', 'Who needs it, and what each would do with it', o.audiences.length ? h('ul', { class: 'mb-list' }, o.audiences.map((a) => h('li', {},
          h('div', {}, h('strong', {}, a.who || audienceLabel(a.group)), h('span', { class: 'mb-note' }, ` · ${audienceLabel(a.group)}`), a.use && h('p', { class: 'mb-note' }, a.use)),
          remove(o, 'audiences', a.id)))) : h('p', { class: 'mb-note' }, 'No audiences yet.'),
        canEdit && h('button', { class: 'btn btn-xs', onclick: () => addAudience(o) }, icon('plus', 13), 'Add an audience')),
        Panel('By whom?', 'The messengers each audience trusts', o.messengers.length ? h('ul', { class: 'mb-list' }, o.messengers.map((m) => h('li', {},
          h('div', {}, h('strong', {}, m.staffId ? staffName(m.staffId) ?? m.name : m.name), m.for?.length > 0 && h('span', { class: 'mb-note' }, ` · for ${m.for.map((f) => o.audiences.find((a) => a.id === f)?.who ?? '').filter(Boolean).join(', ')}`)),
          remove(o, 'messengers', m.id)))) : h('p', { class: 'mb-note' }, 'No messengers yet.'),
        canEdit && h('button', { class: 'btn btn-xs', onclick: () => addMessenger(o) }, icon('plus', 13), 'Add a messenger')),
        Panel('How?', 'What is made from it, and where', o.outputs.length ? h('ul', { class: 'mb-list' }, o.outputs.map((x) => OutputRow(o, x))) : h('p', { class: 'mb-note' }, 'No outputs planned yet.'),
          canEdit && h('button', { class: 'btn btn-xs', onclick: () => addOutput(o) }, icon('plus', 13), 'Plan an output')),
        Panel('With what effect?', 'The change hoped for, and how we would know', h('dl', { class: 'mb-ref' },
          h('dt', {}, 'Hoped for'), h('dd', {}, o.effect.hoped || '–'), h('dt', {}, 'Signs to watch'), h('dd', {}, o.effect.signs || '–'))),
        Listening(o),
        Reviews(o)),
      h('div', { class: 'mb-stack' },
        Readiness(o, r),
        PlanLinks(o),
        Evidence(o),
        Consent(o))));
}

const Panel = (title, sub, ...children) => h('section', { class: 'mb-panel' }, h('header', { class: 'mb-panel-head' }, h('h3', {}, title), sub && h('span', { class: 'mb-note' }, sub)), ...children);

function remove(o, key, itemId) {
  return canEdit && h('button', { class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove', title: 'Remove', onclick: () => put({ ...o, [key]: o[key].filter((x) => x.id !== itemId) }) }, icon('close', 12));
}

function OutputRow(o, x) {
  const kind = outputById[x.kind];
  const href = kind?.plugin ? linkTo(kind.plugin) : null;
  return h('li', {},
    h('span', { class: 'mb-out-icon' }, icon(kind?.icon ?? 'fileText', 15)),
    h('div', {},
      h('strong', {}, x.title || kind?.label),
      h('p', { class: 'mb-note' }, kind?.label, kind?.plugin ? ' · made in ' : '', kind?.plugin ? (href ? h('a', { href }, pluginName(kind.plugin)) : h('span', { title: 'Someone with this plugin can make it' }, pluginName(kind.plugin))) : '',
        x.audienceIds?.length ? ` · for ${x.audienceIds.map((a) => o.audiences.find((y) => y.id === a)?.who).filter(Boolean).join(', ')}` : '')),
    canEdit ? h('select', { class: 'select select-xs', 'aria-label': 'Output status', onchange: (e) => put({ ...o, outputs: o.outputs.map((y) => (y.id === x.id ? { ...y, status: e.target.value } : y)) }) },
      Object.entries(OUTPUT_STATUS).map(([id, label]) => h('option', { value: id, selected: x.status === id }, label))) : chip(OUTPUT_STATUS[x.status] ?? x.status),
    remove(o, 'outputs', x.id));
}

function Readiness(o, r) {
  const moves = canEdit ? nextStages(o) : [];
  return h('section', { class: `mb-panel ${r.ready ? 'mb-ready' : ''}` },
    h('header', { class: 'mb-panel-head' }, h('h3', {}, 'Ready to share?'), meter(r)),
    h('ul', { class: 'mb-checks' }, r.checks.map((c) => h('li', { class: c.ok ? 'ok' : '' }, icon(c.ok ? 'check' : 'alert', 14), h('div', {}, h('strong', {}, c.q), ' ', c.label, !c.ok && h('p', { class: 'mb-note' }, c.hint))))),
    h('div', { class: 'mb-row' },
      h('span', { class: 'mb-note' }, `Stage: ${stageById[o.stage].label}.`),
      moves.map((s) => h('button', { class: `btn btn-xs ${s === 'ready' || s === 'out' ? 'btn-primary' : ''}`, onclick: () => put(moveTo(o, s), `Moved to ${stageById[s].label}`) }, stageById[s].label)),
      !moves.length && o.stage === 'draft' && h('span', { class: 'mb-note' }, 'Finish the checks to make it ready.')));
}

function PlanLinks(o) {
  return Panel('In the plan', 'The objectives, goals and workplans it serves',
    !strategy ? h('p', { class: 'mb-note' }, 'Switch on Plan to link objects to your strategy.')
      : o.links.plan.length ? h('ul', { class: 'mb-list' }, o.links.plan.map((pid) => {
        const nd = node(pid);
        const href = nd ? linkTo('strategy', `#${pid}`) : null;
        return h('li', {}, h('span', { class: 'mb-glyph' }, NODE_TYPES[nd?.type]?.glyph ?? '·'), h('div', {}, nd ? (href ? h('a', { href }, nd.title) : h('strong', {}, nd.title)) : h('span', { class: 'mb-note' }, 'Removed from the plan'), nd && h('p', { class: 'mb-note' }, NODE_TYPES[nd.type]?.label)));
      })) : h('p', { class: 'mb-note' }, 'Not linked to the plan yet.'),
    canEdit && strategy && h('button', { class: 'btn btn-xs', onclick: () => pickPlan(o) }, icon('pencil', 13), 'Choose plan items'));
}

function Evidence(o) {
  return Panel('Evidence', `How strong: ${STRENGTHS.find((s) => s.id === o.strength).label.toLowerCase()}`,
    o.evidence.from && h('p', {}, h('strong', {}, 'From: '), o.evidence.from),
    o.evidence.sources.length > 0 && h('ul', { class: 'mb-list' }, o.evidence.sources.map((sid) => {
      const it = source(sid);
      const href = it ? linkTo('library', `#item/${sid}`) : null;
      return h('li', {}, icon('book', 14), h('div', {}, it ? (href ? h('a', { href }, it.meta?.title ?? sid) : it.meta?.title ?? sid) : h('span', { class: 'mb-note' }, library ? 'Not in the library any more' : 'A library source'), it?.meta?.issued && h('span', { class: 'mb-note' }, ` · ${String(it.meta.issued).slice(0, 4)}`)));
    })),
    o.evidence.notes && h('p', { class: 'mb-note' }, o.evidence.notes),
    canEdit && library && h('button', { class: 'btn btn-xs', onclick: () => pickSources(o) }, icon('pencil', 13), 'Choose sources'));
}

function Consent(o) {
  const c = o.consent;
  return Panel('Consent', 'Whose knowledge this is, and how far it may go', h('dl', { class: 'mb-ref' },
    h('dt', {}, 'Sharing'), h('dd', {}, shareChip(o), ' ', SHARES[c.share].about),
    c.holders && [h('dt', {}, 'Holders'), h('dd', {}, c.holders)],
    c.terms && [h('dt', {}, 'Terms'), h('dd', {}, c.terms)],
    (c.ocap || c.share === 'held') && [h('dt', {}, 'Sign-off'), h('dd', {}, c.signedOff ? `Holders signed off ${when(c.signedOff)}` : h('span', { class: 'mb-warn' }, 'Waiting for the holders'))]),
  c.ocap && h('p', { class: 'mb-note' }, icon('shield', 13), ' OCAP: the communities own, control, access and possess this knowledge.'),
  canEdit && (c.ocap || c.share === 'held') && !c.signedOff && h('button', { class: 'btn btn-xs', onclick: () => recordSignOff(o) }, icon('check', 13), 'Record the holders’ sign-off'));
}

function Listening(o) {
  const list = [...o.uptake].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return Panel('Listen', 'What came back',
    list.length ? h('ul', { class: 'mb-list mb-uptake' }, list.map((u) => {
      const kind = UPTAKE.find((k) => k.id === u.kind);
      const output = o.outputs.find((x) => x.id === u.outputId);
      return h('li', {}, icon(kind?.icon ?? 'chats', 14), h('div', {}, u.n != null && h('b', {}, `${u.n.toLocaleString()} `), u.text, h('p', { class: 'mb-note' }, `${kind?.label ?? ''} · ${when(u.at)}${output ? ` · from ${output.title}` : ''}`)), remove(o, 'uptake', u.id));
    })) : h('p', { class: 'mb-note' }, o.stage === 'out' ? 'Nothing back yet. Ask: “What did you do differently after this?”' : 'Once it is out, log what comes back here.'),
    canEdit && h('button', { class: 'btn btn-xs', onclick: () => logUptake(o) }, icon('plus', 13), 'Log what came back'));
}

function Reviews(o) {
  const due = o.nextReview && o.nextReview <= today();
  return Panel('Reviews', o.nextReview ? `Next review ${when(o.nextReview)}` : 'No review date yet',
    due && h('p', { class: 'mb-warn' }, icon('alert', 13), ' This review is due.'),
    o.reviews.length ? h('ol', { class: 'mb-reviews' }, [...o.reviews].reverse().map((rv) => h('li', { class: rv.loop === 'double' ? 'double' : '' },
      h('p', { class: 'mb-note' }, `${when(rv.at)} · ${staffName(rv.by) ?? 'Someone'} · ${rv.loop === 'double' ? 'double loop' : 'single loop'}`),
      h('p', {}, h('strong', {}, 'Heard: '), rv.heard),
      h('p', {}, h('strong', {}, 'Change: '), rv.change),
      rv.planChange && h('p', { class: 'mb-plan-change' }, icon('strategy', 13), h('strong', {}, ' Proposed for the plan: '), rv.planChange)))) : h('p', { class: 'mb-note' }, 'No reviews yet.'),
    canEdit && h('button', { class: `btn btn-xs ${due ? 'btn-primary' : ''}`, onclick: () => reviewNow(o) }, icon('refresh', 13), 'Review now'));
}

/* ------------------------------------------------------------ drawers */

const field = (label, control, hint) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), control, hint && h('span', { class: 'label' }, hint));
const text = (value, props = {}) => h('input', { class: 'input input-sm w-full', value: value ?? '', ...props });
const area = (value, rows = 3, props = {}) => h('textarea', { class: 'textarea textarea-sm w-full', rows, ...props }, value ?? '');
const pick = (items, selected, props = {}) => h('select', { class: 'select select-sm w-full', ...props }, items.map(({ id, label }) => h('option', { value: id, selected: id === selected }, label)));
const staffOptions = () => [{ id: '', label: 'No one yet' }, ...Object.values(org.staff ?? {}).map((s) => ({ id: s.id, label: s.name }))];

/** @param {any[]} fields  @param {(v: (k: string) => any) => any} onSave  @param {{ title: string, sub?: any, saveLabel?: string, wide?: boolean }} opts */
function form(fields, onSave, { title, sub = null, saveLabel = 'Save', wide = false }) {
  const els = {};
  const body = h('div', { class: 'mb-form' }, fields.map(([key, label, el, hint]) => { if (key) els[key] = el; return field(label, el, hint); }));
  const val = (k) => { const el = els[k]; return el?.type === 'checkbox' ? el.checked : el?.value?.trim() ?? ''; };
  const d = Drawer({ title, sub, body, wide, actions: [
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => d.close() }, 'Cancel'),
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => { if (onSave(val) !== false) d.close(); } }, saveLabel),
  ] });
  return d;
}

function editObject(o) {
  const ob = o ?? blankObject({ ownerId: me() });
  form([
    ['title', 'Title', text(ob.title, { placeholder: 'Youth are ahead of their teachers on AI confidence' })],
    ['kind', 'Kind', pick(KINDS, ob.kind)],
    ['message', 'Message (what?)', area(ob.message, 3, { placeholder: 'The finding in one plain sentence' }), 'Plain words someone outside the team would understand.'],
    ['summary', 'Summary', area(ob.summary, 4)],
    ['strength', 'How strong is the evidence?', pick(STRENGTHS, ob.strength)],
    ['stream', 'Stream', pick(STREAMS, ob.stream)],
    ['hoped', 'Hoped-for change (with what effect?)', area(ob.effect.hoped, 2)],
    ['signs', 'Signs to watch', area(ob.effect.signs, 2), 'The lightest way to notice the change.'],
    ['from', 'Where it comes from', text(ob.evidence.from, { placeholder: 'A project, a survey, a practice' })],
    ['notes', 'Evidence notes', area(ob.evidence.notes, 2)],
    ['share', 'Sharing', pick(Object.entries(SHARES).map(([id, s]) => ({ id, label: `${s.label}: ${s.about}` })), ob.consent.share)],
    ['holders', 'Whose knowledge is it?', text(ob.consent.holders)],
    ['terms', 'Terms', area(ob.consent.terms, 2)],
    ['ocap', 'Community or Indigenous knowledge (OCAP)', h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: !!ob.consent.ocap }), 'Needs the holders’ sign-off before it can be shared.'],
    ['ownerId', 'Owner', pick(staffOptions(), ob.ownerId ?? '')],
    ['nextReview', 'Next review', text(ob.nextReview, { type: 'date' })],
    ['tags', 'Tags', text(ob.tags.join(', '), { placeholder: 'educators, ai literacy' })],
  ], (v) => {
    if (!v('title')) { toast('Give it a title'); return false; }
    const next = { ...ob, title: v('title'), kind: v('kind'), message: v('message'), summary: v('summary'), strength: v('strength'), stream: v('stream'),
      effect: { hoped: v('hoped'), signs: v('signs') }, evidence: { ...ob.evidence, from: v('from'), notes: v('notes') },
      consent: { ...ob.consent, share: v('share'), holders: v('holders'), terms: v('terms'), ocap: v('ocap') },
      ownerId: v('ownerId') || null, nextReview: v('nextReview') || null, tags: v('tags').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) };
    put(next, o ? 'Saved' : 'Knowledge object made');
    if (!o) location.hash = `#object/${next.id}`;
  }, { title: o ? 'Edit knowledge object' : 'New knowledge object', sub: 'Lavis’s five questions: what, to whom, by whom, how, with what effect', wide: true });
}

function addAudience(o) {
  form([
    ['group', 'Audience', pick(AUDIENCES, 'educators')],
    ['who', 'Who exactly', text('', { placeholder: 'K-12 teachers and school leaders' })],
    ['use', 'What would they do with it?', area('', 2), 'One action. If you can’t name one, they may not be the audience.'],
  ], (v) => put({ ...o, audiences: [...o.audiences, { id: mid('a'), group: v('group'), who: v('who') || audienceLabel(v('group')), use: v('use') }] }, 'Audience added'), { title: 'Add an audience', sub: 'To whom?' });
}

function addMessenger(o) {
  form([
    ['staffId', 'Someone on the team', pick([{ id: '', label: 'Someone outside the team' }, ...Object.values(org.staff ?? {}).map((s) => ({ id: s.id, label: s.name }))], '')],
    ['name', 'Or name them', text('', { placeholder: 'A teacher from the community of practice' })],
    ['for', 'For which audience', pick([{ id: '', label: 'Every audience' }, ...o.audiences.map((a) => ({ id: a.id, label: a.who }))], '')],
  ], (v) => {
    const name = v('name') || staffName(v('staffId'));
    if (!name) { toast('Name the messenger'); return false; }
    put({ ...o, messengers: [...o.messengers, { id: mid('m'), name, staffId: v('staffId') || null, for: v('for') ? [v('for')] : [] }] }, 'Messenger added');
  }, { title: 'Add a messenger', sub: 'By whom? Often not the person who did the work.' });
}

function addOutput(o) {
  form([
    ['kind', 'Output', pick(OUTPUTS.map((x) => ({ id: x.id, label: `${x.label}${x.plugin ? ` · ${pluginName(x.plugin)}` : ''}` })), 'brief')],
    ['title', 'Working title', text('')],
    ['for', 'For which audience', pick([{ id: '', label: 'Every audience' }, ...o.audiences.map((a) => ({ id: a.id, label: a.who }))], '')],
  ], (v) => put({ ...o, outputs: [...o.outputs, { id: mid('o'), kind: v('kind'), title: v('title') || outputById[v('kind')].label, status: 'idea', audienceIds: v('for') ? [v('for')] : [], note: '' }] }, 'Output planned'),
  { title: 'Plan an output', sub: 'How? Each output is made in the plugin that does that job.' });
}

function logUptake(o) {
  form([
    ['kind', 'What came back', pick(UPTAKE.map((u) => ({ id: u.id, label: `${u.label}: ${u.about}` })), 'story')],
    ['text', 'What happened', area('', 3, { placeholder: 'A member used the brief to open a board meeting…' })],
    ['n', 'A number, for counts', text('', { type: 'number', min: '0' })],
    ['outputId', 'From which output', pick([{ id: '', label: 'Not one in particular' }, ...o.outputs.map((x) => ({ id: x.id, label: x.title }))], '')],
  ], (v) => {
    if (!v('text')) { toast('Say what happened'); return false; }
    put(addUptake(o, { kind: v('kind'), text: v('text'), n: v('n') === '' ? null : Number(v('n')), outputId: v('outputId') || null, by: me() }), 'Logged');
  }, { title: 'Log what came back', sub: 'Listen: counts, stories of use, pickups and decisions' });
}

function reviewNow(o) {
  const heardSoFar = o.uptake.length ? `${n(o.uptake.length, 'thing')} came back since it went out.` : 'Nothing has come back yet.';
  const planChange = area('', 2, { placeholder: 'Add a measure for families who take a next step…' });
  const holder = field('Proposed change to the plan', planChange, 'Whoever looks after the plan sees it on the Loop page.');
  holder.hidden = true;
  const loop = pick([{ id: 'single', label: 'Single loop: change the next output' }, { id: 'double', label: 'Double loop: question the plan itself' }], 'single', { onchange: (e) => { holder.hidden = e.target.value !== 'double'; } });
  const d = form([
    ['heard', 'What did we hear?', area('', 3), heardSoFar],
    ['change', 'What do we change?', area('', 3)],
    ['loop', 'Which loop?', loop],
    [null, '', h('div')],
  ], (v) => {
    if (!v('heard') || !v('change')) { toast('Say what you heard and what you change'); return false; }
    put(addReview(o, { heard: v('heard'), change: v('change'), loop: v('loop'), planChange: planChange.value.trim(), by: me(), every: doc.settings.reviewEvery }), 'Review saved');
  }, { title: 'Review', sub: o.title });
  d.el.querySelector('.mb-form')?.append(holder);
}

function pickPlan(o) {
  const chosen = new Set(o.links.plan);
  const nodes = Object.values(strategy.nodes).filter((x) => ['objective', 'goal', 'workplan'].includes(x.type));
  const byParent = (pid) => nodes.filter((x) => x.parentId === pid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const row = (x, depth) => [h('label', { class: 'mb-pick', style: `--d:${depth}` }, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: chosen.has(x.id), onchange: (e) => (e.target.checked ? chosen.add(x.id) : chosen.delete(x.id)) }), h('span', { class: 'mb-glyph' }, NODE_TYPES[x.type].glyph), x.title), ...byParent(x.id).flatMap((c) => row(c, depth + 1))];
  const plans = Object.values(strategy.nodes).filter((x) => x.type === 'plan');
  const body = h('div', { class: 'mb-picks' }, plans.map((p) => h('section', {}, h('h4', {}, p.title), byParent(p.id).flatMap((x) => row(x, 0)))));
  const d = Drawer({ title: 'Choose plan items', sub: 'The objectives, goals and workplans this object serves', body, wide: true, actions: [
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => d.close() }, 'Cancel'),
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => { put({ ...o, links: { ...o.links, plan: [...chosen] } }, 'Plan links saved'); d.close(); } }, 'Save'),
  ] });
}

function pickSources(o) {
  const chosen = new Set(o.evidence.sources);
  const items = Object.values(library.items).sort((a, b) => String(a.meta?.title ?? '').localeCompare(String(b.meta?.title ?? '')));
  const filter = text('', { placeholder: 'Find a source', type: 'search' });
  const listEl = h('div', { class: 'mb-picks' });
  const draw = () => listEl.replaceChildren(...items.filter((it) => !filter.value || (it.meta?.title ?? '').toLowerCase().includes(filter.value.toLowerCase())).map((it) => h('label', { class: 'mb-pick' },
    h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: chosen.has(it.id), onchange: (e) => (e.target.checked ? chosen.add(it.id) : chosen.delete(it.id)) }), icon('book', 13), it.meta?.title ?? it.id)));
  filter.addEventListener('input', draw);
  draw();
  const d = Drawer({ title: 'Choose sources', sub: 'From the Library', body: h('div', { class: 'mb-form' }, filter, listEl), wide: true, actions: [
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => d.close() }, 'Cancel'),
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => { put({ ...o, evidence: { ...o.evidence, sources: [...chosen] } }, 'Sources saved'); d.close(); } }, 'Save'),
  ] });
}

async function recordSignOff(o) {
  const ok = await uiConfirm(`Only record this when ${o.consent.holders || 'the holders'} have agreed to how this will be shared. Note their terms on the object.`, { title: 'Record the holders’ sign-off?', ok: 'They have agreed', danger: false });
  if (ok) put({ ...o, consent: { ...o.consent, signedOff: today() } }, 'Sign-off recorded');
}

/* ------------------------------------------------------------ the loop */

function LoopPage() {
  const all = Object.values(doc.objects).filter((o) => o.stage !== 'retired');
  const phase = (id) => all.filter((o) => stageById[o.stage].loop === id).length;
  const counts = { make: phase('make'), share: phase('share'), listen: all.filter((o) => o.uptake.length).length, review: phase('review') };
  const due = dueReviews(doc, today());
  const proposals = planProposals(doc);
  /** @type {[string, any[]][]} */
  const bySignal = Object.keys(SIGNALS).map((s) => [s, all.filter((o) => signalOf(o, today()) === s)]);
  return page('loop',
    h('section', { class: 'mb-panel mb-loop' },
      h('header', { class: 'mb-panel-head' }, h('h3', {}, 'The loop'), h('span', { class: 'mb-note' }, 'Plan, act, observe, reflect: then again with what was learned')),
      h('ol', { class: 'mb-loop-steps' }, LOOP.map((l) => h('li', {}, h('span', { class: 'mb-loop-n' }, String(counts[l.id])), h('strong', {}, l.label), h('small', {}, l.step), h('p', { class: 'mb-note' }, l.about))))),
    h('div', { class: 'mb-two' },
      h('div', { class: 'mb-stack' },
        Panel('Reviews due', due.length ? n(due.length, 'object') : 'Nothing due',
          due.length ? h('ul', { class: 'mb-list' }, due.map((o) => h('li', {}, icon('alert', 14), h('div', {}, h('a', { href: `#object/${o.id}` }, o.title), h('p', { class: 'mb-note' }, `Due ${when(o.nextReview)} · ${staffName(o.ownerId) ?? 'No owner'}`)), canEdit && h('button', { class: 'btn btn-xs btn-primary', onclick: () => reviewNow(o) }, 'Review')))) : h('p', { class: 'mb-note' }, 'Every object is up to date.')),
        Panel('What is coming back', 'Objects that are out, by signal',
          bySignal.map(([s, list]) => list.length > 0 && h('div', { class: 'mb-signal-group' }, chip(`${SIGNALS[s].label} · ${list.length}`, { ic: SIGNALS[s].icon, cls: `mb-sig-${s}` }), h('ul', { class: 'mb-list' }, list.map((o) => h('li', {}, h('a', { href: `#object/${o.id}` }, o.title), h('span', { class: 'mb-note' }, ` · ${n(o.uptake.length, 'thing')} back`)))))),
          !bySignal.some(([, l]) => l.length) && h('p', { class: 'mb-note' }, 'Nothing is out yet.'))),
      h('div', { class: 'mb-stack' },
        Panel('Proposals for the plan', 'Double-loop reviews: findings that question the plan itself',
          proposals.length ? h('ul', { class: 'mb-list' }, proposals.map(({ object: o, review: rv }) => h('li', {}, icon('strategy', 14), h('div', {},
            h('p', {}, rv.planChange),
            h('p', { class: 'mb-note' }, 'From ', h('a', { href: `#object/${o.id}` }, o.title), ` · ${when(rv.at)}`, o.links.plan.length && strategy ? [' · ', ...(/** @type {string[]} */ (o.links.plan)).slice(0, 2).map((pid, i) => [i ? ', ' : '', linkTo('strategy', `#${pid}`) ? h('a', { href: linkTo('strategy', `#${pid}`) }, node(pid)?.title ?? 'plan item') : node(pid)?.title ?? ''])] : null))))) : h('p', { class: 'mb-note' }, 'None yet. A review that questions the plan, not just the output, lands here.')),
        Panel('How the loop works', null, h('p', { class: 'mb-note' }, 'A single-loop review changes the next output: shorter, a different messenger, a new audience. A double-loop review asks whether the goal itself is right, and proposes a change to the plan. Stage 3 shows each object’s signal on its workplan items in Plan.')))));
}

/* ------------------------------------------------------------ about */

let helpDoc = null;
loadHelp().then(({ doc: hd }) => { helpDoc = hd.sections.find((s) => s.id === MOBILIZE_HELP_ID) ?? MOBILIZE_HELP; if (route()[0] === 'about') render(); }).catch(() => { helpDoc = MOBILIZE_HELP; });

function About(arg) {
  const section = helpDoc ?? MOBILIZE_HELP;
  const pg = section.pages.find((p) => p.id === arg) ?? null;
  setCrumbs(pg ? [{ label: pg.title }] : []);
  const ref = (title, rows) => h('section', { class: 'mb-panel' }, h('h3', {}, title), h('dl', { class: 'mb-ref' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  return page('about',
    pg ? h('article', { class: 'mb-panel mb-help' }, h('header', { class: 'mb-panel-head' }, h('h3', {}, pg.title), h('a', { class: 'btn btn-xs btn-outline', href: `help.html#${MOBILIZE_HELP_ID}/${pg.id}` }, 'Open in Help')), Markdown(pg.body), h('a', { href: '#about' }, '← Quick reference'))
      : h('div', { class: 'mb-two' },
        h('div', { class: 'mb-stack' },
          ref('The five questions (Lavis)', [['What?', 'The message, in plain words'], ['To whom?', 'Audiences, and what each would do with it'], ['By whom?', 'The messengers each audience trusts'], ['How?', 'The outputs, made in each plugin'], ['With what effect?', 'The change hoped for, and how we would know']]),
          ref('Stages', STAGES.map((s) => [s.label, s.about])),
          ref('Kinds', KINDS.map((k) => [k.label, k.about]))),
        h('div', { class: 'mb-stack' },
          h('section', { class: 'mb-panel' }, h('h3', {}, 'Guides'), h('p', { class: 'mb-note' }, 'The same pages are in Help, under Mobilize.'),
            h('ul', { class: 'mb-guides' }, section.pages.map((p) => h('li', {}, h('a', { href: `#about/${p.id}` }, icon('book', 15), p.title))))),
          ref('Sharing', Object.values(SHARES).map((s) => [s.label, s.about])),
          h('section', { class: 'mb-panel' }, h('h3', {}, 'Grounded in'), h('p', { class: 'mb-note' }, 'Lavis and colleagues’ five questions for knowledge transfer; the knowledge-to-action cycle (Graham and colleagues); action research (Lewin; Kemmis and McTaggart); single- and double-loop learning (Argyris and Schön); boundary objects (Star and Griesemer); impact literacy (Bayley and Phipps); and the First Nations principles of OCAP.')))));
}

render();
