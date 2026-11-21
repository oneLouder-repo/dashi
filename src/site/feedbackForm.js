import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { missingRequired } from '../platform/feedback.js';

/**
 * A feedback form as visitors see it. The public site renders it to be
 * answered; the form designer renders the very same thing to be edited in
 * place (WYSIWYG), passing `edit` hooks:
 *
 *   FormView(form, {
 *     onSubmit(answers) → Promise    send the answers (visitors)
 *     edit: {                        designer only
 *       selected, select(id), text(target, value), block(q, el) → el,
 *     },
 *   })
 * Layouts: 'card' (a card on the page), 'plain' (sits in the page),
 * 'steps' (one question at a time, with a progress bar).
 */
export function FormView(form, { onSubmit = null, edit = null } = {}) {
  const answers = {};
  const layout = form.style?.layout ?? 'card';
  const box = h('section', { class: `feedback-card fb-layout-${layout}${edit ? ' fb-editing' : ''}`, 'data-form': form.id });
  const editable = (tag, cls, target, value, placeholder) => (edit
    ? h(tag, { class: `${cls} fb-inline`, contenteditable: 'true', spellcheck: 'true', 'data-placeholder': placeholder, onclick: (e) => e.stopPropagation(),
      onblur: (e) => edit.text(target, e.target.textContent.trim()), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, value ?? '')
    : value ? h(tag, { class: cls }, value) : null);

  const field = (q) => {
    const set = (v) => { answers[q.id] = v; box.querySelector(`[data-q="${q.id}"]`)?.classList.remove('fb-missing'); };
    if (q.kind === 'section') return null;
    if (q.kind === 'rating') {
      const stars = [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: 'fb-star', 'aria-label': `${n} of 5`, onclick: () => { set(n); stars.forEach((s, i) => s.classList.toggle('on', i < n)); } }, '★'));
      return h('div', { class: 'fb-stars', role: 'group', 'aria-label': q.text }, stars);
    }
    if (q.kind === 'scale') {
      const nums = Array.from({ length: 11 }, (_, n) => h('button', { type: 'button', class: 'fb-num', 'aria-label': `${n} of 10`, onclick: () => { set(n); nums.forEach((b, i) => b.classList.toggle('on', i === n)); } }, String(n)));
      return h('div', { class: 'fb-scale' }, h('div', { class: 'fb-nums', role: 'group', 'aria-label': q.text }, nums),
        h('div', { class: 'fb-scale-ends' }, h('small', {}, q.low || 'Not at all'), h('small', {}, q.high || 'Very much')));
    }
    if (q.kind === 'yesno' || q.kind === 'choice') {
      const opts = q.kind === 'yesno' ? [['yes', 'Yes'], ['no', 'No']] : (q.options ?? []).map((o) => [o, o]);
      const btns = opts.map(([v, label]) => h('button', { type: 'button', class: 'fb-pill', onclick: (e) => { set(v); btns.forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, label));
      return h('div', { class: 'fb-pills', role: 'group', 'aria-label': q.text }, btns);
    }
    if (q.kind === 'multi') {
      const chosen = new Set();
      const btns = (q.options ?? []).map((o) => h('button', { type: 'button', class: 'fb-pill fb-check', 'aria-pressed': 'false', onclick: (e) => {
        chosen.has(o) ? chosen.delete(o) : chosen.add(o);
        e.currentTarget.classList.toggle('on', chosen.has(o));
        e.currentTarget.setAttribute('aria-pressed', String(chosen.has(o)));
        set([...chosen]);
      } }, h('span', { class: 'fb-tick', 'aria-hidden': 'true' }), o));
      return h('div', { class: 'fb-pills', role: 'group', 'aria-label': q.text }, btns);
    }
    return h('textarea', { class: 'textarea fb-text', rows: q.kind === 'long' ? 4 : 2, 'aria-label': q.text, maxlength: 1000, placeholder: q.placeholder ?? '', oninput: (e) => set(e.target.value) });
  };

  const Q = (q, i) => {
    const el = q.kind === 'section'
      ? h('div', { class: 'fb-q fb-section', 'data-q': q.id },
        editable('h3', 'fb-section-title', { q: q.id, key: 'text' }, q.text, 'A heading'),
        editable('p', 'fb-help', { q: q.id, key: 'help' }, q.help, 'A line of explanation (optional)'))
      : h('div', { class: 'fb-q', 'data-q': q.id },
        h('span', { class: 'fb-label' },
          editable('span', 'fb-label-text', { q: q.id, key: 'text' }, q.text, 'Ask something short'),
          q.required && h('span', { class: 'fb-req', title: 'Needs an answer' }, ' *')),
        (q.help || edit) && editable('small', 'fb-help', { q: q.id, key: 'help' }, q.help, 'Add a hint (optional)'),
        field(q));
    if (layout === 'steps' && !edit) el.hidden = i !== 0;
    return edit ? edit.block(q, el, i) : el;
  };

  const qs = form.questions ?? [];
  const answerable = qs.filter((q) => q.kind !== 'section');
  let step = 0;
  const progress = h('div', { class: 'fb-progress', 'aria-hidden': 'true' }, h('i'));
  const next = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Next');
  const back = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', hidden: true }, 'Back');
  const submit = h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, form.style?.button || 'Send');
  const showStep = () => {
    const blocks = [...box.querySelectorAll('.fb-q')];
    blocks.forEach((b, i) => { b.hidden = i !== step; });
    back.hidden = step === 0;
    next.hidden = step >= blocks.length - 1;
    submit.hidden = step < blocks.length - 1;
    progress.firstChild.style.width = `${((step + 1) / blocks.length) * 100}%`;
  };
  next.addEventListener('click', () => {
    const q = qs[step];
    if (q?.required && q.kind !== 'section' && (answers[q.id] == null || answers[q.id] === '' || (Array.isArray(answers[q.id]) && !answers[q.id].length))) { box.querySelector(`[data-q="${q.id}"]`)?.classList.add('fb-missing'); return; }
    step++; showStep();
  });
  back.addEventListener('click', () => { step--; showStep(); });

  const done = () => box.replaceChildren(h('div', { class: 'feedback-thanks' }, icon('check', 22), h('p', {}, form.thanks || 'Thank you.')));
  const send = async (e) => {
    e.preventDefault();
    if (edit || !onSubmit) return;
    const missing = missingRequired(form, answers);
    box.querySelectorAll('.fb-missing').forEach((x) => x.classList.remove('fb-missing'));
    if (missing.length) { for (const id of missing) box.querySelector(`[data-q="${id}"]`)?.classList.add('fb-missing'); box.querySelector('.fb-missing')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    try { await onSubmit(answers); done(); }
    catch (err) { box.querySelector('.fb-error')?.remove(); box.append(h('p', { class: 'fb-error' }, `Sorry, that didn’t send: ${err.message}`)); }
  };

  box.append(h('form', { onsubmit: send, novalidate: true },
    h('div', { class: 'feedback-head' }, h('span', { class: 'feedback-icon' }, icon('chats', 20)),
      h('div', {}, editable('h2', 'fb-title', { form: 'title' }, form.title, 'Name the form'), editable('p', 'fb-intro', { form: 'intro' }, form.intro, 'A line to invite people in'))),
    layout === 'steps' && !edit && answerable.length > 1 && progress,
    h('div', { class: 'feedback-qs' }, qs.map(Q)),
    edit?.after?.(),
    h('input', { type: 'text', name: 'website', class: 'sr-only', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' }),
    h('div', { class: 'feedback-foot' },
      layout === 'steps' && !edit && back, layout === 'steps' && !edit && next,
      edit ? h('span', { class: 'btn btn-primary btn-sm fb-inline-btn', contenteditable: 'true', onblur: (e) => edit.text({ style: 'button' }, e.target.textContent.trim()), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, form.style?.button || 'Send') : submit,
      h('small', {}, 'Anonymous. We don’t ask for your name or email.'))));
  if (layout === 'steps' && !edit) showStep();
  return box;
}
