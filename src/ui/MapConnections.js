import { h } from './dom.js';
import { icon } from './icons.js';
import { uid } from '../core/ops.js';
import { uiPanel } from './dialog.js';
import { toast } from './toast.js';
import { loadStrategy, loadAssets, saveDoc } from '../platform/docs.js';
import { NODE_TYPES } from '../platform/strategy.js';
import { ensureItem, keyOf, logActivity } from '../platform/assetHub.js';
import { currentUser } from '../platform/session.js';

/**
 * How a map works with Dashi's other tools, behind the mapper's Connect
 * menu: tie the map (or one of its actors) to strategy workplans and tasks
 * as an asset, file it in an Asset manager collection, and see where it is
 * already used.
 */

/** Strategy workplans and tasks that use this map, or one of its actors. */
export function strategyUses(mapId) {
  const doc = loadStrategy();
  const out = [];
  for (const n of Object.values(doc.nodes)) {
    for (const a of n.assets ?? []) {
      if ((a.kind === 'map' && a.ref === mapId) || (a.kind === 'actor' && a.mapId === mapId)) out.push({ node: n, asset: a });
    }
  }
  return out;
}

/** Pick workplans or tasks to tie this map (or an actor on it) to. */
export async function linkToStrategy(ctx, { actor = null } = {}) {
  const doc = loadStrategy();
  const entry = ctx.index.maps[ctx.mapId];
  const asset = actor
    ? { kind: 'actor', ref: actor.id, mapId: ctx.mapId, label: actor.label || 'Untitled' }
    : { kind: 'map', ref: ctx.mapId, label: entry.title };
  const has = (n) => (n.assets ?? []).some((a) => a.kind === asset.kind && a.ref === asset.ref);
  const nodes = Object.values(doc.nodes).filter((n) => n.type === 'workplan' || n.type === 'task');
  let query = '';
  let changed = 0;
  const list = h('ul', { class: 'pick-list' });
  const draw = () => {
    const q = query.toLowerCase();
    const parentTitle = (n) => doc.nodes[n.parentId]?.title ?? '';
    const shown = nodes.filter((n) => !q || `${n.title} ${parentTitle(n)}`.toLowerCase().includes(q)).slice(0, 60);
    list.replaceChildren(...(shown.length ? shown.map((n) => h('li', {},
      h('button', { type: 'button', class: `pick-row${has(n) ? ' on' : ''}`, 'aria-pressed': String(has(n)), onclick: () => {
        n.assets ??= [];
        if (has(n)) n.assets = n.assets.filter((a) => !(a.kind === asset.kind && a.ref === asset.ref));
        else n.assets.push({ id: uid('as'), ...asset });
        changed += 1;
        saveDoc('strategy', doc);
        draw();
      } },
      h('span', { class: 'pick-glyph' }, NODE_TYPES[n.type].glyph),
      h('span', { class: 'pick-text' }, h('strong', {}, n.title || 'Untitled'), h('small', {}, `${NODE_TYPES[n.type].label}${parentTitle(n) ? ` · ${parentTitle(n)}` : ''}`)),
      h('span', { class: 'pick-state' }, has(n) ? [icon('check', 14), ' Linked'] : 'Link')))) : [h('li', { class: 'muted' }, nodes.length ? 'Nothing matches.' : 'There are no workplans or tasks yet. Make some in Strategy & Work.')]));
  };
  draw();
  await uiPanel({
    title: actor ? `Use “${asset.label}” in your strategy` : 'Use this map in your strategy',
    message: 'Linked workplans and tasks list it among their assets, and stay in step if it’s renamed.',
    build: () => h('div', { class: 'pick' },
      h('input', { class: 'input input-sm w-full', type: 'search', placeholder: 'Find a workplan or task', oninput: (e) => { query = e.target.value; draw(); } }),
      list),
  });
  if (changed) toast('Strategy links updated');
}

/** File the map (or an actor) in a collection in the Asset manager. */
export async function addToAssets(ctx, { actor = null } = {}) {
  const hub = loadAssets();
  const by = currentUser(ctx.org)?.id ?? null;
  const ref = actor ? { type: 'actor', id: actor.id, mapId: ctx.mapId } : { type: 'map', id: ctx.mapId };
  const title = actor ? actor.label || 'Untitled' : ctx.index.maps[ctx.mapId].title;
  const key = keyOf(ref);
  const card = { ref, title, item: Object.values(hub.items).find((it) => it.kind === 'ref' && it.ref && keyOf(it.ref) === key) ?? null };
  const collections = Object.values(hub.collections).sort((a, b) => a.name.localeCompare(b.name));
  let newName = '';
  const item = ensureItem(hub, card, by);
  const chosen = new Set(item.collectionIds);
  const list = h('ul', { class: 'pick-list' }, collections.map((c) => h('li', {},
    h('label', { class: 'pick-row' },
      h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: chosen.has(c.id), onchange: (e) => (e.target.checked ? chosen.add(c.id) : chosen.delete(c.id)) }),
      h('span', { class: 'pick-dot', style: `background:${c.color ?? '#999'}` }),
      h('span', { class: 'pick-text' }, h('strong', {}, c.name))))));
  const ok = await uiPanel({
    title: `Add “${title}” to Assets`, ok: 'Save', cancel: 'Cancel',
    message: 'It stays here, live: the Asset manager shows it in the collections you pick, beside the org’s files, people and stories.',
    build: (close) => { close(true); return h('div', { class: 'pick' },
      collections.length ? list : h('p', { class: 'muted' }, 'No collections yet. Name one to start.'),
      h('label', { class: 'dui-field' }, h('span', { class: 'dui-label' }, 'New collection'), h('input', { class: 'input input-sm w-full', placeholder: 'e.g. Partners in the north', oninput: (e) => { newName = e.target.value; } }))); },
  });
  if (!ok) return;
  if (newName.trim()) {
    const id = uid('coll');
    hub.collections[id] = { id, name: newName.trim(), color: '#3e8fa6', parentId: null, createdAt: new Date().toISOString(), createdBy: by };
    chosen.add(id);
  }
  item.collectionIds = [...chosen];
  item.updatedAt = new Date().toISOString();
  item.updatedBy = by;
  logActivity(hub, by, `filed “${title}”`, key);
  saveDoc('assets', hub);
  toast(chosen.size ? `In ${chosen.size} collection${chosen.size === 1 ? '' : 's'} in Assets` : 'Saved to Assets');
}
