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
const DAY_PX = { fit: null, year: 0.9, quarter: 2.2, month: 5 };
// Alpha 0.3 PR 17: the road opens at "Fit", a zoom worked out for the screen (see fitWindow).
let zoom = 'fit';
let fitW = null; // the road's width on screen, once measured
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
  // Objective signposts: green, like a freeway sign, numbered in plan order.
  const objectives = all.filter((n) => n.type === 'objective');
  const objSigns = objectives.map((o, i) => {
    const wps = workplans.filter((wp) => descendants(doc, o.id).includes(wp));
    if (!wps.length) return null;
    return { node: o, n: i + 1, date: wps.map((w) => w.end).sort().at(-1), start: wps.map((w) => w.start).sort()[0], hue: objectiveHue(doc, o) };
  }).filter(Boolean);
  const plans = all.filter((n) => n.type === 'plan' && n.end);
  return { top, from: addDays(from, -20), to: addDays(to, 40), now, posts, tasks, milestones, signs, objSigns, plans };
}

export const LIGHT_COLOR = { green: LIGHTS.green.color, amber: LIGHTS.amber.color, red: LIGHTS.red.color };
let gradientN = 0;

/**
 * The road as SVG. `compact` drops labels and signs and fits a small box;
 * `links: false` draws it without anchors (a public dashboard).
 * Returns { el, nowX, width, model, xOf }.
 */
export function RoadSvg(doc, planId, { compact = false, dayPx = DAY_PX[zoom] ?? DAY_PX.quarter, onOpen = null, links = true, span = null } = {}) {
  const m0 = roadModel(doc, planId);
  if (!m0) return null;
  // A span reaches the road out past its own dates (the Fit zoom looks a little past the end).
  const m = span ? { ...m0, from: span.from < m0.from ? span.from : m0.from, to: span.to > m0.to ? span.to : m0.to } : m0;
  const days = daysBetween(m.from, m.to);
  const runW = compact ? 640 : Math.max(900, Math.round(days * dayPx));
  const W = compact ? runW : runW + 220; // room past the last date for signs
  // Shorter than it was (PR 10): lights above the road, then a row of green
  // objective signposts and a row of white goal signs below it.
  // Alpha 0.3: a clear band across the top holds the Today chip and the
  // finish-line signposts, so neither lands on a traffic light.
  const H = compact ? 150 : 398;
  const mid = compact ? 88 : 214;
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
  const horizon = mid + (compact ? 16 : 24);
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
    const step = dayPx >= 4 ? 1 : dayPx >= 0.8 ? 3 : 6;
    for (const ms of monthStarts(m.from, m.to)) {
      const mo = +ms.slice(5, 7);
      if ((mo - 1) % step) continue;
      const x = xOf(ms);
      const label = step === 1 ? short(ms).slice(2, 5) : step === 6 ? (mo === 1 ? 'Jan' : 'Jul') : `Q${Math.ceil(mo / 3)}`;
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
  // Finish-line poles stand behind the traffic lights; their boards go on top.
  const poleLayer = svg('g', { class: 'road-finish-poles' }, el);

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
    const len = compact ? 16 + tier * 12 : 22 + tier * 38;
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
  const signTiers = tiers(1);
  const signDraws = [];
  if (!compact) m.signs.sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
    const sw = 176, sh = 50;
    let x = xOf(s.date) + 14, tier = -1;
    for (let tries = 0; tries < 24 && tier < 0; tries++) { tier = claim(signTiers, x - 6, x + sw + 6); if (tier < 0) x += sw / 3; }
    if (tier < 0) tier = 0;
    signDraws.push({ tier, draw: () => {
      const top = horizon + 58 + tier * (sh + 14);
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
  // Green objective signposts in front of the goal signs' posts.
  const objTier = tiers(1);
  if (!compact) m.objSigns.sort((a, b) => a.date.localeCompare(b.date)).forEach((o) => {
    const label = o.node.title.length > 30 ? `${o.node.title.slice(0, 29)}…` : o.node.title;
    const sw = 44 + label.length * 6.4, sh = 28;
    let x = xOf(o.date) - sw - 10;
    for (let tries = 0; tries < 20 && claim(objTier, x - 6, x + sw + 6) < 0; tries++) x += 40;
    const top = horizon + 16;
    const a = node(o.node, 'road-obj');
    svg('title', {}, a).textContent = `Strategic objective ${o.n}: ${o.node.title} · its work ends ${short(o.date)}`;
    svg('line', { class: 'road-obj-post', x1: x + sw / 2, x2: x + sw / 2, y1: yOf(x + sw / 2) + 12, y2: top }, a);
    svg('rect', { class: 'road-obj-board', x, y: top, width: sw, height: sh, rx: 5 }, a);
    svg('rect', { class: 'road-obj-rim', x: x + 2, y: top + 2, width: sw - 4, height: sh - 4, rx: 4 }, a);
    svg('rect', { class: 'road-obj-shield', x: x + 7, y: top + 6, width: 24, height: 16, rx: 4, fill: '#fff' }, a);
    svg('text', { class: 'road-obj-num', x: x + 19, y: top + 18, 'text-anchor': 'middle', fill: o.hue }, a).textContent = `O${o.n}`;
    svg('text', { class: 'road-obj-text', x: x + 38, y: top + 18.5 }, a).textContent = label;
  });
  // Plan ends: a chequered line across the road and, in the full road, the
  // tallest signpost of all: a white board tipped with checkers, up in the
  // top band at the Today label's level, clear of every traffic light.
  const topBand = tiers(1);
  const todayLabel = `Today · ${short(m.now)}`;
  const todayW = 16 + todayLabel.length * 6.4;
  const todayX0 = nowX + todayW / 2 + 8 > W ? nowX - todayW - 8 : nowX < todayW / 2 + 8 ? nowX + 8 : nowX - todayW / 2;
  if (!compact) claim(topBand, todayX0 - 6, todayX0 + todayW + 6);
  const finishes = [];
  for (const p of m.plans) {
    const x = xOf(p.end);
    if (x > W - 4) continue;
    const y = yOf(x);
    const g = svg('g', { class: 'road-finish' }, el);
    svg('title', {}, g).textContent = `${p.title} ends ${short(p.end)}`;
    // A chequered line across the road, like a finish line.
    const half = compact ? 6 : 12, cell = compact ? 3 : 4;
    for (let k = 0; k < (half * 2) / cell; k++) for (let c = 0; c < 2; c++) svg('rect', { x: x - cell + c * cell, y: y - half + k * cell, width: cell, height: cell, fill: (k + c) % 2 ? '#fff' : '#1d2230' }, g);
    if (!compact) finishes.push({ p, x, y, half });
  }
  const finishSigns = finishes.map(({ p, x, y, half }) => {
    const t = `${p.title.length > 30 ? `${p.title.slice(0, 29)}…` : p.title} ends ${short(p.end)}`;
    const chk = 18, sw = chk + 16 + t.length * 6.2, sh = 22, top = 30;
    // The board hangs to the right of its pole; near the end of the road, to the left.
    let bx = x + sw > W - 4 ? x - sw : x;
    for (let tries = 0; tries < 12 && claim(topBand, bx - 4, bx + sw + 4) < 0; tries++) bx += bx < x ? -24 : 24;
    return () => {
      const g = svg('g', { class: 'road-finish road-finish-post' }, el);
      svg('title', {}, g).textContent = `Finish: ${p.title} ends ${short(p.end)}`;
      svg('line', { class: 'road-finish-pole', x1: x, x2: x, y1: y - half, y2: top + sh / 2 }, poleLayer);
      svg('rect', { class: 'road-finish-board', x: bx, y: top, width: sw, height: sh, rx: 4 }, g);
      // Checkers at the tip next to the pole.
      const cx0 = bx < x ? bx + sw - chk : bx;
      const clip = `road-finish-clip-${gradientN}-${Math.round(x)}`;
      const cp = svg('clipPath', { id: clip }, defs);
      svg('rect', { x: bx, y: top, width: sw, height: sh, rx: 4 }, cp);
      const cg = svg('g', { 'clip-path': `url(#${clip})` }, g);
      const cell = sh / 4;
      for (let r = 0; r < 4; r++) for (let c = 0; c < chk / cell; c++) svg('rect', { x: cx0 + c * cell, y: top + r * cell, width: cell, height: cell, fill: (r + c) % 2 ? '#fff' : '#1d2230' }, cg);
      svg('text', { class: 'road-finish-text', x: (bx < x ? bx : bx + chk) + 8, y: top + 15 }, g).textContent = t;
    };
  });
  labels.forEach((draw) => draw());
  finishSigns.forEach((draw) => draw());
  // Today: a beacon on the road and a hairline through the whole scene.
  const cy = yOf(nowX);
  const beacon = svg('g', { class: 'road-now', transform: `translate(${nowX} 0)` }, el);
  svg('title', {}, beacon).textContent = `Today, ${short(m.now)}`;
  svg('line', { class: 'road-now-line', x1: 0, x2: 0, y1: compact ? 4 : 28, y2: H - (compact ? 4 : 22) }, beacon);
  svg('circle', { class: 'road-now-ring', cx: 0, cy, r: compact ? 8 : 12 }, beacon);
  svg('circle', { class: 'road-now-dot', cx: 0, cy, r: compact ? 3.5 : 5 }, beacon);
  if (!compact) {
    const label = todayLabel;
    const w = todayW;
    const lx = todayX0 - nowX;
    svg('rect', { class: 'road-now-chip', x: lx, y: 30, width: w, height: 22, rx: 11 }, beacon);
    svg('text', { class: 'road-now-text', x: lx + w / 2, y: 45, 'text-anchor': 'middle' }, beacon).textContent = label;
  }
  return { el, nowX, width: W, model: m, xOf };
}

/**
 * Alpha 0.3 PR 17: what the Fit zoom takes in. For one plan: the whole plan,
 * with a little either side. For all plans end to end: the newest plan under
 * way today, from a stretch before it began (the end of the plan before) to
 * most of a year past its end.
 */
export function fitWindow(doc, planId, now = today()) {
  const top = doc.nodes[planId];
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan' && n.start && n.end);
  const pad = (p, before, after) => ({ from: addDays(p.start, -before), to: addDays(p.end, after) });
  if (top?.type === 'plan' && top.start && top.end) return pad(top, 45, 90);
  const live = plans.filter((p) => p.start <= now && now <= p.end).sort((a, b) => b.start.localeCompare(a.start))[0]
    ?? plans.sort((a, b) => b.start.localeCompare(a.start))[0];
  return live ? pad(live, 200, 460) : null;
}

/** The full roadmap page: plan picker, zoom, a road that slides sideways, a strip to move along it, and a legend. */
export function RoadmapRoad(ctx) {
  const doc = withoutDrafts(ctx.store.doc);
  const plans = Object.values(doc.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
  if (!plans.length) return h('p', { class: 'empty' }, 'No plans yet.');
  // Start on the whole road: the longest plan whose dates hold today.
  // With plans side by side, it opens on all of them end to end (PR 17), so the one just finished shows too.
  if (!doc.nodes[planPick]) planPick = plans.length > 1 && rootOf(doc) ? rootOf(doc).id : (plans.filter((p) => p.start && p.end && p.start <= today() && today() <= p.end).sort((a, b) => daysBetween(b.start, b.end) - daysBetween(a.start, a.end))[0] ?? plans[0]).id;
  const fit = zoom === 'fit' ? fitWindow(doc, planPick) : null;
  // The screen the road has: the main column, less its padding and the arrows.
  // Measured once the road is on screen; until then, a guess from the window.
  const viewW = fitW ?? Math.max(600, innerWidth - 420);
  const road = RoadSvg(doc, planPick, { onOpen: (n) => ctx.select(n.id), ...(fit ? { span: fit, dayPx: viewW / Math.max(30, daysBetween(fit.from, fit.to)) } : {}) });
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
  requestAnimationFrame(() => {
    // The guess was off by more than a little: draw again at the width the road really has.
    if (fit && scroller.clientWidth && Math.abs(scroller.clientWidth - viewW) > 24) { fitW = scroller.clientWidth; ctx.render(); return; }
    if (fit) scroller.scrollLeft = Math.max(0, road.xOf(fit.from)); else toToday(false);
    sync();
  });

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
      h('span', {}, h('i', { class: 'lg-obj' }), 'Strategic objective signpost'),
      h('span', {}, h('i', { class: 'lg-sign' }), 'Goal sign: one light per workplan'),
      h('span', {}, h('i', { class: 'lg-now' }), 'Today'),
      h('span', {}, h('i', { class: 'lg-finish' }), 'Plan ends')),
    h('details', { class: 'road-list' }, h('summary', {}, 'The same, as a list'),
      h('ol', {}, [...m.posts].sort((a, b) => a.date.localeCompare(b.date)).map((p) => h('li', {}, h('i', { class: 'lg-light', style: `--c:${LIGHT_COLOR[p.light]}` }), h('a', { href: `#${p.node.id}` }, p.node.title), h('span', { class: 'muted small' }, ` ends ${short(p.date)} · ${p.progress.done}/${p.progress.total} tasks done`))))));
}
export { parse };
