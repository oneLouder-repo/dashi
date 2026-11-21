import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { loadD3 } from '../ui/Sunburst.js';
import { uiConfirm, uiPrompt } from '../ui/dialog.js';
import { saveDoc, session, canWriteDoc } from '../platform/storage.js';
import { loadOrg, loadAssets, loadMaps, loadLibrary, loadPodcasts, loadStrategy, loadGraphSettings } from '../platform/docs.js';
import { loadAllMaps } from '../platform/maps.js';
import { ABCD, abcdById } from '../platform/assetHub.js';
import { VOCABS, ABCD_CLASSES, CLASS_CHOICES, NODE_KINDS, defaultGraphSettings, buildGraph, EXPORTS, toTurtle } from '../platform/graph.js';
import { adjacency, pageRank, betweenness, communities, components, ask, around, findNodes, ASK_CHIPS } from '../platform/graphAlgo.js';
import { enabledPlugins, linkTo } from '../plugins.js';

/**
 * The asset graph (alpha 0.2, PR 7, experimental): a sub-plugin of Assets.
 * Everything the org knows, as one web of linked facts.
 *
 *   #explore[/<question>]   graph search: a name unfolds its network ring by ring,
 *                           "A to B" finds the way between two things, chips ask the rest
 *   #explore/@<iri>         the network around one thing (a click on the graph)
 *   #insights               most connected, bridges, clusters, islands, ABCD balance
 *   #ontology               which vocabularies the graph speaks, and the class of each ABCD type
 *   #export                 Turtle, JSON-LD and N-Triples, and read-only API keys
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'graph', org });
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const app = document.querySelector('#app');
app.classList.add('frame', 'graph-app');
let side = h('nav');
const main = h('section', { class: 'palette-main graph-main' });
app.replaceChildren(side, main);

let settings = loadGraphSettings();
const canSet = canWriteDoc('graph');
function loadDocs() {
  const maps = plugins.has('mapper') ? loadMaps() : null;
  return {
    org, maps, mapContents: maps ? loadAllMaps(maps) : {},
    library: plugins.has('library') ? loadLibrary() : null,
    podcasts: plugins.has('podcasts') ? loadPodcasts() : null,
    strategy: plugins.has('strategy') ? loadStrategy() : null,
    assets: loadAssets(),
  };
}
const docs = loadDocs();
let g = null;
let adj = null;
let stats = null;
function rebuild() {
  g = buildGraph(docs, settings, { plugins });
  adj = adjacency(g);
  stats = null;
}
rebuild();
/** The insights, worked out once per graph. */
function insights() {
  if (stats) return stats;
  const pr = pageRank(g, { adj });
  const bc = betweenness(g, { adj });
  const cm = communities(g, { adj });
  stats = { pr, bc, cm, comps: components(g, { adj }) };
  return stats;
}

const n = (count, word, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;
const route = () => {
  const raw = location.hash.slice(1) || 'explore';
  const i = raw.indexOf('/');
  return i < 0 ? [raw, ''] : [raw.slice(0, i), decodeURIComponent(raw.slice(i + 1))];
};
const exploreHref = (q) => `#explore/${encodeURIComponent(q)}`;
const kindOf = (node) => NODE_KINDS[node?.kind] ?? NODE_KINDS.asset;
const colourOf = (node) => (node?.abcd && abcdById[node.abcd]?.color) || kindOf(node).color;


function render() {
  const [view, arg] = route();
  drawSide(view);
  const scroll = main.scrollTop;
  let page;
  if (view === 'insights') page = Insights();
  else if (view === 'ontology') page = Ontology();
  else if (view === 'export') page = Export();
  else page = Explore(arg);
  main.replaceChildren(page);
  if (view !== 'explore') main.scrollTop = scroll;
}

function drawSide(view) {
  const nodes = Object.values(g.nodes);
  side = swapSide(side, SideNav({ label: 'Assets', sections: [
    { title: 'Assets', items: [
      { label: 'All assets', sub: 'Files, maps, people, stories and places', icon: 'dots', href: linkTo('assets') },
      { label: 'Asset map', sub: 'Seen through the ABCD lens', icon: 'mapTrifold', href: linkTo('assets', '#view=map') },
    ] },
    { title: 'Asset graph · experimental', items: [
      { label: 'Graph search', sub: `${n(nodes.length, 'thing')} · ${n(g.edges.length, 'link')}`, icon: 'search', href: '#explore', on: view === 'explore' },
      { label: 'Insights', sub: 'Hubs, bridges, clusters, islands', icon: 'lightbulb', href: '#insights', on: view === 'insights' },
      { label: 'Ontology', sub: `${VOCABS.filter((v) => v.core || settings.vocabs[v.prefix] !== false).length} vocabularies in use`, icon: 'tree', href: '#ontology', on: view === 'ontology' },
      { label: 'Export and API', sub: `${n(g.triples.length, 'fact')} as linked data`, icon: 'export', href: '#export', on: view === 'export' },
    ] },
  ] }));
}

const tabs = (current) => PluginHeader('graph', {
  title: 'Asset graph',
  blurb: 'Experimental. Your assets, people, maps and strategy as one web of linked facts, in the words the web already uses (schema.org, FOAF, SKOS, PROV) and ABCD’s.',
  tabs: [
    { id: 'explore', label: 'Graph search', icon: 'search' },
    { id: 'insights', label: 'Insights', icon: 'lightbulb' },
    { id: 'ontology', label: 'Ontology', icon: 'tree' },
    { id: 'export', label: 'Export and API', icon: 'export' },
  ],
  current,
});

/* --------------------------------------------------------------- explore */

/** Positions survive between questions, so the graph moves, not jumps. */
const pos = new Map();
let zoomT = null;

function resultFor(arg) {
  if (!arg) return null;
  if (arg.startsWith('@')) return around(g, arg.slice(1), { adj });
  return ask(g, arg, { adj });
}

function Explore(arg) {
  setCrumbs(arg ? [{ label: arg.startsWith('@') ? (g.nodes[arg.slice(1)]?.label ?? 'Around one thing') : arg }] : []);
  const result = resultFor(arg);
  const input = h('input', { class: 'input gx-input', type: 'search', placeholder: 'Type a name, or “CIFAR to Apple”…', value: arg.startsWith('@') ? (g.nodes[arg.slice(1)]?.label ?? '') : arg, 'aria-label': 'Search the graph', autocomplete: 'off' });
  const suggest = h('ul', { class: 'gx-suggest', role: 'listbox', hidden: true });
  const go = (q) => { suggest.hidden = true; location.hash = q ? exploreHref(q) : '#explore'; };
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const hits = q.length > 1 && !/ to /i.test(q) ? findNodes(g, q, { limit: 6 }) : [];
    suggest.replaceChildren(...hits.map((iri) => h('li', {},
      h('button', { type: 'button', onclick: () => go(`@${iri}`) },
        h('span', { class: 'gx-dot', style: `--c:${colourOf(g.nodes[iri])}` }),
        h('span', {}, g.nodes[iri].label),
        h('small', {}, kindOf(g.nodes[iri]).label)))));
    suggest.hidden = !hits.length;
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(input.value.trim()); if (e.key === 'Escape') suggest.hidden = true; });
  input.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 150));

  const chips = h('div', { class: 'gx-chips' },
    ASK_CHIPS.map((c) => h('a', { class: `gx-chip${arg === c.q ? ' on' : ''}`, href: exploreHref(c.q) }, icon(c.icon, 14), c.label)),
    arg && h('a', { class: 'gx-chip ghost', href: '#explore' }, icon('close', 13), 'Clear'));

  const stage = h('div', { class: 'gx-stage' });
  const panel = h('aside', { class: 'gx-panel' }, Panel(result));
  const wrap = h('div', { class: 'graph-explore' },
    tabs('explore'),
    h('div', { class: 'gx-search' }, h('div', { class: 'gx-field' }, icon('search', 16), input, suggest), chips),
    h('div', { class: 'gx-body' }, stage, panel));
  requestAnimationFrame(() => drawGraph(stage, result));
  return wrap;
}

/** What the question found, and the chosen thing's facts. */
function Panel(result) {
  if (!result) {
    const kinds = {};
    for (const nd of Object.values(g.nodes)) kinds[nd.kind] = (kinds[nd.kind] ?? 0) + 1;
    return [
      h('h2', {}, 'Ask the graph'),
      h('p', { class: 'gx-note' }, 'Type the name of a person, asset, actor or tag and watch its network unfold. Ask for the way between two things with “A to B”. Or try a suggestion.'),
      h('ul', { class: 'gx-tries' },
        ['most connected', 'bridges', 'islands'].map((q) => h('li', {}, h('a', { href: exploreHref(q) }, `“${q}”`))),
        pathExample() && h('li', {}, h('a', { href: exploreHref(pathExample()) }, `“${pathExample()}”`))),
      h('h3', {}, 'In the graph'),
      h('ul', { class: 'gx-kinds' }, Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, c]) => h('li', {},
        h('span', { class: 'gx-dot', style: `--c:${NODE_KINDS[k]?.color ?? '#888'}` }), NODE_KINDS[k]?.label ?? k, h('b', {}, c)))),
      h('p', { class: 'gx-foot' }, `${n(g.triples.length, 'fact')} in all.`),
    ];
  }
  const focus = result.focus ? g.nodes[result.focus] : null;
  const list = result.kind === 'groups' && result.groups
    ? result.groups.slice(0, 8).map((grp, i) => h('div', { class: 'gx-group' },
      h('div', { class: 'gx-group-head' }, h('span', { class: 'gx-dot', style: `--c:${GROUP_COLOURS[i % GROUP_COLOURS.length]}` }), n(grp.length, 'thing')),
      h('ul', { class: 'gx-list' }, grp.slice(0, 6).map((iri) => Row(iri)))))
    : h('ul', { class: 'gx-list' }, (result.kind === 'ego' ? result.rings.slice(1).flat() : result.nodes).slice(0, 14).map((iri, i) => Row(iri, result.kind === 'path' ? i + 1 : result.kind === 'rank' ? i + 1 : null)));
  return [
    h('h2', {}, result.title),
    result.note && h('p', { class: 'gx-note' }, result.note),
    focus && Facts(focus),
    result.kind !== 'none' && h('h3', {}, result.kind === 'ego' ? 'Linked to it' : result.kind === 'path' ? 'The way' : 'Found'),
    result.kind !== 'none' && list,
  ];
}
function pathExample() {
  const pr = insights().pr;
  const top = Object.keys(pr).filter((k) => !['org', 'map', 'concept', 'team'].includes(g.nodes[k].kind)).sort((a, b) => pr[b] - pr[a]);
  if (top.length < 6) return null;
  return `${short(g.nodes[top[0]].label)} to ${short(g.nodes[top[5]].label)}`;
}
const short = (s) => String(s).split(/[,(:–-]/)[0].trim().split(/\s+/).slice(0, 3).join(' ');

function Row(iri, num = null) {
  const nd = g.nodes[iri];
  if (!nd) return null;
  return h('li', {}, h('a', { href: exploreHref(`@${iri}`) },
    num != null ? h('span', { class: 'gx-num' }, num) : h('span', { class: 'gx-dot', style: `--c:${colourOf(nd)}` }),
    h('span', { class: 'gx-row-text' }, h('span', {}, nd.label), h('small', {}, [kindOf(nd).label, nd.abcd && abcdById[nd.abcd]?.label].filter(Boolean).join(' · ')))));
}

/** One thing as the graph knows it: what it is, its facts, and a way to open it. */
function Facts(nd) {
  const own = g.triples.filter(([s]) => s === nd.iri);
  const types = own.filter(([, p]) => p === 'rdf:type').map(([, , o]) => o);
  const lits = own.filter(([, , o]) => typeof o === 'object').slice(0, 6);
  return h('div', { class: 'gx-facts' },
    h('div', { class: 'gx-types' }, types.map((t) => h('code', {}, t))),
    lits.length > 0 && h('dl', {}, lits.flatMap(([, p, o]) => [h('dt', {}, p), h('dd', {}, String(o.v).slice(0, 140))])),
    h('div', { class: 'gx-fact-actions' },
      nd.href && h('a', { class: 'btn btn-xs', href: nd.href }, icon('chevronRight', 13), 'Open'),
      h('code', { class: 'gx-iri', title: 'This thing’s name in the graph' }, nd.iri)));
}

const GROUP_COLOURS = ['#e0705f', '#ef7f2d', '#4da65c', '#7b2fe8', '#2c4fa3', '#f4a93b', '#c8432f', '#3e8fa6', '#3e8fa6', '#6b55a8'];

async function drawGraph(stage, result) {
  const d3 = await loadD3();
  if (!stage.isConnected) return;
  const W = stage.clientWidth || 800;
  const H = stage.clientHeight || 560;
  // Around one thing, only its rings are drawn; otherwise the whole graph, with what was asked lit up.
  const pool = result?.kind === 'ego' ? result.nodes.map((k) => g.nodes[k]).filter(Boolean) : Object.values(g.nodes);
  const nodes = pool.map((nd) => ({ ...nd, ...(pos.get(nd.iri) ?? { x: W / 2 + (Math.random() - 0.5) * W * 0.6, y: H / 2 + (Math.random() - 0.5) * H * 0.6 }) }));
  const byId = new Map(nodes.map((nd) => [nd.iri, nd]));
  const links = g.edges.filter((e) => byId.has(e.s) && byId.has(e.o)).map((e) => ({ ...e, source: e.s, target: e.o }));
  // Each ring's place on its circle: the first ring evenly round, the second beside the thing in the first it hangs off.
  const angle = new Map();
  if (result?.kind === 'ego') {
    const r1 = result.rings[1] ?? [];
    r1.forEach((k, i) => angle.set(k, (2 * Math.PI * i) / Math.max(1, r1.length) - Math.PI / 2));
    const weakAdj = adjacency(g, { weak: true });
    const turn = (a) => (a + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI);
    const parentAngle = (k) => { for (const p of weakAdj.get(k) ?? []) if (r1.includes(p)) return turn(angle.get(p)); return 0; };
    const r2 = [...(result.rings[2] ?? [])].sort((a, b) => parentAngle(a) - parentAngle(b));
    r2.forEach((k, i) => angle.set(k, (2 * Math.PI * i) / Math.max(1, r2.length) - Math.PI / 2));
  }

  // What the question lights up.
  const lit = new Set(result?.nodes ?? []);
  const ring = new Map();
  (result?.rings ?? []).forEach((r, i) => r.forEach((k) => ring.set(k, i)));
  const pathSet = new Set(result?.path ?? []);
  const pathEdge = (l) => {
    const p = result?.path;
    if (!p) return false;
    const a = p.indexOf(l.s);
    const b = p.indexOf(l.o);
    return a >= 0 && b >= 0 && Math.abs(a - b) === 1;
  };
  const groupOf = new Map();
  (result?.groups ?? []).forEach((grp, i) => grp.forEach((k) => groupOf.set(k, i)));
  const score = result?.scores ?? null;
  const maxScore = score ? Math.max(...(result.nodes ?? []).map((k) => score[k] ?? 0), 1e-9) : 1;
  const focusing = !!result && result.kind !== 'none';
  const radius = (nd) => {
    if (score && lit.has(nd.iri)) return 6 + 12 * Math.sqrt((score[nd.iri] ?? 0) / maxScore);
    if (nd.iri === result?.focus) return 13;
    if (nd.kind === 'org') return 10;
    return 4 + Math.min(6, Math.sqrt(nd.degree ?? 0) * 1.4);
  };
  const shown = (nd) => !focusing || lit.has(nd.iri);
  const fill = (nd) => (groupOf.has(nd.iri) ? GROUP_COLOURS[groupOf.get(nd.iri) % GROUP_COLOURS.length] : colourOf(nd));

  const svg = d3.create('svg').attr('class', 'gx-svg').attr('viewBox', [0, 0, W, H]).attr('role', 'img').attr('aria-label', result ? `Graph: ${result.title}` : 'The asset graph');
  const root = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.3, 4]).on('zoom', (e) => { root.attr('transform', e.transform); zoomT = e.transform; });
  svg.call(zoom).on('dblclick.zoom', null);
  if (zoomT && !(result?.kind === 'ego' || result?.kind === 'path')) svg.call(zoom.transform, zoomT);
  else { zoomT = null; }

  const link = root.append('g').attr('class', 'gx-links').selectAll('line').data(links).join('line')
    .attr('class', (l) => [l.weak ? 'weak' : '', pathEdge(l) ? 'path' : '', focusing && !(lit.has(l.s) && lit.has(l.o)) ? 'dim' : ''].join(' '));
  const linkLabel = root.append('g').attr('class', 'gx-link-labels').selectAll('text').data(links.filter(pathEdge)).join('text').text((l) => l.label);
  const node = root.append('g').attr('class', 'gx-nodes').selectAll('g').data(nodes, (d) => d.iri).join('g')
    .attr('class', (d) => ['gx-node', shown(d) ? '' : 'dim', d.iri === result?.focus ? 'focus' : '', pathSet.has(d.iri) ? 'on-path' : ''].join(' '))
    .style('--ring', (d) => ring.get(d.iri) ?? 0)
    .on('click', (e, d) => { location.hash = exploreHref(`@${d.iri}`); });
  node.append('circle').attr('r', radius).attr('fill', fill);
  node.append('title').text((d) => `${d.label} (${kindOf(d).label})`);
  // Names only where they help: the lit things, or the best linked when nothing is asked.
  const labelled = (d) => (focusing ? lit.has(d.iri) && (result.kind !== 'groups' || (d.degree ?? 0) > 2 || lit.size < 30) : (d.degree ?? 0) >= 6 || d.kind === 'org');
  const lab = node.filter(labelled).append('text').attr('class', 'gx-label');
  lab.each(function label(d) {
    const t = d3.select(this);
    // The outer ring's names point outwards, like spokes, so they don't overlap.
    if (result?.kind === 'ego' && ring.get(d.iri) === 2) {
      const a = angle.get(d.iri);
      const left = Math.cos(a) < 0;
      const deg = (a * 180) / Math.PI + (left ? 180 : 0);
      t.attr('class', 'gx-label radial').style('text-anchor', left ? 'end' : 'start').attr('dy', '0.32em')
        .attr('transform', `rotate(${deg}) translate(${(left ? -1 : 1) * (radius(d) + 5)},0)`).text(cut(d.label, 20));
    } else t.attr('dy', radius(d) + 11).text(cut(d.label, d.iri === result?.focus ? 34 : 22));
  });

  // The forces: an ego result unfolds in rings around the thing; a path lies in a line.
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.iri).distance((l) => (l.weak ? 90 : 46)).strength((l) => (l.weak ? 0.02 : focusing && !(lit.has(l.s) && lit.has(l.o)) ? 0.05 : 0.5)))
    .force('charge', d3.forceManyBody().strength((d) => (shown(d) ? -120 : -18)))
    .force('collide', d3.forceCollide().radius((d) => radius(d) + (shown(d) ? 6 : 1)));
  if (result?.kind === 'ego') {
    const f = byId.get(result.focus);
    // Everything starts where the thing is, then spreads out ring by ring to its place.
    for (const nd of nodes) { nd.x = W / 2 + (Math.random() - 0.5) * 6; nd.y = H / 2 + (Math.random() - 0.5) * 6; }
    f.fx = W / 2; f.fy = H / 2;
    const outer = Math.max(90, Math.min(W, H) / 2 - 115);
    const rOf = (d) => (ring.get(d.iri) === 1 ? (result.rings.length > 2 ? outer * 0.5 : outer) : ring.get(d.iri) === 2 ? outer : 0);
    sim.force('link').strength(0.03);
    sim.force('charge').strength(-30);
    sim.force('x', d3.forceX((d) => W / 2 + rOf(d) * Math.cos(angle.get(d.iri) ?? 0)).strength(0.35))
      .force('y', d3.forceY((d) => H / 2 + rOf(d) * Math.sin(angle.get(d.iri) ?? 0)).strength(0.35));
  } else if (result?.kind === 'path' && result.path) {
    const step = (W - 160) / Math.max(1, result.path.length - 1);
    result.path.forEach((k, i) => { const nd = byId.get(k); nd.fx = 80 + i * step; nd.fy = H / 2 + (i % 2 ? -36 : 36); });
    sim.force('x', d3.forceX(W / 2).strength(0.03)).force('y', d3.forceY(H / 2).strength(0.06));
  } else {
    sim.force('x', d3.forceX(W / 2).strength((d) => (shown(d) ? 0.06 : 0.02))).force('y', d3.forceY(H / 2).strength((d) => (shown(d) ? 0.08 : 0.02)));
  }
  sim.alpha(result?.kind === 'ego' ? 1 : 0.7).alphaDecay(0.035);
  sim.on('tick', () => {
    link.attr('x1', (l) => l.source.x).attr('y1', (l) => l.source.y).attr('x2', (l) => l.target.x).attr('y2', (l) => l.target.y);
    linkLabel.attr('x', (l) => (l.source.x + l.target.x) / 2).attr('y', (l) => (l.source.y + l.target.y) / 2 - 6);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
  sim.on('end', () => {
    if (result?.kind !== 'ego') for (const nd of nodes) pos.set(nd.iri, { x: nd.x, y: nd.y });
    // The first time, fit the whole graph (or what was asked) in view.
    if (!zoomT && result?.kind !== 'ego' && result?.kind !== 'path' && stage.isConnected) {
      const pts = nodes.filter(shown);
      if (!pts.length) return;
      const [x0, x1] = d3.extent(pts, (d) => d.x);
      const [y0, y1] = d3.extent(pts, (d) => d.y);
      const k = Math.min(1.6, 0.9 / Math.max((x1 - x0 + 60) / W, (y1 - y0 + 60) / H));
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
    }
  });
  // Dragging a thing pins it while held.
  node.call(d3.drag()
    .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); if (d.iri !== result?.focus && !pathSet.has(d.iri)) { d.fx = null; d.fy = null; } }));

  const legend = h('div', { class: 'gx-legend' },
    ['person', 'asset', 'actor', 'strategy', 'concept'].map((k) => h('span', {}, h('span', { class: 'gx-dot', style: `--c:${NODE_KINDS[k].color}` }), NODE_KINDS[k].label)),
    h('span', { class: 'gx-legend-note' }, 'Assets take their ABCD colour'));
  const controls = h('div', { class: 'gx-zoom' },
    h('button', { class: 'btn btn-xs btn-square', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => svg.transition().call(zoom.scaleBy, 1.3) }, icon('zoomIn', 14)),
    h('button', { class: 'btn btn-xs btn-square', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => svg.transition().call(zoom.scaleBy, 0.77) }, icon('zoomOut', 14)),
    h('button', { class: 'btn btn-xs btn-square', title: 'Fit', 'aria-label': 'Fit', onclick: () => svg.transition().call(zoom.transform, d3.zoomIdentity) }, icon('fit', 14)));
  stage.replaceChildren(svg.node(), legend, controls);
  stage.classList.toggle('unfolding', result?.kind === 'ego');
  stage._sim?.stop();
  stage._sim = sim;
}
const cut = (s, max) => (String(s).length > max ? `${String(s).slice(0, max - 1)}…` : String(s));

/* -------------------------------------------------------------- insights */

function Insights() {
  setCrumbs([]);
  const { pr, bc, cm, comps } = insights();
  const notFrame = (k) => !['org', 'map', 'team'].includes(g.nodes[k].kind);
  const topBy = (sc, filter, count = 8) => Object.keys(sc).filter(filter).sort((a, b) => sc[b] - sc[a]).slice(0, count).filter((k) => sc[k] > 0);
  const central = topBy(pr, (k) => g.nodes[k].kind !== 'org');
  const bridges = topBy(bc, (k) => notFrame(k) && g.nodes[k].kind !== 'concept');
  const groups = [];
  for (const [k, c] of Object.entries(cm)) (groups[c] ??= []).push(k);
  const clusters = groups.filter((x) => x && x.length > 2).map((x) => x.sort((a, b) => pr[b] - pr[a])).sort((a, b) => b.length - a.length);
  const lone = comps.map((c) => c.filter(notFrame)).filter((c) => c.length === 1).flat();
  const apart = comps.slice(1).map((c) => c.filter(notFrame)).filter((c) => c.length > 1);
  const abcdCount = Object.fromEntries(ABCD.map((a) => [a.id, 0]));
  for (const nd of Object.values(g.nodes)) if (nd.abcd) abcdCount[nd.abcd] += 1;
  const maxA = Math.max(1, ...Object.values(abcdCount));
  const thin = ABCD.filter((a) => abcdCount[a.id] === Math.min(...Object.values(abcdCount)));
  const bars = (list, sc) => h('ol', { class: 'gi-bars' }, list.map((k) => h('li', {},
    h('a', { href: exploreHref(`@${k}`) }, h('span', { class: 'gx-dot', style: `--c:${colourOf(g.nodes[k])}` }), h('span', { class: 'gi-name' }, g.nodes[k].label)),
    h('span', { class: 'gi-bar' }, h('span', { style: `width:${Math.round((100 * sc[k]) / sc[list[0]])}%` })))));
  return h('div', { class: 'graph-insights' },
    tabs('insights'),
    h('div', { class: 'gi-stats' },
      Stat(g.triples.length, 'facts'), Stat(Object.keys(g.nodes).length, 'things'), Stat(g.edges.filter((e) => !e.weak).length, 'links that say something'), Stat(clusters.length, 'clusters')),
    h('div', { class: 'gi-grid' },
      Card('Most connected', 'Linked to many things, or to things that are themselves well linked (PageRank). These are where your knowledge pools.', bars(central, pr), exploreHref('most connected')),
      Card('Who bridges groups', 'They sit on the shortest way between others (betweenness). Lose one and two groups drift apart; invite one and two groups meet.', bars(bridges, bc), exploreHref('bridges')),
      Card('Clusters', `${n(clusters.length, 'group')} of things more linked to each other than to the rest.`, h('ul', { class: 'gi-clusters' }, clusters.slice(0, 7).map((c, i) => h('li', {},
        h('span', { class: 'gx-dot', style: `--c:${GROUP_COLOURS[i % GROUP_COLOURS.length]}` }),
        h('span', {}, c.slice(0, 3).map((k) => g.nodes[k].label).join(', '), c.length > 3 && h('small', {}, ` and ${c.length - 3} more`))))), exploreHref('clusters')),
      Card('On their own', lone.length || apart.length ? `${n(lone.length, 'thing')} with no links, and ${n(apart.length, 'group')} not linked to the rest. Linking them in adds what they know to the whole.` : 'Everything is linked to everything else, one way or another.',
        h('ul', { class: 'gx-list' }, [...lone, ...apart.flat()].slice(0, 8).map((k) => Row(k))), exploreHref('islands')),
      Card('ABCD balance', thin.length < ABCD.length ? `Fewest: ${thin.map((a) => a.label.toLowerCase()).join(' and ')}. Worth a look for what’s there but not yet mapped.` : 'Even across the six types.',
        h('ul', { class: 'gi-abcd' }, ABCD.map((a) => h('li', {},
          h('a', { href: exploreHref(a.label.toLowerCase()) }, a.label),
          h('span', { class: 'gi-bar', style: `--c:${a.color}` }, h('span', { style: `width:${Math.round((100 * abcdCount[a.id]) / maxA)}%` })),
          h('b', {}, abcdCount[a.id]))))),
    ));
}
const Stat = (v, label) => h('div', { class: 'gi-stat' }, h('b', {}, v.toLocaleString()), h('span', {}, label));
const Card = (title, note, body, more = null) => h('section', { class: 'gi-card' },
  h('header', {}, h('h3', {}, title), more && h('a', { class: 'gi-more', href: more }, 'See on the graph', icon('chevronRight', 13))),
  h('p', {}, note), body);

/* -------------------------------------------------------------- ontology */

function saveSettings(next) {
  settings = next;
  saveDoc('graph', settings);
  rebuild();
  render();
}
function Ontology() {
  setCrumbs([]);
  const vocabOn = (v) => v.core || settings.vocabs[v.prefix] !== false;
  const sample = Object.values(g.nodes).filter((nd) => nd.kind === 'asset' && nd.abcd).sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))[0];
  const sampleTtl = sample ? toTurtle({ ...g, triples: g.triples.filter(([s]) => s === sample.iri) }).split('\n').filter((l) => !l.startsWith('@prefix')).join('\n').trim() : '';
  const lock = !canSet;
  return h('div', { class: 'graph-ontology' },
    tabs('ontology'),
    h('section', { class: 'go-block' },
      h('h2', {}, 'Vocabularies'),
      h('p', { class: 'go-note' }, 'The shared words the graph uses to say what things are and how they’re linked. Switch one off and the graph falls back to Dashi’s own words for it, so tools that don’t know that vocabulary still read you.'),
      h('ul', { class: 'go-vocabs' }, VOCABS.map((v) => h('li', { class: vocabOn(v) ? '' : 'off' },
        h('label', { class: 'go-switch' },
          h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: vocabOn(v), disabled: v.core || lock, onchange: (e) => saveSettings({ ...settings, vocabs: { ...settings.vocabs, [v.prefix]: e.target.checked } }) })),
        h('div', {},
          h('div', { class: 'go-vocab-head' }, h('b', {}, v.name), h('code', {}, `${v.prefix}:`), v.core && h('span', { class: 'go-core' }, 'Always on')),
          h('p', {}, v.about),
          h('code', { class: 'go-iri' }, v.iri)))))),
    h('section', { class: 'go-block' },
      h('h2', {}, 'ABCD types as classes'),
      h('p', { class: 'go-note' }, 'Each asset keeps its ABCD type (abcd:individual and so on) and is also given a class other tools know. Pick the class that fits how you use each type.'),
      h('div', { class: 'go-classes' }, ABCD.map((a) => {
        const current = settings.abcdClasses?.[a.id] ?? ABCD_CLASSES[a.id];
        return h('label', { class: 'go-class' },
          h('span', { class: 'go-class-name' }, h('span', { class: 'gx-dot', style: `--c:${a.color}` }), a.label),
          h('select', { class: 'select select-sm', disabled: lock, onchange: (e) => saveSettings({ ...settings, abcdClasses: { ...settings.abcdClasses, [a.id]: e.target.value } }) },
            CLASS_CHOICES.map((c) => h('option', { value: c, selected: c === current }, vocabOn({ prefix: c.split(':')[0] }) ? c : `${c} (vocabulary off)`))));
      }))),
    h('section', { class: 'go-block' },
      h('h2', {}, 'What goes in'),
      h('div', { class: 'go-includes' }, [
        ['people', 'People and teams', 'Staff as foaf:Person, and the teams they’re in. Never their email or phone.'],
        ['tags', 'Tags as concepts', 'Each tag becomes a skos:Concept that its assets are about.'],
        ['collections', 'Collections', 'Each collection as a group its assets are part of.'],
        ['strategy', 'Strategy', 'The framework, plans, objectives, goals and workplans, and the assets they use. Drafts and tasks stay out.'],
      ].map(([k, label, about]) => h('label', { class: 'go-include' },
        h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: settings.include?.[k] !== false, disabled: lock, onchange: (e) => saveSettings({ ...settings, include: { ...settings.include, [k]: e.target.checked } }) }),
        h('span', {}, h('b', {}, label), h('small', {}, about)))))),
    sample && h('section', { class: 'go-block' },
      h('h2', {}, 'How one asset reads now'),
      h('p', { class: 'go-note' }, `“${sample.label}”, in Turtle, with the choices above.`),
      h('pre', { class: 'gx-code' }, sampleTtl)),
    h('div', { class: 'go-foot' },
      lock ? h('p', { class: 'go-note' }, 'Only someone who can change the asset graph’s settings can change these.')
        : h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await uiConfirm('Put the vocabularies, classes and what goes in back to how they started?', { ok: 'Reset' })) saveSettings(defaultGraphSettings()); } }, icon('undo', 14), 'Reset to the defaults')));
}

/* ---------------------------------------------------------------- export */

let previewFormat = 'turtle';
function exportGraph() { return buildGraph(docs, settings, { plugins, restricted: false }); }
function Export() {
  setCrumbs([]);
  const eg = exportGraph();
  const left = g.triples.length - eg.triples.length;
  const base = `${location.origin}/id/`;
  const text = (id) => EXPORTS[id].make(eg, { base });
  const pre = h('pre', { class: 'gx-code gx-preview' }, text(previewFormat).split('\n').slice(0, 40).join('\n'));
  const download = (id) => {
    const f = EXPORTS[id];
    const blob = new Blob([text(id)], { type: f.type });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${(org.name || 'dashi').toLowerCase().replace(/[^\w]+/g, '-')}-asset-graph.${f.ext}` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  const about = { turtle: 'Readable by people and by every RDF tool. The usual choice.', jsonld: 'JSON that’s also linked data: for web developers and search engines.', ntriples: 'One fact per line: easy to stream, diff or load in bulk.' };
  return h('div', { class: 'graph-export' },
    tabs('export'),
    h('p', { class: 'go-note' }, `${n(eg.triples.length, 'fact')}, ready for any linked-data tool. ${left > 0 ? `Restricted assets stay out (${n(left, 'fact')} left behind). ` : 'Restricted assets always stay out. '}Things are named under ${base}.`),
    h('div', { class: 'ge-formats' }, Object.entries(EXPORTS).map(([id, f]) => h('section', { class: `ge-format${previewFormat === id ? ' on' : ''}` },
      h('header', {}, h('b', {}, f.label), h('code', {}, `.${f.ext}`)),
      h('p', {}, about[id]),
      h('div', { class: 'ge-actions' },
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => download(id) }, icon('download', 14), 'Download'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { previewFormat = id; render(); } }, icon('eye', 14), 'Preview'))))),
    h('h2', { class: 'ge-h' }, `Preview: ${EXPORTS[previewFormat].label}`, h('small', {}, ' first 40 lines')),
    pre,
    ApiKeys());
}

function ApiKeys() {
  const s = session();
  const box = h('section', { class: 'ge-api' },
    h('h2', {}, 'Read-only API'),
    h('p', { class: 'go-note' }, 'Let another tool (a knowledge graph, a search index, a partner’s dashboard) read your asset graph. A key only reads, only the graph, and never restricted assets. You see each key once; lose it and make another.'));
  if (!s) { box.append(h('p', { class: 'ge-empty' }, 'API keys work on the hosted platform, where the graph has an address of its own.')); return box; }
  if (!s.canAdmin) { box.append(h('p', { class: 'ge-empty' }, 'Only an admin makes API keys. Ask one if another tool needs to read the graph.')); return box; }
  const list = h('div', { class: 'ge-keys' }, h('p', { class: 'ge-empty' }, 'Loading keys…'));
  const fresh = h('div', { class: 'ge-fresh', hidden: true });
  const call = async (method, path, body) => {
    const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    return res.json();
  };
  const load = async () => {
    try {
      const keys = await call('GET', '/api/graph/keys');
      list.replaceChildren(keys.length ? h('table', { class: 'ge-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Key'), h('th', {}, 'Made'), h('th', {}, 'Last used'), h('th', {}))),
        h('tbody', {}, keys.map((k) => h('tr', { class: k.revokedAt ? 'revoked' : '' },
          h('td', {}, k.name), h('td', {}, h('code', {}, `${k.prefix}…`)), h('td', {}, day(k.createdAt)), h('td', {}, k.revokedAt ? `Revoked ${day(k.revokedAt)}` : k.lastUsedAt ? day(k.lastUsedAt) : 'Not yet'),
          h('td', {}, !k.revokedAt && h('button', { class: 'btn btn-xs btn-ghost', onclick: async () => {
            if (!(await uiConfirm(`Revoke “${k.name}”? Anything using it stops reading the graph straight away.`, { ok: 'Revoke', danger: true }))) return;
            await call('DELETE', `/api/graph/keys/${k.id}`).catch((e) => toast(e.message));
            load();
          } }, 'Revoke'))))))
        : h('p', { class: 'ge-empty' }, 'No keys yet.'));
    } catch (e) { list.replaceChildren(h('p', { class: 'ge-empty' }, `Couldn’t load the keys: ${e.message}`)); }
  };
  const make = async () => {
    const name = await uiPrompt('What will use this key?', '', { title: 'New API key', placeholder: 'e.g. Partner dashboard', ok: 'Make the key' });
    if (!name) return;
    try {
      const k = await call('POST', '/api/graph/keys', { name });
      const example = `curl -H "Authorization: Bearer ${k.key}" "${location.origin}/api/graph/export?format=turtle"`;
      fresh.hidden = false;
      fresh.replaceChildren(
        h('b', {}, 'Copy this key now. It won’t be shown again.'),
        h('div', { class: 'ge-secret' }, h('code', {}, k.key), h('button', { class: 'btn btn-xs', onclick: () => navigator.clipboard?.writeText(k.key).then(() => toast('Key copied')) }, icon('copy', 13), 'Copy')),
        h('pre', { class: 'gx-code' }, example));
      load();
    } catch (e) { toast(e.message); }
  };
  box.append(
    h('div', { class: 'ge-api-bar' }, h('button', { class: 'btn btn-sm', onclick: make }, icon('key', 14), 'New API key')),
    fresh, list,
    h('details', { class: 'ge-howto' }, h('summary', {}, 'How another tool reads it'),
      h('pre', { class: 'gx-code' }, `GET ${location.origin}/api/graph/export?format=turtle\nAuthorization: Bearer dk_…\n\nformat = turtle | jsonld | ntriples`)));
  load();
  return box;
}
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Everything above is defined: draw the page.
window.addEventListener('hashchange', render);
render();
