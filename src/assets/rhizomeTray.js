/**
 * The Rhizome tools tray in the asset manager (alpha 0.4). The asset graph
 * moved out of Assets into Rhizome; this tray keeps its tools a click away
 * without leaving the assets: a graph search, the most connected assets,
 * the feedback loops on your maps, assets nothing links to, the ABCD
 * balance, and the way into Rhizome's Report and Tips.
 *
 * It works out everything here, from documents Assets already reads (the
 * graph reads the same ones), and never reads or writes Rhizome's own
 * settings. Each link goes through linkTo, so someone without Rhizome, or
 * without its Graph, doesn't see those parts.
 *
 *   openRhizomeTray({ docs, hub, plugins, onFilter })
 *     docs = { org, maps, mapContents, library, podcasts, strategy }
 *     onFilter(hash) narrows the asset list behind the tray ('#abcd=none')
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Drawer } from '../ui/drawer.js';
import { linkTo } from '../plugins.js';
import { ABCD } from '../platform/assetHub.js';
import { buildGraph, defaultGraphSettings } from '../platform/graph.js';
import { adjacency, pageRank, findLoops } from '../platform/graphAlgo.js';

/** The numbers the tray shows, worked out from the documents. Pure, for tests. */
export function trayFacts(docs, hub, plugins) {
  const g = buildGraph({ ...docs, assets: hub }, defaultGraphSettings(), { plugins });
  const adj = adjacency(g);
  const pr = pageRank(g, { adj });
  const assets = Object.values(g.nodes).filter((n) => n.kind === 'asset');
  const top = [...assets].sort((a, b) => (pr[b.iri] ?? 0) - (pr[a.iri] ?? 0)).slice(0, 5);
  // An asset's only ties are weak ones (made by, on a map): nothing says anything about it yet.
  const lonely = assets.filter((a) => !(adj.get(a.iri)?.size));
  const abcd = Object.fromEntries(ABCD.map((a) => [a.id, 0]));
  let unsorted = 0;
  // The balance counts everything with an ABCD type (people, groups, places too), as the graph's Insights do.
  for (const n of Object.values(g.nodes)) if (n.abcd && n.abcd in abcd) abcd[n.abcd] += 1;
  for (const a of assets) if (!a.abcd) unsorted += 1;
  const { loops, almost } = findLoops(g);
  return { things: Object.keys(g.nodes).length, links: g.edges.filter((e) => !e.weak).length, assets: assets.length, top, lonely, abcd, unsorted, loops: loops.length, almost: almost.length };
}

export function openRhizomeTray({ docs, hub, plugins, onFilter }) {
  const rz = (route) => linkTo('rhizome', route);
  const gr = (route) => linkTo('graph', route);
  const f = trayFacts(docs, hub, plugins);
  const go = (href) => { if (href) location.href = href; };
  const sections = [];

  if (gr('')) {
    const input = h('input', { class: 'input input-sm rt-search', type: 'search', placeholder: 'A name, or “Libraries to Arts council”', 'aria-label': 'Search the graph', name: 'rt-q', autocomplete: 'off' });
    const form = h('form', { class: 'rt-form', onsubmit: (e) => { e.preventDefault(); const q = input.value.trim(); go(gr(q ? `#explore/${encodeURIComponent(q)}` : '#explore')); } },
      icon('search', 15), input, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Search'));
    sections.push(h('section', { class: 'rt-sec' },
      h('h3', {}, icon('sec-graph', 15), 'Graph'),
      h('p', { class: 'rt-note' }, `${f.things.toLocaleString()} things and ${f.links.toLocaleString()} links: your assets, people, maps and plan as one web.`),
      form,
      h('div', { class: 'rt-chips' },
        [['Most connected', 'most connected', 'chart'], ['Who bridges groups', 'bridges', 'share'], ['Islands', 'islands', 'circlesThree']].map(([label, q, ic]) =>
          h('a', { class: 'rt-chip', href: gr(`#explore/${encodeURIComponent(q)}`) }, icon(ic, 13), label))),
      f.top.length > 0 && h('div', { class: 'rt-block' },
        h('h4', {}, 'Your most connected assets'),
        h('ol', { class: 'rt-list' }, f.top.map((n) => h('li', {}, h('a', { href: gr(`#explore/${encodeURIComponent(`@${n.iri}`)}`) }, n.label))))),
      h('a', { class: 'rt-row', href: gr('#loops') },
        h('strong', {}, String(f.loops)), h('span', {}, f.loops === 1 ? 'feedback loop on your maps' : 'feedback loops on your maps', h('small', {}, `${f.almost} more are one link short`)), icon('chevronRight', 14))));
  }

  sections.push(h('section', { class: 'rt-sec' },
    h('h3', {}, icon('dots', 15), 'Asset checks'),
    h('button', { type: 'button', class: 'rt-row', onclick: () => { d.close(); onFilter('#abcd=none'); } },
      h('strong', {}, String(f.unsorted)), h('span', {}, 'not sorted through the ABCD lens yet', h('small', {}, 'Show them in the list')), icon('chevronRight', 14)),
    gr('') && h('a', { class: 'rt-row', href: gr('#explore/islands') },
      h('strong', {}, String(f.lonely.length)), h('span', {}, 'linked to nothing yet', h('small', {}, 'No tag, collection, plan or other asset ties them in')), icon('chevronRight', 14)),
    h('div', { class: 'rt-block' },
      h('h4', {}, 'ABCD balance'),
      h('ul', { class: 'rt-abcd' }, ABCD.map((a) => {
        const max = Math.max(1, ...Object.values(f.abcd));
        return h('li', {}, h('button', { type: 'button', onclick: () => { d.close(); onFilter(`#abcd=${a.id}`); }, title: a.hint },
          h('span', {}, a.label), h('i', { style: `--w:${Math.round((100 * f.abcd[a.id]) / max)}%;--c:${a.color}` }), h('b', {}, String(f.abcd[a.id]))));
      })))));

  if (rz('')) {
    sections.push(h('section', { class: 'rt-sec' },
      h('h3', {}, icon('sec-rhizome', 15), 'Rhizome'),
      h('a', { class: 'rt-link', href: rz('#report') }, icon('file', 16), h('span', {}, h('b', {}, 'Report'), h('small', {}, 'Everything Rhizome found, with its tips, to print or save as a PDF'))),
      h('a', { class: 'rt-link', href: rz('#tips') }, icon('book', 16), h('span', {}, h('b', {}, 'Tips'), h('small', {}, 'The tip library and reading list'))),
      h('a', { class: 'rt-link', href: rz('#analyses') }, icon('spark', 16), h('span', {}, h('b', {}, 'Analyses'), h('small', {}, 'Canned analyses across maps, plan and assets'))),
      h('a', { class: 'rt-link', href: rz('#home') }, icon('home', 16), h('span', {}, h('b', {}, 'Signals'), h('small', {}, 'What changed since the baseline')))));
  }

  const d = Drawer({ title: 'Rhizome tools', sub: 'Graph tools, checks and the report, for your assets', lead: icon('sec-rhizome', 20), body: h('div', { class: 'rt' }, sections) });
  return d;
}
