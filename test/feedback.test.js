import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanResponse, summarise, missingRequired, starter, QUESTION_KINDS } from '../src/platform/feedback.js';

const form = {
  id: 'f1',
  questions: [
    { id: 'h', kind: 'section', text: 'About you' },
    { id: 's', kind: 'scale', text: 'How likely?', required: true },
    { id: 'm', kind: 'multi', text: 'Which?', options: ['A', 'B', 'C'] },
    { id: 'c', kind: 'choice', text: 'One', options: ['X', 'Y'], required: true },
  ],
};

test('cleanResponse keeps scale 0 to 10 and known multi options, and skips headings', () => {
  const r = cleanResponse(form, { h: 'nope', s: 0, m: ['A', 'Z', 'A', 'C'], c: 'Q' });
  assert.deepEqual(r.answers, { s: 0, m: ['A', 'C'] });
  assert.equal(cleanResponse(form, { s: 11 }), null);
});

test('missingRequired lists required questions without an answer', () => {
  assert.deepEqual(missingRequired(form, {}), ['s', 'c']);
  assert.deepEqual(missingRequired(form, { s: 0, c: 'X' }), []);
  assert.deepEqual(missingRequired({ questions: [{ id: 'm', kind: 'multi', required: true }] }, { m: [] }), ['m']);
});

test('summarise counts scales and multi picks, and leaves headings out', () => {
  const responses = {
    a: { formId: 'f1', at: '2026-11-01', answers: { s: 8, m: ['A', 'B'] } },
    b: { formId: 'f1', at: '2026-11-02', answers: { s: 10, m: ['A'] } },
  };
  const sum = summarise(form, responses);
  assert.equal(sum.questions.length, 3);
  const s = sum.questions.find((x) => x.q.id === 's');
  assert.equal(s.avg, 9);
  assert.equal(s.counts[10], 1);
  const m = sum.questions.find((x) => x.q.id === 'm');
  assert.deepEqual(m.counts.map((x) => x.n), [2, 1, 0]);
});

test('every kind has a starter question', () => {
  for (const k of QUESTION_KINDS) assert.equal(starter(k.id).kind, k.id);
});
