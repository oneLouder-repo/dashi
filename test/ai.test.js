import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPrompt, redact } from '../src/ai/literacy.js';
import { PLUGINS, linkTo } from '../src/plugins.js';
import { mergeRegistry } from '../src/platform/pluginRegistry.js';

test('AI literacy: personal data stops a prompt, and the log keeps only the redacted text', () => {
  const r = checkPrompt('Write a thank-you email to jo@example.org, 902-555-0134, about her diagnosis', { staffNames: [] });
  assert.equal(r.level, 'stop');
  assert.deepEqual(r.findings.filter((f) => f.level === 'stop').map((f) => f.id).sort(), ['email', 'health', 'phone']);
  assert.ok(!/jo@example|555/.test(r.redacted));
  assert.equal(redact('Ask Noah Haddad', { staffNames: ['Noah Haddad'] }), 'Ask [person]');
});

test('AI literacy: decisions about people and asks for figures need care; craft notes are only tips', () => {
  assert.equal(checkPrompt('Rank these grant applicants and decide who gets funded').level, 'care');
  assert.ok(checkPrompt('Give me statistics on food insecurity in Nova Scotia with sources').findings.some((f) => f.id === 'facts'));
  const tip = checkPrompt('Summarise this');
  assert.equal(tip.level, 'ok');
  assert.ok(tip.findings.some((f) => f.id === 'short' && f.level === 'tip'));
});

test('one AI plugin gathers the AI tools as its sub-plugins', () => {
  const ai = PLUGINS.find((p) => p.id === 'ai');
  assert.equal(ai.name, 'AI');
  assert.deepEqual(ai.owns, ['ai']);
  const reg = mergeRegistry({});
  for (const id of ['ai-policy', 'ai-register', 'prompt-commons', 'plain-words']) assert.equal(reg.plugins[id].parent, 'ai', id);
  // A stored copy from before alpha 0.4 joins it too, unless the admin chose another home.
  assert.equal(mergeRegistry({ plugins: { 'ai-policy': { id: 'ai-policy', name: 'AI Policy Studio', version: '1.0.0', author: 'Dashi' } } }).plugins['ai-policy'].parent, 'ai');
  assert.equal(linkTo('ai', '#check', { plugins: { ai: false } }), null);
});
