import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observations, variablesOf, sigma0, oxygenSat, readGlodap, readExchange, readFloat, readMooring, detectOcean, mockLabradorSea, mockDavisStrait, mockFloats, mockGlodapCsv, CONVECTION } from '../src/eoviz/ocean.js';
import { setsOf, yearsOf, queryOf, blankWindow, vary, linkSlice, moveWindow, ordered, starters, titleOf, formsFor, fitLine } from '../src/eoviz/windows.js';
import { layersOf, projector } from '../src/eoviz/studio.js';
import { LABSEA_LINE, DAVIS_ARRAY, ecoFor } from '../src/platform/clients/halcyon.js';
import { sharedEco } from '../src/platform/network.js';

const line = mockLabradorSea(LABSEA_LINE);
const moor = mockDavisStrait(DAVIS_ARRAY);
const floats = mockFloats(2);
for (const c of Object.values(moor)) c.partnerId = 'p-davis';
for (const c of Object.values(floats)) c.partnerId = 'p-floats';
const all = { ...line, ...moor, ...floats };

test('derived values: σθ and oxygen saturation are in the right place for Labrador Sea Water', () => {
  assert.ok(Math.abs(sigma0(34.87, 3.3) - 27.75) < 0.02);
  assert.ok(Math.abs(oxygenSat(3.3, 34.87) - 320.5) < 1);
  assert.ok(Math.abs(sigma0(35, 0) - 28.106) < 0.01, 'EOS-80 check value at S 35, T 0');
});

test('observations: a box, a time slice, a depth band, and flags that leave bad values out', () => {
  assert.equal(Object.keys(line).length, Object.keys(CONVECTION).length, 'a cruise a year');
  const lsw = observations(line, { depth: [1000, 2000], from: '2015-01-01', to: '2015-12-31' });
  assert.ok(lsw.length > 20 && lsw.every((r) => r.depth >= 1000 && r.depth <= 2000 && r.date.startsWith('2015')));
  const c = line['col-hal-2015'];
  const bad = c.flags.findIndex((f) => f[c.cols.indexOf('oxy')] === '4');
  assert.ok(bad >= 0, 'the mock has a bad oxygen somewhere');
  const r = observations({ x: { ...c, rows: [c.rows[bad]], flags: [c.flags[bad]] } }, {})[0];
  assert.equal(r.oxy, null, 'a bad oxygen is left out');
  assert.ok(r.aou == null, 'and so is its AOU');
  const kept = observations({ x: { ...c, rows: [c.rows[bad]], flags: [c.flags[bad]] } }, { keep: ['2', '3', '4'] })[0];
  assert.ok(Number.isFinite(kept.oxy), 'the value is still there for anyone who asks for all flags');
  assert.ok(variablesOf(line).includes('sigma0') && variablesOf(line).includes('aou'));
  assert.equal(observations(line, { months: [1] }).length, 0, 'no cruise in January');
});

test('the mock tells a story: more oxygen and the carbon trend in Labrador Sea Water', () => {
  const mean = (year, v) => { const l = observations(line, { depth: [1000, 2000], from: `${year}-01-01`, to: `${year}-12-31` }).map((r) => r[v]).filter(Number.isFinite); return l.reduce((a, b) => a + b, 0) / l.length; };
  assert.ok(mean(2015, 'oxy') > mean(2022, 'oxy'), 'a strong winter leaves more oxygen than a weak one');
  const trend = fitLine(Object.keys(CONVECTION).map((y) => [Number(y), mean(y, 'dic')]));
  assert.ok(trend.slope > 0.5 && trend.slope < 1.6, `DIC rises about a µmol/kg a year (${trend.slope.toFixed(2)})`);
});

test('readers: GLODAP, WOCE exchange, floats and moorings keep their flags', () => {
  const csv = mockGlodapCsv(line['col-hal-2020']);
  assert.equal(detectOcean(csv).id, 'glodap');
  const [g] = readGlodap(csv);
  assert.equal(g.rows.length, line['col-hal-2020'].rows.length);
  assert.ok(g.cite.license === 'CC BY 4.0');
  const ex = ['BOTTLE,20260101TEST', '# EXPOCODE = HAL20260505', 'EXPOCODE,STNNBR,CASTNO,DATE,TIME,LATITUDE,LONGITUDE,CTDPRS,CTDTMP,SALNTY,SALNTY_FLAG_W,OXYGEN,OXYGEN_FLAG_W,TCARBN,TCARBN_FLAG_W',
    ',,,,,,,DBAR,ITS-90,PSS-78,,UMOL/KG,,UMOL/KG,', 'HAL20260505,7,1,20260512,0830,56.5,-52.8,1500,3.21,34.86,2,296.2,3,2168.4,2', 'HAL20260505,7,1,20260512,0830,56.5,-52.8,2000,3.05,34.89,2,-999,9,2170.1,4', 'END_DATA'].join('\n');
  assert.equal(detectOcean(ex).id, 'exchange');
  const [e] = readExchange(ex);
  assert.equal(e.rows.length, 2);
  assert.equal(e.meta.expocode, 'HAL20260505');
  const o = observations({ e: { ...e, id: 'e' } }, {});
  assert.equal(o[0].oxy, null, 'a questionable oxygen is out by default');
  assert.equal(o[1].dic, null, 'a bad carbon is out');
  const fl = ['PLATFORM_NUMBER,CYCLE_NUMBER,DATE,LATITUDE,LONGITUDE,PRES,TEMP,TEMP_QC,PSAL,PSAL_QC,DOXY,DOXY_QC', '4902100,1,2026-02-01,58.1,-52.2,10,3.3,1,34.82,1,305,1', '4902100,1,2026-02-01,58.1,-52.2,1400,3.31,1,34.83,4,304,8'].join('\n');
  const [f] = readFloat(fl);
  assert.equal(f.kind, 'track');
  assert.equal(f.flags[1], '240', 'Argo QC 4 → WOCE 4; 8 (estimated) → 0');
  const mo = ['# mooring: DS-C1', '# lat: 66.75', '# lon: -58.8', 'time,depth,temp,sal,oxy,oxy_flag', '2025-01-01,100,0.4,33.5,320,2', '2025-01-02,100,0.5,33.5,280,4'].join('\n');
  const [m] = readMooring(mo);
  assert.equal(m.kind, 'mooring');
  assert.equal(m.rows[0][1], 66.75);
});

test('windows: sets, chips, vary, link, arrange, starters', () => {
  const sets = setsOf(all);
  assert.deepEqual(sets.map((s) => s.kind).sort(), ['cruise', 'mooring', 'track']);
  const ls = sets.find((s) => s.kind === 'cruise');
  assert.equal(yearsOf(all, ls.ids).length, Object.keys(CONVECTION).length);
  assert.deepEqual(formsFor('mooring').map((f) => f.id), ['ts', 'timeseries', 'scatter', 'map']);
  const w = blankWindow(ls, { slice: { kind: 'year', year: 2015 }, link: true });
  assert.equal(queryOf(w, ls).from, '2015-01-01');
  assert.match(titleOf(w, ls), /Section: Oxygen, Labrador Sea line, 2015/);
  const next = vary(w, 'time', ls, all);
  assert.equal(next.slice.year, 2016);
  assert.notEqual(next.id, w.id);
  assert.notEqual(vary(w, 'query', ls, all).var, 'oxy');
  const other = { ...blankWindow(ls), id: 'b', link: true, form: 'ts' };
  const linked = linkSlice({ [w.id]: { ...w, slice: { kind: 'year', year: 2022 } }, b: other }, w.id);
  assert.equal(linked.b.slice.year, 2022, 'a linked window follows');
  const moved = moveWindow({ a: { id: 'a', order: 0 }, b: { id: 'b', order: 1 }, c: { id: 'c', order: 2 } }, 'c', -1);
  assert.deepEqual(ordered(moved).map((x) => x.id), ['a', 'c', 'b']);
  assert.ok(starters(sets, all).length >= 8);
});

test('the studio: a curtain and a bottle cloud for a section, ribbons for floats, a helix for moorings', () => {
  const sets = setsOf(all);
  const ls = sets.find((s) => s.kind === 'cruise'); const ms = sets.find((s) => s.kind === 'mooring'); const fs = sets.find((s) => s.kind === 'track');
  const wins = [blankWindow(ls, { id: 'w1', studio: true, slice: { kind: 'year', year: 2024 } }), blankWindow(ms, { id: 'w2', studio: true, var: 'temp' }), blankWindow(fs, { id: 'w3', studio: true, var: 'temp' }), blankWindow(ls, { id: 'w4', studio: false })];
  const layers = layersOf(wins, all);
  assert.deepEqual(layers.map((l) => l.kind), ['cloud', 'curtain', 'helix', 'ribbons']);
  const curtain = layers.find((l) => l.kind === 'curtain');
  assert.equal(curtain.items.length, LABSEA_LINE.length, 'a station each');
  assert.ok(layers.find((l) => l.kind === 'helix').items.length === DAVIS_ARRAY.length * 2, 'two depths per mooring');
  const P = projector({ lat: 60, lon: -55 }, 1);
  assert.deepEqual(P([60, -55, 2000]), [0, -2, -0]);
});

test('the Labrador Sea lab’s windows reach the moorings and floats its network shares', () => {
  const lab = ecoFor('org-labsea');
  const davis = sharedEco(ecoFor('org-davis'));
  const fl = sharedEco(ecoFor('org-floats'));
  assert.ok(Object.keys(davis.collections).length === DAVIS_ARRAY.length && Object.keys(fl.collections).length === 4, 'network partners share their collections');
  const reach = { ...lab.collections, ...davis.collections, ...fl.collections };
  const keys = new Set(setsOf(reach).map((s) => s.key));
  for (const w of Object.values(lab.windows)) assert.ok(keys.has(w.set), `${w.id} finds ${w.set}`);
  assert.ok(Object.values(lab.windows).filter((w) => w.studio).length >= 3);
  assert.ok(Object.values(lab.collections).every((c) => c.meta.mock && /Mock data/.test(c.cite.text)), 'mock data says so');
});
