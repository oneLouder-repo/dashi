/**
 * Edit a sticky note's words in place, like a whiteboard (alpha 0.3):
 * double-click a note and type straight on it. The box covers the whole
 * note and wraps; Enter keeps it, Shift+Enter starts a new line, Escape
 * puts it back.
 */
export function LabelEditor(ctx) {
  const input = document.createElement('textarea');
  input.className = 'label-editor';
  input.setAttribute('aria-label', 'Sticky note text');
  input.rows = 2;
  input.hidden = true;
  document.body.append(input);
  let editing = null;

  const close = (commit) => {
    if (!editing) return;
    const { id, view } = editing;
    editing = null;
    input.hidden = true;
    view?.text.style.removeProperty('visibility');
    const actor = ctx.store.map.actors[id];
    if (commit && actor && input.value !== actor.label) {
      ctx.store.apply(ctx.ops.updateActor(id, { label: input.value.trim() }));
    }
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(true); }
    if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
  ctx.stage.addEventListener('camera', () => close(true));

  return function editLabel(id) {
    close(true);
    const actor = ctx.mapView.world.actors[id];
    const view = ctx.mapView.viewFor(id);
    if (!actor || !view) return;
    const { scale } = ctx.stage;
    // Zoomed far out, the box grows to a size you can type in, centred on the note.
    const c = ctx.stage.toScreen(actor.x, actor.y);
    const w = Math.max(170, actor.w * scale), hgt = Math.max(84, actor.h * scale);
    const fill = getComputedStyle(view.node.querySelector('rect') ?? view.node).fill;
    Object.assign(input.style, {
      left: `${c.x - w / 2}px`,
      top: `${c.y - hgt / 2}px`,
      width: `${w}px`,
      height: `${hgt}px`,
      fontSize: `${Math.max(13, Math.min(18, 15 * scale))}px`,
      background: /^(rgb|#)/.test(fill) ? fill : '#fffdf6',
    });
    input.value = actor.label;
    input.hidden = false;
    view.text.style.visibility = 'hidden';
    editing = { id, view };
    // Focus after the current pointer event, or the browser's own focus handling steals it back.
    setTimeout(() => {
      if (editing?.id !== id) return;
      input.focus();
      input.select();
    });
  };
}
