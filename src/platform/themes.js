/**
 * Themes for an org's public sites: a colour palette and a shape.
 * Palettes are DaisyUI themes (vendor/daisyui/themes.css), so any DaisyUI
 * component on a page picks them up. A shape sets DaisyUI's radius,
 * border and depth variables on top.
 *
 * org.theme = { palette: 'corporate', shape: 'rounded' }
 * A custom palette (no maker yet; set by a client's seed):
 * org.theme = { palette: 'custom', base: 'light', colors: { primary: '#9b1d3a', 'primary-content': '#fff', … } }
 *   base     the DaisyUI theme underneath, for anything colors leaves out
 *   colors   DaisyUI colour names (primary, secondary, accent, neutral, base-100…) → CSS colours
 *
 * To offer another palette, add a DaisyUI theme name here (and make sure
 * vendor/daisyui/themes.css includes it).
 */
export const PALETTES = [
  { id: 'corporate', label: 'Corporate blue' },
  { id: 'light', label: 'Bright' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'garden', label: 'Garden' },
  { id: 'nord', label: 'Nordic' },
  { id: 'winter', label: 'Winter' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'caramellatte', label: 'Caramel' },
  { id: 'lofi', label: 'Black and white' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'retro', label: 'Retro' },
  { id: 'dim', label: 'Dim (dark)' },
  { id: 'business', label: 'Business (dark)' },
];

export const SHAPES = [
  { id: 'rounded', label: 'Rounded', blurb: 'Soft corners and gentle depth', vars: { '--radius-box': '1rem', '--radius-field': '0.5rem', '--radius-selector': '1rem', '--border': '1px', '--depth': '1' } },
  { id: 'squared', label: 'Squared', blurb: 'Square corners, firm edges', vars: { '--radius-box': '0', '--radius-field': '0', '--radius-selector': '0', '--border': '1px', '--depth': '0' } },
  { id: 'flat', label: 'Minimal and flat', blurb: 'Barely-there corners, no depth', vars: { '--radius-box': '0.25rem', '--radius-field': '0.25rem', '--radius-selector': '0.25rem', '--border': '1px', '--depth': '0', '--noise': '0' } },
];

export const paletteById = Object.fromEntries(PALETTES.map((p) => [p.id, p]));
export const shapeById = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

/** Apply a theme to an element (usually <html> on a public site, or a preview box). */
const COLOUR_KEYS = ['primary', 'primary-content', 'secondary', 'secondary-content', 'accent', 'accent-content', 'neutral', 'neutral-content', 'base-100', 'base-200', 'base-300', 'base-content', 'info', 'success', 'warning', 'error'];
const isColour = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch)a?\([\d\s.,%/-]+\))$/i.test(v.trim());
export const isCustomTheme = (theme = {}) => theme.palette === 'custom' && !!theme.colors;

export function applyTheme(el, theme = {}) {
  const custom = isCustomTheme(theme);
  const base = custom ? theme.base : theme.palette;
  el.setAttribute('data-theme', paletteById[base] ? base : custom ? 'light' : 'corporate');
  for (const k of COLOUR_KEYS) el.style.removeProperty(`--color-${k}`);
  if (custom) for (const [k, v] of Object.entries(theme.colors)) if (COLOUR_KEYS.includes(k) && isColour(v)) el.style.setProperty(`--color-${k}`, v.trim());
  el.dataset.palette = custom ? 'custom' : el.getAttribute('data-theme');
  const shape = shapeById[theme.shape] ?? SHAPES[0];
  for (const s of SHAPES) for (const k of Object.keys(s.vars)) el.style.removeProperty(k);
  for (const [k, v] of Object.entries(shape.vars)) el.style.setProperty(k, v);
  el.dataset.shape = shape.id;
}

/** A theme in words: "Emerald", "Emerald, adjusted", "Your own". */
export function themeLabel(theme = {}) {
  if (!isCustomTheme(theme)) return paletteById[theme.palette]?.label ?? 'Corporate blue';
  const from = paletteById[theme.from]?.label;
  return from ? `${from}, adjusted` : 'Your own';
}
