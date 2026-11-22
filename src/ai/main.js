import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Drawer } from '../ui/drawer.js';
import { loadDoc, saveDoc, canWriteDoc } from '../platform/storage.js';
import { loadOrg } from '../platform/docs.js';
import { currentUser } from '../platform/session.js';
import { PLUGINS, enabledPlugins, linkTo } from '../plugins.js';
import { AI_TOOLS } from '../platform/pluginRegistry.js';
import { uid } from '../core/ops.js';
import { checkPrompt, LEVELS } from './literacy.js';

/**
 * AI (alpha 0.4, experimental): one home for AI at an organisation, where
 * AI is a collaborator in the change ecosystem, with people in charge.
 * The AI tools that were plugins of their own (AI Policy Studio, AI Use
 * Register, Prompt Commons, Plain Words) live inside it as sub-plugins.
 *
 * A placeholder for the plan: nothing here calls an AI yet.
 *
 *   #home      what AI is for here, and where everything is
 *   #check     AI literacy: look a prompt over before it goes anywhere
 *   #log       the org's prompt log (redacted text only)
 *   #review    human in the loop: prompts waiting for a person to look
 *   #tools     the AI tools inside this plugin
 *   #keys      connecting an AI provider (planned: keys live on the server, never in a document)
 *   #proxy     the plan for a Claude proxy: record, validate, scan, then send
 *
 * Its document `ai` = { id, log: { [id]: { id, at, by, text, level, findings: [ids], purpose, status, reviewer, note } },
 *                       settings: { review: 'stop' | 'care' | 'all', keepDays } }
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'ai', org });
const me = currentUser(org);
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');
app.classList.add('frame', 'ai-app');
let side = h('nav');
const main = h('section', { class: 'palette-main ai-main' });
app.replaceChildren(side, main);

const canEdit = canWriteDoc('ai');
const blank = () => ({ id: 'ai', log: {}, settings: { review: 'care', keepDays: 365 } });
const doc = { ...blank(), ...(loadDoc('ai') ?? {}) };
doc.settings = { ...blank().settings, ...doc.settings };
const save = (note) => { saveDoc('ai', doc); if (note) toast(note); };
const staffNames = Object.values(org.staff ?? {}).map((s) => s.name).filter(Boolean);
const nameOf = (id) => org.staff?.[id]?.name ?? 'Someone';

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'check', label: 'Check a prompt', icon: 'checklist' },
  { id: 'log', label: 'Prompt log', icon: 'history' },
  { id: 'review', label: 'Review', icon: 'handshake' },
  { id: 'tools', label: 'AI tools', icon: 'plug' },
  { id: 'keys', label: 'Keys', icon: 'key', more: true },
  { id: 'proxy', label: 'Claude proxy', icon: 'flow', more: true },
];
const tools = () => AI_TOOLS.map((id) => PLUGINS.find((p) => p.id === id)).filter((p) => p && plugins.has(p.id));
const waiting = () => Object.values(doc.log).filter((x) => x.status === 'review');
const route = () => (location.hash.slice(1) || 'home').split('/')[0];
const n = (count, word, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;
const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function render() {
  const view = TABS.some((t) => t.id === route()) ? route() : 'home';
  drawSide(view);
  setCrumbs([]);
  const pages = { home: Home, check: Check, log: Log, review: Review, tools: Tools, keys: Keys, proxy: Proxy };
  main.replaceChildren(h('div', { class: 'ai-page' }, PluginHeader('ai', { tabs: TABS, current: view }), pages[view]()));
}

function drawSide(view) {
  const subs = { home: 'AI as a collaborator, people in charge', check: 'Look it over before it goes anywhere', log: n(Object.keys(doc.log).length, 'prompt'), review: waiting().length ? `${n(waiting().length, 'prompt')} waiting` : 'Nothing waiting', tools: n(tools().length, 'tool'), keys: 'Not connected yet', proxy: 'The plan · not built yet' };
  side = swapSide(side, SideNav({ label: 'AI', sections: [
    { title: 'AI · experimental', items: TABS.map((t) => ({ label: t.label, sub: subs[t.id], icon: t.icon, href: `#${t.id}`, on: view === t.id, badge: t.id === 'review' && waiting().length ? String(waiting().length) : null })) },
    tools().length > 0 && { title: 'AI tools', items: tools().map((p) => ({ label: p.name, sub: p.short, icon: p.icon ?? 'plug', href: linkTo(p.id) })) },
  ].filter(Boolean) }));
}

/* ------------------------------------------------------------------ home */
function Home() {
  const log = Object.values(doc.log);
  return h('div', {},
    h('div', { class: 'ai-intro' },
      h('h2', {}, 'AI at ', org.name),
      h('p', {}, 'AI can be a collaborator in your change work: it drafts, summarises and suggests, and people decide. This is where that is kept honest. Prompts are checked before they go anywhere, logged without personal details, and anything risky waits for a person to look.'),
      h('p', { class: 'ai-soon' }, icon('info', 14), ' Experimental. Nothing here talks to an AI yet. The checks, the log and the review queue work now; a Claude connection through Dashi comes next.')),
    h('div', { class: 'ai-stats' },
      Stat(log.length, 'prompts logged'), Stat(waiting().length, 'waiting for review'), Stat(log.filter((x) => x.level === 'stop').length, 'stopped by the checks'), Stat(tools().length, 'AI tools here')),
    h('div', { class: 'ai-cards' },
      Card('checklist', 'Check a prompt', 'AI literacy, as you type: personal data, risky uses and weak prompts, with a safe copy to use.', '#check'),
      Card('handshake', 'Human in the loop', 'Prompts the checks flag wait here for a person to read, note and clear.', '#review'),
      Card('history', 'Prompt log', 'What the org asks AI, without names, emails or numbers in it.', '#log'),
      Card('flow', 'Claude through Dashi', 'The plan: prompts recorded, checked and scanned on Dashi’s server before they go to Claude, and answers shown back here.', '#proxy')),
    tools().length > 0 && h('section', {}, h('h2', { class: 'ai-h2' }, 'AI tools'), ToolList()));
}
const Stat = (v, label) => h('div', { class: 'ai-stat' }, h('strong', {}, String(v)), h('span', {}, label));
const Card = (ic, title, text, href) => h('a', { class: 'ai-card', href }, icon(ic, 20), h('b', {}, title), h('span', {}, text));

/* ----------------------------------------------------------------- check */
const draft = { text: '', purpose: '' };
function Check() {
  const out = h('div', { class: 'ai-result', 'aria-live': 'polite' });
  const area = h('textarea', { class: 'textarea ai-text', rows: 9, name: 'ai-prompt', placeholder: 'Write or paste a prompt you mean to give an AI tool. It stays in your browser.', oninput: (e) => { draft.text = e.target.value; draw(); } }, draft.text);
  const purpose = h('input', { class: 'input input-sm', name: 'ai-purpose', placeholder: 'What is it for? (e.g. a first draft of the spring appeal)', value: draft.purpose, oninput: (e) => { draft.purpose = e.target.value; } });
  function draw() {
    const t = draft.text.trim();
    if (!t) { out.replaceChildren(h('p', { class: 'muted' }, 'The checks show here as you type: what to take out, what needs care, and how to get a better answer.')); return; }
    const r = checkPrompt(t, { staffNames });
    const lv = LEVELS[r.level];
    out.replaceChildren(
      h('div', { class: `ai-verdict lv-${r.level}` }, h('b', {}, lv.label), h('span', {}, lv.note)),
      h('ul', { class: 'ai-findings' }, r.findings.map((f) => h('li', { class: `lv-${f.level}` },
        h('span', { class: 'ai-dot', 'aria-hidden': 'true' }),
        h('div', {}, h('b', {}, f.title), h('p', {}, f.note), f.hits && h('p', { class: 'ai-hits' }, f.hits.map((x) => h('code', {}, x))))))),
      r.findings.some((f) => f.level === 'stop' || f.id === 'names') && h('div', { class: 'ai-safe' },
        h('h3', {}, 'A safer copy'),
        h('pre', {}, r.redacted),
        h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { draft.text = r.redacted; area.value = r.redacted; draw(); } }, icon('magic', 13), 'Use the safer copy')),
      h('div', { class: 'ai-actions' },
        canEdit && h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => logIt(r) }, icon('history', 14), r.level === 'ok' && doc.settings.review !== 'all' ? 'Log it' : 'Log it for review'),
        h('button', { type: 'button', class: 'btn btn-sm', disabled: true, title: 'Coming with the Claude proxy' }, icon('sparkle', 14), 'Send to Claude (coming)')));
  }
  function logIt(r) {
    const needs = doc.settings.review === 'all' || (doc.settings.review === 'care' && r.level !== 'ok') || (doc.settings.review === 'stop' && r.level === 'stop');
    const id = uid('pr');
    doc.log[id] = { id, at: new Date().toISOString(), by: me?.id ?? null, text: r.redacted, level: r.level, findings: r.findings.map((f) => f.id), purpose: draft.purpose.trim(), status: needs ? 'review' : 'logged' };
    save(needs ? 'Logged, and waiting for a person to look' : 'Logged');
    draft.text = ''; draft.purpose = '';
    render();
  }
  draw();
  return h('div', { class: 'ai-check' },
    h('section', { class: 'panel' }, h('h2', {}, 'Check a prompt before it goes anywhere'), area, purpose,
      h('p', { class: 'muted small' }, 'Only the safer copy is logged: emails, phone numbers, ID numbers, postal codes and colleagues’ names come out first.')),
    h('section', { class: 'panel' }, out),
    h('section', { class: 'panel ai-tipsbox' }, h('h2', {}, 'Good prompts, briefly'),
      h('ol', {},
        h('li', {}, h('b', {}, 'Say who it’s for'), ' and what they already know.'),
        h('li', {}, h('b', {}, 'Give it what it needs'), ': the facts, your notes, an example of the tone you want.'),
        h('li', {}, h('b', {}, 'Ask for a shape'), ': three bullets, 150 words, a table.'),
        h('li', {}, h('b', {}, 'Check what comes back'), ': every figure, name and source. It can sound sure and be wrong.'),
        h('li', {}, h('b', {}, 'Say so'), ' when AI helped make something people will read.'))));
}

/* ------------------------------------------------------------------- log */
function Log() {
  const rows = Object.values(doc.log).sort((a, b) => b.at.localeCompare(a.at));
  if (!rows.length) return h('div', { class: 'card empty-card' }, h('p', {}, 'Nothing logged yet. Prompts you check and log show here, without personal details.'), h('a', { class: 'btn btn-sm', href: '#check' }, 'Check a prompt'));
  return h('div', {},
    h('p', { class: 'muted ai-lead' }, `${n(rows.length, 'prompt')} logged. Only safer copies are kept. Later, prompts sent through the Claude proxy will be logged here with their answers.`),
    h('ul', { class: 'ai-log' }, rows.map(Row)));
}
function Row(x) {
  return h('li', { class: `ai-row lv-${x.level}` },
    h('button', { type: 'button', onclick: () => openEntry(x) },
      h('span', { class: 'ai-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'ai-row-text' }, h('b', {}, x.purpose || x.text.slice(0, 80)), h('small', {}, `${nameOf(x.by)} · ${when(x.at)}`)),
      h('span', { class: `badge badge-sm ${x.status === 'review' ? 'badge-warning' : x.status === 'cleared' ? 'badge-success' : 'badge-ghost'} badge-soft` }, { review: 'Waiting for review', cleared: 'Cleared', logged: 'Logged', held: 'Held back' }[x.status] ?? x.status)));
}
/** One prompt in a drawer: its text, what the checks found, and the review. */
function openEntry(x) {
  const note = h('textarea', { class: 'textarea', rows: 3, name: 'ai-note', placeholder: 'A note for the log (what you checked, what you changed)' }, x.note ?? '');
  const decide = (status) => { x.status = status; x.reviewer = me?.id ?? null; x.note = note.value.trim(); x.reviewedAt = new Date().toISOString(); save(status === 'cleared' ? 'Cleared' : 'Held back'); d.close(); render(); };
  const d = Drawer({
    title: x.purpose || 'A logged prompt', sub: `${nameOf(x.by)} · ${when(x.at)} · ${LEVELS[x.level]?.label ?? ''}`,
    body: h('div', { class: 'ai-entry' },
      h('pre', {}, x.text),
      x.findings?.length > 0 && h('p', { class: 'muted small' }, 'The checks found: ', x.findings.join(', ')),
      x.reviewer && h('p', { class: 'small' }, `${x.status === 'cleared' ? 'Cleared' : 'Held back'} by ${nameOf(x.reviewer)}`, x.note ? `: ${x.note}` : ''),
      canEdit && x.status === 'review' && h('label', { class: 'ai-field' }, h('span', {}, 'Review note'), note)),
    actions: canEdit && x.status === 'review' ? [
      h('button', { class: 'btn btn-sm', onclick: () => decide('held') }, 'Hold it back'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => decide('cleared') }, icon('check', 14), 'Clear it'),
    ] : [],
  });
}

/* ---------------------------------------------------------------- review */
function Review() {
  const list = waiting();
  const opts = [['stop', 'Only prompts the checks stop'], ['care', 'Prompts that need care or are stopped'], ['all', 'Every prompt']];
  return h('div', {},
    h('div', { class: 'ai-intro' }, h('h2', {}, 'Human in the loop'),
      h('p', {}, 'AI helps; people decide. Prompts the checks flag wait here until someone reads them, adds a note, and clears or holds them back. When the Claude proxy comes, a flagged prompt will wait here before it is sent, and answers about people will wait before they are shown.')),
    h('section', { class: 'panel ai-setting' }, h('h3', {}, 'What waits for a person'),
      h('div', { role: 'radiogroup', class: 'ai-radios' }, opts.map(([v, label]) => h('label', {},
        h('input', { type: 'radio', name: 'ai-review', value: v, checked: doc.settings.review === v, disabled: !canEdit, onchange: () => { doc.settings.review = v; save('Saved'); render(); } }), label)))),
    list.length ? h('ul', { class: 'ai-log' }, list.map(Row)) : h('div', { class: 'card empty-card' }, h('p', {}, 'Nothing waiting. Flagged prompts show here.')));
}

/* ----------------------------------------------------------------- tools */
function ToolList() {
  const list = tools();
  return h('div', { class: 'ai-cards' }, list.map((p) => h('a', { class: 'ai-card', href: linkTo(p.id) }, icon(p.icon ?? 'plug', 20), h('b', {}, p.name), h('span', {}, p.blurb ?? ''))));
}
function Tools() {
  const off = AI_TOOLS.map((id) => PLUGINS.find((p) => p.id === id)).filter((p) => p && !plugins.has(p.id));
  return h('div', {},
    h('p', { class: 'muted ai-lead' }, 'The AI tools live inside this plugin. Each keeps its own records and settings.'),
    tools().length ? ToolList() : h('div', { class: 'card empty-card' }, h('p', {}, 'No AI tools are switched on for you yet.')),
    off.length > 0 && h('p', { class: 'muted small ai-off' }, `Not switched on here: ${off.map((p) => p.name).join(', ')}. An admin can switch them on in `, linkTo('org', '#plugins') ? h('a', { href: linkTo('org', '#plugins') }, 'Organisation → Plugins') : 'Organisation → Plugins', '.'));
}

/* ------------------------------------------------------------------ keys */
function Keys() {
  return h('div', { class: 'ai-plan' },
    h('div', { class: 'ai-intro' }, h('h2', {}, 'Connecting an AI provider'),
      h('p', {}, 'Coming next. A key is a password for an AI service. It will live on Dashi’s server, never in a page or a document people can read, and Dashi will use it on your behalf through the proxy.')),
    h('div', { class: 'ai-keys' },
      h('div', { class: 'ai-key' }, icon('sparkle', 20), h('div', {}, h('b', {}, 'Claude (Anthropic)'), h('small', {}, 'First provider. For testing, the platform’s own key; later, each organisation brings its own.')), h('span', { class: 'badge badge-ghost' }, 'Not connected')),
      h('div', { class: 'ai-key muted' }, icon('plug', 20), h('div', {}, h('b', {}, 'Other providers'), h('small', {}, 'The slot stays open; the checks and log work the same for any of them.')), h('span', { class: 'badge badge-ghost' }, 'Later'))),
    h('section', { class: 'panel' }, h('h3', {}, 'What the connection will add'),
      h('ul', { class: 'ai-list' },
        h('li', {}, 'A monthly spending cap per organisation, and a count of what has been used.'),
        h('li', {}, 'Who may send prompts, by role, like any plugin.'),
        h('li', {}, 'A switch to turn it off at once.'))));
}

/* ----------------------------------------------------------------- proxy */
function Proxy() {
  const step = (ic, title, text, state) => h('li', { class: `ai-step st-${state}` }, h('span', { class: 'ai-step-ic' }, icon(ic, 18)), h('div', {}, h('b', {}, title), h('p', {}, text)), h('span', { class: 'ai-step-state' }, state === 'now' ? 'Works now' : 'Planned'));
  return h('div', { class: 'ai-plan' },
    h('div', { class: 'ai-intro' }, h('h2', {}, 'Claude through Dashi'),
      h('p', {}, 'The aim: your organisation talks to Claude through Dashi, not around it. Dashi sits in between as a layer you control. Each prompt is recorded, checked and scanned before it goes; the answer comes back and is shown here. Nothing is sent yet.')),
    h('ol', { class: 'ai-flow' },
      step('pencil', 'Someone writes a prompt', 'In AI, or from a plugin that offers help (Rhizome’s Claude engine, a draft in Web).', 'now'),
      step('checklist', 'Checked in the browser', 'The AI literacy checks: personal data out, risky uses flagged, tips for a better prompt.', 'now'),
      step('history', 'Recorded', 'The safer copy goes in the prompt log, with who asked and what for.', 'now'),
      step('handshake', 'A person looks, if it needs one', 'Flagged prompts wait in Review until someone clears them.', 'now'),
      step('shield', 'Checked again on the server', 'The same checks, plus a scan against your AI policy’s red uses and data rules, so no page can skip them.', 'planned'),
      step('sparkle', 'Sent to Claude', 'With your organisation’s key, inside its spending cap.', 'planned'),
      step('chats', 'The answer comes back', 'Shown here and logged with the prompt, marked as made with AI, for a person to read and own.', 'planned')),
    h('section', { class: 'panel' }, h('h3', {}, 'Not yet'),
      h('p', { class: 'muted small' }, 'No calls are made, and no key is stored. When this is built it will be off until an organisation switches it on.')));
}

window.addEventListener('hashchange', render);
render();
