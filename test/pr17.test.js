// Alpha 0.3 PR 17: the studio's slide track, a session from an audio file, the roadmap's Fit window, Podcasts home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSlides, sampleCount, slideAt, slideSpans, addSlide, updateSlide, removeSlide, seedSampleSlides, sessionFromFile } from '../src/podcasts/studio/slides.js';
import { podcastRoute, blankPodcasts } from '../src/platform/podcasts.js';
import { mergeRegistry } from '../src/platform/pluginRegistry.js';

test('a 45-minute show gets 30 to 50 sample slides, in order, inside the audio', () => {
  const s = sampleSlides(45 * 60);
  assert.ok(s.length >= 30 && s.length <= 50);
  assert.equal(s[0].at, 0);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].at > s[i - 1].at);
  assert.ok(s.at(-1).at < 45 * 60);
  assert.deepEqual(sampleSlides(45 * 60), s, 'the same deck every time');
  assert.ok(sampleCount(12) >= 3 && sampleCount(12) <= 30);
});

test('the slide showing is the last one started', () => {
  const s = [{ id: 'a', at: 0 }, { id: 'b', at: 10 }, { id: 'c', at: 20 }];
  assert.equal(slideAt(s, 5).id, 'a');
  assert.equal(slideAt(s, 10).id, 'b');
  assert.equal(slideAt(s, 99).id, 'c');
  assert.equal(slideAt([{ id: 'x', at: 3 }], 1), null);
  assert.deepEqual(slideSpans(s, 30).map((x) => x.until), [10, 20, 30]);
});

test('slides add, retime and go', () => {
  let s = addSlide([], 12.34, { title: 'Hi' });
  s = addSlide(s, 2);
  assert.deepEqual(s.map((x) => x.at), [2, 12.3]);
  s = updateSlide(s, s[1].id, { at: 1 });
  assert.equal(s[0].title, 'Hi');
  assert.equal(removeSlide(s, s[0].id).length, 1);
});

test('the longest podBeam file gets a sample deck, once', () => {
  const doc = { files: { a: { id: 'a', duration: 30, tags: ['podBeam'] }, b: { id: 'b', duration: 2700, tags: ['podBeam'] }, c: { id: 'c', duration: 9000, tags: [] } } };
  assert.equal(seedSampleSlides(doc), true);
  assert.ok(doc.files.b.slides.length >= 30);
  assert.equal(doc.files.a.slides, undefined);
  assert.equal(seedSampleSlides(doc), false);
});

test('a file opens in the studio as a session with its slides', () => {
  const p = sessionFromFile({ id: 'f1', name: 'Show', mediaId: 'm1', duration: 100, slides: [{ id: 's', at: 0, title: 'x' }] });
  assert.equal(p.fromFile, 'f1');
  const clips = Object.values(p.clips);
  assert.equal(clips.length, 1);
  assert.deepEqual(clips[0].source, { mediaId: 'm1' });
  assert.equal(clips[0].length, 100);
  assert.equal(p.slides.length, 1);
  assert.equal(p.lastId, undefined);
});

test('Podcasts opens on its home', () => {
  assert.equal(podcastRoute('', blankPodcasts()).scope, 'home');
  assert.equal(podcastRoute('#episodes', blankPodcasts()).scope, 'episodes');
});

test('Ecosystem: a stored "Ecosystem Mapper" takes the new name and version', () => {
  const r = mergeRegistry({ plugins: { mapper: { id: 'mapper', name: 'Ecosystem Mapper', short: 'Mapper', version: '1.0.0', changelog: [{ version: '1.0.0', notes: 'old' }] } } });
  assert.equal(r.plugins.mapper.name, 'Ecosystem');
  assert.equal(r.plugins.mapper.version, '1.1.0');
  assert.equal(r.plugins.mapper.changelog[0].version, '1.1.0');
});
