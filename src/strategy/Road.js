import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { svg } from '../core/svg.js';
import { childrenOf, descendants, rootOf } from '../platform/strategy.js';
import { workplanProgress, PROGRESS_STATES, LIGHTS } from '../platform/strategyReports.js';
import { objectiveHue } from '../ui/strategyLook.js';
import { addDays, daysBetween, short, today, parse } from './dates.js';

/**
 * The roadmap as a road: time runs left to right along a winding road.
 * Workplans end at traffic lights (green when done or on track, amber when
 * behind, red when still ahead), tasks are small lights at the roadside,
 * milestones are flags, and each goal has a road sign with a set of lights
 * (one per workplan) where its work ends. A car marks today; the road
 * behind it is the road travelled.
 *
 *   RoadSvg(doc, planId, { compact: true })   the landing page's thumbnail
 *   RoadmapRoad(ctx)                          the full, scrolling roadmap page
 */
const DAY_PX = { year: 0.9, quarter: 2.2, month: 5 };
let zoom = 'quarter';
let planPick = null;

/** The plan we are in now: the shortest one whose dates hold today (else the first). */
export function currentPlan(doc, now = today()) {
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
  return plans.filter((p) => p.start && p.end && p.start <= now && now <= p.end).sort((a, b) => daysBetween(a.start, a.end) - daysBetween(b.start, b.end))[0] ?? plans[0] ?? null;
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
  const lightFor = (wp) => {
    const p = workplanProgress(doc, wp.id, now);
    if (wp.end < now) return p.state === 'complete' || p.state === 'on-track' ? 'green' : p.done ? 'amber' : 'red';
    if (wp.start > now) return 'red';
    return PROGRESS_STATES[p.state].light;
  };
  const posts = workplans.map((wp) => ({ node: wp, date: wp.end, light: lightFor(wp), progress: workplanProgress(doc, wp.id, now), hue: objectiveHue(doc, wp) }));
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

const LIGHT_COLOR = { green: LIGHTS.green.color, amber: LIGHTS.amber.color, red: LIGHTS.red.color };

/** The road as SVG. `compact` drops labels and fits a small box. */
export function RoadSvg(doc, planId, { compact = false, dayPx = DAY_PX[zoom], onOpen = null } = {}) {
  const m = roadModel(doc, planId);
  if (!m) return null;
  const days = daysBetween(m.from, m.to);
  const runW = compact ? 640 : Math.max(900, Math.round(days * dayPx));
  const W = compact ? runW : runW + 200; // room past the last date for signs
  const H = compact ? 150 : 470;
  const mid = compact ? 92 : 236;
  const xOf = (d) => (daysBetween(m.from, d) / days) * runW;
  const amp = compact ? 14 : 34;
  const period = compact ? 260 : 520;
  const yOf = (x) => mid + Math.sin((x / period) * Math.PI * 2) * amp;
  const roadPath = (x0, x1) => {
    let d = '';
    for (let x = x0; x <= x1; x += 8) d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${yOf(x).toFixed(1)}`;
    return d;
  };
  const el = svg('svg', { class: `road${compact ? ' compact' : ''}`, viewBox: `0 0 ${W} ${H}`, width: compact ? '100%' : W, height: compact ? null : H, role: 'img', 'aria-label': `Roadmap from ${short(m.from)} to ${short(m.to)}` });
  const go = (n) => (e) => { e.preventDefault(); onOpen?.(n); };
  // Landscape
  svg('rect', { class: 'road-sky', x: 0, y: 0, width: W, height: H }, el);
  svg('path', { class: 'road-hill far', d: `M0 ${mid - 30} ${Array.from({ length: Math.ceil(W / 180) + 1 }, (_, i) => `Q${i * 180 + 90} ${mid - 70 - (i % 3) * 14} ${(i + 1) * 180} ${mid - 30}`).join(' ')} L${W} ${H} L0 ${H} Z` }, el);
  svg('path', { class: 'road-hill near', d: `M0 ${mid + 10} ${Array.from({ length: Math.ceil(W / 260) + 1 }, (_, i) => `Q${i * 260 + 130} ${mid - 26 + (i % 2) * 20} ${(i + 1) * 260} ${mid + 10}`).join(' ')} L${W} ${H} L0 ${H} Z` }, el);
  // Years as kilometre markers
  for (let y = +m.from.slice(0, 4) + 1; `${y}-01-01` <= m.to; y++) {
    const x = xOf(`${y}-01-01`);
    svg('line', { class: 'road-year-line', x1: x, x2: x, y1: compact ? 8 : 20, y2: H - (compact ? 4 : 24) }, el);
    svg('text', { class: 'road-year', x: x + 4, y: H - (compact ? 6 : 8) }, el).textContent = String(y);
  }
  // The road, then the stretch already travelled
  const nowX = Math.max(0, Math.min(W, xOf(m.now)));
  svg('path', { class: 'road-edge', d: roadPath(0, W) }, el);
  svg('path', { class: 'road-tar', d: roadPath(0, W) }, el);
  svg('path', { class: 'road-done', d: roadPath(0, nowX) }, el);
  svg('path', { class: 'road-line', d: roadPath(0, W) }, el);

  // Task lights at the roadside
  if (!compact) for (const t of m.tasks) {
    const x = xOf(t.date);
    const a = svg('a', { href: `#${t.node.id}`, class: 'road-task' }, el);
    a.addEventListener('click', go(t.node));
    svg('title', {}, a).textContent = `${t.node.title} · ${short(t.date)}`;
    svg('circle', { cx: x, cy: yOf(x) + (compact ? 0 : 0), r: 3.2, fill: LIGHT_COLOR[t.light], class: 'road-cat-eye' }, a);
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
    const labelW = compact ? 12 : 22 + title.length * 6.4;
    let tier = claim(postTiers, x - 10, x + labelW);
    const showLabel = !compact && tier >= 0;
    if (tier < 0) tier = i % postTiers.length;
    const base = yOf(x) - 10;
    const len = compact ? 20 + tier * 14 : 34 + tier * 50;
    const top = base - len;
    const a = svg('a', { href: `#${p.node.id}`, class: `road-post light-${p.light}` }, el);
    a.addEventListener('click', go(p.node));
    svg('title', {}, a).textContent = `${p.node.title}: ${p.progress.done}/${p.progress.total} tasks done · ends ${short(p.date)}`;
    svg('line', { class: 'road-pole', x1: x, x2: x, y1: base, y2: top }, a);
    const bw = compact ? 9 : 16, bh = compact ? 22 : 40;
    const by = top - bh;
    svg('rect', { class: 'road-lamp-box', x: x - bw / 2, y: by, width: bw, height: bh, rx: bw / 3 }, a);
    ['red', 'amber', 'green'].forEach((c, k) => {
      svg('circle', { cx: x, cy: by + (bh / 3) * (k + 0.5), r: bw * 0.3, fill: c === p.light ? LIGHT_COLOR[c] : '#3b404c', class: c === p.light ? 'lit' : '' }, a);
    });
    // Labels go on top of every pole, so they are drawn after all the posts.
    if (showLabel) labels.push(() => {
      const la = svg('a', { href: `#${p.node.id}`, class: `road-post light-${p.light}` }, el);
      la.addEventListener('click', go(p.node));
      svg('rect', { class: 'road-label-bg', x: x + 10, y: by + 1, width: labelW - 14, height: 22, rx: 5 }, la);
      svg('text', { class: 'road-label', x: x + 16, y: by + 15 }, la).textContent = title;
      svg('rect', { class: 'road-label-hue', x: x + 10, y: by + 1, width: 3.5, height: 22, rx: 1.5, fill: p.hue }, la);
    });
  });
  // Milestone flags
  for (const ms of m.milestones) {
    const x = xOf(ms.date);
    const y = yOf(x);
    const a = svg('a', { href: `#${ms.node.id}`, class: 'road-flag' }, el);
    a.addEventListener('click', go(ms.node));
    svg('title', {}, a).textContent = `Milestone: ${ms.title} · ${short(ms.date)}`;
    svg('line', { x1: x, x2: x, y1: y, y2: y - (compact ? 18 : 30), class: 'road-flag-pole' }, a);
    svg('path', { d: `M${x} ${y - (compact ? 18 : 30)} l${compact ? 10 : 16} ${compact ? 4 : 6} l-${compact ? 10 : 16} ${compact ? 4 : 6} Z`, class: 'road-flag-cloth' }, a);
  }
  // Goal road signs stand below the road, one light per workplan. When the
  // tiers are full at a goal's end date, the sign moves on down the road.
  const signTiers = tiers(2);
  const signDraws = [];
  if (!compact) m.signs.sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
    const sw = 172, sh = 56;
    let x = xOf(s.date) + 14, tier = -1;
    for (let tries = 0; tries < 12 && tier < 0; tries++) { tier = claim(signTiers, x - 6, x + sw + 6); if (tier < 0) x += sw / 2 + 8; }
    if (tier < 0) tier = 0;
    signDraws.push({ tier, draw: () => {
    const y = yOf(x + sw / 2);
    const top = y + 30 + tier * (sh + 14);
    const a = svg('a', { href: `#${s.node.id}`, class: 'road-sign' }, el);
    a.addEventListener('click', go(s.node));
    svg('title', {}, a).textContent = `Goal: ${s.node.title} · its work ends ${short(s.date)}`;
    svg('line', { class: 'road-sign-post', x1: x + 12, x2: x + 12, y1: yOf(x + 12) + 8, y2: top }, a);
    svg('line', { class: 'road-sign-post', x1: x + sw - 12, x2: x + sw - 12, y1: yOf(x + sw - 12) + 8, y2: top }, a);
    svg('rect', { class: 'road-sign-board', x, y: top, width: sw, height: sh, rx: 6 }, a);
    svg('rect', { x: x + 4, y: top + 4, width: sw - 8, height: sh - 8, rx: 4, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.8, 'stroke-width': 1.2 }, a);
    svg('rect', { x: x + 4, y: top + 4, width: 5, height: sh - 8, fill: s.hue }, a);
    const words = s.node.title.split(/\s+/);
    const lines = [''];
    for (const w of words) { if ((lines.at(-1) + ' ' + w).trim().length > 25) lines.push(w); else lines[lines.length - 1] = `${lines.at(-1)} ${w}`.trim(); }
    lines.slice(0, 2).forEach((l, k) => { svg('text', { class: 'road-sign-text', x: x + 15, y: top + 18 + k * 14 }, a).textContent = k === 1 && lines.length > 2 ? `${l}…` : l; });
    s.lights.forEach((l, k) => svg('circle', { cx: x + 19 + k * 13, cy: top + sh - 11, r: 4.5, fill: LIGHT_COLOR[l], stroke: '#fff', 'stroke-width': 1 }, a));
    svg('text', { class: 'road-sign-date', x: x + sw - 10, y: top + sh - 7, 'text-anchor': 'end' }, a).textContent = short(s.date);
    } });
  });
  // Lower signs first, so the posts of the lower row pass behind the upper row.
  signDraws.sort((a, b) => b.tier - a.tier).forEach((d) => d.draw());
  // Plan ends: a chequered gantry
  for (const p of m.plans) {
    const x = xOf(p.end);
    if (x > W - 4) continue;
    const y = yOf(x);
    const g = svg('g', { class: 'road-finish' }, el);
    svg('title', {}, g).textContent = `${p.title} ends ${short(p.end)}`;
    svg('line', { x1: x, x2: x, y1: y - (compact ? 30 : 64), y2: y + (compact ? 14 : 30), class: 'road-finish-pole' }, g);
    for (let k = 0; k < (compact ? 4 : 6); k++) svg('rect', { x: x - 1, y: y - (compact ? 30 : 64) + k * (compact ? 5 : 7), width: compact ? 10 : 14, height: compact ? 5 : 7, fill: k % 2 ? '#fff' : '#1d2230' }, g);
    if (!compact) {
      const t = `${p.title.length > 30 ? `${p.title.slice(0, 29)}…` : p.title} ends`;
      const w = 20 + t.length * 6.2;
      if (claim(postTiers.slice(0, 2), x + 14, x + 14 + w) >= 0) labels.push(() => {
        svg('rect', { class: 'road-label-bg finish', x: x + 14, y: y - 66, width: w, height: 20, rx: 5 }, el);
        svg('text', { class: 'road-finish-text', x: x + 21, y: y - 52 }, el).textContent = t;
      });
    }
  }
  labels.forEach((draw) => draw());
  // Today: the car
  const cy = yOf(nowX);
  const car = svg('g', { class: 'road-car', transform: `translate(${nowX} ${cy})` }, el);
  svg('title', {}, car).textContent = `Today, ${short(m.now)}`;
  const s = compact ? 0.65 : 1;
  svg('path', { d: `M${-16 * s} ${-2 * s} l${4 * s} ${-8 * s} h${18 * s} l${6 * s} ${8 * s} h${4 * s} v${6 * s} h${-34 * s} Z`, class: 'road-car-body' }, car);
  svg('circle', { cx: -9 * s, cy: 5 * s, r: 3.4 * s, class: 'road-car-wheel' }, car);
  svg('circle', { cx: 9 * s, cy: 5 * s, r: 3.4 * s, class: 'road-car-wheel' }, car);
  if (!compact) svg('text', { class: 'road-today', x: 0, y: -22, 'text-anchor': 'middle' }, car).textContent = 'You are here';
  return { el, nowX, width: W, model: m };
}

/** The full roadmap page: plan picker, zoom, a draggable road, and a legend. */
export function RoadmapRoad(ctx) {
  const doc = ctx.store.doc;
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
  if (!plans.length) return h('p', { class: 'empty' }, 'No plans yet.');
  // Start on the whole road: the longest plan whose dates hold today.
  if (!doc.nodes[planPick]) planPick = (plans.filter((p) => p.start && p.end && p.start <= today() && today() <= p.end).sort((a, b) => daysBetween(b.start, b.end) - daysBetween(a.start, a.end))[0] ?? plans[0]).id;
  const road = RoadSvg(doc, planPick, { onOpen: (n) => ctx.select(n.id) });
  if (!road) return h('p', { class: 'empty' }, 'Give the plan’s workplans dates to draw its road.');
  const m = road.model;
  const scroller = h('div', { class: 'road-scroll', tabindex: 0, 'aria-label': 'Roadmap. Scroll sideways, or drag.' }, road.el);
  let drag = null;
  scroller.addEventListener('pointerdown', (e) => { if (e.target.closest('a')) return; drag = { x: e.clientX, left: scroller.scrollLeft }; scroller.setPointerCapture(e.pointerId); scroller.classList.add('dragging'); });
  scroller.addEventListener('pointermove', (e) => { if (drag) scroller.scrollLeft = drag.left - (e.clientX - drag.x); });
  scroller.addEventListener('pointerup', () => { drag = null; scroller.classList.remove('dragging'); });
  requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, road.nowX - scroller.clientWidth * 0.4); });
  const jump = (dir) => scroller.scrollBy({ left: dir * scroller.clientWidth * 0.7, behavior: 'smooth' });

  const passed = m.posts.filter((p) => p.date < m.now);
  const ahead = m.posts.filter((p) => p.date >= m.now);
  const count = (list, l) => list.filter((p) => p.light === l).length;
  return h('div', { class: 'roadmap-road' },
    h('div', { class: 'road-tools' },
      h('label', { class: 'road-plan' }, h('span', { class: 'muted small' }, 'Plan'),
        h('select', { class: 'select select-sm', onchange: (e) => { planPick = e.target.value; ctx.render(); } }, plans.map((p) => h('option', { value: p.id, selected: p.id === planPick }, p.title)))),
      h('div', { class: 'road-tally' },
        h('span', {}, h('strong', {}, String(passed.length)), ' lights passed: ', h('b', { class: 'tg' }, count(passed, 'green')), ' green, ', h('b', { class: 'ta' }, count(passed, 'amber')), ' amber, ', h('b', { class: 'tr' }, count(passed, 'red')), ' red'),
        h('span', {}, h('strong', {}, String(ahead.length)), ' still ahead')),
      h('span', { class: 'spacer' }),
      h('div', { class: 'join' }, Object.keys(DAY_PX).map((z) => h('button', { class: `btn btn-xs join-item${z === zoom ? ' btn-active' : ''}`, onclick: () => { zoom = z; ctx.render(); } }, z[0].toUpperCase() + z.slice(1)))),
      h('button', { class: 'btn btn-xs btn-ghost', 'aria-label': 'Earlier', onclick: () => jump(-1) }, icon('chevronLeft', 14)),
      h('button', { class: 'btn btn-xs', onclick: () => { scroller.scrollTo({ left: Math.max(0, road.nowX - scroller.clientWidth * 0.4), behavior: 'smooth' }); } }, 'Today'),
      h('button', { class: 'btn btn-xs btn-ghost', 'aria-label': 'Later', onclick: () => jump(1) }, icon('chevronRight', 14))),
    scroller,
    h('div', { class: 'road-legend' },
      h('span', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR.green}` }), 'Workplan done or on track'),
      h('span', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR.amber}` }), 'Behind'),
      h('span', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR.red}` }), 'Still ahead, or missed'),
      h('span', {}, h('i', { class: 'lg-eye' }), 'Small lights are tasks'),
      h('span', {}, h('i', { class: 'lg-flag' }), 'Milestone'),
      h('span', {}, h('i', { class: 'lg-sign' }), 'Goal sign: one light per workplan'),
      h('span', {}, h('i', { class: 'lg-finish' }), 'Plan ends')),
    h('details', { class: 'road-list' }, h('summary', {}, 'The same, as a list'),
      h('ol', {}, [...m.posts].sort((a, b) => a.date.localeCompare(b.date)).map((p) => h('li', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR[p.light]}` }), h('a', { href: `#${p.node.id}` }, p.node.title), h('span', { class: 'muted small' }, ` ends ${short(p.date)} · ${p.progress.done}/${p.progress.total} tasks done`))))));
}
export { parse };
