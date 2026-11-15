import { h, options } from './dom.js';
import { icon } from './icons.js';
import { ItemDetails } from './Inspector.js';
import { whereIs, linksOf, endName, groupsOf } from './mapInfo.js';

/**
 * The Inspector section of the mapper's panel: edit whatever is selected
 * without leaving the board. An actor or agent shows its name and short
 * description (both show on its sticky note), its category and layer;
 * the longer details, links and the rest are in the larger details window
 * (More details, Enter, or double-click). With nothing selected it shows
 * the map itself.
 */
export function InspectorPanel(el, ctx) {
  const { store, ops, mapView } = ctx;
  el.classList.add('inspector-panel');

  const field = (label, control, hint) => h('label', { class: 'ip-field' }, h('span', { class: 'ip-label' }, label), control, hint && h('small', { class: 'ip-hint' }, hint));
  const input = (value, onchange, extra = {}) => h('input', { class: 'input input-sm w-full', value: value ?? '', onchange: (e) => onchange(e.target.value), ...extra });
  const area = (value, onchange, extra = {}) => h('textarea', { class: 'textarea textarea-sm w-full', rows: 3, value: value ?? '', onchange: (e) => onchange(e.target.value), ...extra });
  const select = (opts, value, onchange) => h('select', { class: 'select select-sm w-full', onchange: (e) => onchange(e.target.value) }, options(opts, value));
  const layerOpts = () => store.map.layers.map((l) => ({ id: l.id, label: l.name }));
  const more = () => h('button', { type: 'button', class: 'btn btn-sm btn-ghost ip-more', onclick: () => ItemDetails(ctx) }, icon('notePencil', 15), 'More details', h('kbd', { class: 'kbd kbd-xs' }, '↵'));

  function actor(a) {
    const lens = mapView.lens;
    const kind = a.kind ?? 'actor';
    const cats = lens.actorCategories.map((c) => ({ id: c.id, label: c.label }));
    if (!lens.categoryById[a.category]) cats.push({ id: a.category, label: `Unmapped (${a.category})` });
    const links = linksOf(store.map, lens, a.id);
    const groups = groupsOf(store.map, a.id);
    return [
      h('div', { class: 'ip-kind' },
        h('span', { class: `ip-swatch${kind === 'agent' ? ' agent' : ''}`, style: `background:${lens.categoryById[a.category]?.color ?? '#fff'}` }),
        h('div', { class: 'segmented ip-seg', role: 'group', 'aria-label': 'Actor or agent' },
          [['actor', 'Actor'], ['agent', 'Agent']].map(([id, label]) => h('button', { type: 'button', class: id === kind ? 'on' : '', 'aria-pressed': String(id === kind), onclick: () => id !== kind && store.apply(ops.updateActor(a.id, { kind: id })) }, label)))),
      field('Name', input(a.label, (v) => store.apply(ops.updateActor(a.id, { label: v.trim() })), { 'data-focus': 'name' })),
      field('Description', area(a.meta?.description, (v) => store.apply(ops.updateActor(a.id, { meta: { ...a.meta, description: v.trim() } })), { rows: 3, placeholder: 'A line or two: who they are, what they do', maxlength: 280 }), 'Shows on the sticky note.'),
      field('Category', select(cats, a.category, (v) => store.apply(ops.updateActor(a.id, { category: v })))),
      field('Layer', select(layerOpts(), a.layerId ?? store.map.layers[0]?.id, (v) => store.apply(ops.batch(ctx.actions.actorsToLayerOps([a.id], v))))),
      h('dl', { class: 'ip-facts' },
        h('dt', {}, 'Zone'), h('dd', {}, whereIs(lens, a)),
        h('dt', {}, 'Links'), h('dd', {}, links.length ? `${links.length} · ${links.slice(0, 3).map((l) => l.other?.label || 'floating').join(', ')}${links.length > 3 ? '…' : ''}` : 'None yet'),
        groups.length ? [h('dt', {}, 'Groups'), h('dd', {}, groups.map((g) => g.label).join(', '))] : null,
        a.meta?.notes ? [h('dt', {}, 'Details'), h('dd', { class: 'ip-clip' }, a.meta.notes)] : null),
      more(),
    ];
  }

  function connector(c) {
    const lens = mapView.lens;
    const types = lens.connectorTypes.map((t) => ({ id: t.id, label: t.label }));
    if (!lens.typeById[c.type]) types.push({ id: c.type, label: `Unmapped (${c.type})` });
    return [
      h('p', { class: 'ip-title' }, icon('connect', 15), h('span', {}, endName(store.map, c.from), ' → ', endName(store.map, c.to))),
      field('Label', input(c.label, (v) => store.apply(ops.updateConnector(c.id, { label: v })), { 'data-focus': 'name' })),
      field('Type', select(types, c.type, (v) => store.apply(ops.updateConnector(c.id, { type: v })))),
      field('Strength', h('div', { class: 'ip-strength', role: 'radiogroup', 'aria-label': 'Strength, 1 to 5' }, [1, 2, 3, 4, 5].map((n) =>
        h('button', { type: 'button', role: 'radio', class: n === (c.strength ?? 3) ? 'on' : '', 'aria-checked': String(n === (c.strength ?? 3)), title: `Strength ${n}`, onclick: () => store.apply(ops.updateConnector(c.id, { strength: n })) }, String(n))))),
      field('Layer', select(layerOpts(), c.layerId ?? store.map.layers[0]?.id, (v) => store.apply(ops.updateConnector(c.id, { layerId: v })))),
      more(),
    ];
  }

  function group(g) {
    return [
      field('Group name', input(g.label, (v) => store.apply(ops.updateGroup(g.id, { label: v })), { 'data-focus': 'name' })),
      field('Description', area(g.description, (v) => store.apply(ops.updateGroup(g.id, { description: v })), { placeholder: 'Who they are and why they belong together' })),
      h('p', { class: 'ip-hint' }, `${g.memberIds.length} members: ${g.memberIds.map((id) => store.map.actors[id]?.label || 'Untitled').join(', ')}`),
      more(),
    ];
  }

  function several({ actorIds, connectorIds, groupIds }) {
    const n = actorIds.length + connectorIds.length + groupIds.length;
    return [
      h('p', { class: 'ip-title' }, `${n} selected`),
      h('p', { class: 'ip-hint' }, [actorIds.length && `${actorIds.length} actors`, connectorIds.length && `${connectorIds.length} connectors`, groupIds.length && `${groupIds.length} groups`].filter(Boolean).join(' · ')),
      actorIds.length > 1 && field('Move to layer', select([{ id: '', label: 'Choose a layer…' }, ...layerOpts()], '', (v) => v && store.apply(ops.batch(ctx.actions.actorsToLayerOps(actorIds, v))))),
      h('div', { class: 'ip-actions' },
        actorIds.length > 1 && h('button', { type: 'button', class: 'btn btn-sm', onclick: () => ctx.actions.groupSelection() }, 'Group them'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => ctx.actions.deleteSelection() }, icon('trash', 14), 'Delete')),
    ];
  }

  function nothing() {
    const entry = ctx.index.maps[ctx.mapId] ?? {};
    const map = store.map;
    const actors = Object.values(map.actors);
    return [
      h('p', { class: 'ip-title' }, icon('mapTrifold', 15), h('span', {}, entry.title || 'This map')),
      field('Map description', area(entry.description, (v) => ctx.actions.updateEntry({ description: v }), { rows: 3, placeholder: 'What this map is for, and who it is with' })),
      h('dl', { class: 'ip-facts' },
        h('dt', {}, 'Map type'), h('dd', {}, mapView.lens.name),
        h('dt', {}, 'On the map'), h('dd', {}, `${actors.filter((a) => a.kind !== 'agent').length} actors · ${actors.filter((a) => a.kind === 'agent').length} agents · ${Object.keys(map.connectors).length} links`),
        h('dt', {}, 'Layout'), h('dd', {}, ctx.actions.isTidied() ? 'Tidied for this map type' : 'As placed by hand')),
      h('p', { class: 'ip-hint' }, 'Select a sticky note, link or group to edit it here. Rest the pointer on one for a moment to see its card.'),
    ];
  }

  function render() {
    // Don't redraw under someone typing.
    if (el.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')) return;
    const sel = mapView.selectedItems();
    const n = sel.actorIds.length + sel.connectorIds.length + sel.groupIds.length;
    const parts = n > 1 ? several(sel)
      : sel.actorIds.length ? actor(store.map.actors[sel.actorIds[0]])
        : sel.connectorIds.length ? connector(store.map.connectors[sel.connectorIds[0]])
          : sel.groupIds.length ? group(store.map.groups[sel.groupIds[0]])
            : nothing();
    el.replaceChildren(...parts.flat(Infinity).filter(Boolean));
  }

  mapView.addEventListener('selection', render);
  store.addEventListener('change', render);
  el.addEventListener('focusout', () => setTimeout(render));
  render();
  return { render, focusName: () => el.querySelector('[data-focus="name"]')?.focus() };
}
