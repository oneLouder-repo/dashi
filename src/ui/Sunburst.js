import { h } from './dom.js';

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
 */
export function Sunburst({ data, color, edge = null, hatched = null, onLeaf = null, caption = '', size = 560, label = 'Sunburst chart', focus = null, onZoom = null, onHover = null, tip = null }) {
  const wrap = h('div', { class: 'sunburst', style: `--sb-size:${size}px` }, h('div', { class: 'sunburst-loading muted small' }, 'Drawing…'));
  loadD3().then((d3) => draw(d3, wrap, { data, color, edge, hatched, onLeaf, caption, size, label, focusPath: focus, onZoom, onHover, tip })).catch(() => {
    wrap.replaceChildren(h('p', { class: 'muted small' }, 'The chart could not load.'));
  });
  return wrap;
}

/** Dark or white text, whichever reads better on this fill. */
function inkOn(d3, fill) {
  const c = d3.rgb(fill);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return L > 0.36 ? '#1d2230' : '#ffffff';
}

function draw(d3, wrap, { data, color, edge, hatched, onLeaf, caption, size, label, focusPath, onZoom, onHover, tip }) {
  const id = `sb${++n}`;
  const radius = size / 6;
  const hier = d3.hierarchy(data).sum((d) => (d.children?.length ? 0 : Math.max(0, d.value ?? 1))).sort((a, b) => b.value - a.value);
  const root = d3.partition().size([2 * Math.PI, hier.height + 1])(hier);
  root.each((d) => { d.current = d; });
  const arc = d3.arc()
    .startAngle((d) => d.x0).endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5)
    .innerRadius((d) => d.y0 * radius).outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));
  // Since the 0.2 polish, colour and white swap places: each arc is nearly white, with a thick stripe of its colour along its outer edge.
  const STRIPE = Math.max(5, Math.round(radius / 11));
  const stripeArc = d3.arc()
    .startAngle((d) => d.x0).endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5)
    .innerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1 - STRIPE)).outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));
  const visible = (d) => d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  // A label shows only where the ring is wide enough around for a line of text.
  const labelVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && ((d.y0 + d.y1) / 2) * radius * (d.x1 - d.x0) > 13;
  const labelTransform = (d) => {
    const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  };
  // Labels run across a ring, so they get the ring's depth (less a margin) and no more.
  const maxChars = Math.max(6, Math.floor((radius - 14) / 6.1));
  const fit = (s) => (s.length > maxChars ? `${s.slice(0, maxChars - 1).trimEnd()}…` : s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = d3.create('svg').attr('viewBox', [-size / 2, -size / 2, size, size]).attr('class', 'sunburst-svg').attr('role', 'group').attr('aria-label', label);
  const defs = svg.append('defs');
  defs.append('pattern').attr('id', `${id}-hatch`).attr('patternUnits', 'userSpaceOnUse').attr('width', 7).attr('height', 7).attr('patternTransform', 'rotate(45)')
    .append('rect').attr('width', 3).attr('height', 7).attr('fill', 'rgba(29,34,48,.13)');
  const g = svg.append('g');
  const nodes = root.descendants().slice(1);
  const fills = new Map(nodes.map((d) => [d, color(d)]));
  const wash = new Map(nodes.map((d) => [d, d3.interpolateRgb(fills.get(d), '#ffffff')(0.88)]));
  // Every ring at the same strength: no paler veil the deeper you go.
  const path = g.append('g').selectAll('path').data(nodes).join('path')
    .attr('class', 'sb-arc')
    .attr('fill', (d) => wash.get(d))
    .attr('fill-opacity', (d) => +visible(d.current))
    .attr('pointer-events', (d) => (visible(d.current) ? 'auto' : 'none'))
    .attr('stroke', (d) => (edge?.(d) ?? '#dfe3ec'))
    .attr('stroke-width', (d) => (edge?.(d) ? 2.5 : 1))
    .attr('stroke-opacity', (d) => +visible(d.current))
    .attr('tabindex', (d) => (visible(d.current) ? 0 : -1))
    .attr('role', 'button')
    .attr('aria-label', (d) => `${d.data.name}: ${d.value}${d.children ? ', open' : ''}`)
    .attr('d', (d) => arc(d.current));
  // Each arc's stripe, in its full colour.
  const stripes = g.append('g').attr('pointer-events', 'none').selectAll('path').data(nodes).join('path')
    .attr('class', 'sb-stripe').attr('fill', (d) => fills.get(d)).attr('fill-opacity', (d) => +visible(d.current)).attr('d', (d) => stripeArc(d.current));
  // Drafts: the same arc again, striped.
  const hatch = hatched ? g.append('g').attr('pointer-events', 'none').selectAll('path').data(nodes.filter((d) => hatched(d))).join('path')
    .attr('fill', `url(#${id}-hatch)`).attr('fill-opacity', (d) => +visible(d.current)).attr('d', (d) => arc(d.current)) : null;

  // A floating tooltip with the whole name and where it sits.
  const tipEl = h('div', { class: 'sb-tip', role: 'tooltip', hidden: true });
  const trail = (d) => d.ancestors().map((a) => a.data.name).reverse().slice(1);
  const tipText = (d) => tip?.(d) ?? `${trail(d).join(' › ')}\n${d.value} ${d.value === 1 ? 'item' : 'items'}${d.children ? ' · click to open' : ''}`;
  const showTip = (e, d) => {
    const [title, ...rest] = tipText(d).split('\n');
    tipEl.replaceChildren(h('strong', {}, d.data.name), h('span', {}, title === d.data.name ? '' : title), ...rest.map((r) => h('small', {}, r)));
    tipEl.hidden = false;
    const box = wrap.getBoundingClientRect();
    const x = (e.clientX ?? box.left + box.width / 2) - box.left, y = (e.clientY ?? box.top + box.height / 2) - box.top;
    tipEl.style.left = `${Math.min(box.width - 12, Math.max(12, x))}px`;
    tipEl.style.top = `${y}px`;
    tipEl.classList.toggle('flip', x > box.width * 0.6);
    onHover?.(d.data, d);
  };
  const hideTip = () => { tipEl.hidden = true; onHover?.(null, null); };
  path.style('cursor', 'pointer')
    .on('pointermove', showTip).on('pointerleave', hideTip)
    .on('focus', (e, d) => { const r = e.target.getBoundingClientRect(); showTip({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, d); })
    .on('blur', hideTip)
    .on('click', (e, d) => (d.children ? zoom(e, d) : onLeaf?.(d.data, e)))
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (d.children) zoom(e, d); else onLeaf?.(d.data, e); } });

  const text = g.append('g').attr('pointer-events', 'none').attr('text-anchor', 'middle').style('user-select', 'none')
    .selectAll('text').data(nodes).join('text')
    .attr('class', 'sb-label').attr('dy', '0.35em')
    .attr('fill', (d) => inkOn(d3, wash.get(d)))
    .attr('fill-opacity', (d) => +labelVisible(d.current))
    .attr('transform', (d) => labelTransform(d.current))
    .text((d) => fit(d.data.name));

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
    capSub.text(p === root ? `${root.value}` : `${p.value} · back`);
  };
  setCaption(root);
  svg.on('keydown', (e) => { if (e.key === 'Escape' && focus !== root) zoom(e, focus.parent ?? root); });

  let focus = root;
  function zoom(event, p, { instant = false } = {}) {
    focus = p;
    hideTip();
    centre.datum(p.parent ?? root);
    setCaption(p);
    root.each((d) => {
      d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth),
      };
    });
    if (!instant) onZoom?.(p === root ? [] : trail(p), p.data);
    path.attr('pointer-events', (d) => (visible(d.target) ? 'auto' : 'none')).attr('tabindex', (d) => (visible(d.target) ? 0 : -1));
    if (instant) {
      root.each((d) => { d.current = d.target; });
      path.attr('fill-opacity', (d) => +visible(d.target)).attr('stroke-opacity', (d) => +visible(d.target)).attr('d', (d) => arc(d.current));
      hatch?.attr('fill-opacity', (d) => +visible(d.target)).attr('d', (d) => arc(d.current));
      stripes.attr('fill-opacity', (d) => +visible(d.target)).attr('d', (d) => stripeArc(d.current));
      text.attr('fill-opacity', (d) => +labelVisible(d.target)).attr('transform', (d) => labelTransform(d.current));
      return;
    }
    const t = svg.transition().duration(reduce ? 0 : event?.altKey ? 7500 : 750);
    path.transition(t)
      .tween('data', (d) => { const i = d3.interpolate(d.current, d.target); return (tt) => { d.current = i(tt); }; })
      .filter(function (d) { return +this.getAttribute('fill-opacity') || visible(d.target); })
      .attr('fill-opacity', (d) => +visible(d.target))
      .attr('stroke-opacity', (d) => +visible(d.target))
      .attrTween('d', (d) => () => arc(d.current));
    stripes.transition(t).attr('fill-opacity', (d) => +visible(d.target)).attrTween('d', (d) => () => stripeArc(d.current));
    if (hatch) hatch.transition(t).attr('fill-opacity', (d) => +visible(d.target)).attrTween('d', (d) => () => arc(d.current));
    text.filter(function (d) { return +this.getAttribute('fill-opacity') || labelVisible(d.target); }).transition(t)
      .attr('fill-opacity', (d) => +labelVisible(d.target))
      .attrTween('transform', (d) => () => labelTransform(d.current));
  }
  // Open where we were: follow the names down as far as they still match.
  if (focusPath?.length) {
    let p = root;
    for (const name of focusPath) { const next = p.children?.find((c) => c.data.name === name); if (!next?.children) break; p = next; }
    if (p !== root) zoom(null, p, { instant: true });
  }
  wrap.replaceChildren(svg.node(), tipEl);
}

/** A hex colour lifted towards white by t (0–1), for a ring a step lighter than its parent. */
export function tint(hex, t) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const ch = (s) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}
