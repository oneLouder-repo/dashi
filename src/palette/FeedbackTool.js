import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { loadDoc, onDocChange } from '../platform/storage.js';
import { QUESTION_KINDS, PLACES, LAYOUTS, question, starter, blankForm, migrateFeedback, summarise } from '../platform/feedback.js';
import { FormView } from '../site/feedbackForm.js';
import { applyTheme } from '../platform/themes.js';
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
          [['answers', `Answers (${sum.total})`], ['edit', 'Design the form']].map(([id, label]) => h('button', { role: 'tab', class: tab === id ? 'on' : '', 'aria-selected': String(tab === id), onclick: () => { ctx.formTab = id; ctx.render(); } }, label)))),
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
      : s.q.kind === 'scale' ? h('div', { class: 'fb-rating' },
        h('strong', { class: 'fb-avg' }, s.avg ?? '—', h('small', {}, ' / 10')),
        h('div', { class: 'fb-scale-bars' }, s.counts.map((n, k) => h('span', { title: `${k}: ${n}` }, h('i', { style: `height:${s.n ? Math.max(4, (n / Math.max(...s.counts)) * 100) : 4}%` }), h('small', {}, String(k))))))
      : s.q.kind === 'choice' || s.q.kind === 'multi' ? h('div', { class: 'fb-bars' }, [...s.counts].sort((a, b) => b.n - a.n).map((c) => h('div', { class: 'fb-bar-row wide' }, h('span', {}, c.option), h('span', { class: 'fb-bar' }, h('i', { style: `width:${s.n ? (c.n / s.n) * 100 : 0}%` })), h('span', { class: 'fb-bar-n' }, String(c.n)))))
      : s.texts.length ? h('ul', { class: 'fb-texts' }, s.texts.slice(0, 30).map((t) => h('li', {}, `“${t}”`))) : h('p', { class: 'muted small' }, 'No written answers yet.'))));
}

/**
 * The form designer: the form as visitors will see it, in your site's
 * colours, edited where it stands. Click any words to change them; drag a
 * question by its handle to move it, or drag a kind in from the left; the
 * panel on the right holds the details of what is selected (or of the
 * whole form). "Try it" answers it like a visitor, without sending.
 */
function Editor(ctx, f) {
  const { dashboards: store, org } = ctx;
  const save = (patch) => store.apply(col.update('forms', f.id, patch));
  const setQ = (id, patch) => save({ questions: f.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  const sel = f.questions.find((q) => q.id === ctx.fbSel) ?? null;
  const select = (id) => { ctx.fbSel = id; ctx.render(); };
  const insertAt = (i, q) => { const qs = [...f.questions]; qs.splice(i, 0, q); ctx.fbSel = q.id; save({ questions: qs }); };
  const moveTo = (id, i) => {
    const qs = [...f.questions];
    const from = qs.findIndex((q) => q.id === id);
    if (from < 0) return;
    const [q] = qs.splice(from, 1);
    qs.splice(i > from ? i - 1 : i, 0, q);
    save({ questions: qs });
  };
  const trying = ctx.fbTry === f.id;

  // Dropping a kind from the palette, or a question by its handle.
  const dropAt = (e, i) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('text/fb-kind');
    const id = e.dataTransfer.getData('text/fb-q');
    if (kind) insertAt(i, starter(kind));
    else if (id) moveTo(id, i);
  };
  const edit = {
    text: (t, v) => {
      if (t.form) { if ((f[t.form] ?? '') !== v) save({ [t.form]: v || (t.form === 'title' ? 'Feedback' : '') }); }
      else if (t.style) save({ style: { ...(f.style ?? {}), [t.style]: v || 'Send' } });
      else if (t.q) { const q = f.questions.find((x) => x.id === t.q); if (q && (q[t.key] ?? '') !== v) setQ(t.q, { [t.key]: v }); }
    },
    block: (q, el, i) => {
      const wrap = h('div', { class: `fb-block${sel?.id === q.id ? ' on' : ''}`, 'data-id': q.id,
        onclick: () => { if (sel?.id !== q.id) select(q.id); },
        ondragover: (e) => { e.preventDefault(); const below = e.offsetY > wrap.offsetHeight / 2; wrap.classList.toggle('drop-below', below); wrap.classList.toggle('drop-above', !below); },
        ondragleave: () => wrap.classList.remove('drop-above', 'drop-below'),
        ondrop: (e) => { const below = wrap.classList.contains('drop-below'); wrap.classList.remove('drop-above', 'drop-below'); dropAt(e, i + (below ? 1 : 0)); } },
      h('div', { class: 'fb-block-tools' },
        h('span', { class: 'fb-grip', draggable: 'true', title: 'Drag to move', ondragstart: (e) => { e.dataTransfer.setData('text/fb-q', q.id); e.dataTransfer.effectAllowed = 'move'; wrap.classList.add('dragging'); }, ondragend: () => wrap.classList.remove('dragging') }, icon('dragHandle', 14)),
        h('span', { class: 'fb-kind-tag' }, QUESTION_KINDS.find((k) => k.id === q.kind)?.label ?? q.kind),
        q.kind !== 'section' && h('button', { type: 'button', class: `fb-req-btn${q.required ? ' on' : ''}`, title: 'Needs an answer', 'aria-pressed': String(!!q.required), onclick: (e) => { e.stopPropagation(); setQ(q.id, { required: !q.required }); } }, 'Required'),
        h('button', { type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: (e) => { e.stopPropagation(); insertAt(i + 1, { ...structuredClone(q), id: question(q.kind).id }); } }, icon('copy', 13)),
        h('button', { type: 'button', title: 'Remove', 'aria-label': 'Remove', onclick: (e) => { e.stopPropagation(); ctx.fbSel = null; save({ questions: f.questions.filter((x) => x.id !== q.id) }); } }, icon('trash', 13))),
      el);
      return wrap;
    },
    after: () => h('div', { class: 'fb-drop-end', ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }, ondragleave: (e) => e.currentTarget.classList.remove('over'), ondrop: (e) => { e.currentTarget.classList.remove('over'); dropAt(e, f.questions.length); } },
      icon('plus', 14), 'Drop a question here, or pick one on the left'),
  };

  const canvas = h('div', { class: 'fb-canvas' });
  applyTheme(canvas, org.theme ?? {});
  canvas.append(trying
    ? FormView(f, { onSubmit: async () => { /* a try-out sends nothing */ } })
    : FormView(f, { edit }));

  const palette = h('aside', { class: 'fb-palette', 'aria-label': 'Add a question' },
    h('h3', {}, 'Add'),
    QUESTION_KINDS.map((k) => h('button', { type: 'button', class: 'fb-kind', draggable: 'true', title: k.blurb,
      ondragstart: (e) => { e.dataTransfer.setData('text/fb-kind', k.id); e.dataTransfer.effectAllowed = 'copy'; },
      onclick: () => insertAt(sel ? f.questions.indexOf(sel) + 1 : f.questions.length, starter(k.id)) }, icon(k.icon, 15), h('span', {}, h('strong', {}, k.label), h('small', {}, k.blurb)))),
    h('p', { class: 'muted small' }, 'Click to add after the selected question, or drag into place.'));

  const field = (label, input, hint) => h('label', { class: 'fb-insp-field' }, h('span', {}, label), input, hint && h('small', { class: 'muted' }, hint));
  const inspector = h('aside', { class: 'fb-inspector' }, sel ? [
    h('div', { class: 'fb-insp-head' }, h('h3', {}, 'Question'), h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => select(null) }, 'The whole form')),
    field('Kind of answer', h('select', { class: 'select select-sm w-full', onchange: (e) => { const k = e.target.value; setQ(sel.id, { kind: k, options: ['choice', 'multi'].includes(k) && !(sel.options ?? []).length ? starter(k).options : sel.options, ...(k === 'scale' && !sel.low ? { low: 'Not at all', high: 'Very much' } : {}) }); } }, options(QUESTION_KINDS, sel.kind))),
    sel.kind !== 'section' && h('label', { class: 'fb-insp-check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: !!sel.required, onchange: (e) => setQ(sel.id, { required: e.target.checked }) }), 'Needs an answer'),
    ['choice', 'multi'].includes(sel.kind) && h('div', { class: 'fb-insp-opts' }, h('span', { class: 'fb-insp-label' }, 'Options'),
      (sel.options ?? []).map((o, k) => h('div', { class: 'fb-insp-opt' },
        h('input', { class: 'input input-xs', value: o, 'aria-label': `Option ${k + 1}`, onchange: (e) => setQ(sel.id, { options: sel.options.map((x, j) => (j === k ? e.target.value : x)).filter(Boolean) }) }),
        h('button', { type: 'button', class: 'btn btn-xs btn-ghost', disabled: k === 0, 'aria-label': 'Move up', onclick: () => { const os = [...sel.options]; [os[k - 1], os[k]] = [os[k], os[k - 1]]; setQ(sel.id, { options: os }); } }, icon('chevronUp', 12)),
        h('button', { type: 'button', class: 'btn btn-xs btn-ghost', 'aria-label': 'Remove option', onclick: () => setQ(sel.id, { options: sel.options.filter((_, j) => j !== k) }) }, icon('close', 12)))),
      h('button', { type: 'button', class: 'btn btn-xs', onclick: () => setQ(sel.id, { options: [...(sel.options ?? []), `Option ${(sel.options ?? []).length + 1}`] }) }, icon('plus', 12), 'Add an option')),
    sel.kind === 'scale' && [
      field('Words at 0', h('input', { class: 'input input-sm w-full', value: sel.low ?? '', onchange: (e) => setQ(sel.id, { low: e.target.value }) })),
      field('Words at 10', h('input', { class: 'input input-sm w-full', value: sel.high ?? '', onchange: (e) => setQ(sel.id, { high: e.target.value }) }))],
    ['text', 'long'].includes(sel.kind) && field('Placeholder', h('input', { class: 'input input-sm w-full', value: sel.placeholder ?? '', placeholder: 'e.g. A sentence or two', onchange: (e) => setQ(sel.id, { placeholder: e.target.value }) })),
    h('p', { class: 'muted small' }, 'Click the question’s words on the form to change them.'),
  ] : [
    h('div', { class: 'fb-insp-head' }, h('h3', {}, 'The form')),
    h('div', { class: 'fb-insp-label' }, 'Layout'),
    h('div', { class: 'fb-layouts', role: 'radiogroup', 'aria-label': 'Layout' }, LAYOUTS.map((l) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((f.style?.layout ?? 'card') === l.id), class: `fb-layout${(f.style?.layout ?? 'card') === l.id ? ' on' : ''}`, onclick: () => save({ style: { ...(f.style ?? {}), layout: l.id } }) },
      h('span', { class: `fb-layout-art ${l.id}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('strong', {}, l.label), h('small', {}, l.blurb)))),
    field('Thank-you message', h('input', { class: 'input input-sm w-full', value: f.thanks ?? '', onchange: (e) => save({ thanks: e.target.value }) })),
    field('Site', h('select', { class: 'select select-sm w-full', onchange: (e) => save({ siteId: e.target.value || null }) },
      h('option', { value: '' }, 'No site'), options(Object.values(org.sites).map((x) => ({ id: x.id, label: `${x.name}${x.visibility === 'private' ? ' (members only)' : ''}` })), f.siteId))),
    field('Where on the site', h('select', { class: 'select select-sm w-full', onchange: (e) => save({ place: e.target.value }) }, options(PLACES, f.place)),
      f.place === 'dashboards' ? (() => { const d = Object.values(store.doc.dashboards).filter((x) => x.siteId === f.siteId); return d.length ? `Under ${d.map((x) => x.title).join(', ')}.` : 'This site has no dashboards yet: pick the front page instead.'; })() : null),
    h('div', { class: 'fb-insp-actions' },
      f.visibility === 'public'
        ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => save({ visibility: 'private' }) }, 'Stop showing it')
        : h('button', { type: 'button', class: 'btn btn-sm btn-primary', disabled: !f.siteId, onclick: () => save({ visibility: 'public' }) }, 'Show it on the site'),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: async () => { if (await uiConfirm(`Delete “${f.title}”? Its answers stay in the feedback record.`)) { store.apply(col.remove('forms', f.id)); ctx.formId = null; ctx.render(); } } }, icon('trash', 14), 'Delete')),
    h('p', { class: 'muted small' }, 'Keep it short: three or four questions get the most answers. Answers are anonymous; the form never asks for a name or email.'),
  ]);

  return h('div', { class: `fb-designer${trying ? ' trying' : ''}` },
    h('div', { class: 'fb-designer-bar' },
      h('span', { class: 'muted small' }, trying ? 'Trying it as a visitor: nothing is sent.' : 'Click any words to change them. Drag to arrange.'),
      h('span', { class: 'spacer' }),
      h('div', { class: 'seg', role: 'tablist' },
        h('button', { role: 'tab', class: trying ? '' : 'on', 'aria-selected': String(!trying), onclick: () => { ctx.fbTry = null; ctx.render(); } }, icon('pencil', 13), 'Design'),
        h('button', { role: 'tab', class: trying ? 'on' : '', 'aria-selected': String(trying), onclick: () => { ctx.fbTry = f.id; ctx.render(); } }, icon('play', 13), 'Try it'))),
    h('div', { class: 'fb-designer-grid' }, !trying && palette, h('div', { class: 'fb-stage' }, canvas), !trying && inspector));
}
