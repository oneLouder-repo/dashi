/**
 * Stand-in pictures: calm, abstract nature scenes (hills, water, a forest,
 * fields, stones, dunes, leaves, mountains) drawn as SVG, so tiles without
 * a picture of their own still look like something. Each one is picked
 * and coloured from a seed (an asset's key) and a base colour (its ABCD
 * type, or a plugin's tone), so the same thing always gets the same
 * picture. Drawn here, so nothing is fetched from anywhere.
 *
 *   standIn('actor:m1/a1', '#2f8a5b')  -> 'data:image/svg+xml,...'
 *   SCENES.length                      -> how many kinds of scene
 *   coverArt(show, { label })          -> square podcast cover art
 */
function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  // Mix the bits well, so keys that differ by a letter look nothing alike.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  for (let i = 0; i < 4; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; }
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
function hsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const n = m ? parseInt(m[1], 16) : 0x6a8caf;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s * 100, l * 100];
}
const col = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(Math.max(0, Math.min(100, s)))}% ${Math.round(Math.max(0, Math.min(100, l)))}%)`;

/** A palette of five tones from light sky to deep ground, around the base hue. */
function palette(base, r) {
  const [h0, s0] = hsl(base);
  const h = h0 + (r() - 0.5) * 30, s = Math.max(28, Math.min(58, s0 * 0.75));
  return { sky: col(h + 18, s * 0.55, 91), far: col(h + 8, s * 0.75, 76), mid: col(h, s, 58), near: col(h - 6, s * 1.05, 44), deep: col(h - 12, s * 1.1, 31), sun: col(h + 40, 75, 84) };
}

const W = 320, H = 200;
const wave = (y, amp, r, steps = 6) => {
  let d = `M0 ${H} L0 ${y}`;
  for (let i = 1; i <= steps; i++) {
    const x = (W / steps) * i;
    const cy = y + (r() - 0.5) * amp * 2;
    d += ` Q${x - W / steps / 2} ${cy - amp} ${x} ${cy}`;
  }
  return `${d} L${W} ${H} Z`;
};

export const SCENES = [
  // Rolling hills under a low sun.
  (p, r) => `<rect width="${W}" height="${H}" fill="${p.sky}"/><circle cx="${60 + r() * 200}" cy="${55 + r() * 25}" r="${22 + r() * 12}" fill="${p.sun}"/>
    <path d="${wave(110, 18, r, 4)}" fill="${p.far}"/><path d="${wave(135, 16, r, 5)}" fill="${p.mid}"/><path d="${wave(165, 12, r, 3)}" fill="${p.near}"/>`,
  // Mountains.
  (p, r) => {
    const peaks = (base, n, hgt, fill) => { let d = `M0 ${H} L0 ${base}`; for (let i = 0; i < n; i++) { const x0 = (W / n) * i, x1 = x0 + W / n; d += ` L${x0 + (x1 - x0) * (0.3 + r() * 0.4)} ${base - hgt * (0.6 + r() * 0.4)} L${x1} ${base - r() * 10}`; } return `<path d="${d} L${W} ${H} Z" fill="${fill}"/>`; };
    return `<rect width="${W}" height="${H}" fill="${p.sky}"/>${peaks(120, 3, 80, p.far)}${peaks(150, 4, 60, p.mid)}${peaks(185, 5, 40, p.near)}`;
  },
  // Water: layered waves.
  (p, r) => `<rect width="${W}" height="${H}" fill="${p.sky}"/>${[70, 100, 130, 160].map((y, i) => `<path d="${wave(y, 7, r, 8)}" fill="${[p.far, p.mid, p.near, p.deep][i]}" opacity="${0.75 + i * 0.08}"/>`).join('')}`,
  // A forest of simple trees.
  (p, r) => {
    let t = `<rect width="${W}" height="${H}" fill="${p.sky}"/><path d="${wave(150, 6, r, 4)}" fill="${p.far}"/>`;
    for (let i = 0; i < 16; i++) {
      const x = r() * W, h = 40 + r() * 70, y = 175 + r() * 15, w = h * 0.42;
      t += `<path d="M${x} ${y - h} L${x + w / 2} ${y} L${x - w / 2} ${y} Z" fill="${r() > 0.5 ? p.near : p.deep}"/>`;
    }
    return `${t}<rect y="${H - 14}" width="${W}" height="14" fill="${p.deep}"/>`;
  },
  // Fields in rows.
  (p, r) => {
    let t = `<rect width="${W}" height="${H}" fill="${p.sky}"/><path d="${wave(90, 8, r, 4)}" fill="${p.far}"/>`;
    for (let i = 0; i < 6; i++) { const y = 105 + i * 17; t += `<path d="M0 ${y} Q${W / 2} ${y - 12 + r() * 8} ${W} ${y + 4} L${W} ${y + 17} Q${W / 2} ${y + 6} 0 ${y + 17} Z" fill="${i % 2 ? p.mid : p.near}"/>`; }
    return t;
  },
  // River stones.
  (p, r) => {
    let t = `<rect width="${W}" height="${H}" fill="${p.far}"/>`;
    for (let i = 0; i < 11; i++) { const x = r() * W, y = r() * H, rx = 22 + r() * 34; t += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * (0.55 + r() * 0.25)}" fill="${[p.mid, p.near, p.deep, p.sky][i % 4]}" opacity="0.9"/>`; }
    return t;
  },
  // Dunes.
  (p, r) => `<rect width="${W}" height="${H}" fill="${p.sky}"/><circle cx="${240 - r() * 60}" cy="50" r="18" fill="${p.sun}"/>
    <path d="M0 ${130 + r() * 20} C${80} ${90 + r() * 20} ${160} ${150} ${W} ${110 + r() * 20} L${W} ${H} L0 ${H} Z" fill="${p.mid}"/>
    <path d="M0 ${170} C${120} ${130 + r() * 20} ${200} ${185} ${W} ${150} L${W} ${H} L0 ${H} Z" fill="${p.near}"/>`,
  // Leaves.
  (p, r) => {
    let t = `<rect width="${W}" height="${H}" fill="${p.sky}"/>`;
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * H, s = 30 + r() * 40, a = r() * 360;
      t += `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M0 ${-s} C${s * 0.6} ${-s * 0.4} ${s * 0.6} ${s * 0.4} 0 ${s} C${-s * 0.6} ${s * 0.4} ${-s * 0.6} ${-s * 0.4} 0 ${-s} Z" fill="${[p.mid, p.near, p.deep][i % 3]}"/><path d="M0 ${-s} L0 ${s}" stroke="${p.sky}" stroke-width="1.5" opacity="0.6"/></g>`;
    }
    return t;
  },
  // Ripples on a pond.
  (p, r) => {
    const cx = 80 + r() * 160, cy = 70 + r() * 60;
    return `<rect width="${W}" height="${H}" fill="${p.far}"/>${[110, 80, 54, 32, 14].map((rad, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${rad * 1.6}" ry="${rad}" fill="none" stroke="${i % 2 ? p.mid : p.near}" stroke-width="${3 + i}" opacity="0.8"/>`).join('')}`;
  },
];

const cache = new Map();
/** The drawing for a seed and colour, as SVG markup in a W×H box. */
function sceneMarkup(seed, base) {
  const hv = hash(seed);
  const r = rng(hv);
  return SCENES[(hv >>> 8) % SCENES.length](palette(base, r), r);
}
export function standIn(seed, base = '#6a8caf') {
  const k = `${seed}|${base}`;
  if (cache.has(k)) return cache.get(k);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${sceneMarkup(seed, base)}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
  cache.set(k, url);
  return url;
}

/** Calm colours for covers that have none of their own. */
export const COVER_TONES = ['#b23a5b', '#2f7f9c', '#3f8a52', '#8a5bb8', '#c0702a', '#2d6e8e', '#9a4d3a', '#55707a'];
export const coverTone = (seed) => COVER_TONES[hash(seed) % COVER_TONES.length];

const xml = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
/** Break a title into at most three lines of about `width` characters. */
function lines(title, width = 14) {
  const out = [];
  for (const w of String(title ?? '').split(/\s+/).filter(Boolean)) {
    const last = out.at(-1);
    if (last && (last + ' ' + w).length <= width) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  if (out.length > 3) { out.length = 3; out[2] = `${out[2].replace(/\s*\S*$/, '')}…`; }
  return out;
}

/**
 * Square cover art for a podcast show or episode that has none: a nature
 * scene in the show's tone, darkened at the foot, with its title over it.
 *
 *   coverArt({ id: 'pod-1', title: 'STEM Voices', accent: '#b23a5b' }, { label: 'S2 · E3' })
 */
const covers = new Map();
export function coverArt(show, { label = '', seed } = {}) {
  const key = seed ?? show?.id ?? show?.title ?? 'cover';
  const tone = show?.accent || coverTone(key);
  const k = `${key}|${tone}|${show?.title}|${label}`;
  if (covers.has(k)) return covers.get(k);
  const ls = lines(show?.title || 'Untitled');
  const longest = Math.max(...ls.map((l) => l.length));
  const size = Math.round(Math.max(24, Math.min(40, 272 / (longest * 0.6))));
  const y0 = 300 - (ls.length - 1) * (size * 1.08) - (label ? 18 : 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
    <svg width="320" height="320" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${sceneMarkup(key, tone)}</svg>
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient></defs>
    <rect width="320" height="320" fill="url(#g)"/>
    <g font-family="Nunito, 'Segoe UI', system-ui, sans-serif" fill="#fff">
      ${label ? `<text x="22" y="${y0 - size * 1.05 - 6}" font-size="17" font-weight="700" opacity="0.85" letter-spacing="1">${xml(label.length > 24 ? `${label.slice(0, 23)}…` : label).toUpperCase()}</text>` : ''}
      ${ls.map((l, i) => `<text x="20" y="${y0 + i * size * 1.08}" font-size="${size}" font-weight="800">${xml(l)}</text>`).join('')}
    </g>
    <circle cx="288" cy="32" r="15" fill="#fff" opacity="0.88"/><rect x="284" y="23" width="8" height="13" rx="4" fill="${tone}"/><path d="M280 32 a8 8 0 0 0 16 0 M288 40 v4" stroke="${tone}" stroke-width="2" fill="none"/>
  </svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
  covers.set(k, url);
  return url;
}
