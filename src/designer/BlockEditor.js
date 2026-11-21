import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Markdown } from '../ui/markdown.js';

/**
 * The Dashi block editor: a page edited where it stands. Each block (a
 * paragraph, heading, list, quote or embed, separated by blank lines in the
 * page's light markdown) shows as it reads; click it to change the words,
 * drag the handle to move it, and use + to add one between.
 *
 * Each plugin makes its own instance with its own blocks and its own save,
 * so a designer never writes another plugin's document:
 *
 *   BlockEditor({
 *     title, body,                      what to edit
 *     embed,                            how [[kind:id]] renders (as on the page)
 *     embeds: [{ code, label }],        what can be embedded here (optional)
 *     onChange({ title, body }),        each settled change (save it)
 *   })
 */
export const splitBlocks = (body = '') => String(body).replace(/\r\n/g, '\n').split(/\n[ \t]*\n+/).map((b) => b.trim()).filter(Boolean);
export const joinBlocks = (blocks) => blocks.map((b) => b.trim()).filter(Boolean).join('\n\n');

export const KINDS = [
  { id: 'p', label: 'Paragraph', icon: 'alignLeft', make: () => 'New paragraph. Click to write.' },
  { id: 'h', label: 'Heading', icon: 'doc', make: () => '## A heading' },
  { id: 'ul', label: 'List', icon: 'listBullets', make: () => '- First point\n- Second point' },
  { id: 'quote', label: 'Quote', icon: 'quotes', make: () => '> Something worth saying' },
];

export function BlockEditor(opts) {
  let blocks = splitBlocks(opts.body);
  let title = opts.title ?? '';
  let editing = -1;
  let dragFrom = -1;
  const root = h('div', { class: 'be', role: 'list', 'aria-label': 'Page blocks' });

  const commit = () => opts.onChange?.({ title, body: joinBlocks(blocks) });

  const titleEl = opts.title != null && h('h1', { class: 'be-title', contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Page title',
    onblur: (e) => { const t = e.target.textContent.trim(); if (t && t !== title) { title = t; commit(); } else e.target.textContent = title; },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } }, title);

  function Adder(at) {
    const menu = h('div', { class: 'be-add-menu', hidden: true },
      KINDS.map((k) => h('button', { type: 'button', onclick: () => insert(at, k.make()) }, icon(k.icon, 14), k.label)),
      (opts.embeds ?? []).length > 0 && h('select', { class: 'select select-xs', 'aria-label': 'Embed something', onchange: (e) => e.target.value && insert(at, e.target.value) },
        h('option', { value: '' }, 'Embed…'), opts.embeds.map((x) => h('option', { value: x.code }, x.label))));
    return h('div', { class: 'be-add' },
      h('button', { type: 'button', class: 'be-add-btn', title: 'Add a block here', 'aria-label': 'Add a block here', onclick: () => { menu.hidden = !menu.hidden; } }, icon('plus', 13)),
      menu);
  }

  function insert(at, text) {
    blocks.splice(at, 0, text);
    editing = at;
    commit();
    draw();
  }

  function Block(text, i) {
    if (i === editing) {
      const ta = h('textarea', { class: 'be-text', 'aria-label': `Block ${i + 1}`, rows: 1, value: text,
        oninput: (e) => grow(e.target),
        onkeydown: (e) => {
          if (e.key === 'Escape') { e.preventDefault(); editing = -1; draw(); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.target.blur(); }
        },
        onblur: (e) => {
          const v = e.target.value.trim();
          const parts = splitBlocks(v);
          // A blank line typed inside a block splits it in two; an emptied block goes.
          if (v !== text) { blocks.splice(i, 1, ...parts); commit(); }
          if (editing === i) editing = -1;
          draw();
        } });
      ta.textContent = text;
      queueMicrotask(() => { ta.focus(); grow(ta); });
      return h('div', { class: 'be-block editing', role: 'listitem' }, ta,
        h('p', { class: 'be-hint muted small' }, 'Markdown: ## heading, - list, > quote, **bold**, [link](https://…). A blank line starts a new block. Esc to cancel.'));
    }
    const el = h('div', { class: 'be-block', role: 'listitem', draggable: 'true', 'data-i': i,
      ondragstart: (e) => { dragFrom = i; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); },
      ondragend: () => { el.classList.remove('dragging'); root.querySelectorAll('.drop-above,.drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below')); },
      ondragover: (e) => { if (dragFrom < 0) return; e.preventDefault(); const below = e.offsetY > el.offsetHeight / 2; el.classList.toggle('drop-below', below); el.classList.toggle('drop-above', !below); },
      ondragleave: () => el.classList.remove('drop-above', 'drop-below'),
      ondrop: (e) => {
        e.preventDefault();
        if (dragFrom < 0) return;
        const below = e.offsetY > el.offsetHeight / 2;
        move(dragFrom, i + (below ? 1 : 0));
        dragFrom = -1;
      } },
    h('div', { class: 'be-tools' },
      h('span', { class: 'be-grip', title: 'Drag to move', 'aria-hidden': 'true' }, icon('grip', 14)),
      h('button', { type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, i - 1) }, icon('chevronUp', 13)),
      h('button', { type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === blocks.length - 1, onclick: () => move(i, i + 2) }, icon('chevronDown', 13)),
      h('button', { type: 'button', title: 'Remove this block', 'aria-label': 'Remove this block', onclick: () => { blocks.splice(i, 1); commit(); draw(); } }, icon('trash', 13))),
    h('div', { class: 'be-view', tabindex: '0', title: 'Click to edit', onclick: (e) => { if (e.target.closest('a')) e.preventDefault(); editing = i; draw(); },
      onkeydown: (e) => { if (e.key === 'Enter') { editing = i; draw(); } } }, Markdown(text, { embed: opts.embed })));
    return el;
  }

  function move(from, to) {
    if (to < 0 || to > blocks.length || to === from || to === from + 1) return;
    const [b] = blocks.splice(from, 1);
    blocks.splice(to > from ? to - 1 : to, 0, b);
    commit();
    draw();
  }

  function draw() {
    root.replaceChildren(...[
      titleEl,
      ...blocks.flatMap((b, i) => [Adder(i), Block(b, i)]),
      Object.assign(Adder(blocks.length), { className: 'be-add be-add-end' }),
      !blocks.length && h('p', { class: 'muted be-empty' }, 'This page is empty. Add a first block with +.'),
    ].filter(Boolean));
  }

  draw();
  return root;
}

function grow(ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; }
