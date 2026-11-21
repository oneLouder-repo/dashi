import { loadLenses, project, lensBounds, bandsOf } from '../lenses/index.js';
import { zoneColours } from '../display/LensView.js';
import { INK } from './wheel.js';

/**
 * A small picture of an ecosystem map: its lens backdrop, links and notes,
 * as an SVG for thumbnails (Asset manager tiles, the home page).
 *
 *   const el = await MiniMap(mapContent, { width: 240, height: 150 })
 */
const NS = 'http://www.w3.org/2000/svg';
let lensesP = null;
export const lensesOnce = () => (lensesP ??= loadLenses());

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  parent?.append(n);
  return n;
};

export async function MiniMap(map, { width = 240, height = 150, label = null } = {}) {
  const lenses = await lensesOnce();
  const lens = lenses.get(map?.lensId) ?? lenses.values().next().value;
  const b = lensBounds(lens);
  const pad = Math.max(b.w, b.h) * 0.04;
  const s = el('svg', { viewBox: `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`, width, height, class: 'mini-map', role: 'img', 'aria-label': label ?? `A small view of ${map?.name ?? 'a map'}`, preserveAspectRatio: 'xMidYMid meet' });
  // The backdrop: the lens regions, outermost first.
  // Solid zones with white gaps, like the board and the sunbursts (alpha 0.3).
  const zones = zoneColours(lens);
  const tint = (r) => zones.get(r.id) ?? '#cfd6e4';
  const stripe = () => '#fff';
  if (lens.layout === 'rings') {
    [...bandsOf(lens)].reverse().forEach((band, i) => el('circle', { cx: lens.center.x, cy: lens.center.y, r: band.outer, fill: tint(band.region, i), stroke: stripe(), 'stroke-width': b.w / 90 }, s));
  } else if (lens.layout === 'triangle') {
    const L = { top: lens.triangle.top, bottom: lens.triangle.bottom, cx: lens.triangle.centerX, hw: lens.triangle.halfWidth };
    const half = (y) => (L.hw * (L.bottom - y)) / (L.bottom - L.top);
    bandsOf(lens).forEach((band, i) => {
      const a = half(band.y0), c = half(band.y1);
      el('polygon', { points: `${L.cx - a},${band.y0} ${L.cx + a},${band.y0} ${L.cx + c},${band.y1} ${L.cx - c},${band.y1}`, fill: tint(band.region, i), stroke: stripe(), 'stroke-width': b.w / 120 }, s);
    });
  } else {
    bandsOf(lens).forEach((band, i) => el('rect', { x: b.x, y: band.y0, width: b.w, height: band.y1 - band.y0, fill: tint(band.region, i), stroke: stripe(), 'stroke-width': b.w / 120 }, s));
  }
  const places = map?.arrangements?.[lens.id] ?? {};
  const at = new Map(Object.values(map?.actors ?? {}).map((a) => [a.id, project(lens, places[a.id] ?? a.place ?? { depth: 0.5, spread: 0 })]));
  for (const c of Object.values(map?.connectors ?? {})) {
    const p = at.get(c.from?.actorId), q = at.get(c.to?.actorId);
    if (p && q) el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: INK, 'stroke-opacity': 0.8, 'stroke-width': b.w / 240 }, s);
  }
  const w = b.w / 14, h = w * 0.62;
  for (const a of Object.values(map?.actors ?? {})) {
    const p = at.get(a.id);
    el('rect', { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h, rx: w / 12, fill: '#fff', stroke: INK, 'stroke-width': a.kind === 'agent' ? b.w / 160 : b.w / 300 }, s);
  }
  return s;
}
