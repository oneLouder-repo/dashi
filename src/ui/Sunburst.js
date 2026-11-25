import { h } from './dom.js';
import { snap, tint as lift, INK } from './wheel.js';

/**
 * A zoomable sunburst, after Mike Bostock's (observablehq.com/@d3/zoomable-sunburst),
 * drawn with the vendored D3 v7. Rings run from the centre out; three show
 * at a time. Click a ring to zoom into it, the centre to step back out,
 * and a leaf (a ring with nothing under it) to open it.
 *
 *   Sunburst({
 *     data,                  // { name, children: [...] } or a leaf { name, value }
 *     color: (d) => '#hex',  // d is the d3 node; d.data is yours
 *     edge: (d) => '#hex',   // optional outline, e.g. a traffic light
 *     hatched: (d) => bool,  // optional: draw it striped (a draft)
 *     onLeaf: (data, e) => …,
 *     caption: 'All assets', // the centre's label at the top
 *     size: 560,
 *   })
 *
 * Returns an element straight away; the chart draws when D3 has loaded.
 * Keyboard: Tab to a ring, Enter to zoom in (or open a leaf), Escape to step out.
 */
let d3p = null;
export const loadD3 = () => (d3p ??= import('../../vendor/d3/d3.min.js').then(() => globalThis.d3));

let n = 0;
/**
 * More options:
 *   focus: ['Name', 'Child name']  open zoomed into this path (by name), without animating,
 *                                  so a redraw keeps you where you were
 *   onZoom: (path) => …           the names from the root to the ring now in the middle
 *   onHover: (data|null, d) => …  for a details panel beside the chart
 *   tip: (d) => 'text'            what the floating tooltip says (default: the path and count)
 *   trail: true                   a breadcrumb above the chart, one chip per ring from the centre to
 *                                 where you are, in each ring's colour; click one to go back to it
 *   onDraw: (fillOf) => …         once drawn: fillOf(data) gives the colour a ring was drawn in,
 *                                 so a details panel can match it
 *   group: 24                     a ring with more items than this under one parent is gathered into
 *                                 A–Z groups (each one a ring you can open); false turns it off
 *
 * Alpha 0.3 PR 10 (keeping context as you dig): the trail shows the way back,
 * the centre takes a pale wash of the ring you're inside, and clicking a leaf
 * picks it in place (a black outline) instead of zooming the whole chart into
 * it. The element gets zoomTo(match), where match(data) picks the ring to open.
 */
export function Sunburst({ data, color, edge = null, hatched = null, onLeaf = null, caption = '', size = 560, label = 'Sunburst chart', focus = null, onZoom = null, onHover = null, tip = null, trail = true, onDraw = null, picked = null, group = 24 }) {
  const wrap = h('div', { class: 'sunburst', style: `--sb-size:${size}px` }, h('div', { class: 'sunburst-loading muted small' }, 'Drawing…'));
  loadD3().then((d3) => draw(d3, wrap, { data: group ? regroup(data, group) : data, color, edge, hatched, onLeaf, caption, size, label, focusPath: focus, onZoom, onHover, tip, showTrail: trail, onDraw, picked })).catch(() => {
    wrap.replaceChildren(h('p', { class: 'muted small' }, 'The chart could not load.'));
  });
  return wrap;
}

/**
 * Alpha 0.3 PR 16: big rings, gathered. Hundreds of assets in one ring are
 * slivers too thin to see, point at or read. Any parent with more than `max`
 * items gets them sorted by name and gathered into groups ("A–C", "D–F"…),
 * each a ring of its own to open. A group's data keeps the parent's id (so a
 * details panel can show the parent) and marks itself with `group`.
 * The input isn't changed.
 */
export function regroup(node, max = 24) {
  if (!node?.children?.length) return node;
  let kids = node.children.map((k) => regroup(k, max));
  if (kids.length <= max) return { ...node, children: kids };
  const name = (k) => String(k.name ?? '').trim();
  kids = [...kids].sort((a, b) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true }));
  // Gather, and gather the groups again if there are still too many.
  let level = kids;
  while (level.length > max) {
    // Groups of about a dozen: big enough to matter, small enough to read as a ring.
    const count = Math.ceil(level.length / 12);
    const per = Math.ceil(level.length / count);
    const next = [];
    for (let i = 0; i < level.length; i += per) {
      const part = level.slice(i, i + per);
      const first = part[0].group ? part[0].group.from : name(part[0]);
      const last = part.at(-1).group ? part.at(-1).group.to : name(part.at(-1));
      const items = part.reduce((n, k) => n + (k.group ? k.group.items : 1), 0);
      next.push({ name: '', id: node.id, children: part, _order: next.length, group: { from: first, to: last, items, of: node.name } });
    }
    // Named by first letters, "A–C"; groups that share one letter are numbered, "B 1", "B 2".
    const letter = (s) => (s.trim().charAt(0) || '…').toUpperCase();
    const raw = next.map((g) => { const a = letter(g.group.from), b = letter(g.group.to); return a === b ? a : `${a}–${b}`; });
    const seen = {};
    next.forEach((g, i) => { const same = raw.filter((r) => r === raw[i]).length; seen[raw[i]] = (seen[raw[i]] ?? 0) + 1; g.name = same > 1 ? `${raw[i]} ${seen[raw[i]]}` : raw[i]; });
    level = next;
  }
  return { ...node, children: level };
}
/** Dark or white text, whichever reads better on this fill. */
function inkOn(d3, fill) {
  const c = d3.rgb(fill);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return L > 0.36 ? '#1d2230' : '#ffffff';
}

/**
 * Alpha 0.3: every sunburst and ring in Dashi takes the Assets sunburst's
 * look, mid-tone solid colour. Whatever colour a page asks for is brought
 * into that band: no neon, no near-black, no washed-out pastel.
 */
export function calm(d3, fill) {
  const c = d3.hsl(fill);
  if (Number.isNaN(c.h) || c.s < 0.2) return fill; // greys stay as they are
  // Alpha 0.3 colour wheel: every colour lands on the nearest wheel hue; a pale one stays a step lighter.
  const base = snap(c.formatHex());
  // A colour asked for paler than its wheel hue keeps that step (alpha 0.3 PR 10), so rings deeper
  // in a tree stay a readable step lighter instead of all landing on the same pale band.
  const bl = d3.hsl(base).l;
  const t = c.l > bl ? Math.min(0.7, (c.l - bl) / (1 - bl)) : 0;
  return t > 0.04 ? lift(base, t) : base;
}

function draw(d3, wrap, { data, color, edge, hatched, onLeaf, caption, size, label, focusPath, onZoom, onHover, tip, showTrail, onDraw, picked }) {
  const id = `sb${++n}`;
  const radius = size / 6;
  const hier = d3.hierarchy(data).sum((d) => (d.children?.length ? 0 : Math.max(0, d.value ?? 1)))
    // Groups keep their A–Z order; everything else runs biggest first.
    .sort((a, b) => (a.data._order ?? -1) - (b.data._order ?? -1) || b.value - a.value);
  const root = d3.partition().size([2 * Math.PI, hier.height + 1])(hier);
  // The last ring always reaches the outer edge: an item with nothing inside fills the rest of the band.
  const reach = (t, d) => (d.children || t.y0 >= 3 || t.y1 > 3 ? t : { ...t, y1: 3 });
  root.each((d) => { d.current = reach({ x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 }, d); });
  const arc = d3.arc()
    .startAngle((d) => d.x0).endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5)
    .innerRadius((d) => d.y0 * radius).outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));
  const visible = (d) => d.y1 <= 3 && d.y0 >= 1 && d.x1 - d.x0 > 1e-6;
  // A label shows only where the ring is wide enough around for a line of text.
  const labelVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && (d.y0 * radius + 10) * (d.x1 - d.x0) > 13;
  /*
   * Alpha 0.4: labels sit level with the screen, whatever the angle, so they
   * read without tilting your head. Each starts by the inner edge of its
   * segment (the side nearest the centre) and runs outwards; near twelve and
   * six o'clock, where outwards is up or down, it sits centred in the ring.
   */
  const SIDE = 0.3;
  const sinOf = (d) => Math.sin((d.x0 + d.x1) / 2);
  const labelTransform = (d) => {
    const a = (d.x0 + d.x1) / 2;
    const s = Math.sin(a);
    const r = Math.abs(s) > SIDE ? d.y0 * radius + 7 : ((d.y0 + Math.min(3, d.y1)) / 2) * radius;
    return `translate(${Math.sin(a) * r},${-Math.cos(a) * r})`;
  };
  const anchorOf = (d) => { const s = sinOf(d); return s > SIDE ? 'start' : s < -SIDE ? 'end' : 'middle'; };
  // A label tween that keeps the anchor in step with the angle as the rings turn.
  const labelTween = function (d) { const el = this; return () => { el.setAttribute('text-anchor', anchorOf(d.current)); return labelTransform(d.current); }; };
  // Room for a label: outwards across the ring at the sides, along the arc near the top and bottom.
  const maxChars = Math.max(6, Math.floor((radius - 14) / 6.1));
  const fit = (s, n = maxChars) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const roomFor = (d) => {
    const depth = (Math.min(3, d.y1) - d.y0) * radius;
    const s = Math.abs(sinOf(d));
    const px = s > SIDE ? Math.min(depth / s, depth * 1.5) - 12 : Math.min(((d.y0 + Math.min(3, d.y1)) / 2) * radius * (d.x1 - d.x0), depth * 1.5) - 8;
    return Math.max(4, Math.floor(px / 6.1));
  };
  const relabel = () => text.text((d) => fit(d.data.name, roomFor(d.current)));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PAD = 12; // room on the right for the pointer at three o'clock
  const svg = d3.create('svg').attr('viewBox', [-size / 2 - PAD, -size / 2 - PAD, size + 2 * PAD, size + 2 * PAD]).attr('class', 'sunburst-svg').attr('role', 'group').attr('aria-label', label);
  const defs = svg.append('defs');
  defs.append('pattern').attr('id', `${id}-hatch`).attr('patternUnits', 'userSpaceOnUse').attr('width', 7).attr('height', 7).attr('patternTransform', 'rotate(45)')
    .append('rect').attr('width', 3).attr('height', 7).attr('fill', 'rgba(255,255,255,.5)');
  const g = svg.append('g');
  const nodes = root.descendants().slice(1);
  // A group is coloured as its first item would be, at the group's own depth.
  const firstReal = (d) => { let x = d; while (x.data.group && x.children?.length) x = x.children[0]; return x.data; };
  const colourOf = (d) => (d.data.group ? color(Object.create(d, { data: { value: firstReal(d) } })) : color(d));
  const fills = new Map(nodes.map((d) => [d, calm(d3, colourOf(d))]));
  // Every ring at the same strength: no paler veil the deeper you go.
  const path = g.append('g').selectAll('path').data(nodes).join('path')
    .attr('class', 'sb-arc')
    .attr('fill', (d) => fills.get(d))
    .attr('fill-opacity', (d) => +visible(d.current))
    .attr('pointer-events', (d) => (visible(d.current) ? 'auto' : 'none'))
    .attr('stroke', (d) => (edge?.(d) ?? '#fff'))
    .attr('stroke-width', (d) => (edge?.(d) ? 2.5 : 2))
    .attr('stroke-linejoin', 'round')
    .attr('stroke-opacity', (d) => +visible(d.current))
    .attr('tabindex', (d) => (visible(d.current) ? 0 : -1))
    .attr('role', 'button')
    .attr('aria-label', (d) => `${d.data.name}: ${d.value}${d.children ? ', open' : ''}`)
    .attr('d', (d) => arc(d.current));
  // Drafts: the same arc again, striped.
  const hatch = hatched ? g.append('g').attr('pointer-events', 'none').selectAll('path').data(nodes.filter((d) => hatched(d))).join('path')
    .attr('fill', `url(#${id}-hatch)`).attr('fill-opacity', (d) => +visible(d.current)).attr('d', (d) => arc(d.current)) : null;

  // A floating tooltip with the whole name and where it sits.
  const tipEl = h('div', { class: 'sb-tip', role: 'tooltip', hidden: true });
  const stepper = h('div', { class: 'sb-step', hidden: true, role: 'group', 'aria-label': 'Turn the dial' },
    h('button', { type: 'button', title: 'The item before (↑)', 'aria-label': 'The item before', onclick: (e) => step(-1, e) }, '▲'),
    h('button', { type: 'button', title: 'The item after (↓)', 'aria-label': 'The item after', onclick: (e) => step(1, e) }, '▼'));
  const trail = (d) => d.ancestors().map((a) => a.data.name).reverse().slice(1);
  const tipText = (d) => d.data.group ? `${d.data.group.of}, ${d.data.name}\n${d.data.group.items} items, A–Z · click to open` : tip?.(d) ?? `${trail(d).join(' › ')}\n${d.value} ${d.value === 1 ? 'item' : 'items'}${d.children ? ' · click to open' : ''}`;
  // The details panel follows the item under the pointer, not every pixel of movement: it changes only
  // when the item does, and going back to the centre's details waits a moment, so crossing the gaps
  // between arcs doesn't flicker it.
  let hovered = null, leaveTimer = 0;
  const hover = (d) => {
    clearTimeout(leaveTimer);
    if (d === hovered) return;
    // A short rest before the panel changes, so sweeping across the rings doesn't flash every arc passed.
    leaveTimer = setTimeout(() => { hovered = d; onHover?.(d ? d.data : null, d); }, d ? 90 : 260);
  };
  const showTip = (e, d) => {
    const [title, ...rest] = tipText(d).split('\n');
    tipEl.replaceChildren(h('strong', {}, d.data.name), h('span', {}, title === d.data.name ? '' : title), ...rest.map((r) => h('small', {}, r)));
    tipEl.hidden = false;
    const box = wrap.getBoundingClientRect();
    const x = (e.clientX ?? box.left + box.width / 2) - box.left, y = (e.clientY ?? box.top + box.height / 2) - box.top;
    tipEl.style.left = `${Math.min(box.width - 12, Math.max(12, x))}px`;
    tipEl.style.top = `${y}px`;
    tipEl.classList.toggle('flip', x > box.width * 0.6);
    hover(d);
  };
  const hideTip = () => { tipEl.hidden = true; hover(null); };
  path.style('cursor', 'pointer')
    .on('pointermove', showTip).on('pointerleave', hideTip)
    .on('focus', (e, d) => { const r = e.target.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, d); })
    .on('blur', hideTip)
    // The last click goes all the way in too: the item fills the whole ring, and the page can show it.
    // A ring with more inside zooms in; a leaf is picked where it is, so the rings around it stay in view.
    .on('click', (e, d) => { if (d.children) { if (d !== focus) zoom(e, d); } else pick(d, e); })
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (d.children) { if (d !== focus) zoom(e, d); } else pick(d, e); } });
  let chosen = null;
  function pick(d, e, { instant = false } = {}) {
    chosen = d;
    path.attr('stroke', (x) => (x === chosen ? INK : edge?.(x) ?? '#fff')).attr('stroke-width', (x) => (x === chosen ? 3 : edge?.(x) ? 2.5 : 2));
    path.filter((x) => x === chosen).raise();
    stepper.hidden = false;
    turnTo(d, { instant });
    if (e !== null) onLeaf?.(d.data, e);
  }
  function unpick() {
    chosen = null;
    path.attr('stroke', (x) => edge?.(x) ?? '#fff').attr('stroke-width', (x) => (edge?.(x) ? 2.5 : 2));
    stepper.hidden = true;
    showFocus();
  }
  /*
   * Alpha 0.3 PR 16: the picked item reads in full. Once it has turned to three
   * o'clock, a level name tag sits over it (wrapped to three lines if it needs
   * them), and a pointer marks the spot, like the needle on a dial. Up and
   * down (keys, or the small buttons by the pointer) turn the dial to the
   * item before or after it in the same ring.
   */
  const ringOf = (d) => nodes.filter((x) => x.depth === chosen?.depth && visible(x.current) && !x.children).sort((a, b) => a.x0 - b.x0);
  function step(dir, e) {
    if (!chosen) return;
    const ring = ringOf(chosen);
    if (ring.length < 2) return;
    const i = ring.indexOf(chosen);
    pick(ring[(i + dir + ring.length) % ring.length], e ?? {});
  }
  function showFocus() {
    focusTag.selectAll('*').remove();
    pointer.attr('opacity', chosen ? 1 : 0);
    relabel();
    text.attr('fill-opacity', (x) => (x === chosen ? 0 : +labelVisible(x.current)));
    if (!chosen) return;
    // The tag sits against the outer edge of the picked ring and may reach in over the ring inside
    // it, so a long name gets room to read.
    const r1 = Math.min(3, Math.max(chosen.current.y1, chosen.current.y0 + 0.6)) * radius;
    const room = Math.min(170, r1 - radius - 14);
    const per = Math.max(8, Math.floor((room - 12) / 6.3));
    const lines = wrapText(chosen.data.name, per, 3);
    const lh = 13;
    const w = Math.min(room, Math.max(...lines.map((l) => l.length)) * 6.3 + 14);
    const hgt = lines.length * lh + 8;
    const cx = r1 - 7 - w / 2;
    const fill = fills.get(chosen);
    focusTag.append('rect').attr('x', cx - w / 2).attr('y', -hgt / 2).attr('width', w).attr('height', hgt).attr('rx', 3)
      .attr('fill', fill).attr('stroke', INK).attr('stroke-width', 1.5);
    const t = focusTag.append('text').attr('class', 'sb-focus-label').attr('text-anchor', 'middle').attr('fill', inkOn(d3, fill));
    lines.forEach((l, i) => t.append('tspan').attr('x', cx).attr('y', -hgt / 2 + 4 + lh * (i + 0.5)).attr('dy', '0.35em').text(l));
  }
  /*
   * Alpha 0.3 PR 13: the picked item turns to three o'clock, with easing, so its
   * name sits level on the right, centred in its ring. The whole chart turns
   * with it; the next zoom straightens it out again.
   */
  function turnTo(d, { instant = false } = {}) {
    const mid = (d.current.x0 + d.current.x1) / 2;
    let delta = Math.PI / 2 - mid;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // the short way round
    if (Math.abs(delta) < 1e-3) { showFocus(); return; }
    root.each((x) => { x.target = { ...x.current, x0: x.current.x0 + delta, x1: x.current.x1 + delta }; });
    if (instant || reduce) {
      root.each((x) => { x.current = x.target; });
      path.attr('d', (x) => arc(x.current));
      hatch?.attr('d', (x) => arc(x.current));
      text.attr('transform', (x) => labelTransform(x.current)).attr('text-anchor', (x) => anchorOf(x.current));
      showFocus();
      return;
    }
    focusTag.selectAll('*').remove();
    // A short step (the next item along) turns quickly; a long way round takes its time.
    const t = svg.transition().duration(Math.round(380 + 520 * Math.min(1, Math.abs(delta) / Math.PI))).ease(d3.easeCubicInOut);
    t.end().then(showFocus, () => {});
    path.transition(t)
      .tween('data', (x) => { const i = d3.interpolate(x.current, x.target); return (tt) => { x.current = i(tt); }; })
      .attrTween('d', (x) => () => arc(x.current));
    hatch?.transition(t).attrTween('d', (x) => () => arc(x.current));
    text.transition(t).attrTween('transform', labelTween);
  }

  const text = g.append('g').attr('pointer-events', 'none').attr('text-anchor', 'middle').style('user-select', 'none')
    .selectAll('text').data(nodes).join('text')
    .attr('class', 'sb-label').attr('dy', '0.35em')
    .attr('fill', (d) => inkOn(d3, fills.get(d)))
    .attr('fill-opacity', (d) => +labelVisible(d.current))
    .attr('transform', (d) => labelTransform(d.current))
    .attr('text-anchor', (d) => anchorOf(d.current))
    .text((d) => fit(d.data.name, roomFor(d.current)));

  const focusTag = g.append('g').attr('class', 'sb-focus').attr('pointer-events', 'none');
  const pointer = svg.append('path').attr('class', 'sb-pointer').attr('opacity', 0)
    .attr('d', `M${3 * radius + 1},0 l${PAD - 2},-7 v14 z`).attr('fill', INK);
  const centre = g.append('circle').datum(root).attr('r', radius - 2).attr('class', 'sb-centre').attr('pointer-events', 'all')
    .attr('tabindex', 0).attr('role', 'button').attr('aria-label', 'Step back out').on('click', (e, d) => zoom(e, d.parent ?? root))
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoom(e, d.parent ?? root); } });
  const cap = g.append('text').attr('class', 'sb-caption').attr('text-anchor', 'middle').attr('pointer-events', 'none');
  const capTop = cap.append('tspan').attr('x', 0).attr('dy', '-0.3em');
  const capSub = cap.append('tspan').attr('x', 0).attr('dy', '1.4em').attr('class', 'sb-caption-sub');
  const capMax = Math.floor((radius * 1.7) / 8);
  const setCaption = (p) => {
    const t = p === root ? caption : p.data.name;
    capTop.text(t.length > capMax ? `${t.slice(0, capMax - 1).trimEnd()}…` : t);
    const up = p.parent && p.parent !== root ? p.parent.data.name : caption;
    capSub.text(p === root ? `${root.value}` : `‹ back to ${up.length > capMax - 10 ? `${up.slice(0, capMax - 11).trimEnd()}…` : up}`);
    // The centre takes a pale wash of the ring you're inside, so you can see whose wedge this is.
    centre.style('fill', p === root ? null : lift(fills.get(p) ?? '#ffffff', 0.84));
    drawTrail(p);
  };
  // The breadcrumb: one chip per ring from the centre out to where you are, each in its ring's colour.
  const trailEl = showTrail ? h('nav', { class: 'sb-trail', 'aria-label': 'Where you are in the chart' }) : null;
  function drawTrail(p) {
    if (!trailEl) return;
    const steps = p.ancestors().reverse();
    trailEl.replaceChildren(h('ol', {}, steps.map((d, i) => {
      const last = i === steps.length - 1;
      const fill = d === root ? null : fills.get(d);
      const name = d === root ? caption : d.data.name;
      return h('li', { style: fill ? `--chip:${fill};--chip-ink:${inkOn(d3, fill)}` : '' },
        h('button', { type: 'button', class: `sb-chip${d === root ? ' root' : ''}`, 'aria-current': last ? 'location' : null, title: name, disabled: last, onclick: (e) => zoom(e, d) },
          h('span', {}, name.length > 28 ? `${name.slice(0, 27).trimEnd()}…` : name)));
    })));
  }
  root.each((d) => { if (d !== root) d.fill = fills.get(d); });
  setCaption(root);
  svg.on('keydown', (e) => {
    if (e.key === 'Escape' && focus !== root) zoom(e, centre.datum());
    else if (chosen && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { e.preventDefault(); step(1, e); }
    else if (chosen && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); step(-1, e); }
  });

  let focus = root;
  function zoom(event, p, { instant = false } = {}) {
    const outward = !!focus && p.depth < focus.depth;
    focus = p;
    hideTip();
    focusTag.selectAll('*').remove();
    pointer.attr('opacity', 0);
    let keep = chosen && chosen.ancestors().includes(p) && chosen !== p ? chosen : null;
    // An item with nothing inside is shown as the ring itself, around its parent in the centre.
    const leaf = !p.children && p !== root;
    const lift = leaf ? p.depth - 1 : p.depth;
    centre.datum(leaf ? p.parent : (p.parent ?? root));
    setCaption(p);
    root.each((d) => {
      d.target = reach({
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - lift),
        y1: Math.max(0, d.y1 - lift),
      }, d);
    });
    // Going back out can push the picked item past the outer ring: then let it go, so the
    // dial's arrows don't stay behind on something you can no longer see.
    if (keep && (outward || !visible(keep.target))) keep = null;
    if (chosen && !keep) unpick();
    if (!instant) onZoom?.(p === root ? [] : trail(p), p.data);
    path.attr('pointer-events', (d) => (visible(d.target) ? 'auto' : 'none')).attr('tabindex', (d) => (visible(d.target) ? 0 : -1));
    if (instant) {
      root.each((d) => { d.current = d.target; });
      path.attr('fill-opacity', (d) => +visible(d.target)).attr('stroke-opacity', (d) => +visible(d.target)).attr('d', (d) => arc(d.current));
      hatch?.attr('fill-opacity', (d) => +visible(d.target)).attr('d', (d) => arc(d.current));
      text.attr('fill-opacity', (d) => +labelVisible(d.target)).attr('transform', (d) => labelTransform(d.current)).attr('text-anchor', (d) => anchorOf(d.current));
      relabel();
      if (keep) turnTo(keep, { instant: true });
      return;
    }
    const t = svg.transition().duration(reduce ? 0 : event?.altKey ? 7500 : 750);
    // Still picked after the zoom (it's inside the ring you opened): turn it back to three o'clock.
    t.end().then(() => { relabel(); if (keep && chosen === keep) turnTo(keep); }, () => {});
    path.transition(t)
      .tween('data', (d) => { const i = d3.interpolate(d.current, d.target); return (tt) => { d.current = i(tt); }; })
      .filter(function (d) { return +this.getAttribute('fill-opacity') || visible(d.target); })
      .attr('fill-opacity', (d) => +visible(d.target))
      .attr('stroke-opacity', (d) => +visible(d.target))
      .attrTween('d', (d) => () => arc(d.current));
    if (hatch) hatch.transition(t).attr('fill-opacity', (d) => +visible(d.target)).attrTween('d', (d) => () => arc(d.current));
    text.filter(function (d) { return +this.getAttribute('fill-opacity') || labelVisible(d.target); }).transition(t)
      .attr('fill-opacity', (d) => +labelVisible(d.target))
      .attrTween('transform', labelTween);
  }
  // Open where we were: follow the names down as far as they still match.
  if (focusPath?.length) {
    let p = root;
    for (const name of focusPath) { const next = p.children?.find((c) => c.data.name === name); if (!next?.children) break; p = next; }
    if (p !== root) zoom(null, p, { instant: true });
  }
  const stage = h('div', { class: 'sb-stage' }, svg.node(), stepper);
  wrap.replaceChildren(...(trailEl ? [trailEl] : []), stage, tipEl);
  wrap.classList.toggle('with-trail', !!trailEl);
  // Open a ring from outside (a details panel's breadcrumb): zoom to it, or pick it if it's a leaf.
  wrap.zoomTo = (match) => {
    let hit = null;
    root.each((d) => { if (!hit && d !== root && match(d.data)) hit = d; });
    if (!hit) return zoom(null, root);
    if (hit.children) zoom(null, hit);
    else if (hit.parent !== focus) { zoom(null, hit.parent ?? root); setTimeout(() => pick(hit, null), reduce ? 0 : 780); }
    else pick(hit, null);
  };
  if (picked) { let hit = null; root.each((d) => { if (!hit && !d.children && picked(d.data)) hit = d; }); if (hit && visible(hit.current)) pick(hit, null, { instant: true }); }
  onDraw?.((data) => { let f = null; root.each((d) => { if (f == null && d.data === data) f = d.fill; }); return f; });
}

/** A hex colour lifted towards white by t (0–1), for a ring a step lighter than its parent. */
export function tint(hex, t) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const ch = (s) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Up to `max` lines of about `per` characters, broken at spaces; the last one ends in … if it runs over. */
export function wrapText(str, per, max = 3) {
  const words = String(str ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= per) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w.length > per ? `${w.slice(0, per - 1)}…` : w;
    if (lines.length === max) break;
  }
  if (cur && lines.length < max) lines.push(cur);
  if (lines.length === max && lines.join(' ').length < words.join(' ').length) {
    const l = lines[max - 1];
    lines[max - 1] = l.length >= per ? `${l.slice(0, per - 1).trimEnd()}…` : `${l}…`;
  }
  return lines.slice(0, max);
}
