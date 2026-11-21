import { h } from './dom.js';
import { icon } from './icons.js';
import { PALETTES, paletteById, applyTheme, isCustomTheme } from '../platform/themes.js';
import { EDITABLE, PAIRS, normHex, hexToHsl, hslToHex, readability, readableOn, setColour, problems, customFrom, rgbToHex } from '../platform/palettes.js';

/**
 * The Dashi palette builder: start from a palette, then adjust any colour.
 * It edits a theme object ({palette, base, colors, shape}) and hands it back;
 * where the theme lives (org.theme, a podcast station's look…) is the
 * caller's business, so each plugin keeps its own.
 *
 *   PaletteBuilder({
 *     theme,                       the current theme
 *     onDraft(theme)               while a slider moves: preview only
 *     onChange(theme)              a settled change: save it
 *     brands, onSaveBrand(name, theme), onDeleteBrand(id)   optional saved palettes
 *     inherit: { label, onPick, on }  optional "same as the site" choice
 *   })
 */
export function PaletteBuilder(opts) {
  let theme = structuredClone(opts.theme ?? {});
  let picked = EDITABLE[0].key;
  const root = h('div', { class: 'pb' });

  const custom = () => isCustomTheme(theme);
  const presetOf = () => (custom() ? theme.from ?? theme.base : theme.palette) ?? 'corporate';
  const colours = () => (custom() ? { ...measure(theme.base ?? 'light'), ...theme.colors } : measure(theme.palette ?? 'corporate'));

  const change = (next, draft = false) => {
    theme = next;
    if (draft) { opts.onDraft?.(theme); paintEditor(); return; }
    opts.onChange?.(theme);
    draw();
  };
  const pickPreset = (id) => change({ ...theme, palette: id, base: undefined, colors: undefined, from: undefined });
  const adjust = (key, hex, draft) => {
    const start = custom() ? theme : customFrom(presetOf(), measure(presetOf()), theme);
    change({ ...start, colors: setColour({ ...measure(start.base), ...start.colors }, key, hex) }, draft);
  };

  const swatches = (cols, attrs = {}) => h('span', { class: 'swatches', ...attrs }, ['primary', 'secondary', 'accent', 'neutral', 'base-200'].map((c) => h('span', { style: `background:${cols?.[c] ?? `var(--color-${c})`}` })));
  const option = (on, label, sw, onclick, extra) => h('div', { class: 'pb-opt-wrap' },
    h('button', { type: 'button', class: `palette-option${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), onclick }, sw, h('span', {}, label)), extra);

  const editor = h('div', { class: 'pb-editor' });

  function draw() {
    const inheriting = opts.inherit?.on?.();
    const cur = presetOf();
    const brands = opts.brands?.() ?? [];
    const isBrand = (b) => custom() && JSON.stringify(b.colors) === JSON.stringify(theme.colors);
    root.replaceChildren(
      h('div', { class: 'pb-section' },
        h('div', { class: 'pb-head' }, h('strong', {}, 'Start from'), h('span', { class: 'muted small' }, 'Pick a palette, then adjust any colour below')),
        h('div', { class: 'palette-grid', role: 'radiogroup', 'aria-label': 'Colour palette' },
          opts.inherit && option(inheriting, opts.inherit.label, h('span', { class: 'swatches pb-inherit' }, icon('link', 14)), () => opts.inherit.onPick()),
          !inheriting && custom() && !brands.some(isBrand) && option(true, theme.from && paletteById[theme.from] ? `${paletteById[theme.from].label}, adjusted` : 'Your own colours', swatches(theme.colors), () => {}),
          brands.map((b) => option(!inheriting && isBrand(b), b.name, swatches(b.colors), () => change({ ...theme, palette: 'custom', base: b.base, from: b.base, colors: { ...b.colors } }),
            opts.onDeleteBrand && h('button', { type: 'button', class: 'pb-del', title: `Remove ${b.name}`, 'aria-label': `Remove ${b.name}`, onclick: () => opts.onDeleteBrand(b.id) }, icon('close', 11)))),
          PALETTES.map((p) => {
            const sw = swatches(null, { 'data-theme': p.id });
            return option(!inheriting && !custom() && theme.palette === p.id, p.label, sw, () => pickPreset(p.id));
          }))),
      !inheriting && h('div', { class: 'pb-section' },
        h('div', { class: 'pb-head' },
          h('strong', {}, 'Adjust the colours'),
          custom() && theme.from && paletteById[theme.from] && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => pickPreset(theme.from) }, icon('undo', 12), `Back to ${paletteById[theme.from].label}`),
          h('span', { class: 'spacer' }),
          opts.onSaveBrand && custom() && !brands.some(isBrand) && h('button', { type: 'button', class: 'btn btn-xs', onclick: async () => opts.onSaveBrand(theme) }, icon('plus', 12), 'Save as a brand palette')),
        h('div', { class: 'pb-chips', role: 'tablist', 'aria-label': 'Which colour' }, EDITABLE.map((e) => {
          const v = colours()[e.key];
          return h('button', { type: 'button', role: 'tab', class: `pb-chip${picked === e.key ? ' on' : ''}`, 'aria-selected': String(picked === e.key), 'data-key': e.key, onclick: () => { picked = e.key; draw(); } },
            h('span', { class: 'pb-dot', style: `background:${v}` }), h('span', {}, h('strong', {}, e.label), h('small', {}, v)));
        })),
        editor,
        Warnings()),
      cur && h('p', { class: 'sr-only' }, `Starting palette: ${paletteById[cur]?.label ?? cur}`));
    paintEditor(true);
  }

  function Warnings() {
    const bad = problems(colours());
    if (!bad.length) return h('p', { class: 'pb-ok small' }, icon('check', 12), 'Every colour has readable text on it.');
    const fix = () => {
      const start = custom() ? theme : customFrom(presetOf(), measure(presetOf()), theme);
      const cols = { ...measure(start.base), ...start.colors };
      for (const b of bad) cols[b.fg] = readableOn(cols[b.bg]);
      change({ ...start, colors: cols });
    };
    return h('p', { class: 'pb-warn small' }, icon('alert', 12),
      h('span', {}, `Hard to read: ${bad.map((b) => `text on ${EDITABLE.find((e) => e.key === b.bg)?.label.toLowerCase() ?? b.bg} (${b.ratio}:1)`).join(', ')}. Pick a darker or lighter shade, or `),
      h('button', { type: 'button', class: 'btn btn-xs', onclick: fix }, 'fix the text colours'));
  }

  // The editor for the picked colour: redrawn in place while sliders move, so they keep the pointer.
  let sliders = null;
  function paintEditor(rebuild = false) {
    const e = EDITABLE.find((x) => x.key === picked);
    const v = normHex(colours()[picked]) ?? '#888888';
    const [hh, ss, ll] = hexToHsl(v);
    const partner = PAIRS[picked] ?? (picked === 'base-content' ? null : null);
    const textOn = partner ? colours()[partner] : colours()['base-100'];
    const r = partner ? readability(textOn, v) : readability(v, textOn);
    if (rebuild || !sliders) {
      const range = (name, max, val, bg) => h('label', { class: 'pb-range' }, h('span', {}, name),
        h('input', { type: 'range', min: 0, max, value: val, 'data-ch': name, style: `--track:${bg}`,
          oninput: (ev) => { const cur = hexToHsl(normHex(colours()[picked]) ?? v); cur[{ Hue: 0, Strength: 1, Lightness: 2 }[name]] = +ev.target.value; adjust(picked, hslToHex(cur), true); },
          onchange: () => change(theme) }));
      sliders = {
        hue: range('Hue', 360, hh, ''), sat: range('Strength', 100, ss, ''), light: range('Lightness', 100, ll, ''),
        native: h('input', { type: 'color', class: 'pb-native', value: v, 'aria-label': `${e.label} colour`, oninput: (ev) => adjust(picked, ev.target.value, true), onchange: () => change(theme) }),
        hex: h('input', { class: 'input input-sm pb-hex', value: v, 'aria-label': 'Hex code', maxlength: 7, onchange: (ev) => { const x = normHex(ev.target.value); if (x) adjust(picked, x); else ev.target.value = v; } }),
        shades: h('div', { class: 'pb-shades', 'aria-label': 'Shades' }),
        read: h('p', { class: 'pb-read small' }),
        sample: h('div', { class: 'pb-sample' }),
      };
      editor.replaceChildren(
        h('div', { class: 'pb-ed-top' },
          sliders.native,
          h('div', { class: 'pb-ed-name' }, h('strong', {}, e.label), h('small', { class: 'muted' }, e.blurb)),
          sliders.hex),
        sliders.shades,
        h('div', { class: 'pb-ranges' }, sliders.hue, sliders.sat, sliders.light),
        h('div', { class: 'pb-ed-foot' }, sliders.sample, sliders.read));
    }
    const set = (lab, val, bg) => { const i = lab.querySelector('input'); if (document.activeElement !== i) i.value = val; i.style.setProperty('--track', bg); };
    set(sliders.hue, hh, 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)');
    set(sliders.sat, ss, `linear-gradient(90deg,${hslToHex([hh, 0, ll])},${hslToHex([hh, 100, ll])})`);
    set(sliders.light, ll, `linear-gradient(90deg,#000,${hslToHex([hh, ss, 50])},#fff)`);
    if (document.activeElement !== sliders.native) sliders.native.value = v;
    if (document.activeElement !== sliders.hex) sliders.hex.value = v;
    const steps = [88, 76, 64, 52, 42, 34, 26, 18];
    const near = steps.reduce((a, b) => (Math.abs(b - ll) < Math.abs(a - ll) ? b : a));
    sliders.shades.replaceChildren(...steps.map((L) => {
      const x = hslToHex([hh, ss, L]);
      return h('button', { type: 'button', class: `pb-shade${L === near ? ' near' : ''}`, style: `background:${x}`, title: x, 'aria-label': `Use ${x}`, onclick: () => adjust(picked, x) });
    }));
    sliders.sample.replaceChildren(partner
      ? h('span', { style: `background:${v};color:${textOn}` }, 'Text on this colour')
      : h('span', { style: `background:${textOn};color:${v}` }, picked === 'base-content' ? 'Body text on the page' : 'This colour on the page'));
    sliders.read.className = `pb-read small ${r.ok ? 'ok' : 'bad'}`;
    sliders.read.replaceChildren(icon(r.ok ? 'check' : 'alert', 12), `${r.ratio}:1, ${r.level === 'AAA' || r.level === 'AA' ? `easy to read (${r.level})` : r.level.toLowerCase()}`);
    for (const c of root.querySelectorAll('.pb-chip')) {
      const val = colours()[c.dataset.key];
      c.querySelector('.pb-dot').style.background = val;
      c.querySelector('small').textContent = val;
    }
  }

  draw();
  root.update = (t) => { theme = structuredClone(t ?? {}); draw(); };
  return root;
}

// What a DaisyUI palette's colours are, measured once in the page (DaisyUI writes them in oklch).
const measured = {};
let probe = null;
let ink = null;
export function measure(id) {
  if (measured[id]) return measured[id];
  if (typeof document === 'undefined') return {};
  probe ??= Object.assign(document.createElement('div'), { hidden: true });
  if (!probe.isConnected) document.body.append(probe);
  ink ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  applyTheme(probe, { palette: id });
  const cs = getComputedStyle(probe);
  const out = {};
  for (const k of [...EDITABLE.map((e) => e.key), ...Object.values(PAIRS), 'base-200', 'base-300']) {
    const raw = cs.getPropertyValue(`--color-${k}`).trim();
    if (!raw) continue;
    ink.clearRect(0, 0, 1, 1);
    ink.fillStyle = '#000';
    ink.fillStyle = raw;
    ink.fillRect(0, 0, 1, 1);
    const [r, g, b] = ink.getImageData(0, 0, 1, 1).data;
    out[k] = rgbToHex([r, g, b]);
  }
  return (measured[id] = out);
}
