/**
 * The AI visualiser's face: a full-rack-width glass module with a question
 * box, six lane lights that blink in order, a screen that draws one step at
 * a time, the critical lens, and tape-deck controls (back, play, step, speed).
 * The same panel opens big in a tray.
 *
 * VisualiserPanel({ trace, state, canSet, onAsk, onWeights, onExpand, big })
 *   trace  from visualise() in visualiser.js
 *   state  { lane, playing, speed } kept by the caller so a re-render
 *          (a knob turned elsewhere in the rack) doesn't lose your place
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { LANES } from './visualiser.js';
import { plotLayout } from './rackGraph.js';

const svgNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, parent = null) => {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
};
export const SPEEDS = { slow: 3600, normal: 2000, fast: 900 };
const KIND_TONE = { name: 'name', measure: 'measure', type: 'type', category: 'cat', zone: 'zone' };

export function VisualiserPanel({ trace, state, canSet, graph, onAsk, onWeights, onExpand = null, big = false }) {
  let timer = null;
  const lights = h('div', { class: 'vz-lanes', role: 'tablist', 'aria-label': 'The six steps' });
  const screen = h('div', { class: 'vz-screen', 'aria-live': 'polite' });
  const lens = h('div', { class: 'vz-lens' });
  const playBtn = h('button', { type: 'button', class: 'vz-btn play', title: 'Play', onclick: () => (state.playing ? pause() : play()) });

  const paint = () => {
    lights.replaceChildren(...LANES.map((l, i) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(i === state.lane), class: `vz-lane${i === state.lane ? ' on' : i < state.lane ? ' done' : ''}`,
      title: l.blurb, onclick: () => { pause(); state.lane = i; paint(); },
    }, h('i', {}), h('span', {}, l.label))));
    const lane = LANES[state.lane];
    screen.replaceChildren(
      h('div', { class: 'vz-screen-head' }, h('b', {}, `${state.lane + 1} · ${lane.label}`), h('span', {}, lane.blurb)),
      Lane(lane.id));
    lens.replaceChildren(h('b', {}, 'Critical lens'), h('span', {}, trace.lens[lane.id]));
    playBtn.replaceChildren(icon(state.playing ? 'pause' : 'play', big ? 16 : 13));
    playBtn.title = state.playing ? 'Pause' : 'Play';
  };
  const tick = () => {
    if (!root.isConnected) return stop();
    if (state.lane >= LANES.length - 1) { state.playing = false; return paint(); }
    state.lane++;
    paint();
    timer = setTimeout(tick, SPEEDS[state.speed] ?? SPEEDS.normal);
  };
  const stop = () => { clearTimeout(timer); timer = null; };
  function play() {
    stop();
    if (state.lane >= LANES.length - 1) state.lane = 0;
    state.playing = true;
    paint();
    timer = setTimeout(tick, SPEEDS[state.speed] ?? SPEEDS.normal);
  }
  function pause() { stop(); state.playing = false; paint(); }
  const step = (d) => { pause(); state.lane = Math.min(LANES.length - 1, Math.max(0, state.lane + d)); paint(); };

  /* ---------------------------------------------------- one lane on the screen */
  function Lane(id) {
    const L = trace.lanes;
    if (id === 'tokens') {
      return h('div', { class: 'vz-chips' }, L.tokens.map((t, i) => h('span', { class: `vz-chip${t.filler ? ' filler' : ''}`, style: `--d:${i * 70}ms`, title: t.filler ? 'Filler: thrown away' : 'Kept' }, t.text)),
        h('p', { class: 'vz-note' }, `${L.tokens.filter((t) => !t.filler).length} pieces kept, ${L.tokens.filter((t) => t.filler).length} faded out.`));
    }
    if (id === 'meaning') {
      return h('ul', { class: 'vz-meaning' }, L.meaning.map((m, i) => h('li', { style: `--d:${i * 90}ms` },
        h('span', { class: `vz-chip${m.kind ? ' lit' : ' grey'}` }, m.text),
        h('i', { class: 'vz-arrow' }, m.kind ? '→' : '·'),
        m.kind ? h('span', { class: `vz-tag ${KIND_TONE[m.kind]}`, title: m.ids ? `${m.ids.length}${m.more ? ` of ${m.ids.length + m.more}` : ''} things share this word` : '' }, m.label) : h('span', { class: 'vz-tag none' }, 'no word for this'))));
    }
    if (id === 'retrieval') return Retrieval(L.retrieval);
    if (id === 'attention') {
      const W = L.attention.weights;
      return h('div', { class: 'vz-attn' },
        h('ol', { class: 'vz-bars' }, L.attention.facts.slice(0, big ? 10 : 7).map((a, i) => h('li', { style: `--d:${i * 80}ms`, title: `closeness ${a.parts.near.toFixed(2)} · links ${a.parts.links.toFixed(2)} · words ${a.parts.words.toFixed(2)}` },
          h('span', { class: 'vz-bar-name' }, a.name),
          h('span', { class: 'vz-bar' },
            h('i', { class: 'near', style: `width:${(a.parts.near / Math.max(1e-9, a.raw)) * a.weight * 100}%` }),
            h('i', { class: 'links', style: `width:${(a.parts.links / Math.max(1e-9, a.raw)) * a.weight * 100}%` }),
            h('i', { class: 'words', style: `width:${(a.parts.words / Math.max(1e-9, a.raw)) * a.weight * 100}%` })),
          h('b', {}, a.weight.toFixed(2))))),
        h('div', { class: 'vz-sliders' }, [['near', 'Closeness'], ['links', 'Links'], ['words', 'Word match']].map(([k, label]) => h('label', { class: `vz-slider ${k}` },
          h('span', {}, label),
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: W[k], disabled: !canSet, 'aria-label': `${label} weight`, onchange: (e) => onWeights({ ...W, [k]: Number(e.target.value) }) }),
          h('b', {}, Number(W[k]).toFixed(2))))));
    }
    if (id === 'reasoning') {
      return h('ol', { class: 'vz-chain' }, L.reasoning.length ? L.reasoning.map((r, i) => h('li', { class: r.fits === true ? 'fires' : r.fits === false ? 'misses' : 'quiet', style: `--d:${i * 150}ms` },
        h('span', { class: 'vz-chain-dot' }), h('b', {}, r.name), h('span', {}, r.text))) : h('li', { class: 'quiet' }, 'Nothing to reason about.'));
    }
    const A = L.answer;
    return h('div', { class: 'vz-answer' },
      h('p', {}, A.phrases.map((p, i) => h('span', { class: `vz-phrase${p.facts.length ? '' : ' bare'}`, style: `--d:${i * 400}ms`, title: p.facts.length ? `From ${p.facts.length} fact${p.facts.length === 1 ? '' : 's'}${p.rule ? ` and the rule “${p.rule}”` : ''}` : 'No facts behind this' }, `${p.text} `))),
      h('div', { class: `vz-confidence ${A.confidence}` }, h('span', {}, 'Evidence'), h('i', {}), h('i', {}), h('i', {}), h('b', {}, A.confidence)));
  }

  function Retrieval(R) {
    const W = big ? 640 : 340, H = big ? 300 : 150;
    const lay = plotLayout(graph, R.nodes, { max: big ? 48 : 36, iterations: 140, gravity: 0.7 });
    const labelled = new Set();
    const byId = Object.fromEntries(R.nodes.map((n) => [n.id, n]));
    const box = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'vz-graph', role: 'img', 'aria-label': `${R.nodes.length} facts lit, from ${R.nodes.filter((n) => n.seed).length} matches` });
    const P = (nd) => [10 + nd.x * (W - 20), 8 + nd.y * (H - 16)];
    for (const [i, j] of lay.edges) {
      const a = lay.nodes[i], b = lay.nodes[j];
      const hop = Math.max(byId[a.id].hop, byId[b.id].hop);
      const [x1, y1] = P(a), [x2, y2] = P(b);
      svg('line', { x1, y1, x2, y2, class: `vz-edge h${hop}`, style: `--d:${hop * 700}ms` }, box);
    }
    lay.nodes.forEach((nd) => {
      const n = byId[nd.id];
      const [x, y] = P(nd);
      const c = svg('circle', { cx: x, cy: y, r: (n.seed ? 4.5 : 3) * (big ? 1.4 : 1), class: `vz-node h${n.hop}${n.seed ? ' seed' : ''}${n.inPatch ? ' patch' : ''}`, style: `--d:${n.hop * 700}ms` }, box);
      svg('title', {}, c).textContent = `${n.name} · ${n.seed ? `matched by ${n.why}` : `${n.hop} hop${n.hop === 1 ? '' : 's'} out`} · glow ${n.act}`;
      // Label each matched name once, and only a few, so the picture stays readable.
      if (n.seed && !labelled.has(n.name) && labelled.size < (big ? 8 : 4)) { labelled.add(n.name); const t = svg('text', { x: x + 6, y: y - 5, class: 'vz-node-label' }, box); t.textContent = n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name; }
    });
    return h('div', { class: 'vz-retrieval' }, box,
      h('div', { class: 'vz-legend' }, h('span', { class: 'h0' }, 'matched'), h('span', { class: 'h1' }, '1 hop'), h('span', { class: 'h2' }, '2 hops'),
        h('small', {}, `${R.reached} of ${R.of} facts reached`)));
  }

  /* ---------------------------------------------------- the panel */
  const q = h('input', { class: 'vz-q', value: trace.question, maxlength: 140, disabled: !canSet, 'aria-label': 'Ask the visualiser a question', placeholder: 'Ask a question of your facts…',
    onkeydown: (e) => { if (e.key === 'Enter') ask(); } });
  const ask = () => { const v = q.value.trim(); if (!v) return; state.lane = 0; state.playing = true; onAsk(v); };
  const speed = h('div', { class: 'vz-speed', role: 'radiogroup', 'aria-label': 'Speed' }, Object.keys(SPEEDS).map((s) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(state.speed === s), class: state.speed === s ? 'on' : '', onclick: (e) => {
      state.speed = s;
      for (const b of speed.children) { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    },
  }, s)));
  const root = h('div', { class: `vz-panel${big ? ' big' : ''}` },
    h('div', { class: 'vz-ask' }, q, h('button', { type: 'button', class: 'vz-go', disabled: !canSet, onclick: ask, title: 'Ask, and watch it think' }, 'Ask'),
      onExpand ? h('button', { type: 'button', class: 'vz-btn', title: 'Open big, in a tray', onclick: () => { pause(); onExpand(); } }, icon('fit', 13)) : null),
    lights, screen, lens,
    h('div', { class: 'vz-deck' },
      h('button', { type: 'button', class: 'vz-btn', title: 'Back to the start', onclick: () => { pause(); state.lane = 0; paint(); } }, icon('skipBack', big ? 16 : 13)),
      h('button', { type: 'button', class: 'vz-btn', title: 'Step back', onclick: () => step(-1) }, '‹'),
      playBtn,
      h('button', { type: 'button', class: 'vz-btn', title: 'Step forward', onclick: () => step(1) }, '›'),
      h('button', { type: 'button', class: 'vz-btn', title: 'Straight to the answer', onclick: () => { pause(); state.lane = LANES.length - 1; paint(); } }, '⏭'),
      speed),
    h('p', { class: 'vz-honest' }, 'A toy engine, not a real language model. It shows the shape of what real AI does, slowly, so you can question it.'));
  paint();
  if (state.playing) timer = setTimeout(tick, SPEEDS[state.speed] ?? SPEEDS.normal);
  return root;
}
