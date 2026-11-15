import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { uid } from '../core/ops.js';
import { mediaUrl } from '../platform/media.js';
import { runsToText, runsToHtml } from '../platform/library.js';
import { download, fileName } from './exports.js';

/**
 * Read a PDF in the library, with pdf.js (vendor/pdfjs): select text to
 * highlight it or note it, add a note to a page, and keep the notes beside
 * the document, each cited with its page in the library's chosen style.
 * Notes copy out as Markdown, or go into the source's annotation in a
 * bibliography.
 *
 *   item.notes = [{ id, page, quote, text, color, rects: [[x, y, w, h], ...] (fractions of the page), at, by }]
 *
 * Reader(item, ctx) needs from the library: me, style(), StylePicker(), lib(),
 * n(), setNotes(item, notes) and addToAnnotation(bib, item, text).
 */
const COLORS = [
  { id: 'yellow', label: 'Yellow', hex: '#f5cf3d' },
  { id: 'green', label: 'Green', hex: '#5cc489' },
  { id: 'blue', label: 'Blue', hex: '#6aa7f0' },
  { id: 'pink', label: 'Pink', hex: '#ef7fb0' },
];
const colorOf = (id) => COLORS.find((c) => c.id === id) ?? COLORS[0];

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}
// The open document, kept while the reader redraws (a style change, a note saved elsewhere).
let cache = { mediaId: null, pdf: null };
const where = new Map(); // item id -> { scroll, scale }
let activePop = null;
document.addEventListener('pointerdown', (e) => { if (activePop && !activePop.contains(e.target)) activePop.hidden = true; }, { capture: true });

export function Reader(item, ctx) {
  const fresh = () => ctx.lib().items[item.id] ?? item;
  const notes = () => [...(fresh().notes ?? [])].sort((a, b) => a.page - b.page || ((a.rects?.[0]?.[1] ?? 0) - (b.rects?.[0]?.[1] ?? 0)));
  const save = (list) => { ctx.setNotes(fresh(), list); drawNotes(); drawHighlights(); };
  const remembered = where.get(item.id) ?? {};
  let scale = remembered.scale ?? null;
  let pdf = null;
  let base = { w: 612, h: 792 };
  let current = 1;
  const pageEls = [];
  const rendered = new Map(); // page number -> scale it was drawn at

  const pagesEl = h('div', { class: 'reader-pages', tabindex: 0, 'aria-label': 'Document pages' }, h('p', { class: 'reader-loading' }, 'Opening the PDF…'));
  const notesEl = h('div', { class: 'reader-notes-list' });
  const pageInput = h('input', { class: 'input input-xs reader-page', type: 'number', min: 1, value: 1, 'aria-label': 'Page', onchange: (e) => goTo(+e.target.value) });
  const pageCount = h('span', { class: 'muted small' }, '');
  const zoomLabel = h('span', { class: 'reader-zoom muted small' }, '');
  const pop = h('div', { class: 'reader-pop', hidden: true, role: 'toolbar', 'aria-label': 'Highlight the selection' });
  const st = ctx.style();

  const el = h('div', { class: 'reader' },
    h('div', { class: 'reader-bar' },
      h('a', { class: 'btn btn-sm btn-ghost', href: `#item/${item.id}`, title: 'Back to the item' }, icon('chevronLeft', 15), h('span', { class: 'reader-title' }, item.meta.title || 'Untitled')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-xs btn-ghost btn-square', title: 'Previous page', 'aria-label': 'Previous page', onclick: () => goTo(current - 1) }, icon('chevronUp', 15)),
      pageInput, pageCount,
      h('button', { class: 'btn btn-xs btn-ghost btn-square', title: 'Next page', 'aria-label': 'Next page', onclick: () => goTo(current + 1) }, icon('chevronDown', 15)),
      h('span', { class: 'reader-sep' }),
      h('button', { class: 'btn btn-xs btn-ghost btn-square', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoom(scale / 1.15) }, icon('zoomOut', 15)),
      zoomLabel,
      h('button', { class: 'btn btn-xs btn-ghost btn-square', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoom(scale * 1.15) }, icon('zoomIn', 15)),
      h('button', { class: 'btn btn-xs btn-ghost', title: 'Fit the page width', onclick: () => zoom(fitScale()) }, 'Fit')),
    h('div', { class: 'reader-body' },
      pagesEl,
      h('aside', { class: 'reader-notes', 'aria-label': 'Notes' },
        h('div', { class: 'reader-notes-head' },
          h('h3', {}, 'Notes'),
          h('span', { class: 'spacer' }),
          ctx.StylePicker()),
        h('p', { class: 'reader-cite', innerHTML: runsToHtml(st.reference(item.meta)) }),
        h('p', { class: 'muted small reader-hint' }, 'Select text on a page to highlight it or add a note. Notes are cited with their page.'),
        h('button', { class: 'btn btn-xs', onclick: () => addNote({ page: current, quote: '', rects: [] }, true) }, icon('plus', 13), 'Note on this page'),
        notesEl,
        h('div', { class: 'reader-notes-foot' },
          h('button', { class: 'btn btn-xs', onclick: () => navigator.clipboard?.writeText(markdown()).then(() => toast('Notes copied as Markdown'), () => {}) }, 'Copy as Markdown'),
          h('button', { class: 'btn btn-xs', onclick: () => download(markdown(), fileName(`${item.meta.title || 'notes'} notes`, 'md'), 'text/markdown') }, icon('download', 13), '.md'),
          AnnotationMenu()))),
    pop);

  /* ---------------------------------------------------------- notes */
  function addNote({ page, quote, rects, color = 'yellow' }, focus = false) {
    const note = { id: uid('nt'), page, quote: quote.slice(0, 2000), text: '', color, rects, at: new Date().toISOString(), by: ctx.me?.id ?? null };
    save([...(fresh().notes ?? []), note]);
    if (focus) requestAnimationFrame(() => notesEl.querySelector(`[data-note="${note.id}"] textarea`)?.focus());
    return note;
  }
  const update = (id, patch) => save((fresh().notes ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id) => save((fresh().notes ?? []).filter((x) => x.id !== id));
  const citeFor = (x) => ctx.style().citation(item.meta, { page: String(x.page) });

  function drawNotes() {
    const list = notes();
    notesEl.replaceChildren(...(list.length ? list.map((x) => h('article', { class: 'rnote', 'data-note': x.id, style: `--hl:${colorOf(x.color).hex}` },
      h('div', { class: 'rnote-head' },
        h('button', { type: 'button', class: 'rnote-page', title: 'Go to the page', onclick: () => goTo(x.page, x.rects?.[0]?.[1]) }, `p. ${x.page}`),
        h('span', { class: 'rnote-colors' }, COLORS.map((c) => h('button', { type: 'button', class: `rnote-dot${c.id === x.color ? ' on' : ''}`, style: `--c:${c.hex}`, title: c.label, 'aria-label': `${c.label} highlight`, onclick: () => update(x.id, { color: c.id }) }))),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'rnote-x', title: 'Delete the note', 'aria-label': 'Delete the note', onclick: () => remove(x.id) }, '×')),
      x.quote && h('blockquote', {}, x.quote),
      h('textarea', { class: 'textarea textarea-xs w-full', rows: x.text ? 3 : 2, placeholder: x.quote ? 'Your thoughts on this passage' : `A note on page ${x.page}`, value: x.text ?? '', onchange: (e) => update(x.id, { text: e.target.value.slice(0, 8000) }) }),
      h('small', { class: 'rnote-cite' }, citeFor(x))))
      : [h('p', { class: 'muted small' }, 'No notes yet.')]));
  }

  function markdown() {
    const list = notes();
    const ref = runsToText(ctx.style().reference(item.meta));
    return [`# Notes on ${item.meta.title || 'Untitled'}`, '', ref, '',
      ...list.flatMap((x) => [x.quote ? `> “${x.quote}” ${citeFor(x)}` : `**Page ${x.page}** ${citeFor(x)}`, ...(x.text ? ['', x.text] : []), '']),
    ].join('\n');
  }

  function AnnotationMenu() {
    const bibs = Object.values(ctx.lib().bibs ?? {}).filter((b) => b.itemIds.includes(item.id));
    if (!bibs.length) return null;
    const send = (bib) => {
      const list = notes().filter((x) => x.text || x.quote);
      if (!list.length) { toast('Write a note first'); return; }
      ctx.addToAnnotation(bib, fresh(), list.map((x) => `${x.quote ? `“${x.quote}” ${citeFor(x)}` : citeFor(x)}${x.text ? ` ${x.text}` : ''}`).join('\n\n'));
      toast(`Added to the annotation in “${bib.title}”`);
    };
    if (bibs.length === 1) return h('button', { class: 'btn btn-xs', title: `Add the notes to this source's annotation in “${bibs[0].title}”`, onclick: () => send(bibs[0]) }, 'Add to annotation');
    return h('details', { class: 'dropdown dropdown-top dropdown-end' }, h('summary', { class: 'btn btn-xs' }, 'Add to annotation'),
      h('ul', { class: 'menu dropdown-content lib-menu' }, bibs.map((b) => h('li', {}, h('button', { onclick: (e) => { e.target.closest('details').open = false; send(b); } }, b.title)))));
  }

  /* ---------------------------------------------------------- pages */
  const fitScale = () => Math.max(0.5, Math.min(2.2, (pagesEl.clientWidth - 48) / base.w));
  function zoom(s) {
    const keep = current;
    scale = Math.max(0.4, Math.min(3, s));
    where.set(item.id, { ...where.get(item.id), scale });
    layout();
    goTo(keep);
  }
  function layout() {
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    for (const p of pageEls) {
      p.style.width = `${(p.dataset.w ?? base.w) * scale}px`;
      p.style.height = `${(p.dataset.h ?? base.h) * scale}px`;
    }
    observe();
  }
  function goTo(n, y = 0) {
    if (!pdf) return;
    const page = Math.max(1, Math.min(pdf.numPages, n || 1));
    const p = pageEls[page - 1];
    pagesEl.scrollTop = p.offsetTop - 12 + (y ? y * p.offsetHeight - 60 : 0);
    current = page;
    pageInput.value = page;
  }

  let io = null;
  function observe() {
    io?.disconnect();
    io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) renderPage(+e.target.dataset.page); }, { root: pagesEl, rootMargin: '600px 0px' });
    for (const p of pageEls) io.observe(p);
  }

  async function renderPage(n) {
    if (rendered.get(n) === scale) return;
    rendered.set(n, scale);
    const lib = await loadPdfjs();
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale });
    const box = pageEls[n - 1];
    const base1 = page.getViewport({ scale: 1 });
    box.dataset.w = base1.width;
    box.dataset.h = base1.height;
    box.style.width = `${vp.width}px`;
    box.style.height = `${vp.height}px`;
    box.style.setProperty('--scale-factor', String(vp.scale));
    const dpr = window.devicePixelRatio || 1;
    const canvas = h('canvas', { class: 'pdf-canvas', 'aria-hidden': 'true' });
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;
    const text = h('div', { class: 'textLayer' });
    const hl = h('div', { class: 'hl-layer', 'aria-hidden': 'true' });
    try {
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    } catch { rendered.delete(n); return; }
    if (rendered.get(n) !== scale) return; // zoomed while drawing
    box.replaceChildren(canvas, hl, text, h('span', { class: 'pdf-page-no' }, String(n)));
    try { await new lib.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport: vp }).render(); } catch { /* scanned pages have no text */ }
    drawHighlights(n);
  }

  function drawHighlights(only = null) {
    const list = fresh().notes ?? [];
    for (const box of pageEls) {
      const n = +box.dataset.page;
      if (only && n !== only) continue;
      const layer = box.querySelector('.hl-layer');
      if (!layer) continue;
      layer.replaceChildren(...list.filter((x) => x.page === n).flatMap((x) => (x.rects ?? []).map(([rx, ry, rw, rh]) => h('div', {
        class: 'hl', style: `left:${rx * 100}%;top:${ry * 100}%;width:${rw * 100}%;height:${rh * 100}%;--hl:${colorOf(x.color).hex}`,
        onclick: () => { const card = notesEl.querySelector(`[data-note="${x.id}"]`); card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card?.classList.add('flash'); setTimeout(() => card?.classList.remove('flash'), 1200); },
      }))));
    }
  }

  pagesEl.addEventListener('scroll', () => {
    const mid = pagesEl.scrollTop + pagesEl.clientHeight / 3;
    const at = pageEls.findIndex((p) => p.offsetTop + p.offsetHeight > mid);
    if (at >= 0 && at + 1 !== current) { current = at + 1; pageInput.value = current; }
    where.set(item.id, { ...where.get(item.id), scroll: pagesEl.scrollTop, scale });
    pop.hidden = true;
  }, { passive: true });

  /* ---------------------------------------------------------- selecting */
  function selectionOnPage() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const box = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('.pdf-page');
    if (!box || !pagesEl.contains(box)) return null;
    const quote = sel.toString().replace(/\s+/g, ' ').trim();
    if (!quote) return null;
    const b = box.getBoundingClientRect();
    // One box per line: merge the selection's rectangles that share a line.
    const lines = [];
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const line = lines.find((l) => Math.abs(l.top - r.top) < r.height * 0.5);
      if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); line.bottom = Math.max(line.bottom, r.bottom); }
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    const rects = lines.map((l) => [(l.left - b.left) / b.width, (l.top - b.top) / b.height, (l.right - l.left) / b.width, (l.bottom - l.top) / b.height].map((v) => Math.round(v * 10000) / 10000));
    const last = range.getBoundingClientRect();
    return { page: +box.dataset.page, quote, rects, at: { x: last.right, y: last.bottom } };
  }
  pagesEl.addEventListener('pointerup', () => setTimeout(() => {
    const s = selectionOnPage();
    if (!s) { pop.hidden = true; return; }
    const keep = (color, focus) => { addNote({ ...s, color }, focus); window.getSelection()?.removeAllRanges(); pop.hidden = true; };
    pop.replaceChildren(
      ...COLORS.map((c) => h('button', { type: 'button', class: 'rnote-dot', style: `--c:${c.hex}`, title: `Highlight ${c.label.toLowerCase()}`, 'aria-label': `Highlight ${c.label.toLowerCase()}`, onclick: () => keep(c.id, false) })),
      h('button', { type: 'button', class: 'btn btn-xs btn-primary', onclick: () => keep('yellow', true) }, icon('notePencil', 13), 'Note'),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost', title: 'Copy with its citation', onclick: () => { navigator.clipboard?.writeText(`“${s.quote}” ${citeFor(s)}`).then(() => toast('Quote copied with its citation'), () => {}); pop.hidden = true; } }, 'Copy cited'));
    pop.hidden = false;
    const w = 300;
    pop.style.left = `${Math.min(window.innerWidth - w - 12, Math.max(12, s.at.x - w / 2))}px`;
    pop.style.top = `${Math.min(window.innerHeight - 50, s.at.y + 8)}px`;
  }, 0));
  activePop = pop;

  /* ---------------------------------------------------------- open */
  drawNotes();
  (async () => {
    try {
      const lib = await loadPdfjs();
      if (cache.mediaId !== item.file.mediaId) {
        const url = await mediaUrl(item.file.mediaId);
        if (!url) throw new Error('The file is no longer stored.');
        cache = { mediaId: item.file.mediaId, pdf: await lib.getDocument({ url, isEvalSupported: false }).promise };
      }
      pdf = cache.pdf;
      const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
      base = { w: first.width, h: first.height };
      if (!el.isConnected) await new Promise((r) => requestAnimationFrame(r));
      scale ??= fitScale();
      pageCount.textContent = `of ${pdf.numPages}`;
      pageInput.max = pdf.numPages;
      pagesEl.replaceChildren(...Array.from({ length: pdf.numPages }, (_, i) => {
        const p = h('div', { class: 'pdf-page', 'data-page': i + 1 });
        pageEls.push(p);
        return p;
      }));
      layout();
      if (remembered.scroll) pagesEl.scrollTop = remembered.scroll;
    } catch (err) {
      pagesEl.replaceChildren(h('div', { class: 'reader-error' }, icon('warn', 28), h('p', {}, `Couldn’t open this PDF: ${err.message}`), h('a', { class: 'btn btn-sm', href: `#item/${item.id}` }, 'Back to the item')));
    }
  })();
  return el;
}
