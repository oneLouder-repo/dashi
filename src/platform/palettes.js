/**
 * Colour sums for the palette builder. Pure: no DOM, so the server and the
 * tests can use them too.
 *
 * A palette is a DaisyUI theme name, or a custom theme:
 *   { palette: 'custom', base: 'emerald', colors: { primary: '#0f8a5f', … }, from: 'emerald' }
 * `from` remembers which preset it started from, so the builder can say
 * "Emerald, adjusted" and offer to go back.
 */

export const EDITABLE = [
  { key: 'primary', label: 'Main', blurb: 'Buttons, links, the banner' },
  { key: 'secondary', label: 'Second', blurb: 'Highlights and tags' },
  { key: 'accent', label: 'Accent', blurb: 'Small touches of colour' },
  { key: 'neutral', label: 'Dark', blurb: 'Footers and dark panels' },
  { key: 'base-100', label: 'Page', blurb: 'The page background' },
  { key: 'base-content', label: 'Text', blurb: 'Body text' },
];

/** Every DaisyUI colour that has a readable partner. */
export const PAIRS = { primary: 'primary-content', secondary: 'secondary-content', accent: 'accent-content', neutral: 'neutral-content', 'base-100': 'base-content' };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function normHex(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim().toLowerCase();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

export function hexToRgb(hex) {
  const s = normHex(hex);
  if (!s) return null;
  return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('')}`;

/** [h 0–360, s 0–100, l 0–100] */
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  if (!s) return [l * 255, l * 255, l * 255].map(Math.round);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
}

export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex) ?? [0, 0, 0]);
export const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));

/** WCAG relative luminance. */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** How readable text is on a background, in words. */
export function readability(fg, bg) {
  const c = contrast(fg, bg);
  return { ratio: Math.round(c * 10) / 10, level: c >= 7 ? 'AAA' : c >= 4.5 ? 'AA' : c >= 3 ? 'Large text only' : 'Hard to read', ok: c >= 4.5 };
}

/** Text that reads well on a colour: near-white or near-black, tinted with the colour's hue. */
export function readableOn(bg) {
  const [h, s] = hexToHsl(bg);
  const light = hslToHex([h, Math.min(s, 30), 97]);
  const dark = hslToHex([h, Math.min(s, 40), 12]);
  const best = contrast(light, bg) >= contrast(dark, bg) ? light : dark;
  if (readability(best, bg).ok) return best;
  // Mid tones: plain white or black reads best.
  return contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#ffffff' : '#000000';
}

/** The two quieter page tones from the page colour. */
export function baseTones(base100) {
  const [h, s, l] = hexToHsl(base100);
  const step = l > 50 ? -1 : 1;
  return { 'base-200': hslToHex([h, s, l + step * 4]), 'base-300': hslToHex([h, s, l + step * 9]) };
}

/**
 * Set one colour and keep the palette readable: its partner text colour
 * follows, unless the person chose that one themselves and it still reads.
 */
export function setColour(colors, key, hex) {
  const v = normHex(hex);
  if (!v) return colors;
  const next = { ...colors, [key]: v };
  const partner = PAIRS[key];
  if (partner && !(next[partner] && readability(next[partner], v).ok)) next[partner] = readableOn(v);
  if (key === 'base-100') Object.assign(next, baseTones(v));
  return next;
}

/** The palette's worst pairs, for a warning. */
export function problems(colors) {
  return Object.entries(PAIRS)
    .filter(([bg, fg]) => colors[bg] && colors[fg] && !readability(colors[fg], colors[bg]).ok)
    .map(([bg, fg]) => ({ bg, fg, ...readability(colors[fg], colors[bg]) }));
}

/** Turn a preset (its measured colours) into a custom theme you can adjust. */
export const customFrom = (presetId, measured, theme = {}) => ({ ...theme, palette: 'custom', base: presetId, from: presetId, colors: { ...measured } });

/** A brand palette saved on the org, ready to pick again. */
export const brandPalette = (name, theme) => ({ id: `pal-${Math.random().toString(36).slice(2, 8)}`, name: String(name).slice(0, 40), base: theme.base ?? 'light', colors: { ...theme.colors } });
