import { h } from '../../ui/dom.js';
import { normaliseSlide, inkFor, sanitiseInline, escapeHtml, CARD_KINDS } from './format.js';

/**
 * A slide as a phone card (slideshow podcasts). One renderer for the
 * studio's stage, its filmstrip and timeline thumbnails, the player and
 * Learn: the card is laid out at a fixed size (CARD_W × CARD_H, 9:16) and
 * scaled to fit wherever it sits, so a slide looks the same everywhere.
 *
 *   Face(slide, { n, total, edit })     the card element
 *   Fitted(card, { width })             the card in a box scaled to `width` px (or to its box, live)
 *   shrinkToFit(card)                   steps the type down until the words fit the card
 *
 * edit (studio only) = {
 *   onTitle(text), onSubtitle(text), onBlock(blockId, patch), onFocusBlock(blockId), onPickImage(blockId)
 * }  makes the words editable in place; changes are reported on blur.
 */
export const CARD_W = 405;
export const CARD_H = 720;

const editable = (el, on, { rich = false } = {}) => {
  if (!on) return el;
  el.contentEditable = rich ? 'true' : 'plaintext-only';
  // Firefox before 136 doesn't know plaintext-only.
  if (el.contentEditable !== 'plaintext-only' && !rich) el.contentEditable = 'true';
  el.spellcheck = true;
  el.classList.add('sf-edit');
  return el;
};
const html = (el, s) => { el.innerHTML = s; return el; };

function Block(b, edit) {
  if (b.type === 'text') {
    const el = html(h('div', { class: 'sf-text', 'data-block': b.id }), b.html || (edit ? '' : ''));
    if (edit) {
      editable(el, true, { rich: true });
      el.dataset.placeholder = 'Type here…';
      el.addEventListener('focus', () => edit.onFocusBlock?.(b.id));
      el.addEventListener('blur', () => { const v = sanitiseInline(el.innerHTML); if (v !== b.html) edit.onBlock?.(b.id, { html: v }); });
    }
    return el;
  }
  if (b.type === 'bullets') {
    const el = h(b.ordered ? 'ol' : 'ul', { class: 'sf-list', 'data-block': b.id }, (b.items.length ? b.items : ['']).map((x) => html(h('li'), x)));
    if (edit) {
      editable(el, true, { rich: true });
      el.addEventListener('focus', () => edit.onFocusBlock?.(b.id));
      el.addEventListener('blur', () => {
        const items = [...el.querySelectorAll('li')].map((li) => sanitiseInline(li.innerHTML)).filter((x) => x !== '');
        // Words typed outside a bullet (the list emptied, then typed into) become one.
        if (!items.length && el.textContent.trim()) items.push(escapeHtml(el.textContent.trim()));
        if (JSON.stringify(items) !== JSON.stringify(b.items)) edit.onBlock?.(b.id, { items });
      });
    }
    return el;
  }
  if (b.type === 'image') {
    const pic = b.src
      ? h('img', { src: b.src, alt: b.alt || '', loading: 'lazy', draggable: 'false' })
      : h('span', { class: 'sf-img-empty' }, edit ? 'Choose a picture' : '');
    const cap = b.caption || edit ? editable(h('figcaption', {}, b.caption), !!edit) : null;
    const fig = h('figure', { class: 'sf-img', 'data-block': b.id }, pic, cap);
    if (edit) {
      pic.addEventListener('click', () => { edit.onFocusBlock?.(b.id); edit.onPickImage?.(b.id); });
      if (cap) {
        cap.dataset.placeholder = 'Caption';
        cap.addEventListener('focus', () => edit.onFocusBlock?.(b.id));
        cap.addEventListener('blur', () => { const v = cap.textContent.trim(); if (v !== b.caption) edit.onBlock?.(b.id, { caption: v }); });
      }
    }
    return fig;
  }
  if (b.type === 'card') {
    const c = b.card;
    const field = (cls, key, ph) => {
      const el = editable(h('span', { class: cls }, c[key]), !!edit);
      if (edit) {
        el.dataset.placeholder = ph;
        el.addEventListener('focus', () => edit.onFocusBlock?.(b.id));
        el.addEventListener('blur', () => { const v = el.textContent.trim(); if (v !== c[key]) edit.onBlock?.(b.id, { card: { [key]: v } }); });
      }
      return el;
    };
    const pct = Math.max(0, Math.min(100, parseFloat(String(c.value).replace(/[^\d.]/g, '')) || 0));
    return h('div', { class: `sf-card k-${c.kind}`, 'data-block': b.id, title: edit ? CARD_KINDS.find((k) => k.id === c.kind)?.label : null },
      c.kind === 'quote'
        ? [field('sf-card-value', 'value', 'What they said'), field('sf-card-label', 'label', 'Who said it')]
        : [field('sf-card-value', 'value', c.kind === 'progress' ? '60%' : '120'), field('sf-card-label', 'label', 'What it counts'),
          c.kind === 'progress' && h('span', { class: 'sf-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct}%` }))],
      (c.note || edit) && field('sf-card-note', 'note', 'A note (optional)'));
  }
  return null;
}

/** The card for one slide. */
export function Face(slide, { n = 0, total = 0, edit = null } = {}) {
  const s = normaliseSlide(slide);
  const ink = inkFor(s);
  const pic = s.bg.image;
  const card = h('div', { class: `sf k-${s.kind}${pic ? (s.banner ? ' has-banner' : ' has-bg') : ''}`, style: `--tone:${s.tone};--ink:${ink};--card:${s.bg.colour};--shade:${s.bg.overlay}`, 'data-slide': s.id });
  if (pic && !s.banner) card.append(h('div', { class: 'sf-bg', style: `background-image:url("${encodeURI(pic).replace(/"/g, '%22')}")` }), h('div', { class: 'sf-shade' }));
  if (pic && s.banner) card.append(h('div', { class: 'sf-banner', style: `background-image:url("${encodeURI(pic).replace(/"/g, '%22')}")` }));
  const title = editable(h('h2', { class: 'sf-title' }, s.title), !!edit);
  const sub = s.subtitle || edit ? editable(h('p', { class: 'sf-sub' }, s.subtitle), !!edit) : null;
  if (edit) {
    title.dataset.placeholder = 'Title';
    title.addEventListener('focus', () => edit.onFocusBlock?.(null));
    title.addEventListener('blur', () => { const v = title.textContent.trim(); if (v !== s.title) edit.onTitle?.(v); });
    if (sub) {
      sub.dataset.placeholder = 'Subtitle';
      sub.addEventListener('focus', () => edit.onFocusBlock?.(null));
      sub.addEventListener('blur', () => { const v = sub.textContent.trim(); if (v !== s.subtitle) edit.onSubtitle?.(v); });
    }
    // Enter in a title moves on, it doesn't make a new line.
    for (const el of [title, sub].filter(Boolean)) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  card.append(h('div', { class: 'sf-inner' },
    total > 0 && h('small', { class: 'sf-count' }, `${n}/${total}`),
    h('div', { class: 'sf-head' }, title, sub),
    h('div', { class: 'sf-blocks' }, s.blocks.map((b) => Block(b, edit)))));
  return card;
}

/** Step the type down (to 60%) until the card's words fit inside it. */
export function shrinkToFit(card) {
  const inner = card.querySelector('.sf-inner');
  if (!inner) return;
  let k = 1;
  card.style.setProperty('--fit', '1');
  while (inner.scrollHeight > inner.clientHeight + 1 && k > 0.6) {
    k = Math.round((k - 0.05) * 100) / 100;
    card.style.setProperty('--fit', String(k));
  }
  card.classList.toggle('sf-over', inner.scrollHeight > inner.clientHeight + 1);
}

/**
 * The card in a box: a fixed width, or (no width) filling its box and
 * rescaling when the box changes size.
 */
export function Fitted(card, { width = null, height = null, fit = true } = {}) {
  const box = h('div', { class: 'sf-fit' }, card);
  const scale = (k) => { box.style.setProperty('--k', String(k)); box.style.width = `${CARD_W * k}px`; box.style.height = `${CARD_H * k}px`; };
  if (width || height) scale(Math.min(width ? width / CARD_W : Infinity, height ? height / CARD_H : Infinity));
  else {
    box.classList.add('fill');
    const ro = new ResizeObserver(() => {
      const host = box.parentElement;
      if (!host) return;
      const k = Math.min(host.clientWidth / CARD_W, host.clientHeight / CARD_H);
      if (k > 0) scale(k);
    });
    queueMicrotask(() => box.parentElement && ro.observe(box.parentElement));
  }
  if (fit) requestAnimationFrame(() => card.isConnected && shrinkToFit(card));
  return box;
}
