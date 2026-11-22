// Slideshow podcasts: the data shape, the resolver, the trial shows and their audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/podcasts/show/format.js';
import { showFor, listShows } from '../src/podcasts/show/resolve.js';
import { TRIAL_SHOWS, trialIds, sayLength, planTiming, timeSlides } from '../src/podcasts/show/trials.js';
import { wavBytes, readWav, musicBed, makeShow, RATE } from '../server/trialShows.js';
import { newProject } from '../src/podcasts/studio/project.js';

test('inline words keep only bold, italic, underline, safe links and breaks', () => {
  assert.equal(F.sanitiseInline('<b>a</b> <strong>b</strong> <em>c</em> <u>d</u>'), '<b>a</b> <b>b</b> <i>c</i> <u>d</u>');
  assert.equal(F.sanitiseInline('<script>alert(1)</script>hi'), 'hi');
  assert.equal(F.sanitiseInline('<a href="javascript:alert(1)">x</a>'), 'x');
  assert.equal(F.sanitiseInline('<a href="https://x.org" onclick="y()">x</a>'), '<a href="https://x.org" target="_blank" rel="noopener">x</a>');
  assert.equal(F.sanitiseInline('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
  assert.equal(F.sanitiseInline('<img src=x onerror=y()>ok'), 'ok');
  assert.equal(F.sanitiseInline('<b>open'), '<b>open</b>', 'unclosed tags are closed');
  assert.equal(F.sanitiseInline('<p>one</p><p>two</p>'), 'one<br>two');
});

test('old slides are upgraded: the body becomes a text block, the tone the card', () => {
  const s = F.normaliseSlide({ id: 'a', at: 3.04, title: 'T', body: 'hi <there>', kind: 'quote', tone: '#c8432f' });
  assert.equal(s.at, 3);
  assert.equal(s.kind, 'quote');
  assert.deepEqual(s.blocks, [{ id: 'a_body', type: 'text', html: 'hi &lt;there&gt;' }]);
  assert.equal(s.bg.colour, '#c8432f');
  assert.equal(s.transition.type, 'fade');
  assert.equal(F.normaliseSlide({ kind: 'nonsense' }).kind, 'point');
  assert.equal(F.normaliseSlide({ transition: { type: 'spin' } }).transition.type, 'fade');
});

test('a card holds a few hundred words and two pictures', () => {
  const words = Array.from({ length: 320 }, () => 'word').join(' ');
  const full = F.newSlide(0, { blocks: [{ type: 'text', html: words }] });
  assert.equal(F.budget(full).over, true);
  assert.equal(F.canAdd(full, 'text'), false);
  const pics = F.newSlide(0, { blocks: [F.newBlock('image', { src: 'a.jpg' }), F.newBlock('image', { src: 'b.jpg' })] });
  assert.equal(F.canAdd(pics, 'image'), false);
  assert.ok(F.checks(pics).some((c) => /alt text/.test(c.text)), 'pictures without descriptions are flagged');
});

test('contrast checks catch hard-to-read words', () => {
  assert.ok(F.contrast('#000000', '#ffffff') > 20);
  const pale = F.newSlide(0, { bg: { colour: '#ffffff' }, ink: '#f7c744' });
  assert.ok(F.checks(pale).some((c) => c.level === 'warn' && /hard to read/.test(c.text)));
  const fine = F.newSlide(0, { bg: { colour: '#ffffff' }, notes: 'Said.', title: 'Hello' });
  assert.equal(F.checks(fine).filter((c) => c.level === 'warn').length, 0);
});

test('slide edits: blocks add, change, move and go; slides copy and swap keeping their times', () => {
  let slides = [F.newSlide(0, { id: 's1', title: 'One' }), F.newSlide(10, { id: 's2', title: 'Two' })];
  const blk = F.newBlock('card');
  slides = F.addBlock(slides, 's1', blk);
  assert.equal(slides[0].blocks.at(-1).card.kind, 'stat');
  slides = F.patchBlock(slides, 's1', blk.id, { card: { kind: 'progress', value: '40%' } });
  assert.equal(slides[0].blocks.at(-1).card.kind, 'progress');
  assert.equal(slides[0].blocks.at(-1).card.label, 'people reached', 'other card fields kept');
  slides = F.moveBlock(slides, 's1', blk.id, -1);
  assert.equal(slides[0].blocks[0].id, blk.id);
  slides = F.removeBlock(slides, 's1', blk.id);
  assert.ok(!slides[0].blocks.some((b) => b.id === blk.id));
  slides = F.swapSlide(slides, 's1', 1);
  assert.deepEqual(slides.map((s) => [s.title, s.at]), [['Two', 0], ['One', 10]]);
  slides = F.duplicateSlide(slides, slides[0].id, 20);
  assert.deepEqual(slides.map((s) => s.at), [0, 5, 10]);
});

test('the frame at a time: which slide, and how far through its transition', () => {
  const s = F.normaliseSlides([{ id: 'a', at: 0, transition: { type: 'cut' } }, { id: 'b', at: 10, transition: { type: 'fade', ms: 1000 } }]);
  assert.equal(F.frameAt(s, 5).slide.id, 'a');
  assert.equal(F.frameAt(s, 5).p, 1);
  assert.equal(F.frameAt(s, 10.5).slide.id, 'b');
  assert.ok(Math.abs(F.frameAt(s, 10.5).p - 0.5) < 1e-9);
  assert.equal(F.frameAt(s, 10.5).prev.id, 'a');
  assert.equal(F.frameAt([], 3).index, -1);
});

test('showFor finds a slideshow by episode, file or session', () => {
  const slides = [{ id: 'x', at: 0, title: 'Hi' }];
  const doc = {
    episodes: { e1: { id: 'e1', title: 'Ep', audio: { mediaId: 'm1', duration: 30 }, slides } },
    files: { f1: { id: 'f1', name: 'File', mediaId: 'm2', duration: 20, slides } },
    projects: { p1: { id: 'p1', title: 'Session', episodeId: 'e1', slides, clips: {} }, p2: { id: 'p2', title: 'Loose', slides, clips: { c: { start: 0, length: 12, source: { url: 'a.mp3' } } } } },
  };
  const e = showFor(doc, { plugin: 'podcasts', type: 'episode', id: 'e1' });
  assert.equal(e.format, 'dashi.slideshow');
  assert.equal(e.audioUrl, '/media/m1');
  assert.equal(e.slides[0].title, 'Hi');
  assert.equal(showFor(doc, { type: 'file', id: 'f1' }).audioUrl, '/media/m2');
  assert.equal(showFor(doc, { type: 'session', id: 'p1' }).audioUrl, '/media/m1', 'a session plays the episode it became');
  assert.equal(showFor(doc, { type: 'session', id: 'p2' }).audioUrl, 'a.mp3');
  assert.equal(showFor(doc, { type: 'session', id: 'p2' }).duration, 12);
  assert.equal(showFor(doc, { type: 'episode', id: 'nope' }), null);
  assert.equal(listShows(doc).length, 4);
  assert.equal(F.xapiActivity(e).definition.name.en, 'Ep');
});

test('a slideshow session starts from its own template', () => {
  const p = newProject({ template: 'slideshow' });
  assert.equal(p.kind, 'slideshow');
  assert.deepEqual(p.tracks.map((t) => t.kind), ['voice', 'music']);
  assert.deepEqual(p.slides, []);
});

test('ten trial shows: nine of 30 to 45 seconds and one of about five minutes', () => {
  assert.equal(TRIAL_SHOWS.length, 10);
  assert.equal(new Set(TRIAL_SHOWS.map((s) => s.slug)).size, 10);
  const lengths = TRIAL_SHOWS.map((s) => planTiming(s, s.slides.map((x) => sayLength(x.say))).end);
  const long = TRIAL_SHOWS.filter((s) => s.long);
  assert.equal(long.length, 1);
  for (const [i, s] of TRIAL_SHOWS.entries()) {
    if (s.long) assert.ok(lengths[i] >= 290 && lengths[i] <= 330, `${s.slug} ${lengths[i]}`);
    else assert.ok(lengths[i] >= 30 && lengths[i] <= 45, `${s.slug} ${lengths[i]}`);
  }
  assert.equal(trialIds('grant-tips').episode, 'ep_trial_grant-tips');
});

test('trial slides are timed in order, fit their cards and read well', () => {
  for (const show of TRIAL_SHOWS) {
    const slides = timeSlides(show, show.slides.map((x) => sayLength(x.say)));
    assert.equal(slides[0].at, 0);
    for (let i = 1; i < slides.length; i++) assert.ok(slides[i].at > slides[i - 1].at, `${show.slug} slide ${i + 1}`);
    for (const s of slides) {
      assert.equal(F.budget(s).over, false, `${show.slug}: ${s.title}`);
      assert.ok(s.notes.length > 0, 'every slide has its words as notes');
      assert.equal(F.checks(s).filter((c) => c.level === 'warn').length, 0, `${show.slug}: ${s.title} ${JSON.stringify(F.checks(s))}`);
    }
  }
});

test('wav files go out and come back', () => {
  const tone = Float32Array.from({ length: RATE }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE));
  const back = readWav(wavBytes(tone));
  assert.equal(back.length, RATE);
  assert.ok(Math.abs(back[100] - tone[100]) < 1e-3);
  const half = readWav(wavBytes(tone, RATE * 2));
  assert.equal(half.length, RATE / 2, 'resampled to the studio rate');
});

test('a music bed is the length asked for, quiet at the ends and the same every time', () => {
  const m = musicBed(6, 'x');
  assert.equal(m.length, Math.ceil(6 * RATE));
  assert.ok(Math.abs(m[0]) < 1e-3 && Math.abs(m.at(-1)) < 1e-3);
  assert.ok(m.some((v) => Math.abs(v) > 0.02));
  assert.deepEqual(musicBed(2, 'y').slice(0, 2000), musicBed(2, 'y').slice(0, 2000));
});

test('a show with no speech tool is music only, timed by reading speed', () => {
  const made = makeShow(TRIAL_SHOWS[0], { tool: null });
  assert.equal(made.voice, null);
  assert.equal(made.spoken, false);
  assert.ok(made.duration >= 30 && made.duration <= 45);
  assert.equal(made.mix.length, Math.ceil(made.duration * RATE));
  assert.equal(made.slides.length, TRIAL_SHOWS[0].slides.length);
  assert.equal(made.chapters[0].at, 0);
});
