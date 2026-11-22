// Alpha 0.3 PR 16: big sunburst rings are gathered into A–Z groups, and long names wrap for the dial's tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regroup, wrapText } from '../src/ui/Sunburst.js';

const many = (n) => ({ name: 'Library', id: 'lib', children: Array.from({ length: n }, (_, i) => ({ name: `${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i % 26]}sset ${i}`, value: 1 })) });
const leaves = (d) => (d.children ? d.children.flatMap(leaves) : [d]);

test('a small ring is left alone', () => {
  const d = many(20);
  assert.equal(regroup(d, 24).children.length, 20);
  assert.ok(!regroup(d, 24).children.some((c) => c.group));
});

test('hundreds of items are gathered into named A–Z groups, none lost', () => {
  const d = many(200);
  const r = regroup(d, 24);
  assert.ok(r.children.length <= 24 && r.children.length > 1);
  assert.ok(r.children.every((c) => c.group && c.id === 'lib' && c.name));
  assert.equal(leaves(r).length, 200);
  assert.equal(r.children.reduce((n, c) => n + c.group.items, 0), 200);
  assert.equal(d.children.length, 200, 'the input is not changed');
  // In order: each group starts at or after where the last one ended.
  const firsts = r.children.map((c) => c.group.from.toUpperCase());
  assert.deepEqual([...firsts].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), firsts);
});

test('very large rings are gathered twice', () => {
  const r = regroup(many(1000), 24);
  assert.ok(r.children.length <= 24);
  assert.ok(r.children[0].children[0].group, 'groups of groups');
  assert.equal(leaves(r).length, 1000);
});

test('wrapText keeps to three lines and marks what it cut', () => {
  assert.deepEqual(wrapText('Council briefing on housing data', 18, 3), ['Council briefing', 'on housing data']);
  const w = wrapText('one two three four five six seven eight nine ten eleven twelve', 10, 3);
  assert.equal(w.length, 3);
  assert.ok(w[2].endsWith('…'));
});
