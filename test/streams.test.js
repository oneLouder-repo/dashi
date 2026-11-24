import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankCartridge, addBlock, moveBlock, ROOM, linkStream, moveStream, streamSpan, streamBlocks, unlinkBlock, dissolveStream, removeStream, streamToTemplate, applyStream, STREAM_TEMPLATES, duplicateBlock, lessonSections, BLOCK_TYPES } from '../src/learning/cartridge.js';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';

const start = (c) => blankCartridge({ start: '2027-01-11', weeks: 4 });

test('there is room before and after the run, and using it grows the run', () => {
  let c = start();
  const r = addBlock(c, { type: 'announce', start: -999 });
  assert.equal(r.cartridge.blocks[r.id].start, -7 - ROOM);
  assert.equal(r.cartridge.span.pre, 7 + ROOM, 'the pre-start grows to fit');
  c = moveBlock(r.cartridge, r.id, { start: 0 });
  assert.equal(c.span.pre, 7 + ROOM, 'and stays, so nothing jumps');
});

test('the basic slideshow stream drops in as five linked blocks on their own tracks', () => {
  const tpl = STREAM_TEMPLATES.find((t) => t.id === 'tpl_slideshow');
  const r = applyStream(start(), tpl, 7);
  const bs = streamBlocks(r.cartridge, r.id);
  assert.deepEqual(bs.map((b) => b.type), ['lesson', 'slideshow', 'quiz', 'discussion', 'lesson']);
  assert.deepEqual(streamSpan(r.cartridge, r.id), { start: 7, end: 14 });
  assert.equal(r.cartridge.tracks.find((t) => t.id === bs[3].trackId).kind, 'support');
  // Moving it keeps the spacing.
  const moved = moveStream(r.cartridge, r.id, 7);
  assert.deepEqual(streamBlocks(moved, r.id).map((b) => b.start), bs.map((b) => b.start + 7));
  // It can't be pushed off the timeline.
  assert.ok(streamSpan(moveStream(r.cartridge, r.id, 999), r.id).end <= 28 + 7 + ROOM);
  // A template made from it round-trips.
  const tpl2 = streamToTemplate(moved, r.id, { name: 'Mine' });
  assert.deepEqual(tpl2.blocks.map((b) => b.offset), tpl.blocks.map((b) => b.offset));
  assert.equal(applyStream(start(), tpl2, 0).blockIds.length, 5);
});

test('a stream needs two blocks; unlinking, dissolving and removing', () => {
  let c = start();
  const a = addBlock(c, { type: 'lesson', start: 0 }); c = a.cartridge;
  const b = addBlock(c, { type: 'quiz', start: 2 }); c = b.cartridge;
  const s = linkStream(c, [a.id, b.id], 'Pair'); c = s.cartridge;
  assert.equal(c.blocks[a.id].streamId, s.id);
  const dup = duplicateBlock(c, a.id);
  assert.equal(dup.cartridge.blocks[dup.id].streamId, undefined, 'a copy is not linked');
  const u = unlinkBlock(c, a.id);
  assert.equal(u.streams[s.id], undefined, 'one block left is no stream');
  assert.equal(u.blocks[b.id].streamId, undefined);
  assert.equal(Object.keys(dissolveStream(c, s.id).blocks).length, 2);
  assert.equal(Object.keys(removeStream(c, s.id).blocks).length, 0);
  assert.equal(linkStream(c, [a.id]).id, null, 'one block can’t make a stream');
});

test('lesson sections fall back to words and pictures', () => {
  assert.deepEqual(lessonSections({ body: 'Hi', settings: { images: [{ src: '/a.jpg', alt: 'A' }] } }).map((x) => x.kind), ['text', 'image']);
  assert.equal(lessonSections({ body: 'old', settings: { sections: [{ kind: 'callout', text: 'new' }] } })[0].kind, 'callout');
});

test('new block types are marked as previews, and Kestrel has a worked stream', () => {
  assert.ok(BLOCK_TYPES.filter((t) => t.preview).length >= 8);
  const { teach } = kestrelBundle().docs;
  const c = teach.cartridges.crt_sp1;
  assert.equal(Object.values(c.streams).length, 1);
  assert.equal(c.blocks.blk_sp1_why.settings.sections.length, 4);
});
