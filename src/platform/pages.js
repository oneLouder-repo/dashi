/**
 * Pages and news: the simple web pages and blog-style articles that sit on
 * an org's public sites, next to its dashboards and podcast station.
 *
 * { id: 'pages', pages: { [id]: Page } }
 * Page { kind: 'page' | 'article', title, slug, summary, body (light markdown),
 *        cover, siteId, status: 'draft' | 'published', publishedAt, authorId,
 *        inNav (pages: listed in the site's menu), order }
 *
 * Bodies are a small, safe subset of markdown (see parseMarkdown). A line
 * that is only a shortcode embeds live content from another plugin:
 *   [[dashboard:<id>]]   a public dashboard
 *   [[episode:<id>]]     a podcast episode with a player
 *   [[show:<id>]]        a podcast show card
 *   [[calculator:<id>]]  an impact calculator (Workbench)
 *   [[story:<id>]]       a data story (Workbench)
 *   [[map:place]]        the org's shared Place map (or [[map:<layer or group>]] for some of its layers)
 *   [[form:<id>]]        a public feedback form (Workbench), e.g. a join or update-your-listing form
 */
import { loadOrSeed, saveDoc } from './storage.js';

export const PAGE_KINDS = [
  { id: 'page', label: 'Page', blurb: 'An information page in the site menu' },
  { id: 'article', label: 'Article', blurb: 'A dated news or blog post' },
];
export { EMBEDS } from './markdownParse.js';

export const slugify = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') || 'page';

/** A slug no other page on the same site uses. */
export function uniqueSlug(doc, title, siteId, exceptId) {
  const base = slugify(title);
  const taken = new Set(Object.values(doc.pages).filter((p) => p.siteId === siteId && p.id !== exceptId).map((p) => p.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

const page = (id, kind, siteId, title, publishedAt, summary, body, more = {}) => ({
  id, kind, siteId, title, slug: slugify(title), summary, body, cover: null,
  status: 'published', publishedAt, authorId: null, inNav: kind === 'page', order: 0, ...more,
});

export function seedPages() {
  return migratePages({
    id: 'pages',
    youthPages: true,
    pages: Object.fromEntries([
      page('pg-about', 'page', 'site-main', 'About us', '2025-01-15', 'Who we are and how the network works.',
        `We are a national network of university and college **STEM outreach programs**, reaching young people in every province and territory.

## What we do

- Run camps, clubs and school workshops
- Train outreach instructors
- Co-design programs with Indigenous communities

## How we measure it

We share our numbers openly. See [our impact dashboard](site.html?site=site-impact) for reach and equity, updated as programs report.

> Every young person in Canada can see themselves in STEM.`, { authorId: 's-comms', order: 0 }),
      page('pg-involved', 'page', 'site-main', 'Get involved', '2025-01-15', 'Volunteer, partner or fund a program.',
        `There are three ways to help:

1. **Volunteer** as a mentor or instructor
2. **Partner** with us as a school, library or community group
3. **Fund** a program in your region

Write to us at [hello@example.org](mailto:hello@example.org).`, { authorId: 's-part', order: 1 }),
      page('pg-news-equity', 'article', 'site-main', 'Our reach and equity numbers for 2026', '2026-10-01',
        'Halfway through the year, here is who our programs reached.',
        `We promised to share our numbers as they come in. Here they are, live from program reports.

[[dashboard:dash-equity]]

The share of participants from **equity-deserving groups** is up on last year. There is more to do in the North, and our next co-design sessions start there.`, { authorId: 's-eval' }),
      page('pg-news-podcast', 'article', 'site-main', 'New season of STEM Voices', '2026-09-24',
        'Season 2 asks what keeps young people in STEM.',
        `Season 2 of _STEM Voices_ is here. This season asks what keeps young people in STEM, and what pushes them out.

[[episode:ep-sv-3]]

New episodes every few weeks. Find every show on [our podcast station](site.html?site=site-main&view=station).`, { authorId: 's-comms' }),
      ...youthPages(),
      page('pg-news-draft', 'article', 'site-main', 'Learning with the Land: what we heard', '2026-11-01',
        'Notes from the first co-design session.', 'Draft notes, not ready to share.', { status: 'draft', authorId: 's-indig' }),
    ].map((p) => [p.id, p])),
  });
}

/** The youth microsite's pages: drafts, written with the advisory circle. */
function youthPages() {
  return [
    page('pg-youth-home', 'page', 'site-youth', 'Why we count', '2026-12-01', 'Young people on what the numbers should say.',
      `We are the Youth data advisory circle. We are choosing which numbers the network shows, and how.

## What we are asking

- Who gets counted, and who doesn't?
- What would make you trust a chart?

_Draft: not live yet._`, { status: 'draft', authorId: 's-eval', order: 0 }),
    page('pg-youth-how', 'page', 'site-youth', 'How to take part', '2026-12-01', 'Join a session, or send us a question.', 'Draft.', { status: 'draft', authorId: 's-indig', order: 1 }),
  ];
}
/** Older copies of the STEM example get the youth microsite's draft pages, once. */
export function addYouthPages(doc, orgId) {
  if (orgId !== 'org-example' || doc.youthPages) return false;
  for (const p of youthPages()) doc.pages[p.id] ??= p;
  doc.youthPages = true;
  return true;
}

export function seedRiverbendPages() {
  return migratePages({
    id: 'pages',
    pages: {
      'pg-about': page('pg-about', 'page', 'site-main', 'About the hub', '2025-05-01', 'A community kitchen, a good food box and a youth growing program.',
        `We are a neighbourhood food hub in Winnipeg.

[[dashboard:dash-meals]]

Drop in to the kitchen Tuesday to Saturday.`, { authorId: 'r-lead' }),
    },
  });
}

export const blankPages = () => ({ id: 'pages', pages: {} });

export function migratePages(doc) {
  doc.pages ??= {};
  for (const p of Object.values(doc.pages)) {
    p.status ??= 'draft';
    p.summary ??= '';
    p.body ??= '';
    p.cover ??= null;
    p.inNav ??= p.kind === 'page';
    p.order ??= 0;
  }
  return doc;
}

const SEEDS = { 'org-example': seedPages, 'org-riverbend': seedRiverbendPages };
/** The open org's pages (see docs.js; the org id picks the example seed). */
export function loadPages(orgId) {
  const doc = migratePages(loadOrSeed('pages', SEEDS[orgId] ?? blankPages));
  if (addYouthPages(doc, orgId)) saveDoc('pages', doc, undefined, { quiet: true });
  return doc;
}

export const isLive = (p, today) => p.status === 'published' && p.publishedAt <= today;

/** What a public site shows: menu pages in order, and articles newest first. */
export function siteContent(doc, siteId, today) {
  const live = Object.values(doc.pages).filter((p) => p.siteId === siteId && isLive(p, today));
  return {
    nav: live.filter((p) => p.kind === 'page' && p.inNav).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    articles: live.filter((p) => p.kind === 'article').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    bySlug: (slug) => live.find((p) => p.slug === slug) ?? null,
  };
}

export { parseMarkdown, safeHref, parseInline } from './markdownParse.js';
import { parseMarkdown } from './markdownParse.js';

/** Shortcodes a body uses, e.g. to warn about embeds that are not public. */
export const embedsIn = (body) => parseMarkdown(body).filter((b) => b.t === 'embed');

/** Plain text of a body, for summaries and search. */
export function plainText(body) {
  const walk = (nodes) => nodes.map((n) => n.v ?? walk(n.c ?? [])).join('');
  return parseMarkdown(body).map((b) => (b.c ? walk(b.c) : b.items ? b.items.map(walk).join(' ') : '')).filter(Boolean).join(' ');
}
