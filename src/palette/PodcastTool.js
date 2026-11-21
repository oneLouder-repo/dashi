import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { isAudioFile, slugify, published, seasonsOf, showsInOrder, nextNumber } from '../platform/podcasts.js';
import { putMedia, audioDuration, maxUploadMb } from '../platform/media.js';
import { fmtDuration, Cover, EpisodeArt } from '../site/station.js';
import { today, short } from '../strategy/dates.js';
import { uiAlert } from '../ui/dialog.js';
import { linkTo } from '../plugins.js';


/**
 * Podcast publishing mini-tool (only when the org has the Podcasts plugin):
 * put an episode out in one step, and push drafts and scheduled episodes
 * live. Series settings, seasons and the station's look stay in Podcasts.
 */
export function PodcastTool(ctx) {
  const store = ctx.podcasts;
  const doc = store.doc;
  const now = today();
  const shows = showsInOrder(doc);
  const site = ctx.org.sites[doc.station.siteId];
  const stationUrl = `site.html?site=${doc.station.siteId}&view=station`;
  const showOf = (e) => doc.podcasts[e.podcastId];
  const waiting = Object.values(doc.episodes).filter((e) => !published(e, now) && showOf(e)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const latest = Object.values(doc.episodes).filter((e) => published(e, now) && showOf(e)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
  const publishNow = (e) => store.apply(col.update('episodes', e.id, { status: 'published', publishedAt: now }));
  const next = waiting.find((e) => e.status !== 'draft');
  const row = (e, action) => h('li', { class: 'pq-ep' },
    EpisodeArt(e, showOf(e), 44),
    h('div', { class: 'pq-ep-text' },
      h('strong', {}, e.title),
      h('small', { class: 'muted' }, [showOf(e).title, `S${e.season} · E${e.number ?? '?'}`, fmtDuration(e.audio?.duration)].filter(Boolean).join(' · '))),
    h('span', { class: `pq-when ${e.status === 'draft' ? 'draft' : e.publishedAt > now ? 'soon' : 'out'}` }, e.status === 'draft' ? 'Draft' : e.publishedAt > now ? `Out ${short(e.publishedAt)}` : short(e.publishedAt)),
    action,
    h('a', { class: 'btn btn-xs btn-ghost', href: linkTo('podcasts', `#episodes/${e.id}/edit`), title: 'Notes, guests and chapters' }, 'Edit'));

  return h('div', { class: 'pq' },
    h('div', { class: 'pq-head' },
      h('div', {},
        h('h1', {}, 'Podcast publishing'),
        h('p', { class: 'lede' }, 'Drop an episode in and put it out, or send a draft live. Series, seasons and how the station looks are in ', h('a', { href: linkTo('podcasts') }, 'Podcasts'), '.')),
      h('div', { class: 'pq-head-actions' },
        site ? h('a', { class: 'btn btn-sm', href: stationUrl, target: '_blank', rel: 'noopener' }, icon('globe', 14), 'Station page') : h('span', { class: 'muted small' }, 'The station isn’t on a site yet.'),
        h('a', { class: 'btn btn-sm btn-ghost', href: linkTo('podcasts') }, icon('mic', 14), 'Open Podcasts'))),
    h('div', { class: 'pq-stats' },
      h('div', {}, h('strong', {}, String(shows.length)), h('small', {}, shows.length === 1 ? 'show' : 'shows')),
      h('div', {}, h('strong', {}, String(Object.values(doc.episodes).filter((e) => published(e, now)).length)), h('small', {}, 'episodes out')),
      h('div', {}, h('strong', {}, String(waiting.length)), h('small', {}, 'waiting')),
      h('div', {}, h('strong', {}, next ? short(next.publishedAt) : '—'), h('small', {}, next ? `next: ${next.title}` : 'nothing scheduled'))),
    h('div', { class: 'pq-grid' },
      shows.length ? QuickPublish(ctx, shows, now) : h('p', { class: 'empty' }, 'No shows yet. Make one in ', h('a', { href: linkTo('podcasts') }, 'Podcasts'), ' first.'),
      h('div', { class: 'pq-lists' },
        h('section', { class: 'pq-box' },
          h('h2', {}, 'Waiting to go out', h('span', { class: 'dg-count' }, String(waiting.length))),
          waiting.length
            ? h('ul', { class: 'pq-eps' }, waiting.map((e) => row(e, h('button', { class: 'btn btn-xs btn-primary', onclick: () => publishNow(e) }, 'Publish now'))))
            : h('p', { class: 'muted small' }, 'No drafts or scheduled episodes. Anything you save as a draft or schedule shows here.')),
        h('section', { class: 'pq-box' },
          h('h2', {}, 'Out now'),
          latest.length ? h('ul', { class: 'pq-eps' }, latest.map((e) => row(e, null))) : h('p', { class: 'muted small' }, 'Nothing published yet.')))));
}

function QuickPublish(ctx, shows, now) {
  const store = ctx.podcasts;
  ctx.quickShow = shows.some((s) => s.id === ctx.quickShow) ? ctx.quickShow : shows[0].id;
  const seasons = seasonsOf(store.doc, ctx.quickShow);
  const last = seasons.at(-1)?.number ?? 1;
  const f = {
    show: h('select', { class: 'select select-sm', name: 'q-show', 'aria-label': 'Series', onchange: (e) => { ctx.quickShow = e.target.value; ctx.render(); } },
      options(shows.map((s) => ({ id: s.id, label: s.title })), ctx.quickShow)),
    season: h('select', { class: 'select select-sm', name: 'q-season', 'aria-label': 'Season' },
      options([...seasons.map((s) => ({ id: String(s.number), label: s.title || `Season ${s.number}` })), { id: 'new', label: `New season (${last + 1})` }], String(last))),
    file: h('input', { class: 'sr-only', type: 'file', name: 'q-file', accept: '.mp3,.wav,audio/mpeg,audio/wav', 'aria-label': 'Audio file (.mp3 or .wav)' }),
    title: h('input', { class: 'input input-sm', name: 'q-title', placeholder: 'Episode title', required: true }),
    description: h('input', { class: 'input input-sm', name: 'q-description', placeholder: 'One line on what it is about' }),
    when: h('select', { class: 'select select-sm', name: 'q-when', 'aria-label': 'When' },
      options([{ id: 'now', label: 'Publish now' }, { id: 'later', label: 'Schedule for a date' }, { id: 'draft', label: 'Save as a draft' }], 'now')),
    date: h('input', { class: 'input input-sm', type: 'date', name: 'q-date', value: now, min: now, 'aria-label': 'Publish on', hidden: true }),
  };
  f.when.addEventListener('change', () => { f.date.hidden = f.when.value !== 'later'; });
  f.file.addEventListener('change', () => {
    const file = f.file.files[0];
    if (file && !isAudioFile(file)) { uiAlert('Choose an .mp3 or .wav file.'); f.file.value = ''; return; }
    if (file && !f.title.value) f.title.value = file.name.replace(/\.(mp3|wav)$/i, '').replace(/[-_]+/g, ' ');
  });
  const submit = h('button', { class: 'btn btn-primary w-full', type: 'submit' }, icon('upload', 16), 'Upload and publish');
  const dropLabel = h('span', { class: 'pq-drop-name' }, 'Drop an .mp3 or .wav here, or click to choose');
  const showFile = () => { const file = f.file.files[0]; dropLabel.textContent = file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : 'Drop an .mp3 or .wav here, or click to choose'; drop.classList.toggle('has-file', !!file); };
  f.file.addEventListener('change', showFile);
  f.when.addEventListener('change', () => { submit.lastChild.textContent = f.when.value === 'draft' ? 'Upload as a draft' : f.when.value === 'later' ? 'Upload and schedule' : 'Upload and publish'; });
  const drop = h('label', { class: 'pq-drop',
    ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); const dt = new DataTransfer(); const file = e.dataTransfer.files[0]; if (!file) return; dt.items.add(file); f.file.files = dt.files; f.file.dispatchEvent(new Event('change')); } },
    h('span', { class: 'pq-drop-icon' }, icon('cloudUpload', 28)), dropLabel, h('small', { class: 'muted' }, `Up to ${maxUploadMb()} MB`), f.file);

  return h('form', { class: 'pq-form', onsubmit: async (ev) => {
    ev.preventDefault();
    const file = f.file.files[0];
    if (!file) return uiAlert('Choose an .mp3 or .wav file first.');
    if (file.size > maxUploadMb() * 1048576) return uiAlert(`Audio files can be up to ${maxUploadMb()} MB.`);
    submit.disabled = true;
    submit.textContent = 'Uploading…';
    let audio;
    try {
      audio = { mediaId: await putMedia(file, { onProgress: (f) => { submit.textContent = `Uploading… ${Math.floor(f * 100)}%`; } }), duration: await audioDuration(file), mimetype: file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg'), size: file.size, name: file.name };
    } catch (err) {
      uiAlert(err.message);
      submit.disabled = false;
      submit.textContent = 'Upload and publish';
      return;
    }
    const show = store.doc.podcasts[f.show.value];
    const season = f.season.value === 'new' ? last + 1 : +f.season.value;
    const date = f.when.value === 'later' ? (f.date.value || now) : now;
    const status = f.when.value === 'draft' ? 'draft' : date > now ? 'scheduled' : 'published';
    const ops = [];
    if (!show.seasons[season]) ops.push(col.update('podcasts', show.id, { seasons: { ...show.seasons, [season]: { number: season, title: `Season ${season}`, description: '' } } }));
    ops.push(col.add('episodes', {
      podcastId: show.id, season, number: nextNumber(store.doc, show.id, season), type: 'full', title: f.title.value.trim(), slug: slugify(f.title.value),
      description: f.description.value.trim(), notes: '', status, publishedAt: date, audio, personIds: [...(show.hostIds ?? [])],
    }));
    store.apply(ops.length > 1 ? col.batch(ops) : ops[0]);
  } },
    h('div', { class: 'pq-form-head' }, Cover(store.doc.podcasts[ctx.quickShow], 52), h('div', {}, h('h2', {}, 'New episode'), h('small', { class: 'muted' }, 'The series’ hosts are credited. Add notes and guests afterwards in Podcasts.'))),
    drop,
    h('div', { class: 'pq-fields' },
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Series'), f.show),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Season'), f.season),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Title'), f.title),
      h('label', { class: 'fieldset span-2' }, h('span', { class: 'fieldset-legend' }, 'Summary'), f.description),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'When'), f.when),
      h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, f.when.value === 'later' ? 'Date' : ' '), f.date)),
    submit);
}
