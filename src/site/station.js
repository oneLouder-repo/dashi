import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Avatar } from '../ui/Shell.js';
import { Markdown } from '../ui/markdown.js';
import { audioSrc } from '../platform/media.js';
import { isHosted } from '../platform/storage.js';
import { showArchive, archiveBytes } from '../platform/showArchive.js';
import { zipStream } from '../core/zip.js';
import { stationView, seasonsOf, published, podcastRss, DEFAULT_LOOK, DEFAULT_MASTHEAD } from '../platform/podcasts.js';
import { siteDesign } from '../platform/siteDesign.js';
import { Masthead } from './mastheads.js';
import { short } from '../strategy/dates.js';
import { coverArt } from '../ui/standIn.js';
import { toClock } from '../platform/podcasts.js';
import { uiAlert } from '../ui/dialog.js';

/**
 * The public podcast station: its pages (station home, a show, an
 * episode), the cards other pages embed, and the player. Used by the
 * public site (pages/site.js) and, for previews, by the Podcasts plugin.
 *
 * Everything is skinned twice: by the org's theme (palette and shape,
 * platform/themes.js) and by the station's look (player style, cover art
 * shape, hero layout; platform/podcasts.js LOOKS), set as classes on the
 * station's root element.
 *
 * ctx = { doc (podcasts), org, site (the site it is on), today, player, link(params) → href }
 */

export const fmtDuration = (s = 0) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}`) + `:${String(s % 60).padStart(2, '0')}`;
export const lookClasses = (look) => `look-player-${look.player} look-art-${look.art}`;

/** A show's cover art, or generated art with its title (ui/standIn.js). */
export function Cover(show, size = 96, extra = '') {
  const style = `width:${size}px;height:${size}px`;
  return h('img', { class: `cover ${extra}`, src: show?.cover || coverArt(show ?? { title: '?' }), alt: '', style, loading: 'lazy', draggable: 'false' });
}
/** An episode's own art, else its show's. */
export function EpisodeArt(e, show, size = 56, extra = '') {
  if (!e?.cover && show?.cover) return Cover(show, size, extra);
  if (!e?.cover) return h('img', { class: `cover ${extra}`, src: coverArt({ ...show, title: e?.title || show?.title }, { label: show?.title ?? '', seed: e?.id ? `${show?.id}/${e.id}` : show?.id }), alt: '', style: `width:${size}px;height:${size}px`, loading: 'lazy', draggable: 'false' });
  return h('img', { class: `cover ${extra}`, src: e.cover, alt: '', style: `width:${size}px;height:${size}px`, loading: 'lazy', draggable: 'false' });
}

const episodeLabel = (e) => (e.type === 'full' ? `S${e.season} · E${e.number}` : `S${e.season} · ${e.type}`);
const meta = (e, show) => [show?.title, episodeLabel(e), short(e.publishedAt), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · ');

function PlayButton(ctx, episodes, label, size = 'md') {
  return h('button', { class: `btn btn-primary btn-circle btn-${size} play-btn`, 'aria-label': `Play ${label}`, onclick: () => ctx.player.play(episodes) }, icon('play', size === 'lg' ? 22 : 16));
}

/** One episode, as a row in a list or an embed in an article. */
export function EpisodeCard(ctx, e, { showShow = true, embed = false } = {}) {
  const show = ctx.doc.podcasts[e.podcastId];
  return h('article', { class: `episode-card${embed ? ' embed' : ''}` },
    h('a', { class: 'episode-card-art', href: ctx.link({ episode: e.id }), 'aria-label': e.title, tabindex: -1 }, EpisodeArt(e, show, embed ? 72 : 56)),
    PlayButton(ctx, [e], e.title),
    h('div', { class: 'episode-card-text' },
      h('a', { class: 'episode-title', href: ctx.link({ episode: e.id }) }, e.title),
      h('span', { class: 'muted' }, meta(e, showShow ? show : null)),
      e.description && h('p', {}, e.description)));
}

/** A show, as a card: on the station page, or embedded in an article. */
export function ShowCard(ctx, show, { latest, count } = {}) {
  const live = Object.values(ctx.doc.episodes).filter((e) => e.podcastId === show.id && published(e, ctx.today))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  latest ??= live[0];
  count ??= live.length;
  return h('article', { class: 'show-card' },
    h('a', { href: ctx.link({ show: show.id }), class: 'show-card-art', 'aria-label': show.title }, Cover(show, 112)),
    h('div', { class: 'show-card-body' },
      h('a', { class: 'show-card-title', href: ctx.link({ show: show.id }) }, show.title),
      h('span', { class: 'muted' }, `${count} episode${count === 1 ? '' : 's'} · ${show.category}`),
      h('p', {}, show.description),
      latest && h('div', { class: 'show-card-latest' },
        PlayButton(ctx, [latest], latest.title, 'sm'),
        h('span', {}, h('small', { class: 'muted' }, 'Latest'), h('a', { href: ctx.link({ episode: latest.id }) }, latest.title))),
      show.featured && count > 0 && DownloadShow(ctx, show, 'btn-xs btn-ghost')));
}

const mb = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`);

/**
 * Download a featured show as a .zip to listen to offline: the episodes,
 * a page with every detail, and a small player. On a server it streams
 * from /podcasts/<id>.zip; in the local preview the browser builds it.
 */
export function DownloadShow(ctx, show, cls = 'btn-sm') {
  const bytes = archiveBytes(ctx.doc, show.id, ctx.today);
  const label = ['Download for offline', bytes ? `(.zip, ${mb(bytes)})` : '(.zip)'].join(' ');
  const title = 'Every episode, with a page and a player that work with no internet. Unzip it and open index.html.';
  if (isHosted()) return h('a', { class: `btn ${cls}`, href: `/podcasts/${encodeURIComponent(show.id)}.zip`, download: '', title }, icon('download', 14), label);
  const btn = h('button', { class: `btn ${cls}`, title, onclick: async () => {
    btn.disabled = true;
    try {
      await buildInBrowser(ctx, show, (t) => { btn.lastChild.textContent = t; });
    } catch (err) {
      uiAlert(`The download didn’t work: ${err.message}`);
    }
    btn.lastChild.textContent = label;
    btn.disabled = false;
  } }, icon('download', 14), h('span', {}, label));
  return btn;
}

async function buildInBrowser(ctx, show, say) {
  say('Gathering episodes…');
  const blobs = new Map();
  for (const e of Object.values(ctx.doc.episodes).filter((x) => x.podcastId === show.id && published(x, ctx.today))) {
    const url = await audioSrc(e.audio);
    if (url) blobs.set(e.id, await (await fetch(url)).blob());
  }
  const plan = showArchive({ doc: ctx.doc, org: ctx.org, showId: show.id, today: ctx.today, audioSize: (e) => blobs.get(e.id)?.size ?? -1, sourceUrl: location.href });
  const enc = new TextEncoder();
  const entries = [
    ...plan.texts.map((t) => { const data = enc.encode(t.text); return { name: t.name, size: data.length, data }; }),
    ...plan.binaries.map((b) => ({ name: b.name, size: b.bytes.length, data: b.bytes })),
  ];
  for (const x of plan.audio.filter((y) => y.size >= 0)) entries.push({ name: x.name, size: x.size, data: new Uint8Array(await blobs.get(x.episode.id).arrayBuffer()) });
  say('Making the zip…');
  const parts = [];
  for await (const p of zipStream(entries)) parts.push(p);
  const a = h('a', { href: URL.createObjectURL(new Blob(parts, { type: 'application/zip' })), download: plan.filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/**
 * The station's masthead. 'site' wears the banner of the site the station
 * lives on (or, if that site has none, the ripples), at the station's height.
 */
export function stationMasthead(st, site) {
  const m = { ...DEFAULT_MASTHEAD, ...(st.look?.masthead ?? {}) };
  if (m.preset !== 'site') return m;
  const sm = site ? siteDesign(site).masthead : null;
  return sm && sm.preset !== 'none' ? { ...sm, height: m.height } : { ...m, preset: 'ripples', image: null };
}

const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
const monthName = (iso) => new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * The archive, in one of three layouts (station look `archive`):
 *   seasons   show tabs, then season chips, then the episodes: the clearest way into a long archive
 *   timeline  every episode, newest first, under its month
 *   grid      episode art in a grid
 * A search box looks across every show and season at once.
 */
function Archive(ctx, v, layout) {
  const pick = { show: v.archive[0]?.show.id ?? null, season: null };
  const search = h('input', { class: 'input input-sm archive-search', type: 'search', placeholder: 'Search every episode', 'aria-label': 'Search every episode' });
  const body = h('div', { class: `archive archive-${layout}` });
  const hit = (q) => (e) => !q || `${e.title} ${e.description} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(q);
  const showOf = (e) => ctx.doc.podcasts[e.podcastId];
  const empty = (text) => h('p', { class: 'empty' }, text);

  const bySeasons = () => {
    const entry = v.archive.find((a) => a.show.id === pick.show) ?? v.archive[0];
    if (!entry) return [empty('No episodes yet.')];
    const seasons = entry.seasons;
    const season = seasons.find((s) => s.season.number === pick.season) ?? seasons.at(-1);
    const eps = [...season.episodes].sort((a, b) => (entry.show.type === 'serial' ? 1 : -1) * (a.number - b.number));
    return [
      v.archive.length > 1 && h('div', { class: 'arc-shows', role: 'tablist', 'aria-label': 'Show' }, v.archive.map(({ show, seasons: ss }) =>
        h('button', { class: `arc-show${show.id === entry.show.id ? ' on' : ''}`, role: 'tab', 'aria-selected': String(show.id === entry.show.id), onclick: () => { pick.show = show.id; pick.season = null; draw(); } },
          Cover(show, 40), h('span', {}, h('strong', {}, show.title), h('small', {}, `${plural(ss.reduce((k, s) => k + s.episodes.length, 0), 'episode')} · ${plural(ss.length, 'season')}`))))),
      h('div', { class: 'arc-panel' },
        h('div', { class: 'arc-panel-head' },
          h('div', {}, h('a', { class: 'arc-panel-title', href: ctx.link({ show: entry.show.id }) }, entry.show.title), h('span', { class: 'muted' }, entry.show.category)),
          seasons.length > 1 && h('div', { class: 'arc-seasons', role: 'tablist', 'aria-label': 'Season' }, seasons.map(({ season: s }) =>
            h('button', { class: `arc-season${s.number === season.season.number ? ' on' : ''}`, role: 'tab', 'aria-selected': String(s.number === season.season.number), title: s.title, onclick: () => { pick.season = s.number; draw(); } }, `Season ${s.number}`)))),
        (season.season.title || season.season.description) && h('div', { class: 'season-intro' }, h('strong', {}, season.season.title || `Season ${season.season.number}`), season.season.description && h('p', { class: 'muted' }, season.season.description)),
        h('div', { class: 'episode-list' }, eps.map((e) => EpisodeCard(ctx, e, { showShow: false })))),
    ];
  };
  const byMonth = (eps) => {
    const months = new Map();
    for (const e of eps) { const k = e.publishedAt.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(e); }
    return [...months].map(([k, list]) => h('section', { class: 'arc-month' },
      h('h3', {}, h('span', {}, monthName(k)), h('small', { class: 'muted' }, `${list.length} episode${list.length === 1 ? '' : 's'}`)),
      h('div', { class: 'episode-list' }, list.map((e) => EpisodeCard(ctx, e)))));
  };
  const asGrid = (eps) => [h('div', { class: 'arc-grid' }, eps.map((e) => {
    const show = showOf(e);
    return h('article', { class: 'arc-tile' },
      h('div', { class: 'arc-tile-media' },
        h('a', { class: 'arc-tile-art', href: ctx.link({ episode: e.id }), 'aria-label': e.title }, EpisodeArt(e, show, 360, 'arc-art')),
        h('button', { class: 'btn btn-primary btn-circle btn-sm arc-tile-play', 'aria-label': `Play ${e.title}`, onclick: () => ctx.player.play([e]) }, icon('play', 14))),
      h('a', { class: 'arc-tile-title', href: ctx.link({ episode: e.id }) }, e.title),
      h('small', { class: 'muted' }, [show?.title, episodeLabel(e), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · ')));
  }))];

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const found = v.episodes.filter(hit(q));
    let kids;
    if (q) kids = found.length ? [h('p', { class: 'arc-found muted' }, `${found.length} episode${found.length === 1 ? '' : 's'} match “${search.value.trim()}”`), ...(layout === 'grid' ? asGrid(found) : [h('div', { class: 'episode-list arc-results' }, found.map((e) => EpisodeCard(ctx, e)))])] : [empty('No episodes match.')];
    else if (!v.episodes.length) kids = [empty('No episodes yet.')];
    else if (layout === 'timeline') kids = byMonth(v.episodes);
    else if (layout === 'grid') kids = asGrid(v.episodes);
    else kids = bySeasons();
    body.replaceChildren(...kids.filter(Boolean));
  };
  search.addEventListener('input', draw);
  draw();
  return h('section', { class: 'arc' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Every show and past episode'), search),
    body);
}

/** The station's home: a masthead, the latest episode, featured shows, then the archive. */
export function StationHome(ctx) {
  const st = ctx.doc.station;
  const look = { ...DEFAULT_LOOK, ...st.look };
  const v = stationView(ctx.doc, ctx.today);
  const current = v.current;
  const currentShow = current && ctx.doc.podcasts[current.podcastId];
  const banner = look.hero === 'banner' ? null : Masthead(stationMasthead(st, ctx.site), { cls: 'station-mh' });
  const words = h('div', { class: 'station-hero-text' },
    h('p', { class: 'eyebrow' }, 'Podcast station'),
    h('h1', {}, st.name),
    st.tagline && h('p', { class: 'station-tagline' }, st.tagline),
    st.description && h('p', { class: 'station-desc' }, st.description));
  const now = current
    ? h('div', { class: 'now-card' },
        h('a', { href: ctx.link({ episode: current.id }), tabindex: -1, 'aria-hidden': 'true' }, EpisodeArt(current, currentShow, 112)),
        h('div', { class: 'now-card-text' },
          h('span', { class: 'now-kicker' }, h('i', { class: 'now-dot', 'aria-hidden': 'true' }), 'Latest episode'),
          h('a', { class: 'now-title', href: ctx.link({ episode: current.id }) }, current.title),
          h('span', { class: 'muted' }, meta(current, currentShow)),
          h('button', { class: 'btn btn-primary btn-sm', onclick: () => ctx.player.play([current]) }, icon('play', 14), 'Play')))
    : h('p', { class: 'empty' }, 'No episodes yet.');

  let hero;
  if (look.hero === 'masthead') {
    hero = h('section', { class: `station-hero st-masthead${banner ? '' : ' no-media'}` },
      h('div', { class: 'st-masthead-media' }, banner, h('div', { class: 'st-masthead-words' }, words)),
      now);
  } else {
    hero = h('div', { class: 'st-hero-wrap' },
      banner && h('div', { class: 'st-slim' }, Masthead({ ...stationMasthead(st, ctx.site), height: 's' }, { cls: 'station-mh' })),
      h('section', { class: 'station-hero' }, words, now));
  }

  return h('div', { class: `station station-home st-hero-${look.hero} st-archive-${look.archive}` },
    hero,
    v.featured.length > 0 && h('section', {},
      h('div', { class: 'section-head' }, h('h2', {}, 'Featured shows')),
      h('div', { class: 'show-grid' }, v.featured.map((f) => ShowCard(ctx, f.show, f)))),
    Archive(ctx, v, look.archive));
}

const LISTEN = [['apple', 'Apple Podcasts'], ['spotify', 'Spotify'], ['youtube', 'YouTube'], ['website', 'Website']];
/** Where else to listen: the links a show keeps. */
function ListenLinks(show) {
  const links = LISTEN.filter(([k]) => /^https?:\/\//.test(show.links?.[k] ?? ''));
  return links.length ? h('div', { class: 'listen-links' }, h('small', { class: 'muted' }, 'Listen on'),
    links.map(([k, label]) => h('a', { class: 'btn btn-xs btn-soft', href: show.links[k], target: '_blank', rel: 'noopener' }, label))) : null;
}
function ShareButton(label = 'Share') {
  const b = h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
    try { await navigator.clipboard.writeText(location.href); b.lastChild.textContent = 'Link copied'; setTimeout(() => { b.lastChild.textContent = label; }, 1600); } catch { /* no clipboard */ }
  } }, icon('share', 14), h('span', {}, label));
  return b;
}

/** A show's page: about, hosts, its seasons as tabs, and the RSS feed. */
export function ShowPage(ctx, show) {
  const seasons = seasonsOf(ctx.doc, show.id).filter((s) => Object.values(ctx.doc.episodes).some((e) => e.podcastId === show.id && e.season === s.number && published(e, ctx.today)));
  let current = seasons.at(-1)?.number;
  const tabs = h('div', { class: 'arc-seasons season-tabs', role: 'tablist', 'aria-label': 'Season' });
  const list = h('div', { class: 'episode-list' });
  const draw = () => {
    tabs.replaceChildren(...seasons.map((s) => h('button', { class: `arc-season${s.number === current ? ' on' : ''}`, role: 'tab', 'aria-selected': String(s.number === current), title: s.title, onclick: () => { current = s.number; draw(); } }, `Season ${s.number}`)));
    const season = seasons.find((s) => s.number === current);
    const eps = Object.values(ctx.doc.episodes).filter((e) => e.podcastId === show.id && e.season === current && published(e, ctx.today))
      .sort((a, b) => (show.type === 'serial' ? 1 : -1) * ((a.number - b.number) || a.publishedAt.localeCompare(b.publishedAt)));
    list.replaceChildren(
      season?.title && h('div', { class: 'season-intro' }, h('strong', {}, season.title), season.description && h('p', { class: 'muted' }, season.description)),
      ...(eps.length ? eps.map((e) => EpisodeCard(ctx, e, { showShow: false })) : [h('p', { class: 'empty' }, 'No episodes in this season yet.')]));
  };
  draw();
  const all = Object.values(ctx.doc.episodes).filter((e) => e.podcastId === show.id && published(e, ctx.today)).sort((a, b) => a.season - b.season || a.number - b.number);
  const rss = () => URL.createObjectURL(new Blob([podcastRss(ctx.doc, show.id, { baseUrl: ctx.org.contact.website || location.origin, today: ctx.today })], { type: 'application/rss+xml' }));
  return h('div', { class: 'station' },
    h('p', { class: 'crumbs' }, h('a', { href: ctx.link({ view: 'station' }) }, ctx.doc.station.name), ' / ', show.title),
    h('section', { class: 'show-hero' },
      Cover(show, 180),
      h('div', {},
        h('h1', {}, show.title),
        h('p', { class: 'muted' }, [show.category, show.type === 'serial' ? 'Listen in order' : 'Newest first', `${all.length} episodes`].join(' · ')),
        h('p', { class: 'show-desc' }, show.description),
        show.hostIds.length > 0 && h('div', { class: 'hosts' }, h('small', { class: 'muted' }, 'Hosted by'),
          show.hostIds.map((id) => ctx.org.staff[id] && h('span', { class: 'host' }, Avatar(ctx.org.staff[id], 26), ctx.org.staff[id].name))),
        h('div', { class: 'show-actions' },
          all.length > 0 && h('button', { class: 'btn btn-primary btn-sm', onclick: () => ctx.player.play(all) }, icon('play', 14), 'Play from the start'),
          h('a', { class: 'btn btn-sm', href: '#', onclick: (e) => { e.currentTarget.href = rss(); }, download: `${show.handle}.xml` }, icon('rss', 14), 'RSS feed'),
          show.featured && all.length > 0 && DownloadShow(ctx, show),
          ShareButton()),
        ListenLinks(show))),
    seasons.length > 1 && tabs,
    list);
}

/** An episode's page: the player, its notes and the people in it. */
export function EpisodePage(ctx, e) {
  const show = ctx.doc.podcasts[e.podcastId];
  return h('div', { class: 'station episode-page' },
    h('p', { class: 'crumbs' }, h('a', { href: ctx.link({ view: 'station' }) }, ctx.doc.station.name), ' / ', h('a', { href: ctx.link({ show: show.id }) }, show.title), ' / ', episodeLabel(e)),
    h('section', { class: 'show-hero' },
      EpisodeArt(e, show, 160),
      h('div', {},
        h('h1', {}, e.title),
        h('p', { class: 'muted' }, meta(e, show)),
        h('button', { class: 'btn btn-primary', onclick: () => ctx.player.play([e]) }, icon('play', 16), 'Play episode'),
        e.description && h('p', { class: 'show-desc' }, e.description))),
    e.personIds.length > 0 && h('div', { class: 'hosts' }, h('small', { class: 'muted' }, 'In this episode'),
      e.personIds.map((id) => ctx.org.staff[id] && h('span', { class: 'host' }, Avatar(ctx.org.staff[id], 26), ctx.org.staff[id].name))),
    e.tags?.length > 0 && h('div', { class: 'episode-tags' }, e.tags.map((t) => h('span', { class: 'badge badge-sm badge-soft' }, `#${t}`))),
    e.chapters?.length > 0 && h('section', { class: 'episode-chapters' }, h('h2', {}, 'Chapters'),
      h('ol', {}, [...e.chapters].sort((a, b) => a.at - b.at).map((c) => h('li', {},
        h('button', { class: 'chapter', onclick: () => ctx.player.play([e], { at: c.at }) }, h('span', { class: 'chapter-at' }, toClock(c.at)), h('span', {}, c.title)))))),
    e.notes && h('section', { class: 'episode-notes' }, h('h2', {}, 'Show notes'), Markdown(e.notes)),
    e.transcript && h('details', { class: 'episode-transcript' }, h('summary', {}, h('strong', {}, 'Transcript')), h('div', { class: 'transcript-body' }, e.transcript.split(/\n{2,}/).map((p) => h('p', {}, p)))),
    h('div', { class: 'show-actions' }, ShareButton('Share this episode'), ListenLinks(show)));
}

/**
 * The station player: one audio element with a queue, so it keeps playing
 * while the listener moves around the site. Its look follows the station
 * (`bar` along the bottom, `card` with the cover art, or `minimal`).
 */
export function Player(getDoc) {
  const audio = h('audio', { preload: 'none' });
  const art = h('div', { class: 'player-art' });
  const title = h('a', { class: 'player-title' }, '');
  const sub = h('span', { class: 'player-sub' }, '');
  const btn = h('button', { class: 'btn btn-primary btn-circle btn-sm', 'aria-label': 'Play' }, icon('play', 16));
  const seek = h('input', { type: 'range', class: 'range range-xs range-primary player-seek', min: 0, max: 100, value: 0, step: 0.1, 'aria-label': 'Position' });
  const time = h('span', { class: 'player-time' }, '0:00');
  const close = h('button', { class: 'icon-button player-close', 'aria-label': 'Close player' }, '×');
  const el = h('div', { class: 'station-player', hidden: true, role: 'region', 'aria-label': 'Podcast player' },
    art, h('div', { class: 'player-text' }, title, sub), btn, h('div', { class: 'player-progress' }, seek, time), close, audio);
  let queue = [];
  let link = () => '#';

  const setIcon = () => { btn.replaceChildren(icon(audio.paused ? 'play' : 'pause', 16)); btn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause'); };
  btn.addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
  close.addEventListener('click', () => { audio.pause(); el.hidden = true; });
  audio.addEventListener('play', setIcon);
  audio.addEventListener('pause', setIcon);
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 100;
    time.textContent = `${fmtDuration(Math.floor(audio.currentTime))} / ${fmtDuration(Math.floor(audio.duration || 0))}`;
  });
  seek.addEventListener('input', () => { if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration; });
  audio.addEventListener('ended', () => next());

  let startAt = 0;
  async function next() {
    const e = queue.shift();
    if (!e) return;
    const show = getDoc().podcasts[e.podcastId];
    art.replaceChildren(EpisodeArt(e, show, 52));
    title.textContent = e.title;
    title.href = link({ episode: e.id });
    sub.textContent = show?.title ?? '';
    el.hidden = false;
    const src = await audioSrc(e.audio);
    if (!src) { sub.textContent = 'This audio file is missing.'; return; }
    if (audio.dataset.ep === e.id && startAt) { audio.currentTime = startAt; startAt = 0; audio.play().catch(() => setIcon()); return; }
    audio.dataset.ep = e.id;
    audio.src = src;
    if (startAt) { const at = startAt; startAt = 0; audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; }, { once: true }); }
    audio.play().catch(() => setIcon());
  }

  return {
    el,
    audio,
    /** Play these episodes in order, the first from `at` seconds in. */
    play(episodes, { at = 0 } = {}) { queue = [...episodes]; startAt = at; next(); },
    /** The episode playing now, if any. */
    get current() { return audio.dataset.ep ?? null; },
    setLink(fn) { link = fn; },
    setLook(look) { el.className = `station-player player-${look.player}`; },
  };
}
