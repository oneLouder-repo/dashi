import { h } from './dom.js';
import { PHOTOS, PHOTO_GROUPS, photoThumb, photoCredit } from '../platform/photos.js';

/**
 * A row of photos from the library (alpha 0.3), to pick a banner or
 * background in any public property designer. `current` is the chosen
 * photo's id; `pick(photo)` is called with the photo clicked.
 */
export function PhotoRow({ current, pick, label = 'Or pick a photo' }) {
  let group = 'all';
  const strip = h('div', { class: 'photo-row-strip', role: 'radiogroup', 'aria-label': label });
  const draw = () => strip.replaceChildren(...PHOTOS.filter((p) => group === 'all' || p.group === group).map((p) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(current === p.id), class: `photo-row-item${current === p.id ? ' on' : ''}`, title: `${p.title}. ${photoCredit(p)}`, onclick: () => pick(p) },
      h('img', { src: photoThumb(p), alt: p.title, loading: 'lazy' }))));
  const tabs = h('div', { class: 'photo-row-tabs' }, [{ id: 'all', label: 'All' }, ...PHOTO_GROUPS].map((g) =>
    h('button', { type: 'button', class: `btn btn-xs${group === g.id ? ' btn-active' : ' btn-ghost'}`, onclick: (e) => { group = g.id; [...tabs.children].forEach((b) => { b.classList.toggle('btn-active', b === e.currentTarget); b.classList.toggle('btn-ghost', b !== e.currentTarget); }); draw(); } }, g.label)));
  draw();
  return h('div', { class: 'photo-row' }, h('div', { class: 'photo-row-head' }, h('span', { class: 'lk-label' }, label), tabs), strip);
}
