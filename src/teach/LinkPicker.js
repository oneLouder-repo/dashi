import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { gatherAssets, blankAssets } from '../platform/assetHub.js';
import { linkTo } from '../plugins.js';
import { LAB_EXPERIMENTS } from '../rhizome/labList.js';

/**
 * Linking things into a cartridge block (d, 2026-11-27): one picker over what the org already has,
 * the same things the Asset manager shows (stories, files, links, notes, ecosystem maps and actors,
 * library documents, podcast episodes and studio audio), plus slideshows, the strategy (plans,
 * objectives, work) and Rhizome Lab: its experiments and the org's saved console patches, so a course
 * can teach with them. A block keeps what's linked as its manifest, `b.assets`:
 *
 *   b.assets = [{ key, title, kind, icon, href }]   key = the Asset manager's key (assetHub keyOf),
 *                                                    'node:<id>' for strategy, title kept in case it goes
 *
 *   linkables(docs, plugins)  → [{ key, title, kind, icon, href, sub, group }]
 *   openLinkPicker({ items, current: () => Set(keys), onPick(item), only: [groups], single, start: group, title })
 */
export const GROUPS = [
  { id: 'show', label: 'Slideshows and episodes', icon: 'music' },
  { id: 'asset', label: 'Assets', icon: 'sec-assets' },
  { id: 'doc', label: 'Documents', icon: 'book' },
  { id: 'map', label: 'Ecosystem maps', icon: 'sec-mapper' },
  { id: 'plan', label: 'Strategy and work', icon: 'strategy' },
  { id: 'lab', label: 'Rhizome Lab', icon: 'flask' },
];
const NODE_WORD = { framework: 'Framework', plan: 'Plan', goal: 'Goal', objective: 'Objective', strategy: 'Strategy', workplan: 'Work plan', task: 'Task', activity: 'Activity', outcome: 'Outcome' };

export function linkables(docs, plugins) {
  const cards = gatherAssets(docs.assets ?? blankAssets(), docs, { plugins });
  const out = [];
  for (const c of cards) {
    if (c.missing || c.source === 'staff') continue;
    const slides = c.source === 'episode' && docs.podcasts?.episodes?.[c.ref?.id]?.slides?.length;
    const group = c.source === 'episode' || c.source === 'audio' ? 'show' : c.source === 'map' || c.source === 'actor' ? 'map' : c.source === 'library' ? 'doc' : 'asset';
    out.push({ key: c.key, title: c.title, kind: slides ? 'Slideshow' : c.kindLabel, icon: slides ? 'image' : c.icon, href: c.href ?? null, sub: c.sub ?? c.description?.slice(0, 80) ?? '', group, ref: c.ref ?? null });
  }
  if (!plugins || plugins.has('strategy')) {
    for (const nd of Object.values(docs.strategy?.nodes ?? {})) {
      if (!nd?.title || nd.type === 'framework') continue;
      out.push({ key: `node:${nd.id}`, title: nd.title, kind: NODE_WORD[nd.type] ?? 'Strategy', icon: 'strategy', href: linkTo('strategy', `#${nd.id}`), sub: nd.description?.slice(0, 80) ?? '', group: 'plan' });
    }
  }
  // Rhizome Lab: each experiment, and each saved console patch (it opens in the console, ready to run).
  if ((!plugins || plugins.has('rhizome')) && linkTo('rhizome')) {
    for (const x of LAB_EXPERIMENTS) out.push({ key: `lab:${x.id}`, title: x.name, kind: 'Lab experiment', icon: x.icon, href: linkTo('rhizome', x.href ?? `#lab/${x.id}`), sub: x.line, group: 'lab' });
    for (const p of Object.values(docs.rhizome?.labPatches ?? {})) out.push({ key: `labpatch:${p.id}`, title: p.name, kind: 'Lab patch', icon: 'code', href: linkTo('rhizome', `#lab/console?run=${encodeURIComponent(p.cmd)}`), sub: p.note || p.cmd, group: 'lab' });
  }
  return out;
}

/** What a manifest entry keeps: enough to show it even if the thing is later removed. */
export const manifestEntry = (it) => ({ key: it.key, title: it.title, kind: it.kind, icon: it.icon, href: it.href ?? null });

export function openLinkPicker({ items, current = () => new Set(), onPick, only = null, single = false, start = null, title = 'Link things to this block' }) {
  const pool = only ? items.filter((it) => only.includes(it.group)) : items;
  const groups = GROUPS.filter((g) => pool.some((it) => it.group === g.id));
  let group = (groups.some((g) => g.id === start) ? start : groups[0]?.id) ?? null;
  let query = '';
  const dialog = h('dialog', { class: 'chooser tc-linker', 'aria-label': title });
  const list = h('div', { class: 'tc-linker-list', role: 'list' });
  const status = h('span', { class: 'chooser-status', role: 'status' });
  const tabs = h('div', { class: 'tc-linker-tabs', role: 'tablist' });
  const find = h('input', { type: 'search', class: 'input input-sm', placeholder: 'Search everything', 'aria-label': 'Search', oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); } });
  const draw = () => {
    tabs.replaceChildren(...groups.map((g) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(!query && g.id === group), class: !query && g.id === group ? 'on' : '', onclick: () => { group = g.id; query = ''; find.value = ''; draw(); } },
      icon(g.icon, 15), h('span', {}, g.label), h('small', {}, String(pool.filter((it) => it.group === g.id).length)))));
    const used = current();
    const shown = (query ? pool.filter((it) => `${it.title} ${it.kind} ${it.sub ?? ''}`.toLowerCase().includes(query)) : pool.filter((it) => it.group === group)).slice(0, 300);
    list.replaceChildren(...(shown.length ? shown.map((it) => {
      const on = used.has(it.key);
      return h('div', { class: `tc-linker-row${on ? ' on' : ''}`, role: 'listitem' },
        h('span', { class: 'tc-linker-ic' }, icon(it.icon ?? 'file', 16)),
        h('span', { class: 'tc-linker-text' }, h('b', {}, it.title), h('small', {}, [it.kind, it.sub].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: `btn btn-xs${on ? ' btn-ghost' : ' btn-primary'}`, disabled: on && !single, onclick: () => {
          onPick(it);
          if (single) { dialog.close(); return; }
          status.textContent = `Linked “${it.title}”.`;
          draw();
        } }, on ? (single ? 'Linked now' : 'Linked') : single ? 'Use this' : 'Link'));
    }) : [h('p', { class: 'empty' }, query ? 'Nothing matches.' : 'Nothing here yet.')]));
  };
  dialog.append(
    h('div', { class: 'chooser-head' }, h('h2', {}, title), h('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-square', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('close', 16))),
    h('div', { class: 'tc-linker-body' }, h('div', { class: 'tc-linker-side' }, find, tabs), h('div', { class: 'tc-linker-main' }, list)),
    h('div', { class: 'chooser-foot' }, status, h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => dialog.close() }, 'Done')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  draw();
  dialog.showModal();
  find.focus();
}
