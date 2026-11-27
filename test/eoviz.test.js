// EoViz stage 1: file types and their mocks, the vessel workflow, the viz finder, partners and the Kestrel demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGINS } from '../src/plugins.js';
import { DEFAULT_PLANS, PLAN_PLUGINS } from '../src/platform/plans.js';
import { FORMATS, mockFile, readFile, detectFormat, toDataStream } from '../src/eoviz/formats.js';
import { blankEco, migrateEco, addParsed, removeFile, matchBottles, paramOf, judge, cleanUnit } from '../src/eoviz/model.js';
import { datasetFromParsed, shapeOf, suggest, VIZ } from '../src/eoviz/viz.js';
import { seedKestrelEco } from '../src/eoviz/kestrel.js';

test('EoViz is a registered, experimental plugin that owns only the eco document', () => {
  const p = PLUGINS.find((x) => x.id === 'eoviz');
  assert.ok(p);
  assert.deepEqual(p.owns, ['eco']);
  assert.equal(p.experimental, true);
  assert.equal(p.defaultOff, true);
  assert.ok(PLAN_PLUGINS.includes('eoviz'));
  assert.equal(DEFAULT_PLANS.free.plugins.eoviz, false);
  assert.equal(DEFAULT_PLANS.basic.plugins.eoviz, true);
});

test('every format has a spec, and its mock is detected as itself and reads', () => {
  for (const f of FORMATS) {
    assert.ok(f.spec?.name && /^https:\/\//.test(f.spec.url), `${f.id} has a spec link`);
    const m = mockFile(f.id);
    assert.equal(detectFormat(m.text, m.name).id, f.id, `${f.id} mock detected`);
    const { parsed } = readFile(m.text, m.name);
    const some = parsed.records.length || Object.keys(parsed.sites).length || parsed.xy || parsed.grid;
    assert.ok(some, `${f.id} mock reads to something`);
    assert.ok(!parsed.error, `${f.id}: ${parsed.error}`);
  }
});

test('parameters are found from headers, units are cleaned, and guides judge', () => {
  assert.equal(paramOf('DO mg/L'), 'do');
  assert.equal(paramOf('Temp, °C (LGR S/N: 2045)'), 'temp');
  assert.equal(paramOf('NPOC'), 'doc');
  assert.equal(cleanUnit('deg C'), '°C');
  assert.equal(cleanUnit('None'), '');
  assert.equal(judge('do', 5), 'low');
  assert.equal(judge('ecoli', 600), 'high');
  assert.equal(judge('ph', 7.4), 'ok');
  assert.equal(judge('temp', 30), null);
});

test('the vessel workflow: lab samples take their depth and time from the bottle file', () => {
  const doc = blankEco();
  const btl = readFile(mockFile('btl').text, 'cast.btl').parsed;
  assert.equal(btl.meta.bottles.length, 12);
  addParsed(doc, btl, { name: 'cast.btl', format: 'btl' });
  const lab = readFile(mockFile('toc').text, 'run.txt').parsed;
  assert.equal(lab.meta.skipped, 5, 'standards, the blank and the excluded injection are left out');
  assert.ok(lab.records.every((r) => r.depth == null));
  const m = matchBottles(doc, lab);
  assert.equal(m.unmatched, 0);
  assert.equal(m.matched, lab.records.length);
  assert.ok(lab.records.every((r) => r.depth != null && r.t.startsWith('2025-08-14')));
  assert.ok(lab.records.some((r) => r.flag === 'q'), 'a high-CV sample is questioned');
  assert.equal(shapeOf(datasetFromParsed(lab)).kind, 'profile');
  // Without a bottle file there is nothing to match.
  assert.equal(matchBottles(blankEco(), readFile(mockFile('toc').text, 'run.txt').parsed).matched, 0);
});

test('the finder names each mock’s shape and puts the right chart first', () => {
  const best = (id) => { const m = mockFile(id); return suggest(shapeOf(datasetFromParsed(readFile(m.text, m.name).parsed)))[0]?.viz.id; };
  assert.equal(best('cnv'), 'profile');
  assert.equal(best('cdl'), 'depthtime');
  assert.equal(best('jcamp'), 'spectrum');
  assert.equal(best('exo'), 'bench');
  assert.equal(best('waterml'), 'line');
  const geo = mockFile('geojson');
  assert.deepEqual(suggest(shapeOf(datasetFromParsed(readFile(geo.text, geo.name).parsed))), []);
  for (const v of VIZ) assert.ok(['Charts', 'Sketchbook'].includes(v.family) && v.about && typeof v.draw === 'function');
  assert.ok(VIZ.some((v) => v.id === 'process'));
});

test('files come in and go out: series, sites, removal and DataStream export', () => {
  const doc = blankEco();
  const m = mockFile('datastream');
  const { fileId, seriesIds } = addParsed(doc, readFile(m.text, m.name).parsed, { name: m.name, format: 'datastream', partnerId: 'p1' });
  assert.ok(seriesIds.length > 0);
  assert.equal(Object.keys(doc.sites).length, 3);
  assert.ok(Object.values(doc.sites).every((s) => s.partnerId === 'p1'));
  const csv = toDataStream(doc, seriesIds);
  assert.ok(csv.split('\n').length > 50 && csv.startsWith('DatasetName,'));
  removeFile(doc, fileId);
  assert.equal(Object.keys(doc.series).length, 0);
  assert.equal(Object.keys(doc.files).length, 0);
  assert.deepEqual(migrateEco(null).partners, {});
});

test('Kestrel’s demo: two separate partners, the vessel’s carbon at its depths', () => {
  const doc = seedKestrelEco();
  assert.deepEqual(Object.keys(doc.partners).sort(), ['streamkeepers', 'vessel']);
  assert.equal(doc.partners.streamkeepers.share, 'open');
  assert.equal(doc.partners.vessel.share, 'own');
  assert.ok(Object.values(doc.files).every((f) => doc.partners[f.partnerId]));
  const toc = Object.values(doc.files).find((f) => f.format === 'toc');
  assert.ok(toc.seriesIds.every((id) => doc.series[id].depth != null));
  assert.ok(JSON.stringify(doc).length < 600_000, 'the demo document stays small');
});
