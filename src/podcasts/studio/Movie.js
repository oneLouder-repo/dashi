import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { uiPrompt } from '../../ui/dialog.js';
import { readImage } from '../../ui/images.js';
import { ART_STYLES, artUrl } from '../../ui/art.js';
import { WHEEL, INK } from '../../ui/wheel.js';
import { PHOTOS, photoUrl, photoThumb } from '../../platform/photos.js';
import * as F from '../show/format.js';
import { Face, Fitted } from '../show/face.js';
import { Screen, sortedSlides } from '../show/player.js';

/**
 * The studio's slideshow view (slideshow podcasts): a small film editor.
 * Above the (snug) tracks sit three columns:
 *
 *   the filmstrip    every slide in order, with its time and length; pick, reorder, copy, delete
 *   the stage        the slide as a phone card, edited in place (words, lists, pictures, data cards);
 *                    while the session plays it becomes the screen, with transitions
 *   the inspector    the slide's kind and timing, what's on it, its background and banner,
 *                    colours, its transition, room left on the card, and checks
 *
 * api = {
 *   project(), playhead(), playing(), length(),
 *   pick(), setPick(id),                  the slide being edited (null: the one at the playhead)
 *   commitSlides(slides, { keepStage }),  keepStage: the stage already shows the change (typed words)
 *   seek(t), addSlideHere(), play(), say(...msg)
 * }
 */
export function Movie(api) {
  const strip = h('div', { class: 'mv-strip', role: 'listbox', 'aria-label': 'Slides' });
  const stageBox = h('div', { class: 'mv-card-box' });
  const liveBox = h('div', { class: 'mv-live', hidden: true });
  const stageFoot = h('div', { class: 'mv-stage-foot' });
  const fmt = h('div', { class: 'mv-format', role: 'toolbar', 'aria-label': 'Text formatting' });
  const insp = h('div', { class: 'mv-insp' });
  const el = h('div', { class: 'mv' },
    h('section', { class: 'mv-col mv-col-strip' }, h('header', { class: 'mv-col-head' }, h('strong', {}, 'Slides'), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-xs', title: 'Add a slide at the playhead (L)', onclick: () => api.addSlideHere() }, icon('plus', 12), 'Slide')), strip),
    h('section', { class: 'mv-col mv-col-stage' }, fmt, h('div', { class: 'mv-screen' }, stageBox, liveBox), stageFoot),
    h('section', { class: 'mv-col mv-col-insp' }, insp));
  const live = Screen(liveBox);
  let focusBlock = null;     // the block being worked on, for the inspector
  let picking = null;        // { target: 'bg' } | { target: 'block', blockId }: the picture chooser is open
  let lastPlaying = false;

  const slides = () => sortedSlides(api.project().slides ?? []);
  const current = () => {
    const s = slides();
    const id = api.pick();
    return s.find((x) => x.id === id) ?? s[Math.max(0, F.indexAt(s, api.playhead()))] ?? null;
  };
  const end = () => api.length();
  const commit = (next, opts) => api.commitSlides(next, opts);
  const all = () => api.project().slides;

  /* ---------------------------------------------------------------- filmstrip */
  function drawStrip() {
    const sp = F.spans(all(), end());
    const cur = current();
    strip.replaceChildren(...sp.map((s, i) => {
      const on = s.id === cur?.id;
      const row = h('div', { class: `mv-frame${on ? ' on' : ''}`, role: 'option', 'aria-selected': String(on), tabindex: on ? '0' : '-1', 'data-slide': s.id },
        h('span', { class: 'mv-frame-no' }, String(i + 1)),
        Fitted(Face(s), { width: 46, fit: false }),
        h('span', { class: 'mv-frame-text' },
          h('strong', {}, s.title || 'Untitled'),
          h('small', {}, `${clock(s.at)} · ${(s.until - s.at).toFixed(1)} s · ${F.TRANSITIONS.find((t) => t.id === s.transition.type)?.label}`)),
        on && h('span', { class: 'mv-frame-tools' },
          h('button', { type: 'button', title: 'Earlier (swap with the slide before; the timing stays)', 'aria-label': 'Move earlier', disabled: i === 0, onclick: (e) => { e.stopPropagation(); commit(F.swapSlide(all(), s.id, -1)); api.setPick(s.id); } }, icon('chevronUp', 12)),
          h('button', { type: 'button', title: 'Later', 'aria-label': 'Move later', disabled: i === sp.length - 1, onclick: (e) => { e.stopPropagation(); commit(F.swapSlide(all(), s.id, 1)); api.setPick(s.id); } }, icon('chevronDown', 12)),
          h('button', { type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate slide', onclick: (e) => { e.stopPropagation(); commit(F.duplicateSlide(all(), s.id, end())); } }, icon('copy', 12)),
          h('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete slide', onclick: (e) => { e.stopPropagation(); api.setPick(null); commit(all().filter((x) => x.id !== s.id)); } }, icon('trash', 12))));
      row.addEventListener('click', () => { api.setPick(s.id); api.seek(s.at); });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = sp[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { api.setPick(n.id); api.seek(n.at); strip.querySelector(`[data-slide="${n.id}"]`)?.focus(); } }
      });
      return row;
    }), sp.length ? null : h('p', { class: 'muted small mv-empty' }, 'No slides yet. Add one at the playhead: each slide shows until the next one starts.'));
    strip.querySelector('.mv-frame.on')?.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------------------------------------------------------- the stage */
  const exec = (cmd, value) => { document.execCommand(cmd, false, value); };
  const keep = (e) => e.preventDefault();   // keep the words' focus when a format button is pressed
  function drawFormat() {
    const s = current();
    const b = s?.blocks.find((x) => x.id === focusBlock);
    const fbtn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `mv-fbtn ${cls}`, title, 'aria-label': title, onmousedown: keep, onclick }, label);
    fmt.replaceChildren(
      fbtn(h('b', {}, 'B'), 'Bold (⌘B)', () => exec('bold')),
      fbtn(h('i', {}, 'I'), 'Italic (⌘I)', () => exec('italic')),
      fbtn(h('u', {}, 'U'), 'Underline (⌘U)', () => exec('underline')),
      fbtn(icon('link', 14), 'Link the selected words', async () => {
        const sel = getSelection();
        const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        const url = await uiPrompt('Link to (https://…)', 'https://');
        if (!url || !range) return;
        sel.removeAllRanges(); sel.addRange(range);
        exec('createLink', url);
        range.startContainer.parentElement?.closest('[contenteditable]')?.focus();
      }),
      fbtn(icon('eraser', 14), 'Clear formatting', () => { exec('removeFormat'); exec('unlink'); }),
      h('span', { class: 'mv-fsep' }),
      fbtn(icon('listBullets', 14), 'Bulleted list (turns this text into bullets)', () => listify(false), b?.type === 'bullets' && !b.ordered ? 'on' : ''),
      fbtn(icon('listNumbers', 14), 'Numbered list', () => listify(true), b?.type === 'bullets' && b.ordered ? 'on' : ''),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted small mv-fhint' }, api.playing() ? 'Playing: pause to edit' : 'Click words on the card to edit them'));
  }
  /** Turn the focused text block into a list, a list into the other kind, or back into text. */
  function listify(ordered) {
    const s = current();
    const b = s?.blocks.find((x) => x.id === focusBlock);
    if (!b) { api.say('Click into some words on the card first.'); return; }
    document.activeElement?.blur?.();
    queueMicrotask(() => {
      const fresh = current().blocks.find((x) => x.id === b.id) ?? b;
      if (fresh.type === 'text') {
        const items = fresh.html.split(/<br>/).map((x) => x.trim()).filter(Boolean);
        commit(F.patchBlock(all(), s.id, b.id, { type: 'bullets', items: items.length ? items : ['A point'], ordered, html: undefined }));
      } else if (fresh.type === 'bullets') {
        if (!!fresh.ordered === ordered) commit(F.patchBlock(all(), s.id, b.id, { type: 'text', html: fresh.items.join('<br>'), items: undefined }));
        else commit(F.patchBlock(all(), s.id, b.id, { ordered }));
      }
    });
  }

  function drawStage() {
    const s = current();
    drawFormat();
    if (!s) {
      stageBox.replaceChildren(h('div', { class: 'mv-stage-empty' }, h('p', {}, 'A slideshow podcast is a voice with phone-card slides timed to it.'), h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => api.addSlideHere() }, icon('plus', 14), 'Add the first slide')));
      stageFoot.replaceChildren();
      return;
    }
    const id = s.id;
    const text = { keepStage: true };
    const face = Face(s, {
      n: slides().findIndex((x) => x.id === s.id) + 1, total: slides().length,
      edit: {
        onTitle: (v) => commit(F.patchSlide(all(), id, { title: v }), text),
        onSubtitle: (v) => commit(F.patchSlide(all(), id, { subtitle: v }), text),
        onBlock: (bid, patch) => commit(F.patchBlock(all(), id, bid, patch), text),
        onFocusBlock: (bid) => { if (focusBlock !== bid) { focusBlock = bid; drawInsp(); drawFormat(); } },
        onPickImage: (bid) => { picking = { target: 'block', blockId: bid }; drawInsp(); },
      },
    });
    stageBox.replaceChildren(Fitted(face, { fit: true }));
    const sp = F.spans(all(), end());
    const i = sp.findIndex((x) => x.id === id);
    const b = F.budget(s);
    const go = (d) => { const n = sp[i + d]; if (n) { api.setPick(n.id); api.seek(n.at); } };
    stageFoot.replaceChildren(
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost btn-square', 'aria-label': 'Previous slide', disabled: i <= 0, onclick: () => go(-1) }, icon('chevronLeft', 14)),
      h('strong', {}, `Slide ${i + 1} of ${sp.length}`),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost btn-square', 'aria-label': 'Next slide', disabled: i >= sp.length - 1, onclick: () => go(1) }, icon('chevronRight', 14)),
      h('span', { class: 'muted small' }, `${clock(sp[i].at)} to ${clock(sp[i].until)}`),
      h('span', { class: 'spacer' }),
      h('span', { class: `mv-room${b.over ? ' over' : ''}`, title: `${b.words} of about ${F.LIMITS.words} words, ${b.images} of ${F.LIMITS.images} pictures` },
        h('i', { style: `width:${Math.min(100, (b.words / F.LIMITS.words) * 100)}%` }), `${b.words}/${F.LIMITS.words} words`),
      h('button', { type: 'button', class: 'btn btn-xs', title: 'Play from this slide (space)', onclick: () => { api.seek(sp[i].at); api.play(); } }, icon('play', 12), 'Preview'));
  }

  /* ---------------------------------------------------------------- the inspector */
  const sec = (title, ...body) => h('section', { class: 'mv-sec' }, h('h4', {}, title), ...body);
  const chips = (items, on, pick) => h('div', { class: 'mv-chips' }, items.map((x) => h('button', { type: 'button', class: `mv-chip${x.id === on ? ' on' : ''}`, title: x.blurb ?? x.label, 'aria-pressed': String(x.id === on), onclick: () => pick(x.id) }, x.label)));
  const swatches = (list, on, pick, { auto = false } = {}) => h('div', { class: 'mv-swatches' },
    auto && h('button', { type: 'button', class: `mv-sw auto${on == null ? ' on' : ''}`, title: 'Worked out to suit the background', onclick: () => pick(null) }, 'A'),
    list.map((c) => h('button', { type: 'button', class: `mv-sw${String(on).toLowerCase() === c.toLowerCase() ? ' on' : ''}`, style: `--sw:${c}`, title: WHEEL.find((w) => w.hex === c)?.label ?? c, 'aria-label': `Colour ${WHEEL.find((w) => w.hex === c)?.label ?? c}`, onclick: () => pick(c) })),
    h('label', { class: 'mv-sw custom', title: 'Any colour' }, icon('palette', 12), h('input', { type: 'color', value: on && /^#[0-9a-f]{6}$/i.test(on) ? on : '#ffffff', onchange: (e) => pick(e.target.value) })));

  function drawInsp() {
    const s = current();
    if (!s) { insp.replaceChildren(h('p', { class: 'muted small' }, 'Pick a slide to design it.')); return; }
    if (picking) { insp.replaceChildren(Picker(s)); return; }
    const id = s.id;
    const set = (patch) => commit(F.patchSlide(all(), id, patch));
    const b = s.blocks.find((x) => x.id === focusBlock);
    const checks = F.checks(s);
    const add = (type) => {
      if (!F.canAdd(s, type)) { api.say(type === 'image' ? `A card holds ${F.LIMITS.images} pictures.` : 'The card is full: split it into two slides.'); return; }
      const blk = F.newBlock(type);
      focusBlock = blk.id;
      if (type === 'image') picking = { target: 'block', blockId: blk.id };
      commit(F.addBlock(all(), id, blk, focusBlock && s.blocks.some((x) => x.id === focusBlock) ? focusBlock : null));
    };
    insp.replaceChildren(...[
      sec('Slide',
        chips(F.KINDS, s.kind, (k) => set({ kind: k })),
        h('div', { class: 'mv-row' },
          h('span', { class: 'muted small' }, `Starts ${clock(s.at, true)}`),
          h('button', { type: 'button', class: 'btn btn-xs', title: 'Start this slide at the playhead', onclick: () => set({ at: api.playhead() }) }, 'Start at the playhead'))),
      sec('Add to the card',
        h('div', { class: 'mv-adds' }, F.BLOCK_TYPES.map((t) => h('button', { type: 'button', class: 'mv-add', disabled: !F.canAdd(s, t.id), onclick: () => add(t.id) }, icon({ text: 'textAa', bullets: 'listBullets', image: 'image', card: 'chart' }[t.id], 16), h('span', {}, t.label))))),
      b && sec(`This ${F.BLOCK_TYPES.find((t) => t.id === b.type)?.label.toLowerCase() ?? 'block'}`,
        b.type === 'card' && chips(F.CARD_KINDS, b.card.kind, (k) => commit(F.patchBlock(all(), id, b.id, { card: { kind: k } }))),
        b.type === 'bullets' && h('label', { class: 'mv-row' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: b.ordered, onchange: (e) => commit(F.patchBlock(all(), id, b.id, { ordered: e.target.checked })) }), 'Numbered'),
        b.type === 'image' && [
          h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { picking = { target: 'block', blockId: b.id }; drawInsp(); } }, icon('image', 12), b.src ? 'Change the picture' : 'Choose a picture'),
          h('label', { class: 'mv-field' }, h('span', {}, 'Description (alt text)'), h('input', { class: 'input input-xs', value: b.alt, placeholder: 'What the picture shows', onchange: (e) => commit(F.patchBlock(all(), id, b.id, { alt: e.target.value.trim() })) }))],
        h('div', { class: 'mv-row' },
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost', 'aria-label': 'Move up', onclick: () => commit(F.moveBlock(all(), id, b.id, -1)) }, icon('chevronUp', 12), 'Up'),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost', 'aria-label': 'Move down', onclick: () => commit(F.moveBlock(all(), id, b.id, 1)) }, icon('chevronDown', 12), 'Down'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost text-error', onclick: () => { focusBlock = null; commit(F.removeBlock(all(), id, b.id)); } }, icon('trash', 12), 'Remove'))),
      sec('Background',
        swatches(F.SWATCHES, s.bg.colour, (c) => set({ bg: { ...s.bg, colour: c ?? '#ffffff' } })),
        h('div', { class: 'mv-row' },
          s.bg.image ? h('span', { class: 'mv-pic-now', style: `background-image:url("${encodeURI(s.bg.image)}")` }) : null,
          h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { picking = { target: 'bg' }; drawInsp(); } }, icon('image', 12), s.bg.image ? 'Change picture' : 'Add a picture'),
          s.bg.image && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => set({ bg: { ...s.bg, image: null } }) }, 'Remove')),
        s.bg.image && chips([{ id: 'banner', label: 'Banner across the top' }, { id: 'full', label: 'Fill the card' }], s.banner ? 'banner' : 'full', (v) => set({ banner: v === 'banner', bg: { ...s.bg, overlay: v === 'banner' ? 0 : Math.max(0.35, s.bg.overlay) } })),
        s.bg.image && !s.banner && h('label', { class: 'mv-field' }, h('span', {}, `Shade over the picture: ${Math.round(s.bg.overlay * 100)}%`),
          h('input', { type: 'range', class: 'range range-xs', min: 0, max: 0.9, step: 0.05, value: s.bg.overlay, onchange: (e) => set({ bg: { ...s.bg, overlay: +e.target.value } }) }))),
      sec('Colours',
        h('p', { class: 'mv-label' }, 'Words'), swatches([INK, '#ffffff', s.tone], s.ink, (c) => set({ ink: c }), { auto: true }),
        h('p', { class: 'mv-label' }, 'Accent (rules, bullets, cards)'), swatches(WHEEL.map((w) => w.hex), s.tone, (c) => set({ tone: c ?? s.tone }))),
      sec('Transition in',
        chips(F.TRANSITIONS, s.transition.type, (t) => set({ transition: { type: t, ms: F.TRANSITIONS.find((x) => x.id === t).ms } })),
        s.transition.type !== 'cut' && h('label', { class: 'mv-field' }, h('span', {}, `Length: ${(s.transition.ms / 1000).toFixed(1)} s`),
          h('input', { type: 'range', class: 'range range-xs', min: 200, max: 1500, step: 50, value: s.transition.ms, onchange: (e) => set({ transition: { ...s.transition, ms: +e.target.value } }) })),
        h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => { commit(all().map((x) => ({ ...x, transition: { ...s.transition } }))); api.say('Every slide now arrives the same way.'); } }, 'Use on every slide')),
      sec('Checks',
        checks.length ? h('ul', { class: 'mv-checks' }, checks.map((c) => h('li', { class: c.level }, icon(c.level === 'warn' ? 'warn' : 'info', 13), h('span', {}, c.text)))) : h('p', { class: 'mv-ok small' }, icon('check', 13), 'Reads well: contrast, room and descriptions are fine.')),
      sec('Notes (what’s said)',
        h('textarea', { class: 'textarea textarea-xs mv-notes', rows: 3, placeholder: 'The words said while this slide shows. They make the transcript.', onchange: (e) => set({ notes: e.target.value }) }, s.notes)),
    ].filter(Boolean));
  }

  /** Choose a picture: the photo library, designs in the slide's colours, an upload or a web address. */
  let pickTab = 'photos';
  function Picker(s) {
    const use = (src, alt = '') => {
      const p = picking;
      picking = null;
      if (p.target === 'bg') commit(F.patchSlide(all(), s.id, { bg: { ...s.bg, image: src, overlay: s.banner ? 0 : Math.max(0.35, s.bg.overlay) } }));
      else commit(F.patchBlock(all(), s.id, p.blockId, { src, alt: s.blocks.find((x) => x.id === p.blockId)?.alt || alt }));
    };
    const tabs = [['photos', 'Photos'], ['designs', 'Designs'], ['upload', 'Upload'], ['url', 'Web address']];
    const colours = [s.tone, s.bg.colour === '#ffffff' ? '#f4f1ea' : s.bg.colour, INK];
    const seed = [...s.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 97;
    let body;
    if (pickTab === 'photos') body = h('div', { class: 'mv-pics' }, PHOTOS.map((p) => h('button', { type: 'button', class: 'mv-pic', title: p.title, onclick: () => use(photoUrl(p), p.title) }, h('img', { src: photoThumb(p), alt: p.title, loading: 'lazy' }))));
    else if (pickTab === 'designs') body = h('div', { class: 'mv-pics' }, ART_STYLES.map((a) => h('button', { type: 'button', class: 'mv-pic', title: a.label, onclick: () => use(artUrl(a.id, colours, seed, 810, 540), '') }, h('img', { src: artUrl(a.id, colours, seed, 270, 180), alt: a.label }))));
    else if (pickTab === 'upload') body = h('label', { class: 'mv-drop' }, icon('upload', 18), h('span', {}, 'Choose a picture from your computer'), h('small', { class: 'muted' }, 'Kept with the slide, resized to 900 px'),
      h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (e) => { try { use(await readImage(e.target.files[0], 900), ''); } catch (err) { api.say(err.message); } } }));
    else body = h('form', { class: 'mv-row', onsubmit: (e) => { e.preventDefault(); const v = e.target.url.value.trim(); if (/^https?:\/\//i.test(v)) use(v); else api.say('Use a full address, starting https://'); } },
      h('input', { name: 'url', class: 'input input-xs grow', placeholder: 'https://…/picture.jpg' }), h('button', { class: 'btn btn-xs' }, 'Use'));
    return h('div', { class: 'mv-picker' },
      h('header', { class: 'mv-row' }, h('strong', {}, picking.target === 'bg' ? 'Background picture' : 'Picture on the card'), h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => { picking = null; drawInsp(); } }, 'Cancel')),
      h('div', { class: 'mv-chips' }, tabs.map(([t, label]) => h('button', { type: 'button', class: `mv-chip${t === pickTab ? ' on' : ''}`, onclick: () => { pickTab = t; drawInsp(); } }, label))),
      body);
  }

  /* ---------------------------------------------------------------- drawing and playing */
  function draw({ keepStage = false } = {}) {
    drawStrip();
    if (!keepStage || !stageBox.firstChild) drawStage();
    else drawFormat();
    if (!(keepStage && insp.contains(document.activeElement))) drawInsp();
    if (keepStage) {
      // The words are already on the card: only the slide's foot (room left) needs a refresh.
      const s = current();
      const b = s && F.budget(s);
      const room = stageFoot.querySelector('.mv-room');
      if (room && b) { room.classList.toggle('over', b.over); room.lastChild.textContent = `${b.words}/${F.LIMITS.words} words`; room.firstChild.style.width = `${Math.min(100, (b.words / F.LIMITS.words) * 100)}%`; }
    }
  }
  /** Each frame: while playing, the stage is the screen. */
  function tick(t) {
    const playing = api.playing();
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      liveBox.hidden = !playing;
      stageBox.hidden = playing;
      el.classList.toggle('playing', playing);
      live.refresh();
      if (playing) live.show(slides(), t, { animate: false });
      else { api.setPick(null); draw(); }
      drawFormat();
    }
    if (playing) {
      const before = live.el.querySelector('.sp-layer:last-child .sf')?.dataset.slide;
      live.show(slides(), t);
      const now = live.el.querySelector('.sp-layer:last-child .sf')?.dataset.slide;
      if (now !== before) for (const f of strip.querySelectorAll('.mv-frame')) f.classList.toggle('live', f.dataset.slide === now);
    }
  }
  return { el, draw, tick, current };
}

function clock(t, tenths = false) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${(tenths ? s.toFixed(1) : String(Math.floor(s))).padStart(tenths ? 4 : 2, '0')}`;
}
