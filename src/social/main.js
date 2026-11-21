import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { toast } from '../ui/toast.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { setCrumbs } from '../ui/crumbs.js';
import { uiConfirm, uiPrompt } from '../ui/dialog.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { autosaveDoc, canWriteDoc } from '../platform/storage.js';
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
 * PUSHING IS MOCKED: nothing leaves Dashi in this alpha. Connecting a
 * network asks only for a handle; a push stores a pretend permalink and
 * pretend numbers so the whole flow can be tried.
 *
 *   #compose[/<post id>]  make or edit a post (#compose/new/<kind>/<source id> starts from something)
 *   #queue                drafts and scheduled posts
 *   #calendar             the month, with what goes out when
 *   #posted               what went out, with its numbers
 *   #channels             connect networks (mock)
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

// MOCK: scheduled posts whose time has come go out when anyone opens the page.
// Posts saved without their picture (seeded ones, say) draw it from their source, here only; it is saved if the post is edited.
for (const p of Object.values(doc().posts)) if (!p.media && p.source) p.media = draftFrom(p.kind, p.source.id).media ?? null;
for (const p of duePosts(doc())) push(p, { quiet: true });

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
  blurb: 'Experimental. Make a post once from your episodes, blog posts, data and dashboards, fit it to every network, then schedule it or push it out. Pushing is pretend in this alpha: nothing leaves Dashi yet.',
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

function push(post, { quiet = false } = {}) {
  const at = new Date().toISOString();
  const results = { ...(post.results ?? {}) };
  const failed = [];
  for (const nw of post.networks) {
    const ch = doc().channels[nw];
    if (!ch?.connected) { failed.push(networkById[nw]?.label); continue; }
    if (problemsFor(post, nw, doc().settings).length) { failed.push(networkById[nw]?.label); continue; }
    results[nw] = mockPush(post, nw, ch, at);
  }
  const ok = Object.keys(results).length > 0;
  store.apply(col.update('posts', post.id, { results, status: failed.length && !ok ? 'failed' : 'posted', postedAt: at, failed }));
  if (!quiet) toast(ok ? `Pushed to ${Object.keys(results).map((k) => networkById[k].label).join(', ')} (pretend: nothing left Dashi)${failed.length ? `. Not sent to ${failed.join(', ')}.` : ''}` : `Not sent: ${failed.join(', ')} need a look.`, ok ? 'ok' : 'error');
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
    const drawPreviews = () => previews.replaceChildren(...(post.networks.length ? post.networks : ['instagram']).map((nw) => Preview(post, nw, settings)));
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
          h('button', { class: 'btn btn-sm btn-primary', disabled: !canEdit || !post.networks.length, onclick: () => { const p = save('draft'); push(doc().posts[p.id]); location.hash = '#posted'; } }, icon('share', 14), 'Push now'))),
      h('div', { class: 'so-side' }, h('h3', {}, 'How it looks'), previews));
  };
  draw();
  return wrap;
}

function Start() {
  const tile = (k, href, extra) => h('a', { class: 'so-start', href }, h('span', { class: 'so-start-ico' }, icon(k.icon, 22)), h('strong', {}, k.label), h('small', {}, extra ?? k.sub));
  const recent = (list, kind, label) => list.length > 0 && h('section', { class: 'so-recent' }, h('h3', {}, label),
    h('div', { class: 'so-recent-list' }, list.slice(0, 4).map(([id, title, sub]) => h('a', { href: `#compose/new/${kind}/${id}` }, h('strong', {}, title), h('small', { class: 'muted' }, sub)))));
  return h('div', { class: 'so-startpage' },
    h('div', { class: 'so-starts' }, POST_KINDS.map((k) => tile(k, `#compose/new/${k.id}`))),
    !Object.values(doc().channels).some((c) => c.connected) && h('p', { class: 'so-note' }, icon('plug', 16), 'No networks are connected yet. ', h('a', { href: '#channels' }, 'Connect one'), ' (pretend, for now) to push posts.'),
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
    res && h('footer', {}, h('span', {}, icon('eye', 13), num(res.stats.views)), h('span', {}, icon('heart', 13), num(res.stats.likes)), h('span', {}, icon('share', 13), num(res.stats.shares)), h('a', { href: res.permalink, target: '_blank', rel: 'noopener', title: 'Pretend link' }, 'View')));
}

/* ----------------------------------------------------------- queue, calendar, posted */
function Row(p) {
  const k = kindById[p.kind] ?? kindById.note;
  const t = totalStats(p);
  return h('li', { class: `so-row st-${p.status}` },
    p.media ? h('img', { class: 'so-thumb', src: p.media.src, alt: '' }) : h('span', { class: 'so-thumb so-thumb-ico' }, icon(k.icon, 18)),
    h('div', { class: 'so-row-text' },
      h('a', { href: `#compose/${p.id}` }, h('strong', {}, p.title || k.label)),
      h('small', { class: 'muted' }, [k.label, p.status === 'scheduled' ? `goes out ${when(p.scheduledAt)}` : p.status === 'posted' ? `posted ${when(p.postedAt)}` : p.status === 'failed' ? 'needs a look' : 'draft', p.campaign].filter(Boolean).join(' · '))),
    h('span', { class: 'so-row-nets' }, p.networks.map((nw) => chip(nw, { small: true, on: !!p.results?.[nw] || p.status !== 'posted' }))),
    p.status === 'posted' ? h('span', { class: 'so-row-stats' }, h('span', {}, icon('eye', 13), num(t.views)), h('span', {}, icon('heart', 13), num(t.likes))) : h('span'),
    h('span', { class: 'so-row-tools' },
      p.status !== 'posted' && canEdit && h('button', { class: 'btn btn-xs btn-primary', onclick: () => push(p) }, 'Push now'),
      canEdit && h('button', { class: 'btn btn-xs btn-ghost', title: 'Make a copy', onclick: () => { const id = uid('post'); store.apply(col.add('posts', { ...structuredClone(p), id, status: 'draft', results: {}, postedAt: null, scheduledAt: null, title: `${p.title} (copy)`, createdAt: new Date().toISOString() })); location.hash = `#compose/${id}`; } }, 'Copy'),
      canEdit && h('button', { class: 'btn btn-xs btn-ghost btn-square', 'aria-label': `Delete ${p.title}`, onclick: async () => { if (await uiConfirm(`Delete “${p.title}”?${p.status === 'posted' ? ' It stays up on the networks (pretend ones, for now).' : ''}`)) store.apply(col.remove('posts', p.id)); } }, icon('trash', 13))));
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
function Channels() {
  setCrumbs([]);
  const settings = doc().settings;
  return h('div', {},
    h('p', { class: 'so-note' }, icon('alert', 16), 'Pretend connections: no network is really reached in this alpha. Connecting asks only for the handle to show in previews.'),
    h('div', { class: 'so-channels' }, NETWORKS.map((n) => {
      const ch = doc().channels[n.id];
      return h('article', { class: `so-channel${ch?.connected ? ' on' : ''}`, style: `--net:${n.colour}` },
        h('header', {}, chip(n.id, { on: !!ch?.connected }), h('div', {}, h('strong', {}, n.label), h('small', { class: 'muted' }, ch?.connected ? `${ch.handle} · since ${new Date(ch.connectedAt).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}` : n.shape))),
        h('p', { class: 'muted small' }, `${n.limit.toLocaleString('en-CA')} characters · ${n.media === 'required' ? 'a picture or video is required' : n.media === 'video' ? 'video only' : 'pictures optional'}`),
        ch?.connected && h('label', { class: 'so-auto' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: !!ch.auto, disabled: !canEdit, onchange: (e) => store.apply(col.set('channels', { ...doc().channels, [n.id]: { ...ch, auto: e.target.checked } })) }), 'Draft a post for each new episode'),
        h('footer', {}, ch?.connected
          ? h('button', { class: 'btn btn-xs btn-ghost', disabled: !canEdit, onclick: async () => { if (await uiConfirm(`Disconnect ${n.label}? Posts stay in your queue.`, { ok: 'Disconnect' })) store.apply(col.set('channels', { ...doc().channels, [n.id]: { ...ch, connected: false } })); } }, 'Disconnect')
          : h('button', { class: 'btn btn-xs btn-primary', disabled: !canEdit, onclick: async () => { const handle = await uiPrompt(`Your ${n.label} handle`, `@${org.name.toLowerCase().replace(/[^a-z]+/g, '')}`, { title: `Connect ${n.label} (pretend)`, ok: 'Connect' }); if (handle?.trim()) store.apply(col.set('channels', { ...doc().channels, [n.id]: { network: n.id, handle: handle.trim(), connected: true, connectedAt: new Date().toISOString(), auto: false } })); } }, 'Connect')));
    })),
    h('section', { class: 'so-settings' }, h('h3', {}, 'On every post'),
      h('label', { class: 'so-field' }, h('span', {}, 'Hashtags, separated by commas'), h('input', { class: 'input input-sm w-full', value: settings.hashtags.join(', '), disabled: !canEdit, onchange: (e) => store.apply(col.set('settings', { ...settings, hashtags: e.target.value.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean) })) })),
      h('label', { class: 'so-field' }, h('span', {}, 'Sign-off'), h('input', { class: 'input input-sm w-full', value: settings.signoff, placeholder: 'e.g. Give local: kestrelbay.example/give', disabled: !canEdit, onchange: (e) => store.apply(col.set('settings', { ...settings, signoff: e.target.value })) }))));
}

function Insights() {
  setCrumbs([]);
  const posted = Object.values(doc().posts).filter((p) => p.status === 'posted');
  // Refresh the pretend numbers as time passes.
  for (const p of posted) for (const [nw, res] of Object.entries(p.results ?? {})) res.stats = statsFor(p, nw, res.at);
  const byNet = Object.fromEntries(NETWORKS.map((n) => [n.id, { views: 0, likes: 0, shares: 0, posts: 0 }]));
  for (const p of posted) for (const [nw, res] of Object.entries(p.results ?? {})) { const b = byNet[nw]; if (!b) continue; b.views += res.stats.views; b.likes += res.stats.likes; b.shares += res.stats.shares; b.posts++; }
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
