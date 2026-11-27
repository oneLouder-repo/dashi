import { paramById, toDisplay, judge, groupRecords, FLAGS } from './model.js';

/**
 * The viz finder (stage 1): read a dataset's shape, suggest the viz types
 * that fit it best (with the reason), and draw each with D3.
 *
 * A dataset: { title, series: [{ site, param, unit, depth?, points: [[iso, v, flag?]] }], shape?, xy?, grid? }
 *
 *   shapeOf(ds)        → { kind, nSeries, sites, params, points, spanDays, stepHours, … }
 *   suggest(shape)     → [{ viz, score, why }] best first (score 0 = doesn't fit)
 *   VIZ                the viz types: { id, label, family, about, fit(shape) → [score, why], draw(d3, ds, opts) → svg }
 *
 * Families: 'Charts' (plain and honest, for the bench and reports) and
 * 'Sketchbook' (generative, after Ben Fry, Casey Reas and yugop). Every
 * sketch still says what it shows and has the table view next to it.
 */

export const GREEN = '#2f8f5b';
const PALETTE = ['#2f8f5b', '#2c4fa3', '#ef7f2d', '#7b2fe8', '#3e8fa6', '#c8432f', '#c77deb', '#f4a93b'];
const INK = '#16181d', QUIET = '#6b7280', GRID = '#e7e5e0', WARN = '#c8432f';

/** A file read by formats.js → a dataset. */
export function datasetFromParsed(parsed, title = '') {
  return { title: title || parsed.meta?.title || '', series: groupRecords(parsed.records ?? []), shape: parsed.shape ?? null, xy: parsed.xy ?? null, grid: parsed.grid ?? null, sites: Object.keys(parsed.sites ?? {}) };
}
/** Series from the document → a dataset. */
export function datasetFromDoc(doc, seriesIds, title = '') {
  return { title, series: seriesIds.map((id) => doc.series[id]).filter(Boolean).map((s) => ({ ...s, site: doc.sites[s.siteId]?.name ?? s.siteId })), shape: null };
}

const pts = (s) => s.points.map((p) => ({ t: new Date(p[0]), v: toDisplay(p[1], s.unit, s.param), f: p[2] ?? null })).filter((p) => Number.isFinite(p.v) && !Number.isNaN(+p.t));
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const label = (s) => `${paramById(s.param)?.short ?? s.param}${s.unit ? ` (${s.unit})` : ''}`;

/* ------------------------------------------------------------ the shape */

export function shapeOf(ds) {
  if (ds.xy?.x?.length) return { kind: 'spectrum', nSeries: 1, points: ds.xy.x.length, sites: 1, params: 1, about: `A spectrum of ${ds.xy.x.length} points, ${ds.xy.xLabel} against ${ds.xy.yLabel}.` };
  if (ds.grid?.zs?.length) return { kind: 'grid', nSeries: ds.grid.ys.length, points: ds.grid.zs.length, sites: 1, params: 1, about: `A grid: ${ds.grid.xs.length} times × ${ds.grid.ys.length} depths of one variable.` };
  const series = ds.series ?? [];
  if (!series.length) return { kind: 'sites', nSeries: 0, points: 0, sites: ds.sites?.length ?? 0, params: 0, about: ds.sites?.length ? `${ds.sites.length} sites with places but no readings yet. Bring in a file of readings to draw them.` : 'No readings in this file.' };
  const sites = new Set(series.map((s) => s.site)), params = new Set(series.map((s) => s.param));
  const depths = new Set(series.map((s) => s.depth).filter((d) => d != null));
  const times = new Set(series.flatMap((s) => s.points.map((p) => p[0])));
  const all = series.flatMap(pts), n = all.length;
  const tms = [...times].map((t) => Date.parse(t)).filter(Number.isFinite);
  const oneCast = tms.length > 0 && Math.max(...tms) - Math.min(...tms) < 6 * 36e5; // a CTD cast and its bottles take minutes, not days
  if (depths.size > 4 && (times.size <= 3 || oneCast)) return { kind: 'profile', nSeries: series.length, points: n, sites: sites.size, params: params.size, depths: depths.size, about: `A profile: ${params.size} parameters at ${depths.size} depths.` };
  const tt = all.map((p) => +p.t).sort((a, b) => a - b);
  const spanDays = tt.length ? (tt.at(-1) - tt[0]) / 864e5 : 0;
  const steps = series.flatMap((s) => { const t = s.points.map((p) => Date.parse(p[0])).sort((a, b) => a - b); return t.slice(1).map((x, i) => x - t[i]).filter((d) => d > 0); });
  const stepHours = median(steps) / 36e5;
  const kind = series.length <= 1 ? 'one' : sites.size === 1 ? 'multi-param' : params.size === 1 ? 'multi-site' : 'many';
  const pairs = params.size >= 2 && sites.size >= 1;
  const cadence = stepHours < 1.01 ? `every ${Math.round(stepHours * 60)} minutes` : stepHours < 30 ? `every ${Math.round(stepHours)} hours` : stepHours < 24 * 10 ? `every ${Math.round(stepHours / 24)} days` : `about monthly`;
  return { kind, nSeries: series.length, points: n, sites: sites.size, params: params.size, paramIds: [...params], spanDays, stepHours, dense: stepHours > 0 && stepHours <= 3, long: spanDays >= 300, pairs,
    about: `${n.toLocaleString()} readings: ${params.size} parameter${params.size === 1 ? '' : 's'} at ${sites.size} site${sites.size === 1 ? '' : 's'}, over ${Math.max(1, Math.round(spanDays))} days, ${cadence}.` };
}

/** Suggestions for a shape, best first. */
export function suggest(shape) {
  if (!shape.points) return [];
  return VIZ.map((viz) => { const [score, why] = viz.fit(shape); return { viz, score, why }; }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------ drawing helpers */

function frame(d3, { w = 640, h = 280, title = '' } = {}) {
  const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('class', 'eo-svg').attr('role', 'img').attr('aria-label', title);
  return svg;
}
function axes(d3, svg, x, y, { w, h, m, yLabel = '', xFormat = null }) {
  svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(Math.max(2, Math.round((w - m.l - m.r) / 90))).tickSizeOuter(0).tickFormat(xFormat));
  svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r))).call((g) => g.selectAll('.tick line').attr('stroke', GRID)).call((g) => g.select('.domain').remove());
  if (yLabel) svg.append('text').attr('class', 'eo-ylabel').attr('x', m.l).attr('y', m.t - 8).text(yLabel);
}
/** A guideline: a dashed line at the min or max, with its note. */
function guide(svg, s, y, x0, x1) {
  const g = paramById(s.param)?.guide;
  if (!g) return;
  for (const [v, word] of [[g.min, 'min'], [g.max, 'max']]) {
    if (v == null) continue;
    const yy = y(v);
    if (!Number.isFinite(yy) || yy < y.range()[1] - 2 || yy > y.range()[0] + 2) continue;
    svg.append('line').attr('class', 'eo-guide').attr('x1', x0).attr('x2', x1).attr('y1', yy).attr('y2', yy);
    svg.append('text').attr('class', 'eo-guide-label').attr('x', x1 - 4).attr('y', yy - 4).attr('text-anchor', 'end').text(`guide ${word} ${v}`);
  }
}
const empty = (d3, text) => { const svg = frame(d3, { h: 120 }); svg.append('text').attr('x', 320).attr('y', 64).attr('text-anchor', 'middle').attr('class', 'eo-empty').text(text); return svg.node(); };
const first = (ds, pred = () => true) => (ds.series ?? []).find((s) => pred(s) && s.points.length);

/* ------------------------------------------------------------ the viz types */

export const VIZ = [
  {
    id: 'line', label: 'Line with guideline', family: 'Charts',
    about: 'The honest default: each reading over time, the guide value dashed, readings past it in red, flagged ones hollow.',
    fit: (s) => (['one', 'multi-site', 'multi-param', 'many'].includes(s.kind) ? [s.kind === 'one' ? 8 : s.kind === 'multi-site' ? 6 : 4, s.kind === 'multi-site' ? 'One parameter at several sites compares well on one set of axes.' : 'Every reading in time order, with the guide value to read against.'] : [0]),
    draw(d3, ds, { w = 640, h = 280 } = {}) {
      const base = first(ds); if (!base) return empty(d3, 'No readings to draw');
      const group = ds.series.filter((s) => s.param === base.param).slice(0, 6);
      const m = { t: 28, r: 16, b: 26, l: 46 };
      const all = group.flatMap(pts);
      const x = d3.scaleUtc(d3.extent(all, (p) => p.t), [m.l, w - m.r]);
      const g = paramById(base.param)?.guide ?? {};
      const y = d3.scaleLinear(d3.extent([...all.map((p) => p.v), g.min, g.max].filter((v) => v != null)), [h - m.b, m.t]).nice();
      const svg = frame(d3, { w, h, title: `${label(base)} over time` });
      axes(d3, svg, x, y, { w, h, m, yLabel: label(base) });
      guide(svg, base, y, m.l, w - m.r);
      group.forEach((s, i) => {
        const p = pts(s), c = PALETTE[i % PALETTE.length];
        svg.append('path').datum(p).attr('fill', 'none').attr('stroke', c).attr('stroke-width', p.length > 300 ? 1 : 1.6).attr('d', d3.line((d) => x(d.t), (d) => y(d.v)));
        if (p.length <= 300) svg.append('g').selectAll('circle').data(p).join('circle').attr('cx', (d) => x(d.t)).attr('cy', (d) => y(d.v)).attr('r', 2.6)
          .attr('fill', (d) => (d.f ? '#fff' : ['low', 'high'].includes(judge(s.param, d.v)) ? WARN : c)).attr('stroke', (d) => (['low', 'high'].includes(judge(s.param, d.v)) ? WARN : c));
      });
      if (group.length > 1) group.forEach((s, i) => svg.append('text').attr('class', 'eo-key').attr('x', m.l + 8 + i * 130).attr('y', h - 4).attr('fill', PALETTE[i % PALETTE.length]).text(`● ${String(s.site ?? '').slice(0, 18)}`));
      return svg.node();
    },
  },
  {
    id: 'bench', label: 'Lab bench strip', family: 'Charts',
    about: 'Small multiples: every parameter of one site, one thin line each, on the same time axis. The lab worker’s morning view: what moved, and together?',
    fit: (s) => (s.params >= 2 && ['multi-param', 'many'].includes(s.kind) ? [9, `${s.params} parameters share a clock: small multiples show what moves together.`] : [0]),
    draw(d3, ds, { w = 640 } = {}) {
      const site = first(ds)?.site;
      const list = ds.series.filter((s) => s.site === site && s.depth == null).slice(0, 8);
      if (!list.length) return empty(d3, 'No series for one site');
      const rowH = 54, m = { t: 14, r: 70, b: 24, l: 96 }, h = m.t + m.b + rowH * list.length;
      const all = list.flatMap(pts);
      const x = d3.scaleUtc(d3.extent(all, (p) => p.t), [m.l, w - m.r]);
      const svg = frame(d3, { w, h, title: `Every parameter at ${site}` });
      list.forEach((s, i) => {
        const p = pts(s), y0 = m.t + i * rowH;
        const y = d3.scaleLinear(d3.extent(p, (d) => d.v), [y0 + rowH - 10, y0 + 6]);
        svg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y0 + rowH - 4).attr('y2', y0 + rowH - 4).attr('stroke', GRID);
        guide(svg, s, y, m.l, w - m.r);
        svg.append('path').datum(p).attr('fill', 'none').attr('stroke', PALETTE[i % PALETTE.length]).attr('stroke-width', 1.2).attr('d', d3.line((d) => x(d.t), (d) => y(d.v)));
        svg.append('text').attr('class', 'eo-row-label').attr('x', m.l - 10).attr('y', y0 + rowH / 2 + 2).attr('text-anchor', 'end').text(paramById(s.param)?.short ?? s.param);
        svg.append('text').attr('class', 'eo-row-unit').attr('x', m.l - 10).attr('y', y0 + rowH / 2 + 15).attr('text-anchor', 'end').text(s.unit);
        const last = p.at(-1);
        if (last) svg.append('text').attr('class', 'eo-row-last').attr('x', w - m.r + 8).attr('y', y(last.v) + 4).text(d3.format('.3~g')(last.v));
      });
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
      return svg.node();
    },
  },
  {
    id: 'horizon', label: 'Horizon chart', family: 'Charts',
    about: 'Folds a long, dense logger record into bands of colour, so weeks of 15-minute data fit in a strip and spikes still stand out.',
    fit: (s) => (s.dense && s.points >= 400 && !['profile', 'grid', 'spectrum'].includes(s.kind) ? [8, 'Thousands of logger readings: a horizon chart keeps the detail in little height.'] : [0]),
    draw(d3, ds, { w = 640 } = {}) {
      const list = ds.series.filter((s) => s.points.length > 50).slice(0, 6);
      if (!list.length) return empty(d3, 'Needs a long series');
      const bands = 3, rowH = 34, m = { t: 10, r: 12, b: 24, l: 96 }, h = m.t + m.b + list.length * (rowH + 6);
      const x = d3.scaleUtc(d3.extent(list.flatMap(pts), (p) => p.t), [m.l, w - m.r]);
      const svg = frame(d3, { w, h, title: 'Horizon chart' });
      list.forEach((s, i) => {
        const p = pts(s), y0 = m.t + i * (rowH + 6), [lo, hi] = d3.extent(p, (d) => d.v), step = (hi - lo) / bands || 1;
        const clip = `eo-hz-${Math.random().toString(36).slice(2, 7)}`;
        svg.append('clipPath').attr('id', clip).append('rect').attr('x', m.l).attr('y', y0).attr('width', w - m.l - m.r).attr('height', rowH);
        const colour = d3.scaleSequential([0, bands], d3.interpolateRgb('#d8efe0', '#1e6b43'));
        for (let b = 0; b < bands; b++) {
          const y = d3.scaleLinear([lo + b * step, lo + (b + 1) * step], [y0 + rowH, y0]);
          svg.append('path').datum(p).attr('clip-path', `url(#${clip})`).attr('fill', colour(b + 1)).attr('d', d3.area((d) => x(d.t), y0 + rowH, (d) => y(d.v)));
        }
        svg.append('text').attr('class', 'eo-row-label').attr('x', m.l - 10).attr('y', y0 + rowH / 2 + 4).attr('text-anchor', 'end').text(`${paramById(s.param)?.short ?? s.param}`);
      });
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
      return svg.node();
    },
  },
  {
    id: 'daycycle', label: 'Day-cycle heatmap', family: 'Charts',
    about: 'Hour of day against date. Oxygen and temperature breathe with the sun; smoke and traffic show as stripes. One cell per hour.',
    fit: (s) => (s.dense && s.spanDays >= 3 && s.spanDays <= 120 ? [8, 'Sub-daily readings over days: the daily rhythm shows as stripes.'] : [0]),
    draw(d3, ds, { w = 640, h = 260 } = {}) {
      const s = first(ds, (x) => x.points.length > 48) ?? first(ds); if (!s) return empty(d3, 'Needs hourly data');
      const m = { t: 28, r: 16, b: 26, l: 46 };
      const cells = d3.rollups(pts(s), (v) => d3.mean(v, (d) => d.v), (d) => d3.utcDay.floor(d.t).getTime(), (d) => d.t.getUTCHours());
      const days = cells.map((c) => c[0]).sort((a, b) => a - b);
      const x = d3.scaleBand(days, [m.l, w - m.r]), y = d3.scaleBand(d3.range(24), [m.t, h - m.b]);
      const vals = cells.flatMap((c) => c[1].map((k) => k[1]));
      const colour = d3.scaleSequential(d3.extent(vals), s.param === 'pm25' ? d3.interpolateOrRd : d3.interpolateYlGnBu);
      const svg = frame(d3, { w, h, title: `${label(s)} by hour of day` });
      for (const [dayMs, hours] of cells) for (const [hr, v] of hours) svg.append('rect').attr('x', x(dayMs)).attr('y', y(hr)).attr('width', Math.max(1, x.bandwidth() - 0.5)).attr('height', y.bandwidth() - 0.5).attr('fill', colour(v)).append('title').text(`${new Date(dayMs).toISOString().slice(0, 10)} ${hr}:00 · ${d3.format('.3~g')(v)} ${s.unit}`);
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([0, 6, 12, 18]).tickFormat((d) => `${d}:00`));
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(d3.scaleUtc(d3.extent(days), [m.l, w - m.r])).ticks(6));
      svg.append('text').attr('class', 'eo-ylabel').attr('x', m.l).attr('y', m.t - 8).text(`${label(s)} · hour (UTC) by day`);
      return svg.node();
    },
  },
  {
    id: 'calendar', label: 'Calendar heatmap', family: 'Charts',
    about: 'One square per day, weeks across: gaps in sampling and seasonal runs are plain to see.',
    fit: (s) => (s.spanDays >= 60 && s.stepHours <= 48 && s.points >= 60 ? [7, 'Daily-ish readings over months: a calendar shows runs and gaps.'] : s.spanDays >= 120 && s.points >= 20 ? [3, 'Readings over many months; sparse, but the calendar shows when sampling happened.'] : [0]),
    draw(d3, ds, { w = 640 } = {}) {
      const s = first(ds); if (!s) return empty(d3, 'No readings');
      const byDay = d3.rollup(pts(s), (v) => d3.mean(v, (d) => d.v), (d) => d3.utcDay.floor(d.t).getTime());
      const daysMs = [...byDay.keys()].sort((a, b) => a - b), start = d3.utcSunday.floor(new Date(daysMs[0]));
      const weeks = d3.utcSunday.count(start, new Date(daysMs.at(-1))) + 1, cs = Math.min(14, (w - 60) / weeks), h = cs * 7 + 50;
      const colour = d3.scaleSequential(d3.extent([...byDay.values()]), d3.interpolateYlGn);
      const svg = frame(d3, { w, h, title: `${label(s)} by day` });
      for (const [k, v] of byDay) { const d = new Date(k); svg.append('rect').attr('x', 40 + d3.utcSunday.count(start, d) * cs).attr('y', 24 + d.getUTCDay() * cs).attr('width', cs - 1.5).attr('height', cs - 1.5).attr('rx', 2).attr('fill', ['low', 'high'].includes(judge(s.param, v)) ? WARN : colour(v)).append('title').text(`${d.toISOString().slice(0, 10)} · ${d3.format('.3~g')(v)} ${s.unit}`); }
      for (const mth of d3.utcMonths(start, new Date(daysMs.at(-1)))) svg.append('text').attr('class', 'eo-key').attr('x', 40 + d3.utcSunday.count(start, mth) * cs).attr('y', 16).text(d3.utcFormat('%b')(mth));
      ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => svg.append('text').attr('class', 'eo-key').attr('x', 26).attr('y', 24 + i * cs + cs * 0.7).text(d));
      svg.append('text').attr('class', 'eo-key').attr('x', 40).attr('y', h - 8).text(`${label(s)} · red: past the guide value`);
      return svg.node();
    },
  },
  {
    id: 'rings', label: 'Seasonal rings', family: 'Sketchbook',
    about: 'Each year a ring, like a tree’s: months around the circle, the reading as distance from the centre. Years laid over each other compare at a glance.',
    fit: (s) => (s.long ? [7, 'More than a year of readings: rings put each season beside the same season last year.'] : s.spanDays >= 150 ? [3, 'Half a year or more: one partial ring.'] : [0]),
    draw(d3, ds, { w = 640, h = 340 } = {}) {
      const s = first(ds); if (!s) return empty(d3, 'No readings');
      const p = pts(s), cx = w / 2, cy = h / 2 + 6, R = Math.min(w, h) / 2 - 30;
      const r = d3.scaleLinear(d3.extent(p, (d) => d.v), [R * 0.25, R]);
      const ang = (d) => ((d - d3.utcYear.floor(d)) / (d3.utcYear.ceil(d) - d3.utcYear.floor(d) || 1)) * 2 * Math.PI;
      const svg = frame(d3, { w, h, title: `${label(s)}, year by year` });
      for (const v of r.ticks(4)) svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r(v)).attr('fill', 'none').attr('stroke', GRID);
      d3.range(12).forEach((mth) => { const a = (mth / 12) * 2 * Math.PI - Math.PI / 2; svg.append('text').attr('class', 'eo-key').attr('x', cx + Math.cos(a) * (R + 14)).attr('y', cy + Math.sin(a) * (R + 14) + 4).attr('text-anchor', 'middle').text('JFMAMJJASOND'[mth]); });
      const years = d3.groups(p, (d) => d.t.getUTCFullYear());
      years.forEach(([yr, list], i) => {
        const c = d3.interpolateRgb('#bfe3cc', GREEN)(years.length > 1 ? i / (years.length - 1) : 1);
        svg.append('path').datum(list).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('d', d3.lineRadial().angle((d) => ang(d.t)).radius((d) => r(d.v)).curve(d3.curveCatmullRom)).attr('transform', `translate(${cx},${cy})`);
        svg.append('text').attr('class', 'eo-key').attr('x', 16).attr('y', 20 + i * 16).attr('fill', c).text(`● ${yr}`);
      });
      svg.append('text').attr('class', 'eo-key').attr('x', w - 16).attr('y', 20).attr('text-anchor', 'end').text(label(s));
      return svg.node();
    },
  },
  {
    id: 'strip', label: 'Site strip plot', family: 'Charts',
    about: 'One row per site, every reading a dot: which site runs high, which varies most, where the outliers are.',
    fit: (s) => (s.sites >= 2 ? [7, `${s.sites} sites: one row each makes them easy to compare.`] : [0]),
    draw(d3, ds, { w = 640 } = {}) {
      const base = first(ds); if (!base) return empty(d3, 'No readings');
      const list = ds.series.filter((s) => s.param === base.param && s.depth == null);
      const sites = [...new Set(list.map((s) => s.site))], rowH = 36, m = { t: 26, r: 16, b: 26, l: 140 }, h = m.t + m.b + rowH * sites.length;
      const all = list.flatMap(pts), g = paramById(base.param)?.guide ?? {};
      const x = d3.scaleLinear(d3.extent([...all.map((p) => p.v), g.min, g.max].filter((v) => v != null)), [m.l, w - m.r]).nice();
      const y = d3.scaleBand(sites, [m.t, h - m.b]).padding(0.2);
      const svg = frame(d3, { w, h, title: `${label(base)} by site` });
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6));
      for (const [v, word] of [[g.min, 'min'], [g.max, 'max']]) if (v != null) { svg.append('line').attr('class', 'eo-guide').attr('x1', x(v)).attr('x2', x(v)).attr('y1', m.t).attr('y2', h - m.b); svg.append('text').attr('class', 'eo-guide-label').attr('x', x(v) + 4).attr('y', m.t - 4).text(`guide ${word}`); }
      let k = 0;
      for (const s of list) for (const p of pts(s)) svg.append('circle').attr('cx', x(p.v)).attr('cy', y(s.site) + y.bandwidth() / 2 + ((k++ * 7919) % 17 - 8) * (y.bandwidth() / 22)).attr('r', 3).attr('fill', ['low', 'high'].includes(judge(s.param, p.v)) ? WARN : GREEN).attr('fill-opacity', 0.55);
      sites.forEach((st) => svg.append('text').attr('class', 'eo-row-label').attr('x', m.l - 10).attr('y', y(st) + y.bandwidth() / 2 + 4).attr('text-anchor', 'end').text(String(st).slice(0, 22)));
      svg.append('text').attr('class', 'eo-ylabel').attr('x', m.l).attr('y', 14).text(label(base));
      return svg.node();
    },
  },
  {
    id: 'scatter', label: 'Parameter pairs', family: 'Charts',
    about: 'Two parameters measured together, one against the other: warmer water holds less oxygen, and the cloud of dots shows how tightly.',
    fit: (s) => (s.pairs && s.params >= 2 ? [s.paramIds?.includes('temp') && s.paramIds?.includes('do') ? 7 : 5, s.paramIds?.includes('temp') && s.paramIds?.includes('do') ? 'Temperature and oxygen measured together: the pair shows the classic trade-off.' : 'Parameters measured at the same times can be plotted against each other.'] : [0]),
    draw(d3, ds, { w = 640, h = 300 } = {}) {
      const byParam = d3.group(ds.series.filter((s) => s.depth == null), (s) => s.param);
      const ids = [...byParam.keys()], a = ids.includes('temp') ? 'temp' : ids[0], b = ids.includes('do') ? 'do' : ids.find((x) => x !== a);
      if (!a || !b) return empty(d3, 'Needs two parameters');
      const at = new Map(), pairs = [];
      for (const s of byParam.get(a)) for (const p of pts(s)) at.set(`${s.site}|${+p.t}`, p.v);
      for (const s of byParam.get(b)) for (const p of pts(s)) { const va = at.get(`${s.site}|${+p.t}`); if (va != null) pairs.push({ x: va, y: p.v, site: s.site }); }
      if (!pairs.length) return empty(d3, 'The two parameters were never measured at the same time');
      const m = { t: 28, r: 16, b: 34, l: 46 };
      const x = d3.scaleLinear(d3.extent(pairs, (d) => d.x), [m.l, w - m.r]).nice(), y = d3.scaleLinear(d3.extent(pairs, (d) => d.y), [h - m.b, m.t]).nice();
      const svg = frame(d3, { w, h, title: `${a} against ${b}` });
      axes(d3, svg, x, y, { w, h, m, yLabel: label(byParam.get(b)[0]) });
      const sites = [...new Set(pairs.map((p) => p.site))];
      svg.append('g').selectAll('circle').data(pairs).join('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', pairs.length > 500 ? 1.6 : 3).attr('fill', (d) => PALETTE[sites.indexOf(d.site) % PALETTE.length]).attr('fill-opacity', 0.6);
      svg.append('text').attr('class', 'eo-key').attr('x', w - m.r).attr('y', h - 4).attr('text-anchor', 'end').text(label(byParam.get(a)[0]));
      return svg.node();
    },
  },
  {
    id: 'box', label: 'Distribution by site', family: 'Charts',
    about: 'Median, middle half and range for each site: a quick, fair summary when there are many samples.',
    fit: (s) => (s.sites >= 2 && s.points / Math.max(1, s.nSeries) >= 8 ? [5, 'Enough samples per site for a fair summary of each.'] : [0]),
    draw(d3, ds, { w = 640 } = {}) {
      const base = first(ds); if (!base) return empty(d3, 'No readings');
      const list = ds.series.filter((s) => s.param === base.param && s.depth == null);
      const rows = list.map((s) => { const v = pts(s).map((p) => p.v).sort(d3.ascending); return { site: s.site, q1: d3.quantile(v, 0.25), q2: d3.quantile(v, 0.5), q3: d3.quantile(v, 0.75), lo: v[0], hi: v.at(-1) }; });
      const rowH = 34, m = { t: 26, r: 16, b: 26, l: 140 }, h = m.t + m.b + rowH * rows.length;
      const x = d3.scaleLinear([d3.min(rows, (r) => r.lo), d3.max(rows, (r) => r.hi)], [m.l, w - m.r]).nice(), y = d3.scaleBand(rows.map((r) => r.site), [m.t, h - m.b]).padding(0.35);
      const svg = frame(d3, { w, h, title: `${label(base)}, distribution by site` });
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6));
      for (const r of rows) {
        const cy = y(r.site) + y.bandwidth() / 2;
        svg.append('line').attr('x1', x(r.lo)).attr('x2', x(r.hi)).attr('y1', cy).attr('y2', cy).attr('stroke', QUIET);
        svg.append('rect').attr('x', x(r.q1)).attr('width', Math.max(1, x(r.q3) - x(r.q1))).attr('y', y(r.site)).attr('height', y.bandwidth()).attr('rx', 3).attr('fill', '#d8efe0').attr('stroke', GREEN);
        svg.append('line').attr('x1', x(r.q2)).attr('x2', x(r.q2)).attr('y1', y(r.site)).attr('y2', y(r.site) + y.bandwidth()).attr('stroke', INK).attr('stroke-width', 2);
        svg.append('text').attr('class', 'eo-row-label').attr('x', m.l - 10).attr('y', cy + 4).attr('text-anchor', 'end').text(String(r.site).slice(0, 22));
      }
      svg.append('text').attr('class', 'eo-ylabel').attr('x', m.l).attr('y', 14).text(label(base));
      return svg.node();
    },
  },
  {
    id: 'profile', label: 'Depth profile', family: 'Charts',
    about: 'Depth down the side, the reading across, the way oceanographers draw a cast: the thermocline and the oxygen dip show as bends.',
    fit: (s) => (s.kind === 'profile' ? [10, 'Readings by depth from one cast: a profile is how they are read.'] : [0]),
    draw(d3, ds, { w = 640, h = 340 } = {}) {
      const list = ds.series.filter((s) => s.depth != null);
      const params = [...new Set(list.map((s) => s.param))].slice(0, 4);
      if (!params.length) return empty(d3, 'No depths');
      const svg = frame(d3, { w, h, title: 'Depth profile' });
      const pw = (w - 40) / params.length, m = { t: 34, b: 16 };
      const depths = d3.extent(list, (s) => s.depth);
      const y = d3.scaleLinear(depths, [m.t, h - m.b]);
      params.forEach((pid, i) => {
        const rows = list.filter((s) => s.param === pid).map((s) => ({ d: s.depth, v: toDisplay(s.points[0]?.[1], s.unit, s.param), f: s.points[0]?.[2] ?? null })).filter((r) => Number.isFinite(r.v)).sort((a, b) => a.d - b.d);
        const x0 = 40 + i * pw, x = d3.scaleLinear(d3.extent(rows, (r) => r.v), [x0 + 10, x0 + pw - 10]).nice();
        svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${m.t})`).call(d3.axisTop(x).ticks(3));
        svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', PALETTE[i]).attr('stroke-width', 2).attr('d', d3.line((r) => x(r.v), (r) => y(r.d)));
        svg.append('text').attr('class', 'eo-ylabel').attr('x', x0 + 10).attr('y', 12).text(label(list.find((s) => s.param === pid)));
        // Bottle samples are a handful of points: draw each one, hollow when the lab flagged it.
        if (rows.length <= 24) svg.append('g').selectAll('circle').data(rows).join('circle').attr('cx', (r) => x(r.v)).attr('cy', (r) => y(r.d)).attr('r', 3.6)
          .attr('fill', (r) => (r.f ? 'var(--eo-paper, #fff)' : PALETTE[i])).attr('stroke', PALETTE[i]).attr('stroke-width', 1.5).append('title').text((r) => `${r.d} m: ${r.v}${r.f ? ` (${FLAGS[r.f] ?? r.f})` : ''}`);
      });
      svg.append('g').attr('class', 'eo-axis').attr('transform', 'translate(40,0)').call(d3.axisLeft(y).ticks(6).tickFormat((d) => `${d} m`));
      return svg.node();
    },
  },
  {
    id: 'depthtime', label: 'Depth by time', family: 'Charts',
    about: 'A mooring’s record as a picture: time across, depth down, colour for the reading. Summer stratification and autumn turnover show as shapes.',
    fit: (s) => (s.kind === 'grid' ? [10, 'A grid of time and depth: a heatmap is how it is read.'] : [0]),
    draw(d3, ds, { w = 640, h = 280 } = {}) {
      const g = ds.grid; if (!g) return empty(d3, 'No grid');
      const m = { t: 24, r: 16, b: 26, l: 46 };
      const x = d3.scaleBand(g.xs, [m.l, w - m.r]), y = d3.scaleBand(g.ys, [m.t, h - m.b]);
      const colour = d3.scaleSequential(d3.extent(g.zs), d3.interpolateRdYlBu).clamp(true);
      const flip = (v) => colour(d3.max(g.zs) + d3.min(g.zs) - v);
      const svg = frame(d3, { w, h, title: 'Depth by time' });
      g.xs.forEach((xv, i) => g.ys.forEach((yv, j) => svg.append('rect').attr('x', x(xv)).attr('y', y(yv)).attr('width', x.bandwidth() + 0.5).attr('height', y.bandwidth() + 0.5).attr('fill', flip(g.zs[i * g.ys.length + j])).append('title').text(`day ${xv}, ${yv} m: ${g.zs[i * g.ys.length + j]}`)));
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(g.ys.filter((_, i) => i % 2 === 0)).tickFormat((d) => `${d} m`));
      svg.append('g').attr('class', 'eo-axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).tickValues(g.xs.filter((_, i) => i % 4 === 0)).tickFormat((d) => `day ${d}`));
      svg.append('text').attr('class', 'eo-ylabel').attr('x', m.l).attr('y', 14).text(`${paramById(g.param)?.label ?? g.param}: warm red, cold blue`);
      return svg.node();
    },
  },
  {
    id: 'spectrum', label: 'Spectrum with peaks', family: 'Charts',
    about: 'Absorbance against wavelength, with the peaks found and labelled. Nitrate absorbs near 220 nm; dissolved organic matter shows as a slope.',
    fit: (s) => (s.kind === 'spectrum' ? [10, 'A spectrum: wavelength across, signal up, peaks named.'] : [0]),
    draw(d3, ds, { w = 640, h = 280 } = {}) {
      const { x: xs, y: ys, xLabel, yLabel } = ds.xy ?? {}; if (!xs?.length) return empty(d3, 'No spectrum');
      const m = { t: 28, r: 16, b: 30, l: 50 }, rows = xs.map((x, i) => ({ x, y: ys[i] }));
      const x = d3.scaleLinear(d3.extent(xs), [m.l, w - m.r]), y = d3.scaleLinear([0, d3.max(ys)], [h - m.b, m.t]).nice();
      const svg = frame(d3, { w, h, title: 'Spectrum' });
      axes(d3, svg, x, y, { w, h, m, yLabel });
      svg.append('path').datum(rows).attr('fill', '#d8efe0').attr('d', d3.area((d) => x(d.x), h - m.b, (d) => y(d.y)));
      svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', GREEN).attr('stroke-width', 1.6).attr('d', d3.line((d) => x(d.x), (d) => y(d.y)));
      const peaks = rows.filter((r, i) => i > 3 && i < rows.length - 4 && rows.slice(i - 4, i + 5).every((o) => o.y <= r.y) && r.y > d3.max(ys) * 0.12);
      for (const p of peaks) { svg.append('line').attr('x1', x(p.x)).attr('x2', x(p.x)).attr('y1', y(p.y) - 4).attr('y2', y(p.y) - 16).attr('stroke', INK); svg.append('text').attr('class', 'eo-key').attr('x', x(p.x)).attr('y', y(p.y) - 20).attr('text-anchor', 'middle').text(`${d3.format('.4~g')(p.x)}`); }
      svg.append('text').attr('class', 'eo-key').attr('x', w - m.r).attr('y', h - 4).attr('text-anchor', 'end').text(xLabel);
      return svg.node();
    },
  },
  {
    id: 'ribbon', label: 'River ribbon', family: 'Sketchbook',
    about: 'A season as one flowing band. Its width follows the first parameter, its colour the temperature where there is one; it frays where a reading crosses its guide value.',
    fit: (s) => (['one', 'multi-param', 'multi-site', 'many'].includes(s.kind) && s.points >= 20 ? [s.paramIds?.includes('temp') && s.params >= 2 ? 6 : 4, 'A creative view of any time series: a band to print, post or hang on a wall.'] : [0]),
    draw(d3, ds, { w = 640, h = 240 } = {}) {
      const site = first(ds)?.site, list = ds.series.filter((s) => s.site === site && s.depth == null);
      const temp = list.find((s) => s.param === 'temp'), main = list.find((s) => s !== temp && s.points.length > 10) ?? temp;
      if (!main) return empty(d3, 'No readings');
      const p = pts(main), tp = temp ? pts(temp) : null;
      const x = d3.scaleUtc(d3.extent(p, (d) => d.t), [24, w - 24]), wid = d3.scaleLinear(d3.extent(p, (d) => d.v), [6, h * 0.36]);
      const colour = d3.scaleSequential(tp ? d3.extent(tp, (d) => d.v) : [0, 1], d3.interpolateRgbBasis(['#2c4fa3', '#3e8fa6', '#b2dfc4', '#f4a93b', '#c8432f']));
      const near = (t) => (tp ? tp.reduce((b, d) => (Math.abs(d.t - t) < Math.abs(b.t - t) ? d : b), tp[0]).v : 0.5);
      const mid = (t) => h / 2 + Math.sin(+t / 864e5 / 9) * h * 0.12;
      const svg = frame(d3, { w, h, title: `River ribbon: ${label(main)}` });
      svg.append('rect').attr('width', w).attr('height', h).attr('fill', '#f6f4ef');
      const step = Math.max(1, Math.floor(p.length / 220));
      for (let i = 0; i < p.length - step; i += step) {
        const a = p[i], b = p[i + step], fray = ['low', 'high'].includes(judge(main.param, a.v));
        const poly = [[x(a.t), mid(a.t) - wid(a.v) / 2], [x(b.t), mid(b.t) - wid(b.v) / 2], [x(b.t), mid(b.t) + wid(b.v) / 2], [x(a.t), mid(a.t) + wid(a.v) / 2]];
        svg.append('path').attr('d', `M${poly.map((q) => q.join(',')).join('L')}Z`).attr('fill', colour(near(a.t))).attr('fill-opacity', 0.9);
        if (fray) for (let k = 0; k < 4; k++) svg.append('line').attr('x1', x(a.t)).attr('x2', x(a.t) + (k - 1.5) * 3).attr('y1', mid(a.t) + wid(a.v) / 2).attr('y2', mid(a.t) + wid(a.v) / 2 + 10 + k * 4).attr('stroke', WARN).attr('stroke-width', 0.8);
      }
      svg.append('text').attr('class', 'eo-key').attr('x', 24).attr('y', h - 10).text(`${site ?? ''} · width: ${label(main)}${tp ? ' · colour: water temperature' : ''} · frays: past the guide value`);
      return svg.node();
    },
  },
  {
    id: 'breath', label: 'Breathing creek', family: 'Sketchbook',
    about: 'Each day a loop around a centre: the reading by hour as distance out. A healthy creek breathes in wide, even loops; a low-oxygen night pinches in.',
    fit: (s) => (s.dense && s.spanDays >= 2 && s.spanDays <= 60 ? [s.paramIds?.includes('do') ? 7 : 4, s.paramIds?.includes('do') ? 'Oxygen logged through the day: its daily breath can be drawn.' : 'Sub-daily readings make one loop a day.'] : [0]),
    draw(d3, ds, { w = 640, h = 340 } = {}) {
      const s = first(ds, (x) => x.param === 'do' && x.points.length > 48) ?? first(ds, (x) => x.points.length > 48); if (!s) return empty(d3, 'Needs readings through the day');
      const days = d3.groups(pts(s), (d) => d3.utcDay.floor(d.t).getTime()).slice(0, 40);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 20;
      const r = d3.scaleLinear(d3.extent(pts(s), (d) => d.v), [R * 0.2, R]);
      const svg = frame(d3, { w, h, title: `Breathing: ${label(s)}` });
      svg.append('rect').attr('width', w).attr('height', h).attr('fill', '#0f1f1a');
      days.forEach(([, list], i) => {
        const line = d3.lineRadial().angle((d) => ((d.t.getUTCHours() + d.t.getUTCMinutes() / 60) / 24) * 2 * Math.PI).radius((d) => r(d.v)).curve(d3.curveCatmullRomClosed);
        svg.append('path').datum(list).attr('d', line).attr('transform', `translate(${cx},${cy})`).attr('fill', 'none').attr('stroke', d3.interpolateRgb('#4da65c', '#b2dfc4')(i / Math.max(1, days.length - 1))).attr('stroke-opacity', 0.55).attr('stroke-width', 1.2);
      });
      const g = paramById(s.param)?.guide;
      if (g?.min) svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r(g.min)).attr('fill', 'none').attr('stroke', '#ef8a7e').attr('stroke-dasharray', '3 4');
      svg.append('text').attr('class', 'eo-key eo-key-light').attr('x', 16).attr('y', h - 12).text(`${days.length} days of ${label(s)} · one loop a day, midnight at the top${g?.min ? ' · dashed: guide minimum' : ''}`);
      return svg.node();
    },
  },
  {
    id: 'process', label: 'Process drawing', family: 'Sketchbook',
    about: 'After Casey Reas’s Process works: every series sends out a small flock of agents. Each walks the page, turning by how much its reading changed, and where agents of different parameters pass close, a faint thread is drawn between them. Calm water walks straight; restless water curls, and parameters that move together weave.',
    fit: (s) => (s.points >= 40 && !['grid', 'spectrum', 'profile'].includes(s.kind) ? [s.params >= 2 ? 5 : 3, s.params >= 2 ? 'Several parameters can walk together: their threads show what moves with what.' : 'Any series can walk: a generative drawing from its changes.'] : [0]),
    draw(d3, ds, { w = 640, h = 320, seed = 7 } = {}) {
      const list = ds.series.filter((s) => s.points.length > 20).slice(0, 5); if (!list.length) return empty(d3, 'Needs a series');
      const svg = frame(d3, { w, h, title: 'Process drawing' });
      svg.append('rect').attr('width', w).attr('height', h).attr('fill', '#fbfaf7');
      let a0 = seed >>> 0; const rnd = () => { a0 = (a0 * 1664525 + 1013904223) >>> 0; return a0 / 4294967296; };
      const FLOCK = 6, threads = svg.append('g'), trails = svg.append('g');
      const agents = list.flatMap((s, i) => {
        const p = pts(s), [lo, hi] = d3.extent(p, (d) => d.v), span = hi - lo || 1;
        return d3.range(FLOCK).map((k) => ({ s, i, p, span, off: Math.floor((k / FLOCK) * p.length), x: w * (0.15 + 0.7 * rnd()), y: h * (0.15 + 0.7 * rnd()), a: rnd() * 2 * Math.PI, path: [] }));
      });
      const steps = Math.min(600, Math.max(...list.map((s) => s.points.length)));
      const step = Math.max(1.1, 700 / steps);
      for (let t = 0; t < steps; t++) {
        for (const g of agents) {
          const k = (g.off + t) % g.p.length, prev = g.p[(k || 1) - 1], cur = g.p[k || 1];
          g.a += ((cur.v - prev.v) / g.span) * 2.4 + 0.01;
          g.x += Math.cos(g.a) * step; g.y += Math.sin(g.a) * step;
          if (g.x < 10 || g.x > w - 10) g.a = Math.PI - g.a; if (g.y < 10 || g.y > h - 10) g.a = -g.a;
          g.x = Math.max(10, Math.min(w - 10, g.x)); g.y = Math.max(10, Math.min(h - 10, g.y));
          g.path.push([g.x, g.y]);
        }
        if (t % 9 === 0) for (let m = 0; m < agents.length; m++) for (let n = m + 1; n < agents.length; n++) {
          const A = agents[m], B = agents[n];
          if (A.i === B.i) continue;
          const d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d < 46) threads.append('line').attr('x1', A.x).attr('y1', A.y).attr('x2', B.x).attr('y2', B.y).attr('stroke', '#16181d').attr('stroke-opacity', 0.05 + 0.1 * (1 - d / 46)).attr('stroke-width', 0.5);
        }
      }
      for (const g of agents) trails.append('path').attr('d', d3.line().curve(d3.curveBasis)(g.path)).attr('fill', 'none').attr('stroke', PALETTE[g.i % PALETTE.length]).attr('stroke-opacity', 0.45).attr('stroke-width', 0.8);
      list.forEach((s, i) => svg.append('text').attr('class', 'eo-key').attr('x', 12).attr('y', 18 + i * 15).attr('fill', PALETTE[i % PALETTE.length]).text(`● ${paramById(s.param)?.short ?? s.param}${list.some((o) => o.site !== s.site) ? ` · ${s.site}` : ''}`));
      svg.append('text').attr('class', 'eo-key').attr('x', 12).attr('y', h - 10).text(`${FLOCK} walkers per parameter · turns follow each change · grey threads where different parameters pass close`);
      return svg.node();
    },
  },
];
export const vizById = (id) => VIZ.find((v) => v.id === id) ?? null;
