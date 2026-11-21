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
export function Sunburst({ data, color, edge = null, hatched = null, onLeaf = null, caption = '', size = 560, label = 'Sunburst chart' }) {
  const wrap = h('div', { class: 'sunburst', style: `--sb-size:${size}px` }, h('div', { class: 'sunburst-loading muted small' }, 'Drawing…'));
  loadD3().then((d3) => draw(d3, wrap, { data, color, edge, hatched, onLeaf, caption, size, label })).catch(() => {
    wrap.replaceChildren(h('p', { class: 'muted small' }, 'The chart could not load.'));
  });
  return wrap;
}

function draw(d3, wrap, { data, color, edge, hatched, onLeaf, caption, size, label }) {
  const id = `sb${++n}`;
  const radius = size / 6;
  const hier = d3.hierarchy(data).sum((d) => (d.children?.length ? 0 : Math.max(0, d.value ?? 1))).sort((a, b) => b.value - a.value);
  const root = d3.partition().size([2 * Math.PI, hier.height + 1])(hier);
  root.each((d) => { d.current = d; });
  const arc = d3.arc()
    .startAngle((d) => d.x0).endAngle((d) => d.x1)
    .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5)
    .innerRadius((d) => d.y0 * radius).outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));
  const visible = (d) => d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  const labelVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.06;
  const labelTransform = (d) => {
    const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = d3.create('svg').attr('viewBox', [-size / 2, -size / 2, size, size]).attr('class', 'sunburst-svg').attr('role', 'group').attr('aria-label', label);
  const defs = svg.append('defs');
  defs.append('pattern').attr('id', `${id}-hatch`).attr('patternUnits', 'userSpaceOnUse').attr('width', 7).attr('height', 7).attr('patternTransform', 'rotate(45)')
    .append('rect').attr('width', 3).attr('height', 7).attr('fill', 'rgba(255,255,255,.55)');
  const g = svg.append('g');
  const nodes = root.descendants().slice(1);
  const path = g.append('g').selectAll('path').data(nodes).join('path')
    .attr('class', 'sb-arc')
    .attr('fill', (d) => color(d))
    .attr('fill-opacity', (d) => (visible(d.current) ? (d.children ? 0.85 : 0.65) : 0))
    .attr('pointer-events', (d) => (visible(d.current) ? 'auto' : 'none'))
    .attr('stroke', (d) => (edge?.(d) ?? null))
    .attr('stroke-width', (d) => (edge?.(d) ? 2 : null))
    .attr('tabindex', (d) => (visible(d.current) ? 0 : -1))
    .attr('role', 'button')
    .attr('aria-label', (d) => `${d.data.name}: ${d.value}${d.children ? ', open' : ''}`)
    .attr('d', (d) => arc(d.current));
  // Drafts: the same arc again, striped.
  const hatch = hatched ? g.append('g').attr('pointer-events', 'none').selectAll('path').data(nodes.filter((d) => hatched(d))).join('path')
    .attr('fill', `url(#${id}-hatch)`).attr('fill-opacity', (d) => (visible(d.current) ? 1 : 0)).attr('d', (d) => arc(d.current)) : null;
  path.append('title').text((d) => `${d.ancestors().map((a) => a.data.name).reverse().slice(1).join(' › ')}\n${d.value}`);
  path.style('cursor', 'pointer')
    .on('click', (e, d) => (d.children ? zoom(e, d) : onLeaf?.(d.data, e)))
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (d.children) zoom(e, d); else onLeaf?.(d.data, e); } });

  const text = g.append('g').attr('pointer-events', 'none').attr('text-anchor', 'middle').style('user-select', 'none')
    .selectAll('text').data(nodes).join('text')
    .attr('class', 'sb-label').attr('dy', '0.35em')
    .attr('fill-opacity', (d) => +labelVisible(d.current))
    .attr('transform', (d) => labelTransform(d.current))
    .text((d) => (d.data.name.length > 16 ? `${d.data.name.slice(0, 15)}…` : d.data.name));

  const centre = g.append('circle').datum(root).attr('r', radius).attr('class', 'sb-centre').attr('pointer-events', 'all')
    .attr('tabindex', 0).attr('role', 'button').attr('aria-label', 'Step back out').on('click', (e, d) => zoom(e, d.parent ?? root));
  const cap = g.append('text').attr('class', 'sb-caption').attr('text-anchor', 'middle').attr('pointer-events', 'none');
  const capTop = cap.append('tspan').attr('x', 0).attr('dy', '-0.3em');
  const capSub = cap.append('tspan').attr('x', 0).attr('dy', '1.4em').attr('class', 'sb-caption-sub');
  const setCaption = (p) => {
    capTop.text(p === root ? caption : (p.data.name.length > 20 ? `${p.data.name.slice(0, 19)}…` : p.data.name));
    capSub.text(p === root ? `${root.value}` : `${p.value} · back`);
  };
  setCaption(root);
  svg.on('keydown', (e) => { if (e.key === 'Escape' && focus !== root) zoom(e, focus.parent ?? root); });

  let focus = root;
  function zoom(event, p) {
    focus = p;
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
    const t = svg.transition().duration(reduce ? 0 : event?.altKey ? 7500 : 750);
    const tweenArc = (sel) => sel.transition(t)
      .tween('data', (d) => { const i = d3.interpolate(d.current, d.target); return (tt) => { d.current = i(tt); }; })
      .filter(function (d) { return +this.getAttribute('fill-opacity') || visible(d.target); })
      .attr('fill-opacity', (d) => (visible(d.target) ? (sel === path ? (d.children ? 0.85 : 0.65) : 1) : 0))
      .attrTween('d', (d) => () => arc(d.current));
    path.attr('pointer-events', (d) => (visible(d.target) ? 'auto' : 'none')).attr('tabindex', (d) => (visible(d.target) ? 0 : -1));
    tweenArc(path);
    if (hatch) hatch.transition(t).attr('fill-opacity', (d) => (visible(d.target) ? 1 : 0)).attrTween('d', (d) => () => arc(d.current));
    text.filter(function (d) { return +this.getAttribute('fill-opacity') || labelVisible(d.target); }).transition(t)
      .attr('fill-opacity', (d) => +labelVisible(d.target))
      .attrTween('transform', (d) => () => labelTransform(d.current));
  }
  wrap.replaceChildren(svg.node());
}
