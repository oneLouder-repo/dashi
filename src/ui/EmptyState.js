import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * A first-run page for a plugin or a part of one that has nothing in it yet
 * (d, 2026-11-27): what this place is for, the first steps, and ways to
 * start quickly (a file, the example). Every empty page uses the same shape.
 *
 *   EmptyState({ icon, title, text, steps: [{ title, text, action }], extra, actions: [el], note, compact, tone })
 *     extra              an element shown after the steps (a preview of what you'll get)
 *     action / actions   buttons or links, made by the caller
 *     compact            a smaller block, for an empty tab or section
 *     tone               a CSS colour for the icon disc (defaults to the plugin accent)
 */
export function EmptyState({ icon: glyph = 'sparkle', title, text = null, steps = [], extra = null, actions = [], note = null, compact = false, tone = null }) {
  return h('section', { class: `empty-state${compact ? ' compact' : ''}`, style: tone ? `--es-tone:${tone}` : null },
    h('span', { class: 'empty-state-icon', 'aria-hidden': 'true' }, icon(glyph, compact ? 20 : 28)),
    h('h2', { class: 'empty-state-title' }, title),
    text && h('p', { class: 'empty-state-text' }, text),
    steps.length > 0 && h('ol', { class: 'empty-state-steps' }, steps.map((s, i) => h('li', {},
      h('span', { class: 'empty-state-n' }, String(i + 1)),
      h('div', { class: 'empty-state-step' }, h('strong', {}, s.title), s.text && h('span', {}, s.text)),
      s.action ?? null))),
    extra,
    actions.filter(Boolean).length > 0 && h('div', { class: 'empty-state-actions' }, actions),
    note && h('p', { class: 'empty-state-note' }, note));
}
