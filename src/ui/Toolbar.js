import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The mapper's tools, as a list in the panel's Tools section: one row per
 * tool, the same kind of row as the layers below (0.2: no more tiles), with
 * its shortcut key on the right.
 * Nothing here stays switched on except Pan and Data viz:
 *   Select          the usual pointer
 *   Actor, Agent    click to add a sticky note, or drag one onto the board
 *   Connect         draw one connector, then back to Select
 *   Pan             drag the board (or hold Space with any tool)
 *   Data viz        on until you switch it off
 */
/*
 * Alpha 0.3: the tools are rows of the platform side nav (ui/SideNav.js),
 * the same two-line rows every plugin has, so `el` is a ul.menu.side-menu.
 */
const SUBS = { select: 'Pick, move and edit', actor: 'Add a sticky note', agent: 'A sticky for a key player', connect: 'Draw a link between notes', pan: 'Drag the board around', dataviz: 'Colour notes by data' };
export function Toolbar(el, ctx) {
  const { tools } = ctx;
  el.classList.add('menu', 'side-menu', 'tool-menu');
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Tools');
  const label = (text, key, id) => [h('span', { class: 'side-text' }, text, h('small', {}, SUBS[id] ?? '')), key && h('kbd', { class: 'tool-key' }, key)];
  const toolButton = (tool) => {
    const on = tool === tools.active;
    return h('button', {
      type: 'button',
      class: `tool${on && !tool.oneShot ? ' active menu-active' : ''}${on && tool.oneShot ? ' armed menu-active' : ''}`,
      title: `${tool.label}${tool.key ? ` (${tool.key.toUpperCase()})` : ''}: ${tool.hint ?? SUBS[tool.id] ?? ''}`,
      'aria-pressed': tool.oneShot ? null : String(on),
      onclick: () => tools.toggle(tool.id),
    }, icon(tool.icon, 18), ...label(tool.label, tool.key?.toUpperCase(), tool.id));
  };

  const render = () => {
    const t = (id) => tools.tools.get(id);
    el.replaceChildren(...[
      toolButton(t('select')),
      AddButton(ctx, 'actor', 'Actor', 'A', label),
      AddButton(ctx, 'agent', 'Agent', '⇧A', label),
      toolButton(t('connect')),
      toolButton(t('pan')),
      toolButton(t('dataviz')),
    ].map((b) => h('li', { role: 'none' }, b)));
  };
  tools.addEventListener('change', render);
  render();
}

/** Click to add an actor (or agent) in view; drag to drop one exactly where you want it. */
function AddButton(ctx, kind, text, key, label) {
  let drag = null;
  let suppressClick = false;
  const board = ctx.stage.svgEl;
  const overBoard = (x, y) => board.contains(document.elementFromPoint(x, y));

  const button = h('button', {
    type: 'button',
    class: `tool tool-add ${kind}`,
    title: `Add ${kind === 'agent' ? 'an agent' : 'an actor'} sticky note (${key === '⇧A' ? 'Shift+A' : key}). Or drag it onto the board.`,
    onclick: () => {
      if (suppressClick) { suppressClick = false; return; }
      ctx.actions.addActorInView(kind);
    },
    onpointerdown: (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, ghost: null };
      button.setPointerCapture(e.pointerId);
    },
    onpointermove: (e) => {
      if (!drag) return;
      if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        drag.ghost = h('div', { class: `drag-actor${kind === 'agent' ? ' agent' : ''}`, 'aria-hidden': 'true' }, `New ${kind}`);
        document.body.append(drag.ghost);
      }
      if (!drag.ghost) return;
      drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const over = overBoard(e.clientX, e.clientY);
      drag.ghost.classList.toggle('over', over);
      ctx.mapView.lensView.highlight(over ? ctx.actions.regionAtScreen(e.clientX, e.clientY) : null);
    },
    onpointerup: (e) => {
      if (!drag) return;
      const { ghost } = drag;
      drag = null;
      if (!ghost) return;
      ghost.remove();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; });
      ctx.mapView.lensView.highlight(null);
      if (overBoard(e.clientX, e.clientY)) {
        const w = ctx.stage.toWorld(e.clientX, e.clientY);
        ctx.actions.addActorAt(w.x, w.y, kind);
      }
    },
  }, icon(kind, 18), ...label(text, key, kind));
  return button;
}
