/**
 * The Social Media Integrator (alpha 0.3, experimental): a sub-plugin of the
 * Public Portal. Make a post once (an episode clip, a blog post, a data
 * card, a dashboard), fit it to each network, schedule it, and push it out.
 *
 * Pushing is MOCKED in this alpha: nothing leaves Dashi. A push writes a
 * pretend permalink and pretend numbers, so the flow can be tried end to
 * end before real network connections (OAuth apps, review, rate limits)
 * are built.
 *
 *   social doc {
 *     id: 'social',
 *     channels: { [network]: { network, handle, connected, connectedAt, auto: bool } },
 *     posts: { [id]: Post },
 *     settings: { hashtags: [], signoff, utm: bool },
 *   }
 *   Post { id, kind, title, text, source: { type, id } | null, media: { kind, src, alt } | null,
 *          networks: [network], perNetwork: { [network]: { text } },
 *          status: 'draft' | 'scheduled' | 'posted' | 'failed', scheduledAt, postedAt,
 *          results: { [network]: { permalink, at, stats: { views, likes, shares, comments } } },
 *          createdBy, createdAt, campaign }
 */
export const NETWORKS = [
  { id: 'instagram', label: 'Instagram', short: 'IG', limit: 2200, media: 'required', shape: 'Square or 4:5 picture, or a Reel', colour: '#c77deb' },
  { id: 'facebook', label: 'Facebook', short: 'FB', limit: 63206, media: 'optional', shape: 'Link preview or picture', colour: '#2c4fa3' },
  { id: 'tiktok', label: 'TikTok', short: 'TT', limit: 2200, media: 'video', shape: 'Upright video, 9:16', colour: '#16181d' },
  { id: 'youtube', label: 'YouTube', short: 'YT', limit: 5000, media: 'video', shape: 'Video or a Short (9:16)', colour: '#c8432f' },
  { id: 'linkedin', label: 'LinkedIn', short: 'IN', limit: 3000, media: 'optional', shape: 'Link preview, picture or document', colour: '#3e8fa6' },
  { id: 'bluesky', label: 'Bluesky', short: 'BS', limit: 300, media: 'optional', shape: 'Up to four pictures', colour: '#4da65c' },
  { id: 'mastodon', label: 'Mastodon', short: 'MA', limit: 500, media: 'optional', shape: 'Up to four pictures', colour: '#7b2fe8' },
];
export const networkById = Object.fromEntries(NETWORKS.map((n) => [n.id, n]));

/** What a post is made from. */
export const POST_KINDS = [
  { id: 'episode', label: 'Podcast clip', sub: 'An episode, with a short audiogram', icon: 'mic' },
  { id: 'article', label: 'Blog post', sub: 'A news article or page from your site', icon: 'news' },
  { id: 'datacard', label: 'Data card', sub: 'One number, beautifully', icon: 'chart' },
  { id: 'dashboard', label: 'Dashboard', sub: 'A snapshot of a public dashboard', icon: 'dataviz' },
  { id: 'note', label: 'Just words', sub: 'An announcement, a thank-you, a call out', icon: 'chats' },
];
export const kindById = Object.fromEntries(POST_KINDS.map((k) => [k.id, k]));

export const STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'posted', label: 'Posted' },
  { id: 'failed', label: 'Needs a look' },
];

export const blankSocial = () => ({ id: 'social', channels: {}, posts: {}, settings: { hashtags: [], signoff: '', utm: true } });

export function migrateSocial(doc) {
  doc ??= blankSocial();
  doc.channels ??= {};
  doc.posts ??= {};
  doc.settings = { hashtags: [], signoff: '', utm: true, ...doc.settings };
  for (const p of Object.values(doc.posts)) {
    p.networks ??= [];
    p.perNetwork ??= {};
    p.results ??= {};
    p.status ??= 'draft';
  }
  return doc;
}

/** The text a network gets: its own version if written, else the main text, with the sign-off and hashtags that fit. */
export function textFor(post, network, settings = {}) {
  const own = post.perNetwork?.[network]?.text;
  let text = own ?? post.text ?? '';
  const tags = (settings.hashtags ?? []).map((t) => `#${String(t).replace(/^#/, '')}`).join(' ');
  if (!own && settings.signoff) text += `\n\n${settings.signoff}`;
  if (!own && tags && network !== 'linkedin') text += `\n\n${tags}`;
  return text;
}

/** Problems that would stop a network taking the post. */
export function problemsFor(post, network, settings) {
  const n = networkById[network];
  if (!n) return ['Unknown network'];
  const out = [];
  const len = textFor(post, network, settings).length;
  if (len > n.limit) out.push(`${len - n.limit} characters too long for ${n.label}`);
  if (n.media === 'required' && !post.media) out.push(`${n.label} needs a picture or video`);
  if (n.media === 'video' && post.media?.kind !== 'video' && post.media?.kind !== 'audiogram') out.push(`${n.label} needs a video (an episode clip makes one)`);
  return out;
}

/** A small, steady pseudo-random number from a string, for the pretend numbers. */
function seeded(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
}

/**
 * MOCK: "push" a post to one network. Returns the result a real push would
 * store: a permalink and some numbers that grow with time since posting.
 */
export function mockPush(post, network, channel, at = new Date().toISOString()) {
  const r = seeded(`${post.id}:${network}`);
  const handle = (channel?.handle ?? 'yourorg').replace(/^@/, '');
  const slug = Math.floor(r() * 1e10).toString(36);
  const permalink = {
    instagram: `https://instagram.example/p/${slug}`,
    facebook: `https://facebook.example/${handle}/posts/${slug}`,
    tiktok: `https://tiktok.example/@${handle}/video/${slug}`,
    youtube: `https://youtube.example/shorts/${slug}`,
    linkedin: `https://linkedin.example/feed/update/${slug}`,
    bluesky: `https://bsky.example/profile/${handle}/post/${slug}`,
    mastodon: `https://mastodon.example/@${handle}/${slug}`,
  }[network];
  return { permalink, at, mock: true, stats: statsFor(post, network, at) };
}

/** MOCK numbers for a posted post: more for video networks, growing over the first week. */
export function statsFor(post, network, postedAt, now = new Date()) {
  const r = seeded(`${post.id}:${network}:stats`);
  const days = Math.max(0.2, Math.min(7, (now - new Date(postedAt)) / 864e5));
  const reach = { tiktok: 2600, youtube: 1400, instagram: 900, facebook: 700, linkedin: 420, bluesky: 260, mastodon: 180 }[network] ?? 300;
  const boost = { episode: 1.3, datacard: 1.4, dashboard: 0.8, article: 1, note: 0.7 }[post.kind] ?? 1;
  const views = Math.round(reach * boost * (0.5 + r()) * (0.35 + 0.65 * (days / 7)));
  return { views, likes: Math.round(views * (0.04 + r() * 0.05)), shares: Math.round(views * (0.005 + r() * 0.012)), comments: Math.round(views * (0.002 + r() * 0.008)) };
}

export const totalStats = (post) => Object.values(post.results ?? {}).reduce((t, x) => {
  for (const k of ['views', 'likes', 'shares', 'comments']) t[k] += x.stats?.[k] ?? 0;
  return t;
}, { views: 0, likes: 0, shares: 0, comments: 0 });

/** Due scheduled posts (MOCK: the page pushes them when it opens; a real server would do it on time). */
export const duePosts = (doc, now = new Date()) => Object.values(doc.posts).filter((p) => p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now);
