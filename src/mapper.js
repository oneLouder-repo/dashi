import { Stage } from './core/Stage.js';
import { Store } from './core/Store.js';
import { ops, uid, ACTOR_SIZE } from './core/ops.js';
import { MapView } from './display/MapView.js';
import { lensBounds, loadLenses, unproject, regionAt } from './lenses/index.js';
import { tidyPlaces } from './lenses/tidy.js';
import { ToolRegistry } from './tools/registry.js';
import SelectTool from './tools/SelectTool.js';
import ConnectTool from './tools/ConnectTool.js';
import PanTool from './tools/PanTool.js';
import DataVizTool from './tools/DataVizTool.js';
import { Toolbar } from './ui/Toolbar.js';
import { TopBar } from './ui/TopBar.js';
import { ItemDetails } from './ui/Inspector.js';
import { MapperPanel } from './ui/MapperPanel.js';
import { InspectorPanel } from './ui/InspectorPanel.js';
import { HoverCard } from './ui/HoverCard.js';
import { Tooltips } from './ui/Tooltip.js';
import { SelectionBar } from './ui/SelectionBar.js';
import { LayersPanel } from './ui/LayersPanel.js';
import { LabelEditor } from './ui/LabelEditor.js';
import { migrateMap } from './seed.js';
import { Shell } from './ui/Shell.js';
import { h } from './ui/dom.js';
import { autosaveDoc, saveDoc } from './platform/storage.js';
import { loadOrg, loadMaps, loadLibrary } from './platform/docs.js';
import { putMedia, mediaUrl } from './platform/media.js';
import { mapFile, fileName, parseMapFile } from './persistence/file.js';
import { OpenChoice } from './ui/TopBar.js';
import { toast } from './ui/Shell.js';
import { enabledPlugins } from './plugins.js';
import { loadMapContent, mapDocName, createMapIn } from './platform/maps.js';
import { currentUser } from './platform/session.js';
import { uiPrompt } from './ui/dialog.js';

const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'mapper', org });

// Which map: mapper.html#<mapId>, else the first map this org has (making one if none).
const index = loadMaps();
let mapId = decodeURIComponent(location.hash.slice(1));
// mapper.html#open=<library item>: open a map file kept in the library.
const openFromLibrary = mapId.startsWith('open=') ? mapId.slice(5) : null;
if (!index.maps[mapId]) {
  mapId = Object.keys(index.maps)[0] ?? createMapIn(index, { title: 'Our ecosystem', ownerId: currentUser(org)?.id }).id;
  history.replaceState(null, '', `#${mapId}`);
}
window.addEventListener('hashchange', () => location.reload());

const lenses = await loadLenses();
const store = new Store(migrateMap(loadMapContent(mapId), lenses));
const stage = new Stage(document.querySelector('#board'));
const mapView = new MapView(stage, store, lenses);

/**
 * Zoom and centre so the whole map fits the board: the lens backdrop and
 * every actor, wide or tall, clear of the docked panels.
 */
let fittedCamera = null;
function fitView() {
  // Fit the notes (so they're as big as they can be), or the whole lens when there are only a few.
  const shown = Object.values(mapView.world.actors);
  const b = shown.length >= 3 ? { x: Infinity, y: Infinity, w: -Infinity, h: -Infinity } : { ...lensBounds(mapView.lens) };
  if (shown.length >= 3) {
    const xs = shown.flatMap((a) => [a.x - a.w / 2, a.x + a.w / 2]), ys = shown.flatMap((a) => [a.y - a.h / 2, a.y + a.h / 2]);
    const m = 40;
    Object.assign(b, { x: Math.min(...xs) - m, y: Math.min(...ys) - m - 30, w: Math.max(...xs) - Math.min(...xs) + m * 2, h: Math.max(...ys) - Math.min(...ys) + m * 2 + 30 });
  }
  for (const a of shown) {
    const x0 = Math.min(b.x, a.x - a.w / 2), y0 = Math.min(b.y, a.y - a.h / 2);
    const x1 = Math.max(b.x + b.w, a.x + a.w / 2), y1 = Math.max(b.y + b.h, a.y + a.h / 2);
    Object.assign(b, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const { clientWidth, clientHeight } = stage.svgEl;
  if (!clientWidth || !clientHeight) return;
  const box = stage.svgEl.getBoundingClientRect();
  const covered = ctx.panel?.inset() ?? 0;
  const side = ctx.panel?.state.side ?? 'left';
  const left = side === 'left' ? covered : 0, right = side === 'right' ? covered : 0;
  void box;
  const pad = 28;
  const w = clientWidth - left - right - pad * 2, h = clientHeight - pad * 2 - 44; // room for the selection bar
  stage.scale = Math.min(1.75, Math.max(0.15, Math.min(w / b.w, h / b.h)));
  stage.moveTo(left + pad + w / 2 - (b.x + b.w / 2) * stage.scale, pad + h / 2 - (b.y + b.h / 2) * stage.scale);
  stage.dispatchEvent('camera');
  fittedCamera = { x: stage.x, y: stage.y, scale: stage.scale };
  // The board stays hidden until it's first fitted, so it never flashes up at full size.
  document.body.classList.remove('board-pending');
}
// Keep it fitted when the window changes size, until someone pans or zooms.
window.addEventListener('resize', () => {
  if (fittedCamera && stage.x === fittedCamera.x && stage.y === fittedCamera.y && stage.scale === fittedCamera.scale) fitView();
});

/**
 * The context every tool and panel receives. Add shared helpers to
 * `actions` rather than reaching into other modules.
 */
/** The board's visible area, in world coordinates. */
function viewRect() {
  const r = stage.svgEl.getBoundingClientRect();
  const a = stage.toWorld(r.left, r.top);
  const b = stage.toWorld(r.right, r.bottom);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const ctx = {
  stage,
  store,
  ops,
  mapView,
  tools: null,
  ui: { activeLayerId: store.map.layers[0]?.id, editLabel: null },
  /** How the board looks, per browser: the dotted grid and the hover cards. */
  view: (() => { try { return { grid: true, hoverCards: true, ...JSON.parse(localStorage.getItem('dashi.mapper.view') ?? '{}') }; } catch { return { grid: true, hoverCards: true }; } })(),
  actions: {
    addActorAt(x, y, kind = 'actor') {
      const place = unproject(mapView.lens, x, y);
      const op = store.apply(ops.addActor({ place, kind, category: mapView.lens.defaultCategory, layerId: ctx.ui.activeLayerId }));
      mapView.select([op.id]);
      ctx.ui.editLabel(op.id);
    },
    /** Add an actor near the middle of what's on screen, in a free spot. */
    addActorInView(kind = 'actor', near) {
      const v = viewRect();
      const c = near ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      const taken = Object.values(mapView.world.actors);
      const free = (x, y) => taken.every((a) => Math.abs(a.x - x) > (a.w + ACTOR_SIZE.w) / 2 + 10 || Math.abs(a.y - y) > (a.h + ACTOR_SIZE.h) / 2 + 10);
      let spot = c;
      for (let i = 0, r = 0; i < 400 && !free(spot.x, spot.y); i++) {
        r = 30 + i * 6;
        const t = i * 2.4;
        spot = { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) * 0.6 };
      }
      ctx.actions.addActorAt(spot.x, spot.y, kind);
    },
    /** The lens region under a screen point (for highlighting while dragging a new actor in). */
    regionAtScreen(clientX, clientY) {
      const w = stage.toWorld(clientX, clientY);
      return regionAt(mapView.lens, unproject(mapView.lens, w.x, w.y))?.id ?? null;
    },
    /**
     * Lay the actors out evenly for this lens, each staying in its zone and
     * layer. The layout is kept for this lens only: every actor keeps its own
     * place, so the other lenses (and tidying again) still start from the
     * detail you gave it. One undo puts it back; Untidy drops it.
     */
    tidy() {
      const map = store.map;
      const groupOf = (id) => Object.values(map.groups ?? {}).find((g) => g.memberIds.includes(id))?.id ?? null;
      const actors = Object.values(mapView.world.actors).map((a) => ({ id: a.id, place: a.place, w: a.w, h: a.h }));
      if (!actors.length) return;
      store.apply(ops.arrange(mapView.lens.id, tidyPlaces(mapView.lens, actors, { groupOf })));
    },
    /** Back to where everyone was placed by hand, in this lens. */
    untidy() {
      if (store.map.arrangements?.[mapView.lens.id]) store.apply(ops.arrange(mapView.lens.id, null));
    },
    isTidied: () => !!store.map.arrangements?.[mapView.lens.id],
    /**
     * Ops to move actors to a layer, taking their connectors along: every
     * connector touching one of them that was on that actor's old layer.
     */
    actorsToLayerOps(actorIds, layerId) {
      const map = store.map;
      const base = map.layers[0]?.id;
      const moving = new Set(actorIds);
      const list = actorIds.map((id) => ops.updateActor(id, { layerId }));
      for (const c of Object.values(map.connectors)) {
        const ends = [c.from?.actorId, c.to?.actorId].filter((id) => moving.has(id));
        const travels = ends.some((id) => (map.actors[id].layerId ?? base) === (c.layerId ?? base));
        if (travels && (c.layerId ?? base) !== layerId) list.push(ops.updateConnector(c.id, { layerId }));
      }
      return list;
    },
    /** Move a group, its actors and their connectors onto a new layer named after it. */
    groupToLayer(groupId) {
      const map = store.map;
      const g = map.groups[groupId];
      if (!g) return;
      const layerId = uid('layer');
      const list = [
        ops.addLayer({ id: layerId, name: g.label || 'Group' }),
        ...ctx.actions.actorsToLayerOps(g.memberIds, layerId),
        ops.updateGroup(g.id, { layerId }),
      ];
      store.apply(ops.batch(list));
      ctx.ui.activeLayerId = layerId;
      mapView.select([]);
    },
    deleteSelection() {
      const items = mapView.selectedItems();
      if (!items.actorIds.length && !items.connectorIds.length && !items.groupIds.length) return;
      store.apply(ops.removeItems(store.map, items));
      mapView.select([]);
    },
    fitView,
    zoom(factor) {
      const r = stage.svgEl.getBoundingClientRect();
      stage.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
    },
    setView(patch) {
      Object.assign(ctx.view, patch);
      try { localStorage.setItem('dashi.mapper.view', JSON.stringify(ctx.view)); } catch { /* private window */ }
      paintGrid();
      if (ctx.hoverCard) ctx.hoverCard.enabled = ctx.view.hoverCards;
    },
    /** The library item holding this map's file copy, if there is one. */
    libraryCopy: () => (ctx.actions.hasLibrary() ? Object.values(loadLibrary().items).find((it) => it.mapId === mapId && it.kind === 'file') ?? null : null),
    groupSelection() {
      const { actorIds } = mapView.selectedItems();
      if (actorIds.length < 2) return;
      const op = store.apply(ops.addGroup({ label: 'New group', memberIds: actorIds, layerId: ctx.ui.activeLayerId }));
      mapView.select([op.id]);
    },
    ungroup(id) {
      store.apply(ops.removeGroup(id));
      mapView.select([]);
    },
    migrate: (map) => migrateMap(map, lenses),
    /** Replace this map's contents with a map from a file (keeps its name and place in the list). */
    replaceWith(map) {
      store.load({ ...map, id: mapId, name: index.maps[mapId].title });
      mapView.select([]);
      requestAnimationFrame(fitView);
    },
    /** Add a map from a file to this org, as a new map, and open it. */
    openAsNew(map, entry) {
      const created = createMapIn(index, { title: entry.title || 'Opened map', ownerId: currentUser(org)?.id, content: structuredClone(map) });
      if (entry.description) { index.maps[created.id].description = entry.description; saveDoc('maps', index); }
      saveDoc(mapDocName(mapId), store.map);
      location.hash = created.id;
    },
    openDetails() { if (mapView.selection.size) ItemDetails(ctx); },
    addLayer() {
      // Active first, so the layers list draws with the new one chosen.
      ctx.ui.activeLayerId = uid('layer');
      store.apply(ops.addLayer({ id: ctx.ui.activeLayerId, name: `Layer ${store.map.layers.length + 1}` }));
    },
    /** Make a new map in this org and open it. */
    newMap(title) {
      const entry = createMapIn(index, { title, ownerId: currentUser(org)?.id, lensId: store.map.lensId });
      saveDoc(mapDocName(mapId), store.map);
      location.hash = entry.id;
    },
    openMap(id) {
      saveDoc(mapDocName(mapId), store.map);
      location.hash = id;
    },
    /** Is the library on for this org (so maps can be kept there as files)? */
    hasLibrary: () => enabledPlugins(org).some((p) => p.id === 'library'),
    /**
     * Keep this map as a file in the library: a Dashi map file, tagged
     * "ecosystem map". Saving again replaces the file on the same item.
     */
    async saveToLibrary() {
      const entry = index.maps[mapId];
      const data = mapFile(store.map, { entry, org });
      const file = new File([JSON.stringify(data, null, 2)], fileName(entry.title), { type: 'application/json' });
      const mediaId = await putMedia(file, { kind: 'document' });
      const lib = loadLibrary();
      const existing = Object.values(lib.items).find((it) => it.mapId === mapId && it.kind === 'file');
      const stamp = Date.now();
      const info = { mediaId, name: file.name, size: file.size, type: 'application/json' };
      if (existing) Object.assign(existing, { file: info, updatedAt: stamp, meta: { ...existing.meta, title: entry.title, abstract: entry.description ?? existing.meta.abstract } });
      else {
        const id = uid('doc');
        lib.items[id] = {
          id, kind: 'file', mapId, folderId: null, tags: ['ecosystem map'], file: info,
          meta: { type: 'dataset', title: entry.title, creators: [], issued: new Date().toISOString().slice(0, 10), keywords: [], language: 'en', abstract: entry.description ?? '', publisher: org.name },
          createdAt: stamp, updatedAt: stamp, createdBy: currentUser(org)?.id ?? null,
        };
      }
      saveDoc('library', lib);
      return existing ? 'replaced' : 'added';
    },
    /** Change the map's title, description, owner or members. */
    updateEntry(patch) {
      Object.assign(index.maps[mapId], patch, { updatedAt: new Date().toISOString().slice(0, 10) });
      saveDoc('maps', index);
      if (patch.title) store.map.name = patch.title;
    },
  },
  org,
  index,
  get mapId() { return mapId; },
};

ctx.tools = new ToolRegistry(ctx).register(SelectTool).register(ConnectTool).register(PanTool).register(DataVizTool);
ctx.ui.editLabel = LabelEditor(ctx);

// One panel down the side of the board, in folding sections: Tools, Layers, Inspector and Maps.
const toolsEl = h('div');
const layersEl = h('div', { class: 'side-layers' });
const inspectorEl = h('div');
const mapsEl = h('ul', { class: 'menu side-menu dock-maps' });
const drawMaps = () => mapsEl.replaceChildren(...Object.values(index.maps).map((m) =>
  h('li', {}, h('a', { href: `#${m.id}`, class: m.id === mapId ? 'menu-active' : null, title: m.description || m.title }, m.title))));
drawMaps();
document.addEventListener('dashi:map-renamed', drawMaps);
const main = document.querySelector('main');
ctx.panel = MapperPanel(main, [
  { id: 'tools', title: 'Tools', icon: 'select', body: toolsEl },
  { id: 'layers', title: 'Layers', icon: 'layers', body: layersEl, action: { label: 'Add layer', onclick: () => ctx.actions.addLayer() } },
  { id: 'inspector', title: 'Inspector', icon: 'notePencil', body: inspectorEl },
  { id: 'maps', title: 'Maps', icon: 'mapTrifold', body: mapsEl, open: false,
    action: { label: 'New map', onclick: async () => { const title = await uiPrompt('Name', 'Untitled map', { title: 'New ecosystem map', ok: 'Create map' }); if (title?.trim()) ctx.actions.newMap(title.trim()); } } },
], { key: 'dashi.mapper.panel.v2' });
Toolbar(toolsEl, ctx);
ctx.inspector = InspectorPanel(inspectorEl, ctx);
TopBar(document.querySelector('#topbar'), ctx);
LayersPanel(layersEl, ctx);
SelectionBar(main, ctx);
ctx.hoverCard = HoverCard(ctx);
ctx.hoverCard.enabled = ctx.view.hoverCards;
Tooltips('#topbar, .mapper-panel, .selection-bar');

// The dotted grid moves and scales with the board.
function paintGrid() {
  const el = stage.svgEl;
  el.classList.toggle('dotted', !!ctx.view.grid);
  if (!ctx.view.grid) return;
  let step = 28 * stage.scale;
  while (step < 14) step *= 2;
  el.style.backgroundSize = `${step}px ${step}px`;
  el.style.backgroundPosition = `${stage.x % step}px ${stage.y % step}px`;
}
stage.addEventListener('camera', paintGrid);
// Far out, notes show only their names, large; close in, the full note.
const FAR_BELOW = 0.62;
stage.addEventListener('camera', () => stage.svgEl.classList.toggle('far', stage.scale < FAR_BELOW));
paintGrid();

ctx.tools.use('select');
mapView.sync();
fitView();
setTimeout(() => document.body.classList.remove('board-pending'), 800);
// Fonts and the panel can still shift things on the first frames: fit again once they settle.
requestAnimationFrame(() => requestAnimationFrame(() => { if (!fittedCamera || (stage.x === fittedCamera.x && stage.y === fittedCamera.y && stage.scale === fittedCamera.scale)) fitView(); }));
document.fonts?.ready.then(() => { if (fittedCamera && stage.x === fittedCamera.x && stage.y === fittedCamera.y && stage.scale === fittedCamera.scale) fitView(); });
autosaveDoc(mapDocName(mapId), store);
// The map's name and its title in the org's list of maps stay the same.
store.map.name = index.maps[mapId].title;
store.addEventListener('change', () => {
  if (store.map.name && store.map.name !== index.maps[mapId].title) ctx.actions.updateEntry({ title: store.map.name });
});

// Where the pointer last was on the board, so A adds an actor there.
let pointer = null;
stage.svgEl.addEventListener('pointermove', (e) => { pointer = stage.toWorld(e.clientX, e.clientY); });
stage.svgEl.addEventListener('pointerleave', () => { pointer = null; });

// Hold Space to pan with any tool, FigJam-style.
let toolBeforeSpace = null;
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && toolBeforeSpace) {
    ctx.tools.use(toolBeforeSpace);
    toolBeforeSpace = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === ' ') {
    e.preventDefault();
    if (!toolBeforeSpace && ctx.tools.active.id !== 'pan') {
      toolBeforeSpace = ctx.tools.active.id;
      ctx.tools.use('pan');
    }
    return;
  }
  if (e.key.toLowerCase() === 'f' && !mod) {
    fitView();
    return;
  }
  if (e.key === '\\' && !mod) {
    ctx.panel.collapse();
    return;
  }
  if ((e.key === '+' || e.key === '=') && !mod) { ctx.actions.zoom(1.2); return; }
  if ((e.key === '-' || e.key === '_') && !mod) { ctx.actions.zoom(1 / 1.2); return; }
  if (e.key.toLowerCase() === 'a' && !mod && !e.altKey) {
    ctx.actions.addActorInView(e.shiftKey ? 'agent' : 'actor', pointer);
    e.preventDefault();
    return;
  }
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  } else if (mod && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    ctx.actions.groupSelection();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
  } else if (e.key === 'Enter' && mapView.selection.size && e.shiftKey) {
    e.preventDefault();
    ctx.panel.reveal('inspector');
    ctx.inspector.focusName();
  } else if (e.key === 'Enter' && mapView.selection.size) {
    e.preventDefault();
    ctx.actions.openDetails();
  } else if (e.key === 'Escape') {
    mapView.select([]);
    ctx.tools.use('select');
  } else if (ctx.tools.handleKey(e)) {
    e.preventDefault();
  }
});

// Opened from the library: read the map file, then open it as a new map or in place of this one.
if (openFromLibrary) {
  history.replaceState(null, '', `#${mapId}`);
  (async () => {
    try {
      const item = loadLibrary().items[openFromLibrary];
      if (!item?.file) throw new Error('that map file isn’t in the library any more');
      const url = await mediaUrl(item.file.mediaId);
      if (!url) throw new Error('the file is no longer stored');
      const { map, entry } = parseMapFile(await (await fetch(url)).text());
      OpenChoice(ctx, ctx.actions.migrate(map), { ...entry, title: entry.title || item.meta.title });
    } catch (err) {
      toast(`Couldn’t open that map file: ${err.message}`, 'error');
    }
  })();
}

// Handy for poking at things from the browser console.
window.mapper = ctx;
