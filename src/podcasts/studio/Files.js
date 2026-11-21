import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { uiAlert, uiConfirm, uiPrompt } from '../../ui/dialog.js';
import { putMedia, mediaUrl } from '../../platform/media.js';
import { isAudioFile } from '../../platform/podcasts.js';
import { uid } from '../../core/ops.js';
import { audioContext, keepBuffer } from './audio.js';
import { clock } from './project.js';
import { prettySize } from '../../platform/assetHub.js';

/**
 * The studio's audio files (alpha 0.3): every recording, import, jingle and
 * bed the org has, kept in the podcasts document as `files`, so a station
 * can hold many audio files and reuse them across sessions. The same files
 * show in the Asset manager as assets ("Studio audio"), like episodes do.
 *
 *   AudioFile { id, name, mediaId, duration, size, type, origin: 'import' | 'recording' | 'mixdown',
 *               tags: [], createdAt, createdBy }
 *
 *   #studio/files         the file manager (StudioFiles)
 *   FilesPicker(ctx, …)   the lighter chooser in a session's dock
 *
 * ctx = { store, col, doc(), org, go(hash) }
 */
export const ORIGINS = { import: 'Imported', recording: 'Recorded here', mixdown: 'Mixdown' };

/** Keep a file the studio already stored (a take, an import) in the org's audio files. */
export function rememberFile(ctx, { mediaId, name, duration, size, type, origin = 'import' }) {
  const existing = Object.values(ctx.doc().files ?? {}).find((f) => f.mediaId === mediaId);
  if (existing) return existing;
  const file = { id: uid('aud'), name, mediaId, duration: Math.round((duration ?? 0) * 10) / 10, size: size ?? null, type: type ?? 'audio/wav', origin, tags: [], createdAt: new Date().toISOString(), createdBy: ctx.me ?? null };
  ctx.store.apply(ctx.col.add('files', file));
  return file;
}

/** Upload audio files from the computer into the library: returns the files kept. */
export async function uploadFiles(ctx, fileList, say = () => {}) {
  const out = [];
  for (const f of fileList) {
    if (!isAudioFile(f) && !/^audio\//.test(f.type)) { uiAlert(`${f.name} isn’t an audio file (.mp3, .wav or .m4a).`); continue; }
    try {
      say(`Saving ${f.name}…`);
      const buf = await audioContext().decodeAudioData(await f.arrayBuffer());
      const mediaId = await putMedia(f, { onProgress: (p) => say(`Saving ${f.name}… ${Math.floor(p * 100)}%`) });
      keepBuffer({ mediaId }, buf);
      out.push(rememberFile(ctx, { mediaId, name: f.name.replace(/\.[a-z0-9]+$/i, ''), duration: buf.duration, size: f.size, type: f.type, origin: 'import' }));
    } catch (err) { uiAlert(`Couldn’t bring in ${f.name}: ${err.message}`); }
  }
  say(out.length ? `${out.length} file${out.length === 1 ? '' : 's'} in.` : '');
  return out;
}

/** The sessions that use a file. */
export const usesOf = (doc, file) => Object.values(doc.projects ?? {}).filter((p) =>
  Object.values(p.clips ?? {}).some((c) => c.source?.mediaId === file.mediaId) || (p.pads ?? []).some((d) => d.source?.mediaId === file.mediaId));

/** A small play button that plays a file (one at a time across the page). */
let playing = null;
function PlayButton(file) {
  const btn = h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square af-play', 'aria-label': `Play ${file.name}`, title: 'Play' }, icon('play', 14));
  btn.onclick = async () => {
    if (playing?.btn === btn) { playing.audio.pause(); playing = null; btn.replaceChildren(icon('play', 14)); return; }
    if (playing) { playing.audio.pause(); playing.btn.replaceChildren(icon('play', 14)); }
    const url = await mediaUrl(file.mediaId);
    if (!url) return uiAlert('That file is missing: it may have been deleted.');
    const audio = new Audio(url);
    playing = { audio, btn };
    btn.replaceChildren(icon('pause', 14));
    audio.onended = () => { btn.replaceChildren(icon('play', 14)); if (playing?.btn === btn) playing = null; };
    audio.play().catch(() => {});
  };
  return btn;
}

const sorted = (doc) => Object.values(doc.files ?? {}).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

/** #studio/files: every audio file, to upload, play, rename, tag or delete. */
export function StudioFiles(ctx) {
  let query = '';
  let origin = 'all';
  const status = h('span', { class: 'muted small', role: 'status' });
  const say = (t) => { status.textContent = t; };
  const input = h('input', { type: 'file', accept: '.mp3,.wav,.m4a,audio/*', multiple: true, class: 'sr-only', onchange: async (e) => { await uploadFiles(ctx, [...e.target.files], say); e.target.value = ''; draw(); } });
  const list = h('div', { class: 'af-list' });
  const draw = () => {
    const doc = ctx.doc();
    const all = sorted(doc);
    const q = query.toLowerCase();
    const shown = all.filter((f) => (origin === 'all' || f.origin === origin) && (!q || [f.name, ...(f.tags ?? [])].join(' ').toLowerCase().includes(q)));
    list.replaceChildren(shown.length ? h('table', { class: 'table af-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Name'), h('th', {}, 'Length'), h('th', {}, 'Where from'), h('th', {}, 'Used in'), h('th', {}, ''))),
      h('tbody', {}, shown.map((f) => {
        const uses = usesOf(doc, f);
        return h('tr', {},
          h('td', {}, PlayButton(f)),
          h('td', {}, h('strong', {}, f.name), h('small', { class: 'muted af-size' }, [prettySize(f.size), (f.tags ?? []).map((t) => `#${t}`).join(' ')].filter(Boolean).join(' · '))),
          h('td', { class: 'af-num' }, clock(f.duration ?? 0, { tenths: false })),
          h('td', {}, ORIGINS[f.origin] ?? 'Imported'),
          h('td', {}, uses.length ? uses.slice(0, 2).map((p, i) => [i ? ', ' : '', h('a', { href: `#studio/${p.id}` }, p.title)]) : h('span', { class: 'muted' }, 'Not used yet')),
          h('td', { class: 'af-tools' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: async () => { const n = await uiPrompt('Name', f.name, { title: 'Rename the file', ok: 'Rename' }); if (n?.trim()) { ctx.store.apply(ctx.col.update('files', f.id, { name: n.trim() })); draw(); } } }, 'Rename'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: async () => { const t = await uiPrompt('Tags, separated by commas', (f.tags ?? []).join(', '), { title: 'Tag the file', ok: 'Save' }); if (t != null) { ctx.store.apply(ctx.col.update('files', f.id, { tags: t.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean) })); draw(); } } }, 'Tags'),
            h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-error', 'aria-label': `Delete ${f.name}`, onclick: async () => {
              if (!await uiConfirm(uses.length ? `“${f.name}” is used in ${uses.length} session${uses.length === 1 ? '' : 's'}. Take it out of the list anyway? The sessions keep playing it.` : `Delete “${f.name}” from the list?`)) return;
              ctx.store.apply(ctx.col.remove('files', f.id)); draw();
            } }, icon('trash', 13))));
      })))
      : h('p', { class: 'empty' }, all.length ? 'Nothing matches.' : 'No audio files yet. Upload some, or record a take in a session: every recording lands here too.'));
  };
  const counts = () => { const all = sorted(ctx.doc()); return Object.fromEntries(['all', ...Object.keys(ORIGINS)].map((k) => [k, k === 'all' ? all.length : all.filter((f) => f.origin === k).length])); };
  const c = counts();
  const seg = h('div', { class: 'join af-filter' }, ['all', ...Object.keys(ORIGINS)].map((k) => h('button', { type: 'button', class: `btn btn-sm join-item${origin === k ? ' btn-active' : ''}`, onclick: (e) => { origin = k; [...seg.children].forEach((b) => b.classList.toggle('btn-active', b === e.currentTarget)); draw(); } }, k === 'all' ? `All ${c.all}` : `${ORIGINS[k]} ${c[k]}`)));
  draw();
  return h('div', { class: 'pc-main af' },
    h('header', { class: 'st-home-head af-head' },
      h('div', {},
        h('h1', {}, icon('waveform', 24), 'Audio files'),
        h('p', { class: 'muted' }, 'Every recording, interview, jingle and music bed, in one place to use in any session. They show in Assets too, as Studio audio.')),
      h('label', { class: 'btn btn-primary btn-sm' }, icon('upload', 15), 'Upload audio', input)),
    h('div', { class: 'af-bar' },
      h('label', { class: 'input input-sm af-search' }, icon('search', 14), h('input', { type: 'search', placeholder: 'Search names and tags', oninput: (e) => { query = e.target.value; draw(); } })),
      seg, status),
    list);
}

/** The lighter chooser, in a session's dock: search, hear, add at the playhead. */
export function FilesPicker(ctx, { onAdd, onUploaded }) {
  let query = '';
  const say = (t) => { status.textContent = t; };
  const status = h('span', { class: 'muted small', role: 'status' });
  const input = h('input', { type: 'file', accept: '.mp3,.wav,.m4a,audio/*', multiple: true, class: 'sr-only', onchange: async (e) => { const got = await uploadFiles(ctx, [...e.target.files], say); e.target.value = ''; onUploaded?.(got); draw(); } });
  const list = h('ul', { class: 'st-lib af-pick' });
  const draw = () => {
    const q = query.toLowerCase();
    const files = sorted(ctx.doc()).filter((f) => !q || [f.name, ...(f.tags ?? [])].join(' ').toLowerCase().includes(q)).slice(0, 60);
    list.replaceChildren(...(files.length ? files.map((f) => h('li', {},
      PlayButton(f),
      h('span', {}, h('strong', {}, f.name), h('small', { class: 'muted' }, ` ${clock(f.duration ?? 0, { tenths: false })} · ${ORIGINS[f.origin] ?? 'Imported'}`)),
      h('button', { type: 'button', class: 'btn btn-xs', onclick: () => onAdd(f) }, icon('plus', 12), 'Add at the playhead')))
      : [h('li', { class: 'muted' }, query ? 'Nothing matches.' : 'No audio files yet: upload some, or record a take.')]));
  };
  draw();
  return h('div', { class: 'af-picker' },
    h('div', { class: 'af-bar' },
      h('label', { class: 'input input-sm af-search' }, icon('search', 14), h('input', { type: 'search', placeholder: 'Search audio files', oninput: (e) => { query = e.target.value; draw(); } })),
      h('label', { class: 'btn btn-sm' }, icon('upload', 14), 'Upload', input),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#studio/files' }, 'Manage files'),
      status),
    list);
}
