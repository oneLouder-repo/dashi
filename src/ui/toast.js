import { h } from './dom.js';
import { icon } from './icons.js';

/** Show a short note in the bottom-left corner. A failure stays longer, and a "Saved" never covers it. */
let toastTimer;
export function toast(text, kind = 'ok') {
  let box = document.querySelector('.save-toast');
  if (box?.dataset.kind === 'error' && kind === 'ok') return;
  if (!box) {
    box = h('div', { class: 'toast toast-start toast-bottom save-toast', role: kind === 'error' ? 'alert' : 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.dataset.kind = kind;
  box.replaceChildren(h('div', { class: `alert alert-soft ${kind === 'error' ? 'alert-error' : 'alert-success'}` },
    icon(kind === 'error' ? 'close' : 'check', 16), h('span', {}, text)));
  box.classList.remove('leaving');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.classList.add('leaving'); setTimeout(() => box.remove(), 250); }, kind === 'error' ? 7000 : 1600);
}
