// eLearning stages 1 and 2: the cartridge, Teach's checks and Learn's records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankCartridge, addBlock, moveBlock, resizeBlock, removeBlock, duplicateBlock, addTrack, removeTrack, moveTrack, updateTrack,
  phases, phaseOf, dateOf, dayOf, weekOf, weekLoad, pathByWeek, publish, exportCartridge, importCartridge, BLOCK_TYPES, trackFor, addPace,
} from '../src/learning/cartridge.js';
import { runChecks, canPublish, readingGrade, contrast, bestInk, udlBalance } from '../src/learning/checks.js';
import { blankLearn, enrol, markDone, progress, isOpen, nextBlock, dueSoon, todayDay, recordLines, toStatement, saveSettings, settingsOf, leave } from '../src/learning/records.js';
import { seedTeach, seedLearn } from '../src/learning/seed.js';
import { fallbackShow } from '../src/learning/show.js';
import { createBoard, getBoard } from '../src/learning/collab.js';
import { PLUGINS } from '../src/plugins.js';

const org = { staff: { a: { id: 'a', name: 'Ada Admin', roleId: 'admin' }, s: { id: 's', name: 'Sam Staff', roleId: 'staff' } } };

test('days, dates and phases: a cartridge keeps day numbers, a run pins day 0', () => {
  assert.equal(dateOf('2027-01-11', 0), '2027-01-11');
  assert.equal(dateOf('2027-01-11', -14), '2026-12-28');
  assert.equal(dayOf('2027-01-11', '2027-01-25'), 14);
  assert.deepEqual([weekOf(-3), weekOf(0), weekOf(6), weekOf(7)], [0, 1, 1, 2]);
  const c = blankCartridge({ start: '2027-01-11', weeks: 6 });
  assert.deepEqual(phases(c).map((p) => [p.id, p.from, p.to]), [['pre', -7, 0], ['session', 0, 42], ['post', 42, 49]]);
  assert.deepEqual([phaseOf(c, -1), phaseOf(c, 0), phaseOf(c, 45), phaseOf(c, 60)], ['pre', 'session', 'post', 'archive']);
});

test('blocks go on their usual track, move, stretch, copy and go', () => {
  let c = blankCartridge({ start: '2027-01-11' });
  let r = addBlock(c, { type: 'quiz', start: 3 });
  c = r.cartridge;
  assert.equal(c.blocks[r.id].trackId, trackFor(c, 'quiz').id, 'a quiz lands on the assessment track');
  assert.equal(c.tracks.find((t) => t.id === c.blocks[r.id].trackId).kind, 'assess');
  const live = c.tracks.find((t) => t.kind === 'live').id;
  c = moveBlock(c, r.id, { start: 10, trackId: live });
  assert.deepEqual([c.blocks[r.id].start, c.blocks[r.id].trackId], [10, live]);
  c = moveBlock(c, r.id, { start: 999 });
  assert.equal(c.blocks[r.id].start, c.span.length + c.span.post - 1, 'clamped to the run');
  c = moveBlock(c, r.id, { start: 10 });
  c = resizeBlock(c, r.id, 'right', 15);
  assert.equal(c.blocks[r.id].length, 6);
  c = resizeBlock(c, r.id, 'left', 12);
  assert.deepEqual([c.blocks[r.id].start, c.blocks[r.id].length], [12, 4]);
  c = resizeBlock(c, r.id, 'right', 2);
  assert.equal(c.blocks[r.id].length, 1, 'never shorter than a day');
  const dup = duplicateBlock(c, r.id);
  assert.equal(dup.cartridge.blocks[dup.id].start, 19, 'a copy goes a week later');
  const other = addBlock(dup.cartridge, { type: 'lesson', start: 20, after: [r.id] });
  c = removeBlock(other.cartridge, r.id);
  assert.deepEqual(c.blocks[other.id].after, [], 'waiting on a removed block is forgotten');
});

test('tracks: add, recolour, reorder, remove with their blocks', () => {
  let c = blankCartridge();
  c = addTrack(c, 'custom', 'Field trips');
  const t = c.tracks.at(-1);
  assert.equal(t.name, 'Field trips');
  c = updateTrack(c, t.id, { tone: '#4da65c', muted: true });
  assert.equal(c.tracks.at(-1).muted, true);
  c = moveTrack(c, t.id, -10);
  assert.equal(c.tracks[0].id, t.id);
  c = addBlock(c, { type: 'resource', trackId: t.id }).cartridge;
  c = removeTrack(c, t.id);
  assert.ok(!c.tracks.some((x) => x.id === t.id));
  assert.ok(!Object.values(c.blocks).some((b) => b.trackId === t.id));
});

test('load and path: effort per week, the learner’s outline leaves out hidden tracks', () => {
  let c = blankCartridge({ weeks: 2 });
  c = addBlock(c, { type: 'lesson', start: 0, minutes: 30 }).cartridge;
  c = addBlock(c, { type: 'assignment', start: 8, minutes: 120 }).cartridge;
  c = addBlock(c, { type: 'announce', start: -3, minutes: 2 }).cartridge;
  const load = weekLoad(c);
  assert.deepEqual(load.slice(0, 3).map((w) => w.minutes), [2, 30, 120]);
  const comms = c.tracks.find((t) => t.kind === 'comms').id;
  c = updateTrack(c, comms, { muted: true });
  assert.deepEqual(pathByWeek(c).map((w) => w.week), [1, 2]);
  assert.deepEqual(pathByWeek(c, { teacher: true }).map((w) => w.week), [0, 1, 2]);
});

test('checks: transcripts and alt text stop publishing; the rest explain themselves', () => {
  let c = blankCartridge({ weeks: 1 });
  let r = addBlock(c, { type: 'slideshow', start: 0, ref: { plugin: 'podcasts', type: 'episode', id: 'ep1' } });
  c = r.cartridge;
  let issues = runChecks(c);
  assert.ok(issues.some((i) => i.rule === 'transcript' && i.level === 'block'));
  assert.equal(canPublish(issues), false);
  c = addBlock(c, { type: 'lesson', start: 1, body: 'Hello', settings: { images: [{ src: 'x.jpg', alt: '' }] } }).cartridge;
  assert.ok(runChecks(c).some((i) => i.rule === 'alt'));
  c = { ...c, blocks: Object.fromEntries(Object.entries(c.blocks).map(([k, b]) => [k, { ...b, alts: ['transcript'], settings: b.settings?.images ? { images: [{ src: 'x.jpg', alt: 'A harbour' }] } : b.settings }])) };
  issues = runChecks(c);
  assert.equal(canPublish(issues), true, `left: ${issues.filter((i) => i.level === 'block').map((i) => i.title)}`);
  c = addBlock(c, { type: 'quiz', start: 2, minutes: 400, settings: { timeLimit: 10 } }).cartridge;
  issues = runChecks(c);
  assert.ok(issues.some((i) => i.rule === 'timing'));
  assert.ok(issues.some((i) => i.rule === 'load'));
  c = addBlock(c, { type: 'assignment', start: 0, length: 2 }).cartridge;
  assert.ok(runChecks(c).some((i) => i.rule === 'dates' && /48 hours/.test(i.title)));
  assert.ok(runChecks(c).some((i) => i.rule === 'feedback'));
});

test('measures behind the checks', () => {
  assert.equal(readingGrade('Too short.'), null);
  const plain = 'We pool gifts. We give grants. People near you know what they need. We ask them. We listen. We fund it. Then we tell the story together, in plain words, so everyone can see.';
  const dense = 'Notwithstanding considerable methodological heterogeneity characterising community-level indicator frameworks, practitioners must operationalise interpretive judgements regarding representativeness, longitudinal comparability and epistemological limitations inherent in aggregated administrative datasets.';
  assert.ok(readingGrade(plain) < 8, String(readingGrade(plain)));
  assert.ok(readingGrade(`${dense} ${dense}`) > 16);
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(bestInk('#f7c744'), '#16181d');
  assert.equal(bestInk('#2c4fa3'), '#ffffff');
  const u = udlBalance(seedTeach(org).cartridges.crt_grants101);
  assert.ok(u.engage > 0 && u.represent > 0 && u.express > 0);
});

test('Kestrel’s seed: two published cartridges that pass, a draft with things to fix', () => {
  const teach = seedTeach(org);
  const g = teach.cartridges.crt_grants101;
  const v = teach.cartridges.crt_vital;
  assert.equal(g.status, 'published');
  assert.equal(canPublish(runChecks(g)), true);
  assert.equal(canPublish(runChecks(teach.cartridges.crt_board)), true);
  assert.equal(v.status, 'draft');
  assert.equal(canPublish(runChecks(v)), false);
  const slides = Object.values(g.blocks).filter((b) => b.type === 'slideshow');
  assert.ok(slides.every((b) => b.ref?.plugin === 'podcasts' && /^ep_trial_/.test(b.ref.id)), 'shows are linked to the Studio’s trial shows, never copied');
  for (const c of Object.values(teach.cartridges)) assert.ok(Object.values(c.blocks).every((b) => c.tracks.some((t) => t.id === b.trackId)));
});

test('Learn: enrol, finish blocks, progress, what’s next and what’s due', () => {
  const teach = seedTeach(org);
  const g = teach.cartridges.crt_grants101;
  const doc = seedLearn(org, teach);
  const e = doc.people.a.enrolments[g.id];
  assert.ok(doc.people.s.enrolments[g.id], 'everyone on staff is in Grantmaking 101');
  const p = progress(g, e);
  assert.ok(p.done > 0 && p.done < p.of);
  assert.equal(todayDay(g, e, '2026-11-22'), 13);
  assert.equal(nextBlock(g, e, '2026-11-22').id, 'blk_g_trust');
  assert.ok(dueSoon(g, e, '2026-11-22').some((d) => d.block.id === 'blk_g_office2' || d.block.type === 'office'));
  const later = g.blocks.blk_g_assign;
  assert.equal(isOpen(g, e, later, '2026-11-22').open, false, 'week 3 work waits for week 3');
  assert.match(isOpen(g, e, later, '2026-11-22').why, /Opens 2026-11-24/);
  // Self-paced: days count from the learner's own start.
  const w = teach.cartridges.crt_board;
  let d2 = enrol(blankLearn(), 's', w, '2026-11-20T10:00:00.000Z');
  assert.equal(todayDay(w, d2.people.s.enrolments[w.id], '2026-11-22'), 2);
  d2 = markDone(d2, 's', w.id, 'blk_b_welcome', true, '2026-11-20T11:00:00.000Z');
  assert.equal(progress(w, d2.people.s.enrolments[w.id]).done, 1);
  assert.deepEqual(recordLines(w, d2.people.s.enrolments[w.id]).map((l) => l.verb), ['completed', 'registered']);
  d2 = leave(d2, 's', w.id);
  assert.equal(d2.people.s.enrolments[w.id], undefined);
});

test('the learner’s record as xAPI: an account id, never an email', () => {
  const teach = seedTeach(org);
  const g = teach.cartridges.crt_grants101;
  const doc = seedLearn(org, teach);
  const st = toStatement(g, 'a', doc.people.a.enrolments[g.id].log.at(-1));
  assert.equal(st.actor.account.name, 'a');
  assert.equal(st.actor.mbox, undefined);
  assert.match(st.verb.id, /adlnet\.gov\/expapi\/verbs\/completed/);
  assert.match(st.object.id, /cartridges\/crt_grants101\/blocks\//);
});

test('learner settings', () => {
  let d = saveSettings(blankLearn(), 'a', { textSize: 'xl', motion: 'calm' });
  assert.deepEqual([settingsOf(d, 'a').textSize, settingsOf(d, 'a').motion, settingsOf(d, 'a').captions], ['xl', 'calm', true]);
});

test('a cartridge leaves as JSON and comes back as a fresh draft', () => {
  const g = seedTeach(org).cartridges.crt_grants101;
  const back = importCartridge(exportCartridge(g));
  assert.notEqual(back.id, g.id);
  assert.equal(back.status, 'draft');
  assert.equal(Object.keys(back.blocks).length, Object.keys(g.blocks).length);
  assert.throws(() => importCartridge('{"title":"x"}'), /isn’t a Dashi cartridge/);
});

test('shows and boards resolve without their plugins: a sample deck, a pretend board', () => {
  const s = fallbackShow({ episodes: {} }, { plugin: 'podcasts', type: 'episode', id: 'ep_trial_grant-tips' });
  assert.equal(s.sample, true);
  assert.ok(s.slides.length >= 3);
  assert.match(s.title, /Grant Tips/);
  const real = fallbackShow({ episodes: { e1: { title: 'Real', audio: { url: 'a.mp3', duration: 30 }, slides: [{ id: 's', at: 0, title: 'Hi' }] } } }, { plugin: 'podcasts', type: 'episode', id: 'e1' });
  assert.deepEqual([real.title, real.audioUrl, real.slides.length, real.sample], ['Real', 'a.mp3', 1, false]);
  assert.equal(createBoard({ cartridgeId: 'c', blockId: 'b' }).id, createBoard({ cartridgeId: 'c', blockId: 'b' }).id);
  assert.ok(getBoard('brd_x').snapshot.notes.length > 0);
});

test('Teach and Learn are plugins that own their documents and read, never write, the station', () => {
  const t = PLUGINS.find((p) => p.id === 'teach');
  const l = PLUGINS.find((p) => p.id === 'learn');
  assert.deepEqual(t.owns, ['teach']);
  assert.deepEqual(l.owns, ['learn']);
  assert.ok(t.reads.includes('podcasts') && l.reads.includes('teach') && l.reads.includes('podcasts'));
  assert.ok(t.defaultOff && l.defaultOff, 'off until an org switches them on');
  assert.ok(BLOCK_TYPES.length >= 20);
  const c = addPace(blankCartridge(), 3, 'Hello');
  assert.equal(c.pace[0].day, 3);
});
