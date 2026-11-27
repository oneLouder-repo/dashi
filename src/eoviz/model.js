/**
 * EoViz (stage 1, experimental): the eco data lens. Community and lab
 * environmental data (water, air, soil) brought in from instrument files
 * and open data, kept with its units, methods and flags, and drawn.
 *
 * The document "eco" (EoViz owns it and writes no other):
 *
 *   {
 *     id: 'eco',
 *     sites:  { <id>: { id, name, kind: 'water'|'air'|'soil', geo: { lat, lng, precision }, note, tags } },
 *     series: { <id>: { id, siteId, param, unit, fileId, format, depth?, points: [[iso, value, flag?], …] } },
 *     files:  { <id>: { id, name, format, size, at, by, rows, seriesIds, meta } },
 *     settings: { guideline: 'canada' },
 *   }
 *
 * A point's flag: '<' below the detection limit, '>' above the range, 'e' estimated,
 * 'q' questioned. The original value is kept; nothing is changed silently.
 */

export const ECO_DOC = 'eco';
export const blankEco = () => ({ id: 'eco', sites: {}, series: {}, files: {}, settings: { guideline: 'canada' } });

export function migrateEco(d) {
  const doc = { ...blankEco(), ...(d ?? {}) };
  for (const k of ['sites', 'series', 'files']) if (!doc[k] || typeof doc[k] !== 'object') doc[k] = {};
  doc.settings = { guideline: 'canada', ...(doc.settings ?? {}) };
  for (const s of Object.values(doc.series)) if (!Array.isArray(s.points)) s.points = [];
  return doc;
}

export const KINDS = [
  { id: 'water', label: 'Water', icon: 'drop' },
  { id: 'air', label: 'Air', icon: 'wind' },
  { id: 'soil', label: 'Soil', icon: 'leaf' },
];

/**
 * What can be measured. `guide` is a reference line for a dashboard, from
 * Canadian guidelines where there is one (CCME water and soil quality,
 * Health Canada recreation, the Canadian Ambient Air Quality Standards).
 * They are guide values: a group should check the guideline that applies to
 * its own water body, use and province. `aliases` find the parameter from a
 * column header or a CharacteristicName.
 */
export const PARAMS = [
  { id: 'temp', label: 'Water temperature', short: 'Temp', unit: '°C', kind: 'water', aliases: ['temp', 'temperature', 'water temperature', 'wtemp', 'tv290c', 't090c', 'temperature, water', 'temp °c', 'tempc'] },
  { id: 'do', label: 'Dissolved oxygen', short: 'DO', unit: 'mg/L', kind: 'water', guide: { min: 6.5, note: 'CCME, warm water, other life stages' }, aliases: ['do', 'dissolved oxygen', 'oxygen', 'odo mg/l', 'do mg/l', 'sbeox0mg/l', 'dissolved oxygen (do)'] },
  { id: 'ph', label: 'pH', short: 'pH', unit: 'pH', kind: 'water', guide: { min: 6.5, max: 9, note: 'CCME, freshwater aquatic life' }, aliases: ['ph', 'ph units'] },
  { id: 'cond', label: 'Specific conductance', short: 'Cond', unit: 'µS/cm', kind: 'water', aliases: ['cond', 'conductivity', 'specific conductance', 'spcond', 'spcond µs/cm', 'sp cond', 'c0us/cm', 'conductivity µs/cm'] },
  { id: 'sal', label: 'Salinity', short: 'Sal', unit: 'PSU', kind: 'water', aliases: ['salinity', 'sal', 'sal00', 'sal psu'] },
  { id: 'turb', label: 'Turbidity', short: 'Turb', unit: 'NTU', kind: 'water', aliases: ['turbidity', 'turb', 'turbidity ntu', 'turbidity fnu'] },
  { id: 'ecoli', label: 'E. coli', short: 'E. coli', unit: 'CFU/100 mL', kind: 'water', guide: { max: 400, note: 'Health Canada recreation, single sample' }, aliases: ['e. coli', 'ecoli', 'escherichia coli', 'e coli'] },
  { id: 'no3', label: 'Nitrate (as N)', short: 'NO₃-N', unit: 'mg/L', kind: 'water', guide: { max: 3, note: 'CCME long-term, freshwater' }, aliases: ['nitrate', 'nitrate as n', 'no3', 'no3-n', 'nitrate-n', 'nitrate (as n)'] },
  { id: 'tp', label: 'Total phosphorus', short: 'TP', unit: 'mg/L', kind: 'water', guide: { max: 0.035, note: 'CCME trigger range, meso-eutrophic' }, aliases: ['total phosphorus', 'tp', 'phosphorus', 'phosphorus, total'] },
  { id: 'chla', label: 'Chlorophyll a', short: 'Chl a', unit: 'µg/L', kind: 'water', aliases: ['chlorophyll a', 'chla', 'chl', 'flecof', 'chlorophyll'] },
  { id: 'level', label: 'Water level', short: 'Level', unit: 'm', kind: 'water', aliases: ['level', 'water level', 'stage', 'depth', 'level m'] },
  { id: 'flow', label: 'Discharge', short: 'Flow', unit: 'm³/s', kind: 'water', aliases: ['discharge', 'flow', 'q'] },
  { id: 'pres', label: 'Pressure', short: 'Pres', unit: 'kPa', kind: 'water', aliases: ['pressure', 'abs pres', 'abs pres kpa', 'prdm'] },
  { id: 'pm25', label: 'Fine particles (PM2.5)', short: 'PM2.5', unit: 'µg/m³', kind: 'air', guide: { max: 27, note: 'CAAQS 2020, 24-hour' }, aliases: ['pm25', 'pm2.5', 'pm2_5', 'pm2.5_atm', 'pm 2.5'] },
  { id: 'o3', label: 'Ozone', short: 'O₃', unit: 'ppb', kind: 'air', guide: { max: 62, note: 'CAAQS 2020, 8-hour' }, aliases: ['o3', 'ozone'] },
  { id: 'no2', label: 'Nitrogen dioxide', short: 'NO₂', unit: 'ppb', kind: 'air', aliases: ['no2', 'nitrogen dioxide'] },
  { id: 'airtemp', label: 'Air temperature', short: 'Air', unit: '°C', kind: 'air', aliases: ['air temperature', 'airtemp', 'temperature_c'] },
  { id: 'rh', label: 'Relative humidity', short: 'RH', unit: '%', kind: 'air', aliases: ['rh', 'humidity', 'relative humidity', 'current_humidity'] },
  { id: 'soilph', label: 'Soil pH', short: 'Soil pH', unit: 'pH', kind: 'soil', guide: { min: 6, max: 7.5, note: 'A common garden range' }, aliases: ['soil ph', 'ph (soil)', 'ph_h2o'] },
  { id: 'om', label: 'Organic matter', short: 'OM', unit: '%', kind: 'soil', aliases: ['organic matter', 'om', 'om %', 'soc'] },
  { id: 'pb', label: 'Lead', short: 'Pb', unit: 'mg/kg', kind: 'soil', guide: { max: 140, note: 'CCME soil, residential and parkland' }, aliases: ['lead', 'pb', 'pb mg/kg'] },
  { id: 'soilno3', label: 'Soil nitrate', short: 'Soil NO₃', unit: 'mg/kg', kind: 'soil', aliases: ['soil nitrate', 'no3 mg/kg'] },
  { id: 'abs', label: 'Absorbance', short: 'Abs', unit: 'AU', kind: 'water', aliases: ['absorbance', 'abs'] },
];
export const paramById = (id) => PARAMS.find((p) => p.id === id) ?? null;
export const paramLabel = (id) => paramById(id)?.label ?? id;

const clean = (s) => String(s ?? '').toLowerCase().replace(/[[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
/** A column header or a characteristic name → a parameter id, or null. */
export function paramOf(header) {
  const h = clean(header);
  if (!h) return null;
  for (const p of PARAMS) if (p.aliases.includes(h)) return p.id;
  // Headers carry units and serial numbers ("Temp, °C (LGR S/N: 2045)"): try the part before the first comma or bracket.
  const head = clean(String(header).split(/[,(]/)[0]);
  for (const p of PARAMS) if (p.aliases.includes(head)) return p.id;
  for (const p of PARAMS) if (p.aliases.some((a) => a.length > 3 && h.startsWith(a))) return p.id;
  return null;
}

/** A unit found in a header ("Temp, °C", "SpCond µS/cm") → that unit, or the parameter's own. */
export function unitOf(header, param) {
  const m = String(header ?? '').match(/(°C|°F|mg\/L|µS\/cm|uS\/cm|NTU|FNU|PSU|kPa|psi|m³\/s|m3\/s|µg\/m³|ug\/m3|ppb|mg\/kg|%|m\b)/i);
  if (m) return m[1].replace('uS/cm', 'µS/cm').replace('ug/m3', 'µg/m³').replace('m3/s', 'm³/s');
  return paramById(param)?.unit ?? '';
}

/** °F and psi are converted for drawing; the stored value keeps its own unit. */
export function toDisplay(value, unit, param) {
  if (unit === '°F') return (value - 32) * 5 / 9;
  if (unit === 'psi' && param === 'pres') return value * 6.894757;
  return value;
}

/** Where a reading stands against its guide value: 'ok', 'low', 'high' or null (no guide). */
export function judge(param, value) {
  const g = paramById(param)?.guide;
  if (!g || !Number.isFinite(value)) return null;
  if (g.min != null && value < g.min) return 'low';
  if (g.max != null && value > g.max) return 'high';
  return 'ok';
}

export const FLAGS = { '<': 'Below the detection limit', '>': 'Above the instrument’s range', e: 'Estimated', q: 'Questioned' };

/* ------------------------------------------------------------ helpers */

let n = 0;
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const slug = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40) || 'site';

/** Series of one site, newest reading first by parameter order. */
export const seriesOf = (doc, siteId) => Object.values(doc.series).filter((s) => s.siteId === siteId).sort((a, b) => PARAMS.findIndex((p) => p.id === a.param) - PARAMS.findIndex((p) => p.id === b.param));
export const latest = (s) => s.points.at(-1) ?? null;

/** Simple statistics of a series: { n, min, max, mean, first, last, exceed }. */
export function stats(s) {
  const vals = s.points.map((p) => toDisplay(p[1], s.unit, s.param)).filter(Number.isFinite);
  if (!vals.length) return { n: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  return { n: vals.length, min: Math.min(...vals), max: Math.max(...vals), mean: sum / vals.length,
    first: s.points[0][0], last: s.points.at(-1)[0], exceed: vals.filter((v) => ['low', 'high'].includes(judge(s.param, v))).length };
}

/** Readings (from a parsed file) grouped into series: one per site, parameter and depth. */
export function groupRecords(records) {
  const out = new Map();
  for (const r of records) {
    if (!Number.isFinite(r.v)) continue;
    const key = `${r.site ?? ''}|${r.param}|${r.depth ?? ''}`;
    if (!out.has(key)) out.set(key, { site: r.site ?? null, param: r.param, unit: r.unit, depth: r.depth ?? null, points: [] });
    out.get(key).points.push([r.t, r.v, r.flag ?? null].filter((x, i) => i < 2 || x));
  }
  for (const s of out.values()) s.points.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [...out.values()];
}

/** Bring a parsed file into the document: sites by name (made when new), series, and the file record. */
export function addParsed(doc, parsed, { name, size = 0, format, by = null, siteFor = null, at = new Date().toISOString() }) {
  const fileId = newId('f');
  const sitesByName = new Map(Object.values(doc.sites).map((s) => [s.name.toLowerCase(), s]));
  const seriesIds = [];
  const groups = groupRecords(parsed.records ?? []);
  for (const g of groups) {
    const siteName = g.site || siteFor || parsed.meta?.site || name.replace(/\.[^.]+$/, '');
    let site = sitesByName.get(siteName.toLowerCase());
    if (!site) {
      const info = parsed.sites?.[siteName] ?? {};
      site = { id: `s-${slug(siteName)}-${Math.random().toString(36).slice(2, 5)}`, name: siteName, kind: info.kind ?? paramById(g.param)?.kind ?? 'water', geo: info.geo ?? null, note: '', tags: [] };
      doc.sites[site.id] = site;
      sitesByName.set(siteName.toLowerCase(), site);
    }
    const id = newId('ser');
    doc.series[id] = { id, siteId: site.id, param: g.param, unit: g.unit, fileId, format, ...(g.depth != null && { depth: g.depth }), points: g.points };
    seriesIds.push(id);
  }
  doc.files[fileId] = { id: fileId, name, format, size, at, by, rows: parsed.records?.length ?? 0, seriesIds, meta: parsed.meta ?? {} };
  return { fileId, seriesIds };
}

/** Remove a file and the series it brought; sites with nothing left stay (they may have a note or a place). */
export function removeFile(doc, fileId) {
  for (const id of doc.files[fileId]?.seriesIds ?? []) delete doc.series[id];
  delete doc.files[fileId];
}
