import { Sprite } from '../core/Sprite.js';
import { bandsOf } from '../lenses/index.js';
import { scheme, harmonyFor, tint, inkOn, snap, SYSTEMS } from '../ui/wheel.js';

/**
 * Draws the active lens as the board's backdrop, one renderer per lens
 * layout. Each region's shape is kept so it can be highlighted while an
 * actor is dragged over it.
 */
let colours = new Map();
const zone = (region) => colours.get(region.id) ?? '#cfd6e4';
const inkOf = (region) => `fill:${inkOn(zone(region))}`;
const hintOf2 = (region) => (inkOn(zone(region)) === '#ffffff' ? 'fill:rgb(255 255 255 / .86)' : 'fill:rgb(22 24 29 / .72)');

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
    colours = zoneColours(lens);
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

/** Colour helpers for the lens zones. */
function hsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) { const d = max - min; h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return h;
}
const toHex = (h, s, l) => {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return `#${[f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
};
/** The zone's colour at full strength: a primary-ish stripe colour. */
export const bold = (hex) => { const h = hsl(hex); return h == null ? hex : toHex(h, 0.68, 0.5); };
/** The zone itself: white with the faintest wash of its colour (the 0.2 look, kept for anyone still using it). */
export const wash = (hex) => { const h = hsl(hex); return h == null ? hex : toHex(h, 0.6, 0.975); };
/**
 * Alpha 0.3: zones are solid colour again, in the same family as the Assets
 * sunburst (mid-tone, every level at the same strength). Neighbouring zones
 * of one hue alternate a step lighter, and white gaps keep them apart, like
 * the gaps between a sunburst's rings.
 */
export const solid = (hex, k = 0) => { const h = hsl(hex); return h == null ? hex : toHex(h, 0.5, k % 2 ? 0.62 : 0.55); };
/**
 * Alpha 0.3 colour wheel: a lens's zones take their colours from the wheel
 * by a harmony rule (lens.harmony = { scheme, start }, or one chosen by how
 * many groups it has). Regions in one group share a hue, every other one a
 * step lighter; white gaps keep zones apart. The systems-change lenses use
 * the green-yellow-red SYSTEMS palette instead (lens.palette).
 */
export function zoneColours(lens) {
  const groups = [];
  for (const r of lens.regions) { const g = r.group ?? r.id; if (!groups.includes(g)) groups.push(g); }
  const hues = scheme(lens.harmony?.scheme ?? harmonyFor(groups.length), lens.harmony?.start ?? 'orange', groups.length);
  // A named palette (lens.palette = { name: 'systems', order: [hue per group] }) wins over the harmony rule.
  const named = lens.palette?.name === 'systems' ? lens.palette.order : null;
  const seen = {};
  return new Map(lens.regions.map((r) => {
    const g = groups.indexOf(r.group ?? r.id);
    const k = (seen[g] = (seen[g] ?? -1) + 1);
    const steps = named && SYSTEMS[named[g]];
    if (steps) return [r.id, steps[k % 2]];
    return [r.id, k % 2 ? tint(hues[g], 0.3) : hues[g]];
  }));
}
/** Any old tint brought onto the wheel (thumbnails of maps without a lens to hand). */
export const onWheel = (hex, k = 0) => (k % 2 ? tint(snap(hex), 0.3) : snap(hex));
const GAP = 6;
const INK = 'fill:#fff';
const HINT_INK = 'fill:rgb(255 255 255 / .86)';

const hintOf = (region) => [region.group, region.hint].filter(Boolean).join(' · ');

const renderers = {
  rings(view, lens, keep) {
    const { x: cx, y: cy } = lens.center;
    const bands = bandsOf(lens);
    // Outermost first so inner rings paint on top; a white gap at each ring's edge.
    [...bands].reverse().forEach(({ region }, i) => {
      keep(region, view.draw('circle', { cx, cy, r: region.radius, fill: zone(region) }));
      view.draw('circle', { class: 'lens-stripe', cx, cy, r: region.radius, fill: 'none', stroke: '#fff', 'stroke-width': GAP });
    });
    for (const { region, inner, outer } of bands) {
      // Label sits in the top of each ring's band (near the top of the innermost disc).
      const y = inner ? cy - (inner + outer) / 2 - 6 : cy - outer + 40;
      label(view, region.label, hintOf(region), cx, y, 'middle', region);
    }
  },

  triangle(view, lens, keep) {
    const { centerX, top, bottom, halfWidth } = lens.triangle;
    const widthAt = (y) => (halfWidth * (bottom - y)) / (bottom - top);
    bandsOf(lens).forEach(({ region, y0, y1 }, i) => {
      const points = [
        [centerX - widthAt(y0), y0],
        [centerX + widthAt(y0), y0],
        [centerX + widthAt(y1), y1],
        [centerX - widthAt(y1), y1],
      ].map((p) => p.join(',')).join(' ');
      keep(region, view.draw('polygon', { points, fill: zone(region) }));
      if (i) view.draw('line', { class: 'lens-stripe', x1: centerX - widthAt(y0) - GAP, y1: y0, x2: centerX + widthAt(y0) + GAP, y2: y0, stroke: '#fff', 'stroke-width': GAP });
      label(view, region.label, hintOf(region), centerX, y0 + 40, 'middle', region);
    });
  },

  bands(view, lens, keep) {
    const left = -lens.width / 2;
    let lastGroup = null;
    bandsOf(lens).forEach(({ region, y0, y1 }, i) => {
      keep(region, view.draw('rect', { x: left, y: y0, width: lens.width, height: y1 - y0, fill: zone(region) }));
      if (i) view.draw('rect', { class: 'lens-stripe', x: left, y: y0 - GAP / 2, width: lens.width, height: GAP, fill: '#fff' });
      label(view, region.label, region.hint ?? '', left + 28, y0 + (region.hint ? 28 : (y1 - y0) / 2 + 6), 'start', region);
      if (region.group && region.group !== lastGroup) {
        view.draw('text', { class: 'lens-group', x: -left - 18, y: y0 + 26, 'text-anchor': 'end', style: inkOf(region) }).textContent = region.group;
      }
      lastGroup = region.group;
    });
  },

  grid(view, lens, keep) {
    renderers.bands(view, lens, keep);
    const bands = bandsOf(lens);
    const top = bands[0].y0;
    const bottom = bands.at(-1).y1;
    const step = lens.width / lens.columns.length;
    lens.columns.forEach((col, i) => {
      const x = -lens.width / 2 + i * step;
      if (i) view.draw('line', { class: 'lens-divider', x1: x, x2: x, y1: top, y2: bottom, style: 'stroke:#fff;stroke-width:4;stroke-dasharray:none' });
      view.draw('text', { class: 'lens-column', x: x + step / 2, y: top - 22, 'text-anchor': 'middle' }).textContent = col.label;
    });
    view.draw('text', { class: 'lens-axis', x: lens.width / 2, y: top - 46, 'text-anchor': 'end' }).textContent = 'breadth of change →';
  },
};

function label(view, text, hint, x, y, anchor, region) {
  view.draw('text', { class: 'lens-label', x, y, 'text-anchor': anchor, style: region ? inkOf(region) : INK }).textContent = text;
  if (hint) view.draw('text', { class: 'lens-hint', x, y: y + 20, 'text-anchor': anchor, style: region ? hintOf2(region) : HINT_INK }).textContent = hint;
}
