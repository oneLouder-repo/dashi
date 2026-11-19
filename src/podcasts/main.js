import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg, loadPodcasts, loadLibrary, loadMaps } from '../platform/docs.js';
import { staffList } from '../platform/org.js';
import {
  CATEGORIES, EPISODE_TYPES, LOOKS, isAudioFile, slugify, published, episodesOf, seasonsOf, showsInOrder, nextNumber, podcastRss,
  toClock, fromClock, episodeCode,
} from '../platform/podcasts.js';
import { putMedia, deleteMedia, audioDuration, maxUploadMb } from '../platform/media.js';
import { readImage } from '../ui/images.js';
import { Cover, EpisodeArt, Player, fmtDuration } from '../site/station.js';
import { COVER_TONES } from '../ui/standIn.js';
import { Markdown } from '../ui/markdown.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { today, short } from '../strategy/dates.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/dialog.js';

/**
 * Podcasts: the studio for an org's own podcast station.
 *
 *   #station                  the station: shows, what's coming, the public page and its look
 *   #episodes[/<ep>]          every episode of every show, one picked
 *   #<show>[/<ep>]            a show's episodes by season, one picked (details on the right)
 *   #<show>/<ep>/edit         editing an episode, in the right-hand panel
 *   #<show>/new               a new episode
 *   #<show>/settings          the show's details, art, hosts, seasons and listen links
 *
 * Every show and episode has cover art: uploaded, or generated in the
 * show's colour (ui/standIn.js). Episodes are uploaded .mp3 or .wav files
 * (platform/media.js). The public station is on the org's site
 * (site.html?site=<id>&view=station), skinned by the org theme and the
 * station's look.
 */
const org = loadOrg();
const store = new Store(loadPodcasts(), applyCollectionOp);
autosaveDoc('podcasts', store, 150);
Shell(document.querySelector('#shell'), { current: 'podcasts', org });

const app = document.querySelector('#app');
app.classList.add('podcasts-app', 'frame');
let side = h('nav');
const panel = h('section', { class: 'pc-panel' });
const player = Player(() => store.doc);
player.setLink(({ episode }) => { const e = store.doc.episodes[episode]; return e ? `#${e.podcastId}/${e.id}` : '#station'; });
player.el.classList.add('admin-player');
player.setLook({ player: 'card' });
player.el.classList.add('admin-player');
app.replaceChildren(side, panel);
document.body.append(player.el);

const doc = () => store.doc;
const now = today();
const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const safe = (fn) => { try { return fn(); } catch { return null; } };

/** Where we are: { scope: 'station' | 'episodes' | <show id>, sub: null | 'settings' | 'new' | <episode id>, edit } */
function route() {
  const [scope = 'station', sub = null, edit = null] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { scope: scope || 'station', sub, edit: edit === 'edit' };
}
const go = (hash) => { if (location.hash.slice(1) !== hash) location.hash = hash; else render(); };

/** What the episode lists show: a season, a state, and words to look for. */
const filter = { season: 'all', state: 'all', q: '', show: 'all' };

const stationSite = () => org.sites[doc().station.siteId];
const stationUrl = (extra = {}) => `site.html?${new URLSearchParams({ site: doc().station.siteId ?? '', view: 'station', ...extra })}`;
const stateOf = (e) => (published(e, now) ? 'live' : e.status === 'draft' ? 'draft' : 'coming');
const STATES = { live: { label: 'Published', cls: 'live' }, coming: { label: 'Scheduled', cls: 'coming' }, draft: { label: 'Draft', cls: 'draft' } };
const StatusPill = (e) => { const s = STATES[stateOf(e)]; return h('span', { class: `pc-pill ${s.cls}` }, stateOf(e) === 'coming' ? `Scheduled · ${short(e.publishedAt)}` : s.label); };
function countsOf(showId) {
  const eps = episodesOf(doc(), showId);
  const live = eps.filter((e) => stateOf(e) === 'live').length;
  const drafts = eps.filter((e) => stateOf(e) === 'draft').length;
  const coming = eps.length - live - drafts;
  return { all: eps.length, live, coming, drafts, line: [n(live, 'episode'), coming && `${coming} coming`, drafts && n(drafts, 'draft')].filter(Boolean).join(' · ') };
}
const people = (ids, size = 22) => (ids?.length ? h('span', { class: 'avatar-row' }, ids.map((id) => org.staff[id] && h('span', { title: org.staff[id].name }, Avatar(org.staff[id], size)))) : null);

/** Things in Dashi an episode can point at: library items and maps. */
let relatedCache = null;
function relatedChoices() {
  if (relatedCache) return relatedCache;
  const lib = safe(loadLibrary);
  const maps = safe(loadMaps);
  relatedCache = [
    ...Object.values(maps?.maps ?? {}).map((m) => ({ key: `map:${m.id}`, label: m.name || 'Untitled map', group: 'Ecosystem maps', href: `mapper.html#${m.id}`, icon: 'mapper' })),
    ...Object.values(lib?.items ?? {}).map((it) => ({ key: `library:${it.id}`, label: it.meta?.title || 'Untitled', group: 'Library', href: `library.html#item/${it.id}`, icon: 'book' })),
  ];
  return relatedCache;
}
const relatedOf = (key) => relatedChoices().find((r) => r.key === key) ?? { key, label: key, href: null, icon: 'link' };

/* ------------------------------------------------------------------ frame */
function render() {
  const r = route();
  const show = doc().podcasts[r.scope] ?? null;
  const all = Object.values(doc().episodes);
  side = swapSide(side, SideNav({ label: 'Station and shows', sections: [
    { title: 'Station', items: [
      { label: doc().station.name, sub: 'Shows, public page and look', icon: 'radio', href: '#station', on: r.scope === 'station' },
      { label: 'All episodes', sub: [`${all.filter((e) => stateOf(e) === 'live').length} published`, all.some((e) => stateOf(e) !== 'live') && `${all.filter((e) => stateOf(e) !== 'live').length} not yet`].filter(Boolean).join(' · '), icon: 'music', href: '#episodes', on: r.scope === 'episodes' },
    ] },
    { title: 'Shows', action: { label: 'New show', onclick: newShow }, items: [
      ...showsInOrder(doc()).map((p) => ({ label: p.title, sub: [countsOf(p.id).line, p.featured && 'featured'].filter(Boolean).join(' · '), lead: Cover(p, 28, 'side-cover'), href: `#${p.id}`, on: r.scope === p.id })),
      { label: 'New show', icon: 'plus', onclick: newShow },
    ] },
  ] }));

  const scroll = panel.querySelector('.pc-main')?.scrollTop ?? 0;
  const sameScope = panel.dataset.scope === r.scope;
  panel.dataset.scope = r.scope;
  if (show) panel.replaceChildren(ShowStudio(show, r));
  else if (r.scope === 'episodes') panel.replaceChildren(AllEpisodes(r));
  else panel.replaceChildren(Station());
  if (sameScope) { const m = panel.querySelector('.pc-main'); if (m) m.scrollTop = scroll; }
}

async function newShow() {
  const title = await uiPrompt('Name of the new show');
  if (!title?.trim()) return;
  const op = store.apply(col.add('podcasts', {
    handle: slugify(title).replace(/-/g, ''), title: title.trim(), description: '', category: 'Education', language: 'en', type: 'episodic', explicit: false,
    owner: { name: org.name, email: org.contact.email }, cover: null, accent: COVER_TONES[showsInOrder(doc()).length % COVER_TONES.length], hostIds: [], featured: false,
    order: showsInOrder(doc()).length, seasons: { 1: { number: 1, title: 'Season 1', description: '' } }, links: { website: '', apple: '', spotify: '', youtube: '' },
  }));
  location.hash = `${op.id}/settings`;
}

/** Click-to-upload art (square images work best in podcast apps). */
function CoverUpload(current, size, onPick, label) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': label, onchange: async (e) => {
    try { onPick(await readImage(e.target.files[0], 800)); } catch (err) { uiAlert(err.message); }
  } });
  return h('label', { class: 'cover-upload', title: label }, Cover(current, size), h('span', { class: 'cover-edit' }, current?.cover ? 'Change art' : 'Upload art'), input);
}

function Segmented(name, choices, value, onPick) {
  return h('div', { class: 'join look-choices', role: 'radiogroup', 'aria-label': name },
    choices.map((c) => h('button', { class: `btn btn-sm join-item${c.id === value ? ' btn-primary' : ''}`, role: 'radio', 'aria-checked': String(c.id === value), title: c.blurb ?? '', onclick: () => onPick(c.id) }, c.label)));
}

/* ------------------------------------------------------------------ station */
function Station() {
  const st = doc().station;
  const update = (patch) => store.apply(col.set('station', { ...st, ...patch }));
  const setLook = (patch) => update({ look: { ...st.look, ...patch } });
  const shows = showsInOrder(doc());
  const eps = Object.values(doc().episodes);
  const live = eps.filter((e) => stateOf(e) === 'live').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const upcoming = eps.filter((e) => stateOf(e) !== 'live').sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const move = (show, dir) => {
    const i = shows.indexOf(show);
    const other = shows[i + dir];
    if (!other) return;
    store.apply(col.batch(shows.map((s, k) => col.update('podcasts', s.id, { order: s === show ? i + dir : s === other ? i : k }))));
  };
  const site = stationSite();
  const hostIds = new Set(shows.flatMap((s) => s.hostIds));

  return h('div', { class: 'pc-main pc-station' },
    PluginHeader('podcasts', { actions: [
      h('button', { class: 'btn btn-sm', onclick: newShow }, icon('plus', 14), 'New show'),
      site && h('a', { class: 'btn btn-sm btn-primary', href: stationUrl(), target: '_blank', rel: 'noopener' }, icon('globe', 14), 'Open public station'),
    ] }),
    h('div', { class: 'pc-body' },
      h('section', { class: 'pc-station-hero' },
        CoverUpload({ id: 'station', title: st.name, cover: st.cover, accent: '#55707a' }, 132, (cover) => update({ cover }), 'Station art'),
        h('div', { class: 'pc-hero-text' },
          h('input', { class: 'pc-inline pc-inline-title', name: 'station-name', value: st.name, 'aria-label': 'Station name', onchange: (e) => update({ name: e.target.value }) }),
          h('input', { class: 'pc-inline pc-inline-lede', name: 'station-tagline', value: st.tagline, placeholder: 'A tagline for your station', 'aria-label': 'Tagline', onchange: (e) => update({ tagline: e.target.value }) }),
          h('textarea', { class: 'pc-inline pc-inline-desc', name: 'station-description', rows: 2, placeholder: 'What listeners will find here', 'aria-label': 'Description', onchange: (e) => update({ description: e.target.value }) }, st.description),
          h('ul', { class: 'pc-stats', 'aria-label': 'The station at a glance' },
            [[shows.length, 'show', 'shows'], [live.length, 'published', 'published'], [upcoming.filter((e) => stateOf(e) === 'coming').length, 'scheduled', 'scheduled'], [upcoming.filter((e) => stateOf(e) === 'draft').length, 'draft', 'drafts'], [hostIds.size, 'host', 'hosts']]
              .map(([k, one, many]) => h('li', {}, h('strong', {}, String(k)), h('span', {}, k === 1 ? one : many))))),
        h('div', { class: 'pc-public card' },
          h('div', { class: 'pc-public-head' }, icon('globe', 16), h('strong', {}, 'Public station page')),
          h('select', { class: 'select select-sm', name: 'station-site', 'aria-label': 'Site that hosts the station', onchange: (e) => update({ siteId: e.target.value || null }) },
            h('option', { value: '' }, 'Not on a site'), options(Object.values(org.sites).map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), st.siteId)),
          h('span', { class: 'muted small' }, !site ? 'Pick a site to give the station a public page.'
            : site.visibility === 'private' ? 'That site is private. Make it public in Organisation settings.' : `Live on ${site.name}, with a page for every show and episode.`),
          site && h('div', { class: 'pc-public-links' },
            h('a', { class: 'btn btn-xs', href: stationUrl(), target: '_blank', rel: 'noopener' }, 'Station page'),
            h('a', { class: 'btn btn-xs btn-ghost', href: '#station-look', onclick: (e) => { e.preventDefault(); panel.querySelector('#station-look')?.scrollIntoView({ behavior: 'smooth' }); } }, 'How it looks')))),

      h('div', { class: 'pc-section-head' }, h('h2', {}, 'Shows'), h('span', { class: 'muted small' }, 'Featured shows lead the station page, in this order.')),
      h('div', { class: 'pc-show-grid' },
        shows.map((s, i) => {
          const c = countsOf(s.id);
          return h('article', { class: `pc-show-card${s.featured ? ' featured' : ''}` },
            h('a', { class: 'pc-show-art', href: `#${s.id}`, 'aria-label': s.title }, Cover(s, 400, 'pc-cover-fill')),
            h('div', { class: 'pc-show-body' },
              h('a', { class: 'pc-show-title', href: `#${s.id}` }, s.title),
              h('span', { class: 'muted small' }, c.line || 'No episodes yet'),
              h('div', { class: 'pc-show-foot' },
                people(s.hostIds, 20),
                h('span', { class: 'spacer' }),
                h('button', { class: `pc-star${s.featured ? ' on' : ''}`, title: s.featured ? 'Featured on the station. Click to stop featuring it.' : 'Feature it on the station', 'aria-pressed': String(s.featured), onclick: () => store.apply(col.update('podcasts', s.id, { featured: !s.featured })) }, icon('star', 15)),
                h('div', { class: 'pc-order' },
                  h('button', { disabled: i === 0, 'aria-label': `Move ${s.title} earlier`, title: 'Earlier', onclick: () => move(s, -1) }, icon('chevronLeft', 14)),
                  h('button', { disabled: i === shows.length - 1, 'aria-label': `Move ${s.title} later`, title: 'Later', onclick: () => move(s, 1) }, icon('chevronRight', 14))))));
        }),
        h('button', { class: 'pc-show-card pc-show-new', onclick: newShow }, icon('plus', 28), h('strong', {}, 'New show'), h('span', { class: 'muted small' }, 'A title is all it takes to start'))),

      h('div', { class: 'pc-two' },
        h('section', {},
          h('div', { class: 'pc-section-head' }, h('h2', {}, 'Coming up and drafts'), h('a', { class: 'small', href: '#episodes' }, 'All episodes →')),
          upcoming.length ? h('div', { class: 'pc-rows' }, upcoming.slice(0, 6).map((e) => EpisodeRow(e, { showShow: true }))) : h('p', { class: 'pc-empty' }, 'Nothing scheduled. Drafts and future dates show here.')),
        h('section', {},
          h('div', { class: 'pc-section-head' }, h('h2', {}, 'Recently published')),
          live.length ? h('div', { class: 'pc-rows' }, live.slice(0, 6).map((e) => EpisodeRow(e, { showShow: true }))) : h('p', { class: 'pc-empty' }, 'Nothing published yet.'))),

      h('section', { id: 'station-look', class: 'pc-look card' },
        h('div', { class: 'pc-section-head' }, h('h2', {}, 'How the public station looks'), site && h('a', { class: 'small', href: stationUrl(), target: '_blank', rel: 'noopener' }, 'See it →')),
        h('p', { class: 'muted small' }, 'On top of your organisation’s colours and shape (Public Portal → Look and feel).'),
        h('div', { class: 'look-grid' },
          h('div', {}, h('span', { class: 'fieldset-legend' }, 'Player'), Segmented('Player', LOOKS.player, st.look.player, (p) => setLook({ player: p }))),
          h('div', {}, h('span', { class: 'fieldset-legend' }, 'Cover art'), Segmented('Cover art', LOOKS.art, st.look.art, (art) => setLook({ art }))),
          h('div', {}, h('span', { class: 'fieldset-legend' }, 'Top of the page'), Segmented('Top of the page', LOOKS.hero, st.look.hero, (hero) => setLook({ hero })))))));
}

/* ------------------------------------------------------------------ rows */
function EpisodeRow(e, { showShow = false, base = null, on = false } = {}) {
  const show = doc().podcasts[e.podcastId];
  const href = `#${base ?? e.podcastId}/${e.id}`;
  return h('div', { class: `pc-row${on ? ' on' : ''}` },
    h('div', { class: 'pc-row-art' }, EpisodeArt(e, show, 48),
      h('button', { class: 'pc-row-play', 'aria-label': `Play ${e.title}`, title: 'Play', onclick: () => player.play([e]) }, icon('play', 16))),
    h('a', { class: 'pc-row-text', href },
      h('strong', {}, e.title),
      h('small', {}, [showShow && show?.title, episodeCode(e), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · ')),
      e.description && h('span', { class: 'pc-row-desc' }, e.description)),
    h('span', { class: 'pc-row-date muted small' }, short(e.publishedAt)),
    StatusPill(e));
}

function Filters(eps, { seasons = null, shows = null } = {}) {
  const count = (s) => eps.filter((e) => stateOf(e) === s).length;
  return h('div', { class: 'pc-filters' },
    seasons && seasons.length > 1 && h('div', { class: 'pc-chips', role: 'group', 'aria-label': 'Season' },
      h('button', { class: `pc-chip${filter.season === 'all' ? ' on' : ''}`, onclick: () => { filter.season = 'all'; render(); } }, 'All seasons'),
      seasons.map((s) => h('button', { class: `pc-chip${filter.season === s.number ? ' on' : ''}`, title: s.title, onclick: () => { filter.season = s.number; render(); } }, `S${s.number}`))),
    shows && h('select', { class: 'select select-sm pc-show-filter', 'aria-label': 'Show', onchange: (ev) => { filter.show = ev.target.value; render(); } },
      options([{ id: 'all', label: 'Every show' }, ...shows.map((s) => ({ id: s.id, label: s.title }))], filter.show)),
    h('div', { class: 'pc-chips', role: 'group', 'aria-label': 'State' },
      [['all', `All ${eps.length}`], ['live', `Published ${count('live')}`], ['coming', `Scheduled ${count('coming')}`], ['draft', `Drafts ${count('draft')}`]]
        .map(([id, label]) => h('button', { class: `pc-chip${filter.state === id ? ' on' : ''}`, onclick: () => { filter.state = id; render(); } }, label))),
    h('span', { class: 'spacer' }),
    h('input', { class: 'input input-sm pc-search', type: 'search', name: 'pc-search', placeholder: 'Find an episode', value: filter.q, 'aria-label': 'Find an episode',
      oninput: (ev) => { filter.q = ev.target.value; const at = ev.target.selectionStart; render(); const box = panel.querySelector('input[name="pc-search"]'); box?.focus(); box?.setSelectionRange(at, at); } }));
}
const matches = (e) => (filter.state === 'all' || stateOf(e) === filter.state)
  && (!filter.q.trim() || `${e.title} ${e.description} ${e.notes} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(filter.q.trim().toLowerCase()));

/* ------------------------------------------------------------------ a show */
function ShowStudio(p, r) {
  const settings = r.sub === 'settings';
  const c = countsOf(p.id);
  const hosts = p.hostIds.map((id) => org.staff[id]).filter(Boolean);
  const head = h('header', { class: 'pc-show-head' },
    h('div', { class: 'pc-show-head-art' }, Cover(p, 116)),
    h('div', { class: 'pc-show-head-text' },
      h('p', { class: 'pc-eyebrow' }, `@${p.handle} · ${p.category} · ${p.type === 'serial' ? 'Serial' : 'Episodic'}`, p.featured && h('span', { class: 'pc-feat' }, icon('star', 12), 'Featured')),
      h('h1', {}, p.title),
      p.description ? h('p', { class: 'pc-show-desc' }, p.description) : h('p', { class: 'pc-show-desc muted' }, 'No description yet. Add one in Settings.'),
      h('div', { class: 'pc-show-meta' },
        hosts.length > 0 && h('span', { class: 'pc-hosts' }, people(p.hostIds, 22), h('span', {}, hosts.map((x) => x.name).join(', '))),
        h('span', { class: 'muted small' }, `${c.line || 'No episodes yet'} · ${n(seasonsOf(doc(), p.id).length, 'season')}`))),
    h('div', { class: 'pc-show-head-actions' },
      h('a', { class: 'btn btn-sm btn-primary', href: `#${p.id}/new` }, icon('upload', 14), 'New episode'),
      h('div', { class: 'pc-head-row' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => showRss(p), title: 'The feed podcast apps subscribe to' }, icon('rss', 14), 'RSS'),
        stationSite() && h('a', { class: 'btn btn-sm btn-ghost', href: stationUrl({ view: '', show: p.id }), target: '_blank', rel: 'noopener' }, icon('globe', 14), 'Public page'))));
  const tabs = h('nav', { class: 'pc-tabs', 'aria-label': 'Show' },
    h('a', { href: `#${p.id}`, class: settings ? '' : 'on' }, icon('music', 15), 'Episodes', h('span', {}, String(c.all))),
    h('a', { href: `#${p.id}/settings`, class: settings ? 'on' : '' }, icon('settings', 15), 'Settings'));

  if (settings) return h('div', { class: 'pc-main' }, head, tabs, ShowSettings(p));

  const eps = episodesOf(doc(), p.id);
  const seasons = seasonsOf(doc(), p.id);
  if (filter.season !== 'all' && !seasons.some((s) => s.number === filter.season)) filter.season = 'all';
  const shown = eps.filter(matches).filter((e) => filter.season === 'all' || e.season === filter.season);
  const picked = doc().episodes[r.sub]?.podcastId === p.id ? doc().episodes[r.sub] : null;
  const bySeason = [...seasons].reverse().map((s) => ({ s, list: shown.filter((e) => e.season === s.number) })).filter((x) => x.list.length);

  const list = h('div', { class: 'pc-list' },
    Filters(eps, { seasons }),
    eps.length === 0
      ? h('div', { class: 'pc-empty big' }, icon('mic', 30), h('strong', {}, 'No episodes yet'), h('span', {}, 'Upload an .mp3 or .wav to make the first one.'), h('a', { class: 'btn btn-sm btn-primary', href: `#${p.id}/new` }, 'New episode'))
      : bySeason.length === 0 ? h('p', { class: 'pc-empty' }, 'No episodes match.')
        : bySeason.map(({ s, list: inSeason }) => h('section', { class: 'pc-season' },
          h('header', {},
            h('span', { class: 'pc-season-no' }, `S${s.number}`),
            h('div', {}, h('strong', {}, s.title || `Season ${s.number}`), s.description && h('small', { class: 'muted' }, s.description)),
            h('span', { class: 'spacer' }),
            h('span', { class: 'muted small' }, n(inSeason.length, 'episode')),
            inSeason.some((e) => stateOf(e) === 'live') && h('button', { class: 'btn btn-xs btn-ghost', onclick: () => player.play(inSeason.filter((e) => stateOf(e) === 'live').sort((a, b) => a.number - b.number)) }, icon('play', 12), 'Play season')),
          h('div', { class: 'pc-rows' }, inSeason.map((e) => EpisodeRow(e, { on: e === picked }))))));

  let detail;
  if (r.sub === 'new') detail = EpisodeEditor(p, null, { back: `#${p.id}` });
  else if (picked && r.edit) detail = EpisodeEditor(p, picked, { back: `#${p.id}/${picked.id}` });
  else if (picked) detail = EpisodeDetail(picked, { base: p.id });
  else detail = ShowSummary(p);
  return h('div', { class: 'pc-split' },
    h('div', { class: 'pc-main' }, head, tabs, list),
    h('aside', { class: `pc-detail${r.sub ? ' focus' : ''}`, 'aria-label': 'Details' }, detail));
}

function ShowSummary(p) {
  const eps = episodesOf(doc(), p.id);
  const next = eps.filter((e) => stateOf(e) === 'coming').sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))[0];
  const latest = eps.filter((e) => stateOf(e) === 'live').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  const links = Object.entries(p.links ?? {}).filter(([, v]) => v);
  return h('div', { class: 'pc-summary' },
    h('p', { class: 'pc-detail-kicker' }, 'Show'),
    h('div', { class: 'pc-summary-art' }, Cover(p, 300, 'pc-cover-fill')),
    h('p', { class: 'muted small pc-hint' }, 'Pick an episode to see its details, notes and chapters here.'),
    latest && h('div', { class: 'pc-mini' }, h('small', { class: 'muted' }, 'Latest'), EpisodeRow(latest)),
    next && h('div', { class: 'pc-mini' }, h('small', { class: 'muted' }, 'Next up'), EpisodeRow(next)),
    h('div', { class: 'pc-facts' },
      h('div', {}, h('span', {}, 'Listen links'), h('strong', {}, links.length ? links.map(([k]) => k[0].toUpperCase() + k.slice(1)).join(', ') : 'None yet')),
      h('div', {}, h('span', {}, 'Language'), h('strong', {}, p.language || 'en')),
      h('div', {}, h('span', {}, 'Owner'), h('strong', {}, p.owner?.name || org.name))),
    h('a', { class: 'btn btn-sm btn-block', href: `#${p.id}/settings` }, icon('settings', 14), 'Show settings'));
}

/* ------------------------------------------------------------------ all episodes */
function AllEpisodes(r) {
  const shows = showsInOrder(doc());
  const eps = Object.values(doc().episodes).filter((e) => doc().podcasts[e.podcastId]).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const shown = eps.filter(matches).filter((e) => filter.show === 'all' || e.podcastId === filter.show);
  const picked = doc().episodes[r.sub] ?? null;
  let detail;
  if (picked && r.edit) detail = EpisodeEditor(doc().podcasts[picked.podcastId], picked, { back: `#episodes/${picked.id}` });
  else if (picked) detail = EpisodeDetail(picked, { base: 'episodes' });
  else detail = h('div', { class: 'pc-summary' }, h('p', { class: 'pc-detail-kicker' }, 'Episodes'), h('div', { class: 'pc-empty big' }, icon('music', 30), h('strong', {}, 'Pick an episode'), h('span', {}, 'Its details, notes and chapters show here, ready to edit.')));
  return h('div', { class: 'pc-split' },
    h('div', { class: 'pc-main' },
      PluginHeader('podcasts', { title: 'All episodes', blurb: 'Every episode of every show, newest first. Pick one to see and edit it.' }),
      h('div', { class: 'pc-list' },
        Filters(eps, { shows }),
        shown.length ? h('div', { class: 'pc-rows' }, shown.map((e) => EpisodeRow(e, { showShow: true, base: 'episodes', on: e === picked }))) : h('p', { class: 'pc-empty' }, 'No episodes match.'))),
    h('aside', { class: `pc-detail${r.sub ? ' focus' : ''}`, 'aria-label': 'Details' }, detail));
}

/* ------------------------------------------------------------------ an episode */
function EpisodeDetail(e, { base }) {
  const show = doc().podcasts[e.podcastId];
  const state = stateOf(e);
  const setStatus = (status, publishedAt = e.publishedAt) => store.apply(col.update('episodes', e.id, { status, publishedAt }));
  const publicHref = stationSite() && state === 'live' ? stationUrl({ view: '', episode: e.id }) : null;
  const chapters = [...(e.chapters ?? [])].sort((a, b) => a.at - b.at);
  return h('div', { class: 'pc-ep' },
    h('div', { class: 'pc-detail-top' }, h('p', { class: 'pc-detail-kicker' }, episodeCode(e)), h('a', { class: 'btn btn-ghost btn-xs btn-square', href: `#${base}`, 'aria-label': 'Close', title: 'Close' }, icon('close', 15))),
    h('div', { class: 'pc-ep-art' }, EpisodeArt(e, show, 300, 'pc-cover-fill'),
      h('button', { class: 'pc-ep-play', 'aria-label': `Play ${e.title}`, onclick: () => player.play([e]) }, icon('play', 24))),
    h('div', { class: 'pc-ep-status' }, StatusPill(e), e.explicit && h('span', { class: 'pc-pill draft' }, 'Explicit')),
    h('h2', { class: 'pc-ep-title' }, e.title),
    h('p', { class: 'pc-ep-meta' }, [show?.title, short(e.publishedAt), fmtDuration(e.audio?.duration), e.audio?.name ?? (e.audio?.mediaId ? 'Uploaded audio' : 'Sample audio')].filter(Boolean).join(' · ')),
    e.description && h('p', { class: 'pc-ep-desc' }, e.description),
    h('div', { class: 'pc-ep-actions' },
      h('a', { class: 'btn btn-sm btn-primary', href: `#${base}/${e.id}/edit` }, icon('pencil', 14), 'Edit'),
      state !== 'live' && h('button', { class: 'btn btn-sm', onclick: () => setStatus('published', e.publishedAt > now ? now : e.publishedAt) }, 'Publish now'),
      state === 'live' && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => setStatus('draft') }, 'Move to drafts'),
      publicHref && h('a', { class: 'btn btn-sm btn-ghost', href: publicHref, target: '_blank', rel: 'noopener', title: 'Its page on the public station' }, icon('globe', 14)),
      h('button', { class: 'btn btn-sm btn-ghost text-error', title: 'Delete', 'aria-label': `Delete ${e.title}`, onclick: () => removeEpisode(e, base) }, icon('trash', 14))),
    e.personIds.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'In this episode'),
      h('div', { class: 'pc-people' }, e.personIds.map((id) => org.staff[id] && h('span', { class: 'pc-person' }, Avatar(org.staff[id], 22), org.staff[id].name)))),
    chapters.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'Chapters'),
      h('ol', { class: 'pc-chapters' }, chapters.map((c) => h('li', {}, h('button', { onclick: () => player.play([e], { at: c.at }), title: `Play from ${toClock(c.at)}` }, h('span', { class: 'chapter-at' }, toClock(c.at)), h('span', {}, c.title)))))),
    e.tags?.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'Tags'), h('div', { class: 'pc-tags' }, e.tags.map((t) => h('a', { class: 'pc-tag', href: `search.html?q=${encodeURIComponent(`#${t}`)}` }, `#${t}`)))),
    e.related?.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'Related in Dashi'), h('p', { class: 'muted tiny' }, 'For your team only. Never shown on the public station.'),
      h('div', { class: 'pc-related' }, e.related.map((k) => { const x = relatedOf(k); return h(x.href ? 'a' : 'span', { class: 'pc-rel', href: x.href }, icon(x.icon, 14), x.label); }))),
    e.notes && h('section', { class: 'pc-block' }, h('h3', {}, 'Show notes'), h('div', { class: 'pc-notes' }, Markdown(e.notes))),
    e.transcript && h('details', { class: 'pc-block pc-transcript' }, h('summary', {}, h('h3', {}, 'Transcript'), h('span', { class: 'muted small' }, `${e.transcript.split(/\s+/).filter(Boolean).length} words`)),
      h('div', {}, e.transcript.split(/\n{2,}/).map((x) => h('p', {}, x)))));
}

async function removeEpisode(e, base) {
  if (!await uiConfirm(`Delete “${e.title}”? Its audio goes too.`, { danger: true, ok: 'Delete' })) return;
  store.apply(col.remove('episodes', e.id));
  if (e.audio?.mediaId) deleteMedia(e.audio.mediaId);
  go(base);
}

/**
 * The episode editor, in the right-hand panel: audio, words, when it goes
 * out, art, people, chapters, transcript and links into Dashi. Audio is
 * required for a new episode (.mp3 or .wav).
 */
function EpisodeEditor(p, e, { back }) {
  const seasons = seasonsOf(doc(), p.id);
  const lastSeason = seasons.at(-1)?.number ?? 1;
  const state = { file: null, cover: e?.cover ?? null, chapters: (e?.chapters ?? []).map((c) => ({ ...c })), related: [...(e?.related ?? [])], people: new Set(e?.personIds ?? p.hostIds) };
  const field = (label, control, extra = '') => h('label', { class: `pc-field ${extra}` }, h('span', {}, label), control);

  const fileInput = h('input', { type: 'file', class: 'sr-only', accept: '.mp3,.wav,audio/mpeg,audio/wav', 'aria-label': 'Audio file (.mp3 or .wav)' });
  const fileNote = h('span', {}, e ? (e.audio?.name ?? (e.audio?.mediaId ? 'Uploaded audio' : 'Sample audio')) : 'Choose an .mp3 or .wav');
  const fileSub = h('small', { class: 'muted' }, e ? `${fmtDuration(e.audio?.duration)} · choose a file to replace it` : `Up to ${maxUploadMb()} MB`);
  const drop = h('label', { class: `pc-drop${e ? ' has' : ''}` }, icon('music', 20), h('span', { class: 'pc-drop-text' }, fileNote, fileSub), fileInput);
  const title = h('input', { class: 'input input-sm', name: 'ep-title', placeholder: 'Episode title', required: true, value: e?.title ?? '' });
  const take = (file) => {
    if (!file) return;
    if (!isAudioFile(file)) { uiAlert('Choose an .mp3 or .wav file.'); return; }
    state.file = file;
    drop.classList.add('has');
    fileNote.textContent = file.name;
    fileSub.textContent = `${(file.size / 1048576).toFixed(1)} MB · ready to upload`;
    if (!title.value) title.value = file.name.replace(/\.(mp3|wav)$/i, '').replace(/[-_]+/g, ' ');
  };
  fileInput.addEventListener('change', () => take(fileInput.files[0]));
  drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); take(ev.dataTransfer.files[0]); });

  const description = h('textarea', { class: 'textarea textarea-sm', name: 'ep-description', rows: 2, placeholder: 'One or two lines on what it is about' }, e?.description ?? '');
  const season = h('select', { class: 'select select-sm', name: 'ep-season', 'aria-label': 'Season' },
    options([...seasons.map((s) => ({ id: String(s.number), label: s.title || `Season ${s.number}` })), { id: 'new', label: `New season (${lastSeason + 1})` }], String(e?.season ?? lastSeason)));
  const type = h('select', { class: 'select select-sm', name: 'ep-type' }, options(EPISODE_TYPES.map((t) => ({ id: t, label: t === 'full' ? 'Full episode' : t[0].toUpperCase() + t.slice(1) })), e?.type ?? 'full'));
  const status = h('select', { class: 'select select-sm', name: 'ep-status' }, options([{ id: 'draft', label: 'Draft (not public)' }, { id: 'published', label: 'Publish' }], e?.status === 'draft' ? 'draft' : 'published'));
  const date = h('input', { class: 'input input-sm', type: 'date', name: 'ep-date', value: e?.publishedAt ?? now });
  const when = h('small', { class: 'muted pc-when' });
  const sayWhen = () => { when.textContent = status.value === 'draft' ? 'Only your team sees it.' : date.value > now ? `Goes out on ${short(date.value)}.` : 'Goes out as soon as you save.'; };
  status.addEventListener('change', sayWhen); date.addEventListener('change', sayWhen); sayWhen();
  const explicit = h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !!e?.explicit });

  const artBox = h('div', { class: 'pc-art-pick' });
  const drawArt = () => artBox.replaceChildren(
    EpisodeArt({ ...(e ?? { id: 'new', title: title.value || 'New episode' }), cover: state.cover }, p, 64),
    h('div', {},
      h('small', { class: 'muted' }, state.cover ? 'Its own art' : p.cover ? 'Uses the show’s art' : 'Generated from the show’s colour'),
      h('div', { class: 'pc-art-btns' },
        h('label', { class: 'btn btn-xs' }, 'Upload', h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (ev) => { try { state.cover = await readImage(ev.target.files[0], 800); drawArt(); } catch (err) { uiAlert(err.message); } } })),
        state.cover && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => { state.cover = null; drawArt(); } }, 'Remove'))));
  drawArt();

  const chapterList = h('div', { class: 'pc-chapter-edit' });
  const drawChapters = () => chapterList.replaceChildren(
    ...state.chapters.map((c, i) => h('div', { class: 'pc-chapter-row' },
      h('input', { class: 'input input-xs pc-at', value: toClock(c.at), 'aria-label': 'Starts at (m:ss)', onchange: (ev) => { const t = fromClock(ev.target.value); if (t == null) { ev.target.value = toClock(c.at); return; } c.at = t; } }),
      h('input', { class: 'input input-xs', value: c.title, placeholder: 'Chapter title', 'aria-label': 'Chapter title', oninput: (ev) => { c.title = ev.target.value; } }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove chapter', onclick: () => { state.chapters.splice(i, 1); drawChapters(); } }, icon('close', 13)))),
    h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => {
      const last = state.chapters.at(-1)?.at ?? -60;
      const playing = player.current === e?.id ? Math.floor(player.audio.currentTime) : null;
      state.chapters.push({ at: playing ?? last + 60, title: '' }); drawChapters(); chapterList.querySelector('.pc-chapter-row:last-of-type input:nth-child(2)')?.focus();
    } }, icon('plus', 13), player.current === e?.id ? 'Add chapter here' : 'Add chapter'));
  drawChapters();

  const peopleBox = h('div', { class: 'pc-people pick' }, staffList(org).map((s) => h('label', { class: `pc-person${state.people.has(s.id) ? ' on' : ''}` },
    h('input', { type: 'checkbox', class: 'sr-only', checked: state.people.has(s.id), onchange: (ev) => { if (ev.target.checked) state.people.add(s.id); else state.people.delete(s.id); ev.target.parentElement.classList.toggle('on', ev.target.checked); } }),
    Avatar(s, 20), s.name)));

  const tags = h('input', { class: 'input input-sm', name: 'ep-tags', placeholder: 'north, youth voice, robotics', value: (e?.tags ?? []).join(', ') });
  const relatedBox = h('div', { class: 'pc-related' });
  const drawRelated = () => {
    const choices = relatedChoices().filter((x) => !state.related.includes(x.key));
    const groups = [...new Set(choices.map((x) => x.group))];
    relatedBox.replaceChildren(
      ...state.related.map((k) => { const x = relatedOf(k); return h('span', { class: 'pc-rel' }, icon(x.icon, 13), x.label, h('button', { type: 'button', 'aria-label': `Remove ${x.label}`, onclick: () => { state.related = state.related.filter((y) => y !== k); drawRelated(); } }, '×')); }),
      choices.length > 0 && h('select', { class: 'select select-xs pc-rel-add', 'aria-label': 'Link to something in Dashi', onchange: (ev) => { if (ev.target.value) { state.related.push(ev.target.value); drawRelated(); } } },
        h('option', { value: '' }, '+ Link a map or reading'),
        groups.map((g) => h('optgroup', { label: g }, choices.filter((x) => x.group === g).map((x) => h('option', { value: x.key }, x.label))))));
  };
  drawRelated();

  const notes = h('textarea', { class: 'textarea textarea-sm', name: 'ep-notes', rows: 5, placeholder: 'Links, credits, thanks. **bold**, _italic_, - lists and [links](https://…) work.' }, e?.notes ?? '');
  const transcript = h('textarea', { class: 'textarea textarea-sm', name: 'ep-transcript', rows: 4, placeholder: 'Paste a transcript. Blank lines start new paragraphs.' }, e?.transcript ?? '');
  const submit = h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, e ? 'Save episode' : 'Add episode');

  const save = async (ev) => {
    ev.preventDefault();
    const file = state.file;
    if (!e && !file) return uiAlert('Choose an .mp3 or .wav file for the episode.');
    if (file && file.size > maxUploadMb() * 1048576) return uiAlert(`Audio files can be up to ${maxUploadMb()} MB.`);
    submit.disabled = true;
    submit.textContent = file ? 'Uploading…' : 'Saving…';
    const ops = [];
    const seasonNo = season.value === 'new' ? lastSeason + 1 : +season.value;
    if (season.value === 'new') ops.push(col.update('podcasts', p.id, { seasons: { ...p.seasons, [seasonNo]: { number: seasonNo, title: `Season ${seasonNo}`, description: '' } } }));
    let audio = e?.audio;
    if (file) {
      try {
        audio = { mediaId: await putMedia(file, { onProgress: (f) => { submit.textContent = `Uploading… ${Math.floor(f * 100)}%`; } }), duration: await audioDuration(file), mimetype: file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg'), size: file.size, name: file.name };
      } catch (err) {
        uiAlert(err.message);
        submit.disabled = false;
        submit.textContent = e ? 'Save episode' : 'Add episode';
        return;
      }
      if (e?.audio?.mediaId) deleteMedia(e.audio.mediaId);
    }
    const day = date.value || now;
    const st = status.value === 'draft' ? 'draft' : day > now ? 'scheduled' : 'published';
    const kind = type.value;
    const number = e && e.season === seasonNo && e.type === kind ? e.number : kind === 'full' ? nextNumber(doc(), p.id, seasonNo) : 0;
    const fields = {
      podcastId: p.id, season: seasonNo, number, type: kind, title: title.value.trim(), slug: slugify(title.value), description: description.value.trim(),
      notes: notes.value, transcript: transcript.value.trim(), status: st, publishedAt: day, audio, personIds: [...state.people],
      cover: state.cover, explicit: explicit.checked,
      chapters: state.chapters.filter((c) => c.title.trim()).map((c) => ({ at: c.at, title: c.title.trim() })).sort((a, b) => a.at - b.at),
      tags: [...new Set(tags.value.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))],
      related: state.related,
    };
    let id = e?.id;
    if (e) ops.push(col.update('episodes', e.id, fields));
    else { const add = col.add('episodes', fields); id = add.id; ops.push(add); }
    store.apply(ops.length > 1 ? col.batch(ops) : ops[0]);
    go(`${back.replace(/^#/, '').split('/')[0]}/${id}`);
  };

  return h('form', { class: 'pc-editor', onsubmit: save },
    h('div', { class: 'pc-detail-top' }, h('p', { class: 'pc-detail-kicker' }, e ? `Editing ${episodeCode(e)}` : `New episode · ${p.title}`), h('a', { class: 'btn btn-ghost btn-xs btn-square', href: back, 'aria-label': 'Cancel', title: 'Cancel' }, icon('close', 15))),
    drop,
    field('Title', title),
    field('Summary', description),
    h('div', { class: 'pc-pair' }, field('Season', season), field('Type', type)),
    h('div', { class: 'pc-pair' }, field('Status', status), field('Date', date)),
    when,
    h('div', { class: 'pc-field' }, h('span', {}, 'Art'), artBox),
    h('div', { class: 'pc-field' }, h('span', {}, 'People in this episode'), peopleBox),
    field('Tags', tags),
    h('div', { class: 'pc-field' }, h('span', {}, 'Chapters'), chapterList),
    field('Show notes', notes),
    field('Transcript', transcript),
    h('div', { class: 'pc-field' }, h('span', {}, 'Related in Dashi (team only)'), relatedBox),
    h('label', { class: 'pc-check' }, explicit, 'Explicit content'),
    h('div', { class: 'pc-editor-actions' }, submit, h('a', { class: 'btn btn-sm btn-ghost', href: back }, 'Cancel')));
}

/* ------------------------------------------------------------------ show settings */
function ShowSettings(p) {
  const update = (patch) => store.apply(col.update('podcasts', p.id, patch));
  const eps = episodesOf(doc(), p.id);
  const setSeason = (num, patch) => update({ seasons: { ...p.seasons, [num]: { ...p.seasons[num], ...patch } } });
  const addSeason = () => { const num = (seasonsOf(doc(), p.id).at(-1)?.number ?? 0) + 1; update({ seasons: { ...p.seasons, [num]: { number: num, title: `Season ${num}`, description: '' } } }); };
  const removeSeason = (num) => { const { [num]: _, ...rest } = p.seasons; update({ seasons: rest }); };
  const hosts = p.hostIds.map((id) => org.staff[id]).filter(Boolean);
  const others = staffList(org).filter((x) => !p.hostIds.includes(x.id));
  const field = (label, control, hint) => h('label', { class: 'pc-field' }, h('span', {}, label), control, hint && h('small', { class: 'muted' }, hint));
  const text = (name, value, onchange, extra = {}) => h('input', { class: 'input input-sm', name, value: value ?? '', onchange: (ev) => onchange(ev.target.value), ...extra });

  return h('div', { class: 'pc-settings' },
    h('section', { class: 'pc-set card' },
      h('h3', {}, 'Cover art'),
      h('div', { class: 'pc-art-row' },
        CoverUpload(p, 150, (cover) => update({ cover }), 'Show cover art'),
        h('div', { class: 'pc-art-side' },
          h('p', { class: 'muted small' }, p.cover ? 'Your uploaded art. Square images of 1400 pixels or more work best in podcast apps.' : 'Generated art: a nature scene in the show’s colour, with its title. Upload your own any time.'),
          p.cover && h('button', { class: 'btn btn-xs', onclick: () => update({ cover: null }) }, 'Use generated art instead'),
          h('span', { class: 'pc-field-label' }, 'Show colour'),
          h('div', { class: 'pc-swatches', role: 'radiogroup', 'aria-label': 'Show colour' },
            COVER_TONES.map((c) => h('button', { class: `pc-swatch${(p.accent ?? '') === c ? ' on' : ''}`, style: `--c:${c}`, role: 'radio', 'aria-checked': String(p.accent === c), 'aria-label': c, onclick: () => update({ accent: c }) })))))),
    h('section', { class: 'pc-set card' },
      h('h3', {}, 'About the show'),
      field('Title', text('show-title', p.title, (v) => update({ title: v }))),
      field('Description', h('textarea', { class: 'textarea textarea-sm', name: 'show-description', rows: 3, onchange: (ev) => update({ description: ev.target.value }) }, p.description)),
      h('div', { class: 'pc-pair' },
        field('Handle', text('show-handle', p.handle, (v) => update({ handle: slugify(v).replace(/-/g, '') })), 'Its address: @handle'),
        field('Category', h('select', { class: 'select select-sm', name: 'show-category', onchange: (ev) => update({ category: ev.target.value }) }, options(CATEGORIES.map((c) => ({ id: c, label: c })), p.category)))),
      h('div', { class: 'pc-pair' },
        field('Episode order', h('select', { class: 'select select-sm', name: 'show-type', onchange: (ev) => update({ type: ev.target.value }) }, options([{ id: 'episodic', label: 'Episodic (newest first)' }, { id: 'serial', label: 'Serial (in order)' }], p.type))),
        field('Language', text('show-language', p.language, (v) => update({ language: v.trim() || 'en' })))),
      h('div', { class: 'pc-checks' },
        h('label', { class: 'pc-check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', name: 'show-featured', checked: p.featured, onchange: (ev) => update({ featured: ev.target.checked }) }), 'Featured on the station'),
        h('label', { class: 'pc-check' }, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', name: 'show-explicit', checked: !!p.explicit, onchange: (ev) => update({ explicit: ev.target.checked }) }), 'Explicit content'))),
    h('section', { class: 'pc-set card' },
      h('h3', {}, 'Hosts'),
      h('div', { class: 'host-picker' },
        hosts.length ? hosts.map((s) => h('span', { class: 'host-chip' }, Avatar(s, 24), h('span', {}, s.name, s.title && h('small', {}, s.title)),
          h('button', { class: 'icon-button', 'aria-label': `Remove ${s.name} as host`, onclick: () => update({ hostIds: p.hostIds.filter((id) => id !== s.id) }) }, '×')))
          : h('span', { class: 'muted' }, 'No hosts yet.'),
        others.length > 0 && h('select', { class: 'select select-sm host-add', name: 'show-add-host', 'aria-label': 'Add a host', onchange: (ev) => { if (ev.target.value) update({ hostIds: [...p.hostIds, ev.target.value] }); } },
          h('option', { value: '' }, '+ Add a host'), options(others.map((x) => ({ id: x.id, label: x.name }))))),
      h('p', { class: 'muted small' }, 'Hosts are added to each new episode’s people. Their names show on the public show page.')),
    h('section', { class: 'pc-set card' },
      h('div', { class: 'pc-section-head' }, h('h3', {}, 'Seasons'), h('button', { class: 'btn btn-xs', onclick: addSeason }, icon('plus', 13), 'Add season')),
      seasonsOf(doc(), p.id).map((s) => {
        const count = eps.filter((e) => e.season === s.number).length;
        return h('div', { class: 'pc-season-edit' },
          h('span', { class: 'pc-season-no' }, `S${s.number}`),
          h('div', { class: 'pc-season-fields' },
            h('input', { class: 'input input-sm', name: `season-${s.number}-title`, value: s.title, 'aria-label': `Season ${s.number} title`, onchange: (ev) => setSeason(s.number, { title: ev.target.value }) }),
            h('input', { class: 'input input-sm', name: `season-${s.number}-desc`, value: s.description, placeholder: 'What this season is about', 'aria-label': `Season ${s.number} description`, onchange: (ev) => setSeason(s.number, { description: ev.target.value }) })),
          h('span', { class: 'muted small' }, n(count, 'episode')),
          !count && h('button', { class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Remove season ${s.number}`, onclick: () => removeSeason(s.number) }, icon('close', 13)));
      })),
    h('section', { class: 'pc-set card' },
      h('h3', {}, 'Where people can listen'),
      h('p', { class: 'muted small' }, 'Paste the show’s address on each service once it is listed there (they all read your RSS feed). They show as buttons on the public pages.'),
      ['apple', 'spotify', 'youtube', 'website'].map((k) => field({ apple: 'Apple Podcasts', spotify: 'Spotify', youtube: 'YouTube', website: 'Website' }[k],
        text(`show-link-${k}`, p.links?.[k], (v) => update({ links: { ...p.links, [k]: v.trim() } }), { type: 'url', placeholder: 'https://…' }))),
      h('div', { class: 'pc-rss-row' }, h('button', { class: 'btn btn-sm', onclick: () => showRss(p) }, icon('rss', 14), 'See the RSS feed'))),
    h('section', { class: 'pc-set pc-danger' },
      h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: async () => {
        if (!await uiConfirm(`Delete the show “${p.title}” and its ${n(eps.length, 'episode')}?`, { danger: true, ok: 'Delete show' })) return;
        store.apply(col.batch([...eps.map((e) => col.remove('episodes', e.id)), col.remove('podcasts', p.id)]));
        for (const e of eps) if (e.audio?.mediaId) deleteMedia(e.audio.mediaId);
        location.hash = 'station';
      } }, icon('trash', 14), 'Delete this show')));
}

function showRss(p) {
  const xml = podcastRss(doc(), p.id, { baseUrl: org.contact.website || 'https://example.org', today: now });
  const dialog = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box rss-box' },
      h('h3', {}, `RSS feed for ${p.title}`),
      h('p', { class: 'muted' }, 'Podcast apps subscribe to this feed. Drafts and episodes scheduled for later are left out. A hosted Dashi serves it at your show’s address.'),
      h('pre', {}, xml),
      h('div', { class: 'modal-action' },
        h('button', { class: 'btn btn-sm', onclick: () => navigator.clipboard?.writeText(xml) }, 'Copy'),
        h('a', { class: 'btn btn-sm', href: URL.createObjectURL(new Blob([xml], { type: 'application/rss+xml' })), download: `${p.handle}.xml` }, 'Download'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => dialog.close() }, 'Close'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

store.addEventListener('change', render);
window.addEventListener('hashchange', () => { if (panel.dataset.scope !== route().scope) { filter.season = 'all'; } render(); });
render();
window.podcasts = { store, player };
