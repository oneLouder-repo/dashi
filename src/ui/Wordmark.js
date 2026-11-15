import { h } from './dom.js';
import { svg } from '../core/svg.js';

/**
 * Dashi's mark, "Ripple": nested rings that touch at one point, like a
 * drop landing in broth (and the micro / meso / macro rings of the
 * Mapper), with the drop in Dashi orange. Then the name, lowercase.
 * The same drawing is media/brand/dashi-mark.svg and the favicon.
 */
export function RippleMark(size = 22, cls = 'dashi-mark') {
  const mark = svg('svg', { viewBox: '0 0 64 64', width: size, height: size, class: cls, 'aria-hidden': 'true' });
  // Small sizes get heavier rings so they stay crisp.
  const w = size <= 16 ? 6.5 : size <= 24 ? 5.5 : 4.5;
  svg('circle', { cx: 32, cy: 33, r: 27, class: 'ring r1', 'stroke-width': w }, mark);
  svg('circle', { cx: 32, cy: 41.5, r: 18.5, class: 'ring r2', 'stroke-width': w }, mark);
  svg('circle', { cx: 32, cy: 50, r: 10, class: 'ring r3', 'stroke-width': w }, mark);
  svg('circle', { cx: 32, cy: 50, r: 4.2, class: 'drop' }, mark);
  return mark;
}

export function Wordmark(size = 22, { text = true } = {}) {
  return h('span', { class: 'dashi-wordmark', style: `font-size:${Math.round(size * 0.92)}px` }, RippleMark(size), text && h('span', { class: 'dashi-name' }, 'dashi'));
}
