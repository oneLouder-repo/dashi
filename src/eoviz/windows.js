/**
 * The windows grid (EoViz ocean studio, stage 3): small views of the data,
 * laid out like a gallery of sketches. Each window is four choices, shown as
 * chips:
 *
 *   data    which set of collections: a cruise line, a mooring array, a float fleet
 *   query   which variable, which depths, which flags to keep
 *   time    all of it, one year, one season, or a run of years
 *   form    section, profile, T–S, time series, Hovmöller, scatter or map
 *
 * A researcher duplicates a window and varies one chip, links windows so a
 * time slice moves them together, arranges them, and switches on the ones
 * that go into the 3D studio.
 *
 *   window = { id, title?, set, var, y?, depth: [min, max], keep: 'good' | 'all', slice: { kind: 'all' | 'year' | 'season' | 'range', year?, season?, from?, to? },
 *              form, colour?: 'year' | 'depth' | <var>, studio: bool, link: bool, size: 1 | 2, order }
 *
 * Model functions here are pure; draw() needs D3.
 */
import { observations, oceanParam, OCEAN_PARAMS, kmBetween, sigma0, variablesOf } from './ocean.js';

export const FORMS = [
  { id: 'section', label: 'Section', about: 'Distance along the line against depth, coloured by the variable', kinds: ['cruise'] },
  { id: 'profile', label: 'Profile', about: 'The variable against depth, a line per cast or profile', kinds: ['cruise', 'track'] },
  { id: 'ts', label: 'T–S', about: 'Temperature against salinity, with density lines: water masses at a glance', kinds: ['cruise', 'track', 'mooring'] },
  { id: 'timeseries', label: 'Time series', about: 'The variable through time, a line per station or depth', kinds: ['mooring', 'track', 'cruise'] },
  { id: 'hovmoller', label: 'Hovmöller', about: 'Time against depth, coloured by the variable', kinds: ['track', 'cruise'] },
  { id: 'scatter', label: 'Scatter', about: 'One variable against another', kinds: ['cruise', 'track', 'mooring'] },
  { id: 'map', label: 'Map', about: 'Where the data is, coloured by the variable in the depth band', kinds: ['cruise', 'track', 'mooring'] },
];
export const formById = (id) => FORMS.find((f) => f.id === id) ?? FORMS[0];
export const SEASONS = [
  { id: 'winter', label: 'Winter', months: [12, 1, 2, 3] },
  { id: 'spring', label: 'Spring', months: [4, 5, 6] },
  { id: 'summer', label: 'Summer', months: [7, 8, 9] },
  { id: 'autumn', label: 'Autumn', months: [10, 11] },
];
export const DEPTH_BANDS = [
  { id: 'all', label: 'All depths', range: [0, 6000] },
  { id: 'upper', label: 'Upper 200 m', range: [0, 200] },
  { id: 'lsw', label: '1,000–2,000 m', range: [1000, 2000] },
  { id: 'deep', label: 'Below 2,000 m', range: [2000, 6000] },
];
export const bandOf = (depth) => DEPTH_BANDS.find((b) => b.range[0] === depth?.[0] && b.range[1] === depth?.[1]) ?? DEPTH_BANDS[0];

/* ---------------------------------------------------------------- sets of collections */

/** Collections grouped into sets: by line where they have one, else by kind and partner. → [{ key, label, kind, ids, org? }] */
export function setsOf(collections, orgName = null) {
  const sets = new Map();
  for (const c of Object.values(collections ?? {})) {
    const key = c.line ? `line:${c.line}` : `${c.kind}:${c.partnerId ?? ''}`;
    if (!sets.has(key)) sets.set(key, { key, label: c.line ?? (c.kind === 'track' ? 'Floats' : c.kind === 'mooring' ? 'Moorings' : 'Cruises'), kind: c.kind, ids: [], org: c.org ?? orgName });
    sets.get(key).ids.push(c.id);
  }
  return [...sets.values()].map((s) => ({ ...s, label: `${s.label} (${s.ids.length} ${s.kind === 'cruise' ? (s.ids.length === 1 ? 'cruise' : 'cruises') : s.kind === 'mooring' ? (s.ids.length === 1 ? 'mooring' : 'moorings') : (s.ids.length === 1 ? 'float' : 'floats')})` }));
}

/** The years a set spans. */
export function yearsOf(collections, ids) {
  const ys = new Set();
  for (const id of ids) for (const r of collections[id]?.rows ?? []) ys.add(Number(String(r[3]).slice(0, 4)));
  return [...ys].sort((a, b) => a - b);
}

/** The query a window asks of the data. */
export function queryOf(w, set) {
  const q = { ids: set?.ids ?? [], depth: w.depth ?? [0, 6000], keep: w.keep === 'all' ? ['2', '3', '4', '6', '0', '1'] : ['2', '6', '0'] };
  const s = w.slice ?? { kind: 'all' };
  if (s.kind === 'year' && s.year) { q.from = `${s.year}-01-01`; q.to = `${s.year}-12-31`; }
  if (s.kind === 'range') { if (s.from) q.from = `${s.from}-01-01`; if (s.to) q.to = `${s.to}-12-31`; }
  if (s.kind === 'season') q.months = SEASONS.find((x) => x.id === s.season)?.months ?? [];
  return q;
}

/** A window's title, from its chips, unless it has its own. */
export function titleOf(w, set) {
  if (w.title) return w.title;
  const p = oceanParam(w.var)?.label ?? w.var;
  const s = w.slice ?? { kind: 'all' };
  const when = s.kind === 'year' ? String(s.year) : s.kind === 'season' ? SEASONS.find((x) => x.id === s.season)?.label : s.kind === 'range' ? `${s.from}–${s.to}` : 'all years';
  const band = bandOf(w.depth);
  return `${formById(w.form).label}: ${w.form === 'ts' ? 'water masses' : p}, ${set?.label?.replace(/ \(.*$/, '') ?? 'data'}, ${when}${band.id !== 'all' ? `, ${band.label}` : ''}`;
}

/** The forms that fit a set's kind. */
export const formsFor = (kind) => FORMS.filter((f) => f.kinds.includes(kind));

let k = 0;
export const windowId = () => `win-${Date.now().toString(36)}${(k++).toString(36)}`;

/** A new window on a set, with sensible chips for its kind. */
export function blankWindow(set, more = {}) {
  const form = set?.kind === 'mooring' ? 'timeseries' : set?.kind === 'track' ? 'hovmoller' : 'section';
  return { id: windowId(), set: set?.key ?? '', var: 'oxy', y: null, depth: [0, 6000], keep: 'good', slice: { kind: 'all' }, form, colour: 'year', studio: false, link: false, size: 1, order: 0, ...more };
}

/** Duplicate a window and vary one chip: the next year, the next variable, or the next form. */
export function vary(w, chip, set, collections) {
  const copy = { ...structuredClone(w), id: windowId(), title: '', order: (w.order ?? 0) + 0.5, studio: false };
  if (chip === 'time') {
    const years = yearsOf(collections, set?.ids ?? []);
    const at = years.indexOf(w.slice?.year);
    copy.slice = { kind: 'year', year: years[(at + 1) % years.length] ?? years[0] };
  }
  if (chip === 'query') {
    const vars = variablesOf(Object.fromEntries((set?.ids ?? []).map((id) => [id, collections[id]]).filter(([, c]) => c)));
    copy.var = vars[(vars.indexOf(w.var) + 1) % vars.length] ?? w.var;
  }
  if (chip === 'form') {
    const forms = formsFor(set?.kind ?? 'cruise');
    copy.form = forms[(forms.findIndex((f) => f.id === w.form) + 1) % forms.length].id;
  }
  return copy;
}

/** Linked windows move together: give each linked window the same time slice. */
export function linkSlice(windows, fromId) {
  const from = windows[fromId];
  if (!from?.link) return windows;
  const out = { ...windows };
  for (const w of Object.values(windows)) if (w.link && w.id !== fromId) out[w.id] = { ...w, slice: structuredClone(from.slice) };
  return out;
}

/** Windows in their order. */
export const ordered = (windows) => Object.values(windows ?? {}).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Move a window one place left or right, renumbering. */
export function moveWindow(windows, id, by) {
  const list = ordered(windows);
  const i = list.findIndex((w) => w.id === id);
  const j = Math.max(0, Math.min(list.length - 1, i + by));
  if (i < 0 || i === j) return windows;
  const [w] = list.splice(i, 1);
  list.splice(j, 0, w);
  return Object.fromEntries(list.map((x, n) => [x.id, { ...x, order: n }]));
}

/**
 * Starter windows: a gallery to begin from, each a small question.
 * `sets` are setsOf(); a starter whose set is missing is skipped.
 */
export function starters(sets, collections) {
  const line = sets.find((s) => s.kind === 'cruise');
  const moor = sets.find((s) => s.kind === 'mooring');
  const fleet = sets.find((s) => s.kind === 'track');
  const years = line ? yearsOf(collections, line.ids) : [];
  const out = [];
  const add = (set, more, about) => set && out.push({ about, window: blankWindow(set, more) });
  add(line, { form: 'section', var: 'oxy', slice: { kind: 'year', year: years.includes(2015) ? 2015 : years[0] }, link: false, studio: true }, 'Oxygen along the line after a strong winter');
  add(line, { form: 'section', var: 'oxy', slice: { kind: 'year', year: years.includes(2022) ? 2022 : years.at(-1) } }, 'The same, after a weak winter');
  add(line, { form: 'ts', var: 'temp', colour: 'year' }, 'Water masses, every cruise, coloured by year');
  add(line, { form: 'scatter', var: 'dic', y: 'oxy', depth: [1000, 2000], colour: 'year' }, 'Carbon against oxygen in Labrador Sea Water');
  add(line, { form: 'timeseries', var: 'dic', depth: [1000, 2000] }, 'Carbon creeping up in Labrador Sea Water');
  add(line, { form: 'profile', var: 'ph', slice: { kind: 'range', from: 2018, to: years.at(-1) }, colour: 'year' }, 'pH profiles since 2018');
  add(moor, { form: 'timeseries', var: 'temp', depth: [0, 200], studio: true }, 'Davis Strait, west to east: cold outflow, warm inflow');
  add(moor, { form: 'ts', var: 'temp', colour: 'depth' }, 'Davis Strait water masses');
  add(fleet, { form: 'hovmoller', var: 'temp', studio: true }, 'Floats: the winter mixed layer deepening');
  add(fleet, { form: 'map', var: 'oxy', depth: [0, 200] }, 'Where the floats went');
  add(line, { form: 'map', var: 'oxy', depth: [1000, 2000], studio: true }, 'The line on the map');
  return out;
}

/* ---------------------------------------------------------------- colour */

const RAMPS = {
  thermal: 'interpolateInferno', haline: 'interpolateViridis', oxy: 'interpolateCividis', carbon: 'interpolateMagma',
  balance: 'interpolateRdBu', nutrient: 'interpolateYlGnBu', algae: 'interpolateYlGn', dense: 'interpolatePuBu',
};
/** A colour scale for a variable over the values in hand. */
export function colourFor(d3, varId, values) {
  const p = oceanParam(varId);
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  // A robust range (3rd to 97th percentile), so a summer surface spike doesn't wash out the deep ocean.
  const ext = finite.length > 20 ? [d3.quantileSorted(finite, 0.03), d3.quantileSorted(finite, 0.97)] : finite.length ? d3.extent(finite) : p?.range ?? [0, 1];
  if (ext[0] === ext[1]) { ext[0] -= 1; ext[1] += 1; }
  const interp = d3[RAMPS[p?.ramp] ?? 'interpolateViridis'];
  return d3.scaleSequential(p?.ramp === 'balance' ? (t) => interp(1 - t) : interp).domain(ext).clamp(true);
}
export const yearColour = (d3, years) => d3.scaleSequential(d3.interpolateTurbo).domain(d3.extent(years.length ? years : [2014, 2026]));

/* ---------------------------------------------------------------- drawing */

const W = 420; const H = 250; const M = { t: 10, r: 12, b: 28, l: 44 };
const fmtV = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

/**
 * Draw a window into an SVG. `collections` are all the collections in reach,
 * `set` the window's set. Returns { svg, n, legend }.
 */
export function draw(d3, w, set, collections, { width = W * (w.size === 2 ? 2 : 1), height = H } = {}) {
  const rows = observations(collections, queryOf(w, set));
  // Colours keep one scale across every time slice of a set, so two years side by side compare honestly.
  const q = queryOf(w, set);
  const whole = observations(collections, { ids: q.ids, depth: q.depth, keep: q.keep }).map((r) => r[w.var]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('class', 'eo-win-svg').attr('role', 'img');
  const iw = width - M.l - M.r; const ih = height - M.t - M.b;
  const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
  const v = w.var; const pv = oceanParam(v);
  const has = rows.filter((r) => Number.isFinite(r[v]));
  const axis = (sel, a) => sel.call(a).call((s) => s.selectAll('text').attr('font-size', 10)).call((s) => s.select('.domain').attr('stroke', '#9aa3ad'));
  const yearOf = (r) => Number(String(r.date).slice(0, 4));
  const years = [...new Set(rows.map(yearOf))].sort();
  const empty = (msg) => { g.append('text').attr('x', iw / 2).attr('y', ih / 2).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#6b7280').text(msg); return { svg: svg.node(), n: 0, legend: null }; };
  if (!rows.length) return empty('Nothing here for these chips');
  const label = (txt, x, y, rot = 0) => g.append('text').attr('x', x).attr('y', y).attr('font-size', 10).attr('fill', '#4b5563').attr('text-anchor', 'middle').attr('transform', rot ? `rotate(${rot},${x},${y})` : null).text(txt);
  const depthAxis = (y) => { axis(g.append('g'), d3.axisLeft(y).ticks(5).tickFormat((d) => `${d}`)); label('depth (m)', -34, ih / 2, -90); };
  let legend = null;

  switch (w.form) {
    case 'section': {
      if (!has.length) return empty(`No ${pv?.label ?? v} here`);
      // Distance along the line, from its first station (by latitude order).
      const stations = [...new Map(has.map((r) => [r.station, [r.lat, r.lon]])).entries()].sort((a, b) => a[1][0] - b[1][0]);
      const dist = new Map(); let acc = 0;
      stations.forEach(([s, p], i) => { if (i) acc += kmBetween(stations[i - 1][1], p); dist.set(s, acc); });
      const x = d3.scaleLinear().domain([0, acc || 1]).range([0, iw]);
      const y = d3.scaleLinear().domain([0, d3.max(has, (r) => r.depth)]).range([0, ih]).nice();
      const c = colourFor(d3, v, whole);
      // Cells: each bottle paints the space to its neighbours, then dots on top.
      const byStation = d3.group(has, (r) => r.station);
      const sw = iw / Math.max(1, stations.length);
      for (const [s, list] of byStation) {
        const sorted = list.sort((a, b) => a.depth - b.depth);
        sorted.forEach((r, i) => {
          const top = i ? (sorted[i - 1].depth + r.depth) / 2 : 0;
          const bot = i < sorted.length - 1 ? (r.depth + sorted[i + 1].depth) / 2 : r.depth + 50;
          g.append('rect').attr('x', x(dist.get(s)) - sw / 2).attr('width', sw + 0.5).attr('y', y(top)).attr('height', Math.max(1, y(bot) - y(top))).attr('fill', c(r[v])).attr('opacity', 0.85);
        });
      }
      g.selectAll('circle').data(has).join('circle').attr('cx', (r) => x(dist.get(r.station))).attr('cy', (r) => y(r.depth)).attr('r', 1.4).attr('fill', '#111').attr('opacity', 0.35);
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(5));
      label('distance along the line (km)', iw / 2, ih + 24);
      depthAxis(y);
      legend = { scale: c, var: v };
      break;
    }
    case 'profile': {
      if (!has.length) return empty(`No ${pv?.label ?? v} here`);
      const x = d3.scaleLinear().domain(d3.extent(has, (r) => r[v])).range([0, iw]).nice();
      const y = d3.scaleLinear().domain([0, d3.max(has, (r) => r.depth)]).range([0, ih]).nice();
      const yc = yearColour(d3, years);
      const casts = d3.group(has, (r) => `${r.collection}|${r.station}`);
      const line = d3.line().x((r) => x(r[v])).y((r) => y(r.depth));
      for (const list of casts.values()) g.append('path').attr('d', line(list.sort((a, b) => a.depth - b.depth))).attr('fill', 'none').attr('stroke', yc(yearOf(list[0]))).attr('stroke-width', 0.9).attr('opacity', 0.55);
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(5));
      label(`${pv?.label ?? v}${pv?.unit ? ` (${pv.unit})` : ''}`, iw / 2, ih + 24);
      depthAxis(y);
      legend = { years, scale: yc };
      break;
    }
    case 'ts': {
      const pts = rows.filter((r) => Number.isFinite(r.temp) && Number.isFinite(r.sal));
      if (!pts.length) return empty('No temperature and salinity here');
      const x = d3.scaleLinear().domain(d3.extent(pts, (r) => r.sal)).range([0, iw]).nice();
      const y = d3.scaleLinear().domain(d3.extent(pts, (r) => r.temp)).range([ih, 0]).nice();
      // Density lines (σθ) under the points.
      const [s0, s1] = x.domain(); const [t0, t1] = y.domain(); const n = 40;
      const grid = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) grid.push(sigma0(s0 + ((s1 - s0) * i) / (n - 1), t1 - ((t1 - t0) * j) / (n - 1)));
      const levels = d3.ticks(d3.min(grid), d3.max(grid), 6);
      const contours = d3.contours().size([n, n]).thresholds(levels)(grid);
      const sx = d3.scaleLinear().domain([0, n - 1]).range([0, iw]); const sy = d3.scaleLinear().domain([0, n - 1]).range([0, ih]);
      g.append('g').selectAll('path').data(contours).join('path').attr('d', d3.geoPath(d3.geoTransform({ point(px, py) { this.stream.point(sx(px), sy(py)); } }))).attr('fill', 'none').attr('stroke', '#c7ccd3').attr('stroke-width', 0.7);
      const byDepth = w.colour === 'depth';
      const c = byDepth ? d3.scaleSequential(d3.interpolateYlGnBu).domain([0, d3.max(pts, (r) => r.depth)]) : yearColour(d3, years);
      g.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (r) => x(r.sal)).attr('cy', (r) => y(r.temp)).attr('r', 1.6).attr('fill', (r) => c(byDepth ? r.depth : yearOf(r))).attr('opacity', 0.7);
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(5));
      axis(g.append('g'), d3.axisLeft(y).ticks(5));
      label('salinity', iw / 2, ih + 24); label('temperature (°C)', -34, ih / 2, -90);
      legend = byDepth ? { scale: c, var: 'depth' } : { years, scale: c };
      break;
    }
    case 'timeseries': {
      if (!has.length) return empty(`No ${pv?.label ?? v} here`);
      const parse = (s) => new Date(`${s}T12:00:00Z`);
      // A cruise line gives one point a year: the mean in the band. Moorings and floats give a line per station and depth.
      const cruise = set?.kind === 'cruise';
      const groups = cruise ? d3.rollups(has, (l) => ({ date: `${yearOf(l[0])}-05-15`, v: d3.mean(l, (r) => r[v]), n: l.length }), (r) => yearOf(r)).map(([, o]) => o) : null;
      const x = d3.scaleUtc().domain(d3.extent(has, (r) => parse(r.date))).range([0, iw]);
      const y = d3.scaleLinear().domain(cruise ? d3.extent(groups, (o) => o.v) : d3.extent(has, (r) => r[v])).range([ih, 0]).nice();
      if (cruise) {
        const pts = groups.sort((a, b) => a.date.localeCompare(b.date));
        g.append('path').attr('d', d3.line().x((o) => x(parse(o.date))).y((o) => y(o.v))(pts)).attr('fill', 'none').attr('stroke', '#1f5f8b').attr('stroke-width', 1.6);
        g.selectAll('circle').data(pts).join('circle').attr('cx', (o) => x(parse(o.date))).attr('cy', (o) => y(o.v)).attr('r', 3).attr('fill', '#1f5f8b');
        const reg = pts.length > 2 ? fitLine(pts.map((o) => [yearOf(o), o.v])) : null;
        if (reg) legend = { note: `${reg.slope >= 0 ? '+' : ''}${fmtV(reg.slope)} ${pv?.unit ?? ''} a year` };
      } else {
        const lines = d3.group(has, (r) => `${r.station} · ${r.depth} m`);
        const names = [...lines.keys()];
        const c = d3.scaleOrdinal(names, d3.quantize(d3.interpolateViridis, Math.max(2, names.length)));
        const line = d3.line().x((r) => x(parse(r.date))).y((r) => y(r[v]));
        for (const [name, list] of lines) g.append('path').attr('d', line(list.sort((a, b) => a.date.localeCompare(b.date)))).attr('fill', 'none').attr('stroke', c(name)).attr('stroke-width', 0.9).attr('opacity', 0.8);
        legend = { names, scale: c };
      }
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(5));
      axis(g.append('g'), d3.axisLeft(y).ticks(5));
      label(`${pv?.short ?? v}${pv?.unit ? ` (${pv.unit})` : ''}`, -34, ih / 2, -90);
      break;
    }
    case 'hovmoller': {
      if (!has.length) return empty(`No ${pv?.label ?? v} here`);
      const parse = (s) => new Date(`${s}T12:00:00Z`);
      const x = d3.scaleUtc().domain(d3.extent(has, (r) => parse(r.date))).range([0, iw]);
      const y = d3.scaleLinear().domain([0, d3.max(has, (r) => r.depth)]).range([0, ih]).nice();
      const c = colourFor(d3, v, whole);
      const dates = [...new Set(has.map((r) => r.date))].sort();
      const cw = Math.max(1.5, iw / Math.max(1, dates.length) * 1.05);
      for (const [, list] of d3.group(has, (r) => `${r.collection}|${r.station}`)) {
        const sorted = list.sort((a, b) => a.depth - b.depth);
        sorted.forEach((r, i) => {
          const top = i ? (sorted[i - 1].depth + r.depth) / 2 : 0;
          const bot = i < sorted.length - 1 ? (r.depth + sorted[i + 1].depth) / 2 : r.depth + 60;
          g.append('rect').attr('x', x(parse(r.date)) - cw / 2).attr('width', cw).attr('y', y(top)).attr('height', Math.max(1, y(bot) - y(top))).attr('fill', c(r[v])).attr('opacity', 0.8);
        });
      }
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(5));
      depthAxis(y);
      legend = { scale: c, var: v };
      break;
    }
    case 'scatter': {
      const yv = w.y && w.y !== v ? w.y : (v === 'oxy' ? 'dic' : 'oxy');
      const pts = rows.filter((r) => Number.isFinite(r[v]) && Number.isFinite(r[yv]));
      if (!pts.length) return empty('Nothing to pair here');
      const x = d3.scaleLinear().domain(d3.extent(pts, (r) => r[v])).range([0, iw]).nice();
      const y = d3.scaleLinear().domain(d3.extent(pts, (r) => r[yv])).range([ih, 0]).nice();
      const c = yearColour(d3, years);
      g.selectAll('circle').data(pts).join('circle').attr('cx', (r) => x(r[v])).attr('cy', (r) => y(r[yv])).attr('r', 2).attr('fill', (r) => c(yearOf(r))).attr('opacity', 0.75);
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(5));
      axis(g.append('g'), d3.axisLeft(y).ticks(5));
      label(`${pv?.short ?? v}${pv?.unit ? ` (${pv.unit})` : ''}`, iw / 2, ih + 24);
      const py = oceanParam(yv); label(`${py?.short ?? yv}`, -34, ih / 2, -90);
      legend = { years, scale: c };
      break;
    }
    case 'map':
    default: {
      if (!has.length) return empty(`No ${pv?.label ?? v} here`);
      const places = d3.rollups(has, (l) => ({ lat: l[0].lat, lon: l[0].lon, v: d3.mean(l, (r) => r[v]) }), (r) => `${r.lat},${r.lon}`).map(([, o]) => o);
      const lat0 = d3.mean(places, (p) => p.lat);
      const kx = Math.cos((lat0 * Math.PI) / 180);
      const xs = d3.extent(places, (p) => p.lon * kx); const ys = d3.extent(places, (p) => p.lat);
      const span = Math.max(xs[1] - xs[0], (ys[1] - ys[0]) * (iw / ih), 1);
      const cx = (xs[0] + xs[1]) / 2; const cy = (ys[0] + ys[1]) / 2;
      const x = d3.scaleLinear().domain([cx - span / 2 - 0.5, cx + span / 2 + 0.5]).range([0, iw]);
      const y = d3.scaleLinear().domain([cy - (span * ih) / iw / 2 - 0.5, cy + (span * ih) / iw / 2 + 0.5]).range([ih, 0]);
      const c = colourFor(d3, v, places.map((p) => p.v));
      // A graticule, so it reads as a map without a coastline.
      for (const lon of d3.range(Math.floor(x.invert(0) / kx), Math.ceil(x.invert(iw) / kx) + 1)) if (lon % 2 === 0) g.append('line').attr('x1', x(lon * kx)).attr('x2', x(lon * kx)).attr('y1', 0).attr('y2', ih).attr('stroke', '#eef1f4');
      for (const lat of d3.range(Math.floor(y.invert(ih)), Math.ceil(y.invert(0)) + 1)) g.append('line').attr('y1', y(lat)).attr('y2', y(lat)).attr('x1', 0).attr('x2', iw).attr('stroke', '#eef1f4');
      g.selectAll('circle').data(places).join('circle').attr('cx', (p) => x(p.lon * kx)).attr('cy', (p) => y(p.lat)).attr('r', 4).attr('fill', (p) => c(p.v)).attr('stroke', '#16181d').attr('stroke-width', 0.5);
      axis(g.append('g').attr('transform', `translate(0,${ih})`), d3.axisBottom(x).ticks(4).tickFormat((d) => `${Math.round(d / kx)}°`));
      axis(g.append('g'), d3.axisLeft(y).ticks(4).tickFormat((d) => `${d}°`));
      legend = { scale: c, var: v };
    }
  }
  return { svg: svg.node(), n: rows.length, legend };
}

/** Least squares: y = a + slope·x. */
export function fitLine(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n; const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  if (!sxx) return null;
  const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

/** The variables a window can choose, for its set. */
export const varsFor = (set, collections) => variablesOf(Object.fromEntries((set?.ids ?? []).map((id) => [id, collections[id]]).filter(([, c]) => c)));
export { OCEAN_PARAMS };
