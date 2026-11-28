/**
 * Reading what a cable carries in full (d, 2026-11-27: "a way to fully view
 * the answers"): every finding with its score, the things it names and the
 * trail that got it there, or every row with its type and checks. Used by the
 * Scope's Read button and the Teleprinter's tear-off, both in a tray.
 *
 *   Readout(signal, { typeLabel })  → element, with a search box and Copy as text
 *   readoutText(signal)             → the same, as plain text
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { trailOf } from './rack.js';

/** One entry per line of the readout: { score, text, names, trail, type }. */
export function readoutLines(signal, { typeLabel = (t) => t } = {}) {
  if (!signal) return [];
  if (signal.kind === 'findings') return signal.findings.map((f) => ({ score: f.score, text: f.text, names: (f.rows ?? []).map((r) => r.name), trail: f.trail ?? [] }));
  return signal.rows.map((r) => ({ score: r._w?.score ?? null, text: r.name, type: r.type ? typeLabel(r.type, 1) : null, names: [], trail: trailOf(r) }));
}

export function readoutText(signal, opts) {
  return readoutLines(signal, opts).map((l, i) => [
    `${i + 1}. ${l.score != null ? `[${l.score.toFixed(2)}] ` : ''}${l.text}${l.type ? ` (${l.type})` : ''}`,
    l.names.length > 1 ? `   About: ${l.names.join(', ')}` : null,
    ...l.trail.map((t) => `   ${stepWord(t)}: ${t.text}`),
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function Readout(signal, { typeLabel, toast = null } = {}) {
  const lines = readoutLines(signal, { typeLabel });
  let q = '';
  const list = h('ol', { class: 'rk-readout-list' });
  const count = h('span', { class: 'muted small' });
  const draw = () => {
    const shown = lines.filter((l) => !q || `${l.text} ${l.names.join(' ')} ${l.type ?? ''}`.toLowerCase().includes(q));
    count.textContent = `${shown.length} of ${lines.length} ${signal?.kind === 'findings' ? 'findings' : 'rows'}`;
    list.replaceChildren(...(shown.length ? shown.map((l) => h('li', {},
      h('div', { class: 'rk-readout-head' }, l.score != null && h('b', { class: 'rk-readout-score' }, l.score.toFixed(2)), h('p', {}, l.text), l.type && h('small', { class: 'muted' }, l.type)),
      l.names.length > 1 && h('p', { class: 'rk-readout-names' }, h('span', { class: 'muted' }, 'About: '), l.names.join(', ')),
      l.trail.length > 0 && h('ul', { class: 'rk-readout-trail' }, l.trail.map((t) => h('li', { class: t.kind === 'weigh' || t.kind === 'cite' || t.kind === 'meaning' ? 'weigh' : t.ok ? 'ok' : 'no' }, h('span', {}, stepWord(t)), t.text))))) : [h('p', { class: 'empty' }, lines.length ? 'Nothing matches.' : 'Nothing is flowing in.')]));
  };
  draw();
  return h('div', { class: 'rk-readout' },
    h('div', { class: 'rk-readout-tools' },
      h('label', { class: 'input input-sm rk-readout-find' }, icon('search', 14), h('input', { type: 'search', placeholder: 'Find in the readout', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } })),
      count,
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: async () => { try { await navigator.clipboard.writeText(readoutText(signal, { typeLabel })); toast?.('Copied as text'); } catch { toast?.('This browser wouldn’t copy it'); } } }, icon('copy', 14), 'Copy as text')),
    list);
}

/** The word for one step of a trail: a filter passed or failed, a weighing, a citation, a meaning match. */
export function stepWord(t) {
  if (t.kind === 'weigh') return 'Weighed';
  if (t.kind === 'cite') return t.ok ? 'Cites' : 'Uncited';
  if (t.kind === 'meaning') return 'Meaning';
  return t.ok ? 'Passed' : 'Failed';
}
