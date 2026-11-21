import { loadLenses, project, lensBounds, bandsOf } from '../lenses/index.js';
import { wash, bold } from '../display/LensView.js';

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
  const tint = (r) => wash(r.tint ?? '#cfd6e4');
const stripe = (r) => bold(r.tint ?? '#cfd6e4');
  if (lens.layout === 'rings') {
    for (const band of [...bandsOf(lens)].reverse()) el('circle', { cx: lens.center.x, cy: lens.center.y, r: band.outer, fill: tint(band.region), stroke: stripe(band.region), 'stroke-width': b.w / 70 }, s);
  } else if (lens.layout === 'triangle') {
    const L = { top: lens.triangle.top, bottom: lens.triangle.bottom, cx: lens.triangle.centerX, hw: lens.triangle.halfWidth };
    const half = (y) => (L.hw * (L.bottom - y)) / (L.bottom - L.top);
    for (const band of bandsOf(lens)) {
      const a = half(band.y0), c = half(band.y1);
      el('polygon', { points: `${L.cx - a},${band.y0} ${L.cx + a},${band.y0} ${L.cx + c},${band.y1} ${L.cx - c},${band.y1}`, fill: tint(band.region), stroke: stripe(band.region), 'stroke-width': b.w / 90 }, s);
    }
  } else {
    for (const band of bandsOf(lens)) el('rect', { x: b.x, y: band.y0, width: b.w, height: band.y1 - band.y0, fill: tint(band.region), stroke: stripe(band.region), 'stroke-width': b.w / 90 }, s);
  }
  const places = map?.arrangements?.[lens.id] ?? {};
  const at = new Map(Object.values(map?.actors ?? {}).map((a) => [a.id, project(lens, places[a.id] ?? a.place ?? { depth: 0.5, spread: 0 })]));
  for (const c of Object.values(map?.connectors ?? {})) {
    const p = at.get(c.from?.actorId), q = at.get(c.to?.actorId);
    if (p && q) el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: '#4a5468', 'stroke-opacity': 0.45, 'stroke-width': b.w / 260 }, s);
  }
  const w = b.w / 14, h = w * 0.62;
  for (const a of Object.values(map?.actors ?? {})) {
    const p = at.get(a.id);
    el('rect', { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h, rx: w / 12, fill: a.kind === 'agent' ? '#fff3c9' : '#fffdf6', stroke: a.kind === 'agent' ? '#c99a1b' : '#6b7488', 'stroke-width': b.w / 300 }, s);
  }
  return s;
}
