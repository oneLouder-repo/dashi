import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { toast } from '../ui/toast.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { uiConfirm, uiPrompt, uiForm, uiAlert } from '../ui/dialog.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { autosaveDoc, canWriteDoc, isHosted } from '../platform/storage.js';
import { loadOrg, loadPodcasts, loadPages, loadData, loadStrategy, loadDashboards, loadSocial } from '../platform/docs.js';
import { measureIndex } from '../platform/strategy.js';
import { valueAt } from '../platform/data.js';
import { published } from '../platform/podcasts.js';
import { currentUser } from '../platform/session.js';
import { enabledPlugins } from '../plugins.js';
import { scheme, inkOn, INK, tint } from '../ui/wheel.js';
import {
  NETWORKS, networkById, POST_KINDS, kindById, STATUSES,
  textFor, problemsFor, mockPush, statsFor, totalStats, duePosts,
} from '../platform/social.js';

/**
 * The Social Media Integrator (alpha 0.3, experimental), inside the Public
 * Portal. Create here, from what Dashi already holds (episodes, blog
 * posts, data, dashboards), fit each post to each network, then schedule
 * it or push it now.
 *
 * LIVE where it can be (d, 2026-11-27): Bluesky, Mastodon and webhooks
 * connect for real through the server (server/social.js), which keeps the
 * credentials and posts; it also sends scheduled posts on time. The other
 * networks need an approved app first, so they stay in PRACTICE mode: a
 * push stores a pretend permalink and pretend numbers.
 *
 *   #compose[/<post id>]  make or edit a post (#compose/new/<kind>/<source id> starts from something)
 *   #queue                drafts and scheduled posts
 *   #calendar             the month, with what goes out when
 *   #posted               what went out, with its numbers
 *   #channels             connect networks (live or practice)
 *   #insights             reach by network, the posts that did best
 */
const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'social', org });
const plugins = new Set(enabledPlugins(org).map((p) => p.id));
const store = new Store(loadSocial(), applyCollectionOp);
autosaveDoc('social', store, 200);
const canEdit = canWriteDoc('social');
const me = currentUser(org);
const doc = () => store.doc;

const app = document.querySelector('#app');
app.classList.add('frame', 'social-app');
let side = h('nav');
const main = h('section', { class: 'palette-main so-main' });
app.replaceChildren(side, main);

// What posts are made from.
// Episodes only for people with the podcast plugin: the integrator doesn't read podcasts on its own, so a role with podcasts off doesn't see them here.
const src = {
  podcasts: plugins.has('podcasts') ? loadPodcasts() : null,
  pages: loadPages(),
  data: loadData(),
  strategy: plugins.has('strategy') ? loadStrategy() : null,
  dashboards: loadDashboards(),
};
const today = new Date().toISOString().slice(0, 10);
const measures = src.strategy ? Object.values(measureIndex(src.strategy)) : [];
const episodes = src.podcasts ? Object.values(src.podcasts.episodes).filter((e) => published(e, today) && src.podcasts.podcasts[e.podcastId]).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) : [];
const articles = Object.values(src.pages.pages ?? {}).filter((p) => p.status === 'published').sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
const dashboards = Object.values(src.dashboards.dashboards ?? {}).filter((d) => d.visibility === 'public');
const siteUrl = (p) => org.sites[p.siteId]?.url ? `${org.sites[p.siteId].url.replace(/\/$/, '')}/${p.slug}` : '';

/* ----------------------------------------------------------- the pictures a post carries */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svgUrl = (inner, w = 1080, hgt = 1080) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}">${inner}</svg>`)}`;
const wrapWords = (text, n) => { const out = []; let line = ''; for (const w of String(text).split(/\s+/)) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ` ${w}`; } if (line.trim()) out.push(line.trim()); return out; };
const hueFor = (seed) => scheme('square', [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0) % 12, 4)[0];

/** An audiogram card for an episode: colour, title, show and a waveform (an upright video when pushed for real). */
function audiogram(e) {
  const show = src.podcasts?.podcasts[e.podcastId];
  const bg = hueFor(e.id); const ink = inkOn(bg);
  const bars = Array.from({ length: 46 }, (_, i) => { const v = 40 + Math.abs(Math.sin(i * 1.7 + e.title.length) * 150) + (i % 5) * 12; return `<rect x="${110 + i * 19}" y="${1330 - v / 2}" width="10" height="${v}" rx="5" fill="${ink}" opacity="${0.55 + (i % 3) * 0.15}"/>`; }).join('');
  const lines = wrapWords(e.title, 18).slice(0, 4).map((l, i) => `<text x="110" y="${640 + i * 104}" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="92" fill="${ink}">${esc(l)}</text>`).join('');
  return svgUrl(`<rect width="1080" height="1920" fill="${bg}"/><rect x="60" y="60" width="960" height="1800" rx="48" fill="none" stroke="${ink}" stroke-width="6"/><text x="110" y="300" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="40" letter-spacing="6" fill="${ink}">${esc((show?.title ?? 'Podcast').toUpperCase())}</text><text x="110" y="370" font-family="Inter,Arial,sans-serif" font-size="40" fill="${ink}" opacity=".8">${e.season ? `Season ${e.season} · ` : ''}Episode ${e.number ?? ''}</text>${lines}${bars}<circle cx="540" cy="1620" r="78" fill="${ink}"/><path d="M515 1580 L585 1620 L515 1660 Z" fill="${bg}"/>`, 1080, 1920);
}
/** A data card: one number, big, on a wheel colour, with a black rule. */
function dataCard(m) {
  const series = src.data.series?.[m.id];
  const last = series?.points?.at(-1);
  const first = series?.points?.[0];
  const value = last?.value ?? m.target ?? '';
  const bg = hueFor(m.id); const ink = inkOn(bg);
  const change = first && last && first.value ? Math.round(((last.value - first.value) / Math.abs(first.value)) * 100) : null;
  const name = wrapWords(m.name, 22).slice(0, 3).map((l, i) => `<text x="90" y="${700 + i * 76}" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="64" fill="${ink}">${esc(l)}</text>`).join('');
  return svgUrl(`<rect width="1080" height="1080" fill="${bg}"/><rect x="90" y="150" width="140" height="14" fill="${INK}"/><text x="90" y="520" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="300" fill="${ink}">${esc(Number(value).toLocaleString('en-CA'))}</text>${name}<text x="90" y="960" font-family="Inter,Arial,sans-serif" font-size="40" fill="${ink}" opacity=".85">${esc(m.unit ?? '')}${change != null ? ` · ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% since ${first.date.slice(0, 7)}` : ''}</text><rect x="0" y="1040" width="1080" height="40" fill="#fff"/><text x="1000" y="1070" text-anchor="end" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="28" fill="${INK}">${esc(org.name)}</text>`);
}
/** A dashboard snapshot: its title and a few of its numbers as bars, in wheel colours. */
function dashCard(d) {
  const hues = scheme('analogous', hueFor(d.id), 5);
  const ms = measures.slice(0, 5);
  const bars = ms.map((m, i) => { const v = src.data.series?.[m.id]?.points?.at(-1)?.value ?? 0; const t = Number(m.target) || v || 1; const w = Math.max(40, Math.min(880, (v / t) * 880)); return `<rect x="100" y="${380 + i * 120}" width="880" height="64" rx="10" fill="${tint(hues[i], 0.75)}"/><rect x="100" y="${380 + i * 120}" width="${w}" height="64" rx="10" fill="${hues[i]}"/><text x="120" y="${424 + i * 120}" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="30" fill="${inkOn(hues[i])}">${esc(m.name.slice(0, 44))}</text>`; }).join('');
  return svgUrl(`<rect width="1080" height="1080" fill="#fff"/><rect x="40" y="40" width="1000" height="1000" rx="36" fill="none" stroke="${INK}" stroke-width="5"/><text x="100" y="200" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="62" fill="${INK}">${esc(d.title.slice(0, 26))}</text><text x="100" y="270" font-family="Inter,Arial,sans-serif" font-size="34" fill="${INK}" opacity=".7">Live from our numbers · ${esc(org.name)}</text>${bars}`);
}
/** A blog post's card: the cover if it has one, else its title on a colour. */
function articleCard(p) {
  if (p.cover?.url || p.cover?.src) return p.cover.url ?? p.cover.src;
  const bg = hueFor(p.id); const ink = inkOn(bg);
  const lines = wrapWords(p.title, 20).slice(0, 4).map((l, i) => `<text x="90" y="${420 + i * 96}" font-family="Georgia,serif" font-weight="700" font-size="84" fill="${ink}">${esc(l)}</text>`).join('');
  return svgUrl(`<rect width="1080" height="1080" fill="${bg}"/><text x="90" y="250" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="34" letter-spacing="5" fill="${ink}">ON THE BLOG</text>${lines}<rect x="90" y="900" width="200" height="12" fill="${INK}"/>`);
}

/** Start a post from something in Dashi: the words and the picture are drafted for you. */
function draftFrom(kind, id) {
  const base = { id: uid('post'), kind, title: '', text: '', source: null, media: null, networks: Object.values(doc().channels).filter((c) => c.connected).map((c) => c.network), perNetwork: {}, status: 'draft', scheduledAt: null, postedAt: null, results: {}, createdBy: me?.id ?? null, createdAt: new Date().toISOString(), campaign: '' };
  if (kind === 'episode') {
    const e = episodes.find((x) => x.id === id) ?? episodes[0];
    if (!e) return base;
    const show = src.podcasts.podcasts[e.podcastId];
    return { ...base, title: e.title, source: { type: 'episode', id: e.id }, media: { kind: 'audiogram', src: audiogram(e), alt: `${e.title}, ${show?.title}` },
      text: `New on ${show?.title ?? 'the podcast'}: “${e.title}”. ${(e.description ?? '').split(/(?<=\.)\s/)[0] ?? ''}\n\nListen wherever you get your podcasts, or on our site.` };
  }
  if (kind === 'article') {
    const p = articles.find((x) => x.id === id) ?? articles[0];
    if (!p) return base;
    return { ...base, title: p.title, source: { type: 'page', id: p.id }, media: { kind: 'image', src: articleCard(p), alt: p.title },
      text: `${p.title}\n\n${p.summary ?? ''}${siteUrl(p) ? `\n\nRead it: ${siteUrl(p)}` : ''}` };
  }
  if (kind === 'datacard') {
    const m = measures.find((x) => x.id === id) ?? measures[0];
    if (!m) return base;
    const v = valueAt(src.data.series?.[m.id], today)?.value ?? src.data.series?.[m.id]?.points?.at(-1)?.value;
    return { ...base, title: m.name, source: { type: 'measure', id: m.id }, media: { kind: 'image', src: dataCard(m), alt: `${m.name}: ${v ?? ''} ${m.unit ?? ''}` },
      text: `${v != null ? Number(v).toLocaleString('en-CA') : 'New numbers'} ${m.unit ?? ''}: ${m.name.toLowerCase()}.\n\nThis is what the community built together this year. Thank you to everyone who made it happen.` };
  }
  if (kind === 'dashboard') {
    const d = dashboards.find((x) => x.id === id) ?? dashboards[0];
    if (!d) return base;
    return { ...base, title: d.title, source: { type: 'dashboard', id: d.id }, media: { kind: 'image', src: dashCard(d), alt: d.title },
      text: `Our numbers, live: ${d.title}. ${d.description ?? ''}\n\nSee the whole dashboard on our site.` };
  }
  return { ...base, title: 'A note', text: '' };
}

/* ----------------------------------------------------------- routing */
const route = () => { const parts = location.hash.slice(1).split('/'); return { view: parts[0] || 'compose', a: parts[1] ?? '', b: parts[2] ?? '', c: parts[3] ?? '' }; };
store.addEventListener('change', () => { if (!editing) render(); });
window.addEventListener('hashchange', render);
let editing = null;

/*
 * Live accounts, from the server (never their secrets). Without a server
 * (the local demo) every network is practice.
 */
const live = { networks: [], accounts: {} };
const api = async (method, path, body) => {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `It didn’t work (${res.status})`);
  return data;
};
async function loadLive() {
  if (!isHosted()) return;
  try {
    const r = await api('GET', '/api/social/accounts');
    live.networks = r.live ?? [];
    live.accounts = Object.fromEntries((r.accounts ?? []).map((x) => [x.network, x]));
  } catch { /* no server: practice only */ }
}
const isLive = (nw) => !!live.accounts[nw] && !!doc().channels[nw]?.live;

// Scheduled posts whose time has come go out when anyone opens the page (the server sends the live ones on time).
// Posts saved without their picture (seeded ones, say) draw it from their source, here only; it is saved if the post is edited.
for (const p of Object.values(doc().posts)) if (!p.media && p.source) p.media = draftFrom(p.kind, p.source.id).media ?? null;
loadLive().then(() => { for (const p of duePosts(doc())) push(p, { quiet: true }); if (route().view === 'channels') render(); });

const count = (status) => Object.values(doc().posts).filter((p) => p.status === status).length;
function drawSide(view) {
  const connected = Object.values(doc().channels).filter((c) => c.connected);
  side = swapSide(side, SideNav({ label: 'Social media', sections: [
    { title: 'Social media', items: [
      { label: 'Create a post', sub: 'Episodes, blog posts, data, dashboards', icon: 'plus', href: '#compose', on: view === 'compose' },
      { label: 'Queue', sub: `${count('draft')} drafts · ${count('scheduled')} scheduled`, icon: 'listBullets', href: '#queue', on: view === 'queue' },
      { label: 'Calendar', sub: 'What goes out when', icon: 'calendar', href: '#calendar', on: view === 'calendar' },
      { label: 'Posted', sub: `${count('posted')} posts, with their numbers`, icon: 'share', href: '#posted', on: view === 'posted' },
      { label: 'Channels', sub: connected.length ? connected.map((c) => networkById[c.network]?.label).join(', ') : 'Connect your networks', icon: 'plug', href: '#channels', on: view === 'channels' },
      { label: 'Insights', sub: 'Reach and what worked', icon: 'chart', href: '#insights', on: view === 'insights' },
    ] },
    { title: 'Start from', items: [
      { label: 'An episode', sub: `${episodes.length} published`, icon: 'mic', href: '#compose/new/episode' },
      { label: 'A blog post', sub: `${articles.filter((p) => p.kind === 'article').length} articles`, icon: 'news', href: '#compose/new/article' },
      { label: 'A data card', sub: `${measures.length} measures`, icon: 'chart', href: '#compose/new/datacard' },
      { label: 'A dashboard', sub: `${dashboards.length} public`, icon: 'dataviz', href: '#compose/new/dashboard' },
    ] },
  ] }));
}

const header = (current) => PluginHeader('social', {
  title: 'Social Media Integrator',
  blurb: 'Experimental. Make a post once from your episodes, blog posts, data and dashboards, fit it to every network, then schedule it or push it out. Bluesky, Mastodon and webhooks post for real; the other networks are practice for now.',
  tabs: [
    { id: 'compose', label: 'Create', icon: 'plus' },
    { id: 'queue', label: 'Queue', icon: 'listBullets' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'posted', label: 'Posted', icon: 'share' },
    { id: 'channels', label: 'Channels', icon: 'plug' },
    { id: 'insights', label: 'Insights', icon: 'chart' },
  ],
  current,
});

function render() {
  const r = route();
  drawSide(r.view);
  if (r.view !== 'compose') editing = null;
  let page;
  if (r.view === 'queue') page = Queue();
  else if (r.view === 'calendar') page = Calendar();
  else if (r.view === 'posted') page = Posted();
  else if (r.view === 'channels') page = Channels();
  else if (r.view === 'insights') page = Insights();
  else page = Compose(r);
  main.replaceChildren(header(r.view === 'compose' || !r.view ? 'compose' : r.view), h('div', { class: 'so-body' }, page));
}

/* ----------------------------------------------------------- pieces */
const chip = (network, { on = true, small = false } = {}) => { const n = networkById[network]; return h('span', { class: `so-net${on ? '' : ' off'}${small ? ' sm' : ''}`, style: `--net:${n?.colour ?? INK}`, title: n?.label }, n?.short ?? '?'); };
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Number(n).toLocaleString('en-CA'));

/** A post's picture as a JPEG data URL the networks take (ours are SVG), or null. */
async function rasterise(media) {
  if (!media?.src || media.kind === 'video') return null;
  if (/^data:image\/(png|jpeg);/.test(media.src)) return media.src;
  try {
    const img = new Image();
    img.src = media.src;
    await img.decode();
    const w = Math.min(1080, img.naturalWidth || 1080);
    const hgt = Math.round(w * ((img.naturalHeight || 1080) / (img.naturalWidth || 1080)));
    const c = Object.assign(document.createElement('canvas'), { width: w, height: hgt });
    c.getContext('2d').drawImage(img, 0, 0, w, hgt);
    for (const qual of [0.9, 0.75, 0.6]) { const url = c.toDataURL('image/jpeg', qual); if (url.length * 0.75 < 900_000) return url; }
  } catch { /* leave the picture out */ }
  return null;
}

/**
 * Before a person pushes for real: say which accounts it goes to, publicly,
 * and that Dashi can't take it back. Practice pushes need no question.
 */
async function confirmLive(post) {
  const nets = post.networks.filter((nw) => isLive(nw) && !(post.results?.[nw]?.live && post.results[nw].permalink));
  if (!nets.length) return true;
  const where = nets.map((nw) => {
    const vis = nw === 'mastodon' && live.accounts.mastodon?.visibility;
    return `${networkById[nw].label} as ${live.accounts[nw]?.handle ?? doc().channels[nw]?.handle}${vis && vis !== 'public' ? ` (${VIS_LABEL[vis]})` : ''}`;
  });
  return uiConfirm(`This posts “${post.title || 'this post'}” for real to ${where.join(', ')}. Dashi can’t unsend it: you’d delete it on the network itself.`, { title: 'Post for real now?', ok: 'Post now' });
}
const VIS_LABEL = { public: 'public', unlisted: 'unlisted: public, kept off timelines', private: 'followers only' };

/** Send a post to its networks: for real where the network is live, as practice elsewhere. */
async function push(post, { quiet = false, ask = !quiet } = {}) {
  if (ask && !await confirmLive(post)) return false;
  const at = new Date().toISOString();
  const results = { ...(post.results ?? {}) };
  const failed = [];
  const sentLive = [];
  let image;
  for (const nw of post.networks) {
    const ch = doc().channels[nw];
    if (results[nw]?.permalink && results[nw].live) continue; // already out (the scheduler, say)
    if (!ch?.connected) { failed.push(networkById[nw]?.label); continue; }
    if (problemsFor(post, nw, doc().settings).length) { failed.push(networkById[nw]?.label); continue; }
    if (isLive(nw)) {
      try {
        image ??= post.media ? { dataUrl: await rasterise(post.media), alt: post.media.alt ?? '' } : null;
        const r = await api('POST', '/api/social/push', { network: nw, postId: post.id, title: post.title, text: textFor(post, nw, doc().settings), image: image?.dataUrl ? image : null });
        results[nw] = { permalink: r.permalink, at: r.at ?? at, live: true };
        sentLive.push(networkById[nw].label);
      } catch (e) { failed.push(`${networkById[nw]?.label} (${e.message})`); }
    } else results[nw] = mockPush(post, nw, ch, at);
  }
  const ok = Object.values(results).some((r) => r.permalink || r.mock);
  const cur = doc().posts[post.id];
  if (cur) store.apply(col.update('posts', post.id, { results, status: failed.length && !ok ? 'failed' : 'posted', postedAt: at, failed }));
  const practice = Object.keys(results).filter((k) => results[k].mock && !post.results?.[k]).map((k) => networkById[k].label);
  if (quiet) return ok;
  toast(ok
    ? [sentLive.length && `Posted to ${sentLive.join(', ')}`, practice.length && `practice push to ${practice.join(', ')} (nothing left Dashi)`, failed.length && `not sent to ${failed.join(', ')}`].filter(Boolean).join('; ').replace(/^./, (c) => c.toUpperCase())
    : `Not sent: ${failed.join(', ')}.`, ok && !failed.length ? 'ok' : 'error');
  return ok;
}

/* ----------------------------------------------------------- create */
function Compose(r) {
  setCrumbs(r.a && r.a !== 'new' ? [{ label: doc().posts[r.a]?.title || 'A post' }] : []);
  let post;
  if (r.a === 'new') post = draftFrom(r.b || 'note', r.c);
  else if (r.a && doc().posts[r.a]) post = structuredClone(doc().posts[r.a]);
  else return Start();
  editing = post;
  let tab = 'all';
  const wrap = h('div', { class: 'so-compose' });
  const save = (status, patch = {}) => {
    Object.assign(post, patch, { status });
    editing = null;
    if (doc().posts[post.id]) store.apply(col.update('posts', post.id, post));
    else store.apply(col.add('posts', post));
    return post;
  };
  const draw = () => {
    const settings = doc().settings;
    const kind = kindById[post.kind] ?? kindById.note;
    const sourceList = post.kind === 'episode' ? episodes.map((e) => [e.id, `${src.podcasts.podcasts[e.podcastId]?.title} · ${e.title}`])
      : post.kind === 'article' ? articles.map((p) => [p.id, `${p.kind === 'article' ? 'Blog' : 'Page'} · ${p.title}`])
      : post.kind === 'datacard' ? measures.map((m) => [m.id, `${m.name} (${m.nodeTitle})`])
      : post.kind === 'dashboard' ? dashboards.map((d) => [d.id, d.title]) : [];
    const pick = sourceList.length ? h('select', { class: 'select select-sm w-full', 'aria-label': 'Made from', onchange: (e) => { const fresh = draftFrom(post.kind, e.target.value); Object.assign(post, { title: fresh.title, text: fresh.text, source: fresh.source, media: fresh.media }); draw(); } },
      sourceList.map(([id, label]) => h('option', { value: id, selected: post.source?.id === id }, label))) : null;
    const text = tab === 'all' ? post.text : (post.perNetwork[tab]?.text ?? textFor(post, tab, settings));
    const limit = tab === 'all' ? Math.min(...post.networks.map((n) => networkById[n]?.limit ?? 5000), 5000) : networkById[tab].limit;
    const counter = h('span', { class: `so-count${text.length > limit ? ' over' : ''}` }, `${text.length} / ${limit}`);
    const box = h('textarea', { class: 'textarea w-full so-text', rows: 7, 'aria-label': tab === 'all' ? 'Post text' : `Text for ${networkById[tab].label}`, value: text,
      oninput: (e) => { if (tab === 'all') post.text = e.target.value; else post.perNetwork[tab] = { text: e.target.value }; counter.textContent = `${e.target.value.length} / ${limit}`; counter.classList.toggle('over', e.target.value.length > limit); drawPreviews(); } });
    const channels = doc().channels;
    const previews = h('div', { class: 'so-previews' });
    // One network's tab shows just its preview; Every network shows them all.
    const drawPreviews = () => previews.replaceChildren(...(tab !== 'all' ? [tab] : post.networks.length ? post.networks : ['instagram']).map((nw) => Preview(post, nw, settings)));
    drawPreviews();
    const at = h('input', { type: 'datetime-local', class: 'input input-sm', 'aria-label': 'When it goes out', value: (post.scheduledAt ?? new Date(Date.now() + 864e5).toISOString()).slice(0, 16) });
    const problems = post.networks.flatMap((nw) => problemsFor(post, nw, settings).map((x) => [nw, x]));
    wrap.replaceChildren(
      h('div', { class: 'so-editor' },
        h('div', { class: 'so-kinds', role: 'radiogroup', 'aria-label': 'What it is' }, POST_KINDS.map((k) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(post.kind === k.id), class: `so-kind${post.kind === k.id ? ' on' : ''}`, onclick: () => { const fresh = draftFrom(k.id); Object.assign(post, { kind: k.id, title: fresh.title, text: fresh.text, source: fresh.source, media: fresh.media }); draw(); } }, icon(k.icon, 18), h('strong', {}, k.label), h('small', {}, k.sub)))),
        pick && h('label', { class: 'so-field' }, h('span', {}, 'Made from'), pick),
        h('label', { class: 'so-field' }, h('span', {}, 'Name, for your queue'), h('input', { class: 'input input-sm w-full', value: post.title, oninput: (e) => { post.title = e.target.value; } })),
        h('div', { class: 'so-field' }, h('span', {}, 'Where it goes'),
          h('div', { class: 'so-nets' }, NETWORKS.map((n) => {
            const connected = channels[n.id]?.connected;
            const on = post.networks.includes(n.id);
            return h('button', { type: 'button', class: `so-net-toggle${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: !connected, title: connected ? `${n.label}: ${n.shape}` : `${n.label} isn’t connected: see Channels`,
              onclick: () => { post.networks = on ? post.networks.filter((x) => x !== n.id) : [...post.networks, n.id]; if (!post.networks.includes(tab)) tab = 'all'; draw(); } }, chip(n.id, { on: connected }), n.label);
          }))),
        h('div', { class: 'so-tabs', role: 'tablist' },
          h('button', { role: 'tab', class: tab === 'all' ? 'on' : '', onclick: () => { tab = 'all'; draw(); } }, 'Every network'),
          post.networks.map((nw) => h('button', { role: 'tab', class: `${tab === nw ? 'on' : ''}${post.perNetwork[nw] ? ' own' : ''}`, title: post.perNetwork[nw] ? 'Has its own words' : 'Uses the main words', onclick: () => { tab = nw; draw(); } }, chip(nw, { small: true }), networkById[nw].label))),
        h('div', { class: 'so-field' }, box, h('div', { class: 'so-text-foot' }, counter,
          tab !== 'all' && post.perNetwork[tab] && h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: () => { delete post.perNetwork[tab]; draw(); } }, 'Use the main words again'),
          tab === 'all' && settings.hashtags.length > 0 && h('small', { class: 'muted' }, `Adds ${settings.hashtags.map((t) => `#${t}`).join(' ')}${settings.signoff ? ' and your sign-off' : ''}`))),
        problems.length > 0 && h('ul', { class: 'so-problems' }, problems.map(([nw, x]) => h('li', {}, chip(nw, { small: true }), x))),
        h('div', { class: 'so-actions' },
          h('button', { class: 'btn btn-sm', disabled: !canEdit, onclick: () => { save('draft'); toast('Saved as a draft'); location.hash = '#queue'; } }, 'Save draft'),
          h('span', { class: 'so-sched' }, at, h('button', { class: 'btn btn-sm btn-secondary', disabled: !canEdit || !post.networks.length, onclick: () => { save('scheduled', { scheduledAt: new Date(at.value).toISOString() }); toast(`Scheduled for ${when(new Date(at.value).toISOString())}`); location.hash = '#calendar'; } }, icon('clock', 14), 'Schedule')),
          h('button', { class: 'btn btn-sm btn-primary', disabled: !canEdit || !post.networks.length, onclick: async () => { if (!await confirmLive(post)) return; const p = save('draft'); location.hash = '#posted'; push(doc().posts[p.id], { ask: false }); } }, icon('share', 14), 'Push now')),
        liveNote(post)),
      h('div', { class: 'so-side' }, h('h3', {}, 'How it looks'), previews));
  };
  draw();
  return wrap;
}

/** Under the buttons: which networks post for real, and what a scheduled live post leaves out. */
function liveNote(post) {
  const real = post.networks.filter(isLive);
  const practice = post.networks.filter((nw) => !isLive(nw));
  if (!post.networks.length) return null;
  return h('p', { class: 'so-live-note muted small' },
    real.length ? [h('span', { class: 'so-live-tag' }, 'Live'), ` ${real.map((nw) => networkById[nw].label).join(', ')} post for real.`] : null,
    practice.length ? ` ${practice.map((nw) => networkById[nw].label).join(', ')} ${practice.length === 1 ? 'is' : 'are'} practice: nothing leaves Dashi.` : null,
    real.length && post.media ? ' Scheduled posts go to live networks as words and link; press Push now to send the picture too.' : null);
}

function Start() {
  const tile = (k, href, extra) => h('a', { class: 'so-start', href }, h('span', { class: 'so-start-ico' }, icon(k.icon, 22)), h('strong', {}, k.label), h('small', {}, extra ?? k.sub));
  const recent = (list, kind, label) => list.length > 0 && h('section', { class: 'so-recent' }, h('h3', {}, label),
    h('div', { class: 'so-recent-list' }, list.slice(0, 4).map(([id, title, sub]) => h('a', { href: `#compose/new/${kind}/${id}` }, h('strong', {}, title), h('small', { class: 'muted' }, sub)))));
  return h('div', { class: 'so-startpage' },
    h('div', { class: 'so-starts' }, POST_KINDS.map((k) => tile(k, `#compose/new/${k.id}`))),
    !Object.values(doc().channels).some((c) => c.connected) && h('p', { class: 'so-note' }, icon('plug', 16), 'No networks are connected yet. ', h('a', { href: '#channels' }, 'Connect one'), ' to push posts: Bluesky, Mastodon and webhooks for real, the others as practice.'),
    recent(episodes.map((e) => [e.id, e.title, src.podcasts.podcasts[e.podcastId]?.title]), 'episode', 'New episodes to share'),
    recent(articles.filter((p) => p.kind === 'article').map((p) => [p.id, p.title, p.publishedAt]), 'article', 'Latest blog posts'),
    recent(measures.map((m) => [m.id, m.name, m.nodeTitle]), 'datacard', 'Numbers worth a card'));
}

/** A network's preview: handle, text as that network gets it, the picture, and the counts it would show. */
function Preview(post, nw, settings) {
  const n = networkById[nw];
  const ch = doc().channels[nw];
  const text = textFor(post, nw, settings);
  const shown = text.length > 280 && nw !== 'linkedin' ? `${text.slice(0, 260)}… more` : text;
  const tall = n.media === 'video';
  const res = post.results?.[nw];
  return h('article', { class: `so-preview net-${nw}${tall ? ' tall' : ''}`, style: `--net:${n.colour}` },
    h('header', {}, chip(nw, { small: true }), h('span', {}, h('strong', {}, org.name), h('small', {}, ch?.handle ?? `@${n.id}`))),
    post.media && h('img', { src: post.media.src, alt: post.media.alt ?? '' }),
    h('p', {}, shown),
    res && h('footer', {}, res.stats ? [h('span', {}, icon('eye', 13), num(res.stats.views)), h('span', {}, icon('heart', 13), num(res.stats.likes)), h('span', {}, icon('share', 13), num(res.stats.shares))] : h('span', { class: 'so-live-tag' }, res.error ? 'Didn’t go' : 'Live'),
      res.permalink && h('a', { href: res.permalink, target: '_blank', rel: 'noopener', title: res.live ? 'Open the post' : 'Pretend link' }, 'View')));
}

/* ----------------------------------------------------------- queue, calendar, posted */
/** A posted post's numbers; live posts have none yet (the networks' own counts come later), so they link to the post. */
function RowStats(p, t) {
  const res = Object.values(p.results ?? {});
  const liveOne = res.find((r) => r.live && r.permalink);
  if (res.length && res.every((r) => r.live)) return h('span', { class: 'so-row-stats' }, h('span', { class: 'so-live-tag' }, 'Live'), liveOne && h('a', { href: liveOne.permalink, target: '_blank', rel: 'noopener' }, 'View'));
  return h('span', { class: 'so-row-stats' }, h('span', {}, icon('eye', 13), num(t.views)), h('span', {}, icon('heart', 13), num(t.likes)), liveOne && h('span', { class: 'so-live-tag', title: 'Some of it went out for real' }, 'Live'));
}
function Row(p) {
  const k = kindById[p.kind] ?? kindById.note;
  const t = totalStats(p);
  return h('li', { class: `so-row st-${p.status}` },
    p.media ? h('img', { class: 'so-thumb', src: p.media.src, alt: '' }) : h('span', { class: 'so-thumb so-thumb-ico' }, icon(k.icon, 18)),
    h('div', { class: 'so-row-text' },
      h('a', { href: `#compose/${p.id}` }, h('strong', {}, p.title || k.label)),
      h('small', { class: 'muted' }, [k.label, p.status === 'scheduled' ? `goes out ${when(p.scheduledAt)}` : p.status === 'posted' ? `posted ${when(p.postedAt)}` : p.status === 'failed' ? 'needs a look' : 'draft', p.campaign].filter(Boolean).join(' · '))),
    h('span', { class: 'so-row-nets' }, p.networks.map((nw) => chip(nw, { small: true, on: !!p.results?.[nw] || p.status !== 'posted' }))),
    p.status === 'posted' ? RowStats(p, t) : h('span'),
    h('span', { class: 'so-row-tools' },
      p.status !== 'posted' && canEdit && h('button', { class: 'btn btn-xs btn-primary', onclick: () => push(p) }, 'Push now'),
      p.status === 'posted' && p.failed?.length > 0 && canEdit && h('button', { class: 'btn btn-xs', title: `Didn’t go to ${p.failed.join(', ')}`, onclick: () => push(p) }, 'Try again'),
      canEdit && h('button', { class: 'btn btn-xs btn-ghost', title: 'Make a copy', onclick: () => { const id = uid('post'); store.apply(col.add('posts', { ...structuredClone(p), id, status: 'draft', results: {}, postedAt: null, scheduledAt: null, title: `${p.title} (copy)`, createdAt: new Date().toISOString() })); location.hash = `#compose/${id}`; } }, 'Copy'),
      canEdit && h('button', { class: 'btn btn-xs btn-ghost btn-square', 'aria-label': `Delete ${p.title}`, onclick: async () => { if (await uiConfirm(`Delete “${p.title}”?${p.status === 'posted' ? ' Dashi forgets it, but anything posted for real stays up on the networks: delete it there too.' : ''}`)) store.apply(col.remove('posts', p.id)); } }, icon('trash', 13))));
}

function Queue() {
  setCrumbs([]);
  const list = Object.values(doc().posts).filter((p) => p.status !== 'posted');
  const group = (status) => list.filter((p) => p.status === status).sort((a, b) => (a.scheduledAt ?? a.createdAt ?? '').localeCompare(b.scheduledAt ?? b.createdAt ?? ''));
  return h('div', {},
    ['failed', 'scheduled', 'draft'].map((st) => group(st).length > 0 && h('section', { class: 'so-group' }, h('h3', {}, STATUSES.find((s) => s.id === st).label, h('small', { class: 'muted' }, ` ${group(st).length}`)), h('ul', { class: 'so-list' }, group(st).map(Row)))),
    !list.length && h('p', { class: 'empty' }, 'Nothing waiting. ', h('a', { href: '#compose' }, 'Create a post'), '.'));
}

function Posted() {
  setCrumbs([]);
  const list = Object.values(doc().posts).filter((p) => p.status === 'posted').sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  return list.length ? h('ul', { class: 'so-list' }, list.map(Row)) : h('p', { class: 'empty' }, 'Nothing posted yet.');
}

let month = new Date(); month.setDate(1);
function Calendar() {
  setCrumbs([]);
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const byDay = {};
  for (const p of Object.values(doc().posts)) { const iso = p.status === 'posted' ? p.postedAt : p.scheduledAt; if (!iso) continue; const d = new Date(iso); (byDay[key(d)] ??= []).push(p); }
  const todayKey = key(new Date());
  return h('div', { class: 'so-cal-wrap' },
    h('div', { class: 'so-cal-head' },
      h('button', { class: 'btn btn-sm btn-ghost btn-square', 'aria-label': 'Previous month', onclick: () => { month = new Date(y, m - 1, 1); render(); } }, '‹'),
      h('h3', {}, first.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })),
      h('button', { class: 'btn btn-sm btn-ghost btn-square', 'aria-label': 'Next month', onclick: () => { month = new Date(y, m + 1, 1); render(); } }, '›')),
    h('div', { class: 'so-cal' },
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('b', {}, d)),
      days.map((d) => h('div', { class: `so-day${d.getMonth() !== m ? ' other' : ''}${key(d) === todayKey ? ' today' : ''}` },
        h('span', { class: 'so-day-n' }, d.getDate()),
        (byDay[key(d)] ?? []).slice(0, 3).map((p) => h('a', { class: `so-cal-post st-${p.status}`, href: `#compose/${p.id}`, title: `${p.title} · ${STATUSES.find((s) => s.id === p.status)?.label}` }, p.networks.slice(0, 3).map((nw) => chip(nw, { small: true })), h('span', {}, p.title))),
        (byDay[key(d)] ?? []).length > 3 && h('small', { class: 'muted' }, `+${byDay[key(d)].length - 3} more`)))));
}

/* ----------------------------------------------------------- channels and insights */
/** How to connect each live network: what to ask for, and where to find it. */
const LIVE_FORMS = {
  bluesky: { title: 'Connect Bluesky', message: 'Use an app password, never your main password. Make one in Bluesky under Settings → Privacy and security → App passwords. Dashi keeps it on the server, sealed, and only uses it to post.',
    fields: [{ name: 'identifier', label: 'Handle', placeholder: 'yourorg.bsky.social', required: true }, { name: 'password', label: 'App password', type: 'password', placeholder: 'xxxx-xxxx-xxxx-xxxx', required: true, autocomplete: 'off' }] },
  mastodon: { title: 'Connect Mastodon', message: 'On your Mastodon server, go to Preferences → Development → New application. Tick write:statuses and write:media, save, then copy “Your access token”. Dashi keeps it on the server, sealed.',
    fields: [{ name: 'instance', label: 'Your server', placeholder: 'mastodon.social', required: true }, { name: 'token', label: 'Access token', type: 'password', required: true, autocomplete: 'off' },
      { name: 'visibility', label: 'Who sees posts', type: 'select', value: 'unlisted', options: [{ id: 'unlisted', label: 'Unlisted: public, kept off timelines (good for a first try)' }, { id: 'public', label: 'Public' }, { id: 'private', label: 'Followers only' }] }] },
  webhook: { title: 'Connect a webhook', message: 'Each post is sent to this address as JSON (title, text, link and the picture). Zapier, Make, IFTTT and Buffer can take it from there, or your own server. Add a signing secret to check it came from Dashi (header X-Dashi-Signature).',
    fields: [{ name: 'url', label: 'Webhook address', type: 'url', placeholder: 'https://hooks.zapier.com/hooks/catch/…', required: true }, { name: 'signingSecret', label: 'Signing secret (optional)', type: 'password', autocomplete: 'off' }] },
};
const setChannel = (nw, patch) => store.apply(col.set('channels', { ...doc().channels, [nw]: patch && { ...(doc().channels[nw] ?? {}), ...patch } }));

async function connectLive(n) {
  const form = LIVE_FORMS[n.id];
  let made = null;
  const v = await uiForm({ title: form.title, message: form.message, fields: form.fields, ok: 'Connect', validate: async (values) => { made = await api('POST', `/api/social/accounts/${n.id}`, values); } });
  if (!v || !made) return;
  live.accounts[n.id] = { network: n.id, handle: made.handle, connectedAt: made.connectedAt };
  setChannel(n.id, { network: n.id, handle: made.handle, connected: true, live: true, connectedAt: made.connectedAt, auto: doc().channels[n.id]?.auto ?? false });
  toast(`${n.label} connected as ${made.handle}`);
}
async function checkLive(n, btn) {
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const r = await api('POST', `/api/social/accounts/${n.id}/check`);
    live.accounts[n.id] = { ...live.accounts[n.id], handle: r.handle, lastError: null };
    toast(`${n.label} works: signed in as ${r.handle}`, 'ok');
  } catch (e) {
    live.accounts[n.id] = { ...live.accounts[n.id], lastError: e.message };
    toast(e.message, 'error');
  }
  render();
}
async function setVisibility(v) {
  try {
    const r = await api('POST', '/api/social/accounts/mastodon/options', { visibility: v });
    live.accounts.mastodon = { ...live.accounts.mastodon, visibility: r.visibility };
    toast(`Mastodon posts will be ${VIS_LABEL[r.visibility]}`);
  } catch (e) { toast(e.message, 'error'); }
}
async function disconnect(n, ch) {
  if (!await uiConfirm(`Disconnect ${n.label}? Posts stay in your queue.${ch.live ? ' Dashi forgets the credentials.' : ''}`, { ok: 'Disconnect' })) return;
  if (ch.live && live.accounts[n.id]) {
    try { await api('DELETE', `/api/social/accounts/${n.id}`); } catch (e) { await uiAlert(e.message, { title: 'Couldn’t disconnect' }); return; }
    delete live.accounts[n.id];
  }
  setChannel(n.id, { connected: false, live: false });
}

/** A short first-try checklist, until something has gone out for real. */
function TryLive() {
  if (Object.values(live.accounts).some((x) => x.lastUsedAt)) return null;
  return h('details', { class: 'so-try', open: true },
    h('summary', {}, icon('spark', 15), 'Trying it live for the first time'),
    h('ol', {},
      h('li', {}, h('strong', {}, 'Start safe. '), 'Connect a webhook into your own email or chat (Zapier or Make can forward it), or Mastodon set to Unlisted. Bluesky has no private posts, so use a test account there.'),
      h('li', {}, h('strong', {}, 'Check the connection. '), 'It signs in without posting (a webhook gets a ping).'),
      h('li', {}, h('strong', {}, 'Push one short post. '), 'Dashi asks first and names the accounts. The Posted list links to the live post.'),
      h('li', {}, h('strong', {}, 'Then schedule one '), 'a few minutes ahead and close the page: the server sends it on time.')),
    h('p', { class: 'muted small' }, 'Each post goes to each network once, even if you press twice. Help has the full guide: ', h('a', { href: 'help.html#new-in-0-4/social-posting' }, 'Post to social media for real'), '.'));
}

function Channels() {
  setCrumbs([]);
  const settings = doc().settings;
  const canLive = (id) => live.networks.includes(id);
  const card = (n) => {
    const ch = doc().channels[n.id];
    const on = !!ch?.connected;
    const real = on && isLive(n.id);
    const acc = live.accounts[n.id];
    return h('article', { class: `so-channel${on ? ' on' : ''}${real ? ' live' : ''}`, style: `--net:${n.colour}` },
      h('header', {}, chip(n.id, { on }), h('div', {}, h('strong', {}, n.label, real ? h('span', { class: 'so-live-badge' }, 'Live') : on && h('span', { class: 'so-practice-badge' }, 'Practice')),
        h('small', { class: 'muted' }, on ? `${ch.handle} · since ${new Date(ch.connectedAt).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}` : n.shape))),
      h('p', { class: 'muted small' }, `${n.limit.toLocaleString('en-CA')} characters · ${n.media === 'required' ? 'a picture or video is required' : n.media === 'video' ? 'video only' : 'pictures optional'}`),
      real && acc?.lastError && h('p', { class: 'so-error small' }, icon('alert', 13), ` Last try: ${acc.lastError}`),
      real && acc?.lastUsedAt && h('p', { class: 'muted small' }, `Last posted ${when(acc.lastUsedAt)}`),
      real && n.id === 'mastodon' && h('label', { class: 'so-field so-vis' }, h('span', {}, 'Who sees posts'),
        h('select', { class: 'select select-sm', disabled: !canEdit, onchange: (e) => setVisibility(e.target.value) },
          Object.entries(VIS_LABEL).map(([v, label]) => h('option', { value: v, selected: (acc?.visibility ?? 'public') === v }, label.replace(/^./, (c) => c.toUpperCase()))))),
      on && h('label', { class: 'so-auto' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: !!ch.auto, disabled: !canEdit, onchange: (e) => setChannel(n.id, { auto: e.target.checked }) }), 'Draft a post for each new episode'),
      h('footer', {}, on
        ? [h('button', { class: 'btn btn-xs btn-ghost', disabled: !canEdit, onclick: () => disconnect(n, ch) }, 'Disconnect'),
          real && h('button', { class: 'btn btn-xs', disabled: !canEdit, title: n.id === 'webhook' ? 'Sends a ping (event dashi.social.ping), not a post' : 'Signs in to check; posts nothing', onclick: (e) => checkLive(n, e.currentTarget) }, 'Check connection'),
          !real && canLive(n.id) && h('button', { class: 'btn btn-xs btn-primary', disabled: !canEdit, onclick: () => connectLive(n) }, 'Connect for real')]
        : canLive(n.id)
          ? h('button', { class: 'btn btn-xs btn-primary', disabled: !canEdit, onclick: () => connectLive(n) }, 'Connect')
          : h('button', { class: 'btn btn-xs', disabled: !canEdit, title: 'A practice connection: posts get a pretend link and pretend numbers', onclick: async () => { const handle = await uiPrompt(`Your ${n.label} handle`, `@${org.name.toLowerCase().replace(/[^a-z]+/g, '')}`, { title: `Practise with ${n.label}`, ok: 'Connect for practice', help: `${n.label} needs an approved app before Dashi can post for real. Until then, practise the whole flow: nothing leaves Dashi.` }); if (handle?.trim()) setChannel(n.id, { network: n.id, handle: handle.trim(), connected: true, live: false, connectedAt: new Date().toISOString(), auto: false }); } }, 'Practise')));
  };
  const liveNets = NETWORKS.filter((n) => canLive(n.id));
  const practiceNets = NETWORKS.filter((n) => !canLive(n.id));
  return h('div', {},
    liveNets.length
      ? [h('div', { class: 'so-section-head' }, h('h3', {}, 'Post for real'), h('span', { class: 'muted small' }, 'Dashi posts with your own account. Credentials stay on the server.')), TryLive(), h('div', { class: 'so-channels' }, liveNets.map(card))]
      : h('p', { class: 'so-note' }, icon('alert', 16), 'Posting for real needs Dashi’s server. In this local demo every network is practice.'),
    h('div', { class: 'so-section-head' }, h('h3', {}, liveNets.length ? 'Practice for now' : 'Networks'), h('span', { class: 'muted small' }, 'These need an approved app on each network before Dashi can post. Practise the flow: nothing leaves Dashi.')),
    h('div', { class: 'so-channels' }, practiceNets.map(card)),
    h('section', { class: 'so-settings' }, h('h3', {}, 'On every post'),
      h('label', { class: 'so-field' }, h('span', {}, 'Hashtags, separated by commas'), h('input', { class: 'input input-sm w-full', value: settings.hashtags.join(', '), disabled: !canEdit, onchange: (e) => store.apply(col.set('settings', { ...settings, hashtags: e.target.value.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean) })) })),
      h('label', { class: 'so-field' }, h('span', {}, 'Sign-off'), h('input', { class: 'input input-sm w-full', value: settings.signoff, placeholder: 'e.g. Give local: kestrelbay.example/give', disabled: !canEdit, onchange: (e) => store.apply(col.set('settings', { ...settings, signoff: e.target.value })) }))));
}

function Insights() {
  setCrumbs([]);
  const posted = Object.values(doc().posts).filter((p) => p.status === 'posted');
  // Refresh the pretend numbers as time passes.
  for (const p of posted) for (const [nw, res] of Object.entries(p.results ?? {})) if (!res.live) res.stats = statsFor(p, nw, res.at);
  const byNet = Object.fromEntries(NETWORKS.map((n) => [n.id, { views: 0, likes: 0, shares: 0, posts: 0 }]));
  for (const p of posted) for (const [nw, res] of Object.entries(p.results ?? {})) { const b = byNet[nw]; if (!b) continue; b.views += res.stats?.views ?? 0; b.likes += res.stats?.likes ?? 0; b.shares += res.stats?.shares ?? 0; b.posts++; }
  const all = posted.reduce((t, p) => { const s = totalStats(p); t.views += s.views; t.likes += s.likes; t.shares += s.shares; t.comments += s.comments; return t; }, { views: 0, likes: 0, shares: 0, comments: 0 });
  const max = Math.max(1, ...Object.values(byNet).map((b) => b.views));
  const byKind = POST_KINDS.map((k) => { const ps = posted.filter((p) => p.kind === k.id); const v = ps.reduce((t, p) => t + totalStats(p).views, 0); return [k, ps.length, ps.length ? Math.round(v / ps.length) : 0]; });
  const top = [...posted].sort((a, b) => totalStats(b).views - totalStats(a).views).slice(0, 5);
  return h('div', { class: 'so-insights' },
    h('p', { class: 'so-note' }, icon('alert', 16), 'Pretend numbers, made up from each post, so the page can be tried. Real ones arrive with real connections.'),
    h('div', { class: 'so-kpis' }, [['Views', all.views], ['Likes', all.likes], ['Shares', all.shares], ['Comments', all.comments], ['Posts', posted.length]].map(([l, v]) => h('div', { class: 'so-kpi' }, h('strong', {}, num(v)), h('small', {}, l)))),
    h('section', {}, h('h3', {}, 'Views by network'),
      h('div', { class: 'so-bars' }, NETWORKS.filter((n) => byNet[n.id].posts).map((n) => h('div', { class: 'so-bar' }, chip(n.id, { small: true }), h('span', { class: 'so-bar-name' }, n.label), h('span', { class: 'so-bar-track' }, h('i', { style: `width:${(byNet[n.id].views / max) * 100}%;background:${n.colour}` })), h('strong', {}, num(byNet[n.id].views)))))),
    h('section', {}, h('h3', {}, 'What works: average views by kind of post'),
      h('div', { class: 'so-bykind' }, byKind.filter(([, c]) => c).map(([k, c, avg]) => h('div', {}, icon(k.icon, 18), h('strong', {}, num(avg)), h('small', {}, `${k.label} · ${c} posts`))))),
    h('section', {}, h('h3', {}, 'Top posts'), h('ul', { class: 'so-list' }, top.map(Row))));
}

render();
