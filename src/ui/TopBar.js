import { h, options } from './dom.js';
import { exportMap, importMap } from '../persistence/file.js';
import { icon } from './icons.js';
import { MapDetails } from './MapDetails.js';
import { MapHelp } from './MapHelp.js';
import { toast } from './Shell.js';
import { uiAlert, uiPrompt } from './dialog.js';
import { Menu } from './Menu.js';
import { enabledPlugins, linkTo } from '../plugins.js';
import { linkToStrategy, addToAssets, strategyUses } from './MapConnections.js';
import { saveDoc } from '../platform/storage.js';
import { mapDocName } from '../platform/maps.js';

/**
 * The mapper's top bar, left to right in the order you reach for things:
 *
 *   name · map type        what you're looking at (click the name to rename)
 *   undo redo              history
 *   fit · tidy ▾           arranging the board
 *   View ▾                 the panel and its sections, the board's grid and hover cards, zoom, help
 *   Share ▾                people who can edit it, files and pictures, and the map in
 *                          Strategy, Assets and the Library (File, Connect and People until PR 10)
 *   Works with             Assets and Plan, as in every plugin's ribbon
 *
 * Since PR 10 it is styled like the page ribbon other plugins have, and,
 * like it, has no help button: help is in the top bar (and View ▾).
 */
export function TopBar(el, ctx) {
  const { store, ops, mapView } = ctx;
  const has = (id) => enabledPlugins(ctx.org).some((p) => p.id === id);
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { map, entry } = await importMap(file);
      OpenChoice(ctx, ctx.actions.migrate(map), entry);
    } catch (err) {
      uiAlert(`Couldn't open that file: ${err.message}`);
    }
  } });

  // The map's name, as a title (0.2): rename it in Share → Owner and members.
  const name = h('h1', { class: 'map-title', title: 'Rename it in Share → Owner and members' }, ctx.index.maps[ctx.mapId]?.title ?? '');

  const lensSelect = h('select', { class: 'select select-sm lens-select', 'aria-label': 'Map type', onchange: (e) => { store.apply(ops.setLens(e.target.value)); requestAnimationFrame(() => ctx.actions.fitView()); } });
  const lensWrap = h('label', { class: 'tb-lens', title: 'The map type: the systems lens drawn behind the notes. Every note keeps its place as you switch.' }, icon('mapTrifold', 16), lensSelect);
  const undo = h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => store.undo() }, icon('undo', 17));
  const redo = h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', onclick: () => store.redo() }, icon('redo', 17));

  const tidyBtn = h('button', { class: 'btn btn-sm join-item icon-text', onclick: () => ctx.actions.tidy() }, icon('tidy', 16), h('span', {}, 'Tidy'));
  const tidyMenu = Menu({ title: 'More ways to arrange', className: 'join-item btn-square tidy-more', align: 'start', items: () => [
    { heading: 'Arrange' },
    { label: 'Tidy this map type', icon: 'tidy', hint: 'Space the notes out evenly. Each keeps its zone and layer.', onclick: () => ctx.actions.tidy() },
    { label: 'Back to my layout', icon: 'undo', hint: 'Drop the tidy for this map type: every note goes back where you placed it.', disabled: !ctx.actions.isTidied(), onclick: () => ctx.actions.untidy() },
    'sep',
    { note: 'Tidying is kept for each map type on its own. Your own placement is never lost, so switching types keeps all its detail.' },
  ] });

  // View: the panel, its sections, and how the board looks.
  const panel = () => ctx.panel;
  const viewMenu = Menu({ label: 'View', icon: 'eye', title: 'The panel, its sections, the board’s look and zoom', items: () => [
    { label: 'Fold the side nav', icon: 'sidebar', kbd: '\\', onclick: () => panel().collapse() },
    'sep',
    { heading: 'Board' },
    { label: 'Dotted grid', checked: ctx.view.grid, onclick: () => ctx.actions.setView({ grid: !ctx.view.grid }) },
    { label: 'Hover cards', checked: ctx.view.hoverCards, hint: 'Rest on a note or link for its card', onclick: () => ctx.actions.setView({ hoverCards: !ctx.view.hoverCards }) },
    'sep',
    { label: 'Fit the map', icon: 'fit', kbd: 'F', onclick: () => ctx.actions.fitView() },
    { label: 'Zoom in', icon: 'zoomIn', kbd: '+', keepOpen: true, onclick: () => ctx.actions.zoom(1.2) },
    { label: 'Zoom out', icon: 'zoomOut', kbd: '−', keepOpen: true, onclick: () => ctx.actions.zoom(1 / 1.2) },
    'sep',
    { label: 'About this map type', icon: 'help', hint: 'How to read and use it', onclick: () => MapHelp(ctx) },
  ] });

  // Share: who can edit it, copies and pictures, and the map in Dashi's other tools.
  const shareMenu = Menu({ label: 'Share', icon: 'share', title: 'People, files and pictures, and this map in Strategy, Assets and the Library', align: 'end', className: 'tb-share', items: () => {
    const sel = mapView.selectedItems();
    const actor = sel.actorIds.length === 1 && sel.connectorIds.length === 0 ? store.map.actors[sel.actorIds[0]] : null;
    const uses = has('strategy') ? strategyUses(ctx.mapId) : [];
    return [
      { heading: 'People' },
      { label: 'Owner and members…', icon: 'users', hint: 'Who can see and edit it, and its title and description', onclick: () => MapDetails(ctx) },
      { heading: 'File' },
      { label: 'Save a copy as a file', icon: 'download', hint: 'To keep offline, archive or send', onclick: () => exportMap(store.map, { entry: ctx.index.maps[ctx.mapId], org: ctx.org }) },
      { label: 'Export a picture (PNG)', icon: 'image', hint: 'For documents, slides and emails', onclick: () => exportPicture(ctx) },
      { label: 'Open a map file…', icon: 'folderOpen', hint: 'A .dashi-map.json file', onclick: () => fileInput.click() },
      { label: 'New map…', icon: 'plus', onclick: async () => { const t = await uiPrompt('Name', 'Untitled map', { title: 'New ecosystem map', ok: 'Create map' }); if (t?.trim()) ctx.actions.newMap(t.trim()); } },
      (has('strategy') || has('assets') || has('library')) && 'sep',
      has('strategy') && { heading: 'Plan' },
      has('strategy') && { label: 'Link the map to workplans or tasks…', icon: 'sec-strategy', hint: uses.length ? `Used ${uses.length} time${uses.length === 1 ? '' : 's'}: ${[...new Set(uses.map((u) => u.node.title))].slice(0, 3).join(', ')}` : 'List it among their assets', onclick: () => linkToStrategy(ctx) },
      has('strategy') && actor && { label: `Link “${actor.label || 'Untitled'}” to workplans or tasks…`, icon: actor.kind === 'agent' ? 'agent' : 'actor', onclick: () => linkToStrategy(ctx, { actor }) },
      has('assets') && { heading: 'Assets' },
      has('assets') && { label: 'Add the map to a collection…', icon: 'sec-assets', hint: 'Beside the org’s files, people and stories', onclick: () => addToAssets(ctx) },
      has('assets') && actor && { label: `Add “${actor.label || 'Untitled'}” to a collection…`, icon: actor.kind === 'agent' ? 'agent' : 'actor', onclick: () => addToAssets(ctx, { actor }) },
      has('assets') && { label: 'See it in the Asset manager', icon: 'arrowsIn', onclick: () => { location.href = linkTo('assets', `#key=${encodeURIComponent(`map:${ctx.mapId}`)}`); } },
      has('library') && { heading: 'Library' },
      has('library') && { label: ctx.actions.libraryCopy() ? 'Update the copy in the library' : 'Keep a copy in the library', icon: 'sec-library', hint: 'As a map file you can tag, cite or attach', onclick: async () => {
        try { toast((await ctx.actions.saveToLibrary()) === 'added' ? 'Saved to the library as a map file' : 'Updated the map file in the library'); }
        catch (err) { toast(`Couldn’t save to the library: ${err.message}`, 'error'); }
      } },
      (has('strategy') || has('assets') || has('library')) && { note: 'The map stays live where you use it: change it here and it updates there.' },
    ];
  } });

  // The zoom level, which also puts the board back to actual size.
  const zoomLevel = h('button', { class: 'btn btn-sm btn-ghost tb-zoom-level', title: 'Zoom level. Click for actual size (100%).', 'aria-label': 'Actual size', onclick: () => ctx.actions.zoomReset() }, '100%');
  const showZoom = () => { zoomLevel.textContent = `${Math.round((ctx.stage?.scale ?? 1) * 100)}%`; };
  ctx.stage?.addEventListener('camera', showZoom);
  requestAnimationFrame(showZoom);
  el.append(
    h('div', { class: 'tb-group tb-what' }, name, lensWrap),
    h('span', { class: 'topbar-sep' }),
    h('div', { class: 'tb-group' }, undo, redo),
    h('span', { class: 'topbar-sep' }),
    h('div', { class: 'tb-group' },
      h('div', { class: 'tb-zoom', role: 'group', 'aria-label': 'Zoom' },
        h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Zoom out (−)', 'aria-label': 'Zoom out', onclick: () => ctx.actions.zoom(1 / 1.2) }, icon('zoomOut', 16)),
        zoomLevel,
        h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Zoom in (+)', 'aria-label': 'Zoom in', onclick: () => ctx.actions.zoom(1.2) }, icon('zoomIn', 16))),
      h('button', { class: 'btn btn-sm btn-ghost icon-text', title: 'Fit the whole map on screen (F)', onclick: () => ctx.actions.fitView() }, icon('fit', 16), h('span', {}, 'Fit')),
      h('div', { class: 'join tidy-split', title: 'Space the notes out evenly for this map type. Undo or “Back to my layout” puts them back.' }, tidyBtn, tidyMenu)),
    h('div', { class: 'spacer' }),
    h('div', { class: 'tb-group' }, viewMenu, shareMenu),
    fileInput,
  );

  const render = () => {
    lensSelect.replaceChildren(...options([...mapView.lenses.values()].map((l) => ({ id: l.id, label: l.name })), store.map.lensId));
    name.textContent = store.map.name || ctx.index.maps[ctx.mapId]?.title || 'Untitled map';
    name.title = `${name.textContent}. Rename it in Share → Owner and members.`;
    undo.disabled = !store.undoStack.length;
    redo.disabled = !store.redoStack.length;
    tidyBtn.classList.toggle('tidied', ctx.actions.isTidied());
    tidyBtn.title = ctx.actions.isTidied() ? 'Tidied for this map type. Tidy again to refresh it.' : 'Space the notes out evenly for this map type';
  };
  store.addEventListener('change', render);
  render();
}

async function exportPicture(ctx) {
  try {
    saveDoc(mapDocName(ctx.mapId), ctx.store.map, undefined, { quiet: true });
    const { mapPicture } = await import('../platform/dashiObjects.js');
    const url = await mapPicture(ctx.mapId);
    const a = h('a', { href: url, download: `${(ctx.index.maps[ctx.mapId]?.title || 'map').replace(/[^\w\- ]+/g, '').trim() || 'map'}.png` });
    document.body.append(a);
    a.click();
    a.remove();
  } catch (err) {
    toast(`Couldn’t make the picture: ${err.message}`, 'error');
  }
}

/** After picking a file: open it as a new map, or replace this one. */
export function OpenChoice(ctx, map, entry) {
  const counts = `${Object.keys(map.actors).length} actors, ${Object.keys(map.connectors).length} connectors`;
  const dialog = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box' },
      h('h3', { class: 'text-lg font-bold' }, `Open “${entry.title || 'Untitled map'}”`),
      h('p', { class: 'muted' }, `${counts}. ${entry.description || ''}`),
      h('div', { class: 'modal-action' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-sm', title: 'This map’s contents are replaced by the file’s', onclick: () => { dialog.close(); ctx.actions.replaceWith(map); } }, 'Replace this map'),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => { dialog.close(); ctx.actions.openAsNew(map, entry); } }, 'Open as a new map'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
