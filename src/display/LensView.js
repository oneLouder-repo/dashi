import { Sprite } from '../core/Sprite.js';
import { bandsOf } from '../lenses/index.js';

/**
 * Draws the active lens as the board's backdrop, one renderer per lens
 * layout. Each region's shape is kept so it can be highlighted while an
 * actor is dragged over it.
 */
export class LensView extends Sprite {
  lensId = null;
  #shapes = new Map();
  #highlighted = null;

  render(lens) {
    this.lensId = lens.id;
    this.clearGraphics();
    this.#shapes.clear();
    this.#highlighted = null;
    this.node.classList.toggle('small-labels', lens.labelSize === 'small');
    (renderers[lens.layout] ?? renderers.bands)(this, lens, (region, shape) => {
      shape.classList.add('lens-region');
      this.#shapes.set(region.id, shape);
    });
  }

  /** The region a drawn shape belongs to (e.g. the element under a click), or null. */
  regionOf(el) {
    for (const [id, shape] of this.#shapes) if (shape === el) return id;
    return null;
  }

  /** Light a region up for a moment (it pulses while lit). */
  flash(regionId, ms = 3300) {
    const shape = this.#shapes.get(regionId);
    if (!shape) return;
    shape.classList.add('flash');
    clearTimeout(shape.flashTimer);
    shape.flashTimer = setTimeout(() => shape.classList.remove('flash'), ms);
  }

  highlight(regionId) {
    if (regionId === this.#highlighted) return;
    this.#shapes.get(this.#highlighted)?.classList.remove('highlight');
    this.#shapes.get(regionId)?.classList.add('highlight');
    this.#highlighted = regionId ?? null;
  }
}

/**
 * The lens files keep soft pastel tints. On the board they read a little
 * richer: more colour and a touch darker, so neighbouring zones stand apart
 * while staying calm behind the notes.
 */
export function vivid(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  s = Math.min(0.78, s * 1.45 + 0.1);
  l = Math.max(0.8, l - 0.055);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  [r, g, b] = [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

const hintOf = (region) => [region.group, region.hint].filter(Boolean).join(' · ');

const renderers = {
  rings(view, lens, keep) {
    const { x: cx, y: cy } = lens.center;
    const bands = bandsOf(lens);
    // Outermost first so inner rings paint on top.
    for (const { region } of [...bands].reverse()) {
      keep(region, view.draw('circle', { cx, cy, r: region.radius, fill: vivid(region.tint) }));
    }
    for (const { region, inner, outer } of bands) {
      // Label sits in the top of each ring's band (near the top of the innermost disc).
      const y = inner ? cy - (inner + outer) / 2 - 6 : cy - outer + 40;
      label(view, region.label, hintOf(region), cx, y, 'middle');
    }
  },

  triangle(view, lens, keep) {
    const { centerX, top, bottom, halfWidth } = lens.triangle;
    const widthAt = (y) => (halfWidth * (bottom - y)) / (bottom - top);
    for (const { region, y0, y1 } of bandsOf(lens)) {
      const points = [
        [centerX - widthAt(y0), y0],
        [centerX + widthAt(y0), y0],
        [centerX + widthAt(y1), y1],
        [centerX - widthAt(y1), y1],
      ].map((p) => p.join(',')).join(' ');
      keep(region, view.draw('polygon', { points, fill: vivid(region.tint) }));
      label(view, region.label, hintOf(region), centerX, y0 + 40, 'middle');
    }
  },

  bands(view, lens, keep) {
    const left = -lens.width / 2;
    let lastGroup = null;
    for (const { region, y0, y1 } of bandsOf(lens)) {
      keep(region, view.draw('rect', { x: left, y: y0, width: lens.width, height: y1 - y0, fill: vivid(region.tint) }));
      label(view, region.label, region.hint ?? '', left + 18, y0 + (region.hint ? 28 : (y1 - y0) / 2 + 6), 'start');
      if (region.group && region.group !== lastGroup) {
        view.draw('text', { class: 'lens-group', x: -left - 18, y: y0 + 26, 'text-anchor': 'end' }).textContent = region.group;
      }
      lastGroup = region.group;
    }
  },

  grid(view, lens, keep) {
    renderers.bands(view, lens, keep);
    const bands = bandsOf(lens);
    const top = bands[0].y0;
    const bottom = bands.at(-1).y1;
    const step = lens.width / lens.columns.length;
    lens.columns.forEach((col, i) => {
      const x = -lens.width / 2 + i * step;
      if (i) view.draw('line', { class: 'lens-divider', x1: x, x2: x, y1: top, y2: bottom });
      view.draw('text', { class: 'lens-column', x: x + step / 2, y: top - 22, 'text-anchor': 'middle' }).textContent = col.label;
    });
    view.draw('text', { class: 'lens-axis', x: lens.width / 2, y: top - 46, 'text-anchor': 'end' }).textContent = 'breadth of change →';
  },
};

function label(view, text, hint, x, y, anchor) {
  view.draw('text', { class: 'lens-label', x, y, 'text-anchor': anchor }).textContent = text;
  if (hint) view.draw('text', { class: 'lens-hint', x, y: y + 20, 'text-anchor': anchor }).textContent = hint;
}
