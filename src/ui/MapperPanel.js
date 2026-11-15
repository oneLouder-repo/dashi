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
 * one opens the panel at that section. The layout is remembered per browser.
 */
export function MapperPanel(host, sections, { key = 'dashi.mapper.panel', onchange } = {}) {
  const defaults = () => ({
    side: 'left',
    collapsed: false,
    open: Object.fromEntries(sections.map((s) => [s.id, s.open !== false])),
    shown: Object.fromEntries(sections.map((s) => [s.id, true])),
  });
  let state = load();
  const panel = h('aside', { class: 'mapper-panel', 'aria-label': 'Map panel' });
  const rail = h('div', { class: 'mp-rail', role: 'toolbar', 'aria-label': 'Panel sections' });
  const scroller = h('div', { class: 'mp-scroll' });
  const collapseBtn = h('button', { type: 'button', class: 'mp-collapse', onclick: () => api.collapse() });
  panel.append(rail, scroller, collapseBtn);
  host.append(panel);

  const els = new Map();
  for (const s of sections) {
    const chevron = h('span', { class: 'mp-chev', 'aria-hidden': 'true' }, icon('chevronDown', 14));
    const head = h('button', { type: 'button', class: 'mp-head', 'aria-expanded': 'true', onclick: () => api.toggleSection(s.id) },
      chevron, icon(s.icon, 15), h('span', { class: 'mp-title' }, s.title), s.badge ? h('span', { class: 'mp-badge' }) : null);
    const bar = h('div', { class: 'mp-bar' }, head,
      s.action && h('button', { type: 'button', class: 'mp-action', title: s.action.label, 'aria-label': s.action.label, onclick: s.action.onclick }, icon(s.action.icon ?? 'plus', 15)));
    const body = h('div', { class: 'mp-body', id: `mp-${s.id}` }, s.body);
    head.setAttribute('aria-controls', body.id);
    const el = h('section', { class: `mp-sec mp-${s.id}`, 'data-section': s.id }, bar, body);
    const railBtn = h('button', { type: 'button', class: 'mp-rail-btn', title: s.title, 'aria-label': `Open ${s.title}`, onclick: () => api.reveal(s.id) }, icon(s.icon, 18));
    els.set(s.id, { el, head, railBtn });
  }

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
    panel.classList.toggle('collapsed', state.collapsed);
    host.classList.toggle('panel-right', state.side === 'right');
    host.classList.toggle('panel-collapsed', state.collapsed);
    const visible = sections.filter((s) => state.shown[s.id] !== false);
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
      const r = panel.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      return state.side === 'right' ? Math.max(0, b.right - r.left) : Math.max(0, r.right - b.left);
    },
  };
  render();
  return api;
}
