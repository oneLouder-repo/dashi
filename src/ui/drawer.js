import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * A side drawer: a panel that slides in from the right over the page, for
 * editing one thing (a person, a team, an organisation's own limits) without
 * losing your place in the list behind it. Esc, the backdrop or × closes it.
 *
 *   const d = Drawer({ title, sub, lead, body, actions, onClose });
 *   d.close();            // close it from code (after saving, say)
 *   d.setBody(el);        // redraw its contents in place, keeping the scroll
 *
 * `lead` is an element shown beside the title (an avatar, a colour swatch).
 * `actions` are buttons for the sticky footer.
 */
export function Drawer({ title, sub = null, lead = null, body, actions = [], onClose = null, wide = false }) {
  const before = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dlg.classList.add('leaving');
    setTimeout(() => { dlg.close(); dlg.remove(); before?.focus?.(); onClose?.(); }, 160);
  };
  const content = h('div', { class: 'drawer-body' }, body);
  const foot = h('footer', { class: 'drawer-foot' }, actions);
  const titleEl = h('h2', { class: 'drawer-title' }, title);
  const subEl = h('p', { class: 'drawer-sub' }, sub ?? '');
  subEl.hidden = !sub;
  const dlg = h('dialog', { class: `drawer-panel${wide === 'xl' ? ' wide xl' : wide ? ' wide' : ''}`, 'aria-label': typeof title === 'string' ? title : 'Details' },
    h('header', { class: 'drawer-head' },
      lead && h('span', { class: 'drawer-lead' }, lead),
      h('div', { class: 'drawer-titles' }, titleEl, subEl),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-square', 'aria-label': 'Close', onclick: close }, icon('close', 16))),
    content,
    foot);
  foot.hidden = !actions.length;
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  (dlg.querySelector('.drawer-body input, .drawer-body select, .drawer-body textarea') ?? dlg.querySelector('.drawer-head button'))?.focus({ preventScroll: true });
  return {
    el: dlg,
    close,
    setBody(el) { const top = content.scrollTop; content.replaceChildren(el); content.scrollTop = top; },
    setTitle(t, s = null) { titleEl.textContent = t; subEl.textContent = s ?? ''; subEl.hidden = !s; },
    setActions(list) { foot.replaceChildren(...list); foot.hidden = !list.length; },
  };
}
