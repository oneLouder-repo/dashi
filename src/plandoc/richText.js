import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { uiPrompt } from '../ui/dialog.js';

/**
 * Formatted words in a plan document: a small, safe subset of HTML, and the
 * floating toolbar that edits it.
 *
 *   cleanHtml(html)          keep only the tags and styles below; everything else becomes text
 *   isPlain(html)            true when there is no formatting worth keeping
 *   RichToolbar({ colours }) one toolbar per page; it follows whichever words have focus
 */
const TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'H3', 'H4', 'SPAN', 'FONT', 'MARK', 'BLOCKQUOTE', 'SMALL']);
const STYLE_OK = /^(color|background-color|text-align|font-size)$/;
const VALUE_OK = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|left|right|center|justify|[\d.]+(px|em|rem|%)|small|large|x-large|smaller|larger|transparent)$/i;

export function cleanHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out = document.createElement('div');
  const walk = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { to.append(n.textContent); continue; }
      if (n.nodeType !== 1) continue;
      if (!TAGS.has(n.tagName)) { walk(n, to); continue; }
      // <font color> (what execCommand makes) becomes a span with a colour.
      const tag = n.tagName === 'FONT' ? 'span' : n.tagName === 'DIV' ? 'p' : n.tagName.toLowerCase();
      const el = document.createElement(tag);
      if (n.tagName === 'FONT' && n.getAttribute('color')) el.style.color = n.getAttribute('color');
      if (tag === 'a') {
        const href = n.getAttribute('href') ?? '';
        if (/^(https?:|mailto:|tel:|#)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('rel', 'noopener'); el.setAttribute('target', '_blank'); }
      }
      for (const prop of [...(n.style ?? [])]) {
        const v = n.style.getPropertyValue(prop).trim();
        if (STYLE_OK.test(prop) && VALUE_OK.test(v)) el.style.setProperty(prop, v);
      }
      walk(n, el);
      to.append(el);
    }
  };
  walk(doc.body.firstChild, out);
  return out.innerHTML.replace(/(<p><\/p>)+$/g, '');
}

/** No tags but line breaks: the words can be kept as plain text. */
export const isPlain = (html) => !/<(?!br\b|\/?p\b|\/?div\b)[a-z]/i.test(html) && !/style=/i.test(html);

/** The text of formatted words, with line breaks for blocks. */
export function textOfHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h3|h4)>/gi, '\n');
  return d.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A floating toolbar over the words being edited. It acts on the browser's
 * own selection (execCommand), so undo with Ctrl+Z works as usual.
 */
export function RichToolbar({ colours = [] } = {}) {
  let target = null;
  const cmd = (name, value = null) => (e) => {
    e.preventDefault();
    if (!target) return;
    target.focus();
    document.execCommand('styleWithCSS', false, name === 'foreColor' || name === 'hiliteColor');
    document.execCommand(name, false, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    sync();
  };
  const btn = (ic, label, onDown, key = null) => h('button', { type: 'button', class: 'rt-btn', title: key ? `${label} (${key})` : label, 'aria-label': label, 'data-cmd': label, onmousedown: onDown }, typeof ic === 'string' && ic.length <= 2 ? h('b', {}, ic) : icon(ic, 15));
  const swatches = [...colours, '#1c2230', '#5b6474', '#ffffff'];
  const colourMenu = h('div', { class: 'rt-pop', hidden: true },
    h('span', { class: 'rt-pop-label' }, 'Text colour'),
    h('div', { class: 'rt-swatches' }, swatches.map((c) => h('button', { type: 'button', class: 'rt-swatch', style: `background:${c}`, title: c, onmousedown: (e) => { cmd('foreColor', c)(e); colourMenu.hidden = true; } }))),
    h('span', { class: 'rt-pop-label' }, 'Highlight'),
    h('div', { class: 'rt-swatches' }, [...colours.map((c) => `${c}33`), '#fff3a3', 'transparent'].map((c) => h('button', { type: 'button', class: `rt-swatch${c === 'transparent' ? ' none' : ''}`, style: `background:${c}`, title: c === 'transparent' ? 'No highlight' : c, onmousedown: (e) => { cmd('hiliteColor', c)(e); colourMenu.hidden = true; } }))),
    h('label', { class: 'rt-custom' }, 'Any colour', h('input', { type: 'color', value: colours[0] ?? '#1d4ed8', onmousedown: (e) => e.stopPropagation(), onchange: (e) => { target?.focus(); document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, e.target.value); target?.dispatchEvent(new Event('input', { bubbles: true })); colourMenu.hidden = true; } })));
  const sizeMenu = h('div', { class: 'rt-pop', hidden: true },
    [['Small', '0.85em'], ['Normal', '1em'], ['Large', '1.25em'], ['Huge', '1.6em']].map(([label, size]) => h('button', { type: 'button', class: 'rt-menu-item', onmousedown: (e) => { e.preventDefault(); wrapSize(size); sizeMenu.hidden = true; } }, h('span', { style: `font-size:${size}` }, label))));
  function wrapSize(size) {
    const sel = getSelection();
    if (!target || !sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!target.contains(range.commonAncestorContainer)) return;
    const span = document.createElement('span');
    span.style.fontSize = size;
    span.append(range.extractContents());
    range.insertNode(span);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const link = async (e) => {
    e.preventDefault();
    const sel = getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const keep = target;
    const existing = sel.anchorNode?.parentElement?.closest('a');
    const url = await uiPrompt('Link to', existing?.getAttribute('href') ?? 'https://', { title: 'Add a link', required: false, help: 'A web address, mailto: or tel:. Leave it empty to remove the link.' });
    if (!keep) return;
    keep.focus();
    if (range) { sel.removeAllRanges(); sel.addRange(range); }
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') document.execCommand('unlink');
    else if (/^(https?:|mailto:|tel:)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
    keep.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const multi = [
    h('span', { class: 'rt-sep' }),
    btn('H', 'Heading', cmd('formatBlock', 'h3')),
    btn('¶', 'Paragraph', cmd('formatBlock', 'p')),
    btn('listBullets', 'Bulleted list', cmd('insertUnorderedList')),
    btn('listNumbers', 'Numbered list', cmd('insertOrderedList')),
    btn('quotes', 'Quote', cmd('formatBlock', 'blockquote')),
  ];
  const bar = h('div', { class: 'rt-bar', role: 'toolbar', 'aria-label': 'Text formatting', hidden: true },
    btn('B', 'Bold', cmd('bold'), 'Ctrl+B'),
    btn('I', 'Italic', cmd('italic'), 'Ctrl+I'),
    btn('U', 'Underline', cmd('underline'), 'Ctrl+U'),
    btn('S', 'Strike through', cmd('strikeThrough')),
    h('span', { class: 'rt-wrap' }, btn('palette', 'Colour', (e) => { e.preventDefault(); sizeMenu.hidden = true; colourMenu.hidden = !colourMenu.hidden; }), colourMenu),
    h('span', { class: 'rt-wrap' }, btn('textAa', 'Text size', (e) => { e.preventDefault(); colourMenu.hidden = true; sizeMenu.hidden = !sizeMenu.hidden; }), sizeMenu),
    btn('link', 'Link', link),
    ...multi,
    h('span', { class: 'rt-sep' }),
    btn('alignLeft', 'Align left', cmd('justifyLeft')),
    btn('alignCenter', 'Centre', cmd('justifyCenter')),
    btn('alignRight', 'Align right', cmd('justifyRight')),
    h('span', { class: 'rt-sep' }),
    btn('eraser', 'Clear formatting', (e) => { cmd('removeFormat')(e); cmd('unlink')(e); }));
  bar.addEventListener('mousedown', (e) => { if (e.target === bar) e.preventDefault(); });

  function place() {
    if (!target) return;
    const box = target.getBoundingClientRect();
    const w = bar.offsetWidth || 420;
    const top = box.top - 46 < 70 ? box.bottom + 8 : box.top - 46;
    bar.style.top = `${Math.max(8, top)}px`;
    bar.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - w - 8))}px`;
  }
  function sync() {
    for (const [name, label] of [['bold', 'Bold'], ['italic', 'Italic'], ['underline', 'Underline'], ['strikeThrough', 'Strike through'], ['insertUnorderedList', 'Bulleted list'], ['insertOrderedList', 'Numbered list'], ['justifyCenter', 'Centre'], ['justifyRight', 'Align right']]) {
      let on = false;
      try { on = document.queryCommandState(name); } catch { /* not supported */ }
      bar.querySelector(`[data-cmd="${label}"]`)?.classList.toggle('on', on);
    }
  }
  document.addEventListener('selectionchange', () => { if (target && document.activeElement === target) sync(); });
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  return {
    el: bar,
    attach(el, { multiline }) {
      el.addEventListener('focus', () => {
        target = el;
        multi.forEach((m) => { m.hidden = !multiline; });
        bar.hidden = false;
        document.body.append(bar);
        place();
        sync();
      });
      el.addEventListener('blur', () => setTimeout(() => {
        if (bar.contains(document.activeElement) || document.activeElement === el || document.querySelector('dialog[open]')) return;
        if (target === el) { target = null; bar.hidden = true; colourMenu.hidden = true; sizeMenu.hidden = true; }
      }, 120));
    },
  };
}
