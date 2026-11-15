import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * Dashi's own dialogs, in the page's theme, in place of the browser's
 * alert(), confirm() and prompt(). Each returns a promise:
 *
 *   await uiAlert('That file is no longer stored.')
 *   if (!(await uiConfirm('Delete “Plan”?', { danger: true }))) return;
 *   const name = await uiPrompt('Name of the new map', 'Untitled map');   // null if cancelled
 *   const values = await uiForm({ title, fields: [{ name, label, type, value, options, required, help }] });
 *
 * Esc or the backdrop cancels; Enter confirms. Focus goes into the dialog
 * and comes back to where it was afterwards.
 */
let open = 0;

function modal({ title, message, kind = 'info', body = [], ok = 'OK', cancel = 'Cancel', danger = false, wide = false, onOk }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dlg.classList.add('leaving');
      setTimeout(() => { dlg.close(); dlg.remove(); open -= 1; before?.focus?.(); }, 120);
      resolve(value);
    };
    const okBtn = h('button', { type: 'submit', class: `btn btn-sm ${danger ? 'btn-error' : 'btn-primary'}` }, ok);
    const glyph = { info: 'info', confirm: 'question', danger: 'warn', prompt: 'pencil', form: 'pencil', error: 'warn' }[danger ? 'danger' : kind];
    const error = h('p', { class: 'dui-error', role: 'alert', hidden: true });
    const form = h('form', { method: 'dialog', class: 'dui-form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      try {
        const value = onOk ? await onOk() : true;
        if (value === undefined) return; // onOk said "not yet".
        finish(value);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    } },
      h('div', { class: 'dui-head' },
        h('span', { class: `dui-glyph ${danger ? 'danger' : kind}` }, icon(glyph, 20)),
        h('div', { class: 'dui-titles' },
          title && h('h2', { class: 'dui-title' }, title),
          message && h('p', { class: 'dui-message' }, message)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-square dui-x', 'aria-label': 'Close', onclick: () => finish(kind === 'info' || kind === 'error' ? true : null) }, icon('close', 16))),
      body.length ? h('div', { class: 'dui-body' }, body) : null,
      error,
      h('div', { class: 'dui-actions' },
        cancel && h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => finish(kind === 'confirm' ? false : null) }, cancel),
        okBtn));
    const dlg = h('dialog', { class: `dui${wide ? ' wide' : ''}`, 'aria-labelledby': 'x' }, form);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(kind === 'confirm' ? false : kind === 'info' || kind === 'error' ? true : null); });
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) finish(kind === 'confirm' ? false : kind === 'info' || kind === 'error' ? true : null); });
    document.body.append(dlg);
    open += 1;
    dlg.showModal();
    const first = dlg.querySelector('.dui-body input, .dui-body textarea, .dui-body select');
    (first ?? okBtn).focus();
    if (first?.select && first.type !== 'checkbox') first.select();
  });
}

/** A message with one button. */
export function uiAlert(message, { title = null, ok = 'OK', kind = 'info' } = {}) {
  const [t, m] = title ? [title, message] : splitMessage(message);
  return modal({ title: t, message: m, kind, ok, cancel: null });
}

/** A question: true for yes, false for no. `danger` turns the button red. */
export function uiConfirm(message, { title = null, ok = null, cancel = 'Cancel', danger = null } = {}) {
  const [t, m] = title ? [title, message] : splitMessage(message);
  const risky = danger ?? /\b(delete|remove|replace|throw away|stop using|lost|can’t be undone|can't be undone|for good)\b/i.test(message);
  return modal({ title: t, message: m, kind: 'confirm', danger: risky, ok: ok ?? (risky ? (/remove/i.test(message) ? 'Remove' : /delete/i.test(message) ? 'Delete' : 'Yes, go ahead') : 'OK'), cancel });
}

/** One line of text: the text, or null if cancelled. */
export function uiPrompt(label, value = '', { title = null, ok = 'OK', placeholder = '', type = 'text', required = true, help = null, multiline = false } = {}) {
  const input = multiline
    ? h('textarea', { class: 'textarea w-full', rows: 3, placeholder, required })
    : h('input', { class: 'input w-full', type, placeholder, required, autocomplete: 'off' });
  input.value = value ?? '';
  const id = `dui-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return modal({
    title: title ?? label, message: title ? null : null, kind: 'prompt', ok,
    body: [h('label', { class: 'dui-field', for: id }, title ? h('span', { class: 'dui-label' }, label) : null, input, help && h('small', { class: 'muted' }, help))],
    onOk: () => input.value,
  });
}

/**
 * A small form. fields: [{ name, label, type: 'text'|'email'|'url'|'textarea'|'select'|'checkbox'|'color'|'number',
 * value, placeholder, options: [{ id, label }], required, help }]. Resolves to { name: value } or null.
 * `validate(values)` can throw to keep the dialog open with a message.
 */
export function uiForm({ title, message = null, fields, ok = 'Save', cancel = 'Cancel', wide = false, validate = null }) {
  const inputs = {};
  const body = fields.map((f) => {
    const id = `dui-${f.name}-${Math.random().toString(36).slice(2, 6)}`;
    let el;
    if (f.type === 'textarea') el = h('textarea', { class: 'textarea w-full', rows: f.rows ?? 3, placeholder: f.placeholder ?? '', required: !!f.required });
    else if (f.type === 'select') el = h('select', { class: 'select w-full' }, (f.options ?? []).map((o) => h('option', { value: o.id, selected: o.id === f.value }, o.label)));
    else if (f.type === 'checkbox') el = h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', checked: !!f.value });
    else el = h('input', { class: f.type === 'color' ? 'dui-color' : 'input w-full', type: f.type ?? 'text', placeholder: f.placeholder ?? '', required: !!f.required, autocomplete: 'off', pattern: f.pattern ?? null });
    if (f.type !== 'checkbox' && f.type !== 'select') el.value = f.value ?? '';
    if (f.readonly) { el.readOnly = true; el.classList.add('dui-readonly'); }
    if (f.autocomplete) el.autocomplete = f.autocomplete;
    el.id = id;
    inputs[f.name] = el;
    return f.type === 'checkbox'
      ? h('label', { class: `dui-field dui-check${f.half ? ' half' : ''}`, for: id }, el, h('span', {}, f.label), f.help && h('small', { class: 'muted' }, f.help))
      : h('label', { class: `dui-field${f.half ? ' half' : ''}`, for: id }, h('span', { class: 'dui-label' }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), el, f.help && h('small', { class: 'muted' }, f.help));
  });
  return modal({ title, message, kind: 'form', ok, cancel, wide, body, onOk: async () => {
    const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value]));
    if (validate) await validate(values);
    return values;
  } });
}

/** Custom content: build(close) returns the body; close(value) resolves. */
export function uiPanel({ title, message = null, build, ok = 'Done', cancel = null, wide = true }) {
  let result = true;
  return modal({ title, message, kind: 'form', ok, cancel, wide, body: [build((v) => { result = v; })], onOk: () => result ?? undefined });
}

/** Is one of these dialogs showing? (Keyboard shortcuts on the board stand aside.) */
export const dialogOpen = () => open > 0;

// A long sentence reads better as a title plus detail: split at the first sentence end.
function splitMessage(message) {
  const text = String(message ?? '');
  const m = /^(.{8,90}?[?.!])\s+(.+)$/s.exec(text);
  return m ? [m[1], m[2]] : [text, null];
}
