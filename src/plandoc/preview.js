import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/**
 * Preview (alpha 0.3): the document as it will print and publish, with the
 * tools out of the way. It fills the window, one page after another, sized
 * to fit a whole page (or the width); the arrow keys step through pages.
 * From here you can download the PDF or publish what you see.
 *
 *   PlanPreview({ doc, title, status, onPrint, onPublish, publishLabel })   returns { close }
 */
const KEY = 'dashi.plandoc-preview-fit';

export function PlanPreview({ doc, title, status = '', onPrint, onPublish = null, publishLabel = 'Publish' }) {
  const before = document.activeElement;
  let fit = 'page';
  try { fit = localStorage.getItem(KEY) === 'width' ? 'width' : 'page'; } catch { /* private window */ }
  const pages = [...doc.querySelectorAll('.pd-page')];
  const stage = h('div', { class: 'pv-stage', tabindex: '-1' }, h('div', { class: 'pv-sheet' }, doc));
  const counter = h('span', { class: 'pv-count', 'aria-live': 'polite' });
  const fitBtn = (id, label, ic) => h('button', { type: 'button', class: `pv-btn${fit === id ? ' on' : ''}`, 'data-fit': id, 'aria-pressed': String(fit === id), onclick: () => { fit = id; try { localStorage.setItem(KEY, id); } catch { /* fine */ } size(); bar.querySelectorAll('[data-fit]').forEach((b) => { b.classList.toggle('on', b.dataset.fit === fit); b.setAttribute('aria-pressed', String(b.dataset.fit === fit)); }); } }, icon(ic, 15), label);
  const step = (k) => {
    const i = Math.max(0, Math.min(pages.length - 1, current() + k));
    pages[i]?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const bar = h('header', { class: 'pv-bar' },
    h('div', { class: 'pv-title' }, h('strong', {}, title), status && h('small', {}, status)),
    h('div', { class: 'pv-nav', role: 'group', 'aria-label': 'Pages' },
      h('button', { type: 'button', class: 'pv-btn sq', 'aria-label': 'Previous page', title: 'Previous page (←)', onclick: () => step(-1) }, icon('chevronUp', 16)),
      counter,
      h('button', { type: 'button', class: 'pv-btn sq', 'aria-label': 'Next page', title: 'Next page (→)', onclick: () => step(1) }, icon('chevronDown', 16))),
    h('div', { class: 'pv-fit', role: 'group', 'aria-label': 'Size' }, fitBtn('page', 'Whole page', 'fit'), fitBtn('width', 'Width', 'arrowsIn')),
    h('div', { class: 'pv-actions' },
      h('button', { type: 'button', class: 'pv-btn', onclick: () => onPrint?.() }, icon('download', 15), 'Download PDF'),
      onPublish && h('button', { type: 'button', class: 'pv-btn primary', onclick: () => { close(); onPublish(); } }, icon('globe', 15), publishLabel),
      h('button', { type: 'button', class: 'pv-btn', title: 'Back to the designer (Esc)', onclick: () => close() }, icon('close', 15), 'Back to editing')));
  const root = h('div', { class: 'pv-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Preview of ${title}` }, bar, stage);

  function size() {
    const W = stage.clientWidth - 64, H = stage.clientHeight - 48;
    const z = fit === 'width' ? Math.min(2.2, W / 816) : Math.min(W / 816, H / 1056);
    doc.style.zoom = String(Math.max(0.25, z));
    count();
  }
  const current = () => {
    const top = stage.getBoundingClientRect().top + 40;
    let i = 0;
    pages.forEach((p, k) => { if (p.getBoundingClientRect().top <= top) i = k; });
    return i;
  };
  const count = () => { counter.textContent = `Page ${current() + 1} of ${pages.length}`; };
  const keys = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key) && !e.target.closest?.('input, textarea')) { e.preventDefault(); step(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) && !e.target.closest?.('input, textarea')) { e.preventDefault(); step(-1); }
  };
  function close() {
    root.classList.add('leaving');
    removeEventListener('keydown', keys, true);
    removeEventListener('resize', size);
    document.documentElement.classList.remove('pv-open');
    setTimeout(() => { root.remove(); before?.focus?.(); }, 140);
  }
  stage.addEventListener('scroll', count, { passive: true });
  addEventListener('keydown', keys, true);
  addEventListener('resize', size);
  document.documentElement.classList.add('pv-open');
  document.body.append(root);
  size();
  stage.focus({ preventScroll: true });
  return { close };
}
