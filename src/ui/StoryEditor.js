import { h } from './dom.js';
import { icon } from './icons.js';
import { Drawer } from './drawer.js';
import { readImage } from './images.js';
import { PHOTOS, PHOTO_GROUPS, photoUrl, photoThumb, photoCredit } from '../platform/photos.js';
import { STORY_FORMS, storyFormById, MAX_STORY_IMAGES, wordCount, blankStory } from '../platform/stories.js';

/**
 * Story cards (alpha 0.3): one look and one editor wherever they turn up,
 * in the Asset manager and in the Plan designer.
 *
 *   StoryCard(story, { size: 'tile' | 'full' })   a card, drawn the same everywhere
 *   StoryEditor({ story, title, onSave(story), onDelete? })   a side drawer to write one
 *   StoryPicker({ stories, chosen: [assetId], max, onPick([story]), onNew? })   pick cards from Assets
 *
 * `story` is { assetId?, title, subtitle, body, images, tags, form } (see platform/stories.js).
 */
export function StoryCard(st, { size = 'full' } = {}) {
  const img = st.images?.[0];
  return h('article', { class: `sc-card sc-${size} f-${st.form ?? 'chunk'}` },
    img && h('figure', { class: 'sc-pic' }, h('img', { src: img.url, alt: img.alt ?? '', loading: 'lazy', draggable: false })),
    h('div', { class: 'sc-text' },
      h('p', { class: 'sc-form' }, icon('story', 12), storyFormById[st.form]?.label ?? 'Story card'),
      h('h3', { class: 'sc-title' }, st.title || 'Untitled story'),
      st.subtitle && h('p', { class: 'sc-sub' }, st.subtitle),
      size === 'full' && st.body && h('p', { class: 'sc-body' }, st.body),
      size === 'full' && st.images?.[1] && h('img', { class: 'sc-inline', src: st.images[1].url, alt: st.images[1].alt ?? '', loading: 'lazy' }),
      size === 'full' && st.tags?.length > 0 && h('p', { class: 'sc-tags' }, st.tags.map((t) => h('span', {}, `#${t}`)))));
}

const cleanTags = (v) => String(v ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '').slice(0, 40)).filter(Boolean);

export function StoryEditor({ story = null, title = null, onSave, onDelete = null }) {
  const st = { ...blankStory(), title: '', tags: [], ...(story ?? {}), images: [...(story?.images ?? [])] };
  let picking = null; // which picture slot has its picker open
  const d = Drawer({ title: title ?? (story?.title ? 'Edit story card' : 'New story card'), sub: 'A short piece to reuse: in plan documents, on sites, on slides.', wide: true, body: h('div'), actions: [] });

  const field = (label, control, hint = null) => h('label', { class: 'sc-field' }, h('span', { class: 'sc-label' }, label), control, hint && h('small', { class: 'sc-hint' }, hint));
  function draw() {
    const form = storyFormById[st.form] ?? STORY_FORMS[0];
    const words = wordCount(st.body);
    const over = words > form.words;
    const counter = h('small', { class: `sc-count${over ? ' over' : ''}` }, `${words} of about ${form.words} words`);
    const body = h('textarea', { class: 'textarea w-full', rows: form.id === 'post' ? 12 : 6, value: st.body, placeholder: form.hint,
      oninput: (e) => { st.body = e.target.value; const n = wordCount(st.body); counter.textContent = `${n} of about ${form.words} words`; counter.classList.toggle('over', n > form.words); preview.replaceChildren(StoryCard(st)); } });
    const preview = h('div', { class: 'sc-preview' }, StoryCard(st));
    const live = (key) => (e) => { st[key] = e.target.value; preview.replaceChildren(StoryCard(st)); };
    d.setBody(h('div', { class: 'sc-editor' },
      h('div', { class: 'sc-fields' },
        h('div', { class: 'sc-field' }, h('span', { class: 'sc-label' }, 'What kind of piece'),
          h('div', { class: 'sc-forms', role: 'radiogroup', 'aria-label': 'What kind of piece' }, STORY_FORMS.map((f) => h('button', {
            type: 'button', role: 'radio', class: `sc-form-pick${st.form === f.id ? ' on' : ''}`, 'aria-checked': String(st.form === f.id), title: f.hint,
            onclick: () => { st.form = f.id; draw(); },
          }, h('b', {}, f.label), h('small', {}, `~${f.words} words`))))),
        field('Title', h('input', { class: 'input w-full', value: st.title, maxlength: 120, placeholder: 'e.g. The first boat back on the bay', oninput: live('title') })),
        field('Subtitle', h('input', { class: 'input w-full', value: st.subtitle, maxlength: 160, placeholder: 'A line that says why it matters', oninput: live('subtitle') })),
        h('div', { class: 'sc-field' }, h('span', { class: 'sc-label' }, 'The words'), body, counter),
        h('div', { class: 'sc-field' }, h('span', { class: 'sc-label' }, `Pictures (up to ${MAX_STORY_IMAGES})`),
          h('div', { class: 'sc-pics' }, [0, 1].map((i) => PicSlot(i))),
          picking != null && Picker()),
        field('Tags', h('input', { class: 'input w-full', value: st.tags.join(', '), placeholder: 'youth, fisheries, volunteers', onchange: (e) => { st.tags = cleanTags(e.target.value); preview.replaceChildren(StoryCard(st)); } }), 'Separate tags with commas.')),
      h('div', { class: 'sc-side' }, h('span', { class: 'sc-label' }, 'How it looks'), preview)));
    d.setActions([
      onDelete && h('button', { type: 'button', class: 'btn btn-sm btn-ghost text-error', onclick: () => { onDelete(); d.close(); } }, icon('trash', 14), 'Remove'),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => d.close() }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
        if (!st.title.trim()) { d.el.querySelector('.sc-fields input.input')?.focus(); return; }
        onSave({ ...st, title: st.title.trim(), subtitle: st.subtitle.trim(), body: st.body.trim(), images: st.images.filter((x) => x?.url) });
        d.close();
      } }, icon('check', 14), 'Save story card'),
    ].filter(Boolean));
  }

  function PicSlot(i) {
    const img = st.images[i];
    if (i > st.images.filter(Boolean).length) return null;
    return h('div', { class: `sc-pic-slot${picking === i ? ' on' : ''}` },
      img ? h('img', { src: img.url, alt: img.alt ?? '' }) : h('span', { class: 'sc-pic-empty' }, icon('image', 22)),
      h('div', { class: 'sc-pic-actions' },
        h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { picking = picking === i ? null : i; draw(); } }, img ? 'Change' : i === 0 ? 'Add a picture' : 'Add a second'),
        img && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => { st.images.splice(i, 1); picking = null; draw(); } }, 'Remove')));
  }

  function Picker() {
    const set = (img) => { st.images[picking] = img; st.images = st.images.filter(Boolean); picking = null; draw(); };
    const url = h('input', { class: 'input input-sm grow', placeholder: 'https://… a picture’s web address' });
    const status = h('small', { class: 'sc-hint' }, '');
    return h('div', { class: 'sc-picker' },
      PHOTO_GROUPS.map((g) => [h('p', { class: 'sc-label' }, g.label),
        h('div', { class: 'sc-photo-grid' }, PHOTOS.filter((p) => p.group === g.id).map((p) => h('button', { type: 'button', class: 'sc-photo', title: `${p.title} · ${photoCredit(p)}`,
          onclick: () => set({ url: photoUrl(p), alt: p.title, credit: photoCredit(p), photoId: p.id }) }, h('img', { src: photoThumb(p), alt: '', loading: 'lazy' }))))]),
      h('div', { class: 'sc-picker-row' },
        h('label', { class: 'btn btn-xs' }, icon('upload', 13), 'Upload', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
          try { set({ url: await readImage(e.target.files[0], 1400), alt: '', credit: '' }); } catch (err) { status.textContent = err.message; }
        } })),
        h('div', { class: 'join grow' }, url, h('button', { type: 'button', class: 'btn btn-xs join-item', onclick: () => { if (/^https:\/\//.test(url.value.trim())) set({ url: url.value.trim(), alt: '', credit: '' }); else status.textContent = 'Web addresses start with https://'; } }, 'Use'))),
      status);
  }

  draw();
  return d;
}

export function StoryPicker({ stories, chosen = [], max = 3, onPick, onNew = null }) {
  const picked = new Set(chosen);
  let q = '';
  const d = Drawer({ title: 'Story cards', sub: `Pick up to ${max} from Assets. They stay one copy: edit a card there and it changes here.`, wide: true, body: h('div'), actions: [] });
  const search = h('input', { type: 'search', class: 'input input-sm w-full', placeholder: 'Search story cards', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  function draw() {
    const list = stories.filter((s) => !q || [s.title, s.subtitle, s.body, ...(s.tags ?? [])].join(' ').toLowerCase().includes(q));
    d.setBody(h('div', { class: 'sc-pick' }, search,
      !stories.length && h('p', { class: 'sc-hint' }, 'No story cards yet. Write the first one.'),
      h('div', { class: 'sc-pick-grid' }, list.map((s) => {
        const on = picked.has(s.assetId);
        return h('button', { type: 'button', class: `sc-pick-item${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: !on && picked.size >= max,
          onclick: () => { if (on) picked.delete(s.assetId); else if (picked.size < max) picked.add(s.assetId); draw(); } },
        on && h('span', { class: 'sc-pick-tick' }, icon('check', 13)), StoryCard(s, { size: 'tile' }));
      }))));
    d.setActions([
      onNew && h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { d.close(); onNew(); } }, icon('plus', 14), 'Write a new one'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'sc-hint' }, `${picked.size} of ${max}`),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => d.close() }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
        // Keep the order they were already in, then the new ones in the order shown.
        const order = [...chosen.filter((id) => picked.has(id)), ...stories.map((s) => s.assetId).filter((id) => picked.has(id) && !chosen.includes(id))];
        onPick(order.map((id) => stories.find((s) => s.assetId === id)).filter(Boolean));
        d.close();
      } }, 'Use these'),
    ].filter(Boolean));
  }
  draw();
  return d;
}
