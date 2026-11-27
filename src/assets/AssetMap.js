import { h } from '../ui/dom.js';
import { loadD3 } from '../ui/Sunburst.js';

/**
 * The asset map, alpha 0.4: a wheel and a list, or an icicle, over the same
 * tree (ABCD type › where it lives › asset). Built from the asset map lab.
 *
 * Assets are never thin slices. On the wheel each one is a short arc of the
 * outer ring (dots on the rim when a group is too crowded for arcs) and a
 * row in the list beside it; on the icicle each asset gets its own row once
 * a type is open. Labels are always level. ↑ ↓ step through the list, Esc or
 * Backspace step back out.
 *
 *   AssetMapView({
 *     data,                 // { name, children: [{ name, kind, children: [{ name, kind, children: [leaf] } | leaf] }] }
 *                           // leaf: { name, key, kind, what, home, value }
 *     mode: 'wheel' | 'icicle',
 *     color: (kind) => hex,
 *     focus: ['Cultural'],  // names from the centre to the open group
 *     picked: key,          // the asset shown in the details panel
 *     onFocus(path), onPick(leaf, event),
 *   })
 */
export function AssetMapView(opts) {
  const wrap = h('div', { class: 'am-view', tabindex: '-1' }, h('div', { class: 'am-loading muted small' }, 'Drawing the map…'));
  loadD3().then((d3) => mount(d3, wrap, opts)).catch(() => wrap.replaceChildren(h('p', { class: 'muted small' }, 'The map could not be drawn.')));
  return wrap;
}

const fit = (s, n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1)).trimEnd()}…` : s);

function mount(d3, wrap, { data, mode = 'wheel', color, focus: focusNames = [], picked = null, onFocus = null, onPick = null }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = (ms) => d3.transition().duration(reduce ? 0 : ms).ease(d3.easeCubicInOut);
  const inkOn = (fill) => { const c = d3.rgb(fill); return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 > 0.6 ? '#16181d' : '#ffffff'; };
  const root = d3.hierarchy(data).sum((d) => (d.children?.length ? 0 : Math.max(0, d.value ?? 1)))
    .sort((a, b) => (a.depth === 1 ? 0 : (b.value - a.value) || a.data.name.localeCompare(b.data.name)));
  let n = 0;
  root.each((d) => {
    d.uid = n++;
    const base = color(d.data.kind);
    d.fill = d.depth <= 1 || d.data.key ? base : d3.interpolateRgb(base, '#ffffff')(d.parent.children.indexOf(d) % 2 ? 0.42 : 0.24);
  });
  const isLeaf = (d) => !!d.data.key;
  const leavesOf = (d) => d.leaves().filter(isLeaf);
  const pathOf = (d) => d.ancestors().reverse().slice(1).map((a) => a.data.name);
  let focus = root;
  for (const name of focusNames) { const next = focus.children?.find((c) => c.data.name === name && c.children); if (!next) break; focus = next; }
  let pickedKey = picked;
  let query = '';
  let highlight = () => {};
  // The drawing is as wide as its box, so text stays its true size when the details panel is open.
  let W = 900;

  const svg = d3.create('svg').attr('class', 'am-svg').attr('role', 'group').attr('aria-label', 'Asset map');
  const scroller = h('div', { class: 'am-scroll' }, svg.node());
  const tip = h('div', { class: 'am-tip', role: 'tooltip', hidden: true });
  const trail = h('nav', { class: 'am-trail', 'aria-label': 'Where you are in the map' });
  const scope = h('div', { class: 'am-scope' });
  const find = h('input', { type: 'search', class: 'input input-sm', placeholder: 'Find an asset in this group', 'aria-label': 'Find an asset in this group', oninput: (e) => { query = e.target.value; side(); } });
  const count = h('small', { class: 'muted' });
  const list = h('div', { class: 'am-list', role: 'listbox', 'aria-label': 'Assets in this group' });
  const panel = h('aside', { class: 'am-side', 'aria-label': 'What you’re looking at' }, trail, scope, h('div', { class: 'am-find' }, find, count), list);
  wrap.replaceChildren(h('div', { class: 'am-stage' }, scroller), panel, tip);

  /* ------------------------------------------------------------ moves */
  function open(d, e) {
    if (!d) return;
    if (isLeaf(d)) { pick(d, e); return; }
    focus = d; query = ''; find.value = '';
    if (pickedKey && !leavesOf(focus).some((l) => l.data.key === pickedKey)) pickedKey = null;
    onFocus?.(pathOf(d), d.data);
    draw(true); side();
  }
  const back = () => { if (focus.parent) open(focus.parent); };
  function pick(leaf, e, { scroll = true } = {}) {
    hold(() => {
      pickedKey = leaf.data.key;
      if (!leaf.ancestors().includes(focus)) { focus = leaf.parent; onFocus?.(pathOf(focus), focus.data); draw(true); } else highlight();
      side(scroll);
      onPick?.(leaf.data, e ?? {});
    });
    // Some browsers scroll a clicked button into view a moment later: put things back once more.
    const boxes = []; for (let el = wrap.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight) boxes.push([el, el.scrollTop]);
    requestAnimationFrame(() => { for (const [el, top] of boxes) if (el.scrollTop !== top) el.scrollTop = top; });
  }

  /* ------------------------------------------------------------ tooltip */
  function showTip(e, d) {
    tip.replaceChildren(h('strong', {}, d.data.name), h('small', {}, isLeaf(d) ? [d.data.what, d.data.home].filter(Boolean).join(' · ') : `${d.value} asset${d.value === 1 ? '' : 's'} · click to open`));
    tip.hidden = false;
    tip.style.left = `${Math.min(innerWidth - 270, e.clientX + 12)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  // Picking or redrawing changes heights around the map (the details panel, the list); hold every
  // scrolling box the map sits in (the page column, the window) where it was, so the map never jumps.
  const hold = (fn) => {
    const boxes = [];
    for (let e = wrap.parentElement; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight) boxes.push([e, e.scrollTop]);
    const y = scrollY;
    fn();
    for (const [e, top] of boxes) if (e.scrollTop !== top) e.scrollTop = top;
    if (scrollY !== y) scrollTo({ top: y });
  };
  function draw(animate = false) { hideTip(); hold(() => { W = Math.max(480, Math.round(scroller.clientWidth || 900)); (mode === 'icicle' ? drawIcicle : drawWheel)(animate); }); }

  /* ------------------------------------------------------------ the wheel */
  function drawWheel(animate) {
    // Room for labels either side; the rings shrink to fit what's left.
    const k = Math.max(0.55, Math.min(0.9, (W / 2 - 150) / 224));
    const H = Math.round(560 * Math.max(0.85, k)), r0 = 88 * k, r1 = 172 * k, r2 = r1 + 6, r3 = 224 * k, rDots = r1 + 18 * k;
    svg.attr('viewBox', [0, 0, W, H]);
    scroller.scrollTop = 0;
    svg.selectAll('*').remove();
    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);
    const ring1 = focus.children ?? [];
    const deep = ring1.some((d) => d.children);
    // Angles from value shares, with a floor so a group of one is never a hairline.
    const angles = (nodes, a0, a1, min) => {
      const total = d3.sum(nodes, (d) => d.value) || 1;
      const raw = nodes.map((d) => Math.max(min, (d.value / total) * (a1 - a0)));
      const k = (a1 - a0) / (d3.sum(raw) || 1);
      let a = a0; return nodes.map((d, i) => { const s = { d, a0: a, a1: a + raw[i] * k }; a = s.a1; return s; });
    };
    const inner = angles(ring1, 0, 2 * Math.PI, deep ? 0.06 : 0.02);
    const arc = d3.arc().padAngle(0.006).padRadius(200).cornerRadius(1);
    // The centre: the open group, and the way back out.
    const cg = g.append('g').attr('class', 'am-centre').style('cursor', focus.parent ? 'pointer' : 'default')
      .attr('tabindex', focus.parent ? 0 : null).attr('role', focus.parent ? 'button' : null).attr('aria-label', focus.parent ? 'Step back out' : null)
      .on('click', back).on('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); back(); } });
    cg.append('circle').attr('r', r0 - 6).attr('fill', focus === root ? '#f1efea' : focus.fill).attr('stroke', '#e2ded6');
    const cInk = focus === root ? '#16181d' : inkOn(focus.fill);
    cg.append('text').attr('text-anchor', 'middle').attr('y', -6).attr('font-size', 15).attr('font-weight', 600).attr('fill', cInk).text(fit(focus.data.name, 17));
    cg.append('text').attr('text-anchor', 'middle').attr('y', 13).attr('font-size', 12).attr('fill', cInk).attr('opacity', 0.8).text(`${focus.value} asset${focus.value === 1 ? '' : 's'}`);
    if (focus.parent) cg.append('text').attr('text-anchor', 'middle').attr('y', 32).attr('font-size', 11).attr('fill', cInk).attr('opacity', 0.7).text('‹ back');
    const arcs = (sel, rIn, rOut, sw) => sel.join('path').attr('fill', (s) => s.d.fill).attr('stroke', '#fff').attr('stroke-width', sw).style('cursor', 'pointer')
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', (s) => `${s.d.data.name}: ${s.d.value}, open`)
      .on('click', (e, s) => open(s.d, e)).on('keydown', (e, s) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(s.d, e); } })
      .on('pointermove', (e, s) => showTip(e, s.d)).on('pointerleave', hideTip);
    const p1 = arcs(g.append('g').selectAll('path').data(inner), r0, r1, 1.5);
    // The outer ring: groups as arcs, or assets as dots.
    // Assets with room to show get a short arc of their own, so the outer ring reads whole all the way
    // round; only a crowded group falls back to dots on the rim.
    const outer = [], dots = [], ticks = [];
    for (const s of inner) {
      const kids = s.d.children ?? [];
      if (!kids.length) continue;
      if (isLeaf(kids[0])) {
        const step = (s.a1 - s.a0) / kids.length;
        if (step * r3 >= 7) kids.forEach((k, i) => ticks.push({ d: k, a0: s.a0 + step * i, a1: s.a0 + step * (i + 1), i }));
        else kids.forEach((k, i) => dots.push({ d: k, a: s.a0 + step * (i + 0.5) }));
      } else outer.push(...angles(kids, s.a0, s.a1, 0.012));
    }
    const p2 = arcs(g.append('g').selectAll('path').data(outer), r2, r3, 1);
    const shade = (s) => (s.i % 2 ? d3.color(s.d.parent.fill).brighter(0.35).formatHex() : s.d.parent.fill);
    const tick = g.append('g').selectAll('path').data(ticks).join('path').attr('fill', shade).attr('stroke', '#fff').attr('stroke-width', 1).style('cursor', 'pointer')
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', (s) => s.d.data.name)
      .on('click', (e, s) => pick(s.d, e)).on('keydown', (e, s) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s.d, e); } })
      .on('pointermove', (e, s) => showTip(e, s.d)).on('pointerleave', hideTip);
    const dotR = dots.length > 120 ? 2.6 : 3.6;
    const dot = g.append('g').selectAll('circle').data(dots).join('circle')
      .attr('cx', (s) => Math.sin(s.a) * rDots).attr('cy', (s) => -Math.cos(s.a) * rDots).attr('r', dotR)
      .attr('fill', (s) => s.d.parent.fill).attr('stroke', '#fff').attr('stroke-width', 0.8).style('cursor', 'pointer')
      .on('click', (e, s) => pick(s.d, e)).on('pointermove', (e, s) => showTip(e, s.d)).on('pointerleave', hideTip);
    // The rings sweep round as they open.
    const grow = (rIn, rOut) => function (s) { const i = d3.interpolate({ a0: 0, a1: 0 }, s); return (t) => arc({ innerRadius: rIn, outerRadius: rOut, startAngle: i(t).a0, endAngle: i(t).a1 }); };
    if (animate && !reduce) {
      p1.transition(T(600)).attrTween('d', grow(r0, r1));
      p2.transition(T(700)).attrTween('d', grow(r2, r3));
      tick.transition(T(700)).attrTween('d', grow(r2, r3));
      dot.attr('opacity', 0).transition(T(700)).delay(200).attr('opacity', 1);
    } else {
      p1.attr('d', (s) => arc({ innerRadius: r0, outerRadius: r1, startAngle: s.a0, endAngle: s.a1 }));
      p2.attr('d', (s) => arc({ innerRadius: r2, outerRadius: r3, startAngle: s.a0, endAngle: s.a1 }));
      tick.attr('d', (s) => arc({ innerRadius: r2, outerRadius: r3, startAngle: s.a0, endAngle: s.a1 }));
    }
    // Labels inside the inner wedges, level, where they fit whole or nearly.
    const mid = (r0 + r1) / 2;
    const room = (s) => Math.floor((mid * (s.a1 - s.a0)) / 7.2);
    const fitsInside = (s) => mid * (s.a1 - s.a0) > 36;
    const inLab = g.append('g').attr('pointer-events', 'none').selectAll('text').data(inner.filter(fitsInside)).join('text')
      .attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 600).attr('fill', (s) => inkOn(s.d.fill))
      .attr('transform', (s) => `translate(${Math.sin((s.a0 + s.a1) / 2) * mid},${-Math.cos((s.a0 + s.a1) / 2) * mid})`);
    inLab.append('tspan').attr('x', 0).attr('dy', '-0.2em').text((s) => fit(s.d.data.name, room(s)));
    inLab.append('tspan').attr('x', 0).attr('dy', '1.25em').attr('font-weight', 400).attr('font-size', 11).text((s) => s.d.value);
    // Labels outside, level, on leader lines: the outer ring's groups, or inner wedges whose name didn't fit.
    const labelled = outer.length ? outer.filter((s) => s.a1 - s.a0 > 0.03) : inner.filter((s) => !fitsInside(s) || fit(s.d.data.name, room(s)) !== s.d.data.name);
    const rOut = outer.length || ticks.length ? r3 : dots.length ? rDots + 6 : r1;
    const items = labelled.map((s) => { const a = (s.a0 + s.a1) / 2; return { s, a, right: Math.sin(a) >= 0, y: -Math.cos(a) * (rOut + 14), x: Math.sin(a) * (rOut + 14) }; });
    for (const right of [true, false]) {
      const col = items.filter((d) => d.right === right).sort((p, q) => p.y - q.y);
      for (let i = 1; i < col.length; i++) if (col[i].y - col[i - 1].y < 15) col[i].y = col[i - 1].y + 15;
      const over = col.length ? col.at(-1).y - (H / 2 - 12) : 0;
      if (over > 0) col.forEach((d) => { d.y -= over; });
      for (let i = col.length - 2; i >= 0; i--) if (col[i + 1].y - col[i].y < 15) col[i].y = col[i + 1].y - 15;
    }
    const lx = (d) => (d.right ? 1 : -1) * (rOut + 28);
    const lab = g.append('g').attr('pointer-events', 'none');
    lab.selectAll('path').data(items).join('path').attr('fill', 'none').attr('stroke', '#8c8f96').attr('stroke-width', 0.8)
      .attr('d', (d) => `M${Math.sin(d.a) * (rOut + 2)},${-Math.cos(d.a) * (rOut + 2)} L${d.x},${d.y} L${lx(d)},${d.y}`);
    lab.selectAll('text').data(items).join('text').attr('class', 'am-label').attr('font-size', 12).attr('dy', '0.35em')
      .attr('x', (d) => lx(d) + (d.right ? 5 : -5)).attr('y', (d) => d.y).attr('text-anchor', (d) => (d.right ? 'start' : 'end'))
      // As much of the name as fits between the leader line and the edge.
      .text((d) => { const tail = `  ${d.s.d.value}`; const room = Math.floor((W / 2 - (rOut + 33) - 6) / 6.2) - tail.length; return `${fit(d.s.d.data.name, Math.max(4, Math.min(30, room)))}${tail}`; });
    if (animate && !reduce) { lab.attr('opacity', 0).transition(T(400)).delay(450).attr('opacity', 1); inLab.attr('opacity', 0).transition(T(400)).delay(350).attr('opacity', 1); }
    highlight = () => {
      const on = (s) => s.d.data.key === pickedKey;
      dot.attr('r', (s) => (on(s) ? 6 : dotR)).attr('stroke', (s) => (on(s) ? '#16181d' : '#fff')).attr('stroke-width', (s) => (on(s) ? 2 : 0.8));
      dot.filter(on).raise();
      tick.attr('stroke', (s) => (on(s) ? '#16181d' : '#fff')).attr('stroke-width', (s) => (on(s) ? 2.5 : 1));
      tick.filter(on).raise();
      const holds = (s) => !!pickedKey && leavesOf(s.d).some((l) => l.data.key === pickedKey);
      p1.attr('stroke', (s) => (holds(s) && !dots.length && !outer.length && !ticks.length ? '#16181d' : '#fff')).attr('stroke-width', (s) => (holds(s) && !dots.length && !outer.length && !ticks.length ? 2.5 : 1.5));
      p2.attr('stroke', (s) => (holds(s) ? '#16181d' : '#fff')).attr('stroke-width', (s) => (holds(s) ? 2.5 : 1));
    };
    highlight();
  }

  /* ------------------------------------------------------------ the icicle */
  function drawIcicle(animate) {
    const cols = root.height - focus.depth + 1;
    const colW = W / cols;
    const H = focus === root ? 600 : Math.max(600, Math.min(3600, focus.value * 20));
    svg.attr('viewBox', [0, 0, W, H]);
    const lay = d3.partition().size([1, 1])(root.copy().sum((d) => (d.children?.length ? 0 : Math.max(0, d.value ?? 1))));
    const at = new Map(); lay.each((d) => at.set(d.data, d));
    const f = at.get(focus.data);
    const sy = d3.scaleLinear().domain([f.x0, f.x1]).range([0, H]);
    const box = (d) => { const p = at.get(d.data); return { x: (d.depth - focus.depth) * colW, y: sy(p.x0), w: colW - 1, h: sy(p.x1) - sy(p.x0) - 1 }; };
    const shown = []; root.each((d) => { const p = at.get(d.data); if (d.depth >= focus.depth && p.x1 > f.x0 + 1e-9 && p.x0 < f.x1 - 1e-9) shown.push(d); });
    const t = T(animate ? 650 : 0);
    const cells = svg.selectAll('g.am-cell').data(shown, (d) => d.uid);
    cells.exit().transition(t).attr('opacity', 0).remove();
    const enter = cells.enter().append('g').attr('class', 'am-cell').attr('opacity', 0).style('cursor', 'pointer')
      .attr('transform', (d) => { const b = box(d); return `translate(${b.x},${b.y})`; });
    enter.append('rect').attr('rx', 2);
    enter.append('text').attr('x', 8).attr('dy', '0.35em');
    const all = enter.merge(cells)
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', (d) => (isLeaf(d) ? d.data.name : `${d.data.name}: ${d.value}${d === focus ? ', step back out' : ', open'}`))
      .on('click', (e, d) => (d === focus ? back() : open(d, e)))
      .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d === focus ? back() : open(d, e); } })
      .on('pointermove', showTip).on('pointerleave', hideTip);
    all.select('rect').attr('fill', (d) => (d === root ? '#f1efea' : d.fill));
    all.transition(t).attr('opacity', 1).attr('transform', (d) => { const b = box(d); return `translate(${b.x},${b.y})`; });
    all.select('rect').transition(t).attr('width', (d) => Math.max(0, box(d).w)).attr('height', (d) => Math.max(0, box(d).h));
    all.select('text').attr('fill', (d) => (d === root ? '#16181d' : inkOn(d.fill))).attr('font-size', (d) => (isLeaf(d) ? 12 : 12.5)).attr('font-weight', (d) => (isLeaf(d) ? 400 : 600))
      .text((d) => `${fit(d.data.name, Math.floor((colW - 46) / 6.6))}${isLeaf(d) ? '' : `  ${d.value}`}`)
      .transition(t).attr('y', (d) => Math.min(box(d).h / 2, 14)).attr('opacity', (d) => (box(d).h >= 13 ? 1 : 0));
    if (!animate) scroller.scrollTop = 0;
    highlight = () => {
      all.select('rect').attr('stroke', (d) => (d.data.key && d.data.key === pickedKey ? '#16181d' : 'none')).attr('stroke-width', 2.5);
      const d = pickedKey && shown.find((x) => x.data.key === pickedKey);
      if (d) {
        const y = (box(d).y / H) * scroller.scrollHeight;
        if (y < scroller.scrollTop || y > scroller.scrollTop + scroller.clientHeight - 30) scroller.scrollTo({ top: y - scroller.clientHeight / 2, behavior: reduce ? 'auto' : 'smooth' });
      }
    };
    highlight();
  }

  /* ------------------------------------------------------------ the list beside it */
  let visible = [];
  function side(scroll = false) {
    trail.replaceChildren(...focus.ancestors().reverse().map((d) => h('button', {
      type: 'button', class: `am-chip${d === focus ? ' on' : ''}`, style: d === root ? '' : `--chip:${d.fill}`, title: d.data.name,
      'aria-current': d === focus ? 'location' : null, disabled: d === focus, onclick: () => open(d),
    }, fit(d.data.name, 26))));
    const kids = focus.children ?? [];
    const groups = kids.filter((k) => !isLeaf(k));
    scope.replaceChildren(
      h('h3', {}, h('span', {}, focus.data.name), h('small', {}, `${focus.value} asset${focus.value === 1 ? '' : 's'}${groups.length ? ` · ${groups.length} group${groups.length === 1 ? '' : 's'}` : ''}`)),
      h('div', { class: 'am-mix' }, kids.map((k) => h('i', { style: `width:${(k.value / focus.value) * 100}%;background:${k.fill}`, title: `${k.data.name}: ${k.value}` }))),
      groups.length > 0 && h('div', { class: 'am-legend' }, groups.slice(0, 12).map((k) => h('button', { type: 'button', onclick: () => open(k) }, h('b', { style: `background:${k.fill}` }), `${fit(k.data.name, 22)} ${k.value}`))));
    const q = query.trim().toLowerCase();
    const blocks = groups.length ? kids : [focus];
    visible = [];
    const rows = [];
    for (const b of blocks) {
      const ls = (isLeaf(b) ? [b] : leavesOf(b)).filter((l) => !q || l.data.name.toLowerCase().includes(q));
      if (!ls.length) continue;
      if (!isLeaf(b) && blocks.length > 1) rows.push(h('h4', {}, h('span', {}, fit(b.data.name, 34)), h('span', {}, ls.length)));
      for (const l of ls) {
        visible.push(l);
        rows.push(h('button', {
          type: 'button', class: 'am-row', role: 'option', 'aria-selected': String(l.data.key === pickedKey), 'data-key': l.data.key, style: `--c:${color(l.data.kind)}`,
          onclick: (e) => pick(l, e, { scroll: false }),
        }, h('i'), h('span', {}, h('b', {}, l.data.name), h('small', {}, [l.data.what, l.data.home].filter(Boolean).join(' · ')))));
      }
    }
    list.replaceChildren(...rows);
    count.textContent = q ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : `${visible.length} in this group · ↑ ↓ to step through`;
    // Scroll the list only: scrollIntoView also scrolls the page, which made the wheel jump when a row was picked.
    const row = scroll && pickedKey && [...list.querySelectorAll('.am-row')].find((r) => r.dataset.key === pickedKey);
    if (row && list.scrollHeight > list.clientHeight) {
      const top = row.offsetTop - list.offsetTop, bottom = top + row.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
  }

  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!visible.length) return;
      e.preventDefault();
      const i = visible.findIndex((l) => l.data.key === pickedKey);
      const next = i < 0 ? (e.key === 'ArrowDown' ? 0 : visible.length - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
      pick(visible[next], e);
      [...list.querySelectorAll('.am-row')].find((r) => r.dataset.key === pickedKey)?.focus({ preventScroll: true });
    } else if ((e.key === 'Escape' || (e.key === 'Backspace' && e.target.tagName !== 'INPUT')) && focus.parent) {
      e.preventDefault(); e.stopPropagation(); back();
    }
  });
  draw(false); side(true);
  // Redraw when the box changes width (the details panel opening or closing beside it).
  let lastW = W;
  new ResizeObserver(() => {
    const w = Math.round(scroller.clientWidth);
    if (!wrap.isConnected || !w || Math.abs(w - lastW) < 40) return;
    lastW = w; draw(false);
  }).observe(scroller);
}
