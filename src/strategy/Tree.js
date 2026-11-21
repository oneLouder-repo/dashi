import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { NODE_TYPES, childrenOf, rootOf, statusById, taskSummary, ancestors } from '../platform/strategy.js';
import { range } from './dates.js';
import { levelIcon } from '../ui/strategyLook.js';

/** The strategy as an outline: click to open, ▸ to expand, + to add the first allowed child. */
export function Tree(ctx) {
  const { store, select, collapsed, selectedId } = ctx;
  const doc = store.doc;
  const root = rootOf(doc);
  const path = new Set(selectedId && doc.nodes[selectedId] ? ancestors(doc, selectedId).map((n) => n.id) : []);

  const row = (n, depth) => {
    const kids = childrenOf(doc, n.id);
    const open = !collapsed.has(n.id);
    const type = NODE_TYPES[n.type];
    const meta =
      n.type === 'task' ? h('span', { class: 'dot', style: `background:${statusById[n.status]?.color}`, title: statusById[n.status]?.label })
      : n.type === 'workplan' ? h('span', { class: 'tree-meta' }, `${taskSummary(doc, n.id).done}/${taskSummary(doc, n.id).total}`)
      : type.dated && n.start ? h('span', { class: 'tree-meta' }, `’${n.start.slice(2, 4)}–’${(n.end ?? '').slice(2, 4)}`)
      : null;
    return [
      h('li', { class: `tree-row type-${n.type}${n.draft ? ' is-draft' : ''}${n.id === selectedId ? ' selected' : ''}${path.has(n.id) ? ' on-path' : ''}`, style: `padding-left:${4 + depth * 11}px`, title: `${type.label}: ${n.title}` },
        kids.length
          ? h('button', { class: 'caret', 'aria-label': open ? 'Collapse' : 'Expand', 'aria-expanded': String(open),
              onclick: () => { open ? collapsed.add(n.id) : collapsed.delete(n.id); ctx.render(); } }, icon(open ? 'chevronDown' : 'chevronRight', 14))
          : h('span', { class: 'caret' }),
        levelIcon(n.type, 14),
        h('button', { class: 'tree-title', onclick: () => select(n.id) }, n.title || 'Untitled'),
        n.draft ? h('span', { class: 'tree-draft', title: 'A draft from the theory of change' }, 'Draft') : meta,
        type.children.length > 0 && h('button', { class: 'tree-add', title: `Add ${NODE_TYPES[type.children.at(-1)].label.toLowerCase()}`,
          onclick: () => ctx.addChild(n.id, type.children.at(-1)) }, '+'),
      ),
      open && kids.flatMap((k) => row(k, depth + 1)),
    ];
  };

  return h('ul', { class: 'tree', role: 'tree' }, root ? row(root, 0) : []);
}
