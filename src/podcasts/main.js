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
  toClock, fromClock, episodeCode, DEFAULT_LOOK, DEFAULT_MASTHEAD, podcastRoute, stationTheme,
} from '../platform/podcasts.js';
import { MASTHEADS, MASTHEAD_HEIGHTS, siteDesign } from '../platform/siteDesign.js';
import { mastheadSvg } from '../site/mastheads.js';
import { applyTheme, themeLabel } from '../platform/themes.js';
import { PaletteBuilder } from '../ui/PaletteBuilder.js';
import { DevicePreview, DeviceToggle, deviceMode } from '../ui/DevicePreview.js';
import { setCrumbs } from '../ui/crumbs.js';
import { Drawer } from '../ui/drawer.js';
import { putMedia, deleteMedia, audioDuration, maxUploadMb } from '../platform/media.js';
import { readImage } from '../ui/images.js';
import { Cover, EpisodeArt, Player, fmtDuration } from '../site/station.js';
import { COVER_TONES } from '../ui/standIn.js';
import { Markdown } from '../ui/markdown.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { today, short } from '../strategy/dates.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/dialog.js';
import { PeoplePicker } from './people.js';
import { linkTo } from '../plugins.js';
import { StudioHome, StudioEditor } from './studio/Studio.js';
import { StudioFiles } from './studio/Files.js';
import { currentUser } from '../platform/session.js';
import { projectLength, clock } from './studio/project.js';

/**
 * Podcasts: the studio for an org's own podcast station.
 *
 * The episode is what people make, so it leads: every page has a way to add
 * one, and an episode opens in a tray over the page you are on, never by
 * sending you somewhere else. Series (the collections an episode belongs
 * to) and the station (the whole thing, as listeners meet it) sit beside it.
 *
 *   #episodes                 every episode: what's coming, what's out, with the station alongside
 *   #series/<id>              one series: its episodes by season
 *   #station                  the station's name, art and line-up of series
 *   #design                   the public station: where it lives and how it looks, with a live preview
 *
 * Any of those can carry a tray, which opens over it and closes back to it:
 *
 *   …/<episode>               an episode: listen, read, publish
 *   …/<episode>/edit          editing it
 *   …/new                     adding an episode (on a series page, to that series)
 *   series/<id>/settings      the series: art, about, hosts, seasons, listen links
 *
 * Older links (#<series>/<episode>) still land in the right place.
 *
 * Every series and episode has cover art: uploaded, or generated in the
 * series' colour (ui/standIn.js). Episodes are uploaded .mp3 or .wav files
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
player.setLink(({ episode }) => (store.doc.episodes[episode] ? `#episodes/${episode}` : '#episodes'));
player.setLook({ player: 'card' });
player.el.classList.add('admin-player');
app.replaceChildren(side, panel);
document.body.append(player.el);

const doc = () => store.doc;
const now = today();
const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const safe = (fn) => { try { return fn(); } catch { return null; } };

/* ------------------------------------------------------------------ where we are */
const route = () => podcastRoute(location.hash, doc());
const go = (hash) => { if (location.hash.slice(1) !== hash) location.hash = hash; else render(); };
const here = () => route().base;

/** What the episode lists show: a series, a season, a state, and words to look for. */
const filter = { season: 'all', state: 'all', q: '', show: 'all' };
/** A file dropped on the page, waiting for the new-episode tray to pick it up. */
let pendingFile = null;

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
const allEpisodes = () => Object.values(doc().episodes).filter((e) => doc().podcasts[e.podcastId]);

/** Things in Dashi an episode can point at: library items and maps. */
let relatedCache = null;
function relatedChoices() {
  if (relatedCache) return relatedCache;
  const lib = safe(loadLibrary);
  const maps = safe(loadMaps);
  relatedCache = [
    ...Object.values(maps?.maps ?? {}).map((m) => ({ key: `map:${m.id}`, label: m.name || 'Untitled map', group: 'Ecosystem maps', href: linkTo('mapper', `#${m.id}`), icon: 'mapper' })),
    ...Object.values(lib?.items ?? {}).map((it) => ({ key: `library:${it.id}`, label: it.meta?.title || 'Untitled', group: 'Library', href: linkTo('library', `#item/${it.id}`), icon: 'book' })),
  ];
  return relatedCache;
}
const relatedOf = (key) => relatedChoices().find((r) => r.key === key) ?? { key, label: key, href: null, icon: 'link' };

/* ------------------------------------------------------------------ frame */
function render() {
  const r = route();
  const all = allEpisodes();
  const notYet = all.filter((e) => stateOf(e) !== 'live').length;
  side = swapSide(side, SideNav({ label: 'Episodes, series and station', sections: [
    { title: 'Podcasts', items: [
      { label: 'Episodes', sub: [`${all.length - notYet} published`, notYet && `${notYet} not yet`].filter(Boolean).join(' · '), icon: 'music', href: '#episodes', on: r.scope === 'episodes' },
      { label: 'Station', sub: doc().station.name, icon: 'radio', href: '#station', on: r.scope === 'station' },
      { label: 'Public station', sub: stationSite() ? `On ${stationSite().name}` : 'Not on a site yet', icon: 'globe', href: '#design', on: r.scope === 'design' },
    ] },
    { title: 'Studio', action: { label: 'New session', onclick: () => { location.hash = 'studio'; } }, items: [
      { label: 'Studio', sub: 'Record, edit and mix in the browser', icon: 'mic', href: '#studio', on: r.scope === 'studio' && !r.projectId && !r.page },
      { label: 'Audio files', sub: `${Object.keys(doc().files ?? {}).length} recordings, imports and beds`, icon: 'waveform', href: '#studio/files', on: r.page === 'files' },
      ...Object.values(doc().projects ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 6).map((p) => ({ label: p.title, sub: projectLength(p) ? clock(projectLength(p), { tenths: false }) : 'Empty', icon: 'waveform', href: `#studio/${p.id}`, on: r.projectId === p.id })),
    ] },
    { title: 'Series', action: { label: 'New series', onclick: newSeries }, items: [
      ...showsInOrder(doc()).map((p) => ({ label: p.title, sub: [countsOf(p.id).line, p.featured && 'featured'].filter(Boolean).join(' · '), lead: Cover(p, 28, 'side-cover'), href: `#series/${p.id}`, on: r.seriesId === p.id })),
      { label: 'New series', sub: 'A name is all it takes', icon: 'plus', onclick: newSeries },
    ] },
  ] }));

  const scroll = panel.querySelector('.pc-main')?.scrollTop ?? 0;
  const samePage = panel.dataset.base === r.base;
  panel.dataset.base = r.base;
  // The designer keeps its live preview: a change redraws only its controls.
  const designer = panel.querySelector('.pc-design');
  if (r.scope === 'design' && samePage && designer?.refresh) designer.refresh();
  // The studio holds its own session while you work: a save doesn't redraw it.
  else if (r.scope === 'studio' && r.projectId && samePage && panel.querySelector('.st')) { /* keep it */ }
  else {
    panel.querySelector('.st')?.stop?.();
    setCrumbs([]);
    const show = doc().podcasts[r.seriesId];
    if (show) panel.replaceChildren(SeriesPage(show, r));
    else if (r.scope === 'station') panel.replaceChildren(Station());
    else if (r.scope === 'design') panel.replaceChildren(StationDesign());
    else if (r.scope === 'studio') {
      const studio = { store, col, doc, org, me: currentUser(org)?.id ?? null, go: (hash) => { location.hash = hash; } };
      panel.replaceChildren(r.page === 'files' ? StudioFiles(studio) : r.projectId ? StudioEditor(studio, r.projectId) : StudioHome(studio));
      if (r.projectId) setCrumbs([{ label: doc().projects[r.projectId].title }]);
    }
    else panel.replaceChildren(EpisodesHome(r));
    if (samePage) { const m = panel.querySelector('.pc-main'); if (m) m.scrollTop = scroll; }
  }
  syncTray(r);
}

/* ------------------------------------------------------------------ trays */
/**
 * One tray at a time, named by the address. Moving to a new address swaps
 * it; closing it (×, Esc, the backdrop, Cancel) goes back to the page
 * behind. A change elsewhere redraws an episode or series tray in place,
 * keeping the field you were in; a form keeps what you typed.
 */
let tray = null;
function syncTray(r) {
  const t = r.tray;
  const key = t ? `${r.base}|${t.kind}|${t.id ?? ''}` : null;
  if (tray && tray.key !== key) { const old = tray; tray = null; old.quiet = true; old.drawer.close(); }
  if (!t) return;
  if (tray) { tray.refresh?.(); return; }
  const entry = { key, quiet: false };
  const onClose = () => { if (tray === entry) tray = null; if (!entry.quiet && route().base === r.base && route().tray) location.hash = r.base; };
  if (t.kind === 'episode') Object.assign(entry, EpisodeTray(t.id, r.base, onClose));
  else if (t.kind === 'settings') Object.assign(entry, SettingsTray(t.id, onClose));
  else Object.assign(entry, FormTray(t.kind === 'edit' ? doc().episodes[t.id] : null, r, onClose));
  tray = entry;
}

/** Redraw part of a tray, putting the cursor back in the field it was in. */
function keepFocus(box, draw) {
  const a = document.activeElement;
  const name = box.contains(a) ? a.getAttribute('name') : null;
  draw();
  if (name) box.querySelector(`[name="${CSS.escape(name)}"]`)?.focus({ preventScroll: true });
}
const later = (fn) => { let t = null; return () => { clearTimeout(t); t = setTimeout(fn, 0); }; };

function EpisodeTray(id, base, onClose) {
  const e = () => doc().episodes[id];
  const show = () => doc().podcasts[e()?.podcastId];
  const sub = () => [show()?.title, episodeCode(e())].filter(Boolean).join(' · ');
  const drawer = Drawer({ title: e().title, sub: sub(), body: EpisodeDetail(e()), actions: episodeActions(e(), base), wide: true, onClose });
  drawer.el.classList.add('pc-tray');
  return {
    drawer,
    refresh: later(() => {
      if (!e()) return;
      drawer.setTitle(e().title, sub());
      keepFocus(drawer.el, () => { drawer.setBody(EpisodeDetail(e())); drawer.setActions(episodeActions(e(), base)); });
    }),
  };
}

function SettingsTray(id, onClose) {
  const p = () => doc().podcasts[id];
  const drawer = Drawer({ title: 'Series settings', sub: p().title, lead: Cover(p(), 40), body: SeriesSettings(p()), wide: true, onClose });
  drawer.el.classList.add('pc-tray');
  return {
    drawer,
    refresh: later(() => {
      if (!p()) return;
      drawer.setTitle('Series settings', p().title);
      drawer.el.querySelector('.drawer-lead')?.replaceChildren(Cover(p(), 40));
      keepFocus(drawer.el, () => drawer.setBody(SeriesSettings(p())));
    }),
  };
}

function FormTray(e, r, onClose) {
  const file = pendingFile;
  pendingFile = null;
  const form = EpisodeForm(e, { seriesId: e?.podcastId ?? r.seriesId ?? (filter.show !== 'all' ? filter.show : null), base: r.base, file });
  const drawer = Drawer({
    title: e ? 'Edit episode' : 'Add an episode',
    sub: e ? `${e.title} · ${episodeCode(e)}` : 'Upload the audio, say what it is, and choose when it goes out.',
    body: form.el, actions: form.actions, wide: true, onClose,
  });
  drawer.el.classList.add('pc-tray', 'pc-form-tray');
  form.cancel = drawer.close;
  return { drawer, refresh: null };
}

async function newSeries() {
  const title = await uiPrompt('Name of the new series');
  if (!title?.trim()) return;
  const id = addSeries(title);
  location.hash = `series/${id}/settings`;
}
/** A new series with sensible defaults, as a store op. */
function seriesOp(title) {
  return col.add('podcasts', {
    handle: slugify(title).replace(/-/g, ''), title: title.trim(), description: '', category: 'Education', language: 'en', type: 'episodic', explicit: false,
    owner: { name: org.name, email: org.contact.email }, cover: null, accent: COVER_TONES[showsInOrder(doc()).length % COVER_TONES.length], hostIds: [], featured: false,
    order: showsInOrder(doc()).length, seasons: { 1: { number: 1, title: 'Season 1', description: '' } }, links: { website: '', apple: '', spotify: '', youtube: '' },
  });
}
function addSeries(title) { const op = seriesOp(title); store.apply(op); return op.id; }

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
/** The station as a whole: its name and art, and the line-up of series listeners meet first. */
function Station() {
  const st = doc().station;
  const update = (patch) => store.apply(col.set('station', { ...st, ...patch }));
  const shows = showsInOrder(doc());
  const eps = allEpisodes();
  const live = eps.filter((e) => stateOf(e) === 'live');
  const move = (show, dir) => {
    const i = shows.indexOf(show);
    const other = shows[i + dir];
    if (!other) return;
    store.apply(col.batch(shows.map((s, k) => col.update('podcasts', s.id, { order: s === show ? i + dir : s === other ? i : k }))));
  };
  const site = stationSite();
  const hostIds = new Set(shows.flatMap((s) => s.hostIds));

  return h('div', { class: 'pc-main pc-station' },
    PluginHeader('podcasts', { title: 'Station', blurb: 'The name, art and line-up of series that listeners meet first.', actions: [
      h('button', { class: 'btn btn-sm', onclick: newSeries }, icon('plus', 14), 'New series'),
      h('a', { class: 'btn btn-sm btn-primary', href: '#station/new' }, icon('upload', 14), 'Add episode'),
    ] }),
    h('div', { class: 'pc-body' },
      h('section', { class: 'pc-station-hero' },
        CoverUpload({ id: 'station', title: st.name, cover: st.cover, accent: '#55707a' }, 132, (cover) => update({ cover }), 'Station art'),
        h('div', { class: 'pc-hero-text' },
          h('input', { class: 'pc-inline pc-inline-title', name: 'station-name', value: st.name, 'aria-label': 'Station name', onchange: (e) => update({ name: e.target.value }) }),
          h('input', { class: 'pc-inline pc-inline-lede', name: 'station-tagline', value: st.tagline, placeholder: 'A tagline for your station', 'aria-label': 'Tagline', onchange: (e) => update({ tagline: e.target.value }) }),
          h('textarea', { class: 'pc-inline pc-inline-desc', name: 'station-description', rows: 2, placeholder: 'What listeners will find here', 'aria-label': 'Description', onchange: (e) => update({ description: e.target.value }) }, st.description),
          h('ul', { class: 'pc-stats', 'aria-label': 'The station at a glance' },
            [[shows.length, 'series', 'series'], [live.length, 'episode out', 'episodes out'], [eps.length - live.length, 'on the way', 'on the way'], [hostIds.size, 'host', 'hosts']]
              .map(([k, one, many]) => h('li', {}, h('strong', {}, String(k)), h('span', {}, k === 1 ? one : many))))),
        PublicCard()),

      h('div', { class: 'pc-section-head' }, h('h2', {}, 'Series on the station'), h('span', { class: 'muted small' }, 'Star a series to feature it. Featured series lead the station page, in this order.')),
      h('div', { class: 'pc-show-grid' },
        shows.map((s, i) => {
          const c = countsOf(s.id);
          return h('article', { class: `pc-show-card${s.featured ? ' featured' : ''}` },
            h('a', { class: 'pc-show-art', href: `#series/${s.id}`, 'aria-label': s.title }, Cover(s, 400, 'pc-cover-fill')),
            h('div', { class: 'pc-show-body' },
              h('a', { class: 'pc-show-title', href: `#series/${s.id}` }, s.title),
              h('span', { class: 'muted small' }, c.line || 'No episodes yet'),
              h('div', { class: 'pc-show-foot' },
                people(s.hostIds, 20),
                h('span', { class: 'spacer' }),
                h('button', { class: `pc-star${s.featured ? ' on' : ''}`, title: s.featured ? 'Featured on the station. Click to stop featuring it.' : 'Feature it on the station', 'aria-pressed': String(s.featured), onclick: () => store.apply(col.update('podcasts', s.id, { featured: !s.featured })) }, icon('star', 15)),
                h('div', { class: 'pc-order' },
                  h('button', { disabled: i === 0, 'aria-label': `Move ${s.title} earlier`, title: 'Earlier', onclick: () => move(s, -1) }, icon('chevronLeft', 14)),
                  h('button', { disabled: i === shows.length - 1, 'aria-label': `Move ${s.title} later`, title: 'Later', onclick: () => move(s, 1) }, icon('chevronRight', 14))))));
        }),
        h('button', { class: 'pc-show-card pc-show-new', onclick: newSeries }, icon('plus', 28), h('strong', {}, 'New series'), h('span', { class: 'muted small' }, 'A name is all it takes to start')))));
}

/** On the overview: the public station, small, and the way into its designer. */
function PublicCard() {
  const site = stationSite();
  return h('div', { class: 'pc-public' },
    h('a', { class: 'pc-public-shot', href: '#design', title: 'Design the public station' },
      site ? DevicePreview({ src: stationUrl({ frame: '1' }), title: 'The public station', mode: 'desktop', width: 300, aspect: 0.62, url: site.name })
        : h('span', { class: 'pc-public-none' }, icon('globe', 22), 'Not on a site yet')),
    h('div', { class: 'pc-public-body' },
      h('strong', {}, 'Your public station'),
      h('span', { class: 'muted small' }, !site ? 'Put it on one of your sites to give every series and episode a page.'
        : site.visibility === 'private' ? `On ${site.name}, which is members only.` : `Live on ${site.name}.`),
      h('div', { class: 'pc-public-links' },
        h('a', { class: 'btn btn-xs btn-primary', href: '#design' }, icon('palette', 13), 'Design the station'),
        site && h('a', { class: 'btn btn-xs btn-ghost', href: stationUrl(), target: '_blank', rel: 'noopener' }, 'Open'))));
}

/* ------------------------------------------------------------------ public station designer */
/**
 * Where the public station lives and how it looks: the masthead banner,
 * the top of the page, the archive layout, the player and art, and which
 * series lead. The preview on the right is the real station page, told
 * about each change so it follows without reloading.
 */
function StationDesign() {
  const st = () => doc().station;
  const look = () => ({ ...DEFAULT_LOOK, ...st().look, masthead: { ...DEFAULT_MASTHEAD, ...(st().look?.masthead ?? {}) } });
  const update = (patch) => store.apply(col.set('station', { ...st(), ...patch }));
  const setLook = (patch) => update({ look: { ...look(), ...patch } });
  const setMast = (patch) => setLook({ masthead: { ...look().masthead, ...patch } });
  const tell = () => {
    const f = stage.querySelector('iframe');
    try { f?.contentWindow?.postMessage({ type: 'dashi:podcasts', doc: structuredClone(doc()) }, location.origin); } catch { /* not loaded yet: it reads the saved station */ }
  };
  const themed = (el) => { applyTheme(el, stationTheme(st(), org.theme ?? {})); return el; };
  // The station's own colours. A draft (a slider moving) only tells the preview; a settled change saves.
  const tellTheme = (theme) => {
    const d = structuredClone(doc());
    d.station.look = { ...look(), theme };
    try { stage.querySelector('iframe')?.contentWindow?.postMessage({ type: 'dashi:podcasts', doc: d }, location.origin); } catch { /* not loaded yet */ }
  };
  const colours = PaletteBuilder({
    theme: st().look?.theme ?? org.theme ?? {},
    inherit: { label: 'Same as the site', on: () => !st().look?.theme, onPick: () => { const { theme, ...rest } = look(); update({ look: rest }); colours.update(org.theme ?? {}); } },
    brands: () => org.palettes ?? [],
    onDraft: tellTheme,
    onChange: (theme) => { const { shape, ...own } = theme; setLook({ theme: own }); },
  });
  const choice = (on, attrs, ...kids) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(on), ...attrs, class: `${attrs.class ?? ''}${on ? ' on' : ''}` }, ...kids);
  const room = () => Math.max(380, Math.min(820, (panel.clientWidth || 1100) - 470));

  const stage = h('div', { class: 'lk-stage' });
  const drawStage = () => {
    const site = stationSite();
    stage.className = `lk-stage ${deviceMode()}`;
    stage.replaceChildren(site
      ? DevicePreview({ src: stationUrl({ frame: '1' }), title: 'The public station, as listeners see it', width: room(), aspect: 0.7, url: `${org.name} · ${site.name}`, phoneHeight: 760 })
      : h('div', { class: 'pc-design-empty' }, icon('globe', 26), h('strong', {}, 'The station isn’t on a site yet'), h('span', { class: 'muted small' }, 'Pick a site on the left and the preview appears here.')));
  };
  const openLink = h('a', { class: 'btn btn-sm btn-ghost', target: '_blank', rel: 'noopener' }, icon('share', 13), 'Open');
  const controls = h('div', { class: 'lk-controls' });

  function drawControls() {
    const L = look();
    const site = stationSite();
    const siteMast = site ? siteDesign(site).masthead : null;
    openLink.href = stationUrl();
    openLink.hidden = !site;
    const upload = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': 'Upload a banner picture', onchange: async (e) => {
      try { setMast({ preset: 'upload', image: await readImage(e.target.files[0], 2000) }); } catch (err) { uiAlert(err.message); }
    } });
    const mastArt = (preset) => { const art = themed(h('span', { class: 'lk-mast-art mh' })); art.innerHTML = mastheadSvg(preset); return art; };
    const siteArt = () => (siteMast?.preset === 'upload' && siteMast.image ? h('span', { class: 'lk-mast-art' }, h('img', { src: siteMast.image, alt: '' }))
      : mastArt(siteMast && siteMast.preset !== 'none' ? siteMast.preset : 'ripples'));
    const shows = showsInOrder(doc());
    const move = (show, dir) => {
      const i = shows.indexOf(show);
      const other = shows[i + dir];
      if (other) store.apply(col.batch(shows.map((x, k) => col.update('podcasts', x.id, { order: x === show ? i + dir : x === other ? i : k }))));
    };
    const cards = (name, list, value, onPick, art) => h('div', { class: 'pd-cards', role: 'radiogroup', 'aria-label': name }, list.map((c) =>
      choice(c.id === value, { class: 'lk-choice pd-card', onclick: () => onPick(c.id) }, art?.(c.id), h('strong', {}, c.label), c.blurb && h('small', {}, c.blurb))));

    controls.replaceChildren(
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Where it lives'), h('span', { class: 'muted small' }, 'A page for the station, every series and every episode')),
        h('div', { class: 'lk-row' },
          h('label', { class: 'lk-label', for: 'pd-site' }, 'Site'),
          h('select', { id: 'pd-site', class: 'select select-sm', onchange: (e) => update({ siteId: e.target.value || null }) },
            h('option', { value: '' }, 'Not on a site'), options(Object.values(org.sites).map((x) => ({ id: x.id, label: `${x.name}${x.visibility === 'private' ? ' (members only)' : ''}` })), st().siteId))),
        site?.visibility === 'private' && h('p', { class: 'pd-note' }, icon('lock', 13), `${site.name} is members only, so listeners outside need to sign in. Pick a public site to reach everyone.`)),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Colours'), h('span', { class: 'muted small' }, st().look?.theme ? `The station’s own: ${themeLabel(st().look.theme)}` : `The site’s: ${themeLabel(org.theme)}`)),
        colours),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Masthead banner'), h('span', { class: 'muted small' }, 'Across the top of the station page')),
        h('div', { class: 'lk-masts', role: 'radiogroup', 'aria-label': 'Masthead banner' },
          choice(L.masthead.preset === 'site', { class: 'lk-mast', title: 'Wears the banner of the site the station is on', onclick: () => setMast({ preset: 'site' }) }, siteArt(), h('small', {}, 'Same as the site')),
          MASTHEADS.map((m) => choice(L.masthead.preset === m.id, { class: 'lk-mast', title: m.blurb, onclick: () => setMast({ preset: m.id }) }, mastArt(m.id), h('small', {}, m.label))),
          h('label', { class: `lk-mast lk-mast-upload${L.masthead.preset === 'upload' ? ' on' : ''}`, title: 'A wide picture, 2000 pixels across or more, works best' },
            L.masthead.image ? h('span', { class: 'lk-mast-art' }, h('img', { src: L.masthead.image, alt: '' })) : h('span', { class: 'lk-mast-art lk-mast-add' }, icon('upload', 18)),
            h('small', {}, L.masthead.image ? 'Your picture' : 'Upload your own'), upload),
          choice(L.masthead.preset === 'none', { class: 'lk-mast', onclick: () => setMast({ preset: 'none' }) }, h('span', { class: 'lk-mast-art lk-mast-none' }, 'None'), h('small', {}, 'No banner'))),
        L.masthead.preset !== 'none' && h('div', { class: 'lk-row' },
          h('span', { class: 'lk-label' }, 'Height'),
          h('div', { class: 'device-toggle xs', role: 'radiogroup', 'aria-label': 'Banner height' }, MASTHEAD_HEIGHTS.map((x) =>
            h('button', { type: 'button', role: 'radio', 'aria-checked': String(L.masthead.height === x.id), class: L.masthead.height === x.id ? 'on' : '', onclick: () => setMast({ height: x.id }) }, x.label)))),
        L.masthead.preset === 'upload' && h('div', { class: 'lk-row' },
          h('label', { class: 'lk-label', for: 'pd-focus' }, 'Show more of the'),
          h('input', { id: 'pd-focus', type: 'range', class: 'range range-xs', min: 0, max: 100, step: 5, value: L.masthead.focus ?? 50, onchange: (e) => setMast({ focus: +e.target.value }) }),
          h('span', { class: 'muted small' }, 'top · bottom'),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => setMast({ preset: 'site', image: null }) }, 'Remove'))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Top of the page')),
        cards('Top of the page', LOOKS.hero, L.hero, (hero) => setLook({ hero }), (id) => h('span', { class: `pd-sketch pd-hero-${id}`, 'aria-hidden': 'true' }, h('i'), h('b'), h('u')))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'The archive'), h('span', { class: 'muted small' }, 'How listeners find past episodes')),
        cards('Archive', LOOKS.archive, L.archive, (archive) => setLook({ archive }), (id) => h('span', { class: `pd-sketch pd-arc-${id}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Player'), h('span', { class: 'muted small' }, 'Where listening happens as people move around the site')),
        cards('Player', LOOKS.player, L.player, (player) => setLook({ player }), (id) => h('span', { class: `pd-sketch pd-player pd-player-${id}`, 'aria-hidden': 'true' },
          h('em', {}), h('em', {}), h('span', { class: 'pd-pl' }, h('b'), h('i'), h('u'))))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Cover art')),
        cards('Cover art', LOOKS.art, L.art, (art) => setLook({ art }), (id) => h('span', { class: `pd-sketch pd-art pd-art-${id}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))),
      h('section', { class: 'lk-box' },
        h('div', { class: 'lk-box-head' }, h('h2', {}, 'Featured series'), h('span', { class: 'muted small' }, 'Starred series lead the page, in this order')),
        h('ol', { class: 'pd-shows' }, shows.map((x, i) => h('li', { class: x.featured ? 'on' : '' },
          Cover(x, 32),
          h('span', { class: 'pd-show-name' }, x.title),
          h('button', { class: `pc-star${x.featured ? ' on' : ''}`, title: x.featured ? 'Featured. Click to stop featuring it.' : 'Feature it', 'aria-pressed': String(x.featured), onclick: () => store.apply(col.update('podcasts', x.id, { featured: !x.featured })) }, icon('star', 15)),
          h('div', { class: 'pc-order' },
            h('button', { disabled: i === 0, 'aria-label': `Move ${x.title} up`, onclick: () => move(x, -1) }, icon('chevronUp', 14)),
            h('button', { disabled: i === shows.length - 1, 'aria-label': `Move ${x.title} down`, onclick: () => move(x, 1) }, icon('chevronDown', 14))))))));
  }

  let siteShown = st().siteId;
  const view = h('div', { class: 'pc-main pc-design' },
    h('header', { class: 'lk-head' },
      h('div', {},
        h('h1', {}, 'Public station'),
        h('p', { class: 'muted' }, 'Where listeners find every series and episode. Its colours, banner and layout are designed here; it can wear your site’s colours or its own.'))),
    h('div', { class: 'lk-grid' },
      controls,
      h('aside', { class: 'lk-preview', 'aria-label': 'Preview' },
        h('div', { class: 'lk-preview-bar' }, DeviceToggle(() => { drawStage(); view.refresh(); }), h('span', { class: 'muted small' }, doc().station.name), h('span', { class: 'spacer' }), openLink),
        stage)));
  view.refresh = () => {
    if (st().siteId !== siteShown) { siteShown = st().siteId; drawStage(); } else tell();
    drawControls();
    const bar = view.querySelector('.lk-preview-bar');
    bar.replaceChild(DeviceToggle(() => { drawStage(); view.refresh(); }), bar.firstChild);
  };
  drawControls();
  drawStage();
  return view;
}

/* ------------------------------------------------------------------ rows */
function EpisodeRow(e, { showShow = false, base = here(), on = false } = {}) {
  const show = doc().podcasts[e.podcastId];
  return h('div', { class: `pc-row${on ? ' on' : ''}` },
    h('div', { class: 'pc-row-art' }, EpisodeArt(e, show, 48),
      h('button', { class: 'pc-row-play', 'aria-label': `Play ${e.title}`, title: 'Play', onclick: () => player.play([e]) }, icon('play', 16))),
    h('a', { class: 'pc-row-text', href: `#${base}/${e.id}` },
      h('strong', {}, e.title),
      h('small', {}, [showShow && show?.title, episodeCode(e), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · ')),
      e.description && h('span', { class: 'pc-row-desc' }, e.description)),
    h('span', { class: 'pc-row-date muted small' }, short(e.publishedAt)),
    StatusPill(e));
}

function Filters(eps, { seasons = null } = {}) {
  const count = (s) => eps.filter((e) => stateOf(e) === s).length;
  return h('div', { class: 'pc-filters' },
    seasons && seasons.length > 1 && h('div', { class: 'pc-chips', role: 'group', 'aria-label': 'Season' },
      h('button', { class: `pc-chip${filter.season === 'all' ? ' on' : ''}`, onclick: () => { filter.season = 'all'; render(); } }, 'All seasons'),
      seasons.map((s) => h('button', { class: `pc-chip${filter.season === s.number ? ' on' : ''}`, title: s.title, onclick: () => { filter.season = s.number; render(); } }, `S${s.number}`))),
    h('div', { class: 'pc-chips', role: 'group', 'aria-label': 'State' },
      [['all', `All ${eps.length}`], ['live', `Published ${count('live')}`], ['coming', `Scheduled ${count('coming')}`], ['draft', `Drafts ${count('draft')}`]]
        .map(([id, label]) => h('button', { class: `pc-chip${filter.state === id ? ' on' : ''}`, onclick: () => { filter.state = id; render(); } }, label))),
    h('span', { class: 'spacer' }),
    h('input', { class: 'input input-sm pc-search', type: 'search', name: 'pc-search', placeholder: 'Find an episode', value: filter.q, 'aria-label': 'Find an episode',
      oninput: (ev) => { filter.q = ev.target.value; const at = ev.target.selectionStart; render(); const box = panel.querySelector('input[name="pc-search"]'); box?.focus(); box?.setSelectionRange(at, at); } }));
}
const matches = (e) => (filter.state === 'all' || stateOf(e) === filter.state)
  && (!filter.q.trim() || `${e.title} ${e.description} ${e.notes} ${(e.tags ?? []).join(' ')} ${(e.guests ?? []).join(' ')}`.toLowerCase().includes(filter.q.trim().toLowerCase()));

/** Drop an .mp3 anywhere on this to start a new episode with it. */
function takesDrops(el, base) {
  el.addEventListener('dragover', (ev) => { if ([...(ev.dataTransfer?.types ?? [])].includes('Files')) { ev.preventDefault(); el.classList.add('over'); } });
  el.addEventListener('dragleave', (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove('over'); });
  el.addEventListener('drop', (ev) => {
    ev.preventDefault();
    el.classList.remove('over');
    const file = ev.dataTransfer.files[0];
    if (!file) return;
    if (!isAudioFile(file)) { uiAlert('Choose an .mp3 or .wav file.'); return; }
    pendingFile = file;
    go(`${base}/new`);
  });
  return el;
}

/* ------------------------------------------------------------------ episodes (home) */
/**
 * Every episode, with the station alongside: what's coming up and what's
 * out, narrowed by series, state or a word. Adding an episode starts here
 * (the button, or drop an .mp3 on the card).
 */
function EpisodesHome(r) {
  const shows = showsInOrder(doc());
  if (filter.show !== 'all' && !doc().podcasts[filter.show]) filter.show = 'all';
  const eps = allEpisodes();
  const inSeries = filter.show === 'all' ? eps : eps.filter((e) => e.podcastId === filter.show);
  const shown = inSeries.filter(matches);
  const upcoming = shown.filter((e) => stateOf(e) !== 'live').sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const live = shown.filter((e) => stateOf(e) === 'live').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const picked = r.tray?.id;
  const rows = (list) => h('div', { class: 'pc-rows' }, list.map((e) => EpisodeRow(e, { showShow: true, on: e.id === picked })));
  const group = (title, list, empty) => h('section', { class: 'pc-group' },
    h('div', { class: 'pc-section-head' }, h('h2', {}, title), h('span', { class: 'muted small' }, String(list.length))),
    list.length ? rows(list) : h('p', { class: 'pc-empty' }, empty));
  const picked1 = filter.show !== 'all' ? doc().podcasts[filter.show] : null;

  return h('div', { class: 'pc-main pc-home' },
    PluginHeader('podcasts', { title: 'Episodes', blurb: 'Everything your station puts out. Add an episode to any series from here.', actions: [
      h('a', { class: 'btn btn-sm btn-primary', href: `#${r.base}/new` }, icon('upload', 14), 'Add episode'),
    ] }),
    h('div', { class: 'pc-body' },
      h('div', { class: 'pc-home-top' }, StationStrip(), AddCard(r.base)),
      h('div', { class: 'pc-series-chips', role: 'group', 'aria-label': 'Series' },
        h('button', { class: `pc-schip${filter.show === 'all' ? ' on' : ''}`, onclick: () => { filter.show = 'all'; render(); } }, h('span', { class: 'pc-schip-all' }, icon('music', 14)), 'All series', h('small', {}, String(eps.length))),
        shows.map((s) => h('button', { class: `pc-schip${filter.show === s.id ? ' on' : ''}`, onclick: () => { filter.show = filter.show === s.id ? 'all' : s.id; render(); } }, Cover(s, 22), s.title, h('small', {}, String(countsOf(s.id).all)))),
        h('button', { class: 'pc-schip pc-schip-new', onclick: newSeries }, icon('plus', 13), 'New series'),
        picked1 && h('a', { class: 'pc-schip-open', href: `#series/${picked1.id}` }, `Open ${picked1.title}`, icon('chevronRight', 13))),
      Filters(inSeries),
      eps.length === 0
        ? h('div', { class: 'pc-empty big' }, icon('mic', 30), h('strong', {}, 'No episodes yet'), h('span', {}, 'Upload an .mp3 or .wav to make the first one. You can name its series as you go.'), h('a', { class: 'btn btn-sm btn-primary', href: `#${r.base}/new` }, 'Add the first episode'))
        : filter.state === 'all'
          ? h('div', { class: 'pc-groups' },
            group('Coming up and drafts', upcoming, filter.q ? 'Nothing coming up matches.' : 'Nothing scheduled. Drafts and future dates show here.'),
            group('Published', live, filter.q ? 'Nothing published matches.' : 'Nothing published yet.'))
          : shown.length ? rows(filter.state === 'live' ? live : upcoming) : h('p', { class: 'pc-empty' }, 'No episodes match.')));
}

/** On the episode list: the station, small, with the ways to its details and its public page. */
function StationStrip() {
  const st = doc().station;
  const site = stationSite();
  const shows = showsInOrder(doc());
  const eps = allEpisodes();
  const live = eps.filter((e) => stateOf(e) === 'live').length;
  return h('section', { class: 'pc-strip', 'aria-label': 'Your station' },
    h('a', { href: '#station', class: 'pc-strip-art', title: 'Station details' }, Cover({ id: 'station', title: st.name, cover: st.cover, accent: '#55707a' }, 64)),
    h('div', { class: 'pc-strip-text' },
      h('small', { class: 'pc-strip-kicker' }, 'Your station'),
      h('a', { href: '#station', class: 'pc-strip-name' }, st.name),
      h('span', { class: 'muted small' }, [`${shows.length} series`, `${live} out`, eps.length - live && `${eps.length - live} on the way`, site ? `on ${site.name}` : 'not on a site yet'].filter(Boolean).join(' · ')),
      h('div', { class: 'pc-strip-links' },
        h('a', { class: 'btn btn-xs btn-ghost', href: '#station' }, icon('radio', 13), 'Station details'),
        h('a', { class: 'btn btn-xs btn-ghost', href: '#design' }, icon('palette', 13), 'Design the public page'),
        site && h('a', { class: 'btn btn-xs btn-ghost', href: stationUrl(), target: '_blank', rel: 'noopener' }, icon('globe', 13), 'Open'))));
}

/** The way in to a new episode: click to choose a file, or drop one on it. */
function AddCard(base) {
  const input = h('input', { type: 'file', class: 'sr-only', accept: '.mp3,.wav,audio/mpeg,audio/wav', 'aria-label': 'Choose an .mp3 or .wav for a new episode', onchange: () => {
    const file = input.files[0];
    if (!file) return;
    if (!isAudioFile(file)) { uiAlert('Choose an .mp3 or .wav file.'); return; }
    pendingFile = file;
    go(`${base}/new`);
  } });
  return takesDrops(h('label', { class: 'pc-addcard' },
    h('span', { class: 'pc-addcard-icon' }, icon('upload', 20)),
    h('span', { class: 'pc-addcard-text' }, h('strong', {}, 'Add an episode'), h('small', {}, `Drop an .mp3 or .wav here, or click to choose one. Up to ${maxUploadMb()} MB.`)),
    input), base);
}

/* ------------------------------------------------------------------ a series */
function SeriesPage(p, r) {
  const c = countsOf(p.id);
  const hosts = p.hostIds.map((id) => org.staff[id]).filter(Boolean);
  const head = h('header', { class: 'pc-show-head' },
    h('a', { class: 'pc-show-head-art', href: `#series/${p.id}/settings`, title: 'Series settings' }, Cover(p, 116)),
    h('div', { class: 'pc-show-head-text' },
      h('p', { class: 'pc-eyebrow' }, 'Series', h('span', { 'aria-hidden': 'true' }, '·'), `@${p.handle} · ${p.category} · ${p.type === 'serial' ? 'Serial' : 'Episodic'}`, p.featured && h('span', { class: 'pc-feat' }, icon('star', 12), 'Featured')),
      h('h1', {}, p.title),
      p.description ? h('p', { class: 'pc-show-desc' }, p.description) : h('p', { class: 'pc-show-desc muted' }, 'No description yet. Add one in the series settings.'),
      h('div', { class: 'pc-show-meta' },
        hosts.length > 0 && h('span', { class: 'pc-hosts' }, people(p.hostIds, 22), h('span', {}, hosts.map((x) => x.name).join(', '))),
        h('span', { class: 'muted small' }, `${c.line || 'No episodes yet'} · ${n(seasonsOf(doc(), p.id).length, 'season')}`))),
    h('div', { class: 'pc-show-head-actions' },
      h('a', { class: 'btn btn-sm btn-primary', href: `#series/${p.id}/new` }, icon('upload', 14), 'Add episode'),
      h('div', { class: 'pc-head-row' },
        h('a', { class: 'btn btn-sm btn-ghost', href: `#series/${p.id}/settings` }, icon('settings', 14), 'Series settings'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => showRss(p), title: 'The feed podcast apps subscribe to' }, icon('rss', 14), 'RSS'),
        stationSite() && h('a', { class: 'btn btn-sm btn-ghost', href: stationUrl({ view: '', show: p.id }), target: '_blank', rel: 'noopener', title: 'Its page on the public station' }, icon('globe', 14), 'Public page'))));

  const eps = episodesOf(doc(), p.id);
  const seasons = seasonsOf(doc(), p.id);
  if (filter.season !== 'all' && !seasons.some((s) => s.number === filter.season)) filter.season = 'all';
  const shown = eps.filter(matches).filter((e) => filter.season === 'all' || e.season === filter.season);
  const picked = r.tray?.id && doc().episodes[r.tray.id]?.podcastId === p.id ? doc().episodes[r.tray.id] : null;
  const bySeason = [...seasons].reverse().map((s) => ({ s, list: shown.filter((e) => e.season === s.number) })).filter((x) => x.list.length);

  const list = h('div', { class: 'pc-list' },
    Filters(eps, { seasons }),
    eps.length === 0
      ? takesDrops(h('div', { class: 'pc-empty big' }, icon('mic', 30), h('strong', {}, 'No episodes in this series yet'), h('span', {}, 'Drop an .mp3 or .wav here, or add one.'), h('a', { class: 'btn btn-sm btn-primary', href: `#series/${p.id}/new` }, 'Add the first episode')), `series/${p.id}`)
      : bySeason.length === 0 ? h('p', { class: 'pc-empty' }, 'No episodes match.')
        : bySeason.flatMap(({ s, list: inSeason }, k) => {
          // The newest season stays open; past seasons fold into the archive below it, unless a filter is narrowing things down.
          const current = k === 0;
          const narrowed = filter.season !== 'all' || filter.q.trim() || filter.state !== 'all' || inSeason.includes(picked);
          const playable = inSeason.filter((e) => stateOf(e) === 'live').sort((a, b) => a.number - b.number);
          const sec = h('details', { class: 'pc-season', open: current || !!narrowed },
            h('summary', {},
              h('header', {},
                h('span', { class: 'pc-season-no' }, `S${s.number}`),
                h('div', {}, h('strong', {}, s.title || `Season ${s.number}`), s.description && h('small', { class: 'muted' }, s.description)),
                current && seasons.length > 1 && h('span', { class: 'pc-season-now' }, 'Current'),
                h('span', { class: 'spacer' }),
                h('span', { class: 'muted small' }, n(inSeason.length, 'episode')),
                playable.length > 0 && h('button', { class: 'btn btn-xs btn-ghost', onclick: (ev) => { ev.preventDefault(); player.play(playable); } }, icon('play', 12), 'Play season'),
                h('span', { class: 'pc-fold' }, icon('chevronDown', 14)))),
            h('div', { class: 'pc-rows' }, inSeason.map((e) => EpisodeRow(e, { on: e === picked }))));
          return k === 1 && filter.season === 'all' ? [h('p', { class: 'pc-archive-label' }, 'Past seasons'), sec] : [sec];
        }));

  return h('div', { class: 'pc-main pc-series' }, head, list);
}

/* ------------------------------------------------------------------ an episode, in its tray */
function EpisodeDetail(e) {
  const show = doc().podcasts[e.podcastId];
  const chapters = [...(e.chapters ?? [])].sort((a, b) => a.at - b.at);
  const crew = [...e.personIds.filter((id) => org.staff[id]).map((id) => ({ p: org.staff[id], tag: show?.hostIds.includes(id) ? 'Host' : null })), ...(e.guests ?? []).map((g) => ({ p: { name: g }, tag: 'Guest' }))];
  return h('div', { class: 'pc-ep' },
    h('div', { class: 'pc-ep-top' },
      h('div', { class: 'pc-ep-art' }, EpisodeArt(e, show, 200, 'pc-cover-fill'),
        h('button', { class: 'pc-ep-play', 'aria-label': `Play ${e.title}`, onclick: () => player.play([e]) }, icon('play', 22))),
      h('div', { class: 'pc-ep-about' },
        h('div', { class: 'pc-ep-status' }, StatusPill(e), e.explicit && h('span', { class: 'pc-pill draft' }, 'Explicit')),
        h('p', { class: 'pc-ep-meta' },
          show && h('a', { href: `#series/${show.id}`, title: 'Open the series' }, show.title), show && ' · ',
          [episodeCode(e), short(e.publishedAt), fmtDuration(e.audio?.duration)].filter(Boolean).join(' · ')),
        h('p', { class: 'pc-ep-file muted small' }, icon('music', 13), e.audio?.name ?? (e.audio?.mediaId ? 'Uploaded audio' : 'Sample audio')),
        e.description ? h('p', { class: 'pc-ep-desc' }, e.description) : h('p', { class: 'pc-ep-desc muted' }, 'No summary yet.'))),
    crew.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'In this episode'),
      h('div', { class: 'pc-people' }, crew.map(({ p, tag }) => h('span', { class: 'pc-person' }, Avatar(p, 22), p.name, tag && h('small', { class: 'pc-person-tag' }, tag))))),
    chapters.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'Chapters'),
      h('ol', { class: 'pc-chapters' }, chapters.map((c) => h('li', {}, h('button', { onclick: () => player.play([e], { at: c.at }), title: `Play from ${toClock(c.at)}` }, h('span', { class: 'chapter-at' }, toClock(c.at)), h('span', {}, c.title)))))),
    e.tags?.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'Tags'), h('div', { class: 'pc-tags' }, e.tags.map((t) => h('a', { class: 'pc-tag', href: `search.html?q=${encodeURIComponent(`#${t}`)}` }, `#${t}`)))),
    e.related?.length > 0 && h('section', { class: 'pc-block' }, h('h3', {}, 'Related in Dashi'), h('p', { class: 'muted tiny' }, 'For your team only. Never shown on the public station.'),
      h('div', { class: 'pc-related' }, e.related.map((k) => { const x = relatedOf(k); return h(x.href ? 'a' : 'span', { class: 'pc-rel', href: x.href }, icon(x.icon, 14), x.label); }))),
    e.notes && h('section', { class: 'pc-block' }, h('h3', {}, 'Episode notes'), h('div', { class: 'pc-notes' }, Markdown(e.notes))),
    e.transcript && h('details', { class: 'pc-block pc-transcript' }, h('summary', {}, h('h3', {}, 'Transcript'), h('span', { class: 'muted small' }, `${e.transcript.split(/\s+/).filter(Boolean).length} words`)),
      h('div', {}, e.transcript.split(/\n{2,}/).map((x) => h('p', {}, x)))));
}

/** The episode tray's footer: edit, publish or pull back, its public page, delete. */
function episodeActions(e, base) {
  const state = stateOf(e);
  const setStatus = (status, publishedAt = e.publishedAt) => store.apply(col.update('episodes', e.id, { status, publishedAt }));
  const publicHref = stationSite() && state === 'live' ? stationUrl({ view: '', episode: e.id }) : null;
  return [
    h('a', { class: 'btn btn-sm btn-primary', href: `#${base}/${e.id}/edit` }, icon('pencil', 14), 'Edit'),
    state !== 'live' && h('button', { class: 'btn btn-sm', onclick: () => setStatus('published', e.publishedAt > now ? now : e.publishedAt) }, 'Publish now'),
    state === 'live' && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => setStatus('draft') }, 'Move to drafts'),
    h('span', { class: 'spacer' }),
    publicHref && h('a', { class: 'btn btn-sm btn-ghost', href: publicHref, target: '_blank', rel: 'noopener', title: 'Its page on the public station' }, icon('globe', 14), 'Public page'),
    h('button', { class: 'btn btn-sm btn-ghost text-error', title: 'Delete', 'aria-label': `Delete ${e.title}`, onclick: () => removeEpisode(e, base) }, icon('trash', 14)),
  ].filter(Boolean);
}

async function removeEpisode(e, base) {
  if (!await uiConfirm(`Delete “${e.title}”? Its audio goes too.`, { danger: true, ok: 'Delete' })) return;
  go(base);
  store.apply(col.remove('episodes', e.id));
  if (e.audio?.mediaId) deleteMedia(e.audio.mediaId);
}

/* ------------------------------------------------------------------ the episode form, in its tray */
/**
 * Adding or editing an episode, in four steps down the tray: the audio;
 * what it is (series, season, title, summary, art, tags); who is in it; and
 * when it goes out. Notes, chapters, the transcript and links into Dashi
 * wait under "More details". Audio is required for a new episode.
 * Returns { el, actions } for the tray.
 */
function EpisodeForm(e, { seriesId, base, file: dropped = null }) {
  const shows = showsInOrder(doc());
  const NEW = '__new';
  const state = {
    file: null, cover: e?.cover ?? null,
    chapters: (e?.chapters ?? []).map((c) => ({ ...c })), related: [...(e?.related ?? [])],
    peopleTouched: !!e,
    when: !e ? 'now' : e.status === 'draft' ? 'draft' : stateOf(e) === 'coming' ? 'schedule' : 'now',
  };
  const series = () => doc().podcasts[seriesSel.value] ?? null;
  const often = (sid) => {
    const counts = {};
    for (const x of episodesOf(doc(), sid)) for (const id of x.personIds) counts[id] = (counts[id] ?? 0) + 1;
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  };
  const field = (label, control, hint = null, extra = '') => h('label', { class: `pc-field ${extra}` }, h('span', {}, label), control, hint && h('small', { class: 'muted' }, hint));
  const step = (no, title, ...kids) => h('section', { class: 'pc-step' }, h('h3', { class: 'pc-step-head' }, h('span', { class: 'pc-step-no' }, String(no)), title), ...kids);

  /* 1 · the audio */
  const fileInput = h('input', { type: 'file', class: 'sr-only', accept: '.mp3,.wav,audio/mpeg,audio/wav', 'aria-label': 'Audio file (.mp3 or .wav)' });
  const fileNote = h('span', {}, e ? (e.audio?.name ?? (e.audio?.mediaId ? 'Uploaded audio' : 'Sample audio')) : 'Drop the .mp3 or .wav here');
  const fileSub = h('small', { class: 'muted' }, e ? `${e.audio?.url && !e.audio?.mediaId ? `Linked: ${e.audio.name ?? 'audio elsewhere'}` : fmtDuration(e.audio?.duration)} · drop or choose a file to replace it` : `or click to choose one · up to ${maxUploadMb()} MB`);
  const drop = h('label', { class: `pc-drop big${e ? ' has' : ''}` }, h('span', { class: 'pc-drop-icon' }, icon('music', 22)), h('span', { class: 'pc-drop-text' }, fileNote, fileSub), fileInput);
  const title = h('input', { class: 'input input-sm', name: 'ep-title', placeholder: 'What is this episode called?', required: true, value: e?.title ?? '' });
  const take = (file) => {
    if (!file) return;
    if (!isAudioFile(file)) { uiAlert('Choose an .mp3 or .wav file.'); return; }
    state.file = file;
    drop.classList.add('has');
    fileNote.textContent = file.name;
    fileSub.textContent = `${(file.size / 1048576).toFixed(1)} MB · uploads when you save`;
    if (!title.value) title.value = file.name.replace(/\.(mp3|wav)$/i, '').replace(/[-_]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
    audioDuration(file).then((d) => { if (state.file === file && d) fileSub.textContent = `${fmtDuration(d)} · ${(file.size / 1048576).toFixed(1)} MB · uploads when you save`; }).catch(() => {});
  };
  fileInput.addEventListener('change', () => take(fileInput.files[0]));
  drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); take(ev.dataTransfer.files[0]); });

  /* 2 · what it is */
  const startSeries = seriesId && doc().podcasts[seriesId] ? seriesId : shows[0]?.id ?? NEW;
  const seriesSel = h('select', { class: 'select select-sm', name: 'ep-series', 'aria-label': 'Series' },
    options([...shows.map((s) => ({ id: s.id, label: s.title })), { id: NEW, label: shows.length ? 'A new series…' : 'A new series' }], startSeries));
  const newSeriesName = h('input', { class: 'input input-sm', name: 'ep-new-series', placeholder: 'Name of the new series' });
  const newSeriesField = field('New series name', newSeriesName, 'It starts with season 1. Add art and hosts in its settings after.');
  const seasonSel = h('select', { class: 'select select-sm', name: 'ep-season', 'aria-label': 'Season' });
  const seriesArt = h('span', { class: 'pc-series-pick-art' });
  const drawSeasons = () => {
    const p = series();
    const seasons = p ? seasonsOf(doc(), p.id) : [];
    const last = seasons.at(-1)?.number ?? 1;
    const keep = e && p?.id === e.podcastId ? String(e.season) : String(last);
    seasonSel.replaceChildren(...options([...(p ? seasons.map((s) => ({ id: String(s.number), label: s.title || `Season ${s.number}` })) : [{ id: '1', label: 'Season 1' }]), ...(p ? [{ id: 'new', label: `New season (${last + 1})` }] : [])], keep));
    newSeriesField.hidden = !!p;
    seriesArt.replaceChildren(p ? Cover(p, 34) : h('span', { class: 'pc-series-pick-new' }, icon('plus', 16)));
  };
  const description = h('textarea', { class: 'textarea textarea-sm', name: 'ep-description', rows: 2, placeholder: 'One or two lines on what it is about. Podcast apps show this.' }, e?.description ?? '');
  const tags = h('input', { class: 'input input-sm', name: 'ep-tags', placeholder: 'north, youth voice, robotics', value: (e?.tags ?? []).join(', ') });

  const artBox = h('div', { class: 'pc-art-pick' });
  const drawArt = () => {
    const p = series() ?? { id: 'new', title: newSeriesName.value || 'New series', accent: COVER_TONES[shows.length % COVER_TONES.length] };
    artBox.replaceChildren(
      EpisodeArt({ ...(e ?? { id: 'new', title: title.value || 'New episode' }), cover: state.cover }, p, 64),
      h('div', {},
        h('small', { class: 'muted' }, state.cover ? 'Its own art' : p.cover ? 'Uses the series art' : 'Made from the series colour'),
        h('div', { class: 'pc-art-btns' },
          h('label', { class: 'btn btn-xs' }, state.cover ? 'Change' : 'Upload its own', h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (ev) => { try { state.cover = await readImage(ev.target.files[0], 800); drawArt(); } catch (err) { uiAlert(err.message); } } })),
          state.cover && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => { state.cover = null; drawArt(); } }, 'Use the series art'))));
  };

  /* 3 · who is in it */
  const picker = PeoplePicker({
    staff: staffList(org), ids: e?.personIds ?? series()?.hostIds ?? doc().podcasts[startSeries]?.hostIds ?? [], guests: e?.guests ?? [],
    hostIds: doc().podcasts[startSeries]?.hostIds ?? [], often: often(startSeries),
    onChange: () => { state.peopleTouched = true; },
  });

  seriesSel.addEventListener('change', () => {
    drawSeasons();
    drawArt();
    const p = series();
    picker.setHosts(p?.hostIds ?? [], p ? often(p.id) : [], { replace: !state.peopleTouched });
    if (!p) newSeriesName.focus();
  });
  newSeriesName.addEventListener('input', () => drawArt());

  /* 4 · when it goes out */
  const date = h('input', { class: 'input input-sm', type: 'date', name: 'ep-date', value: e?.publishedAt && e.publishedAt > now ? e.publishedAt : e?.publishedAt ?? now });
  const whenNote = h('small', { class: 'muted pc-when' });
  const whenBox = h('div', { class: 'pc-when-pick', role: 'radiogroup', 'aria-label': 'When it goes out' });
  const live = e && stateOf(e) === 'live';
  const drawWhen = () => {
    const choices = [
      { id: 'now', label: live ? 'Published' : 'Publish now', blurb: live ? 'Out already' : 'As soon as you save', icon: 'globe' },
      { id: 'schedule', label: 'Schedule', blurb: 'On a day you pick', icon: 'calendar' },
      { id: 'draft', label: 'Save as draft', blurb: 'Only your team sees it', icon: 'pencil' },
    ];
    whenBox.replaceChildren(...choices.map((c) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(state.when === c.id), class: `pc-when-opt${state.when === c.id ? ' on' : ''}`, onclick: () => { state.when = c.id; if (c.id === 'schedule' && date.value <= now) date.value = ''; drawWhen(); if (c.id === 'schedule') date.focus(); } },
      icon(c.icon, 16), h('strong', {}, c.label), h('small', {}, c.blurb))));
    date.min = state.when === 'schedule' ? now : '';
    dateField.hidden = !(state.when === 'schedule' || (state.when === 'now' && live));
    dateLabel.textContent = state.when === 'schedule' ? 'Goes out on' : 'Published on';
    whenNote.textContent = state.when === 'draft' ? 'Not on the station or in the feed until you publish it.'
      : state.when === 'schedule' ? (date.value > now ? `Goes out on ${short(date.value)}, by itself.` : 'Pick a day after today.')
        : live ? 'It stays out. Change the date if it went out on another day.' : 'Goes out on the station and in the feed when you save.';
  };
  const dateLabel = h('span', {}, 'Goes out on');
  const dateField = h('label', { class: 'pc-field pc-date-field' }, dateLabel, date);
  date.addEventListener('change', drawWhen);

  /* more details */
  const type = h('select', { class: 'select select-sm', name: 'ep-type' }, options(EPISODE_TYPES.map((t) => ({ id: t, label: t === 'full' ? 'Full episode' : t[0].toUpperCase() + t.slice(1) })), e?.type ?? 'full'));
  const explicit = h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', name: 'ep-explicit', checked: !!e?.explicit });
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
    } }, icon('plus', 13), player.current === e?.id ? 'Add a chapter here' : 'Add a chapter'));
  drawChapters();
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
  const extras = [e?.notes && 'notes', e?.chapters?.length && n(e.chapters.length, 'chapter'), e?.transcript && 'transcript', e?.related?.length && n(e.related.length, 'link')].filter(Boolean);

  const submit = h('button', { class: 'btn btn-sm btn-primary', type: 'button' }, e ? 'Save changes' : 'Add episode');
  const label = () => (state.when === 'draft' ? (e ? 'Save changes' : 'Save draft') : state.when === 'schedule' ? (e ? 'Save changes' : 'Schedule it') : e ? 'Save changes' : 'Publish episode');
  const syncSubmit = () => { submit.textContent = label(); };
  whenBox.addEventListener('click', syncSubmit);

  const save = async (ev) => {
    ev?.preventDefault();
    const file = state.file;
    if (!e && !file) { uiAlert('Choose an .mp3 or .wav file for the episode.'); return; }
    if (file && file.size > maxUploadMb() * 1048576) { uiAlert(`Audio files can be up to ${maxUploadMb()} MB.`); return; }
    if (!title.value.trim()) { title.focus(); title.reportValidity?.(); return; }
    if (!series() && !newSeriesName.value.trim()) { uiAlert('Name the new series, or pick one.'); newSeriesName.focus(); return; }
    if (state.when === 'schedule' && !(date.value > now)) { uiAlert('Pick a day after today to schedule it, or publish it now.'); date.focus(); return; }
    submit.disabled = true;
    submit.textContent = file ? 'Uploading…' : 'Saving…';
    const ops = [];
    let p = series();
    if (!p) { const op = seriesOp(newSeriesName.value); ops.push(op); p = { id: op.id, seasons: op.data.seasons }; }
    const seasons = Object.values(p.seasons ?? {}).map((s) => s.number).sort((a, b) => a - b);
    const lastSeason = seasons.at(-1) ?? 1;
    const seasonNo = seasonSel.value === 'new' ? lastSeason + 1 : +seasonSel.value || 1;
    if (seasonSel.value === 'new') ops.push(col.update('podcasts', p.id, { seasons: { ...p.seasons, [seasonNo]: { number: seasonNo, title: `Season ${seasonNo}`, description: '' } } }));
    let audio = e?.audio;
    if (file) {
      try {
        audio = { mediaId: await putMedia(file, { onProgress: (f) => { submit.textContent = `Uploading… ${Math.floor(f * 100)}%`; } }), duration: await audioDuration(file), mimetype: file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg'), size: file.size, name: file.name };
      } catch (err) {
        uiAlert(err.message);
        submit.disabled = false;
        syncSubmit();
        return;
      }
      if (e?.audio?.mediaId) deleteMedia(e.audio.mediaId);
    }
    const day = state.when === 'schedule' || (state.when === 'now' && live) ? date.value || now : state.when === 'draft' ? (e?.publishedAt ?? now) : now;
    const status = state.when === 'draft' ? 'draft' : day > now ? 'scheduled' : 'published';
    const kind = type.value;
    const number = e && e.podcastId === p.id && e.season === seasonNo && e.type === kind ? e.number : kind === 'full' ? nextNumber(doc(), p.id, seasonNo) : 0;
    const who = picker.value();
    const fields = {
      podcastId: p.id, season: seasonNo, number, type: kind, title: title.value.trim(), slug: slugify(title.value), description: description.value.trim(),
      notes: notes.value, transcript: transcript.value.trim(), status, publishedAt: day, audio, personIds: who.ids, guests: who.guests,
      cover: state.cover, explicit: explicit.checked,
      chapters: state.chapters.filter((c) => c.title.trim()).map((c) => ({ at: c.at, title: c.title.trim() })).sort((a, b) => a.at - b.at),
      tags: [...new Set(tags.value.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))],
      related: state.related,
    };
    let id = e?.id;
    if (e) ops.push(col.update('episodes', e.id, fields));
    else { const add = col.add('episodes', fields); id = add.id; ops.push(add); }
    store.apply(ops.length > 1 ? col.batch(ops) : ops[0]);
    go(`${base}/${id}`);
  };
  submit.addEventListener('click', save);

  drawSeasons();
  drawArt();
  if (dropped) take(dropped);

  const form = h('form', { class: 'pc-form', onsubmit: save },
    step(1, 'The audio', drop),
    step(2, 'What it is',
      h('div', { class: 'pc-pair pc-series-pick' }, h('div', { class: 'pc-field' }, h('span', {}, 'Series'), h('div', { class: 'pc-series-row' }, seriesArt, seriesSel)), field('Season', seasonSel)),
      newSeriesField,
      field('Title', title),
      field('Summary', description),
      h('div', { class: 'pc-pair' }, h('div', { class: 'pc-field' }, h('span', {}, 'Art'), artBox), field('Tags', tags, 'Separate them with commas'))),
    step(3, 'Who is in it', picker.el, h('small', { class: 'muted' }, 'Staff and guests are named on the episode’s public page.')),
    step(4, 'When it goes out', whenBox, dateField, whenNote),
    h('details', { class: 'pc-more', open: false },
      h('summary', {}, h('span', {}, 'More details'), h('small', { class: 'muted' }, extras.length ? extras.join(', ') : 'Episode notes, chapters, transcript, type and links into Dashi'), icon('chevronDown', 14)),
      h('div', { class: 'pc-more-body' },
        field('Episode notes', notes, 'Shown under the episode on the station and in podcast apps.'),
        h('div', { class: 'pc-field' }, h('span', {}, 'Chapters'), chapterList),
        field('Transcript', transcript),
        h('div', { class: 'pc-pair' }, field('Type', type), h('div', { class: 'pc-field' }, h('span', {}, 'Content'), h('label', { class: 'pc-check' }, explicit, 'Explicit'))),
        h('div', { class: 'pc-field' }, h('span', {}, 'Related in Dashi (team only)'), relatedBox))));
  drawWhen();
  syncSubmit();

  const out = { el: form, actions: null, cancel: null };
  out.actions = [submit, h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => out.cancel?.() }, 'Cancel')];
  return out;
}

/* ------------------------------------------------------------------ series settings, in its tray */
function SeriesSettings(p) {
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
    h('section', { class: 'pc-set' },
      h('h3', {}, 'Cover art'),
      h('div', { class: 'pc-art-row' },
        CoverUpload(p, 132, (cover) => update({ cover }), 'Series cover art'),
        h('div', { class: 'pc-art-side' },
          h('p', { class: 'muted small' }, p.cover ? 'Your uploaded art. Square images of 1400 pixels or more work best in podcast apps.' : 'Generated art: a nature scene in the series colour, with its title. Upload your own any time.'),
          p.cover && h('button', { class: 'btn btn-xs', onclick: () => update({ cover: null }) }, 'Use generated art instead'),
          h('span', { class: 'pc-field-label' }, 'Series colour'),
          h('div', { class: 'pc-swatches', role: 'radiogroup', 'aria-label': 'Series colour' },
            COVER_TONES.map((c) => h('button', { class: `pc-swatch${(p.accent ?? '') === c ? ' on' : ''}`, style: `--c:${c}`, role: 'radio', 'aria-checked': String(p.accent === c), 'aria-label': c, onclick: () => update({ accent: c }) })))))),
    h('section', { class: 'pc-set' },
      h('h3', {}, 'About the series'),
      field('Name', text('show-title', p.title, (v) => update({ title: v }))),
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
    h('section', { class: 'pc-set' },
      h('h3', {}, 'Hosts'),
      h('div', { class: 'host-picker' },
        hosts.length ? hosts.map((s) => h('span', { class: 'host-chip' }, Avatar(s, 24), h('span', {}, s.name, s.title && h('small', {}, s.title)),
          h('button', { class: 'icon-button', 'aria-label': `Remove ${s.name} as host`, onclick: () => update({ hostIds: p.hostIds.filter((id) => id !== s.id) }) }, '×')))
          : h('span', { class: 'muted' }, 'No hosts yet.'),
        others.length > 0 && h('select', { class: 'select select-sm host-add', name: 'show-add-host', 'aria-label': 'Add a host', onchange: (ev) => { if (ev.target.value) update({ hostIds: [...p.hostIds, ev.target.value] }); } },
          h('option', { value: '' }, '+ Add a host'), options(others.map((x) => ({ id: x.id, label: x.name }))))),
      h('p', { class: 'muted small' }, 'Hosts are suggested for each new episode and named on the public series page.')),
    SeasonsPanel(p, eps, { setSeason, addSeason, removeSeason }),
    h('section', { class: 'pc-set' },
      h('h3', {}, 'Where people can listen'),
      h('p', { class: 'muted small' }, 'Paste the series’ address on each service once it is listed there (they all read your RSS feed). They show as buttons on the public pages.'),
      ['apple', 'spotify', 'youtube', 'website'].map((k) => field({ apple: 'Apple Podcasts', spotify: 'Spotify', youtube: 'YouTube', website: 'Website' }[k],
        text(`show-link-${k}`, p.links?.[k], (v) => update({ links: { ...p.links, [k]: v.trim() } }), { type: 'url', placeholder: 'https://…' }))),
      h('div', { class: 'pc-rss-row' }, h('button', { class: 'btn btn-sm', onclick: () => showRss(p) }, icon('rss', 14), 'See the RSS feed'))),
    h('section', { class: 'pc-set pc-danger' },
      h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: async () => {
        if (!await uiConfirm(`Delete the series “${p.title}” and its ${n(eps.length, 'episode')}?`, { danger: true, ok: 'Delete series' })) return;
        location.hash = 'episodes';
        store.apply(col.batch([...eps.map((e) => col.remove('episodes', e.id)), col.remove('podcasts', p.id)]));
        for (const e of eps) if (e.audio?.mediaId) deleteMedia(e.audio.mediaId);
      } }, icon('trash', 14), 'Delete this series')));
}

/**
 * A series' seasons, side by side as cards, newest last like a shelf: each
 * with its number, name and blurb (typed in place), its episodes' art, how
 * many are out and when it ran, and a way to its episodes. The newest is
 * marked current; a season with no episodes can be removed; the dashed card
 * at the end starts the next one.
 */
function SeasonsPanel(p, eps, { setSeason, addSeason, removeSeason }) {
  const seasons = seasonsOf(doc(), p.id);
  const next = (seasons.at(-1)?.number ?? 0) + 1;
  const span = (list) => {
    const dates = list.map((e) => e.publishedAt).filter(Boolean).sort();
    if (!dates.length) return null;
    const a = monthYear(dates[0]), b = monthYear(dates.at(-1));
    return a === b ? a : `${a} to ${b}`;
  };
  return h('section', { class: 'pc-set card pc-seasons' },
    h('div', { class: 'pc-seasons-head' },
      h('div', {}, h('h3', {}, 'Seasons'), h('p', { class: 'muted small' }, 'Group episodes into runs. Listeners pick a season on the public series page; the newest comes first.'))),
    h('ol', { class: 'pc-season-shelf' },
      seasons.map((x, k) => {
        const list = eps.filter((e) => e.season === x.number).sort((a, b) => a.number - b.number);
        const live = list.filter((e) => stateOf(e) === 'live').length;
        const current = k === seasons.length - 1;
        return h('li', { class: `pc-season-card${current ? ' current' : ''}` },
          h('div', { class: 'pc-season-card-top' },
            h('span', { class: 'pc-season-big', 'aria-hidden': 'true' }, String(x.number)),
            h('div', { class: 'pc-season-card-meta' },
              h('span', { class: 'pc-season-kicker' }, `Season ${x.number}`, current && h('span', { class: 'pc-season-now' }, 'Current')),
              h('small', { class: 'muted' }, [list.length ? `${n(list.length, 'episode')}${live < list.length ? `, ${live} out` : ''}` : 'No episodes yet', span(list)].filter(Boolean).join(' · '))),
            !list.length && h('button', { class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Remove season ${x.number}`, title: 'Remove this season (it has no episodes)', onclick: async () => { if (await uiConfirm(`Remove season ${x.number}?`)) removeSeason(x.number); } }, icon('trash', 13))),
          h('input', { class: 'pc-season-name', name: `season-${x.number}-title`, value: x.title, placeholder: `Season ${x.number}`, 'aria-label': `Season ${x.number} name`, onchange: (ev) => setSeason(x.number, { title: ev.target.value.trim() || `Season ${x.number}` }) }),
          h('textarea', { class: 'pc-season-desc', name: `season-${x.number}-desc`, rows: 2, placeholder: 'What this season is about, in a line or two', 'aria-label': `Season ${x.number} description`, onchange: (ev) => setSeason(x.number, { description: ev.target.value }) }, x.description ?? ''),
          h('div', { class: 'pc-season-art' }, list.length
            ? [...list.slice(0, 5).map((e) => h('span', { title: e.title }, EpisodeArt(e, p, 34))), list.length > 5 && h('span', { class: 'pc-season-more' }, `+${list.length - 5}`)]
            : h('span', { class: 'muted small' }, 'New episodes can go in this season.')),
          list.length > 0 && h('a', { class: 'pc-season-link', href: `#series/${p.id}`, onclick: () => { filter.season = x.number; } }, 'See its episodes', icon('chevronRight', 13)));
      }),
      h('li', {}, h('button', { class: 'pc-season-card pc-season-add', onclick: addSeason }, icon('plus', 22), h('strong', {}, `Start season ${next}`), h('small', { class: 'muted' }, 'For a new run of episodes')))));
}
const monthYear = (d) => new Date(`${d.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });

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
window.addEventListener('hashchange', () => { if (panel.dataset.base !== route().base) filter.season = 'all'; render(); });
render();
window.podcasts = { store, player };
