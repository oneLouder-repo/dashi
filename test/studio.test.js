import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/podcasts/studio/project.js';
import { podcastRoute, migratePodcasts } from '../src/platform/podcasts.js';

const withClip = (opts = {}) => {
  const p = P.newProject({ template: 'interview' });
  const host = p.tracks[0].id;
  const out = P.addClip(p, { trackId: host, source: { mediaId: 'm1' }, name: 'Intro', start: 0, length: 10, sourceLength: 10, ...opts });
  return { p: out, id: out.lastId, host };
};

test('a session starts from a template', () => {
  const p = P.newProject({ template: 'panel', title: 'Panel' });
  assert.deepEqual(p.tracks.map((t) => t.kind), ['voice', 'voice', 'voice', 'music', 'fx']);
  assert.equal(p.tracks.find((t) => t.kind === 'music').duck, true);
  assert.equal(P.projectLength(p), 0);
});

test('split, trim and move keep the sound lined up', () => {
  const { p, id } = withClip();
  const { project, rightId } = P.splitClip(p, id, 4);
  assert.equal(project.clips[id].length, 4);
  assert.deepEqual([project.clips[rightId].start, project.clips[rightId].offset, project.clips[rightId].length], [4, 4, 6]);
  // Trimming the left edge moves where the sound starts, never before the source begins.
  const t = P.trimClip(project, rightId, 'start', 2);
  assert.deepEqual([t.clips[rightId].start, t.clips[rightId].offset], [2, 2]);
  assert.deepEqual([P.trimClip(project, rightId, 'start', -5).clips[rightId].offset], [0]);
  const t2 = P.trimClip(project, rightId, 'end', 99);
  assert.equal(P.clipEnd(t2.clips[rightId]), 10);
  const m = P.moveClip(project, rightId, 20);
  assert.equal(m.clips[rightId].start, 20);
  assert.equal(p.clips[id].length, 10, 'edits never change the old project (undo)');
});

test('ripple delete takes time out of every track and closes the gap', () => {
  let { p, id } = withClip();
  p = P.addClip(p, { trackId: p.tracks[2].id, source: { url: 'music.mp3' }, name: 'Bed', start: 0, length: 12, sourceLength: 60 });
  p = P.addMarker(p, 8, 'Second half');
  const out = P.rippleDelete(p, 3, 5);
  assert.equal(P.projectLength(out), 10);
  const host = P.clipsOn(out, p.tracks[0].id);
  assert.deepEqual(host.map((c) => [c.start, c.offset, c.length]), [[0, 0, 3], [3, 5, 5]]);
  assert.equal(out.markers[0].at, 6);
  assert.ok(p.clips[id]);
});

test('silence is found, and long pauses tighten', () => {
  const sr = 1000;
  const s = new Float32Array(sr * 6);
  const loud = (a, b) => { for (let i = a * sr; i < b * sr; i++) s[i] = Math.sin(i) * 0.5; };
  loud(0, 1); loud(3, 4); loud(4.2, 5);   // pauses: 1–3 (2 s), 4–4.2 (short)
  const quiet = P.findSilences(s, sr, { minLength: 0.7 });
  assert.equal(quiet.length, 2);          // 1–3 and the tail 5–6
  assert.ok(Math.abs(quiet[0].from - 1) < 0.05 && Math.abs(quiet[0].to - 3) < 0.05);
  const { p, id } = withClip({ length: 6, sourceLength: 6 });
  const { project, removed } = P.tightenPauses(p, id, quiet, { keep: 0.5 });
  assert.ok(Math.abs(removed - 2) < 0.1, String(removed));   // 1.5 s from the long pause, 0.5 s from the tail
  assert.ok(Math.abs(P.projectLength(project) - (6 - removed)) < 0.01);
});

test('voices make the music duck, mute and solo decide what is heard', () => {
  let { p, id, host } = withClip();
  const spans = P.voiceSpans(p, { [id]: [{ from: 4, to: 6 }] });
  assert.deepEqual(spans, [[0, 4], [6, 10]]);
  p = P.updateTrack(p, host, { muted: true });
  assert.deepEqual(P.voiceSpans(p, {}), []);
  p = P.updateTrack(p, p.tracks[1].id, { solo: true });
  assert.deepEqual([...P.audible(p)], [p.tracks[1].id]);
});

test('levels, WAV files and the clock', () => {
  assert.ok(Math.abs(P.normaliseGain(Float32Array.from([0.25, -0.5]), 0) - 2) < 1e-9);
  const wav = new DataView(P.encodeWav([Float32Array.from([0, 1, -1])], 8000));
  assert.equal(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)), 'RIFF');
  assert.equal(wav.byteLength, 44 + 6);
  assert.equal(wav.getInt16(46, true), 32767);
  assert.equal(P.clock(65.34), '1:05.3');
  assert.equal(P.clock(3725, { tenths: false }), '1:02:05');
  assert.equal(P.rulerStep(40), 2);
  assert.deepEqual(P.chaptersOf(P.addMarker(P.newProject(), 61.4, 'News')), [{ at: 61, title: 'News' }]);
});

test('the studio has its own address in Podcasts, and sessions stay private', () => {
  const doc = migratePodcasts({ station: {}, podcasts: {}, episodes: {} });
  assert.deepEqual(doc.projects, {});
  doc.projects.proj_a = P.newProject();
  doc.projects.proj_a.id = 'proj_a';
  assert.deepEqual(podcastRoute('#studio', doc), { scope: 'studio', seriesId: null, base: 'studio', tray: null, projectId: null });
  assert.equal(podcastRoute('#studio/proj_a', doc).projectId, 'proj_a');
  assert.equal(podcastRoute('#studio/nope', doc).base, 'studio');
});
