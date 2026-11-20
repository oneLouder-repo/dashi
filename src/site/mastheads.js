import { h } from '../ui/dom.js';

/**
 * Masthead banners for public sites and the podcast station, drawn as SVG
 * in the org's own colours: each shape takes a class (mh-sky, mh-1 to
 * mh-4, mh-sun, mh-line) that app.css colours from the site's palette, so
 * one banner looks right on every org. Nothing is fetched. An uploaded
 * picture takes the banner's place, cropped to its focus point.
 *
 *   Masthead(design.masthead, { label })   → <div class="mh"> to place in a page
 *   mastheadSvg('ripples')                  → the drawing on its own (for thumbnails)
 */
const W = 1600, H = 520;
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const wave = (y, amp, r, steps, phase = 0) => {
  let d = `M0 ${H} L0 ${y}`;
  for (let i = 1; i <= steps; i++) {
    const x = (W / steps) * i;
    const cy = y + Math.sin(i * 1.7 + phase) * amp * 0.6 + (r() - 0.5) * amp;
    d += ` Q${(x - W / steps / 2).toFixed(0)} ${(cy - amp).toFixed(0)} ${x.toFixed(0)} ${cy.toFixed(0)}`;
  }
  return `${d} L${W} ${H} Z`;
};

const DRAW = {
  ripples() {
    const rings = [];
    for (const [cx, cy, n, gap] of [[1180, 250, 9, 46], [380, 420, 6, 40], [820, 80, 4, 34]]) {
      for (let i = n; i >= 1; i--) rings.push(`<circle class="${i % 2 ? 'mh-ring' : 'mh-ring2'}" cx="${cx}" cy="${cy}" r="${i * gap}"/>`);
      rings.push(`<circle class="mh-sun" cx="${cx}" cy="${cy}" r="${gap * 0.45}"/>`);
    }
    return `<rect class="mh-1" width="${W}" height="${H}"/><rect class="mh-wash" width="${W}" height="${H}"/>${rings.join('')}`;
  },
  hills() {
    const r = rand(7);
    return `<rect class="mh-sky" width="${W}" height="${H}"/><circle class="mh-sun" cx="1120" cy="210" r="88"/>
      <path class="mh-1" d="${wave(250, 46, r, 5)}"/><path class="mh-2" d="${wave(320, 40, r, 6, 1)}"/><path class="mh-3" d="${wave(390, 30, r, 4, 2)}"/><path class="mh-4" d="${wave(455, 18, r, 5, 3)}"/>`;
  },
  canopy() {
    const r = rand(11);
    const trees = (base, n, hMin, hMax, cls) => {
      let d = '';
      for (let i = 0; i < n; i++) {
        const x = (i / n) * W + r() * (W / n), th = hMin + r() * (hMax - hMin), w = th * (0.28 + r() * 0.1);
        d += `M${(x - w / 2).toFixed(0)} ${base} L${x.toFixed(0)} ${(base - th).toFixed(0)} L${(x + w / 2).toFixed(0)} ${base} Z `;
      }
      return `<path class="${cls}" d="${d}"/><rect class="${cls}" y="${base - 1}" width="${W}" height="${H - base + 1}"/>`;
    };
    return `<rect class="mh-sky" width="${W}" height="${H}"/><circle class="mh-sun" cx="420" cy="170" r="70"/>${trees(360, 34, 120, 220, 'mh-1')}${trees(420, 28, 150, 260, 'mh-2')}${trees(490, 22, 170, 300, 'mh-3')}<rect class="mh-4" y="500" width="${W}" height="20"/>`;
  },
  river() {
    const fields = [];
    const r = rand(5);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) fields.push(`<rect class="mh-${1 + Math.floor(r() * 3)}" x="${i * 180 - 20}" y="${j * 135 - 10}" width="${172}" height="${127}" rx="6"/>`);
    return `<rect class="mh-4" width="${W}" height="${H}"/>${fields.join('')}
      <path class="mh-river" d="M-40 140 C 200 60, 380 320, 640 260 S 980 40, 1220 200 S 1500 420, 1660 330"/><path class="mh-river2" d="M-40 140 C 200 60, 380 320, 640 260 S 980 40, 1220 200 S 1500 420, 1660 330"/>`;
  },
  contours() {
    const lines = [];
    for (let k = 0; k < 16; k++) {
      const rr = 40 + k * 34;
      let d = '';
      for (let a = 0; a <= 360; a += 10) {
        const t = (a * Math.PI) / 180, wob = 1 + 0.12 * Math.sin(t * 3 + k * 0.4) + 0.06 * Math.cos(t * 5 - k);
        const x = 1060 + Math.cos(t) * rr * 1.6 * wob, y = 230 + Math.sin(t) * rr * wob;
        d += `${a ? 'L' : 'M'}${x.toFixed(0)} ${y.toFixed(0)} `;
      }
      lines.push(`<path class="${k % 4 === 0 ? 'mh-line-strong' : 'mh-line'}" d="${d}Z"/>`);
    }
    return `<rect class="mh-1" width="${W}" height="${H}"/>${lines.join('')}<circle class="mh-sun" cx="1060" cy="230" r="10"/>`;
  },
  confluence() {
    const r = rand(23);
    const pts = Array.from({ length: 26 }, () => [r() * W, 40 + r() * (H - 80), 4 + r() * 12]);
    const links = [];
    pts.forEach((p, i) => { pts.slice(i + 1).forEach((q) => { if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 300) links.push(`<path class="mh-line" d="M${p[0].toFixed(0)} ${p[1].toFixed(0)} L${q[0].toFixed(0)} ${q[1].toFixed(0)}"/>`); }); });
    return `<rect class="mh-1" width="${W}" height="${H}"/><rect class="mh-wash" width="${W}" height="${H}"/>${links.join('')}${pts.map((p, i) => `<circle class="${i % 5 === 0 ? 'mh-sun' : i % 2 ? 'mh-dot' : 'mh-dot2'}" cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${p[2].toFixed(1)}"/>`).join('')}`;
  },
  tide() {
    const r = rand(3);
    const rows = [];
    for (let i = 0; i < 7; i++) rows.push(`<path class="mh-${1 + (i % 4)}" d="${wave(150 + i * 55, 22, r, 8, i)}"/>`);
    return `<rect class="mh-sky" width="${W}" height="${H}"/><circle class="mh-sun" cx="280" cy="120" r="60"/>${rows.join('')}`;
  },
  prairie() {
    const stripes = [];
    for (let i = 0; i < 9; i++) {
      const y0 = 300 + i * i * 3.4;
      stripes.push(`<path class="mh-${1 + (i % 3)}" d="M0 ${y0.toFixed(0)} L${W} ${(y0 - 30 + i * 4).toFixed(0)} L${W} ${H} L0 ${H} Z"/>`);
    }
    return `<rect class="mh-sky" width="${W}" height="${H}"/><circle class="mh-sun" cx="800" cy="300" r="120"/>${stripes.join('')}<rect class="mh-4" y="490" width="${W}" height="30"/>`;
  },
};

export const mastheadSvg = (preset) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${(DRAW[preset] ?? DRAW.ripples)()}</svg>`;

export function Masthead(m, { cls = '' } = {}) {
  if (!m || m.preset === 'none') return null;
  const el = h('div', { class: `mh mh-h-${m.height ?? 'm'} ${cls}`.trim() });
  if (m.preset === 'upload' && m.image) el.append(h('img', { src: m.image, alt: '', decoding: 'async', style: `object-position:50% ${m.focus ?? 50}%` }));
  else el.innerHTML = mastheadSvg(m.preset);
  return el;
}
