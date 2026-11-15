import { h } from './dom.js';
import { icon } from './icons.js';
import { whereIs, linksOf, groupsOf, layerName, endName, STRENGTH_WORDS } from './mapInfo.js';

/**
 * Hover cards: rest the pointer on a sticky note, link or group for a
 * moment (about a second and a half) and a card floats beside it with its
 * name, description, zone, what it is linked to and the start of its
 * details. Moving onto the card keeps it open; moving away, clicking,
 * dragging, panning or pressing Esc puts it away. Off while a tool other
 * than Select or Data viz is in use, and on touch screens.
 *
 *   ctx.hoverCard = HoverCard(ctx); ctx.hoverCard.enabled = false;
 */
const DELAY_MS = 1400;

export function HoverCard(ctx) {
  const { stage, store, mapView } = ctx;
  const card = h('div', { class: 'hover-card', role: 'tooltip', hidden: true });
  document.body.append(card);
  let timer = null;
  let current = null;
  let enabled = true;
  let pointerDown = false;

  const viewAt = (el) => {
    for (let n = el; n && n !== stage.svgEl; n = n.parentNode) if (n.__view?.interactive && n.__view.id) return n.__view;
    return null;
  };

  function hide() {
    clearTimeout(timer);
    timer = null;
    current = null;
    card.hidden = true;
  }

  function show(view, x, y) {
    const map = store.map;
    const lens = mapView.lens;
    let body;
    if (view.kind === 'actor') {
      const a = map.actors[view.id];
      if (!a) return;
      const cat = lens.categoryById[a.category];
      const links = linksOf(map, lens, a.id);
      const groups = groupsOf(map, a.id);
      body = [
        h('div', { class: 'hc-head' },
          h('span', { class: `hc-swatch${a.kind === 'agent' ? ' agent' : ''}`, style: `background:${cat?.color ?? '#fff'}` }),
          h('div', {}, h('strong', {}, a.label || 'Untitled'), h('small', {}, `${a.kind === 'agent' ? 'Agent' : 'Actor'} · ${cat?.label ?? a.category}`))),
        a.meta?.description && h('p', { class: 'hc-desc' }, a.meta.description),
        h('dl', { class: 'hc-facts' },
          h('dt', {}, 'Zone'), h('dd', {}, whereIs(lens, a)),
          h('dt', {}, 'Layer'), h('dd', {}, layerName(map, a)),
          groups.length ? [h('dt', {}, 'Groups'), h('dd', {}, groups.map((g) => g.label).join(', '))] : null),
        h('p', { class: 'hc-sub' }, links.length ? `Linked to ${links.length}` : 'No links yet'),
        links.length ? h('ul', { class: 'hc-links' }, links.slice(0, 6).map((l) => h('li', {},
          h('span', { class: 'hc-dir' }, l.direction === 'out' ? '→' : l.direction === 'in' ? '←' : '↔'),
          h('span', {}, l.other?.label || 'a floating end'), h('small', {}, l.type)))) : null,
        links.length > 6 ? h('p', { class: 'hc-more' }, `and ${links.length - 6} more`) : null,
        a.meta?.notes ? h('p', { class: 'hc-notes' }, a.meta.notes.length > 220 ? `${a.meta.notes.slice(0, 220)}…` : a.meta.notes) : null,
      ];
    } else if (view.kind === 'connector') {
      const c = map.connectors[view.id];
      if (!c) return;
      body = [
        h('div', { class: 'hc-head' }, h('span', { class: 'hc-glyph' }, icon('connect', 16)),
          h('div', {}, h('strong', {}, c.label || lens.typeById[c.type]?.label || 'Link'), h('small', {}, `${lens.typeById[c.type]?.label ?? c.type} · ${STRENGTH_WORDS[c.strength ?? 3].toLowerCase()}`))),
        h('p', { class: 'hc-desc' }, h('b', {}, endName(map, c.from)), ' → ', h('b', {}, endName(map, c.to))),
        h('dl', { class: 'hc-facts' }, h('dt', {}, 'Layer'), h('dd', {}, layerName(map, c))),
      ];
    } else if (view.kind === 'group') {
      const g = map.groups?.[view.id];
      if (!g) return;
      body = [
        h('div', { class: 'hc-head' }, h('span', { class: 'hc-glyph' }, icon('collection', 16)), h('div', {}, h('strong', {}, g.label || 'Group'), h('small', {}, `Group of ${g.memberIds.length}`))),
        g.description && h('p', { class: 'hc-desc' }, g.description),
        h('p', { class: 'hc-sub' }, g.memberIds.map((id) => map.actors[id]?.label || 'Untitled').join(', ')),
      ];
    } else return;
    card.replaceChildren(...body.flat(Infinity).filter(Boolean), h('p', { class: 'hc-tip' }, 'Double-click to open its details'));
    card.hidden = false;
    // Beside the pointer, kept on screen.
    const r = card.getBoundingClientRect();
    let left = x + 18, top = y + 14;
    if (left + r.width > innerWidth - 12) left = x - r.width - 18;
    if (top + r.height > innerHeight - 12) top = Math.max(12, innerHeight - r.height - 12);
    card.style.transform = `translate(${Math.round(Math.max(12, left))}px, ${Math.round(top)}px)`;
  }

  const allowed = () => enabled && ['select', 'dataviz'].includes(ctx.tools?.active?.id);

  stage.svgEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || pointerDown || !allowed()) return hide();
    const view = viewAt(e.target);
    if (view === current) {
      // Still on the same thing: restart the wait while the card isn't up yet, so it shows after a pause.
      if (card.hidden && view) { clearTimeout(timer); timer = setTimeout(() => show(view, e.clientX, e.clientY), DELAY_MS); }
      return;
    }
    if (!card.hidden && card.matches(':hover')) return;
    hide();
    current = view;
    if (view) timer = setTimeout(() => show(view, e.clientX, e.clientY), DELAY_MS);
  });
  stage.svgEl.addEventListener('pointerleave', (e) => { if (!card.contains(e.relatedTarget)) hide(); });
  card.addEventListener('pointerleave', (e) => { if (!stage.svgEl.contains(e.relatedTarget)) hide(); });
  stage.svgEl.addEventListener('pointerdown', () => { pointerDown = true; hide(); });
  document.addEventListener('pointerup', () => { pointerDown = false; });
  stage.addEventListener('camera', hide);
  store.addEventListener('change', () => { if (!card.hidden) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  document.addEventListener('wheel', hide, { passive: true });

  return {
    hide,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; if (!enabled) hide(); },
  };
}
