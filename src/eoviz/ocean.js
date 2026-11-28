/**
 * EoViz ocean data (alpha 0.5, stage 1 of the ocean studio): observations in
 * four dimensions (where, when, how deep, what), the way ocean scientists
 * keep them. Pure functions: the page, the seeds and the tests share them.
 *
 * A collection is one cruise, one float's track or one mooring, kept in the
 * "eco" document beside the river and air series:
 *
 *   eco.collections[id] = {
 *     id, name, kind: 'cruise' | 'track' | 'mooring', partnerId, platform, region, line?,
 *     start, end, cite: { text, license, url },
 *     cols: ['temp', 'sal', 'oxy', …],          the variables, in OCEAN_PARAMS ids
 *     rows: [[station, lat, lon, date, depth, v1, v2, …]],   one row per bottle, profile level or reading
 *     flags: ['2229…', …],                       one WOCE flag digit per variable, per row
 *     meta: { format, file, … },
 *   }
 *
 * Flags follow WOCE: 2 good, 3 questionable, 4 bad, 6 mean of replicates,
 * 0 calculated or interpolated, 9 not sampled. A value is never changed:
 * a flag says what to think of it, and a window chooses which flags to keep.
 */
import { parseCsv as csvRows } from '../place/model.js';
import { rng } from './formats.js';

export const OCEAN_PARAMS = [
  { id: 'temp', label: 'Temperature', short: 'T', unit: '°C', range: [-2, 12], ramp: 'thermal' },
  { id: 'sal', label: 'Salinity', short: 'S', unit: 'PSS-78', range: [32, 35.2], ramp: 'haline' },
  { id: 'oxy', label: 'Oxygen', short: 'O₂', unit: 'µmol/kg', range: [240, 360], ramp: 'oxy' },
  { id: 'dic', label: 'Dissolved inorganic carbon', short: 'DIC', unit: 'µmol/kg', range: [2050, 2200], ramp: 'carbon' },
  { id: 'talk', label: 'Total alkalinity', short: 'TA', unit: 'µmol/kg', range: [2220, 2320], ramp: 'carbon' },
  { id: 'ph', label: 'pH (total scale)', short: 'pH', unit: '', range: [7.9, 8.15], ramp: 'balance' },
  { id: 'no3', label: 'Nitrate', short: 'NO₃', unit: 'µmol/kg', range: [0, 20], ramp: 'nutrient' },
  { id: 'sio4', label: 'Silicate', short: 'Si', unit: 'µmol/kg', range: [0, 14], ramp: 'nutrient' },
  { id: 'po4', label: 'Phosphate', short: 'PO₄', unit: 'µmol/kg', range: [0, 1.4], ramp: 'nutrient' },
  { id: 'chla', label: 'Chlorophyll a', short: 'Chl', unit: 'mg/m³', range: [0, 4], ramp: 'algae' },
  // Worked out from the others, never stored.
  { id: 'sigma0', label: 'Density anomaly σθ', short: 'σθ', unit: 'kg/m³', range: [25.5, 27.95], ramp: 'dense', derived: true },
  { id: 'aou', label: 'Apparent oxygen utilisation', short: 'AOU', unit: 'µmol/kg', range: [-30, 80], ramp: 'balance', derived: true },
];
export const oceanParam = (id) => OCEAN_PARAMS.find((p) => p.id === id) ?? null;
export const COLLECTION_KINDS = [
  { id: 'cruise', label: 'Cruise', about: 'Bottles and CTD casts along a line, once or twice a year: rich, sparse in time' },
  { id: 'track', label: 'Float or glider', about: 'Profiles along a drifting track every few days: frequent, roaming' },
  { id: 'mooring', label: 'Mooring', about: 'Sensors fixed in place, reading every hour: frequent, in one spot' },
];
export const WOCE = { 2: 'Good', 3: 'Questionable', 4: 'Bad', 6: 'Mean of replicates', 0: 'Calculated', 9: 'Not sampled', 1: 'Not reported' };
export const KEEP_GOOD = ['2', '6', '0'];

/* ---------------------------------------------------------------- reading a collection */

/** One row as an object: { station, lat, lon, date, depth, temp, …, flags: { temp: '2', … } } with derived values added. */
export function rowObject(c, i, keep = null) {
  const r = c.rows[i];
  const o = { station: r[0], lat: r[1], lon: r[2], date: r[3], depth: r[4], flags: {} };
  c.cols.forEach((k, j) => { o.flags[k] = c.flags?.[i]?.[j] ?? '2'; o[k] = keep && !keep.has(o.flags[k]) ? null : r[5 + j]; });
  // Derived from what was kept: a bad oxygen gives no AOU.
  if (Number.isFinite(o.temp) && Number.isFinite(o.sal)) { o.sigma0 = sigma0(o.sal, o.temp); o.flags.sigma0 = '0'; }
  if (Number.isFinite(o.oxy) && Number.isFinite(o.temp) && Number.isFinite(o.sal)) { o.aou = oxygenSat(o.temp, o.sal) - o.oxy; o.flags.aou = '0'; }
  return o;
}

/**
 * Observations matching a query: the rows of some collections, inside a box,
 * a time slice and a depth range, keeping only the flags asked for.
 *   query = { ids?, kinds?, box?: [s, w, n, e], from?, to?, months?: [1..12], depth?: [min, max], keep?: ['2', '6', '0'], vars? }
 * → [{ collection, station, lat, lon, date, depth, temp, … }]
 */
export function observations(collections, query = {}) {
  const keep = new Set(query.keep ?? KEEP_GOOD);
  const out = [];
  for (const c of Object.values(collections ?? {})) {
    if (query.ids?.length && !query.ids.includes(c.id)) continue;
    if (query.kinds?.length && !query.kinds.includes(c.kind)) continue;
    for (let i = 0; i < c.rows.length; i++) {
      const r = c.rows[i];
      if (query.box) { const [s, w, n, e] = query.box; if (r[1] < s || r[1] > n || r[2] < w || r[2] > e) continue; }
      if (query.from && r[3] < query.from) continue;
      if (query.to && r[3] > query.to) continue;
      if (query.months?.length && !query.months.includes(Number(String(r[3]).slice(5, 7)))) continue;
      if (query.depth && (r[4] < query.depth[0] || r[4] > query.depth[1])) continue;
      const o = rowObject(c, i, keep);
      o.collection = c.id;
      out.push(o);
    }
  }
  return out;
}

/** The variables a set of collections has, derived ones included where they can be worked out. */
export function variablesOf(collections) {
  const have = new Set(Object.values(collections ?? {}).flatMap((c) => c.cols));
  if (have.has('temp') && have.has('sal')) have.add('sigma0');
  if (have.has('oxy') && have.has('temp') && have.has('sal')) have.add('aou');
  return OCEAN_PARAMS.filter((p) => have.has(p.id)).map((p) => p.id);
}

/** Years, months and depths a set of collections spans. */
export function spanOf(collections) {
  let from = null; let to = null; let deep = 0;
  for (const c of Object.values(collections ?? {})) for (const r of c.rows) {
    if (!from || r[3] < from) from = r[3];
    if (!to || r[3] > to) to = r[3];
    if (r[4] > deep) deep = r[4];
  }
  return { from, to, deep };
}

/** Distance along a line in km (haversine), from the first station. */
export function kmBetween(a, b) {
  const R = 6371; const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad; const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------------------------------------------------------------- derived values */

/**
 * σθ, approximately: EOS-80 density at the surface (UNESCO 1981), from
 * salinity and temperature, minus 1000. With in-situ temperature it is close
 * enough to draw and compare water masses; for a paper, use TEOS-10 (GSW).
 */
export function sigma0(S, T) {
  const rw = 999.842594 + 6.793952e-2 * T - 9.09529e-3 * T ** 2 + 1.001685e-4 * T ** 3 - 1.120083e-6 * T ** 4 + 6.536332e-9 * T ** 5;
  const A = 8.24493e-1 - 4.0899e-3 * T + 7.6438e-5 * T ** 2 - 8.2467e-7 * T ** 3 + 5.3875e-9 * T ** 4;
  const B = -5.72466e-3 + 1.0227e-4 * T - 1.6546e-6 * T ** 2;
  const C = 4.8314e-4;
  return rw + A * S + B * S ** 1.5 + C * S ** 2 - 1000;
}

/** Oxygen at saturation in µmol/kg (Garcia and Gordon 1992, Benson and Krause fit), from temperature (°C) and salinity. */
export function oxygenSat(T, S) {
  const Ts = Math.log((298.15 - T) / (273.15 + T));
  const [A0, A1, A2, A3, A4, A5] = [5.80871, 3.20291, 4.17887, 5.1006, -9.86643e-2, 3.80369];
  const [B0, B1, B2, B3] = [-7.01577e-3, -7.70028e-3, -1.13864e-2, -9.51519e-3];
  const C0 = -2.75915e-7;
  return Math.exp(A0 + A1 * Ts + A2 * Ts ** 2 + A3 * Ts ** 3 + A4 * Ts ** 4 + A5 * Ts ** 5 + S * (B0 + B1 * Ts + B2 * Ts ** 2 + B3 * Ts ** 3) + C0 * S ** 2);
}

/* ---------------------------------------------------------------- readers */

/** A CSV as { header, rows }. */
const parseCsv = (text) => { const [header = [], ...rows] = csvRows(text); return { header, rows }; };
const num = (v, missing = [-999, -9999, -99, -9]) => { const n = Number(v); return Number.isFinite(n) && !missing.includes(n) && String(v).trim() !== '' ? n : null; };
const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Build a collection from rows of objects: { station, lat, lon, date, depth, <var>, <var>_flag }. */
function collect(list, cols, base) {
  const used = cols.filter((k) => list.some((o) => o[k] != null));
  const rows = []; const flags = [];
  for (const o of list) {
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon) || !o.date || !Number.isFinite(o.depth)) continue;
    rows.push([o.station ?? '', o.lat, o.lon, o.date, o.depth, ...used.map((k) => o[k])]);
    flags.push(used.map((k) => (o[k] == null ? '9' : String(o[`${k}_flag`] ?? '2'))).join(''));
  }
  const dates = rows.map((r) => r[3]).sort();
  return { kind: 'cruise', platform: '', region: '', cite: { text: '', license: '', url: '' }, meta: {}, ...base, cols: used, rows, flags, start: dates[0] ?? null, end: dates.at(-1) ?? null };
}

/** GLODAP's merged product as CSV (G2… columns; -9999 missing; flags 0, 2 or 9). One collection per cruise (expocode). */
const GLODAP_VARS = { temp: 'G2temperature', sal: 'G2salinity', oxy: 'G2oxygen', dic: 'G2tco2', talk: 'G2talk', ph: 'G2phtsinsitutp', no3: 'G2nitrate', sio4: 'G2silicate', po4: 'G2phosphate' };
export function readGlodap(text, name = 'glodap.csv') {
  const { header, rows } = parseCsv(text);
  const col = (h) => header.findIndex((x) => x.trim().toLowerCase() === h.toLowerCase());
  const at = Object.fromEntries(['G2expocode', 'G2cruise', 'G2station', 'G2year', 'G2month', 'G2day', 'G2latitude', 'G2longitude', 'G2depth', 'G2pressure'].map((h) => [h, col(h)]));
  const cruises = new Map();
  for (const r of rows) {
    const key = r[at.G2expocode] ?? r[at.G2cruise] ?? 'cruise';
    const o = { station: String(num(r[at.G2station]) ?? r[at.G2station] ?? ''), lat: num(r[at.G2latitude]), lon: num(r[at.G2longitude]), date: iso(num(r[at.G2year]), num(r[at.G2month]) ?? 1, num(r[at.G2day]) ?? 1), depth: num(r[at.G2depth]) ?? num(r[at.G2pressure]) };
    for (const [k, h] of Object.entries(GLODAP_VARS)) {
      const i = col(h); if (i < 0) continue;
      o[k] = num(r[i]);
      const f = col(`${h}f`); if (f >= 0 && r[f] != null && r[f] !== '') o[`${k}_flag`] = String(num(r[f], []) ?? 2);
      // Temperature and pressure have no flags in GLODAP: CTD values, taken as good.
    }
    if (!cruises.has(key)) cruises.set(key, []);
    cruises.get(key).push(o);
  }
  return [...cruises].map(([expo, list]) => collect(list, Object.keys(GLODAP_VARS), {
    name: `Cruise ${expo}`, kind: 'cruise', meta: { format: 'glodap', file: name, expocode: expo },
    cite: { text: 'Lauvset, S. K., et al. GLODAPv2 (data product). Cite the version you downloaded.', license: 'CC BY 4.0', url: 'https://www.glodap.info' },
  }));
}

/** WOCE / CCHDO bottle exchange: a BOTTLE line, # comments, names, units, rows, END_DATA. */
const EXCHANGE_VARS = { temp: 'CTDTMP', sal: 'SALNTY', oxy: 'OXYGEN', dic: 'TCARBN', talk: 'ALKALI', ph: 'PH_TOT', no3: 'NITRAT', sio4: 'SILCAT', po4: 'PHSPHT' };
export function readExchange(text, name = 'bottle_hy1.csv') {
  const lines = String(text).split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() && !l.startsWith('#') && !/^BOTTLE/i.test(l));
  const names = lines[first].split(',').map((s) => s.trim().toUpperCase());
  const body = lines.slice(first + 2).filter((l) => l.trim() && !/^END_DATA/i.test(l));
  const col = (n) => names.indexOf(n);
  const list = body.map((l) => {
    const r = l.split(',').map((s) => s.trim());
    const d = r[col('DATE')] ?? '';
    const o = { station: r[col('STNNBR')] ?? '', lat: num(r[col('LATITUDE')]), lon: num(r[col('LONGITUDE')]), date: d.length === 8 ? iso(d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)) : null, depth: num(r[col('CTDPRS')]) ?? num(r[col('DEPTH')]) };
    for (const [k, h] of Object.entries(EXCHANGE_VARS)) {
      const i = col(h); if (i < 0) continue;
      o[k] = num(r[i]);
      const f = col(`${h}_FLAG_W`); if (f >= 0) o[`${k}_flag`] = r[f];
      if (o[`${k}_flag`] === '9' || o[`${k}_flag`] === '5' || o[`${k}_flag`] === '1') o[k] = o[k] ?? null;
    }
    // Salinity falls back to the CTD's when the bottle wasn't run.
    if (o.sal == null && col('CTDSAL') >= 0) { o.sal = num(r[col('CTDSAL')]); o.sal_flag = r[col('CTDSAL_FLAG_W')] ?? '2'; }
    return o;
  });
  const expo = lines.slice(0, first).join('\n').match(/EXPOCODE\s*[=:]\s*(\S+)/i)?.[1] ?? body[0]?.split(',')[col('EXPOCODE')] ?? name.replace(/\..*$/, '');
  return [collect(list, Object.keys(EXCHANGE_VARS), { name: `Cruise ${expo}`, kind: 'cruise', meta: { format: 'exchange', file: name, expocode: expo } })];
}

/** Profiling float CSV (Argo style): PLATFORM_NUMBER, CYCLE_NUMBER, DATE, LATITUDE, LONGITUDE, PRES, TEMP, PSAL, DOXY, each with _QC (Argo QC 1–9). */
const ARGO_VARS = { temp: 'TEMP', sal: 'PSAL', oxy: 'DOXY', no3: 'NITRATE', ph: 'PH_IN_SITU_TOTAL', chla: 'CHLA' };
const ARGO_TO_WOCE = { 1: '2', 2: '2', 3: '3', 4: '4', 5: '2', 8: '0', 9: '9', 0: '1' };
export function readFloat(text, name = 'float.csv') {
  const { header, rows } = parseCsv(text);
  const H = header.map((h) => h.trim().toUpperCase());
  const col = (h) => H.indexOf(h);
  const floats = new Map();
  for (const r of rows) {
    const id = r[col('PLATFORM_NUMBER')] ?? 'float';
    const o = { station: `${id}-${r[col('CYCLE_NUMBER')] ?? ''}`, lat: num(r[col('LATITUDE')]), lon: num(r[col('LONGITUDE')]), date: String(r[col('DATE')] ?? r[col('JULD')] ?? '').slice(0, 10), depth: num(r[col('PRES')]) };
    for (const [k, h] of Object.entries(ARGO_VARS)) {
      const i = col(h); if (i < 0) continue;
      o[k] = num(r[i], [99999, -999]);
      const f = col(`${h}_QC`); if (f >= 0) o[`${k}_flag`] = ARGO_TO_WOCE[r[f]] ?? '2';
    }
    if (!floats.has(id)) floats.set(id, []);
    floats.get(id).push(o);
  }
  return [...floats].map(([id, list]) => collect(list, Object.keys(ARGO_VARS), { name: `Float ${id}`, kind: 'track', platform: 'Profiling float', meta: { format: 'float', file: name, wmo: id } }));
}

/** A mooring's CSV: "# mooring: DS-C1", "# lat: 66.75", "# lon: -58.8", then time, depth, temp, sal, oxy (and _flag columns). */
export function readMooring(text, name = 'mooring.csv') {
  const head = Object.fromEntries([...String(text).matchAll(/^#\s*([\w ]+):\s*(.+)$/gm)].map((m) => [m[1].trim().toLowerCase(), m[2].trim()]));
  const { header, rows } = parseCsv(String(text).split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n'));
  const H = header.map((h) => h.trim().toLowerCase());
  const col = (...hs) => H.findIndex((h) => hs.includes(h));
  const lat = Number(head.lat); const lon = Number(head.lon);
  const vars = { temp: ['temp', 'temperature'], sal: ['sal', 'salinity', 'psal'], oxy: ['oxy', 'oxygen', 'doxy'], ph: ['ph'], chla: ['chla', 'chl'] };
  const list = rows.map((r) => {
    const o = { station: head.mooring ?? name, lat, lon, date: String(r[col('time', 'date', 'datetime')] ?? '').slice(0, 10), depth: num(r[col('depth', 'pres', 'pressure')]) };
    for (const [k, hs] of Object.entries(vars)) { const i = col(...hs); if (i >= 0) { o[k] = num(r[i]); const f = col(...hs.map((h) => `${h}_flag`)); if (f >= 0) o[`${k}_flag`] = r[f]; } }
    return o;
  });
  return [collect(list, Object.keys(vars), { name: `Mooring ${head.mooring ?? name}`, kind: 'mooring', platform: head.platform ?? 'Mooring', region: head.region ?? '', meta: { format: 'mooring', file: name } })];
}

export const OCEAN_FORMATS = [
  { id: 'glodap', label: 'GLODAP merged product (CSV)', spec: 'GLODAPv2 column names (G2…), -9999 missing, flags 0/2/9', read: readGlodap, test: (t) => /G2expocode|G2tco2|G2latitude/i.test(t.slice(0, 2000)) },
  { id: 'exchange', label: 'WOCE / CCHDO bottle exchange', spec: 'BOTTLE header, # comments, names and units lines, _FLAG_W columns, END_DATA', read: readExchange, test: (t) => /^BOTTLE/i.test(t) || /_FLAG_W/.test(t.slice(0, 4000)) },
  { id: 'float', label: 'Profiling float (Argo-style CSV)', spec: 'PLATFORM_NUMBER, CYCLE_NUMBER, PRES, TEMP, PSAL, DOXY with _QC columns', read: readFloat, test: (t) => /PLATFORM_NUMBER/i.test(t.slice(0, 2000)) },
  { id: 'mooring', label: 'Mooring time series (CSV)', spec: '# mooring/lat/lon header lines, then time, depth and variables', read: readMooring, test: (t) => /^#\s*mooring:/im.test(t.slice(0, 1000)) },
];
/** Which ocean format a file is, or null. */
export const detectOcean = (text) => OCEAN_FORMATS.find((f) => f.test(String(text))) ?? null;

/* ---------------------------------------------------------------- mock data (made up, shaped like the real thing) */

const r2 = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
/** Winter convection, strong (1) to weak (0), by year: made up, to give the record a story. */
export const CONVECTION = { 2014: 0.9, 2015: 1, 2016: 0.85, 2017: 0.7, 2018: 0.8, 2019: 0.5, 2020: 0.75, 2021: 0.3, 2022: 0.35, 2023: 0.8, 2024: 0.9, 2025: 0.55, 2026: 0.65 };
const DEPTHS = [5, 25, 50, 100, 200, 300, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3400];

/** One water column in the Labrador Sea: values at a depth, at a station x (0 shelf … 1 Greenland), in a year. */
function column(depth, x, year, conv, r) {
  const shelf = Math.max(0, 1 - x * 6); // the Labrador shelf: cold, fresh
  const irminger = Math.exp(-(((x - 0.85) / 0.18) ** 2)) * Math.exp(-(((depth - 400) / 350) ** 2)); // warm, salty, on the Greenland side
  const lswTop = 300; const lswBottom = 900 + 1300 * conv; // how deep convection mixed this winter
  const lsw = depth > lswTop && depth < lswBottom ? 1 : Math.exp(-(((depth - (depth < lswTop ? lswTop : lswBottom)) / 300) ** 2));
  const dsow = Math.max(0, (depth - 2900) / 500); // dense overflow water on the bottom
  const t = depth < 50 ? 3.2 - 2.8 * shelf + r() * 0.6 : 3.5 + 1.3 * irminger - 0.35 * lsw * conv - 1.6 * dsow - 2.5 * shelf * Math.exp(-depth / 120) + (r() - 0.5) * 0.08;
  const s = depth < 50 ? 34.4 - 1.2 * shelf + (r() - 0.5) * 0.05 : 34.86 + 0.12 * irminger - 0.03 * lsw + 0.04 * Math.min(1, depth / 2500) - 0.95 * shelf * Math.exp(-depth / 150) + (r() - 0.5) * 0.01;
  const years = year - 2014;
  const oxy = 322 - 40 * Math.min(1, depth / 600) + 16 * lsw * conv - 10 * irminger + 6 * dsow + (r() - 0.5) * 3;
  const dic = 2138 + 24 * Math.min(1, depth / 800) + 1.05 * years * (depth < 2200 ? 1 : 0.4) * (0.6 + 0.4 * lsw) - 5 * dsow + (r() - 0.5) * 2;
  const talk = 2296 - 40 * shelf * Math.exp(-depth / 200) + 6 * Math.min(1, depth / 1000) + (r() - 0.5) * 2;
  const ph = 8.07 - 0.06 * Math.min(1, depth / 800) - 0.0018 * years * (depth < 2200 ? 1 : 0.4) + (r() - 0.5) * 0.004;
  const no3 = 4 + 12 * Math.min(1, depth / 700) + 1.5 * irminger + (r() - 0.5) * 0.4;
  const sio4 = 3 + 7 * Math.min(1, depth / 1200) + 3 * dsow + (r() - 0.5) * 0.3;
  const po4 = 0.45 + 0.65 * Math.min(1, depth / 700) + (r() - 0.5) * 0.03;
  return { temp: r2(t, 3), sal: r2(s, 3), oxy: r2(oxy, 1), dic: r2(dic, 1), talk: r2(talk, 1), ph: r2(ph, 4), no3: r2(no3, 2), sio4: r2(sio4, 2), po4: r2(po4, 3) };
}

/** Bottom depth along the line, shelf to Greenland. */
const bottomAt = (x) => (x < 0.12 ? 180 + x * 800 : x > 0.92 ? 1200 + (1 - x) * 18000 : Math.min(3500, 600 + Math.sin(Math.min(1, (x - 0.12) / 0.5) * Math.PI / 2) * 2900));

/**
 * The Labrador Sea line, occupied each spring (2014–2026): GLODAP-shaped
 * bottle data. Made up: real positions, invented numbers.
 */
export function mockLabradorSea(stations, years = Object.keys(CONVECTION).map(Number)) {
  const out = {};
  for (const year of years) {
    const r = rng(year * 31 + 7);
    const conv = CONVECTION[year] ?? 0.5;
    const list = [];
    stations.forEach(([name, lat, lon], si) => {
      const x = si / (stations.length - 1);
      const bottom = bottomAt(x);
      const date = iso(year, 5, 8 + si);
      for (const depth of DEPTHS.filter((d) => d < bottom)) {
        const v = column(depth, x, year, conv, r);
        const o = { station: name, lat, lon, date, depth, ...v };
        // Carbon samples on every other station before 2018; pH only from 2018.
        if (year < 2018 && si % 2) { o.dic = null; o.talk = null; }
        if (year < 2018) o.ph = null;
        for (const k of Object.keys(v)) {
          if (o[k] == null) continue;
          const p = r();
          o[`${k}_flag`] = p < 0.015 ? '4' : p < 0.05 ? '3' : '2';
        }
        list.push(o);
      }
    });
    const id = `col-hal-${year}`;
    out[id] = { id, ...collect(list, Object.keys(GLODAP_VARS), {
      name: `HAL-${year}-05, Labrador Sea line`, kind: 'cruise', platform: 'RV Halcyon', region: 'Labrador Sea', line: 'Labrador Sea line',
      meta: { format: 'glodap', file: `HAL${year}05_glodap.csv`, expocode: `HAL${year}0505`, mock: true },
      cite: { text: `Labrador Sea Carbon Lab and Halcyon Ocean Observatory (${year}). HAL-${year}-05 bottle data. Mock data for the Dashi example, shaped like GLODAP.`, license: 'CC BY 4.0', url: '' },
    }) };
  }
  return out;
}

/** Davis Strait moorings: a reading a day for two years, at two depths. West: Arctic outflow, cold and fresh; east: the warm West Greenland side. */
export function mockDavisStrait(array, { from = '2024-10-01', days = 730 } = {}) {
  const out = {};
  array.forEach(([name, lat, lon], mi) => {
    const r = rng(1000 + mi);
    const east = mi / (array.length - 1);
    const list = [];
    for (let d = 0; d < days; d += 3) {
      const t0 = new Date(`${from}T12:00:00Z`); t0.setUTCDate(t0.getUTCDate() + d);
      const date = t0.toISOString().slice(0, 10);
      const yd = (t0.getUTCMonth() * 30.4 + t0.getUTCDate()) / 365;
      const season = Math.sin((yd - 0.6) * 2 * Math.PI);
      for (const depth of [100, 300]) {
        const deep = depth === 300;
        const temp = -1.4 + 4.4 * east ** 1.5 + (deep ? 0.6 * east : 1.1 * season * (0.4 + east)) + (r() - 0.5) * 0.25;
        const sal = 32.9 + 1.6 * east + (deep ? 0.25 : 0.4 * season * -0.5) + (r() - 0.5) * 0.04;
        const oxy = 330 - 25 * east - 8 * season + (deep ? -10 : 0) + (r() - 0.5) * 4;
        const gap = mi === 2 && d > 400 && d < 455; // a sensor fouled for eight weeks: kept, flagged
        list.push({ station: name, lat, lon, date, depth, temp: r2(temp, 3), sal: r2(sal, 3), oxy: gap ? r2(oxy - 40 * r(), 1) : r2(oxy, 1), oxy_flag: gap ? '4' : '2' });
      }
    }
    const id = `col-${name.toLowerCase()}`;
    out[id] = { id, ...collect(list, ['temp', 'sal', 'oxy'], {
      name: `Mooring ${name}, Davis Strait`, kind: 'mooring', platform: 'Subsurface mooring (CTD and oxygen)', region: 'Davis Strait', line: 'Davis Strait array',
      meta: { format: 'mooring', file: `${name}_daily.csv`, mock: true, note: 'Daily means of hourly readings, every third day kept for the example' },
      cite: { text: `Davis Strait Moorings Group (2026). ${name} daily means, 2024–2026. Mock data for the Dashi example.`, license: 'CC BY 4.0', url: '' },
    }) };
  });
  return out;
}

/** Floats in the Labrador Sea: a profile every ten days for a year, drifting round the gyre; the winter mixed layer deepens to ~1,500 m. */
export function mockFloats(n = 4, { from = '2025-09-01', profiles = 36 } = {}) {
  const out = {};
  const levels = [5, 50, 100, 200, 300, 500, 700, 900, 1100, 1400, 1700, 2000];
  for (let f = 0; f < n; f++) {
    const r = rng(2000 + f);
    const wmo = String(4902100 + f);
    const list = [];
    for (let p = 0; p < profiles; p++) {
      const t0 = new Date(`${from}T06:00:00Z`); t0.setUTCDate(t0.getUTCDate() + p * 10);
      const date = t0.toISOString().slice(0, 10);
      const month = t0.getUTCMonth() + 1;
      // Cyclonic drift round the Labrador Sea.
      const a = (p / profiles) * 2 * Math.PI + f;
      const lat = r2(58 + 1.6 * Math.sin(a) + (r() - 0.5) * 0.2, 3); const lon = r2(-52.5 + 3.2 * Math.cos(a) + (r() - 0.5) * 0.3, 3);
      const mld = [1, 2, 3, 4].includes(month) ? 400 + 1100 * Math.sin(((month - 0.5) / 4) * Math.PI) : [12].includes(month) ? 250 : 40;
      for (const depth of levels) {
        const mixed = depth < mld;
        const temp = mixed ? 3.3 + (month > 4 && month < 11 ? 3 : 0) * Math.exp(-depth / 40) : 3.6 - 0.25 * Math.min(1, depth / 2000) + (r() - 0.5) * 0.06;
        const sal = mixed ? 34.82 - (month > 4 && month < 11 ? 0.5 : 0) * Math.exp(-depth / 30) : 34.87 + (r() - 0.5) * 0.01;
        const oxy = mixed ? 305 + (month <= 4 ? 10 : 0) : 290 - 6 * Math.min(1, depth / 2000) + (r() - 0.5) * 2;
        const q = r() < 0.03 ? '3' : '2';
        list.push({ station: `${wmo}-${p + 1}`, lat, lon, date, depth, temp: r2(temp, 3), sal: r2(sal, 3), oxy: r2(oxy, 1), temp_flag: '2', sal_flag: q, oxy_flag: '2' });
      }
    }
    const id = `col-float-${wmo}`;
    out[id] = { id, ...collect(list, ['temp', 'sal', 'oxy'], {
      name: `Float ${wmo}`, kind: 'track', platform: 'Biogeochemical profiling float', region: 'Labrador Sea',
      meta: { format: 'float', file: `${wmo}_prof.csv`, mock: true, wmo },
      cite: { text: `Float Operations Centre (2026). Float ${wmo} profiles. Mock data for the Dashi example, shaped like Argo.`, license: 'CC BY 4.0', url: '' },
    }) };
  }
  return out;
}

/** A small GLODAP CSV and a WOCE exchange file, made from a mock cruise, so the readers have something real-shaped to read. */
export function mockGlodapCsv(collection) {
  const head = ['G2expocode', 'G2station', 'G2year', 'G2month', 'G2day', 'G2latitude', 'G2longitude', 'G2depth', ...collection.cols.flatMap((k) => (k === 'temp' ? [GLODAP_VARS[k]] : [GLODAP_VARS[k], `${GLODAP_VARS[k]}f`]))];
  const lines = collection.rows.map((r, i) => {
    const [y, m, d] = r[3].split('-').map(Number);
    const vals = collection.cols.flatMap((k, j) => { const v = r[5 + j] ?? -9999; const f = collection.flags[i][j]; return k === 'temp' ? [v] : [v, f === '9' ? 9 : f === '0' ? 0 : 2]; });
    return [collection.meta.expocode, r[0].replace(/\D/g, ''), y, m, d, r[1], r[2], r[4], ...vals].join(',');
  });
  return [head.join(','), ...lines].join('\n');
}
