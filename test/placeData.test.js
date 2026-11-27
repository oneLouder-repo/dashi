// Place stage 2: data layers from CSV and GeoJSON files, and drawings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, featuresFromCsv, featuresFromGeoJSON, cleanFeature, featureName, pointsOfFeatures, migratePlace, newDataId, MAX_FEATURES } from '../src/place/model.js';

test('parseCsv handles quotes, commas inside quotes, CRLF and semicolons', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('featuresFromCsv finds the latitude and longitude columns and keeps the rest as properties', () => {
  const r = featuresFromCsv('Name,Latitude,Longitude,Notes\nHall,44.6,-63.5,ok\nBad,abc,1,x\nFar,95,0,x\n');
  assert.equal(r.features.length, 1);
  assert.equal(r.skipped, 2);
  assert.equal(r.nameCol, 'Name');
  assert.deepEqual(r.features[0].geometry.coordinates, [-63.5, 44.6]);
  assert.deepEqual(r.features[0].properties, { Name: 'Hall', Notes: 'ok' });
  assert.ok(featuresFromCsv('name,where\nx,y').error, 'no lat/lng columns is an error, not a crash');
});

test('featuresFromGeoJSON keeps drawable geometries and drops the rest', () => {
  const fc = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-63, 44] }, properties: { name: 'A', nested: { no: 1 } } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-63, 44], [-62, 45]] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [500, 44] }, properties: {} },
    { type: 'Feature', geometry: null, properties: {} },
  ] };
  const r = featuresFromGeoJSON(fc);
  assert.equal(r.features.length, 2);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.features[0].properties, { name: 'A' }, 'nested objects are dropped');
  assert.equal(featureName(r.features[0]), 'A');
  assert.equal(featureName(r.features[1]), 'Line');
  assert.equal(pointsOfFeatures(r.features).length, 3);
  assert.equal(cleanFeature({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1]]] }), null, 'a ring needs four positions');
});

test('data layers survive migration, get colours, and are capped', () => {
  const many = Array.from({ length: MAX_FEATURES + 5 }, (_, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, (i % 80)] }, properties: {} }));
  const d = migratePlace({ data: { a: { name: 'Halls', features: many }, b: null } });
  assert.deepEqual(Object.keys(d.data), ['a']);
  assert.equal(d.data.a.features.length, MAX_FEATURES);
  assert.ok(d.data.a.colour);
  assert.equal(d.data.a.on, true);
  assert.equal(newDataId(d, 'Halls.csv'), 'data-halls');
});
