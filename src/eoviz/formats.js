import { parseCsv } from '../place/model.js';
import { paramOf, unitOf } from './model.js';

/**
 * The file formats working scientists use, each with the spec it follows,
 * a reader, and a mock file to try (stage 1). A reader returns
 *
 *   { records: [{ site, param, unit, t, v, flag?, depth? }], sites: { <name>: { geo, kind } },
 *     meta: { … }, shape?: 'profile' | 'spectrum' | 'grid', xy?, grid? }
 *
 * Mocks are made by a seeded generator, so the same mock is the same every
 * time. They look like the real thing (headers, units, serial numbers), but
 * the numbers are invented: they are for trying viz types, never for decisions.
 */

/* ------------------------------------------------------------ seeded numbers */

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => d.toISOString().slice(0, 19) + 'Z';
const day = (d) => d.toISOString().slice(0, 10);
const clock = (d) => d.toISOString().slice(11, 19);
const DAY = 864e5;

/** A season of a parameter: a yearly wave, a daily wave, noise. dayOfYear 0 = 1 January. */
function wave(param, dayOfYear, hour, r) {
  const yr = Math.sin(((dayOfYear - 110) / 365) * 2 * Math.PI);
  const dy = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
  switch (param) {
    case 'temp': return 10 + 9 * yr + 1.4 * dy + (r() - 0.5);
    case 'do': return 10.4 - 2.6 * yr + 1.1 * dy + (r() - 0.5) * 0.6;
    case 'ph': return 7.4 + 0.25 * dy + (r() - 0.5) * 0.3;
    case 'cond': return 240 - 60 * yr + (r() - 0.5) * 30;
    case 'sal': return 29 + 1.2 * yr + (r() - 0.5);
    case 'turb': return Math.max(0.4, 3 + (r() < 0.08 ? 25 * r() : 0) + (r() - 0.5) * 2);
    case 'ecoli': return Math.round(Math.max(4, 60 + 140 * Math.max(0, yr) + (r() < 0.12 ? 600 * r() : 0) + (r() - 0.5) * 40));
    case 'no3': return Math.max(0.05, 1.1 - 0.6 * yr + (r() - 0.5) * 0.4);
    case 'tp': return Math.max(0.004, 0.022 + 0.012 * yr + (r() - 0.5) * 0.01);
    case 'chla': return Math.max(0.2, 2 + 4 * Math.max(0, yr) + (r() - 0.5) * 1.5);
    case 'level': return 1.2 - 0.35 * yr + (r() < 0.05 ? 0.6 * r() : 0) + (r() - 0.5) * 0.04;
    case 'pm25': return Math.max(1, 7 + 4 * dy + (r() < 0.06 ? 40 * r() : 0) + (r() - 0.5) * 4);
    case 'airtemp': return 6 + 14 * yr + 4 * dy + (r() - 0.5) * 2;
    case 'rh': return Math.min(99, Math.max(20, 70 - 15 * dy + (r() - 0.5) * 10));
    default: return r();
  }
}
const doy = (d) => Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY);

/* ------------------------------------------------------------ readers' helpers */

const num = (s) => {
  const t = String(s ?? '').trim().replace(/^[<>~]/, '');
  if (t === '') return NaN;
  return Number(t.replace(',', '.').match(/^-?\d+(\.\d+)?(e-?\d+)?$/i) ? t.replace(',', '.') : NaN);
};
const flagOf = (s, cond = '') => {
  const t = String(s ?? '').trim();
  if (t.startsWith('<') || /not detected|below/i.test(cond)) return '<';
  if (t.startsWith('>') || /above|over/i.test(cond)) return '>';
  if (/estimated|^e$|^j$/i.test(cond)) return 'e';
  return null;
};
/** "2025-06-14" + "13:05" (or "06/14/2025" + "1:05:00 PM") → an ISO time. */
export function timeOf(date, time = '') {
  let d = String(date ?? '').trim(), t = String(time ?? '').trim();
  if (!t && /[ T]\d{1,2}:\d\d/.test(d)) [d, t] = d.split(/[ T](?=\d{1,2}:)/);
  let y, m, dd;
  let mm = d.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (mm) [, y, m, dd] = mm;
  else if ((mm = d.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) { [, m, dd, y] = mm; if (y.length === 2) y = `20${y}`; }
  else return null;
  let hh = 0, mi = 0, ss = 0;
  const tm = t.match(/^(\d{1,2}):(\d\d)(?::(\d\d))?\s*(AM|PM)?/i);
  if (tm) { hh = +tm[1]; mi = +tm[2]; ss = +(tm[3] ?? 0); if (tm[4]) { if (/pm/i.test(tm[4]) && hh < 12) hh += 12; if (/am/i.test(tm[4]) && hh === 12) hh = 0; } }
  const ms = Date.UTC(+y, +m - 1, +dd, hh, mi, ss);
  return Number.isFinite(ms) ? isoOf(new Date(ms)) : null;
}
const header = (rows) => rows[0].map((c) => String(c).trim());
const col = (head, ...names) => head.findIndex((h) => names.some((n) => h.toLowerCase() === n.toLowerCase()));
const tag = (text, name) => text.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1]?.trim() ?? '';

/* ------------------------------------------------------------ the formats */

export const FORMATS = [
  {
    id: 'csv-wide', label: 'Spreadsheet table (CSV)', family: 'Tables', ext: ['.csv', '.tsv', '.txt'],
    spec: { name: 'RFC 4180, comma-separated values', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
    about: 'One row per time, one column per parameter: what most people save from Excel. Columns are matched to parameters by their header (Temp °C, DO mg/L, pH, SpCond µS/cm).',
    detect: () => 1,
    parse(text) {
      const rows = parseCsv(text);
      if (rows.length < 2) return { records: [], error: 'The file has no rows under its header.' };
      const head = header(rows);
      const tCol = head.findIndex((h) => /date|time|timestamp|datetime/i.test(h));
      const tCol2 = head.findIndex((h, i) => i !== tCol && /^time\b/i.test(h));
      const sCol = col(head, 'site', 'station', 'location', 'site name', 'station_id');
      const params = head.map((h, i) => (i === tCol || i === tCol2 || i === sCol ? null : paramOf(h) && { i, param: paramOf(h), unit: unitOf(h, paramOf(h)) })).filter(Boolean);
      if (tCol < 0) return { records: [], error: 'No date or time column was found.', columns: head };
      if (!params.length) return { records: [], error: 'No column matched a parameter. Name columns like “Temp °C”, “DO mg/L” or “pH”.', columns: head };
      const records = [];
      for (const r of rows.slice(1)) {
        const t = timeOf(r[tCol], tCol2 >= 0 ? r[tCol2] : '');
        if (!t) continue;
        for (const p of params) records.push({ site: sCol >= 0 ? r[sCol]?.trim() || null : null, param: p.param, unit: p.unit, t, v: num(r[p.i]), flag: flagOf(r[p.i]) });
      }
      return { records, meta: { columns: head, matched: params.map((p) => `${head[p.i]} → ${p.param}`) } };
    },
    mock(seed = 3) {
      const r = rng(seed), lines = ['Date,Time,Site,Temp °C,DO mg/L,pH,SpCond µS/cm,Turbidity NTU'];
      const start = Date.UTC(2025, 3, 6, 9);
      for (let w = 0; w < 30; w++) for (const site of ['Mill Creek bridge', 'Harbour mouth']) {
        const d = new Date(start + w * 7 * DAY + (site === 'Harbour mouth' ? 3600e3 : 0)), k = doy(d), off = site === 'Harbour mouth' ? 1.5 : 0;
        lines.push([day(d), clock(d).slice(0, 5), site, round(wave('temp', k, 10, r) - off, 1), round(wave('do', k, 10, r) + off / 2, 2), round(wave('ph', k, 10, r), 2), Math.round(wave('cond', k, 10, r) * (site === 'Harbour mouth' ? 3 : 1)), round(wave('turb', k, 10, r), 1)].join(','));
      }
      return lines.join('\n');
    },
  },
  {
    id: 'datastream', label: 'DataStream schema (long CSV)', family: 'Community water data', ext: ['.csv'],
    spec: { name: 'DataStream open data schema (built on WQX)', url: 'https://datastream.org/en-ca/' },
    about: 'Canada’s open hub for community water monitoring. One row per result, with the monitoring location, characteristic, value, unit and detection condition. EoViz reads it and can write it back out for sharing.',
    detect: (text) => (/MonitoringLocationID/.test(text.slice(0, 2000)) && /CharacteristicName/.test(text.slice(0, 2000)) ? 10 : 0),
    parse(text) {
      const rows = parseCsv(text), head = header(rows);
      const c = (n) => col(head, n);
      const [loc, name, lat, lng, date, time, depth, ch, val, unit, cond] = ['MonitoringLocationID', 'MonitoringLocationName', 'MonitoringLocationLatitude', 'MonitoringLocationLongitude', 'ActivityStartDate', 'ActivityStartTime', 'ActivityDepthHeightMeasure', 'CharacteristicName', 'ResultValue', 'ResultUnit', 'ResultDetectionCondition'].map(c);
      const records = [], sites = {};
      for (const r of rows.slice(1)) {
        const site = (name >= 0 && r[name]) || r[loc];
        if (site && !sites[site] && lat >= 0) sites[site] = { geo: { lat: num(r[lat]), lng: num(r[lng]), precision: 'exact' }, kind: 'water' };
        const param = paramOf(r[ch]);
        if (!param) continue;
        records.push({ site, param, unit: r[unit] || unitOf('', param), t: timeOf(r[date], r[time]), v: num(r[val]), flag: flagOf(r[val], cond >= 0 ? r[cond] : ''), depth: depth >= 0 && r[depth] !== '' ? num(r[depth]) : null });
      }
      return { records: records.filter((x) => x.t), sites, meta: { dataset: rows[1]?.[c('DatasetName')] ?? '' } };
    },
    mock(seed = 5) {
      const r = rng(seed);
      const head = 'DatasetName,MonitoringLocationID,MonitoringLocationName,MonitoringLocationLatitude,MonitoringLocationLongitude,ActivityType,ActivityStartDate,ActivityStartTime,ActivityDepthHeightMeasure,ActivityDepthHeightUnit,CharacteristicName,ResultValue,ResultUnit,ResultDetectionCondition,ResultDetectionQuantitationLimitMeasure';
      const sites = [['KB-01', 'Mill Creek at the mill', 43.312, -61.214], ['KB-02', 'Mill Creek at the bridge', 43.305, -61.201], ['KB-03', 'Wharf outflow', 43.297, -61.188]];
      const chars = [['Temperature, water', 'temp', 'deg C', 1], ['Dissolved oxygen (DO)', 'do', 'mg/L', 2], ['pH', 'ph', 'None', 2], ['Escherichia coli', 'ecoli', 'MPN/100mL', 0], ['Total Phosphorus, mixed forms', 'tp', 'mg/L', 3], ['Nitrate', 'no3', 'mg/L', 2]];
      const lines = [head];
      for (let m = 0; m < 18; m++) for (const [id, nm, la, lo] of sites) {
        const d = new Date(Date.UTC(2024, 4 + m, 12, 10 + (r() * 3) | 0, (r() * 59) | 0)), k = doy(d);
        if ([11, 12, 13, 14].includes((4 + m) % 12 === 0 ? 12 : (4 + m) % 12) && r() < 0.6) continue; // winter: ice, fewer samples
        for (const [cn, p, u, dp] of chars) {
          let v = wave(p, k, 11, r) * (id === 'KB-03' && ['ecoli', 'tp'].includes(p) ? 1.8 : 1);
          let res = round(v, dp), condn = '', lim = '';
          if (p === 'tp' && v < 0.01) { res = ''; condn = 'Not Detected'; lim = '0.01'; }
          lines.push(['Kestrel Bay Watershed Monitoring', id, nm, la, lo, 'Sample-Routine', day(d), clock(d).slice(0, 5), '0.2', 'm', `"${cn}"`, res, u, condn, lim].join(','));
        }
      }
      return lines.join('\n');
    },
  },
  {
    id: 'wqx', label: 'Water Quality Portal (WQX)', family: 'Government open data', ext: ['.csv'],
    spec: { name: 'WQX 3.0 result profile (EPA and USGS)', url: 'https://www.waterqualitydata.us/' },
    about: 'The US Water Quality Portal’s result download, shared by the EPA and USGS. Many Canadian and tribal programs use the same WQX names.',
    detect: (text) => (/MonitoringLocationIdentifier/.test(text.slice(0, 3000)) && /ResultMeasureValue/.test(text.slice(0, 3000)) ? 10 : 0),
    parse(text) {
      const rows = parseCsv(text), head = header(rows);
      const c = (...n) => col(head, ...n);
      const [loc, date, time, ch, val, unit, cond] = [c('MonitoringLocationIdentifier'), c('ActivityStartDate'), c('ActivityStartTime/Time'), c('CharacteristicName'), c('ResultMeasureValue'), c('ResultMeasure/MeasureUnitCode'), c('ResultDetectionConditionText')];
      const records = [];
      for (const r of rows.slice(1)) { const param = paramOf(r[ch]); if (param) records.push({ site: r[loc], param, unit: r[unit] || unitOf('', param), t: timeOf(r[date], r[time]), v: num(r[val]), flag: flagOf(r[val], cond >= 0 ? r[cond] : '') }); }
      return { records: records.filter((x) => x.t), meta: {} };
    },
    mock(seed = 7) {
      const r = rng(seed), lines = ['OrganizationIdentifier,MonitoringLocationIdentifier,ActivityStartDate,ActivityStartTime/Time,ActivityStartTime/TimeZoneCode,CharacteristicName,ResultMeasureValue,ResultMeasure/MeasureUnitCode,ResultDetectionConditionText,ResultStatusIdentifier'];
      for (let m = 0; m < 24; m++) {
        const d = new Date(Date.UTC(2023, m, 8, 14, 30)), k = doy(d);
        for (const [cn, p, u] of [['Temperature, water', 'temp', 'deg C'], ['Specific conductance', 'cond', 'uS/cm @25C'], ['Dissolved oxygen (DO)', 'do', 'mg/l'], ['Turbidity', 'turb', 'NTU']]) lines.push(['USGS-ME', 'USGS-01010000', day(d), '10:30:00', 'EST', `"${cn}"`, round(wave(p, k, 10, r), p === 'cond' ? 0 : 1), u, '', 'Accepted'].join(','));
      }
      return lines.join('\n');
    },
  },
  {
    id: 'hobo', label: 'Onset HOBO logger (CSV export)', family: 'Data loggers', ext: ['.csv'],
    spec: { name: 'Onset HOBOware / HOBOconnect CSV export', url: 'https://www.onsetcomp.com/' },
    about: 'Temperature and water level loggers left in a stream for a season. The export starts with a plot title, then columns with units and serial numbers in the header.',
    detect: (text) => (/Plot Title|LGR S\/N|SEN S\/N/.test(text.slice(0, 600)) ? 12 : 0),
    parse(text) {
      const rows = parseCsv(text);
      const title = rows[0]?.[0]?.startsWith('Plot Title') ? rows.shift()[0].replace(/^Plot Title:\s*/, '') : '';
      const head = header(rows), tCol = head.findIndex((h) => /date time/i.test(h));
      const params = head.map((h, i) => (paramOf(h) && i !== tCol ? { i, param: paramOf(h), unit: unitOf(h, paramOf(h)), serial: h.match(/LGR S\/N:\s*(\d+)/)?.[1] } : null)).filter(Boolean);
      const records = [];
      for (const r of rows.slice(1)) { const t = timeOf(r[tCol]); if (t) for (const p of params) records.push({ site: title || null, param: p.param, unit: p.unit, t, v: num(r[p.i]) }); }
      return { records, meta: { title, serial: params[0]?.serial ?? '', zone: head[tCol]?.match(/GMT[-+]\d\d:\d\d/)?.[0] ?? '' } };
    },
    mock(seed = 11) {
      const r = rng(seed), lines = ['"Plot Title: Mill Creek riffle"', '"#","Date Time, GMT-04:00","Temp, °C (LGR S/N: 20451877, SEN S/N: 20451877)","Abs Pres, kPa (LGR S/N: 20451877, SEN S/N: 20451877)"'];
      const start = Date.UTC(2025, 6, 1, 4);
      for (let i = 0; i < 24 * 14; i++) {
        const d = new Date(start + i * 3600e3), loc = new Date(d - 4 * 3600e3), k = doy(d), hr = loc.getUTCHours();
        const ds = `${pad(loc.getUTCMonth() + 1)}/${pad(loc.getUTCDate())}/${String(loc.getUTCFullYear()).slice(2)} ${pad(hr % 12 || 12)}:00:00 ${hr < 12 ? 'AM' : 'PM'}`;
        lines.push([i + 1, ds, round(wave('temp', k, hr, r) + (i > 200 && i < 230 ? 3.5 : 0), 3), round(101.2 + wave('level', k, hr, r) * 9.8 / 10, 3)].join(','));
      }
      return lines.join('\n');
    },
  },
  {
    id: 'xle', label: 'Solinst Levelogger (.xle)', family: 'Data loggers', ext: ['.xle'],
    spec: { name: 'Solinst Levelogger XLE (XML)', url: 'https://www.solinst.com/products/dataloggers-and-telemetry/' },
    about: 'Water level and temperature loggers in wells and streams. An .xle file is XML: the instrument, channel headers with units, then one Log per reading.',
    detect: (text, name) => (/\.xle$/i.test(name) || /<Body_xle>|<Ch1_data_header>/.test(text.slice(0, 4000)) ? 20 : 0),
    parse(text) {
      const site = tag(text, 'Location') || tag(text, 'Project_ID') || null;
      const chans = [1, 2, 3].map((k) => { const hd = tag(text, `Ch${k}_data_header`); if (!hd) return null; const id = tag(hd, 'Identification'), u = tag(hd, 'Unit'); return { k, param: paramOf(id) ?? (/level/i.test(id) ? 'level' : /temp/i.test(id) ? 'temp' : null), unit: u.replace('Deg C', '°C').replace('degC', '°C') }; }).filter((c) => c?.param);
      const records = [];
      for (const m of text.matchAll(/<Log[^>]*>([\s\S]*?)<\/Log>/g)) {
        const t = timeOf(tag(m[1], 'Date'), tag(m[1], 'Time'));
        for (const c of chans) records.push({ site, param: c.param, unit: c.unit, t, v: num(tag(m[1], `ch${c.k}`)) });
      }
      return { records: records.filter((x) => x.t), meta: { instrument: tag(text, 'Instrument_type'), serial: tag(text, 'Serial_number') } };
    },
    mock(seed = 13) {
      const r = rng(seed), logs = [];
      const start = Date.UTC(2025, 2, 1);
      for (let i = 0; i < 24 * 20; i += 2) {
        const d = new Date(start + i * 3600e3), k = doy(d);
        const melt = i > 240 && i < 330 ? Math.sin(((i - 240) / 90) * Math.PI) * 0.8 : 0;
        logs.push(`    <Log id="${i / 2 + 1}"><Date>${day(d).replace(/-/g, '/')}</Date><Time>${clock(d)}</Time><ms>0</ms><ch1>${round(wave('level', k, d.getUTCHours(), r) + melt, 4)}</ch1><ch2>${round(Math.max(0.1, wave('temp', k, d.getUTCHours(), r) - 4), 3)}</ch2></Log>`);
      }
      return `<?xml version="1.0" encoding="ISO-8859-1"?>\n<Body_xle>\n  <File_info><Company>Kestrel Bay Watershed</Company><Created_by>Levelogger 4.6</Created_by></File_info>\n  <Instrument_info><Instrument_type>L5_LT</Instrument_type><Model_number>M10</Model_number><Serial_number>2087441</Serial_number></Instrument_info>\n  <Instrument_info_data_header><Project_ID>Spring melt</Project_ID><Location>Upper Mill Creek well</Location><Sample_rate>720000</Sample_rate></Instrument_info_data_header>\n  <Ch1_data_header><Identification>LEVEL</Identification><Unit>m</Unit></Ch1_data_header>\n  <Ch2_data_header><Identification>TEMPERATURE</Identification><Unit>Deg C</Unit></Ch2_data_header>\n  <Data>\n${logs.join('\n')}\n  </Data>\n</Body_xle>`;
    },
  },
  {
    id: 'exo', label: 'YSI EXO sonde (KorEXO CSV)', family: 'Data loggers', ext: ['.csv'],
    spec: { name: 'YSI KorEXO export', url: 'https://www.ysi.com/exo' },
    about: 'Multi-parameter sondes: temperature, conductivity, oxygen, pH, turbidity and algae sensors at once, every 15 minutes. A wide file with many parameters is a good test of small multiples.',
    detect: (text) => (/KOR Export|ODO mg\/L|Date \(MM\/DD\/YYYY\)/.test(text.slice(0, 3000)) ? 12 : 0),
    parse(text) {
      const lines = text.split(/\r?\n/);
      const at = lines.findIndex((l) => /^Date \(MM\/DD\/YYYY\)/.test(l));
      const rows = parseCsv(lines.slice(at).join('\n')), head = header(rows);
      const siteCol = col(head, 'Site Name');
      const params = head.map((h, i) => { const p = /^ODO mg\/L/.test(h) ? 'do' : /^SpCond/.test(h) ? 'cond' : /^Temp/.test(h) ? 'temp' : /^pH$/.test(h) ? 'ph' : /^Turbidity/.test(h) ? 'turb' : /^Chlorophyll ug\/L/.test(h) ? 'chla' : /^Sal/.test(h) ? 'sal' : null; return p && { i, param: p, unit: unitOf(h, p) }; }).filter(Boolean);
      const records = [];
      for (const r of rows.slice(1)) { const t = timeOf(r[0], r[1]); if (t) for (const p of params) records.push({ site: siteCol >= 0 ? r[siteCol] : null, param: p.param, unit: p.unit, t, v: num(r[p.i]) }); }
      return { records, meta: { sonde: lines.find((l) => /^Sonde/.test(l)) ?? '' } };
    },
    mock(seed = 17) {
      const r = rng(seed), lines = ['KOR Export File', 'Sonde,EXO2 21B100345', 'Sensors:,Temp-Cond 21A101,ODO 21A102,pH 21A103,Turbidity 21A104,Total Algae 21A105', ''];
      lines.push('Date (MM/DD/YYYY),Time (HH:mm:ss),Time (Fract. Sec),Site Name,Chlorophyll RFU,Chlorophyll ug/L,Cond µS/cm,Depth m,ODO % sat,ODO mg/L,pH,Sal psu,SpCond µS/cm,Turbidity FNU,Temp °C');
      const start = Date.UTC(2025, 7, 10, 0);
      for (let i = 0; i < 96 * 4; i++) {
        const d = new Date(start + i * 900e3), k = doy(d), hr = d.getUTCHours() + d.getUTCMinutes() / 60;
        const t = wave('temp', k, hr, r) + 2, o = wave('do', k, hr, r) - 1.5, chl = wave('chla', k, hr, r) * (1 + 0.6 * Math.sin((hr - 14) / 24 * 2 * Math.PI));
        const sp = wave('cond', k, hr, r) * 4;
        lines.push([`${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`, clock(d), 0, 'Harbour buoy', round(chl / 4, 2), round(chl, 2), Math.round(sp * (1 + 0.02 * (t - 25))), round(0.6 + r() * 0.05, 3), round(o / 0.09, 1), round(o, 2), round(wave('ph', k, hr, r) + 0.4, 2), round(sp / 1700, 2), Math.round(sp), round(wave('turb', k, hr, r), 2), round(t, 3)].join(','));
      }
      return lines.join('\n');
    },
  },
  {
    id: 'cnv', label: 'Sea-Bird CTD cast (.cnv)', family: 'Profiles', ext: ['.cnv'],
    spec: { name: 'Sea-Bird SBE Data Processing CNV', url: 'https://www.seabird.com/software' },
    about: 'A CTD lowered through the water column: temperature, salinity, oxygen and chlorophyll by depth. The header lists each column (“# name 1 = t090C: Temperature”), then *END*.',
    detect: (text, name) => (/\.cnv$/i.test(name) || /^\* Sea-Bird/m.test(text.slice(0, 400)) ? 20 : 0),
    parse(text) {
      const lines = text.split(/\r?\n/), end = lines.findIndex((l) => l.startsWith('*END*'));
      const names = [];
      for (const l of lines.slice(0, end)) { const m = l.match(/^# name (\d+) = ([^:]+):\s*(.*)$/); if (m) names[+m[1]] = { code: m[2].trim(), label: m[3] }; }
      const station = lines.find((l) => /^\*\* Station/i.test(l))?.split(':')[1]?.trim() || 'CTD station';
      const when = lines.find((l) => /^# start_time/.test(l))?.match(/= (.*?)( \[|$)/)?.[1];
      const t = when ? isoOf(new Date(Date.parse(`${when} UTC`))) : null;
      const map = { prdm: 'depth', depsm: 'depth', t090c: 'temp', sal00: 'sal', sbeox0mg_l: 'do', 'sbeox0mg/l': 'do', flecof: 'chla', c0us_cm: 'cond' };
      const cols = names.map((n, i) => ({ i, key: map[n.code.toLowerCase()] ?? paramOf(n.code), label: n.label }));
      const dIdx = cols.find((c) => c.key === 'depth')?.i ?? 0;
      const records = [];
      for (const l of lines.slice(end + 1)) {
        const v = l.trim().split(/\s+/).map(Number);
        if (v.length < 2 || !Number.isFinite(v[dIdx])) continue;
        for (const c of cols) if (c.key && c.key !== 'depth' && c.key !== 'pres') records.push({ site: station, param: c.key, unit: unitOf(c.label, c.key) || '', t, v: v[c.i], depth: round(v[dIdx], 1) });
      }
      return { records, shape: 'profile', meta: { station, cast: when ?? '', columns: names.map((n) => n.code) } };
    },
    mock(seed = 19) {
      const r = rng(seed);
      const head = ['* Sea-Bird SBE19plus Data File:', '* FileName = C:\\data\\kb_harbour_0814.hex', '* Software version 2.8.0.119', '** Station: Harbour channel', '** Operator: Kestrel Bay Monitoring', '# nquan = 5', '# nvalues = 60', '# name 0 = depSM: Depth [salt water, m]', '# name 1 = t090C: Temperature [ITS-90, deg C]', '# name 2 = sal00: Salinity, Practical [PSU]', '# name 3 = sbeox0Mg/L: Oxygen, SBE 43 [mg/l]', '# name 4 = flECO-AFL: Fluorescence, WET Labs ECO-AFL/FL [mg/m^3]', '# start_time = Aug 14 2025 13:42:10 [NMEA time, header]', '# bad_flag = -9.990e-29', '*END*'];
      const rows = [];
      for (let i = 0; i < 60; i++) {
        const z = 0.5 + i * 0.5, thermo = 1 / (1 + Math.exp((z - 9) / 1.6));
        const T = 6 + 11 * thermo + (r() - 0.5) * 0.15, S = 31.6 - 2.4 * thermo + (r() - 0.5) * 0.05, O = 7.2 + 1.6 * thermo - (z > 22 ? (z - 22) * 0.12 : 0) + (r() - 0.5) * 0.1, F = 0.4 + 5 * Math.exp(-((z - 8) ** 2) / 6) + r() * 0.2;
        rows.push(`  ${z.toFixed(3).padStart(8)} ${T.toFixed(4).padStart(9)} ${S.toFixed(4).padStart(9)} ${O.toFixed(4).padStart(9)} ${F.toFixed(4).padStart(9)}`);
      }
      return [...head, ...rows].join('\n');
    },
  },
  {
    id: 'waterml', label: 'WaterML 2.0 time series', family: 'Government open data', ext: ['.xml', '.wml'],
    spec: { name: 'OGC WaterML 2.0 (OGC 10-126r4)', url: 'https://www.ogc.org/standard/waterml/' },
    about: 'The international XML standard for hydrological time series, served by many agencies’ water level and flow services.',
    detect: (text) => (/wml2:MeasurementTimeseries|WaterML/i.test(text.slice(0, 4000)) ? 15 : 0),
    parse(text) {
      const prop = text.match(/observedProperty[^>]*xlink:title="([^"]+)"/)?.[1] ?? '';
      const site = text.match(/featureOfInterest[^>]*xlink:title="([^"]+)"/)?.[1] ?? null;
      const unit = text.match(/uom[^>]*code="([^"]+)"/)?.[1] ?? '';
      const param = paramOf(prop) ?? (/discharge|flow/i.test(prop) ? 'flow' : /level|stage/i.test(prop) ? 'level' : null);
      const records = [];
      for (const m of text.matchAll(/<wml2:MeasurementTVP>([\s\S]*?)<\/wml2:MeasurementTVP>/g)) records.push({ site, param, unit: unit.replace('m3/s', 'm³/s'), t: isoOf(new Date(tag(m[1], 'wml2:time'))), v: num(tag(m[1], 'wml2:value')) });
      return { records: param ? records : [], meta: { property: prop }, error: param ? null : `The property “${prop}” isn’t one EoViz knows yet.` };
    },
    mock(seed = 23) {
      const r = rng(seed), pts = [];
      let q = 2.1;
      for (let i = 0; i < 120; i++) {
        const d = new Date(Date.UTC(2025, 2, 15) + i * DAY);
        q = Math.max(0.3, q * 0.94 + (r() < 0.12 ? 6 * r() : 0) + (i > 20 && i < 40 ? 0.9 : 0.05));
        pts.push(`      <wml2:point><wml2:MeasurementTVP><wml2:time>${isoOf(d)}</wml2:time><wml2:value>${round(q, 3)}</wml2:value></wml2:MeasurementTVP></wml2:point>`);
      }
      return `<?xml version="1.0" encoding="UTF-8"?>\n<wml2:Collection xmlns:wml2="http://www.opengis.net/waterml/2.0" xmlns:om="http://www.opengis.net/om/2.0" xmlns:xlink="http://www.w3.org/1999/xlink">\n  <wml2:observationMember><om:OM_Observation>\n    <om:observedProperty xlink:title="Discharge"/>\n    <om:featureOfInterest xlink:title="Mill Creek near Kestrel Bay"/>\n    <om:result><wml2:MeasurementTimeseries>\n      <wml2:defaultPointMetadata><wml2:DefaultTVPMeasurementMetadata><wml2:uom code="m3/s"/></wml2:DefaultTVPMeasurementMetadata></wml2:defaultPointMetadata>\n${pts.join('\n')}\n    </wml2:MeasurementTimeseries></om:result>\n  </om:OM_Observation></wml2:observationMember>\n</wml2:Collection>`;
    },
  },
  {
    id: 'cdl', label: 'NetCDF / CF (as CDL text)', family: 'Gridded science data', ext: ['.cdl', '.nc'],
    spec: { name: 'NetCDF with CF Conventions 1.11', url: 'https://cfconventions.org/' },
    about: 'How oceanographers and climate scientists store arrays: dimensions, variables with units and standard names, then data. A binary .nc needs a NetCDF library (stage 3); the text form, CDL (what ncdump prints), is read now.',
    detect: (text, name) => (/\.nc$/i.test(name) ? 30 : /^netcdf\s+\S+\s*\{/m.test(text.slice(0, 200)) ? 20 : 0),
    parse(text, name = '') {
      if (/\.nc$/i.test(name) || text.startsWith('CDF') || text.startsWith('\u0089HDF')) return { records: [], error: 'Binary NetCDF comes in stage 3. For now, save it as text with “ncdump file.nc > file.cdl”.' };
      const dims = Object.fromEntries([...text.matchAll(/^\s*(\w+)\s*=\s*(\d+)\s*;/gm)].slice(0, 6).map((m) => [m[1], +m[2]]));
      const vars = [...text.matchAll(/^\s*(?:double|float|int|short)\s+(\w+)\(([^)]*)\)\s*;/gm)].map((m) => ({ name: m[1], dims: m[2].split(',').map((s) => s.trim()) }));
      const attr = (v, a) => text.match(new RegExp(`${v}:${a}\\s*=\\s*"([^"]*)"`))?.[1] ?? '';
      const data = text.split(/^\s*data:\s*$/m)[1] ?? '';
      const values = (v) => (data.match(new RegExp(`\\b${v}\\s*=([^;]*);`))?.[1] ?? '').split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      const grid = vars.find((v) => v.dims.length === 2);
      if (!grid) return { records: [], error: 'No two-dimensional variable was found.' };
      const [d0, d1] = grid.dims, xs = values(d0), ys = values(d1), zs = values(grid.name);
      const units0 = attr(d0, 'units'), base = units0.match(/since (\d{4}-\d\d-\d\d)/)?.[1];
      const param = paramOf(attr(grid.name, 'standard_name').replace('sea_water_', '')) ?? paramOf(grid.name) ?? 'temp';
      const site = text.match(/:title\s*=\s*"([^"]*)"/)?.[1] || 'Gridded data';
      const records = [];
      xs.forEach((x, i) => ys.forEach((y, j) => records.push({ site, param, unit: attr(grid.name, 'units').replace('degC', '°C'), t: base ? isoOf(new Date(Date.parse(base) + x * DAY)) : String(x), v: zs[i * ys.length + j], depth: y })));
      return { records, shape: 'grid', grid: { x: d0, y: d1, xs, ys, zs, param }, meta: { dims, title: site, conventions: text.match(/:Conventions\s*=\s*"([^"]*)"/)?.[1] ?? '' } };
    },
    mock(seed = 29) {
      const r = rng(seed), T = 26, Z = 12, zs = [];
      const times = Array.from({ length: T }, (_, i) => i * 14), depths = Array.from({ length: Z }, (_, j) => j * 2 + 1);
      for (const t of times) for (const z of depths) { const yr = Math.sin(((t - 110) / 365) * 2 * Math.PI); const mix = 4 + 10 * Math.max(0, yr); zs.push(round(4 + Math.max(0, 13 * yr) / (1 + Math.exp((z - mix) / 1.5)) + (r() - 0.5) * 0.2, 2)); }
      return `netcdf kestrel_harbour_temperature {\ndimensions:\n\ttime = ${T} ;\n\tdepth = ${Z} ;\nvariables:\n\tdouble time(time) ;\n\t\ttime:units = "days since 2025-01-01" ;\n\t\ttime:standard_name = "time" ;\n\tdouble depth(depth) ;\n\t\tdepth:units = "m" ;\n\t\tdepth:positive = "down" ;\n\tdouble temp(time, depth) ;\n\t\ttemp:units = "degC" ;\n\t\ttemp:standard_name = "sea_water_temperature" ;\n\n// global attributes:\n\t\t:Conventions = "CF-1.11" ;\n\t\t:title = "Harbour mooring, temperature by depth" ;\n\t\t:institution = "Kestrel Bay Watershed Monitoring (mock)" ;\ndata:\n\n time = ${times.join(', ')} ;\n\n depth = ${depths.join(', ')} ;\n\n temp =\n  ${zs.join(', ')} ;\n}`;
    },
  },
  {
    id: 'jcamp', label: 'JCAMP-DX spectrum', family: 'Lab instruments', ext: ['.jdx', '.dx', '.jcamp'],
    spec: { name: 'JCAMP-DX 4.24 (IUPAC)', url: 'https://iupac.org/what-we-do/digital-standards/jcamp-dx/' },
    about: 'The lab’s spectrum file: UV-Vis, infrared, fluorescence. Labelled records (##TITLE=, ##XUNITS=) then x,y pairs. A water lab uses UV-Vis for nitrate, phosphate and dissolved organic matter.',
    detect: (text, name) => (/\.(jdx|dx|jcamp)$/i.test(name) || /^##JCAMP-DX=/m.test(text.slice(0, 400)) ? 20 : 0),
    parse(text) {
      const label = (k) => text.match(new RegExp(`^##${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
      const body = text.split(/^##(?:XYPOINTS|PEAK TABLE|XYDATA)=.*$/m)[1]?.split(/^##END=/m)[0] ?? '';
      const x = [], y = [];
      for (const l of body.split(/\r?\n/)) { const m = l.trim().split(/[\s,;]+/).map(Number); if (m.length >= 2 && m.every(Number.isFinite)) { x.push(m[0]); y.push(m[1]); } }
      return { records: [], shape: 'spectrum', xy: { x, y, xLabel: label('XUNITS').toLowerCase() || 'x', yLabel: label('YUNITS').toLowerCase() || 'y', title: label('TITLE') }, meta: { title: label('TITLE'), type: label('DATA TYPE'), origin: label('ORIGIN') } };
    },
    mock(seed = 31) {
      const r = rng(seed), pts = [];
      for (let nm = 200; nm <= 400; nm += 1) {
        const a = 1.6 * Math.exp(-((nm - 220) ** 2) / 90) + 0.35 * Math.exp(-((nm - 302) ** 2) / 300) + 0.12 * Math.exp(-(nm - 200) / 60) + (r() - 0.5) * 0.004;
        pts.push(`${nm}, ${a.toFixed(5)}`);
      }
      return `##TITLE=Mill Creek, nitrate screen, 2025-06-14\n##JCAMP-DX=4.24\n##DATA TYPE=UV/VIS SPECTRUM\n##ORIGIN=Kestrel Bay community lab\n##OWNER=public domain (mock)\n##SPECTROMETER/DATA SYSTEM=Benchtop UV-Vis\n##PATH LENGTH=1 CM\n##XUNITS=NANOMETERS\n##YUNITS=ABSORBANCE\n##FIRSTX=200\n##LASTX=400\n##NPOINTS=${pts.length}\n##XYPOINTS=(XY..XY)\n${pts.join('\n')}\n##END=`;
    },
  },
  {
    id: 'openaq', label: 'OpenAQ measurements (JSON)', family: 'Air', ext: ['.json'],
    spec: { name: 'OpenAQ API v3', url: 'https://docs.openaq.org/' },
    about: 'Open air quality data from government monitors and low-cost sensors around the world, as JSON: a value, its parameter and units, a period and coordinates.',
    detect: (text) => (/"parameter"\s*:\s*\{[^}]*"units"/.test(text.slice(0, 3000)) && /"results"/.test(text.slice(0, 200)) ? 15 : 0),
    parse(text) {
      let j; try { j = JSON.parse(text); } catch { return { records: [], error: 'The JSON didn’t parse.' }; }
      const site = j.meta?.location ?? 'Air monitor', sites = {};
      const records = (j.results ?? []).map((m) => { if (m.coordinates && !sites[site]) sites[site] = { geo: { lat: m.coordinates.latitude, lng: m.coordinates.longitude, precision: 'exact' }, kind: 'air' }; const p = paramOf(m.parameter?.name); return p && { site, param: p, unit: (m.parameter?.units ?? '').replace('ug/m3', 'µg/m³'), t: isoOf(new Date(m.period?.datetimeFrom?.utc ?? m.date?.utc)), v: Number(m.value) }; }).filter(Boolean);
      return { records, sites, meta: { location: site } };
    },
    mock(seed = 37) {
      const r = rng(seed), results = [];
      const start = Date.UTC(2025, 6, 20, 4);
      for (let i = 0; i < 24 * 10; i++) {
        const d = new Date(start + i * 3600e3), hr = (d.getUTCHours() + 20) % 24;
        const smoke = i > 110 && i < 160 ? 55 * Math.sin(((i - 110) / 50) * Math.PI) : 0;
        results.push({ value: round(wave('pm25', doy(d), hr, r) + smoke, 1), parameter: { name: 'pm25', units: 'µg/m³' }, period: { datetimeFrom: { utc: isoOf(d) } }, coordinates: { latitude: 43.301, longitude: -61.196 } });
      }
      return JSON.stringify({ meta: { name: 'openaq-api', location: 'Kestrel Bay school (sensor)' }, results }, null, 1);
    },
  },
  {
    id: 'purpleair', label: 'PurpleAir sensor (CSV)', family: 'Air', ext: ['.csv'],
    spec: { name: 'PurpleAir API history fields', url: 'https://api.purpleair.com/' },
    about: 'Low-cost air sensors with two laser counters (A and B). Agreement between the two channels is a quick quality check, which EoViz shows.',
    detect: (text) => (/pm2\.5_atm_a|pm2\.5_atm/.test(text.slice(0, 400)) ? 12 : 0),
    parse(text) {
      const rows = parseCsv(text), head = header(rows), t = col(head, 'time_stamp'), a = col(head, 'pm2.5_atm_a'), b = col(head, 'pm2.5_atm_b'), hum = col(head, 'humidity'), tmp = col(head, 'temperature');
      const records = [];
      for (const r of rows.slice(1)) {
        const ts = /^\d+$/.test(r[t]) ? isoOf(new Date(+r[t] * 1000)) : timeOf(r[t]);
        const va = num(r[a]), vb = num(r[b]);
        records.push({ site: 'PurpleAir sensor', param: 'pm25', unit: 'µg/m³', t: ts, v: Number.isFinite(vb) ? (va + vb) / 2 : va, flag: Number.isFinite(vb) && Math.abs(va - vb) > Math.max(5, 0.7 * (va + vb) / 2) ? 'q' : null });
        if (hum >= 0) records.push({ site: 'PurpleAir sensor', param: 'rh', unit: '%', t: ts, v: num(r[hum]) });
        if (tmp >= 0) records.push({ site: 'PurpleAir sensor', param: 'airtemp', unit: '°F', t: ts, v: num(r[tmp]) });
      }
      return { records, meta: { channels: 'A and B averaged; disagreement flagged' } };
    },
    mock(seed = 41) {
      const r = rng(seed), lines = ['time_stamp,humidity,temperature,pm2.5_atm_a,pm2.5_atm_b'];
      const start = Date.UTC(2025, 9, 1);
      for (let i = 0; i < 24 * 7 * 2; i++) {
        const d = new Date(start + i * 1800e3), hr = d.getUTCHours();
        const v = wave('pm25', doy(d), hr, r), drift = i > 400 ? 9 * r() : 0;
        lines.push([Math.floor(d / 1000), Math.round(wave('rh', doy(d), hr, r)), Math.round(wave('airtemp', doy(d), hr, r) * 9 / 5 + 32), round(v + (r() - 0.5), 1), round(v + (r() - 0.5) + drift, 1)].join(','));
      }
      return lines.join('\n');
    },
  },
  {
    id: 'lab-edd', label: 'Lab results (EDD)', family: 'Lab instruments', ext: ['.csv'],
    spec: { name: 'Electronic data deliverable, EQuIS / ESdat style', url: 'https://www.earthsoft.com/products/equis/' },
    about: 'What an accredited lab sends back: one row per analyte per sample, with the method detection limit (MDL) and a qualifier. Common for soil and for metals in water.',
    detect: (text) => (/Analyte/i.test(text.slice(0, 400)) && /MDL|Qualifier/i.test(text.slice(0, 400)) ? 12 : 0),
    parse(text) {
      const rows = parseCsv(text), head = header(rows);
      const c = (...n) => col(head, ...n);
      const [sid, site, depth, date, an, res, units, mdl, q, lat, lng] = [c('SampleID'), c('Site'), c('Depth_cm'), c('SampleDate', 'Date'), c('Analyte'), c('Result'), c('Units'), c('MDL'), c('Qualifier'), c('Latitude'), c('Longitude')];
      const records = [], sites = {};
      for (const r of rows.slice(1)) {
        const s = r[site] || r[sid];
        if (lat >= 0 && !sites[s]) sites[s] = { geo: { lat: num(r[lat]), lng: num(r[lng]), precision: 'area' }, kind: 'soil' };
        const raw = String(r[an]).toLowerCase();
        const p = raw === 'ph' ? 'soilph' : raw.startsWith('nitrate') ? 'soilno3' : paramOf(r[an]);
        if (!p) continue;
        const qual = String(r[q] ?? '').toUpperCase();
        records.push({ site: s, param: p, unit: r[units] || unitOf('', p), t: timeOf(r[date]), v: num(r[res]) || (qual === 'U' ? num(r[mdl]) : NaN), flag: qual === 'U' ? '<' : qual === 'J' ? 'e' : null, depth: depth >= 0 ? num(r[depth]) : null });
      }
      return { records: records.filter((x) => x.t), sites, meta: { lab: 'mock lab' } };
    },
    mock(seed = 43) {
      const r = rng(seed), lines = ['SampleID,Site,Latitude,Longitude,Depth_cm,SampleDate,Analyte,Result,Units,MDL,Qualifier,Method'];
      const gardens = [['Harbour Street garden', 43.299, -61.192, 1.0], ['School garden', 43.306, -61.205, 0.4], ['Old rail yard plots', 43.294, -61.181, 2.6]];
      let k = 1;
      for (const [g, la, lo, lead] of gardens) for (const yr of [2023, 2024, 2025]) for (const dcm of [0, 15]) {
        const id = `KB-${yr}-${pad(k++)}`, d = `${yr}-05-${pad(10 + (k % 9))}`;
        const pb = Math.round(lead * 90 * (dcm ? 0.7 : 1) * (1 - (yr - 2023) * 0.12) + r() * 20);
        lines.push([id, g, la, lo, dcm, d, 'pH', round(6.2 + r() * 1.2, 1), 'pH', '', '', 'EPA 9045D'].join(','));
        lines.push([id, g, la, lo, dcm, d, 'Organic matter', round(3 + r() * 5, 1), '%', '0.1', '', 'LOI'].join(','));
        lines.push([id, g, la, lo, dcm, d, 'Lead', pb < 8 ? '' : pb, 'mg/kg', '8', pb < 8 ? 'U' : '', 'EPA 6020B'].join(','));
        lines.push([id, g, la, lo, dcm, d, 'Nitrate-N', round(4 + r() * 18, 1), 'mg/kg', '0.5', r() < 0.15 ? 'J' : '', 'KCl extract'].join(','));
      }
      return lines.join('\n');
    },
  },
  {
    id: 'geojson', label: 'Sites (GeoJSON)', family: 'Places', ext: ['.geojson', '.json'],
    spec: { name: 'GeoJSON, RFC 7946', url: 'https://www.rfc-editor.org/rfc/rfc7946' },
    about: 'A list of monitoring sites as points, from a GIS. Adds sites only; readings come in their own files. The same file can be a data layer in Place.',
    detect: (text) => (/"FeatureCollection"/.test(text.slice(0, 400)) ? 14 : 0),
    parse(text) {
      let j; try { j = JSON.parse(text); } catch { return { records: [], error: 'The JSON didn’t parse.' }; }
      const sites = {};
      for (const f of j.features ?? []) if (f.geometry?.type === 'Point') { const nm = f.properties?.name ?? f.properties?.site ?? `Site ${Object.keys(sites).length + 1}`; sites[nm] = { geo: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], precision: 'exact' }, kind: f.properties?.kind ?? 'water' }; }
      return { records: [], sites, meta: { count: Object.keys(sites).length } };
    },
    mock() {
      const f = (name, lng, lat, kind) => ({ type: 'Feature', properties: { name, kind }, geometry: { type: 'Point', coordinates: [lng, lat] } });
      return JSON.stringify({ type: 'FeatureCollection', features: [f('Mill Creek at the mill', -61.214, 43.312, 'water'), f('Mill Creek at the bridge', -61.201, 43.305, 'water'), f('Wharf outflow', -61.188, 43.297, 'water'), f('Harbour buoy', -61.176, 43.289, 'water'), f('Kestrel Bay school (sensor)', -61.196, 43.301, 'air')] }, null, 1);
    },
  },
];

export const formatById = (id) => FORMATS.find((f) => f.id === id) ?? null;
export const FAMILIES = [...new Set(FORMATS.map((f) => f.family))];

/** The format a file most likely is: by content first, then by its extension. */
export function detectFormat(text, name = '') {
  let best = null, score = 0;
  for (const f of FORMATS) {
    const s = f.detect(String(text ?? ''), name);
    if (s > score) { best = f; score = s; }
  }
  return best ?? FORMATS[0];
}

/** Read a file's text: { format, parsed }. */
export function readFile(text, name = '', formatId = null) {
  const format = formatId ? formatById(formatId) : detectFormat(text, name);
  let parsed;
  try { parsed = format.parse(String(text ?? ''), name); } catch (err) { parsed = { records: [], error: `The file couldn’t be read as ${format.label}: ${err.message}` }; }
  return { format, parsed: { records: [], sites: {}, meta: {}, ...parsed } };
}

/** A mock file for a format: { name, text }. */
export function mockFile(id) {
  const f = formatById(id);
  const ext = f.id === 'cdl' ? '.cdl' : f.ext[0];
  return { name: `mock-${f.id}${ext}`, text: f.mock() };
}

/** Write series out as DataStream rows, for sharing with the national hub. */
export function toDataStream(doc, seriesIds, datasetName = 'Dashi EoViz export') {
  const NAMES = { temp: 'Temperature, water', do: 'Dissolved oxygen (DO)', ph: 'pH', cond: 'Specific conductance', turb: 'Turbidity', ecoli: 'Escherichia coli', no3: 'Nitrate', tp: 'Total Phosphorus, mixed forms', chla: 'Chlorophyll a', sal: 'Salinity', level: 'Water level' };
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s ?? ''));
  const out = ['DatasetName,MonitoringLocationID,MonitoringLocationName,MonitoringLocationLatitude,MonitoringLocationLongitude,ActivityType,ActivityStartDate,ActivityStartTime,CharacteristicName,ResultValue,ResultUnit,ResultDetectionCondition'];
  for (const id of seriesIds) {
    const s = doc.series[id], site = doc.sites[s?.siteId];
    if (!s || !site || !NAMES[s.param]) continue;
    for (const [t, v, flag] of s.points) out.push([datasetName, site.id, site.name, site.geo?.lat ?? '', site.geo?.lng ?? '', 'Sample-Routine', String(t).slice(0, 10), String(t).slice(11, 16), NAMES[s.param], flag === '<' ? '' : v, s.unit, flag === '<' ? 'Not Detected' : ''].map(q).join(','));
  }
  return out.join('\n');
}
