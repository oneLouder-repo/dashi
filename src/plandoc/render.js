import { h } from '../ui/dom.js';
import { artUrl } from '../ui/art.js';
import { textOf, headlineMeasures, defaultText, docPaletteById, fontById, SCALES, layoutOf, allMeasures } from '../platform/plandocs.js';
import { PHOTOS, photoUrl, photoCredit } from '../platform/photos.js';
import { cleanHtml, isPlain, textOfHtml } from './richText.js';

/**
 * Draw a strategic plan document as pages, in its template and colours.
 * The same drawing is the designer's editing surface (editable: true, where
 * words can be typed over and pictures changed), the public web view, and
 * what prints to PDF.
 *
 *   PlanDocument(pd, snapshot, { editable, onText(key, value, html), onImage(slot), palette, toolbar })
 *
 * Design settings on the plan doc (all optional): colours (custom, over the
 * palette; a palette of 'doc:<id>' is one of DOC_PALETTES), fonts, background,
 * cover layout and text scale. See platform/plandocs.js.
 */

/** The plan doc's three colours, its paper and its ink. */
export function docColours(pd, palette) {
  const dp = docPaletteById[String(palette ?? '').replace(/^doc:/, '')];
  const base = dp && String(palette).startsWith('doc:') ? [...dp.c] : paletteColours(palette);
  const c = (pd.colours ?? []).map((x, i) => x || base[i]);
  return { c: [0, 1, 2].map((i) => c[i] ?? base[i]), paper: pd.paper || (String(palette).startsWith('doc:') ? dp?.paper : null) || '#ffffff', ink: (String(palette).startsWith('doc:') ? dp?.ink : null) || '#1c2230' };
}

/** Any CSS colour as #rrggbb (DaisyUI themes use oklch). */
export function toHex(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return `#${[r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The three colours of a DaisyUI palette, as hex. */
export function paletteColours(palette) {
  const probe = h('div', { 'data-theme': palette || 'corporate', style: 'position:absolute;visibility:hidden' });
  document.body.append(probe);
  const css = getComputedStyle(probe);
  const get = (n, f) => toHex(css.getPropertyValue(n).trim() || f);
  const out = [get('--color-primary', '#1d4ed8'), get('--color-secondary', '#2a9d8f'), get('--color-accent', '#f4a261')];
  probe.remove();
  // Keep the three far enough apart to tell objectives apart: turn the hue of any too close to the ones before.
  for (let i = 1; i < 3; i++) {
    while (out.slice(0, i).some((c) => distance(c, out[i]) < 90)) out[i] = rotate(out[i] === out[0] ? out[0] : out[i], 110 * i);
  }
  return out;
}

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const distance = (a, b) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
/** Turn a colour's hue by `deg`, giving it some saturation if it has little. */
function rotate(c, deg) {
  let [r, g, b] = rgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let hh = 0, sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  hh = (hh + deg) % 360; sat = Math.max(sat, 0.45);
  const L = Math.min(0.55, Math.max(0.38, l));
  const f = (n) => { const k = (n + hh / 30) % 12; const a = sat * Math.min(L, 1 - L); return Math.round((L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const fmt = (v, unit) => (v == null || v === '' ? '' : unit === '%' ? `${Math.round(v)}%` : Number(v).toLocaleString('en-CA', { maximumFractionDigits: 1 }));
const yearOf = (d) => (d ? String(d).slice(0, 4) : '');

const NATURE = PHOTOS.filter((p) => p.group === 'nature');
/** A nature photo for a picture slot nobody has chosen yet, the same one each time. */
export const naturePhoto = (seed) => NATURE[Math.abs(seed) % NATURE.length];

export function PlanDocument(pd, snap, { editable = false, onText, onImage, onPage, onStory, palette, toolbar = null, selected = null } = {}) {
  const look = docColours(pd, palette);
  const colours = look.c;
  const T = (key, tag = 'span', cls = '', multiline = false) => {
    const value = textOf(pd, snap, key);
    const rich = pd.rich?.[key];
    const el = h(tag, { class: `pd-t ${cls}${rich ? ' pd-rich' : ''}`, 'data-key': key });
    if (rich) el.innerHTML = cleanHtml(rich); else el.textContent = value;
    if (editable) {
      el.contentEditable = 'true';
      el.spellcheck = true;
      el.title = 'Click to edit. Select words to format them.';
      if (!value && !rich) el.dataset.placeholder = multiline ? 'Click to write…' : 'Click to add…';
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiline) { e.preventDefault(); el.blur(); }
        if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]); }
      });
      // Pasted words come in as plain text: formatting is added here, on purpose.
      el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
      el.addEventListener('blur', () => {
        const html = cleanHtml(el.innerHTML);
        if (isPlain(html)) {
          const v = el.innerText.replace(/\n{3,}/g, '\n\n').trim();
          if (v !== textOf(pd, snap, key) || rich) onText?.(key, v === defaultText(snap, key) ? null : v, null);
        } else if (html !== rich) onText?.(key, textOfHtml(html), html);
      });
      toolbar?.attach(el, { multiline });
    }
    return el;
  };
  const imageUrl = (slot, seed, w, hh) => {
    const img = pd.images?.[slot];
    if (img?.kind === 'url' && img.url) return img.url;
    if (!img && (slot.startsWith('area:') || /^cover[23]$/.test(slot))) return photoUrl(naturePhoto(seed));
    return artUrl(img?.art ?? ['waves', 'hills', 'topo', 'circles', 'rays', 'mosaic'][seed % 6], colours, seed + 1, w, hh);
  };
  const Picture = (slot, seed, cls) => {
    const img = pd.images?.[slot];
    const fallback = !img && (slot.startsWith('area:') || /^cover[23]$/.test(slot)) ? naturePhoto(seed) : null;
    const credit = img?.kind === 'url' ? img.credit : fallback ? photoCredit(fallback) : '';
    return h('figure', { class: `pd-pic ${cls}` },
      h('img', { src: imageUrl(slot, seed), alt: img?.alt ?? fallback?.title ?? '', loading: 'lazy' }),
      credit && h('figcaption', { class: 'pd-credit' }, credit),
      editable && h('button', { type: 'button', class: 'pd-pic-btn', onclick: () => onImage?.(slot, seed) }, 'Change picture'));
  };
  const show = (id) => !pd.hidden?.[id];
  const pages = [];
  const page = (id, cls, ...kids) => h('section', { class: `pd-page pd-${cls}`, 'data-section': id }, ...kids);
  const foot = (n) => h('footer', { class: 'pd-foot' }, h('span', {}, snap.org.name), h('span', {}, textOf(pd, snap, 'title')), h('span', {}, String(n)));

  const SECTION = {
    cover: () => pages.push(page('cover', 'cover',
      Picture('cover', 0, 'pd-cover-pic'),
      pd.cover === 'mosaic' && h('div', { class: 'pd-mosaic' }, Picture('cover2', 3, 'pd-mosaic-pic'), Picture('cover3', 5, 'pd-mosaic-pic')),
      h('div', { class: 'pd-cover-text' },
        snap.org.logo && h('img', { class: 'pd-logo', src: snap.org.logo, alt: '' }),
        T('coverKicker', 'p', 'pd-kicker'),
        T('title', 'h1', 'pd-title'),
        T('subtitle', 'p', 'pd-subtitle'),
        T('tagline', 'p', 'pd-tagline', true)))),

    letter: () => pages.push(page('letter', 'letter',
      h('div', { class: 'pd-inner' },
        h('p', { class: 'pd-kicker' }, 'A message from us'),
        T('letterTitle', 'h2', 'pd-h2'),
        T('letter', 'p', 'pd-body pd-letter', true),
        T('letterSign', 'p', 'pd-sign')),
      foot(pages.length + 1))),

    foundations: () => pages.push(page('foundations', 'foundations',
      h('div', { class: 'pd-inner' },
        h('p', { class: 'pd-kicker' }, 'Our foundations'),
        h('div', { class: 'pd-found' },
          h('div', { class: 'pd-found-card pd-vision' }, h('h3', {}, 'Vision'), T('vision', 'p', 'pd-lead', true)),
          h('div', { class: 'pd-found-card pd-mission' }, h('h3', {}, 'Mission'), T('mission', 'p', 'pd-lead', true)),
          h('div', { class: 'pd-found-card pd-values' }, h('h3', {}, 'Values'), T('values', 'p', 'pd-body', true)))),
      foot(pages.length + 1))),

    glance: () => pages.push(page('glance', 'glance',
      h('div', { class: 'pd-inner' },
        h('p', { class: 'pd-kicker' }, 'The plan at a glance'),
        T('title', 'h2', 'pd-h2'),
        T('glanceIntro', 'p', 'pd-body', true),
        h('div', { class: 'pd-glance', style: `--cols:${Math.min(3, Math.max(1, snap.objectives.length))}` },
          snap.objectives.map((o, i) => h('div', { class: 'pd-glance-col', style: `--hue:var(--pd-c${i % 3})` },
            h('div', { class: 'pd-glance-head' }, h('span', { class: 'pd-num' }, String(i + 1).padStart(2, '0')), T(`obj:${o.id}:title`, 'h3')),
            h('ul', {}, o.goals.map((g) => h('li', {}, T(`goal:${g.id}:title`)))))))),
      foot(pages.length + 1))),

    objectives: () => snap.objectives.forEach((o, i) => pages.push(page('objectives', 'objective',
      Picture(`obj:${o.id}`, i + 1, 'pd-strip'),
      h('div', { class: 'pd-inner', style: `--hue:var(--pd-c${i % 3})` },
        h('p', { class: 'pd-kicker' }, `Objective ${i + 1}`),
        T(`obj:${o.id}:title`, 'h2', 'pd-h2'),
        T(`obj:${o.id}:intro`, 'p', 'pd-body pd-intro', true),
        o.measures.length > 0 && h('div', { class: 'pd-measures' }, o.measures.map(Measure)),
        h('div', { class: 'pd-goals' }, o.goals.map((g, k) => h('article', { class: 'pd-goal' },
          h('span', { class: 'pd-goal-num' }, `${i + 1}.${k + 1}`),
          h('div', {},
            T(`goal:${g.id}:title`, 'h3', 'pd-goal-title'),
            (g.notes || editable) && T(`goal:${g.id}:notes`, 'p', 'pd-small', true),
            g.measures.length > 0 && h('div', { class: 'pd-measures compact' }, g.measures.map(Measure)),
            g.workplans.length > 0 && h('p', { class: 'pd-work' }, h('b', {}, 'How: '), g.workplans.map((w) => w.title + (w.start ? ` (${yearOf(w.start)}${yearOf(w.end) && yearOf(w.end) !== yearOf(w.start) ? `–${yearOf(w.end)}` : ''})` : '')).join(' · '))))))),
      foot(pages.length + 1)))),

    numbers: () => {
      const headline = headlineMeasures(snap);
      if (!headline.length) return;
      pages.push(page('numbers', 'numbers',
        h('div', { class: 'pd-inner' },
          h('p', { class: 'pd-kicker' }, 'Progress'),
          T('numbersTitle', 'h2', 'pd-h2'),
          T('numbersIntro', 'p', 'pd-body', true),
          h('div', { class: 'pd-big-grid' }, headline.map(Big))),
        foot(pages.length + 1)));
    },

    closing: () => {
      const c = snap.org.contact ?? {};
      pages.push(page('closing', 'closing',
        h('div', { class: 'pd-inner' },
          T('closingTitle', 'h2', 'pd-h2'),
          T('closing', 'p', 'pd-lead', true),
          h('dl', { class: 'pd-contact' },
            c.website && [h('dt', {}, 'Web'), h('dd', {}, c.website)],
            c.email && [h('dt', {}, 'Email'), h('dd', {}, c.email)],
            c.phone && [h('dt', {}, 'Phone'), h('dd', {}, c.phone)],
            c.address && [h('dt', {}, 'Address'), h('dd', {}, c.address)]),
          h('p', { class: 'pd-made' }, `${snap.org.name} · ${textOf(pd, snap, 'title')} · Made with Dashi`))));
    },
  };

  // Pages you add (alpha 0.3): text, pictures, data and story cards, each one page.
  const measuresById = Object.fromEntries(allMeasures(snap).map((m) => [m.id, m]));
  const AREA = {
    text: (a, k) => (a.style === 'quote'
      ? h('div', { class: 'pd-inner pd-quote-inner', style: `--hue:var(--pd-c${k % 3})` },
        h('span', { class: 'pd-quote-mark', 'aria-hidden': 'true' }, '“'),
        T(`area:${a.id}:quote`, 'blockquote', 'pd-quote', true),
        T(`area:${a.id}:title`, 'p', 'pd-quote-who'),
        T(`area:${a.id}:body`, 'p', 'pd-body pd-quote-body', true))
      : h('div', { class: 'pd-inner', style: `--hue:var(--pd-c${k % 3})` },
        T(`area:${a.id}:kicker`, 'p', 'pd-kicker'),
        T(`area:${a.id}:title`, 'h2', 'pd-h2'),
        T(`area:${a.id}:body`, 'div', `pd-body pd-area-body${a.style === 'columns' ? ' pd-cols' : ''}`, true))),
    image: (a, k) => (a.style === 'full'
      ? [Picture(`area:${a.id}:0`, k * 2 + 1, 'pd-full-pic'), h('div', { class: 'pd-full-cap' }, T(`area:${a.id}:title`, 'h2', 'pd-h2'), T(`area:${a.id}:caption`, 'p', 'pd-small', true))]
      : a.style === 'pair'
        ? h('div', { class: 'pd-inner' }, T(`area:${a.id}:title`, 'h2', 'pd-h2'),
          h('div', { class: 'pd-pair' }, Picture(`area:${a.id}:0`, k * 2 + 1, 'pd-pair-pic'), Picture(`area:${a.id}:1`, k * 2 + 2, 'pd-pair-pic')),
          T(`area:${a.id}:caption`, 'p', 'pd-body', true))
        : [Picture(`area:${a.id}:0`, k * 2 + 1, 'pd-tall-pic'), h('div', { class: 'pd-inner' }, T(`area:${a.id}:title`, 'h2', 'pd-h2'), T(`area:${a.id}:caption`, 'p', 'pd-body', true))]),
    data: (a, k) => {
      const ms = (a.measureIds?.length ? a.measureIds.map((id) => measuresById[id]) : headlineMeasures(snap, 4)).filter(Boolean);
      return h('div', { class: 'pd-inner', style: `--hue:var(--pd-c${k % 3})` },
        T(`area:${a.id}:kicker`, 'p', 'pd-kicker'),
        T(`area:${a.id}:title`, 'h2', 'pd-h2'),
        T(`area:${a.id}:intro`, 'p', 'pd-body', true),
        !ms.length ? h('p', { class: 'pd-small' }, editable ? 'Choose measures for this page in the Content tool.' : '')
          : a.style === 'bars' ? h('div', { class: 'pd-hbars' }, ms.map((m, i) => HBar(m, i))) : h('div', { class: 'pd-big-grid' }, ms.map(Big)));
    },
    story: (a, k) => {
      const list = (a.stories ?? []).filter(Boolean);
      return h('div', { class: 'pd-inner', style: `--hue:var(--pd-c${k % 3})` },
        T(`area:${a.id}:kicker`, 'p', 'pd-kicker'),
        T(`area:${a.id}:title`, 'h2', 'pd-h2'),
        (editable || textOf(pd, snap, `area:${a.id}:intro`)) && T(`area:${a.id}:intro`, 'p', 'pd-body', true),
        !list.length ? h('p', { class: 'pd-small' }, editable ? 'Pick story cards from Assets, or write a new one, in the Content tool.' : '')
          : h('div', { class: `pd-stories n${list.length} s-${a.style ?? 'cards'}` }, list.map((st, i) => Story(st, a, i))));
    },
  };
  let areaCount = 0;
  for (const id of layoutOf(pd)) {
    if (!show(id)) continue;
    if (SECTION[id]) { SECTION[id](); continue; }
    const a = pd.areas?.[id];
    if (!a || !AREA[a.kind]) continue;
    const k = areaCount++;
    pages.push(page(id, `area pd-area-${a.kind} pd-as-${a.style ?? ''}`, AREA[a.kind](a, k), a.kind === 'image' && a.style === 'full' ? '' : foot(pages.length + 1)));
  }
  if (selected) pages.filter((p) => p.dataset.section === selected).forEach((p) => p.classList.add('pd-selected'));
  if (editable && onPage) pages.forEach((p) => p.addEventListener('pointerdown', (e) => { if (!e.target.closest('button, a') && selected !== p.dataset.section) onPage(p.dataset.section); }));

  const bg = pd.background ?? { kind: 'plain' };
  const cover = pd.cover && pd.cover !== 'template' ? ` pd-cover-${pd.cover}` : '';
  const filter = pd.coverFilter && pd.coverFilter !== 'none' ? ` pd-filter-${pd.coverFilter}` : '';
  const doc = h('div', { class: `pd-doc pd-${pd.template ?? 'modern'} pd-bg-${bg.kind ?? 'plain'}${cover}${filter}`, 'data-theme': String(palette ?? '').startsWith('doc:') ? 'corporate' : palette || 'corporate' }, pages);
  doc.style.setProperty('--pd-c0', colours[0]);
  doc.style.setProperty('--pd-c1', colours[1]);
  doc.style.setProperty('--pd-c2', colours[2]);
  doc.style.setProperty('--pd-paper', look.paper);
  doc.style.setProperty('--pd-ink', look.ink);
  doc.style.setProperty('--pd-strength', String((bg.strength ?? 50) / 100));
  if (bg.kind === 'image') doc.style.setProperty('--pd-bg-image', `url("${imageUrl('background', 7, 816, 1056).replace(/"/g, '%22')}")`);
  if (fontById[pd.fonts?.head]) doc.style.setProperty('--pd-head', fontById[pd.fonts.head].stack);
  if (fontById[pd.fonts?.body]) doc.style.setProperty('--pd-text', fontById[pd.fonts.body].stack);
  const scale = SCALES.find((x) => x.id === pd.scale)?.v ?? 1;
  if (scale !== 1) doc.style.setProperty('--pd-scale', String(scale));
  return doc;

  function Big(m, i) {
    return h('div', { class: 'pd-big', style: `--hue:var(--pd-c${i % 3})` },
      h('div', { class: 'pd-big-num' }, m.facts ? fmt(m.facts.value, m.unit) : '–', m.facts && m.unit && m.unit !== '%' && h('small', {}, ` ${m.unit}`)),
      h('div', { class: 'pd-big-name' }, m.name),
      m.facts?.ofTarget != null && h('div', { class: 'pd-bar' }, h('span', { style: `width:${Math.min(100, m.facts.ofTarget)}%` })),
      h('div', { class: 'pd-big-sub' }, m.facts ? [m.facts.ofTarget != null && `${m.facts.ofTarget}% of target ${fmt(m.facts.target, m.unit)}`, m.facts.change != null && `${m.facts.change >= 0 ? '▲' : '▼'} ${Math.abs(m.facts.change)}% on last year`].filter(Boolean).join(' · ') : m.target ? `Target ${fmt(m.target, m.unit)}` : 'No data yet'));
  }

  function HBar(m, i) {
    const f = m.facts;
    const pct = f?.ofTarget != null ? Math.min(100, f.ofTarget) : null;
    return h('div', { class: 'pd-hbar', style: `--hue:var(--pd-c${i % 3})` },
      h('div', { class: 'pd-hbar-row' }, h('span', {}, m.name), h('b', {}, f ? `${fmt(f.value, m.unit)}${m.unit && m.unit !== '%' ? ` ${m.unit}` : ''}` : '–')),
      h('div', { class: 'pd-hbar-track' }, h('span', { style: `width:${pct ?? 0}%` })),
      h('div', { class: 'pd-measure-sub' }, pct != null ? `${f.ofTarget}% of the target, ${fmt(f.target, m.unit)}` : m.target ? `Target ${fmt(m.target, m.unit)}` : ''));
  }

  function Story(st, a, i) {
    const img = st.images?.[0];
    const second = a.style === 'feature' && i === 0 ? st.images?.[1] : null;
    return h('article', { class: `pd-story f-${st.form ?? 'chunk'}`, style: `--hue:var(--pd-c${i % 3})` },
      img && h('figure', { class: 'pd-story-pic' }, h('img', { src: img.url, alt: img.alt ?? '', loading: 'lazy' }), img.credit && h('figcaption', { class: 'pd-credit' }, img.credit)),
      h('div', { class: 'pd-story-text' },
        st.tags?.length > 0 && h('p', { class: 'pd-story-tags' }, st.tags.slice(0, 3).map((t) => `#${t}`).join(' ')),
        h('h3', { class: 'pd-story-title' }, st.title || 'Untitled story'),
        st.subtitle && h('p', { class: 'pd-story-sub' }, st.subtitle),
        st.body && h('p', { class: 'pd-story-body' }, st.body),
        second && h('img', { class: 'pd-story-inline', src: second.url, alt: second.alt ?? '', loading: 'lazy' })),
      editable && onStory && h('button', { type: 'button', class: 'pd-pic-btn pd-story-btn', onclick: () => onStory(a.id, i) }, 'Edit story'));
  }

  function Measure(m) {
    const f = m.facts;
    return h('div', { class: 'pd-measure' },
      h('div', { class: 'pd-measure-row' }, h('span', {}, m.name), h('b', {}, f ? `${fmt(f.value, m.unit)}${m.unit && m.unit !== '%' ? ` ${m.unit}` : ''}` : m.target ? `Target ${fmt(m.target, m.unit)}` : '')),
      f?.ofTarget != null && h('div', { class: 'pd-bar' }, h('span', { style: `width:${Math.min(100, f.ofTarget)}%` })),
      f?.target && h('div', { class: 'pd-measure-sub' }, `Target ${fmt(f.target, m.unit)}${m.unit && m.unit !== '%' ? ` ${m.unit}` : ''}`));
  }
}
