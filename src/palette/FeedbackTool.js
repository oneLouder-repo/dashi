import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { loadDoc, onDocChange } from '../platform/storage.js';
import { QUESTION_KINDS, PLACES, question, blankForm, migrateFeedback, summarise } from '../platform/feedback.js';
import { uiConfirm } from '../ui/dialog.js';
import { short } from '../strategy/dates.js';

/**
 * Feedback forms mini-tool: ask visitors (or the board) what they make of
 * the data. A form has a few short questions and shows on a site: under
 * every dashboard, or at the bottom of the front page. Answers come back
 * here, question by question. Visitors can answer but never read them.
 */
let feedback = migrateFeedback(loadDoc('feedback'));
let listening = false;

export function FeedbackTool(ctx) {
  if (!listening) { listening = true; onDocChange('feedback', (doc) => { feedback = migrateFeedback(doc); ctx.render(); }); }
  const { dashboards: store, org } = ctx;
  const forms = Object.values(store.doc.forms ?? {}).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const firstSite = Object.values(org.sites).find((s) => s.visibility === 'public')?.id ?? null;
  const add = () => {
    const op = store.apply(col.add('forms', blankForm(firstSite)));
    ctx.formId = op.id;
    ctx.formTab = 'edit';
    ctx.render();
  };
  const head = h('div', { class: 'fb-tool-head' },
    h('div', {}, h('h1', {}, 'Feedback forms'),
      h('p', { class: 'lede' }, 'Ask the people who read your numbers what they make of them: is it clear, what is missing, what would they like to see. A form shows on a site, under your dashboards or on the front page, and the answers come back here.')),
    h('button', { class: 'btn btn-sm btn-primary', onclick: add }, icon('plus', 14), 'New form'));
  if (!forms.length) return h('div', {}, head, h('p', { class: 'empty' }, 'No forms yet. Start one, and it will have three good questions ready to change.'));

  const f = forms.find((x) => x.id === ctx.formId) ?? forms[0];
  ctx.formId = f.id;
  const tab = ctx.formTab ?? 'answers';
  const sum = summarise(f, feedback.responses);
  const site = org.sites[f.siteId];
  const live = f.visibility === 'public' && site && site.visibility !== 'private';

  const list = h('div', { class: 'fb-forms' }, forms.map((x) => {
    const n = summarise(x, feedback.responses).total;
    const st = org.sites[x.siteId];
    return h('button', { class: `fb-form-card${x.id === f.id ? ' on' : ''}`, onclick: () => { ctx.formId = x.id; ctx.render(); } },
      h('strong', {}, x.title),
      h('small', {}, `${st?.name ?? 'No site'} · ${x.visibility === 'public' || st?.visibility === 'private' ? 'showing' : 'private draft'}`),
      h('span', { class: 'fb-count' }, String(n), h('small', {}, n === 1 ? ' answer' : ' answers')));
  }));

  return h('div', { class: 'fb-tool' },
    head,
    list,
    h('section', { class: 'fb-detail card' },
      h('header', { class: 'fb-detail-head' },
        h('div', {}, h('h2', {}, f.title),
          h('span', { class: `dd-status ${live || site?.visibility === 'private' ? 'on' : ''}` }, site?.visibility === 'private' ? `For members, on ${site.name}` : live ? `Showing on ${site.name}, ${PLACES.find((p) => p.id === f.place)?.label.toLowerCase()}` : 'Not showing yet')),
        h('div', { role: 'tablist', class: 'seg' },
          [['answers', `Answers (${sum.total})`], ['edit', 'Questions and where it shows']].map(([id, label]) => h('button', { role: 'tab', class: tab === id ? 'on' : '', 'aria-selected': String(tab === id), onclick: () => { ctx.formTab = id; ctx.render(); } }, label)))),
      tab === 'edit' ? Editor(ctx, f) : Answers(f, sum)));
}

function Answers(f, sum) {
  if (!sum.total) return h('p', { class: 'empty' }, 'No answers yet. Once the form is showing on a site, answers arrive here as people send them.');
  return h('div', { class: 'fb-answers' },
    h('p', { class: 'muted small' }, `${sum.total} answer${sum.total === 1 ? '' : 's'}, the latest ${short(sum.latest.slice(0, 10))}.`),
    sum.questions.map((s) => h('div', { class: 'fb-sum' },
      h('h3', {}, s.q.text, h('small', {}, ` ${s.n} answered`)),
      s.q.kind === 'rating' ? h('div', { class: 'fb-rating' },
        h('strong', { class: 'fb-avg' }, s.avg ?? '—', h('small', {}, ' / 5')),
        h('div', { class: 'fb-bars' }, [5, 4, 3, 2, 1].map((k) => h('div', { class: 'fb-bar-row' }, h('span', {}, `${k}★`), h('span', { class: 'fb-bar' }, h('i', { style: `width:${s.n ? (s.counts[k - 1] / s.n) * 100 : 0}%` })), h('span', { class: 'fb-bar-n' }, String(s.counts[k - 1]))))))
      : s.q.kind === 'yesno' ? h('div', { class: 'fb-bars' }, [['yes', 'Yes'], ['no', 'No']].map(([k, label]) => h('div', { class: 'fb-bar-row' }, h('span', {}, label), h('span', { class: 'fb-bar' }, h('i', { style: `width:${s.n ? (s.counts[k] / s.n) * 100 : 0}%` })), h('span', { class: 'fb-bar-n' }, String(s.counts[k])))))
      : s.q.kind === 'choice' ? h('div', { class: 'fb-bars' }, [...s.counts].sort((a, b) => b.n - a.n).map((c) => h('div', { class: 'fb-bar-row wide' }, h('span', {}, c.option), h('span', { class: 'fb-bar' }, h('i', { style: `width:${s.n ? (c.n / s.n) * 100 : 0}%` })), h('span', { class: 'fb-bar-n' }, String(c.n)))))
      : s.texts.length ? h('ul', { class: 'fb-texts' }, s.texts.slice(0, 30).map((t) => h('li', {}, `“${t}”`))) : h('p', { class: 'muted small' }, 'No written answers yet.'))));
}

function Editor(ctx, f) {
  const { dashboards: store, org } = ctx;
  const save = (patch) => store.apply(col.update('forms', f.id, patch));
  const setQ = (id, patch) => save({ questions: f.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  const move = (i, by) => { const qs = [...f.questions]; [qs[i], qs[i + by]] = [qs[i + by], qs[i]]; save({ questions: qs }); };
  const field = (label, input, cls = '') => h('label', { class: `fieldset ${cls}` }, h('span', { class: 'fieldset-legend' }, label), input);
  const dashes = Object.values(store.doc.dashboards).filter((d) => d.siteId === f.siteId);
  return h('div', { class: 'fb-editor' },
    h('div', { class: 'fb-fields' },
      field('Title', h('input', { class: 'input input-sm w-full', name: 'fb-title', value: f.title, onchange: (e) => save({ title: e.target.value || 'Feedback' }) }), 'span-2'),
      field('A line to invite people in', h('input', { class: 'input input-sm w-full', name: 'fb-intro', value: f.intro ?? '', onchange: (e) => save({ intro: e.target.value }) }), 'span-2'),
      field('Thank-you message', h('input', { class: 'input input-sm w-full', name: 'fb-thanks', value: f.thanks ?? '', onchange: (e) => save({ thanks: e.target.value }) }), 'span-2'),
      field('Site', h('select', { class: 'select select-sm w-full', name: 'fb-site', onchange: (e) => save({ siteId: e.target.value || null }) },
        h('option', { value: '' }, 'No site'), options(Object.values(org.sites).map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (members only)' : ''}` })), f.siteId))),
      field('Where on the site', h('select', { class: 'select select-sm w-full', name: 'fb-place', onchange: (e) => save({ place: e.target.value }) }, options(PLACES, f.place))),
      h('div', { class: 'fb-vis span-2' },
        f.visibility === 'public'
          ? h('button', { class: 'btn btn-sm', onclick: () => save({ visibility: 'private' }) }, 'Stop showing it')
          : h('button', { class: 'btn btn-sm btn-primary', disabled: !f.siteId, onclick: () => save({ visibility: 'public' }) }, 'Show it on the site'),
        f.place === 'dashboards' && h('small', { class: 'muted' }, dashes.length ? `Under ${dashes.map((d) => d.title).join(', ')}.` : 'This site has no dashboards yet, so pick the front page instead.'),
        h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (await uiConfirm(`Delete “${f.title}”? Its answers stay in the feedback record.`)) { store.apply(col.remove('forms', f.id)); ctx.formId = null; ctx.render(); } } }, icon('trash', 14), 'Delete'))),
    h('h3', {}, 'Questions'),
    h('ol', { class: 'fb-qs' }, f.questions.map((q, i) => h('li', {},
      h('div', { class: 'fb-q-row' },
        h('input', { class: 'input input-sm', name: `q-${q.id}`, value: q.text, placeholder: 'Ask something short', onchange: (e) => setQ(q.id, { text: e.target.value }) }),
        h('select', { class: 'select select-sm', 'aria-label': 'Kind of answer', onchange: (e) => setQ(q.id, { kind: e.target.value, options: e.target.value === 'choice' && !(q.options ?? []).length ? ['First', 'Second'] : q.options }) }, options(QUESTION_KINDS, q.kind)),
        h('button', { class: 'btn btn-xs btn-ghost', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(i, -1) }, icon('chevronUp', 14)),
        h('button', { class: 'btn btn-xs btn-ghost', disabled: i === f.questions.length - 1, 'aria-label': 'Move down', onclick: () => move(i, 1) }, icon('chevronDown', 14)),
        h('button', { class: 'btn btn-xs btn-ghost', 'aria-label': 'Remove', onclick: () => save({ questions: f.questions.filter((x) => x.id !== q.id) }) }, icon('close', 14))),
      q.kind === 'choice' && h('div', { class: 'fb-opts' },
        (q.options ?? []).map((o, k) => h('span', { class: 'fb-opt' }, h('input', { class: 'input input-xs', value: o, 'aria-label': `Option ${k + 1}`, onchange: (e) => setQ(q.id, { options: q.options.map((x, j) => (j === k ? e.target.value : x)).filter(Boolean) }) }),
          h('button', { class: 'btn btn-xs btn-ghost', 'aria-label': 'Remove option', onclick: () => setQ(q.id, { options: q.options.filter((_, j) => j !== k) }) }, '×'))),
        h('button', { class: 'btn btn-xs', onclick: () => setQ(q.id, { options: [...(q.options ?? []), 'Another'] }) }, icon('plus', 12), 'Option'))))),
    h('div', { class: 'fb-add' }, h('span', { class: 'muted small' }, 'Add a question:'),
      QUESTION_KINDS.map((k) => h('button', { class: 'btn btn-xs', title: k.blurb, onclick: () => save({ questions: [...f.questions, question(k.id, '', k.id === 'choice' ? ['First', 'Second'] : [])] }) }, k.label))),
    h('p', { class: 'muted small' }, 'Keep it to three or four questions. Answers are anonymous: the form never asks for a name or email.'));
}
