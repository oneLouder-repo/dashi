import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { svg } from '../core/svg.js';
import { descendants, rootOf, withoutDrafts } from '../platform/strategy.js';
import { workplanProgress, PROGRESS_STATES, LIGHTS } from '../platform/strategyReports.js';
import { objectiveHue } from '../ui/strategyLook.js';
import { addDays, daysBetween, short, today, parse, monthStarts } from './dates.js';

/**
 * The roadmap as a road: time runs left to right along a gently winding
 * road. Workplans end at traffic lights (green when done or on track,
 * amber when behind, red when still ahead or missed), tasks are small
 * lights at the roadside, milestones are pennants, and each goal has a road
 * sign with one light per workplan where its work ends. A beacon marks
 * today; the road behind it is darker, the road travelled.
 *
 *   RoadSvg(doc, planId, { compact: true })   a thumbnail: the landing page, a dashboard widget
 *   RoadmapRoad(ctx)                          the full roadmap page, which slides sideways
 */
const DAY_PX = { year: 0.9, quarter: 2.2, month: 5 };
let zoom = 'quarter';
let planPick = null;

/** The plan we are in now: the shortest one whose dates hold today (else the first). */
export function currentPlan(doc, now = today()) {
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
  return plans.filter((p) => p.start && p.end && p.start <= now && now <= p.end).sort((a, b) => daysBetween(a.start, a.end) - daysBetween(b.start, b.end))[0] ?? plans[0] ?? null;
}

/** A workplan's light: how it went if it has ended, how it is going if it is under way, red if it hasn't begun. */
export function lightFor(doc, wp, now = today()) {
  const p = workplanProgress(doc, wp.id, now);
  if (wp.end < now) return p.state === 'complete' || p.state === 'on-track' ? 'green' : p.done ? 'amber' : 'red';
  if (wp.start > now) return 'red';
  return PROGRESS_STATES[p.state].light;
}

/** Everything on the road under a plan (or the whole framework). */
export function roadModel(doc, planId, now = today()) {
  const top = doc.nodes[planId] ?? rootOf(doc);
  if (!top) return null;
  const all = [top, ...descendants(doc, top.id)];
  const workplans = all.filter((n) => n.type === 'workplan' && n.start && n.end);
  const goals = all.filter((n) => n.type === 'goal');
  const dated = all.filter((n) => n.start && n.end);
  if (!dated.length) return null;
  const from = dated.map((n) => n.start).sort()[0];
  const to = [...dated.map((n) => n.end), now].sort().at(-1);
  const posts = workplans.map((wp) => ({ node: wp, date: wp.end, light: lightFor(doc, wp, now), progress: workplanProgress(doc, wp.id, now), hue: objectiveHue(doc, wp) }));
  const tasks = workplans.flatMap((wp) => descendants(doc, wp.id).filter((t) => t.type === 'task' && t.end)
    .map((t) => ({ node: t, date: t.end, light: t.status === 'done' ? 'green' : t.end < now ? 'amber' : t.status === 'active' || t.status === 'blocked' ? 'amber' : 'red' })));
  const milestones = [
    ...all.flatMap((n) => (n.milestones ?? []).map((m) => ({ ...m, node: n }))),
    ...all.filter((n) => n.type === 'task').flatMap((t) => (t.events ?? []).filter((e) => e.kind === 'milestone').map((e) => ({ id: e.id, date: e.date, title: e.text, node: t }))),
  ].filter((m) => m.date).sort((a, b) => a.date.localeCompare(b.date));
  const signs = goals.map((g) => {
    const wps = workplans.filter((wp) => descendants(doc, g.id).includes(wp));
    if (!wps.length) return null;
    return { node: g, date: wps.map((w) => w.end).sort().at(-1), lights: wps.map((w) => posts.find((p) => p.node === w).light), hue: objectiveHue(doc, g) };
  }).filter(Boolean);
  const plans = all.filter((n) => n.type === 'plan' && n.end);
  return { top, from: addDays(from, -20), to: addDays(to, 40), now, posts, tasks, milestones, signs, plans };
}

export const LIGHT_COLOR = { green: LIGHTS.green.color, amber: LIGHTS.amber.color, red: LIGHTS.red.color };
let gradientN = 0;

/**
 * The road as SVG. `compact` drops labels and signs and fits a small box;
 * `links: false` draws it without anchors (a public dashboard).
 * Returns { el, nowX, width, model, xOf }.
 */
export function RoadSvg(doc, planId, { compact = false, dayPx = DAY_PX[zoom], onOpen = null, links = true } = {}) {
  const m = roadModel(doc, planId);
  if (!m) return null;
  const days = daysBetween(m.from, m.to);
  const runW = compact ? 640 : Math.max(900, Math.round(days * dayPx));
  const W = compact ? runW : runW + 220; // room past the last date for signs
  const H = compact ? 150 : 470;
  const mid = compact ? 88 : 232;
  const xOf = (d) => (daysBetween(m.from, d) / days) * runW;
  const amp = compact ? 10 : 22;
  const period = compact ? 320 : 760;
  const yOf = (x) => mid + Math.sin((x / period) * Math.PI * 2) * amp;
  const roadPath = (x0, x1) => {
    let d = '';
    for (let x = x0; x <= x1; x += 8) d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${yOf(x).toFixed(1)}`;
    return d;
  };
  const el = svg('svg', { class: `road${compact ? ' compact' : ''}`, viewBox: `0 0 ${W} ${H}`, width: compact ? '100%' : W, height: compact ? null : H, role: 'img', 'aria-label': `Roadmap from ${short(m.from)} to ${short(m.to)}` });
  const go = (n) => (e) => { if (onOpen) { e.preventDefault(); onOpen(n); } };
  /** An anchor to a strategy item, or a plain group when the road has no links. */
  const node = (n, cls, parent = el) => {
    if (!links) return svg('g', { class: cls }, parent);
    const a = svg('a', { href: `#${n.id}`, class: cls }, parent);
    a.addEventListener('click', go(n));
    return a;
  };

  // Landscape: a soft sky, a flat ground, a horizon.
  const gid = `road-sky-${++gradientN}`;
  const defs = svg('defs', {}, el);
  const grad = svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svg('stop', { offset: '0', class: 'road-sky-top' }, grad);
  svg('stop', { offset: '1', class: 'road-sky-bottom' }, grad);
  svg('rect', { class: 'road-sky', x: 0, y: 0, width: W, height: H, fill: `url(#${gid})` }, el);
  const horizon = mid + (compact ? 16 : 44);
  svg('rect', { class: 'road-ground', x: 0, y: horizon, width: W, height: H - horizon }, el);
  svg('line', { class: 'road-horizon', x1: 0, x2: W, y1: horizon, y2: horizon }, el);

  // The ruler: years as hairlines with a label, quarters (or months) as ticks along the top.
  const yearY = H - (compact ? 6 : 10);
  for (let y = +m.from.slice(0, 4) + 1; `${y}-01-01` <= m.to; y++) {
    const x = xOf(`${y}-01-01`);
    svg('line', { class: 'road-year-line', x1: x, x2: x, y1: compact ? 6 : 26, y2: H - (compact ? 2 : 22) }, el);
    svg('text', { class: 'road-year', x: x + 5, y: yearY }, el).textContent = String(y);
  }
  if (!compact) {
    const step = zoom === 'month' ? 1 : 3;
    for (const ms of monthStarts(m.from, m.to)) {
      const mo = +ms.slice(5, 7);
      if ((mo - 1) % step) continue;
      const x = xOf(ms);
      const label = zoom === 'month' ? short(ms).slice(2, 5) : `Q${Math.ceil(mo / 3)}`;
      svg('line', { class: 'road-tick', x1: x, x2: x, y1: 14, y2: 20 }, el);
      svg('text', { class: 'road-tick-label', x: x + 4, y: 12 }, el).textContent = mo === 1 ? `${label} ${ms.slice(0, 4)}` : label;
    }
  }

  // The road, then the stretch already travelled.
  const nowX = Math.max(0, Math.min(W, xOf(m.now)));
  svg('path', { class: 'road-edge', d: roadPath(0, W) }, el);
  svg('path', { class: 'road-tar', d: roadPath(0, W) }, el);
  svg('path', { class: 'road-done', d: roadPath(0, nowX) }, el);
  svg('path', { class: 'road-line', d: roadPath(0, W) }, el);

  // Task lights at the roadside.
  if (!compact) for (const t of m.tasks) {
    const x = xOf(t.date);
    const a = node(t.node, 'road-task');
    svg('title', {}, a).textContent = `${t.node.title} · ${short(t.date)}`;
    svg('circle', { cx: x, cy: yOf(x), r: 3, fill: LIGHT_COLOR[t.light], class: 'road-cat-eye' }, a);
  }
  // Lanes keep labels and signs from piling up: each tier remembers the
  // stretches of road it already shows, and an item takes the first free tier.
  const tiers = (n) => Array.from({ length: n }, () => []);
  const free = (tier, x0, x1) => tier.every(([a, b]) => x1 < a || x0 > b);
  const claim = (list, x0, x1) => { const i = list.findIndex((t) => free(t, x0, x1)); if (i >= 0) list[i].push([x0, x1]); return i; };
  // Workplan traffic lights stand above the road, on up to three tiers.
  const postTiers = tiers(compact ? 2 : 3);
  const labels = [];
  m.posts.sort((a, b) => a.date.localeCompare(b.date)).forEach((p, i) => {
    const x = xOf(p.date);
    const title = p.node.title.length > 26 ? `${p.node.title.slice(0, 25)}…` : p.node.title;
    const labelW = compact ? 12 : 24 + title.length * 6.3;
    let tier = claim(postTiers, x - 10, x + labelW);
    const showLabel = !compact && tier >= 0;
    if (tier < 0) tier = i % postTiers.length;
    const base = yOf(x) - 8;
    const len = compact ? 16 + tier * 12 : 30 + tier * 50;
    const top = base - len;
    const a = node(p.node, `road-post light-${p.light}`);
    svg('title', {}, a).textContent = `${p.node.title}: ${p.progress.done}/${p.progress.total} tasks done · ends ${short(p.date)}`;
    svg('line', { class: 'road-pole', x1: x, x2: x, y1: base, y2: top }, a);
    const bw = compact ? 8 : 14, bh = compact ? 20 : 36;
    const by = top - bh;
    svg('rect', { class: 'road-lamp-box', x: x - bw / 2, y: by, width: bw, height: bh, rx: bw / 2 }, a);
    ['red', 'amber', 'green'].forEach((c, k) => {
      const cy = by + (bh / 3) * (k + 0.5);
      if (c === p.light) svg('circle', { cx: x, cy, r: bw * 0.5, fill: LIGHT_COLOR[c], class: 'road-halo' }, a);
      svg('circle', { cx: x, cy, r: bw * 0.28, fill: c === p.light ? LIGHT_COLOR[c] : '#3a3f4b', class: c === p.light ? 'lit' : 'unlit' }, a);
    });
    // Labels go on top of every pole, so they are drawn after all the posts.
    if (showLabel) labels.push(() => {
      const la = node(p.node, `road-post light-${p.light}`);
      svg('rect', { class: 'road-label-bg', x: x + 10, y: by + 7, width: labelW - 14, height: 22, rx: 11 }, la);
      svg('circle', { cx: x + 20, cy: by + 18, r: 3.5, fill: p.hue }, la);
      svg('text', { class: 'road-label', x: x + 27, y: by + 22 }, la).textContent = title;
    });
  });
  // Milestones: pennants on the verge.
  for (const ms of m.milestones) {
    const x = xOf(ms.date);
    const hgt = compact ? 14 : 24;
    const y = yOf(x) + (compact ? 8 : 14) + hgt;
    const a = node(ms.node, 'road-flag');
    svg('title', {}, a).textContent = `Milestone: ${ms.title} · ${short(ms.date)}`;
    svg('line', { x1: x, x2: x, y1: y, y2: y - hgt, class: 'road-flag-pole' }, a);
    svg('path', { d: `M${x} ${y - hgt} l${compact ? 9 : 14} ${compact ? 3.5 : 5} l-${compact ? 9 : 14} ${compact ? 3.5 : 5} Z`, class: 'road-flag-cloth' }, a);
    svg('circle', { cx: x, cy: y, r: compact ? 1.6 : 2.2, class: 'road-flag-foot' }, a);
  }
  // Goal road signs stand below the road, one light per workplan. When the
  // tiers are full at a goal's end date, the sign moves on down the road.
  const signTiers = tiers(2);
  const signDraws = [];
  if (!compact) m.signs.sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
    const sw = 176, sh = 54;
    let x = xOf(s.date) + 14, tier = -1;
    for (let tries = 0; tries < 12 && tier < 0; tries++) { tier = claim(signTiers, x - 6, x + sw + 6); if (tier < 0) x += sw / 2 + 8; }
    if (tier < 0) tier = 0;
    signDraws.push({ tier, draw: () => {
      const top = horizon + 14 + tier * (sh + 14);
      const a = node(s.node, 'road-sign');
      svg('title', {}, a).textContent = `Goal: ${s.node.title} · its work ends ${short(s.date)}`;
      svg('line', { class: 'road-sign-post', x1: x + 14, x2: x + 14, y1: yOf(x + 14) + 10, y2: top }, a);
      svg('line', { class: 'road-sign-post', x1: x + sw - 14, x2: x + sw - 14, y1: yOf(x + sw - 14) + 10, y2: top }, a);
      svg('rect', { class: 'road-sign-board', x, y: top, width: sw, height: sh, rx: 8 }, a);
      svg('rect', { x, y: top, width: 5, height: sh, rx: 2.5, fill: s.hue }, a);
      const words = s.node.title.split(/\s+/);
      const lines = [''];
      for (const w of words) { if ((lines.at(-1) + ' ' + w).trim().length > 26) lines.push(w); else lines[lines.length - 1] = `${lines.at(-1)} ${w}`.trim(); }
      lines.slice(0, 2).forEach((l, k) => { svg('text', { class: 'road-sign-text', x: x + 14, y: top + 18 + k * 14 }, a).textContent = k === 1 && lines.length > 2 ? `${l}…` : l; });
      s.lights.forEach((l, k) => svg('circle', { cx: x + 19 + k * 12, cy: top + sh - 11, r: 4, fill: LIGHT_COLOR[l], class: 'road-sign-light' }, a));
      svg('text', { class: 'road-sign-date', x: x + sw - 10, y: top + sh - 7, 'text-anchor': 'end' }, a).textContent = short(s.date);
    } });
  });
  // Lower signs first, so the posts of the lower row pass behind the upper row.
  signDraws.sort((a, b) => b.tier - a.tier).forEach((d) => d.draw());
  // Plan ends: a slim chequered post.
  for (const p of m.plans) {
    const x = xOf(p.end);
    if (x > W - 4) continue;
    const y = yOf(x);
    const g = svg('g', { class: 'road-finish' }, el);
    svg('title', {}, g).textContent = `${p.title} ends ${short(p.end)}`;
    // A chequered line across the road, like a finish line.
    const half = compact ? 6 : 12, cell = compact ? 3 : 4;
    for (let k = 0; k < (half * 2) / cell; k++) for (let c = 0; c < 2; c++) svg('rect', { x: x - cell + c * cell, y: y - half + k * cell, width: cell, height: cell, fill: (k + c) % 2 ? '#fff' : '#1d2230' }, g);
    if (!compact) {
      const t = `${p.title.length > 30 ? `${p.title.slice(0, 29)}…` : p.title} ends`;
      const w = 20 + t.length * 6.2;
      if (claim(postTiers.slice(0, 2), x + 14, x + 14 + w) >= 0) labels.push(() => {
        svg('line', { class: 'road-finish-tie', x1: x, x2: x, y1: y - half, y2: y - 46 }, el);
        svg('rect', { class: 'road-label-bg finish', x: x - 2, y: y - 66, width: w, height: 20, rx: 10 }, el);
        svg('text', { class: 'road-finish-text', x: x + 7, y: y - 52 }, el).textContent = t;
      });
    }
  }
  labels.forEach((draw) => draw());
  // Today: a beacon on the road and a hairline through the whole scene.
  const cy = yOf(nowX);
  const beacon = svg('g', { class: 'road-now', transform: `translate(${nowX} 0)` }, el);
  svg('title', {}, beacon).textContent = `Today, ${short(m.now)}`;
  svg('line', { class: 'road-now-line', x1: 0, x2: 0, y1: compact ? 4 : 28, y2: H - (compact ? 4 : 22) }, beacon);
  svg('circle', { class: 'road-now-ring', cx: 0, cy, r: compact ? 8 : 12 }, beacon);
  svg('circle', { class: 'road-now-dot', cx: 0, cy, r: compact ? 3.5 : 5 }, beacon);
  if (!compact) {
    const label = `Today · ${short(m.now)}`;
    const w = 16 + label.length * 6.4;
    const lx = nowX + w / 2 + 8 > W ? -w - 8 : nowX < w / 2 + 8 ? 8 : -w / 2;
    svg('rect', { class: 'road-now-chip', x: lx, y: 30, width: w, height: 22, rx: 11 }, beacon);
    svg('text', { class: 'road-now-text', x: lx + w / 2, y: 45, 'text-anchor': 'middle' }, beacon).textContent = label;
  }
  return { el, nowX, width: W, model: m, xOf };
}

/** The full roadmap page: plan picker, zoom, a road that slides sideways, a strip to move along it, and a legend. */
export function RoadmapRoad(ctx) {
  const doc = withoutDrafts(ctx.store.doc);
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
  if (!plans.length) return h('p', { class: 'empty' }, 'No plans yet.');
  // Start on the whole road: the longest plan whose dates hold today.
  if (!doc.nodes[planPick]) planPick = (plans.filter((p) => p.start && p.end && p.start <= today() && today() <= p.end).sort((a, b) => daysBetween(b.start, b.end) - daysBetween(a.start, a.end))[0] ?? plans[0]).id;
  const road = RoadSvg(doc, planPick, { onOpen: (n) => ctx.select(n.id) });
  if (!road) return h('p', { class: 'empty' }, 'Give the plan’s workplans dates to draw its road.');
  const m = road.model;
  const scroller = h('div', { class: 'road-scroll', tabindex: 0, 'aria-label': 'Roadmap. Scroll sideways, drag the road, or use the arrow keys.' }, road.el);
  let drag = null;
  scroller.addEventListener('pointerdown', (e) => { if (e.target.closest('a')) return; drag = { x: e.clientX, left: scroller.scrollLeft }; scroller.setPointerCapture(e.pointerId); scroller.classList.add('dragging'); });
  scroller.addEventListener('pointermove', (e) => { if (drag) scroller.scrollLeft = drag.left - (e.clientX - drag.x); });
  scroller.addEventListener('pointerup', () => { drag = null; scroller.classList.remove('dragging'); });
  // A mouse wheel moves along the road, as it is the only way the road goes.
  scroller.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) { e.preventDefault(); scroller.scrollLeft += e.deltaY; } }, { passive: false });
  scroller.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -160, ArrowRight: 160, PageUp: -scroller.clientWidth * 0.8, PageDown: scroller.clientWidth * 0.8 }[e.key];
    if (step) { e.preventDefault(); scroller.scrollBy({ left: step, behavior: 'smooth' }); }
    if (e.key === 'Home') scroller.scrollTo({ left: 0, behavior: 'smooth' });
    if (e.key === 'End') scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  });
  const toToday = (smooth = true) => scroller.scrollTo({ left: Math.max(0, road.nowX - scroller.clientWidth * 0.4), behavior: smooth ? 'smooth' : 'auto' });
  const jump = (dir) => scroller.scrollBy({ left: dir * scroller.clientWidth * 0.7, behavior: 'smooth' });

  // The strip: the whole road at a glance, with the window you are looking through. Click or drag it to move.
  const win = h('div', { class: 'road-scrub-win', role: 'presentation' });
  const strip = h('div', { class: 'road-scrub', 'aria-hidden': 'true' },
    h('div', { class: 'road-scrub-line' }),
    m.posts.map((p) => h('i', { class: 'road-scrub-dot', style: `left:${(road.xOf(p.date) / road.width) * 100}%;--c:${LIGHT_COLOR[p.light]}` })),
    m.milestones.map((ms) => h('i', { class: 'road-scrub-flag', style: `left:${(road.xOf(ms.date) / road.width) * 100}%` })),
    h('i', { class: 'road-scrub-now', style: `left:${(road.nowX / road.width) * 100}%` }),
    win);
  const stage = h('div', { class: 'road-stage' },
    scroller,
    h('button', { class: 'road-nav left', 'aria-label': 'Earlier', onclick: () => jump(-1) }, icon('chevronLeft', 18)),
    h('button', { class: 'road-nav right', 'aria-label': 'Later', onclick: () => jump(1) }, icon('chevronRight', 18)));
  const sync = () => {
    const frac = scroller.clientWidth / scroller.scrollWidth;
    win.style.width = `${Math.min(100, frac * 100)}%`;
    win.style.left = `${(scroller.scrollLeft / scroller.scrollWidth) * 100}%`;
    stage.classList.toggle('at-start', scroller.scrollLeft <= 2);
    stage.classList.toggle('at-end', scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2);
  };
  scroller.addEventListener('scroll', sync);
  let scrub = null;
  const scrubTo = (clientX) => {
    const r = strip.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    scroller.scrollLeft = frac * scroller.scrollWidth - scroller.clientWidth / 2;
  };
  strip.addEventListener('pointerdown', (e) => { scrub = true; strip.setPointerCapture(e.pointerId); scrubTo(e.clientX); });
  strip.addEventListener('pointermove', (e) => { if (scrub) scrubTo(e.clientX); });
  strip.addEventListener('pointerup', () => { scrub = null; });
  requestAnimationFrame(() => { toToday(false); sync(); });

  const passed = m.posts.filter((p) => p.date < m.now);
  const ahead = m.posts.filter((p) => p.date >= m.now);
  const count = (list, l) => list.filter((p) => p.light === l).length;
  return h('div', { class: 'roadmap-road' },
    h('div', { class: 'road-tools' },
      h('label', { class: 'road-plan' }, h('span', { class: 'muted small' }, 'Plan'),
        h('select', { class: 'select select-sm', onchange: (e) => { planPick = e.target.value; ctx.render(); } }, 
          // With plans side by side (often overlapping), the whole framework is one road.
          [...(plans.length > 1 && rootOf(doc) ? [{ id: rootOf(doc).id, title: 'All plans, end to end' }] : []), ...plans].map((p) => h('option', { value: p.id, selected: p.id === planPick }, p.title)))),
      h('div', { class: 'road-tally' },
        h('span', {}, h('strong', {}, String(passed.length)), ' lights passed: ', h('b', { class: 'tg' }, count(passed, 'green')), ' green, ', h('b', { class: 'ta' }, count(passed, 'amber')), ' amber, ', h('b', { class: 'tr' }, count(passed, 'red')), ' red'),
        h('span', {}, h('strong', {}, String(ahead.length)), ' still ahead')),
      h('span', { class: 'spacer' }),
      h('div', { class: 'join' }, Object.keys(DAY_PX).map((z) => h('button', { class: `btn btn-xs join-item${z === zoom ? ' btn-active' : ''}`, onclick: () => { zoom = z; ctx.render(); } }, z[0].toUpperCase() + z.slice(1)))),
      h('button', { class: 'btn btn-xs', onclick: () => toToday() }, 'Today')),
    stage,
    strip,
    h('p', { class: 'road-hint muted small' }, icon('pan', 14), ' The road runs sideways: drag it, scroll over it, use the strip under the road, or the ← → keys. Earlier is to the left, later to the right.'),
    h('div', { class: 'road-legend' },
      h('span', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR.green}` }), 'Workplan done or on track'),
      h('span', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR.amber}` }), 'Behind'),
      h('span', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR.red}` }), 'Still ahead, or missed'),
      h('span', {}, h('i', { class: 'lg-eye' }), 'Small lights are tasks'),
      h('span', {}, h('i', { class: 'lg-flag' }), 'Milestone'),
      h('span', {}, h('i', { class: 'lg-sign' }), 'Goal sign: one light per workplan'),
      h('span', {}, h('i', { class: 'lg-now' }), 'Today'),
      h('span', {}, h('i', { class: 'lg-finish' }), 'Plan ends')),
    h('details', { class: 'road-list' }, h('summary', {}, 'The same, as a list'),
      h('ol', {}, [...m.posts].sort((a, b) => a.date.localeCompare(b.date)).map((p) => h('li', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR[p.light]}` }), h('a', { href: `#${p.node.id}` }, p.node.title), h('span', { class: 'muted small' }, ` ends ${short(p.date)} · ${p.progress.done}/${p.progress.total} tasks done`))))));
}
export { parse };
