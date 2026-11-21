/**
 * Dashi's colour wheel (alpha 0.3): twelve vibrant hues, used with white,
 * bold colour and crisp black lines across the admin, in place of plain
 * primaries. Zones, rings and sunburst groups pick their colours from the
 * wheel by a harmony rule, so neighbouring colours always belong together.
 *
 *   WHEEL                 [{ id, label, hex }] clockwise from yellow
 *   scheme(kind, start, n) n colours by a harmony: complementary,
 *                          analogous, monochromatic, split, triadic, square
 *   snap(hex)             the nearest wheel colour to any colour
 *   tint(hex, t)          lifted towards white by t (0–1)
 *   inkOn(hex)            black or white, whichever reads on that colour
 */
export const WHEEL = [
  { id: 'yellow', label: 'Yellow', hex: '#f7c744' },
  { id: 'amber', label: 'Amber', hex: '#f4a93b' },
  { id: 'orange', label: 'Orange', hex: '#ef7f2d' },
  { id: 'vermilion', label: 'Vermilion', hex: '#e35a2c' },
  { id: 'red', label: 'Red', hex: '#c8432f' },
  { id: 'coral', label: 'Coral', hex: '#ef8a7e' },
  { id: 'orchid', label: 'Orchid', hex: '#c77deb' },
  { id: 'violet', label: 'Violet', hex: '#7b2fe8' },
  { id: 'blue', label: 'Blue', hex: '#2c4fa3' },
  { id: 'teal', label: 'Teal', hex: '#3e8fa6' },
  { id: 'green', label: 'Green', hex: '#4da65c' },
  { id: 'mint', label: 'Mint', hex: '#b2dfc4' },
];
/** The black of Dashi's lines and type. */
export const INK = '#16181d';
export const HARMONIES = ['complementary', 'analogous', 'monochromatic', 'split', 'triadic', 'square'];

const rgb = (hex) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
function hueSat(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: null, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h, s, l };
}

/** A wheel position from an id, a number or a colour. */
export function wheelIndex(x) {
  if (typeof x === 'number') return ((x % 12) + 12) % 12;
  const byId = WHEEL.findIndex((w) => w.id === x);
  if (byId >= 0) return byId;
  const { h, s } = hueSat(x ?? '#888888');
  if (h == null || s < 0.12) return 0;
  let best = 0, gap = 999;
  WHEEL.forEach((w, i) => { const d = Math.abs(((hueSat(w.hex).h - h + 540) % 360) - 180); if (d < gap) { gap = d; best = i; } });
  return best;
}
export const wheel = (i) => WHEEL[wheelIndex(i)].hex;

/** The nearest wheel colour; greys stay grey. */
export function snap(hex) {
  const { h, s } = hueSat(hex ?? '#888888');
  return h == null || s < 0.12 ? hex : wheel(wheelIndex(hex));
}

/** Lifted towards white by t (0–1). */
export function tint(hex, t) {
  const [r, g, b] = rgb(hex);
  return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
/** Taken towards black by t (0–1). */
export function shade(hex, t) {
  const [r, g, b] = rgb(hex);
  return toHex(r * (1 - t), g * (1 - t), b * (1 - t));
}

/** Black or white type, whichever reads better on this colour. */
export function inkOn(hex) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(hex);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.33 ? INK : '#ffffff';
}

const STEPS = {
  complementary: [0, 6],
  analogous: [0, 1, 2, 11, 3, 10],
  split: [0, 5, 7, 2, 10],
  triadic: [0, 4, 8],
  square: [0, 3, 6, 9],
};
/**
 * n colours from the wheel by a harmony rule, starting at `start` (an id,
 * an index or a colour). More colours than the rule has go round again a
 * step lighter, so nothing repeats exactly.
 */
export function scheme(kind = 'triadic', start = 'orange', n = 3) {
  const s = wheelIndex(start);
  if (kind === 'monochromatic') return Array.from({ length: n }, (_, i) => tint(wheel(s), Math.min(0.75, i * (0.6 / Math.max(1, n - 1)))));
  const steps = STEPS[kind] ?? STEPS.triadic;
  return Array.from({ length: n }, (_, i) => {
    const base = wheel(s + steps[i % steps.length]);
    const lap = Math.floor(i / steps.length);
    return lap ? tint(base, Math.min(0.6, lap * 0.3)) : base;
  });
}

/** Default harmony for n zones, when a lens doesn't name one. */
export const harmonyFor = (n) => (n <= 2 ? 'complementary' : n === 3 ? 'triadic' : n === 4 ? 'square' : 'analogous');
