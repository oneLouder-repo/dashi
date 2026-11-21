import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The mapper's one panel, down the left of the board (or the right), so the
 * rest of the board stays free. It holds folding sections, each with a
 * title bar (click to fold) and an optional action button:
 *
 *   const panel = MapperPanel(mainEl, [
 *     { id: 'tools', title: 'Tools', icon: 'select', body },
 *     { id: 'inspector', title: 'Inspector', icon: 'notePencil', body, open: true },
 *     { id: 'maps', title: 'Maps', icon: 'mapTrifold', body, open: false, action: { label, icon, onclick } },
 *   ], { key: 'dashi.mapper.panel' });
 *
 *   panel.state            { side, collapsed, open: { id: bool }, shown: { id: bool } }
 *   panel.toggleSection(id, open?)   panel.showSection(id, shown?)   panel.setSide('left'|'right')
 *   panel.collapse(bool?)  panel.foldAll(bool)   panel.reset()   panel.reveal(id)
 *
 * Collapsed, the panel shrinks to a slim rail of section icons; clicking
 * one opens the panel at that section. Drag the panel's edge to make it wider or narrower.
 * The layout (order and width too) is remembered per browser.
 */
const MIN_W = 220;
const MAX_W = 460;
export function MapperPanel(host, sections, { key = 'dashi.mapper.panel', onchange, outside = false } = {}) {
  const defaults = () => ({
    side: 'left',
    collapsed: false,
    open: Object.fromEntries(sections.map((s) => [s.id, s.open !== false])),
    shown: Object.fromEntries(sections.map((s) => [s.id, true])),
    order: sections.map((s) => s.id),
    width: outside ? 260 : 284,
  });
  let state = load();
  const panel = h('div', { class: `mapper-panel${outside ? ' outside' : ''}`, role: 'complementary', 'aria-label': 'Map panel' });
  const rail = h('div', { class: 'mp-rail', role: 'toolbar', 'aria-label': 'Panel sections' });
  const scroller = h('div', { class: 'mp-scroll' });
  const collapseBtn = h('button', { type: 'button', class: 'mp-collapse', onclick: () => api.collapse() });
  const resizer = h('div', { class: 'mp-resize', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Drag to resize the panel', title: 'Drag to resize' });
  panel.append(rail, scroller, collapseBtn, resizer);
  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('on');
    const x0 = e.clientX; const w0 = panel.getBoundingClientRect().width;
    const move = (ev) => { const d = (ev.clientX - x0) * (state.side === 'right' ? -1 : 1); panel.style.width = `${Math.max(MIN_W, Math.min(MAX_W, w0 + d))}px`; };
    const up = () => {
      resizer.removeEventListener('pointermove', move); resizer.removeEventListener('pointerup', up); resizer.classList.remove('on');
      set({ width: Math.round(panel.getBoundingClientRect().width) });
    };
    resizer.addEventListener('pointermove', move); resizer.addEventListener('pointerup', up);
  });
  host.append(panel);

  const els = new Map();
  for (const s of sections) {
    const chevron = h('span', { class: 'mp-chev', 'aria-hidden': 'true' }, icon('chevronDown', 14));
    const head = h('button', { type: 'button', class: 'mp-head', 'aria-expanded': 'true', onclick: () => api.toggleSection(s.id) },
      chevron, h('span', { class: 'mp-title' }, s.title), s.badge ? h('span', { class: 'mp-badge' }) : null);
    // Like every other plugin's side nav (0.2 polish): a plain title that folds, no icon, no grip.
    const bar = h('div', { class: 'mp-bar' }, head,
      s.action && h('button', { type: 'button', class: 'mp-action', title: s.action.label, 'aria-label': s.action.label, onclick: s.action.onclick }, icon(s.action.icon ?? 'plus', 15)));
    const body = h('div', { class: 'mp-body', id: `mp-${s.id}` }, s.body);
    head.setAttribute('aria-controls', body.id);
    const el = h('section', { class: `mp-sec mp-${s.id}`, 'data-section': s.id }, bar, body);
    const railBtn = h('button', { type: 'button', class: 'mp-rail-btn', title: s.title, 'aria-label': `Open ${s.title}`, onclick: () => api.reveal(s.id) }, icon(s.icon, 18));
    els.set(s.id, { el, head, railBtn });
  }

  const ordered = () => {
    const ids = [...(state.order ?? []).filter((id) => sections.some((s) => s.id === id)), ...sections.map((s) => s.id).filter((id) => !(state.order ?? []).includes(id))];
    return ids.map((id) => sections.find((s) => s.id === id));
  };

  function load() {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved) return { ...base, ...saved, open: { ...base.open, ...saved.open }, shown: { ...base.shown, ...saved.shown } };
    } catch { /* a fresh layout */ }
    return base;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* private window */ }
    onchange?.(state);
  }

  function render() {
    panel.classList.toggle('right', state.side === 'right');
    if (outside) { document.body.classList.toggle('mp-right', state.side === 'right'); document.body.classList.toggle('mp-collapsed', !!state.collapsed); }
    panel.classList.toggle('collapsed', state.collapsed);
    host.classList.toggle('panel-right', state.side === 'right');
    host.classList.toggle('panel-collapsed', state.collapsed);
    panel.style.width = state.collapsed ? '' : `${Math.max(MIN_W, Math.min(MAX_W, state.width ?? 284))}px`;
    const visible = ordered().filter((s) => state.shown[s.id] !== false);
    scroller.replaceChildren(...visible.map((s) => els.get(s.id).el));
    rail.replaceChildren(...visible.map((s) => els.get(s.id).railBtn));
    for (const s of sections) {
      const { el, head } = els.get(s.id);
      const open = state.open[s.id] !== false;
      el.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
    }
    collapseBtn.title = state.collapsed ? 'Open the panel' : 'Tuck the panel away';
    collapseBtn.setAttribute('aria-label', collapseBtn.title);
    collapseBtn.replaceChildren(icon('sidebar', 16));
  }

  const set = (patch) => { state = { ...state, ...patch }; save(); render(); };
  const api = {
    get state() { return state; },
    sections,
    el: panel,
    toggleSection(id, open = !(state.open[id] !== false)) { set({ open: { ...state.open, [id]: open } }); },
    showSection(id, shown = state.shown[id] === false) { set({ shown: { ...state.shown, [id]: shown }, open: { ...state.open, [id]: shown ? true : state.open[id] } }); },
    setSide(side) { set({ side }); },
    collapse(v = !state.collapsed) { set({ collapsed: v }); },
    foldAll(folded) { set({ open: Object.fromEntries(sections.map((s) => [s.id, !folded])) }); },
    reset() { state = defaults(); save(); render(); },
    /** Open the panel at a section, unfolded, and scroll to it. */
    reveal(id) {
      set({ collapsed: false, shown: { ...state.shown, [id]: true }, open: { ...state.open, [id]: true } });
      els.get(id)?.el.scrollIntoView({ block: 'nearest' });
    },
    /** How much of the board the panel covers, in px from its side (for fitting the view). */
    inset() {
      if (outside) return 0;   // beside the board, it covers none of it
      const r = panel.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      return state.side === 'right' ? Math.max(0, b.right - r.left) : Math.max(0, r.right - b.left);
    },
  };
  render();
  return api;
}
