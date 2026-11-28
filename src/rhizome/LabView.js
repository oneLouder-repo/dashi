/**
 * Rhizome Lab (alpha 0.4.x): a creative knowledge toolset around the fact
 * layer. It took the Rack's place on Rhizome's tabs; the Rack is one of its
 * experiments now. Each experiment is read-only: it measures and shows, and
 * never changes the facts. Saved console patches live in doc.labPatches.
 *
 *   #lab             the experiments
 *   #lab/console     the pipe console, saved patches and patch packs
 *   #lab/communities Leiden-style communities
 *   #lab/brokers     structural holes (Burt)
 *   #lab/ties        ties worth making (Adamic–Adar)
 *   #lab/shapes      shape checks (after SHACL)
 *   #lab/hive        a hive plot
 *   #lab/sound       Far Beyond the Graph, the sound experiment
 *   #rack            the Rack, unchanged, under the Lab tab
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { typeLabel } from './facts.js';
import { graphOf } from './rackGraph.js';
import { labMeasures, predictTies, checkShapes } from './labAlgo.js';
import { LAB_EXPERIMENTS } from './labList.js';
import { scoreOf } from './labSound.js';
import { createPlayer } from './labPlayer.js';
import { runCommand, sayOf, FIELDS, VERBS, SOURCES, PATCH_PACKS, installPack, exportPack, readPack } from './labConsole.js';


const nameOf = (facts, id) => facts.entities[id]?.name ?? id;

function Chips(sub) {
  return h('nav', { class: 'rz-chips lab-chips', 'aria-label': 'Lab experiments' },
    h('a', { class: `rz-chip${!sub ? ' on' : ''}`, href: '#lab', 'aria-current': !sub ? 'page' : null }, 'All experiments'),
    LAB_EXPERIMENTS.map((x) => h('a', { class: `rz-chip${sub === x.id ? ' on' : ''}`, href: x.href ?? `#lab/${x.id}`, 'aria-current': sub === x.id ? 'page' : null }, x.name)));
}

/** The Lab page body (under Rhizome's tabs). */
export { LAB_EXPERIMENTS };

export function Lab(ctx, sub) {
  const g = graphOf(ctx.facts);
  const body = {
    console: () => ConsolePanel(ctx, g),
    communities: () => Communities(ctx, g),
    brokers: () => Brokers(ctx, g),
    ties: () => Ties(ctx, g),
    shapes: () => Shapes(ctx, g),
    hive: () => Hive(ctx, g),
    sound: () => Sound(ctx, g),
  }[sub];
  return h('div', { class: 'lab' }, Chips(body ? sub : null), body ? body() : Home(ctx, g));
}

function Home(ctx, g) {
  const lab = labMeasures(g);
  return h('div', { class: 'lab-home' },
    h('div', { class: 'rz-intro' },
      h('h2', {}, 'The Lab'),
      h('p', {}, `Experiments with your network: ${g.size.toLocaleString()} connected things, ${lab.communities.filter((c) => c.ids.length > 1).length} communities. Methods from current network science, run in your browser. Nothing here changes your facts, and nothing leaves the page.`)),
    h('div', { class: 'rz-grid' }, LAB_EXPERIMENTS.map((x) => h('a', { class: `rz-panel lab-card${x.soon ? ' soon' : ''}`, href: x.href ?? `#lab/${x.id}` },
      h('h3', {}, icon(x.icon, 16), ' ', x.name, x.soon ? h('span', { class: 'lab-soon' }, 'Coming') : null),
      h('p', { class: 'rz-note' }, x.line)))));
}

/* ---------------------------------------------------------------- console */

const consoleState = { cmd: 'all | where ties >= 2 | weigh broker | top 8 | say', history: [] };

function Result(res, facts) {
  if (res.error) return h('p', { class: 'lab-error', role: 'alert' }, res.error);
  const said = res.said ? h('p', { class: 'lab-said' }, res.said) : null;
  if (res.kind === 'text') return h('p', { class: 'lab-said' }, res.text);
  if (res.kind === 'rows') {
    if (!res.rows.length) return h('div', {}, said, h('p', { class: 'rz-note' }, 'Nothing matches.'));
    const cell = (r, c) => (c === 'type' ? typeLabel(r.type) : c === 'broker' ? r.broker.toFixed(2) : String(r[c] ?? ''));
    return h('div', {}, said,
      h('div', { class: 'lab-table-wrap' }, h('table', { class: 'lab-table' },
        h('thead', {}, h('tr', {}, res.cols.map((c) => h('th', { scope: 'col', title: FIELDS[c] }, c)))),
        h('tbody', {}, res.rows.slice(0, 200).map((r) => h('tr', {}, res.cols.map((c) => h('td', {}, cell(r, c)))))))),
      res.rows.length > 200 ? h('p', { class: 'rz-note' }, `Showing 200 of ${res.rows.length}. Add top or where to narrow it.`) : null);
  }
  if (res.kind === 'pairs') return h('div', {}, said, PairList(res.pairs, facts));
  if (res.kind === 'groups') return h('div', {}, said, GroupList(res.groups, facts));
  if (res.kind === 'shapes') return h('div', {}, said, ShapeList(res.results, facts));
  return said;
}

function ConsolePanel(ctx, g) {
  const { doc, facts, save, canSet, toast } = ctx;
  if (ctx.run) consoleState.cmd = ctx.run;
  const out = h('div', { class: 'lab-out', 'aria-live': 'polite' });
  const input = h('input', { class: 'input lab-input', value: consoleState.cmd, 'aria-label': 'Command', spellcheck: 'false', autocomplete: 'off',
    onkeydown: (e) => {
      if (e.key === 'Enter') run();
      if (e.key === 'ArrowUp' && consoleState.history.length) { e.preventDefault(); input.value = consoleState.history.at(-1); }
    } });
  const run = (cmd = input.value) => {
    input.value = cmd;
    consoleState.cmd = cmd;
    if (cmd.trim() && consoleState.history.at(-1) !== cmd) consoleState.history.push(cmd);
    out.replaceChildren(Result(runCommand(cmd, { facts, g }), facts));
  };
  const patches = h('div', { class: 'lab-patches' });
  const drawPatches = () => {
    const list = Object.values(doc.labPatches ?? {});
    patches.replaceChildren(
      list.length ? h('ul', { class: 'lab-patch-list' }, list.map((p) => h('li', {},
        h('button', { type: 'button', class: 'lab-patch', onclick: () => run(p.cmd), title: p.note || p.cmd }, h('strong', {}, p.name), h('code', {}, p.cmd)),
        canSet ? h('button', { type: 'button', class: 'btn btn-ghost btn-xs', 'aria-label': `Remove the patch ${p.name}`, onclick: () => { delete doc.labPatches[p.id]; save(); drawPatches(); } }, icon('close', 12)) : null)))
        : h('p', { class: 'rz-note' }, 'No saved patches yet. Install a pack below, or save the command above.'));
  };
  const saveCmd = () => {
    const cmd = input.value.trim();
    if (!cmd) return;
    const added = installPack(doc, { id: null, patches: [{ name: cmd.length > 40 ? `${cmd.slice(0, 38)}…` : cmd, cmd }] });
    if (added) { save(); toast('Saved as a patch'); } else toast('That patch is saved already');
    drawPatches();
  };
  const share = h('textarea', { class: 'textarea lab-share', rows: 4, 'aria-label': 'Patch pack JSON', placeholder: 'Paste a patch pack here to install it, or press Export to put yours here.' });
  drawPatches();
  run();
  return h('div', { class: 'lab-console' },
    h('section', { class: 'rz-panel' },
      h('div', { class: 'lab-prompt' }, h('span', { class: 'lab-caret', 'aria-hidden': 'true' }, '›'), input,
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => run() }, 'Run'),
        canSet ? h('button', { type: 'button', class: 'btn btn-sm', onclick: saveCmd }, icon('plus', 13), 'Save as patch') : null),
      out),
    h('div', { class: 'lab-console-side' },
      h('section', { class: 'rz-panel' }, h('h3', {}, 'Your patches'), patches),
      canSet ? h('section', { class: 'rz-panel' }, h('h3', {}, 'Patch packs'),
        h('ul', { class: 'lab-pack-list' }, PATCH_PACKS.map((pack) => h('li', {},
          h('div', {}, h('strong', {}, pack.name), h('span', { class: 'rz-note' }, ` ${pack.patches.length} patches · ${pack.note}`)),
          h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { const n = installPack(doc, pack); save(); drawPatches(); toast(n ? `Installed ${n} ${n === 1 ? 'patch' : 'patches'}` : 'Already installed'); } }, 'Install')))),
        share,
        h('div', { class: 'rz-actions' },
          h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { share.value = JSON.stringify(exportPack(doc), null, 2); share.select(); } }, 'Export mine'),
          h('button', { type: 'button', class: 'btn btn-xs', onclick: () => {
            try { const n = installPack(doc, readPack(share.value)); save(); drawPatches(); toast(n ? `Installed ${n} ${n === 1 ? 'patch' : 'patches'}` : 'Nothing new in that pack'); } catch (err) { toast(err.message); }
          } }, 'Install pasted'))) : null,
      h('section', { class: 'rz-panel lab-ref' }, h('h3', {}, 'The language'),
        h('p', { class: 'rz-note' }, 'Start from something, then reshape it with stages joined by |.'),
        h('h4', {}, 'Start from'), h('dl', {}, SOURCES.flatMap(([k, v]) => [h('dt', {}, h('code', {}, k)), h('dd', {}, v)])),
        h('h4', {}, 'Then'), h('dl', {}, VERBS.flatMap(([k, v]) => [h('dt', {}, h('code', {}, k)), h('dd', {}, v)])),
        h('h4', {}, 'Fields'), h('dl', {}, Object.entries(FIELDS).flatMap(([k, v]) => [h('dt', {}, h('code', {}, k)), h('dd', {}, v)])))));
}

/* ------------------------------------------------------------ experiments */

function GroupList(groups, facts) {
  return h('ol', { class: 'lab-groups' }, groups.map((c) => h('li', {},
    h('strong', {}, `${c.ids.length} members`),
    h('span', {}, c.ids.slice(0, 12).map((id) => nameOf(facts, id)).join(', '), c.ids.length > 12 ? `, and ${c.ids.length - 12} more` : ''))));
}

function Communities({ facts }, g) {
  const lab = labMeasures(g);
  const groups = lab.communities.filter((c) => c.ids.length > 1);
  const alone = lab.communities.length - groups.length;
  return h('section', { class: 'rz-panel' },
    h('h3', {}, 'Communities'),
    h('p', { class: 'lab-said' }, sayOf({ kind: 'groups', groups, q: lab.q }, facts)),
    h('p', { class: 'rz-note' }, 'Leiden-style: groups grow where ties are denser inside than chance would give (modularity), then each group is checked so it is held together by its own ties. Label propagation, the older method, can leave a group in pieces. ',
      alone ? `${alone} ${alone === 1 ? 'thing stands' : 'things stand'} alone, with no ties.` : ''),
    GroupList(groups, facts));
}

function Brokers({ facts }, g) {
  const lab = labMeasures(g);
  const rows = [...lab.brokers].filter(([, b]) => b.ties >= 2).sort((a, b) => b[1].broker - a[1].broker || (a[0] < b[0] ? -1 : 1)).slice(0, 20);
  return h('section', { class: 'rz-panel' },
    h('h3', {}, 'Brokers'),
    h('p', { class: 'rz-note' }, 'Burt’s structural holes: a broker’s contacts mostly don’t know each other, so the broker carries ideas between groups, and the network leans on them. Constraint runs from 0 (contacts all apart) to 1 (all tied to each other). Effective size counts contacts that aren’t redundant.'),
    rows.length ? h('div', { class: 'lab-table-wrap' }, h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {}, ['Name', 'Kind', 'Ties', 'Broker', 'Constraint', 'Effective size'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, rows.map(([id, b]) => h('tr', {},
        h('td', {}, nameOf(facts, id)), h('td', {}, typeLabel(facts.entities[id]?.type)), h('td', {}, String(b.ties)),
        h('td', {}, h('span', { class: 'lab-bar', style: `--v:${b.broker}` }), b.broker.toFixed(2)), h('td', {}, b.constraint.toFixed(2)), h('td', {}, b.effective.toFixed(1)))))))
      : h('p', { class: 'rz-note' }, 'No one has two or more ties yet.'));
}

function PairList(pairs, facts) {
  if (!pairs.length) return h('p', { class: 'rz-note' }, 'No likely missing ties.');
  return h('ol', { class: 'lab-pairs' }, pairs.map((p) => h('li', {},
    h('strong', {}, nameOf(facts, p.a)), ' and ', h('strong', {}, nameOf(facts, p.b)),
    h('span', { class: 'rz-note' }, ` · share ${p.via.slice(0, 4).map((id) => nameOf(facts, id)).join(', ')}${p.via.length > 4 ? ` and ${p.via.length - 4} more` : ''} · score ${p.score.toFixed(2)}`))));
}

function Ties({ facts }, g) {
  const pairs = predictTies(g, { limit: 15 });
  return h('section', { class: 'rz-panel' },
    h('h3', {}, 'Ties worth making'),
    h('p', { class: 'rz-note' }, 'Adamic–Adar link prediction: two things that share contacts are likely to be tied, and a shared contact who knows few others counts for more than a hub who knows everyone. These are guesses, not facts: an introduction to consider, or a tie that exists but isn’t on the map yet.'),
    h('p', { class: 'lab-said' }, sayOf({ kind: 'pairs', pairs }, facts)),
    PairList(pairs, facts));
}

function ShapeList(results, facts) {
  return h('ul', { class: 'lab-shapes' }, results.map((r) => h('li', { class: r.failing.length ? 'gap' : 'ok' },
    h('span', { class: 'lab-shape-mark', 'aria-hidden': 'true' }, r.failing.length ? '!' : '✓'),
    h('div', {}, h('strong', {}, r.shape.label), h('span', { class: 'rz-note' }, ` · ${r.checked - r.failing.length} of ${r.checked} hold`),
      r.failing.length ? h('p', { class: 'rz-note' }, 'Missing: ', r.failing.slice(0, 8).map((id) => nameOf(facts, id)).join(', '), r.failing.length > 8 ? `, and ${r.failing.length - 8} more` : '') : null))));
}

function Shapes({ facts }, g) {
  const results = checkShapes(facts, g);
  return h('section', { class: 'rz-panel' },
    h('h3', {}, 'Shape checks'),
    h('p', { class: 'rz-note' }, 'After W3C SHACL, the standard way to say what linked data should look like. Each shape says what a kind of thing should have. A gap is a question, not an error: maybe the tie is real but unrecorded.'),
    h('p', { class: 'lab-said' }, sayOf({ kind: 'shapes', results }, facts)),
    ShapeList(results, facts));
}

/* ------------------------------------------------------------------- hive */

export const HIVE_AXES = [
  { id: 'people', label: 'People', types: ['person'] },
  { id: 'eco', label: 'Ecosystem', types: ['actor', 'group', 'map', 'place'] },
  { id: 'work', label: 'Plans, work and assets', types: null },
];
/** Where the hive's centre sits, as a share of the box: low enough that the top axis and its label fit. */
const HIVE_CY = 0.58;
const axisOf = (type) => HIVE_AXES.find((a) => a.types?.includes(type))?.id ?? 'work';

/**
 * A hive plot (Krzywinski et al. 2012): three axes from the centre, a node's
 * place on its axis set by its core number, then its ties. Unlike a force
 * layout, the same network always draws the same, so two dates compare.
 * Returns { nodes: [{ id, axis, x, y }], edges: [{ a, b, axis }] } in a 0..1 box.
 */
export function hiveLayout(facts, g, { size = 1 } = {}) {
  const { core } = labMeasures(g);
  const byAxis = Object.fromEntries(HIVE_AXES.map((a) => [a.id, []]));
  for (const id of [...g.keys()].sort()) if ((g.get(id)?.size ?? 0) > 0) byAxis[axisOf(facts.entities[id]?.type)].push(id);
  const pos = new Map();
  const nodes = [];
  HIVE_AXES.forEach((a, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / HIVE_AXES.length;
    const ids = byAxis[a.id].sort((x, y) => (core.get(x) ?? 0) - (core.get(y) ?? 0) || g.get(x).size - g.get(y).size || (x < y ? -1 : 1));
    ids.forEach((id, k) => {
      const r = 0.12 + 0.36 * ((k + 1) / (ids.length + 1));
      const p = { id, axis: a.id, x: size * (0.5 + r * Math.cos(angle)), y: size * (HIVE_CY + r * Math.sin(angle)) };
      pos.set(id, p); nodes.push(p);
    });
  });
  const edges = [];
  for (const [a, nb] of g) for (const b of nb) if (a < b && pos.has(a) && pos.has(b) && pos.get(a).axis !== pos.get(b).axis) edges.push({ a, b, axis: HIVE_AXES.find((x) => x.id === pos.get(a).axis || x.id === pos.get(b).axis).id });
  return { nodes, edges, pos };
}

function Hive({ facts }, g) {
  const S = 560;
  const { nodes, edges, pos } = hiveLayout(facts, g, { size: S });
  const colour = { people: 'var(--hive-1)', eco: 'var(--hive-2)', work: 'var(--hive-3)' };
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); n.append(...kids); return n; };
  const c = { x: S / 2, y: S * HIVE_CY };
  const svg = el('svg', { viewBox: `0 0 ${S} ${Math.round(S * 0.92)}`, class: 'lab-hive', role: 'img', 'aria-label': `Hive plot: ${nodes.length} things on three axes, ${edges.length} ties between axes` });
  HIVE_AXES.forEach((a, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / HIVE_AXES.length;
    const x2 = c.x + 0.5 * S * Math.cos(angle), y2 = c.y + 0.5 * S * Math.sin(angle);
    svg.append(el('line', { x1: c.x + 0.1 * S * Math.cos(angle), y1: c.y + 0.1 * S * Math.sin(angle), x2, y2, class: 'lab-hive-axis' }),
      el('text', { x: c.x + 0.52 * S * Math.cos(angle), y: c.y + 0.5 * S * Math.sin(angle) + (i === 0 ? -10 : 22), 'text-anchor': i === 0 ? 'middle' : i === 1 ? 'end' : 'start', class: 'lab-hive-label' }, a.label));
  });
  const ties = el('g', { class: 'lab-hive-ties' });
  for (const e of edges) {
    const p = pos.get(e.a), q = pos.get(e.b);
    // The bend sits halfway between the ties' midpoint and the centre, so curves fan out instead of meeting in one knot.
    const mx = ((p.x + q.x) / 2 + c.x) / 2, my = ((p.y + q.y) / 2 + c.y) / 2;
    ties.append(el('path', { d: `M${p.x} ${p.y}Q${mx} ${my} ${q.x} ${q.y}`, stroke: colour[e.axis] }));
  }
  svg.append(ties);
  for (const n of nodes) svg.append(el('circle', { cx: n.x, cy: n.y, r: 2.6, fill: colour[n.axis] }, el('title', {}, nameOf(facts, n.id))));
  const counts = Object.fromEntries(HIVE_AXES.map((a) => [a.id, nodes.filter((n) => n.axis === a.id).length]));
  return h('section', { class: 'rz-panel lab-hive-panel' },
    h('h3', {}, 'Hive plot'),
    h('p', { class: 'rz-note' }, 'Three axes from the centre: people, the ecosystem, and plans, work and assets. Further out means deeper in the network (core number, then ties). Curves are ties between axes. Unlike a force layout, the same network always draws the same, so this year and last year can sit side by side. After Krzywinski and colleagues, 2012.'),
    h('div', { class: 'lab-hive-wrap' }, svg,
      h('ul', { class: 'lab-hive-key' }, HIVE_AXES.map((a) => h('li', {}, h('span', { class: 'lab-hive-dot', style: `background:${colour[a.id]}` }), `${a.label}: ${counts[a.id]}`)),
        h('li', {}, `${edges.length} ties between axes`))));
}

/* ------------------------------------------------------------------ sound */

let player = null;
// Leaving the sound page (or Rhizome) stops the music.
const stopPlayer = () => { player?.close(); player = null; };
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#lab/sound')) stopPlayer(); });

function Sound({ facts, doc }, g) {
  const score = scoreOf(facts, g, { snapshots: doc.snapshots ?? [] });
  const S = 440, C = S / 2;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); n.append(...kids); return n; };
  const at = (step, r) => { const a = -Math.PI / 2 + (step / score.steps) * 2 * Math.PI; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const ring = (i) => 70 + i * 22;
  const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, class: 'lab-sound-disc', role: 'img', 'aria-label': `The score as a disc: ${score.present.length} loops, ${score.bass.length} bass notes, ${score.projected.length} ghost notes` });
  svg.append(el('circle', { cx: C, cy: C, r: C - 6, class: 'lab-disc-vinyl' }));
  for (let r = 40; r < C - 8; r += 6) svg.append(el('circle', { cx: C, cy: C, r, class: 'lab-disc-groove' }));
  const dots = new Map(); // step → dots lit on that step
  const mark = (step, node) => { if (!dots.has(step)) dots.set(step, []); dots.get(step).push(node); svg.append(node); };
  score.bass.forEach((n) => { const [x, y] = at(n.step, 46); mark(n.step, el('circle', { cx: x, cy: y, r: 5, class: 'lab-dot bass' }, el('title', {}, `Bass: ${n.name}`))); });
  score.present.forEach((l, i) => {
    svg.append(el('circle', { cx: C, cy: C, r: ring(i), class: 'lab-disc-ring' }));
    for (const n of l.notes) { const [x, y] = at(n.step, ring(i)); mark(n.step, el('circle', { cx: x, cy: y, r: n.edge ? 4.5 : 3, class: `lab-dot loop-${i % 6}${n.edge ? ' edge' : ''}` }, el('title', {}, n.edge ? `${n.name}, on the edge: a bell` : n.name))); }
  });
  const outer = ring(score.present.length) + 4;
  score.projected.forEach((n) => { const [x, y] = at(n.step, outer); mark(n.step, el('circle', { cx: x, cy: y, r: 3.5, class: 'lab-dot ghost' }, el('title', {}, `A guess: ${n.names.join(' and ')}`))); });
  svg.append(el('circle', { cx: C, cy: C, r: 30, class: 'lab-disc-label' }), el('text', { x: C, y: C - 2, 'text-anchor': 'middle', class: 'lab-disc-title' }, 'RHIZOME'), el('text', { x: C, y: C + 11, 'text-anchor': 'middle', class: 'lab-disc-sub' }, `${score.bpm} bpm`));
  const hand = el('line', { x1: C, y1: C, x2: C, y2: 12, class: 'lab-disc-hand', visibility: 'hidden' });
  svg.append(hand);
  let lit = [];
  const onStep = (s) => {
    for (const d of lit) d.classList.remove('on');
    if (s < 0) { hand.setAttribute('visibility', 'hidden'); return; }
    hand.setAttribute('visibility', 'visible');
    const [x, y] = at(s, C - 10);
    hand.setAttribute('x2', x); hand.setAttribute('y2', y);
    lit = dots.get(s) ?? [];
    for (const d of lit) d.classList.add('on');
  };

  const layers = { present: true, drums: true, projected: true, past: true };
  const layerBtn = (id, label, line) => h('button', { type: 'button', class: 'lab-layer', 'aria-pressed': 'true', title: line,
    onclick: (e) => { layers[id] = !layers[id]; e.currentTarget.setAttribute('aria-pressed', String(layers[id])); player?.setLayer(id, layers[id]); } }, h('span', { class: `lab-layer-dot ${id}`, 'aria-hidden': 'true' }), label);
  const status = h('p', { class: 'rz-note', 'aria-live': 'polite' });
  const take = h('div', { class: 'lab-take' });
  const playBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Play');
  const recBtn = h('button', { type: 'button', class: 'btn', disabled: true }, 'Record a take');
  playBtn.onclick = async () => {
    if (player?.playing) { stopPlayer(); playBtn.textContent = 'Play'; recBtn.disabled = true; recBtn.textContent = 'Record a take'; status.textContent = ''; return; }
    try {
      stopPlayer();
      player = createPlayer(score, { onStep });
      for (const [id, on] of Object.entries(layers)) player.setLayer(id, on);
      await player.start();
      playBtn.textContent = 'Stop';
      recBtn.disabled = !player.canRecord;
      status.textContent = 'Playing. It loops until you stop it.';
    } catch {
      status.textContent = 'This browser can’t play it (no Web Audio).';
    }
  };
  let recording = false;
  recBtn.onclick = async () => {
    if (!player) return;
    if (!recording) { player.startRecording(); recording = true; recBtn.textContent = 'Stop and keep the take'; status.textContent = 'Recording…'; return; }
    recording = false; recBtn.textContent = 'Record a take';
    const blob = await player.stopRecording();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    take.replaceChildren(h('audio', { controls: true, src: url }), h('a', { class: 'btn btn-sm', href: url, download: `far-beyond-the-graph-${new Date().toISOString().slice(0, 10)}.webm` }, 'Save the take'));
    status.textContent = 'Your take is below. Saving to Assets and sharing through Listen come later.';
  };

  return h('div', { class: 'lab-sound' },
    h('section', { class: 'rz-panel lab-sound-panel' },
      h('h3', {}, 'Far Beyond the Graph'),
      h('div', { class: 'lab-sound-wrap' }, svg,
        h('div', { class: 'lab-sound-side' },
          h('div', { class: 'rz-actions' }, playBtn, recBtn),
          status,
          h('div', { class: 'lab-layers', role: 'group', 'aria-label': 'Layers' },
            layerBtn('past', 'Past', 'Saved snapshots, as a worn groove and vinyl crackle'),
            layerBtn('present', 'Present', 'Each community a loop, brokers on bass, the edge as bells'),
            layerBtn('drums', 'Pulse', 'A slow boom-bap; busier when the network is tight'),
            layerBtn('projected', 'Projected', 'Likely ties not yet made, as quiet ghost notes: guesses, not facts')),
          take)),
      h('p', { class: 'lab-made-of' }, score.madeOf)));
}
