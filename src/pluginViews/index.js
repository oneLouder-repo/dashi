import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/Shell.js';
import { readability, applySwaps } from '../platform/plainWords.js';
import { LESSONS, STOP_THINK_CHECK, SIX_QUESTIONS, TRACE, CREDIT, lessonsOf, lessonText, migrateCritical, suggestFor } from '../platform/criticalMedia.js';

/**
 * Tool views for the plugins released in alpha.5. Each draws the plugin's
 * own page on plugin.html, above the records its data model keeps (which
 * stay editable as tables underneath). A view gets:
 *
 *   ctx { id, org, me, canEdit, doc(name), save(name), records(coll), put(coll, rec), remove(coll, id), edit(coll, rec?), render() }
 *
 * where records/put/remove/edit work on the plugin's first document.
 */
export const TOOL_VIEWS = {
  'plain-words': PlainWords,
  'ai-policy': AiPolicy,
  'ai-register': AiRegister,
  'prompt-commons': PromptCommons,
  'critical-media': CriticalMedia,
};

const copy = async (text, what = 'Copied') => { try { await navigator.clipboard.writeText(text); toast(what); } catch { toast('Couldn’t copy: select the text and copy it yourself'); } };
const tabsOf = (state, key, list, render) => h('div', { role: 'tablist', class: 'tabs tabs-border pv-tabs' }, list.map(([id, label, ic]) =>
  h('button', { role: 'tab', type: 'button', class: `tab${state[key] === id ? ' tab-active' : ''}`, 'aria-selected': String(state[key] === id), onclick: () => { state[key] = id; render(); } }, ic && icon(ic, 15), label)));

/* ------------------------------------------------------------------ Plain Words */
const pw = { text: '', title: '' };
function PlainWords(ctx) {
  const out = h('div', { class: 'pw-out' });
  const area = h('textarea', { class: 'textarea pw-text', rows: 10, name: 'pw-text', placeholder: 'Paste a paragraph, a page or a post here. Nothing leaves your browser.', oninput: (e) => { pw.text = e.target.value; draw(); } }, pw.text);
  function draw() {
    const t = pw.text.trim();
    if (!t) { out.replaceChildren(h('p', { class: 'muted' }, 'The reading level, long sentences and plainer words show here as you type.')); return; }
    const r = readability(t);
    const pct = Math.max(4, Math.min(100, 100 - (r.grade / 16) * 100));
    out.replaceChildren(
      h('div', { class: `pw-score lv-${r.verdict.level}` },
        h('div', { class: 'pw-grade' }, h('strong', {}, String(r.grade)), h('span', {}, 'reading grade')),
        h('div', {}, h('b', {}, r.verdict.label), h('p', { class: 'muted small' }, r.verdict.note),
          h('div', { class: 'pw-meter', title: `Reading ease ${r.ease} of 100` }, h('i', { style: `width:${pct}%` })))),
      h('ul', { class: 'pw-facts' },
        h('li', {}, h('strong', {}, String(r.words)), ' words'),
        h('li', {}, h('strong', {}, String(r.sentences)), ' sentences'),
        h('li', {}, h('strong', {}, String(r.avgSentence)), ' words a sentence'),
        h('li', {}, h('strong', {}, String(r.ease)), ' reading ease')),
      r.longSentences.length > 0 && h('section', {}, h('h3', {}, `Long sentences (${r.longSentences.length})`), h('p', { class: 'muted small' }, 'More than 25 words. Try splitting each into two.'),
        h('ol', { class: 'pw-long' }, r.longSentences.slice(0, 6).map((s) => h('li', {}, s)))),
      r.swaps.length > 0 && h('section', {}, h('h3', {}, 'Plainer words'),
        h('ul', { class: 'pw-swaps' }, r.swaps.map((x) => h('li', {}, h('s', {}, x.from), ' → ', h('b', {}, x.to)))),
        h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { pw.text = applySwaps(pw.text); area.value = pw.text; draw(); } }, icon('magic', 13), 'Swap them in')),
      r.hardWords.length > 0 && h('section', {}, h('h3', {}, 'Long words'), h('p', { class: 'pw-hard' }, r.hardWords.slice(0, 18).join(' · '))),
      ctx.canEdit && h('div', { class: 'pw-save' },
        h('input', { class: 'input input-sm', name: 'pw-title', placeholder: 'What is it? (e.g. Spring newsletter intro)', value: pw.title, oninput: (e) => { pw.title = e.target.value; } }),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
          ctx.put('checks', { title: pw.title.trim() || t.slice(0, 40), before: t, grade: r.grade, status: r.grade <= 8 ? 'Rewritten' : 'To do' });
          toast('Saved to your checks');
        } }, 'Save this check')));
  }
  draw();
  const checks = ctx.records('checks');
  return h('div', { class: 'pv' },
    h('section', { class: 'panel pw-tool' },
      h('div', { class: 'pw-cols' }, h('div', {}, h('h2', {}, 'Check how easy it is to read'), area), out)),
    checks.length > 0 && h('section', { class: 'panel' }, h('h2', {}, 'Recent checks'),
      h('ul', { class: 'pv-list' }, checks.slice(0, 6).map((c) => h('li', {},
        h('span', { class: `pw-pill lv-${readability(c.before ?? '').verdict.level}` }, `Grade ${c.grade ?? '?'}`),
        h('button', { type: 'button', class: 'link-button', onclick: () => { pw.text = c.before ?? ''; pw.title = c.title ?? ''; ctx.render(); } }, c.title),
        h('span', { class: 'muted small' }, c.status ?? ''))))));
}

/* ------------------------------------------------------------------ AI Policy Studio */
const LIGHTS = [['Green: go ahead', 'green', 'Go ahead'], ['Amber: with care', 'amber', 'With care'], ['Red: not here', 'red', 'Not here']];
const STARTER_PRINCIPLES = [
  ['Care first', 'We use AI where it gives people more time for each other, never to replace a relationship.'],
  ['Consent and privacy', 'We never put personal, health or client information into an AI tool without consent and a reason.'],
  ['Data sovereignty', 'Data held with or about Indigenous communities follows their rules (OCAP® and the CARE principles), not a tool’s.'],
  ['People decide', 'A person reads, checks and owns anything AI helps to make before it goes out.'],
  ['Say so', 'We tell people when AI helped make something they read, hear or see from us.'],
  ['Open to all', 'We prefer free, accessible tools, so nobody is left out by cost or ability.'],
];
const STARTER_RULES = [
  ['Drafting a first version of a newsletter or post', 'Green: go ahead', 'Public information only. A person edits and checks every fact.'],
  ['Plain-language rewrites of our own public pages', 'Green: go ahead', 'Check the meaning stayed the same.'],
  ['Summarising a long public report', 'Green: go ahead', 'Read the parts you quote.'],
  ['Summarising notes from a meeting with partners', 'Amber: with care', 'Remove names first, and ask partners if they mind.'],
  ['Analysing survey answers', 'Amber: with care', 'Only anonymous answers. Check themes against the raw data.'],
  ['Anything with youth participants’ personal details', 'Red: not here', 'Never. Use our own systems.'],
  ['Decisions about funding, hiring or who gets a service', 'Red: not here', 'People decide, with reasons they can explain.'],
];
function AiPolicy(ctx) {
  const principles = ctx.records('principles');
  const rules = ctx.records('rules');
  const reviews = ctx.records('reviews').sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const next = reviews[0]?.next;
  const starter = (principles.length + rules.length) === 0 && ctx.canEdit && h('div', { class: 'pv-starter' },
    h('p', {}, 'Start from a draft written for community organisations, then make it yours.'),
    h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
      for (const [title, statement] of STARTER_PRINCIPLES) ctx.put('principles', { title, statement }, { quiet: true });
      for (const [useCase, light, safeguards] of STARTER_RULES) ctx.put('rules', { useCase, light, safeguards }, { quiet: true });
      ctx.render();
    } }, icon('sparkle', 14), 'Add the starter principles and uses'));
  const policy = [
    `${ctx.org.name}: how we use AI`,
    '',
    'What we hold to',
    ...principles.map((p) => `- ${p.title}: ${p.statement ?? ''}`),
    '',
    'Go ahead', ...rules.filter((r) => r.light?.startsWith('Green')).map((r) => `- ${r.useCase}${r.safeguards ? ` (${r.safeguards})` : ''}`),
    '',
    'With care', ...rules.filter((r) => r.light?.startsWith('Amber')).map((r) => `- ${r.useCase}${r.safeguards ? ` (${r.safeguards})` : ''}`),
    '',
    'Not here', ...rules.filter((r) => r.light?.startsWith('Red')).map((r) => `- ${r.useCase}${r.safeguards ? ` (${r.safeguards})` : ''}`),
    '',
    next ? `We will look at this again by ${next}.` : 'We will look at this again within a year.',
  ].join('\n');
  return h('div', { class: 'pv' },
    starter,
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'What we hold to'), h('span', { class: 'spacer' }), ctx.canEdit && h('button', { class: 'btn btn-xs', onclick: () => ctx.edit('principles') }, icon('plus', 13), 'Principle')),
      principles.length ? h('div', { class: 'pv-cards' }, principles.map((p) => h('article', { class: 'pv-card' }, h('h3', {}, p.title), h('p', {}, p.statement), ctx.canEdit && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => ctx.edit('principles', p) }, icon('pencil', 12), 'Edit'))))
        : h('p', { class: 'muted' }, 'No principles yet.')),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Which uses are fine'), h('span', { class: 'spacer' }), ctx.canEdit && h('button', { class: 'btn btn-xs', onclick: () => ctx.edit('rules') }, icon('plus', 13), 'Use')),
      h('div', { class: 'ap-board' }, LIGHTS.map(([value, light, label]) => h('div', { class: `ap-col l-${light}` },
        h('header', {}, h('span', { class: `sw-wp-light l-${light}` }), h('strong', {}, label), h('span', { class: 'muted small' }, String(rules.filter((r) => r.light === value).length))),
        rules.filter((r) => r.light === value).map((r) => h('article', { class: 'ap-rule', onclick: () => ctx.canEdit && ctx.edit('rules', r) }, h('b', {}, r.useCase), r.safeguards && h('p', { class: 'muted small' }, r.safeguards))),
        ctx.canEdit && h('button', { class: 'board-add', onclick: () => ctx.edit('rules', { light: value }) }, icon('plus', 13), 'Add'))))),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'The policy, in plain words'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-xs', onclick: () => copy(policy, 'The policy is copied') }, icon('copy', 13), 'Copy'),
        ctx.canEdit && h('button', { class: 'btn btn-xs', onclick: () => ctx.edit('reviews', { date: new Date().toISOString().slice(0, 10) }) }, icon('calendar', 13), 'Log a review')),
      h('pre', { class: 'ap-policy' }, policy),
      h('p', { class: 'muted small' }, `Reading grade ${readability(policy).grade}. Aim for 8 or lower so everyone can follow it.`)));
}

/* ------------------------------------------------------------------ AI Use Register */
function AiRegister(ctx) {
  const tools = ctx.records('tools');
  const uses = ctx.records('uses');
  const cost = tools.reduce((n, t) => n + (Number(t.cost) || 0), 0);
  const risks = ['Low', 'Medium', 'High'];
  const kinds = ['Public', 'Internal', 'Personal', 'Restricted'];
  const cell = (k, r) => uses.filter((u) => u.data === k && u.risk === r).length;
  const worry = uses.filter((u) => u.risk === 'High' || u.data === 'Personal' || u.data === 'Restricted');
  const summary = `${tools.length} AI tool${tools.length === 1 ? '' : 's'} (${tools.filter((t) => t.status === 'Approved').length} approved), about $${cost.toLocaleString('en-CA')} a month. ${uses.length} uses logged; ${worry.length} need a closer look.`;
  return h('div', { class: 'pv' },
    h('section', { class: 'panel ar-top' },
      h('div', {}, h('h2', {}, 'At a glance'), h('p', { class: 'ar-summary' }, summary)),
      h('div', { class: 'ar-actions' },
        ctx.canEdit && h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.edit('uses', { date: new Date().toISOString().slice(0, 10), person: ctx.me?.id ?? '' }) }, icon('plus', 14), 'Log a use'),
        ctx.canEdit && h('button', { class: 'btn btn-sm', onclick: () => ctx.edit('tools') }, icon('plus', 14), 'Add a tool'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => copy(`AI use at ${ctx.org.name}\n\n${summary}\n\nTools\n${tools.map((t) => `- ${t.name}${t.status ? ` (${t.status})` : ''}${t.dataHome ? `, data goes to ${t.dataHome}` : ''}`).join('\n')}\n\nNeeds a closer look\n${worry.map((u) => `- ${u.tool}: ${u.purpose ?? ''} (${u.data ?? '?'} data, ${u.risk ?? '?'} risk)`).join('\n') || '- Nothing'}`, 'The board summary is copied') }, icon('copy', 14), 'Board summary'))),
    h('section', { class: 'panel' }, h('h2', {}, 'Risk by kind of data'),
      h('p', { class: 'muted small' }, 'Each square counts logged uses. Anything in the bottom right deserves a conversation; check it against the AI policy’s red uses.'),
      h('div', { class: 'ar-grid', style: `--cols:${risks.length}` },
        h('span', {}), risks.map((r) => h('b', { class: 'ar-head' }, `${r} risk`)),
        kinds.flatMap((k, i) => [h('b', { class: 'ar-row' }, k), ...risks.map((r, j) => { const n = cell(k, r); return h('span', { class: `ar-cell s${Math.min(4, i + j)}${n ? '' : ' empty'}` }, n ? String(n) : '·'); })]))),
    h('section', { class: 'panel' }, h('h2', {}, 'Tools in use'),
      tools.length ? h('div', { class: 'pv-cards' }, tools.map((t) => h('article', { class: 'pv-card' },
        h('h3', {}, t.name, t.status && h('span', { class: `badge badge-sm ${t.status === 'Approved' ? 'badge-success' : t.status === 'Trial' ? 'badge-warning' : 'badge-error'} badge-soft` }, t.status)),
        h('p', { class: 'muted small' }, [t.vendor, t.free ? 'Free' : t.cost ? `$${t.cost}/month` : null, t.dataHome && `Data: ${t.dataHome}`].filter(Boolean).join(' · ')),
        h('p', { class: 'small' }, `${uses.filter((u) => u.tool === t.name).length} uses logged`),
        ctx.canEdit && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => ctx.edit('tools', t) }, icon('pencil', 12), 'Edit'))))
        : h('p', { class: 'muted' }, 'No tools yet. Add the ones your team uses, free ones too.')));
}

/* ------------------------------------------------------------------ Prompt Commons */
const STARTER_PROMPTS = [
  ['Plain-language rewrite', 'Plain language', 'Rewrite the text below for a reader at about a grade 8 level. Keep every fact. Use short sentences, everyday words and the active voice. Keep names and numbers exactly as they are.\n\n[paste text]', 'Public data only'],
  ['Meeting notes to actions', 'Summarise', 'From these notes, list the decisions made and the actions agreed, each with who will do it and by when. If something is unclear, say so instead of guessing.\n\n[paste notes with names removed]', 'Internal data'],
  ['Alt text for a picture', 'Draft', 'Write alt text for this picture for a screen reader user, in one or two sentences. Say what matters for why the picture is here: [say where it will appear]. Don’t start with “Image of”.', 'Public data only'],
  ['Themes in survey answers', 'Analyse data', 'Here are anonymous answers to the question “[question]”. Group them into 4 to 7 themes. For each theme give a name, a one-line description, how many answers fit it, and one short quote. List answers that fit no theme.\n\n[paste answers]', 'Internal data'],
  ['Grant outcome, first draft', 'Draft', 'Draft a 150-word outcome statement for a grant report. Program: [name]. What changed: [facts and numbers]. Who it was for: [group]. Write in plain words, with no claims beyond the facts given.', 'Internal data'],
  ['Questions to ask a partner', 'Brainstorm', 'Suggest ten open questions for a yearly check-in with a community partner, about what is working, what is not, and what they need from us. Avoid yes/no questions.', 'No data: general use'],
];
const pc = { task: 'all' };
function PromptCommons(ctx) {
  const prompts = ctx.records('prompts');
  const tasks = ['all', ...new Set(prompts.map((p) => p.task).filter(Boolean))];
  const shown = prompts.filter((p) => pc.task === 'all' || p.task === pc.task);
  return h('div', { class: 'pv' },
    prompts.length === 0 && ctx.canEdit && h('div', { class: 'pv-starter' }, h('p', {}, 'Begin with six recipes that work in most free tools, then add your own.'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => { for (const [title, task, prompt, dataOk] of STARTER_PROMPTS) ctx.put('prompts', { title, task, prompt, dataOk, tested: false, tried: [] }, { quiet: true }); ctx.render(); } }, icon('sparkle', 14), 'Add the starter recipes')),
    h('div', { class: 'pc-bar' },
      h('div', { class: 'pd-chips' }, tasks.map((t) => h('button', { type: 'button', class: `pd-chip${pc.task === t ? ' on' : ''}`, onclick: () => { pc.task = t; ctx.render(); } }, t === 'all' ? 'All' : t))),
      h('span', { class: 'spacer' }),
      ctx.canEdit && h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.edit('prompts') }, icon('plus', 14), 'New recipe')),
    h('div', { class: 'pc-grid' }, shown.map((p) => {
      const tried = p.tried ?? [];
      const mine = ctx.me && tried.includes(ctx.me.id);
      return h('article', { class: 'pc-card' },
        h('header', {}, h('span', { class: 'badge badge-sm badge-ghost' }, p.task ?? 'Other'), h('h3', {}, p.title)),
        h('pre', { class: 'pc-prompt' }, p.prompt),
        h('p', { class: 'muted small' }, icon('shield', 12), ` Fine with: ${p.dataOk ?? 'check the AI policy'}`, p.tool ? ` · tested in ${p.tool}` : ''),
        h('footer', {},
          h('button', { class: 'btn btn-xs btn-primary', onclick: () => copy(p.prompt, 'Recipe copied') }, icon('copy', 12), 'Copy'),
          h('button', { class: `btn btn-xs ${mine ? 'btn-active' : 'btn-ghost'}`, disabled: !ctx.me, title: 'It worked for me', onclick: () => ctx.put('prompts', { ...p, tried: mine ? tried.filter((x) => x !== ctx.me.id) : [...tried, ctx.me.id] }) }, icon('check', 12), `Worked for me${tried.length ? ` · ${tried.length}` : ''}`),
          h('span', { class: 'spacer' }),
          ctx.canEdit && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => ctx.edit('prompts', p) }, icon('pencil', 12))));
    })));
}

/* ------------------------------------------------------------------ Critical Media */
const cm = { tab: 'lessons', open: null };
function CriticalMedia(ctx) {
  const doc = migrateCritical(ctx.doc('plugin/critical-media'));
  const set = (patch) => { doc.settings = { ...doc.settings, ...patch }; ctx.save('plugin/critical-media'); ctx.render(); };
  const lessons = lessonsOf(doc);
  const sessions = ctx.records('sessions');
  const publicSites = Object.values(ctx.org.sites ?? {}).filter((s) => s.visibility === 'public');
  const lesson = cm.open && (lessons.find((l) => l.id === cm.open));
  const ran = (l) => sessions.filter((s) => s.lesson === l.title).length;

  const LessonCard = (l) => h('button', { type: 'button', class: 'cm-lesson', onclick: () => { cm.open = l.id; ctx.render(); } },
    h('span', { class: 'cm-n' }, String(l.n).padStart(2, '0')),
    h('strong', {}, l.title),
    h('span', { class: 'muted small' }, `${l.minutes ?? 60} min${l.builds ? ` · after ${l.builds.split(':')[0]}` : ''}${l.own ? ' · ours' : ''}`),
    h('span', { class: 'cm-take' }, l.takeAway),
    ran(l) > 0 && h('span', { class: 'badge badge-sm badge-soft badge-success' }, `Run ${ran(l)}×`));

  const LessonPage = (l) => h('article', { class: 'panel cm-page' },
    h('div', { class: 'panel-head' },
      h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { cm.open = null; ctx.render(); } }, icon('chevronLeft', 13), 'All lessons'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-xs', onclick: () => copy(lessonText(l), 'Lesson copied') }, icon('copy', 13), 'Copy'),
      h('button', { class: 'btn btn-xs', onclick: () => print() }, icon('download', 13), 'Print'),
      ctx.canEdit && h('button', { class: 'btn btn-xs btn-primary', onclick: () => ctx.edit('sessions', { lesson: l.title, date: new Date().toISOString().slice(0, 10), facilitator: ctx.me?.id ?? '' }) }, icon('plus', 13), 'Log a session')),
    h('p', { class: 'cm-kicker' }, `Lesson ${l.n} · ${l.minutes ?? 60} minutes`),
    h('h2', { class: 'cm-title' }, l.title),
    l.builds && h('p', { class: 'muted small' }, 'Builds on ', h('a', { href: CREDIT.url, target: '_blank', rel: 'noopener' }, 'NALA’s Facts Matter'), `, ${l.builds}.`),
    h('div', { class: 'cm-grid' },
      h('section', {}, h('h3', {}, 'Aims'), h('ul', {}, (l.aims ?? []).map((a) => h('li', {}, a)))),
      h('section', {}, h('h3', {}, 'Warm-up'), h('p', {}, l.warmUp)),
      h('section', { class: 'wide' }, h('h3', {}, 'Activity'), h('p', {}, l.activity)),
      h('section', {}, h('h3', {}, 'Talk about it'), h('ul', {}, (l.talk ?? []).map((q) => h('li', {}, q)))),
      h('section', { class: 'cm-takeaway' }, h('h3', {}, 'Take away'), h('p', {}, l.takeAway)),
      l.stem && h('section', { class: 'wide cm-stem' }, h('h3', {}, icon('lightbulb', 15), 'With STEM learners'), h('p', {}, l.stem))));

  const Toolkit = () => h('div', { class: 'cm-kit' },
    h('section', { class: 'panel cm-stc' }, h('h2', {}, 'Stop. Think. Check.'), h('div', { class: 'cm-stc-row' }, STOP_THINK_CHECK.map((s, i) => h('div', { class: `cm-stc-step s${i}` }, h('strong', {}, s.label), h('p', {}, s.text)))),
      h('p', { class: 'muted small' }, 'From ', h('a', { href: CREDIT.also.url, target: '_blank', rel: 'noopener' }, CREDIT.also.title), ', by ', CREDIT.also.by, '.')),
    h('section', { class: 'panel' }, h('h2', {}, 'Six questions'), h('div', { class: 'cm-six' }, SIX_QUESTIONS.map((q) => h('div', {}, h('b', {}, q.q), h('p', {}, q.text))))),
    h('section', { class: 'panel' }, h('h2', {}, 'Trace a claim'), h('ol', { class: 'cm-trace' }, TRACE.map((t) => h('li', {}, h('b', {}, t.label), ' ', t.text)))));

  const sample = suggestFor('Programs now reach 46% girls and gender-diverse youth, up from 38%.', lessons);
  const OnSites = () => h('div', { class: 'cm-sites' },
    h('section', { class: 'panel' }, h('h2', {}, 'On our public sites'),
      h('p', { class: 'muted' }, 'Short prompts that help visitors read what you publish with a critical eye, starting with your own charts and news. They link to the lesson that fits.'),
      h('label', { class: 'pd-check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: doc.settings.onArticles, disabled: !ctx.canEdit, onchange: (e) => set({ onArticles: e.target.checked }) }), 'Beside news articles: “Read it like a fact-checker”'),
      h('label', { class: 'pd-check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: doc.settings.onDashboards, disabled: !ctx.canEdit, onchange: (e) => set({ onDashboards: e.target.checked }) }), 'Under dashboards: “How to read a chart”'),
      h('label', { class: 'pd-check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: doc.settings.corner, disabled: !ctx.canEdit, onchange: (e) => set({ corner: e.target.checked }) }), 'A “Media smart” page in the site menu, with the lessons and cards'),
      publicSites.length > 1 && h('div', { class: 'cm-sitepick' }, h('span', { class: 'muted small' }, 'On'),
        publicSites.map((s) => h('label', { class: 'pd-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', disabled: !ctx.canEdit, checked: !doc.settings.siteIds.length || doc.settings.siteIds.includes(s.id),
          onchange: (e) => { const all = doc.settings.siteIds.length ? doc.settings.siteIds : publicSites.map((x) => x.id); set({ siteIds: e.target.checked ? [...new Set([...all, s.id])] : all.filter((x) => x !== s.id) }); } }), s.name))),
      publicSites[0] && h('a', { class: 'btn btn-sm', href: `site.html?site=${publicSites[0].id}`, target: '_blank' }, icon('globe', 14), 'See it on the site')),
    h('section', { class: 'panel' }, h('h2', {}, 'What visitors see'),
      h('aside', { class: 'cm-prompt-preview' }, h('strong', {}, icon('news', 15), 'Read it like a fact-checker'),
        h('p', {}, STOP_THINK_CHECK.map((s) => s.label).join(' · ')),
        sample && h('p', { class: 'small' }, 'Try the lesson: ', h('u', {}, sample.title))),
      h('h3', { class: 'small' }, 'Lessons shown'),
      h('ul', { class: 'cm-hide' }, LESSONS.map((l) => h('li', {}, h('label', { class: 'pd-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', disabled: !ctx.canEdit, checked: !doc.settings.hidden[l.id], onchange: (e) => { const hidden = { ...doc.settings.hidden }; if (e.target.checked) delete hidden[l.id]; else hidden[l.id] = true; set({ hidden }); } }), l.title))))));

  return h('div', { class: 'pv' },
    h('div', { class: 'cm-credit' }, icon('book', 16), h('span', {}, 'After ', h('a', { href: CREDIT.url, target: '_blank', rel: 'noopener' }, CREDIT.title), ', by ', CREDIT.by, '. ', CREDIT.note)),
    tabsOf(cm, 'tab', [['lessons', 'Lessons', 'graduation'], ['kit', 'Toolkit cards', 'checklist'], ['sites', 'On our sites', 'globe'], ['sessions', `Sessions (${sessions.length})`, 'history']], () => { cm.open = null; ctx.render(); }),
    cm.tab === 'lessons' && (lesson ? LessonPage(lesson) : h('div', { class: 'cm-lessons' }, lessons.map(LessonCard),
      ctx.canEdit && h('button', { type: 'button', class: 'cm-lesson add', onclick: () => ctx.edit('lessons', { minutes: 60 }) }, icon('plus', 20), h('strong', {}, 'Write our own lesson')))),
    cm.tab === 'kit' && Toolkit(),
    cm.tab === 'sites' && OnSites(),
    cm.tab === 'sessions' && h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Sessions we ran'), h('span', { class: 'spacer' }), ctx.canEdit && h('button', { class: 'btn btn-xs btn-primary', onclick: () => ctx.edit('sessions', { date: new Date().toISOString().slice(0, 10) }) }, icon('plus', 13), 'Log a session')),
      sessions.length ? h('ul', { class: 'pv-list' }, sessions.map((s) => h('li', {}, h('b', {}, s.lesson), h('span', { class: 'muted small' }, [s.date, s.group, s.people && `${s.people} people`].filter(Boolean).join(' · ')), s.notes && h('span', { class: 'small' }, s.notes))))
        : h('p', { class: 'muted' }, 'Nothing logged yet. Log a session from any lesson.')));
}
