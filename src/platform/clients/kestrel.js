/**
 * "Kestrel Bay Community Foundation" (alpha 0.3, PR 7): the third client
 * test org, built to test the edge of a client org's size. Everything here
 * is fictional: the bay, the people, the grants and the numbers.
 *
 *   - 36 people in five teams, a custom plan with every plugin switched on
 *   - three ecosystem maps on three lenses
 *   - a three-year plan finishing (2024–2027) beside a new five-year plan
 *     (2026–2031) that overlaps it
 *   - a busy public portal: a well-developed homepage (a page, not the
 *     station), a blog with social-style posts, two public dashboards, a
 *     Vital Signs site, a members-only board site with archived minutes,
 *     governance and finance papers, and government documents
 *   - a busy podcast station (three series, sixty-odd episodes, featured
 *     episodes) on its own page of the site
 *   - the Social Media Integrator, with channels connected (pretend) and a
 *     queue, a calendar and posted posts with numbers
 *
 * The bulk (people, maps, plans, data, dashboards, library files) comes
 * from the shared test-org generator (mockOrgs.js, sector "foundation");
 * this file then shapes it into the org described above.
 */
import { mockDocs } from '../mockOrgs.js';
import { migratePages, slugify } from '../pages.js';
import { migratePodcasts } from '../podcasts.js';
import { blankMeta } from '../library.js';
import { photoMasthead, photoById, photoFor } from '../photos.js';
import { gatherAssets, blankAssets, migrateAssets } from '../assetHub.js';
import { migrateSocial, mockPush } from '../social.js';
import { seedRhizome } from '../../rhizome/setup.js';

export const KESTREL_SPEC = {
  id: 'org-kestrel', slug: 'kestrel', name: 'Kestrel Bay Community Foundation', plan: 'custom', sector: 'foundation',
  people: 36, maps: 3, plans: 2, shows: 3, dashboards: 4, color: '#3e8fa6', motif: 'wave', palette: 'corporate', shape: 'rounded', domain: 'kestrelbay.example',
  address: '12 Wharf Street, Kestrel Bay',
};
const TODAY = '2026-11-21';
const day = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const yearBack = (d) => (d ? `${Number(d.slice(0, 4)) - 1}${d.slice(4)}` : d);

/** The org's colours, from the colour wheel: deep blue, orange and green, on white with black lines. */
export const KESTREL_COLOURS = {
  primary: '#2c4fa3', 'primary-content': '#ffffff',
  secondary: '#ef7f2d', 'secondary-content': '#16181d',
  accent: '#4da65c', 'accent-content': '#ffffff',
  neutral: '#16181d', 'neutral-content': '#ffffff',
  'base-100': '#ffffff', 'base-200': '#f5f6f8', 'base-300': '#e4e7ec', 'base-content': '#16181d',
};

/* ---------------------------------------------------------------- the plans */
/** Two plans side by side: the three-year plan finishing, and the five-year plan that has begun. */
function shapePlans(strategy) {
  const plans = Object.values(strategy.nodes).filter((n) => n.type === 'plan').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const [old, next] = plans;
  const under = (id) => { const out = []; const walk = (pid) => { for (const n of Object.values(strategy.nodes)) if (n.parentId === pid) { out.push(n); walk(n.id); } }; walk(id); return out; };
  if (old) {
    Object.assign(old, { title: 'Strategic Plan 2024–2027: Rooted and Growing', start: '2024-04-01', end: '2027-03-31', theme: 'The last year of the three-year plan: finish strong, learn, hand on to the five-year plan' });
    // Its work began a year earlier, so most of it is done by now.
    for (const n of under(old.id)) {
      if (n.start) n.start = yearBack(n.start);
      if (n.end) n.end = yearBack(n.end);
      if (n.type === 'task') {
        n.status = n.end < TODAY ? (n.status === 'blocked' && n.title.length % 3 === 0 ? 'blocked' : 'done') : n.start <= TODAY ? 'active' : 'planned';
        for (const ev of n.events ?? []) ev.date = yearBack(ev.date);
      }
    }
  }
  if (next) Object.assign(next, { title: 'Vital Bay: Five-Year Plan 2026–2031', start: '2026-04-01', end: '2031-03-31', theme: 'Shaped by 1,200 voices in the 2025 community conversations: belonging, a home for everyone, a living bay' });
  if (next) {
    // The new plan's own commitments, so its objectives don't share names with the old plan's.
    const NEW_OBJECTIVES = ['Belonging for everyone', 'A home for everyone', 'A living bay', 'Leaders from every corner of the bay', 'Data the whole bay can use'];
    Object.values(strategy.nodes).filter((n) => n.type === 'objective' && n.parentId === next.id).forEach((o, i) => { o.title = NEW_OBJECTIVES[i % NEW_OBJECTIVES.length]; });
    // Seven months in: its first work began in the spring, so some is done and some under way.
    const firstStart = under(next.id).filter((n) => n.type === 'task').map((n) => n.start).filter(Boolean).sort()[0];
    const lag = firstStart ? (Math.round((Date.parse(firstStart) - Date.parse('2026-09-20')) / 864e5)) : 0;
    const back = (d) => new Date(Date.parse(d) - lag * 864e5).toISOString().slice(0, 10);
    for (const n of under(next.id)) { if (n.start) n.start = back(n.start); if (n.end) n.end = back(n.end); }
    for (const n of under(next.id)) if (n.type === 'task' && n.status !== 'blocked') n.status = n.end && n.end < TODAY ? 'done' : n.start && n.start <= TODAY ? 'active' : 'planned';
  }
  const root = Object.values(strategy.nodes).find((n) => n.type === 'framework');
  if (root) Object.assign(root, { title: 'Kestrel Bay Community Foundation' });
  return strategy;
}

/* ---------------------------------------------------------------- the public portal */
const page = (id, siteId, title, summary, body, more = {}) => [id, { id, kind: 'page', siteId, title, slug: more.slug ?? slugify(title), summary, body, cover: null, status: 'published', publishedAt: more.publishedAt ?? '2026-01-15', authorId: more.authorId ?? null, inNav: more.inNav ?? true, order: more.order ?? 0 }];
const post = (id, title, publishedAt, summary, body, more = {}) => [id, { id, kind: 'article', siteId: 'site-main', title, slug: slugify(title), summary, body, cover: more.cover ?? null, status: more.status ?? 'published', publishedAt, authorId: more.authorId ?? null, inNav: false, order: 0, tags: more.tags ?? [] }];
const link = (slug, text) => `[${text}](?site=site-main&page=${slug})`;

const BLOG = [
  ['blog-hall', 'The hall that came back to life', '2026-11-18', 'Ten years empty, the Cove Road hall has a roof, a ramp and a kitchen again. Here is how a village did it.',
    'For ten winters the Cove Road hall sat dark. This fall, it opened again: new roof, a ramp to the front door, and a kitchen that already smells of Friday suppers.\n\n**$18,500** from the Neighbourhood Fund paid for the ramp and the kitchen. The rest came from bake sales, a fiddle night, and a lot of Saturday mornings.\n\n> “We didn’t need someone to fix it for us. We needed someone to believe we could.” — Marg, hall committee\n\n#GiveLocal #KestrelBay #CommunityHalls', ['grants', 'villages']],
  ['blog-youth', 'Twelve young people, $60,000, one big table', '2026-11-04', 'Our youth grant panel met for the last time this round. They funded eight projects, and changed how we decide.',
    'Twelve panellists, aged 15 to 24, read every application, visited five projects and argued (kindly) about all of them.\n\nThey funded **eight projects** with $60,000, from a skate-park build to a peer support line.\n\nWhat they taught us: ask fewer questions, pay people for their time, and say yes faster.\n\n#YouthPhilanthropy #TrustBasedGiving', ['youth', 'grants']],
  ['blog-vital', 'Vital Signs 2026: five things the numbers say', '2026-10-21', 'Rents, wait lists, volunteer hours and who feels they belong: the short version of this year’s report.',
    '1. **Rents rose 11%** in two years. Wages rose 4%.\n2. **Food bank visits** are up a third, and a quarter are from working families.\n3. **Volunteering** is back above 2019 levels.\n4. **Belonging** is highest in the villages and lowest among newcomers in their first two years.\n5. **The bay is warming**: the lobster season is moving.\n\nSee every number on our [Vital Signs dashboards](?site=site-data).\n\n#VitalSigns #KestrelBay', ['vital signs', 'housing']],
  ['blog-legacy', 'What a legacy gift really does', '2026-10-07', 'A gift in a will becomes a fund that gives every year, for good. Three families tell us why they chose it.',
    'When Joan and Peter MacLeod set up their fund, they asked for one thing: that it help kids get to the water. Twelve years on, it pays for swimming lessons for 140 children every summer.\n\nA legacy gift is invested in our endowment, and the income is granted out every year, for good.\n\n#LegacyGiving #Endowment', ['endowment', 'donors']],
  ['blog-welcome', 'Welcome circles: a first winter, together', '2026-09-23', 'Newcomer families, long-time neighbours and a lot of soup. Notes from the first welcome circle pilot.',
    'Thirty-one families joined the first welcome circles this fall. Each circle pairs newcomers with neighbours who have lived here a long time, for six evenings of food, questions and practical help.\n\nNext: circles in Port Allan and Birch Cove in the new year.\n\n#Newcomers #Belonging', ['newcomers', 'belonging']],
  ['blog-housing', 'A home for everyone: our housing data, in plain words', '2026-09-09', 'We took the housing numbers to council. Here is what we showed them, and what happens next.',
    'Since 2021, the bay lost **214 long-term rentals** to short-term listings. Vacancy is under 1%.\n\nWe asked council for three things: a cap on whole-home short-term rentals, a land bank for non-market homes, and a seat for tenants at the table. Two passed first reading.\n\n#Housing #KestrelBay', ['housing', 'government']],
  ['blog-fish', 'A fish plant, a co-op, a future', '2026-08-26', 'The old plant at Kestrel Point is a co-op now. Grant partners on what it took, and what comes next.',
    'Forty-two harvesters, three generations, one co-op. A $40,000 bridge grant kept the doors open while the co-op closed its financing.\n\n#CommunityEconomy #Fisheries', ['economy', 'grants']],
  ['blog-reconciliation', 'Reconciliation is a verb', '2026-08-12', 'The Reconciliation Fund is now led by a Mi’kmaw advisory circle. What changes, and why it matters.',
    'From this year, decisions about the Reconciliation Fund are made by a circle of Mi’kmaw knowledge keepers, youth and leaders. The foundation’s role is to listen, to pool the money, and to get out of the way.\n\n#Reconciliation #TrustBasedGiving', ['reconciliation']],
  ['blog-giveweek', 'Give Local Week raised $212,480', '2026-07-29', 'Thank you. 1,904 gifts, 61 charities, one week. The full numbers, and every charity that took part.',
    'Every dollar raised in Give Local Week went straight to local charities, and the foundation added 25 cents to every dollar.\n\n**1,904 gifts · 61 charities · $212,480**\n\n#GiveLocalWeek #ThankYou', ['donors', 'grants']],
  ['blog-transit', 'Rural transit, finally', '2026-07-15', 'The Bay Bus started its first loop this week. Three years of community work, one fifteen-seat bus.',
    'Two loops a day, six days a week, from Birch Cove to the hospital and back. The first week carried 380 riders.\n\n#RuralTransit #Belonging', ['villages', 'seniors']],
  ['blog-art', 'Art on the wharf', '2026-06-30', 'Nine murals, one summer, and a wharf that looks like it belongs to everyone again.',
    'Nine artists, three of them under 20, painted the Wharf Street sea wall this summer. The arts council and the Neighbourhood Fund shared the cost.\n\n#ArtsAndCulture', ['arts and culture']],
  ['blog-core', 'Why we fund core costs', '2026-06-16', 'Rent, wages and the lights: we changed how we give. Here is what grantees told us after the first year.',
    'Two years ago we moved to multi-year, unrestricted grants for core costs. Grantees told us they hired, planned further ahead, and spent less time writing reports.\n\n> “It is the first time a funder asked what we needed, not what we could promise.”\n\n#TrustBasedPhilanthropy', ['trust-based philanthropy', 'grants']],
  ['blog-plan', 'Vital Bay: our new five-year plan', '2026-04-08', '1,200 voices, 14 community conversations, one plan. What we heard, and what we will do about it.',
    'The five-year plan, Vital Bay, began this April. It overlaps the last year of our three-year plan on purpose: we finish what we started while the new work begins.\n\nThree big commitments: **belonging** for everyone who lives here, **a home** for everyone, and **a living bay**.\n\n#VitalBay #StrategicPlan', ['strategy']],
  ['blog-draft', 'Draft: what the youth panel wants to fund next', '2026-12-02', 'Not ready yet.', 'Notes from the panel’s last meeting.', ['youth']],
];

const GOV_DOCS = [
  ['gov-cra', 'Registered charity information return (T3010), 2025', 'link', 'https://canada.example/cra/charities/kestrel-bay-community-foundation', 'Canada Revenue Agency', '2026-05-30', 'Our annual return to the Canada Revenue Agency: revenue, gifts to qualified donees, compensation and programs.'],
  ['gov-registration', 'Charitable registration: letter of confirmation', 'link', 'https://canada.example/cra/registration-letter', 'Canada Revenue Agency', '2004-09-14', 'The foundation’s registration as a public foundation under the Income Tax Act.'],
  ['gov-province-grant', 'Provincial community fund: contribution agreement 2025–2028', 'link', 'https://province.example/communities/agreements/kbcf-2025', 'Department of Communities, Culture and Heritage', '2025-04-01', 'A three-year agreement for community grants in rural communities, with quarterly reporting.'],
  ['gov-municipal-housing', 'Municipal housing needs assessment', 'link', 'https://kestrelbay.example/council/housing-needs-2026', 'Municipality of Kestrel Bay', '2026-03-12', 'The housing needs assessment council adopted in March, with the foundation’s Vital Signs data in appendix C.'],
  ['gov-str-bylaw', 'Short-term rental by-law, first reading', 'link', 'https://kestrelbay.example/council/bylaws/str-2026', 'Municipality of Kestrel Bay', '2026-09-17', 'The draft by-law capping whole-home short-term rentals, as given first reading.'],
  ['gov-census', 'Census profile: Kestrel Bay census subdivision', 'link', 'https://statistics.example/census/2021/kestrel-bay', 'Statistics Office', '2022-04-27', 'Population, age, language, income and housing for the bay, from the 2021 census.'],
  ['gov-federal-cohesion', 'Federal community services recovery fund: final report', 'link', 'https://canada.example/community-services-recovery/final-report', 'Employment and Social Development', '2025-11-30', 'The final report on the recovery fund grants the foundation distributed in 2023–24.'],
  ['gov-treaty', 'Peace and Friendship Treaties: a plain-language guide', 'link', 'https://province.example/treaties/peace-and-friendship', 'Office of L’nu Affairs', '2023-10-01', 'The treaties that shape every relationship in the bay; required reading for the board.'],
];

const MEETINGS = [
  ['2026-11-12', ['Five-year plan: first-quarter report', 'Endowment and investment policy review', 'Youth panel recommendations, fall round', 'Reconciliation Fund terms with the advisory circle'], ['Accepted the youth panel’s eight grants ($60,000)', 'Approved the revised investment policy', 'Endorsed the Reconciliation Fund terms']],
  ['2026-09-24', ['Vital Signs 2026 launch plan', 'Audit results 2025–26', 'Short-term rental by-law: our position'], ['Received the audited statements', 'Approved a submission to council supporting the by-law']],
  ['2026-06-18', ['Annual general meeting arrangements', 'Grants committee report, spring round', 'Board recruitment'], ['Approved $410,000 in spring grants', 'Nominated three new directors for the AGM']],
  ['2026-04-09', ['Launch of Vital Bay, the five-year plan', 'Budget 2026–27', 'Risk register review'], ['Approved the 2026–27 budget', 'Adopted the five-year plan']],
  ['2026-02-12', ['Community conversations: what we heard', 'Draft five-year plan', 'Investment returns, Q3'], ['Sent the draft plan for community review']],
  ['2025-11-13', ['Three-year plan: year two review', 'Legacy giving campaign', 'Give Local Week results'], ['Approved the legacy campaign', 'Thanked the Give Local Week volunteers']],
  ['2025-09-25', ['Audit 2024–25', 'Vital Signs 2025 data', 'Housing working group'], ['Received the audited statements', 'Formed a housing working group']],
  ['2025-06-19', ['AGM arrangements', 'Spring grants', 'Youth panel pilot results'], ['Made the youth panel permanent', 'Approved $385,000 in spring grants']],
  ['2025-04-10', ['Budget 2025–26', 'Community conversations plan', 'Policy on multi-year grants'], ['Approved the budget', 'Adopted multi-year core grants as standard']],
  ['2025-02-13', ['Strategic plan mid-point review', 'Endowment returns', 'Board skills matrix'], ['Agreed to begin the five-year planning process']],
  ['2024-11-14', ['Three-year plan: year one', 'Give Local Week', 'Reconciliation Fund launch'], ['Launched the Reconciliation Fund with $250,000']],
  ['2024-09-26', ['Audit 2023–24', 'Investment policy', 'Vital Signs 2024 indicators'], ['Received the audited statements']],
  ['2024-06-20', ['AGM', 'Spring grants', 'Officers for 2024–25'], ['Elected officers', 'Approved $352,000 in spring grants']],
  ['2024-04-11', ['Launch of the three-year plan, Rooted and Growing', 'Budget 2024–25'], ['Adopted the three-year plan', 'Approved the budget']],
];

function boardDocs(staff) {
  const names = Object.values(staff).filter((s) => s.roleId === 'board' || s.roleId === 'lead').map((s) => s.name).slice(0, 8);
  const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const doc = (id, title, issued, tags, body, abstract = '') => [id, { id, kind: 'doc', folderId: 'f-board', tags, body, createdBy: null, createdAt: Date.parse(`${issued}T15:00:00Z`), updatedAt: Date.parse(`${issued}T15:00:00Z`),
    meta: blankMeta({ type: 'document', title, creators: [{ role: 'author', literal: 'Board secretary' }], issued, publisher: KESTREL_SPEC.name, abstract, keywords: tags }) }];
  const out = MEETINGS.map(([date, items, decisions], i) => doc(`board-min-${date}`, `Board meeting minutes, ${longDate(date)}`, date, ['board', 'minutes'],
    `**Present:** ${names.slice(0, 6 + (i % 3)).join(', ')}\n\n**Regrets:** ${names[7] ?? 'none'}\n\n**Chair:** ${names[0] ?? 'the Chair'}\n\n## Items\n\n${items.map((it, k) => `${k + 1}. ${it}`).join('\n')}\n\n## Decisions\n\n${decisions.map((d) => `- ${d}`).join('\n')}\n\n## Next meeting\n\nThe secretary circulates the date and the pack two weeks before.\n\n_Approved as a true record at the following meeting._`, items[0]));
  out.push(
    doc('board-bylaws', 'By-laws of the Kestrel Bay Community Foundation', '2023-06-15', ['board', 'governance'], '## 1. Name and purpose\n\nThe Kestrel Bay Community Foundation pools gifts from the community into permanent funds and grants the income to charities serving the bay.\n\n## 2. Directors\n\nNine to fifteen directors, elected at the annual general meeting for terms of three years, renewable once.\n\n## 3. Officers\n\nChair, vice-chair, treasurer and secretary, elected by the directors each June.\n\n## 4. Meetings\n\nAt least five board meetings a year; quorum is a majority of directors.', 'The foundation’s by-laws, as amended at the 2023 AGM.'),
    doc('board-handbook', 'Board handbook 2026–27', '2026-06-18', ['board', 'governance'], '## Welcome\n\nThis handbook is your guide to serving on the board: our purpose, how we decide, what we expect of each other and where to find things.\n\n## Your first year\n\n- Meet the Executive Director and the Chair\n- Visit two grantees\n- Join one committee\n\n## Committees\n\nGrants, Investment, Governance and Nominating, Audit and Finance.', 'Everything a director needs: roles, committees, the calendar and our policies.'),
    doc('board-coi', 'Conflict of interest policy', '2025-04-10', ['board', 'governance'], 'Directors declare any interest in a grant, investment or contract before it is discussed, and leave the room for the decision. Declarations are minuted.', 'How directors declare and manage conflicts of interest.'),
    doc('board-investment', 'Investment policy statement', '2026-11-12', ['board', 'governance'], 'The endowment is invested for the long term to keep its value after inflation and grants. Target spending: 4% a year, smoothed over twelve quarters. Responsible investment screens apply.', 'How the endowment is invested, and how much it may spend each year.'),
    doc('board-tor-grants', 'Grants committee: terms of reference', '2025-06-19', ['board', 'governance'], 'The grants committee recommends grants to the board, oversees the youth panel and the Reconciliation Fund circle’s budget, and reviews grant policy each year.', 'What the grants committee does and how it works.'),
    doc('board-fin-q2', 'Finance summary, Q2 2026–27', '2026-11-05', ['board', 'finance'], '| | This quarter | Year to date |\n|---|---|---|\n| Gifts received | $612,000 | $1.14M |\n| Grants paid | $498,000 | $1.02M |\n| Operating costs | $214,000 | $421,000 |\n\nThe endowment stood at **$52.4M** on September 30.', 'Gifts, grants and costs for the second quarter, and the endowment.'),
    doc('board-fin-q1', 'Finance summary, Q1 2026–27', '2026-08-06', ['board', 'finance'], 'Gifts $528,000; grants paid $522,000; operating costs $207,000. Endowment $51.1M on June 30.', 'The first quarter of 2026–27.'),
    doc('board-fin-audit', 'Audited financial statements 2025–26: summary', '2026-09-24', ['board', 'finance'], 'A clean audit opinion. Total assets $54.8M; grants paid in the year $2.31M; operating costs 14% of total spending.', 'The auditor’s summary of the 2025–26 statements.'),
    doc('board-fin-reserves', 'Reserves position and policy', '2026-04-09', ['board', 'finance'], 'Operating reserves of six months’ costs ($840,000) are held separately from the endowment.', 'How much is held in reserve, and why.'),
  );
  return out;
}

function homeBody(docs, latest) {
  const dash = Object.values(docs.dashboards.dashboards).filter((d) => d.visibility === 'public');
  const blog = BLOG.filter(([id]) => id !== 'blog-draft').slice(0, 4);
  return `**Kestrel Bay grows when we give together.** Since 2004 the foundation has pooled gifts from neighbours, families and businesses into permanent funds, and granted the income to the people and groups who make the bay a good place to live.

## This year, together

- **$2.3 million** granted to **148 community groups**
- **1,904 gifts** in Give Local Week
- **12 young people** deciding where $60,000 goes
- **$52.4 million** endowment, giving every year, for good

${dash[0] ? `[[dashboard:${dash[0].id}]]` : ''}

## What we fund

**Belonging.** Welcome circles for newcomers, community halls, rural transit and the Reconciliation Fund, led by a Mi’kmaw advisory circle.

**A home for everyone.** Housing data for council, a land bank for non-market homes, and tenant support.

**A living bay.** Shoreline restoration, the fish plant co-op, and climate-ready villages.

${link('grants', 'Apply for a grant')} · ${link('give', 'Give today')} · ${link('vital-signs', 'See the Vital Signs')}

## Stories from the bay

${blog.map(([id, title, date, summary]) => `**${link(slugify(title), title)}**  \n${summary}`).join('\n\n')}

${link('news', 'Every story')} →

## Listen

${latest ? `[[episode:${latest.id}]]` : ''}

Three series, sixty-odd episodes: the people building community around the bay, in their own voices. [All episodes](?site=site-main&view=station).

## The plan we are working to

Our new five-year plan, **Vital Bay (2026–2031)**, began in April, shaped by 1,200 voices. It overlaps the last year of **Rooted and Growing (2024–2027)**, so we finish what we started while the new work begins. ${link('our-plan', 'Read the plan')}.

> “The foundation asked us what we needed, then trusted us to do it.” — a grantee, Vital Signs 2026`;
}

function shapePages(docs, latest) {
  const blog = BLOG.map(([id, title, date, summary, body, tags], i) => post(id, title, date, summary, body, { tags, status: id === 'blog-draft' ? 'draft' : 'published', cover: i % 3 === 0 ? { kind: 'url', url: `/media/photos/nature/${['john-lee-omne', 'kate-trysh-rkmc', 'artem-kniaz-bc7z', 'alba-calbeto-dufb', 'nicole-gaffney-j9vx'][i % 5]}.jpg`, credit: 'Unsplash' } : null }));
  const dash = Object.values(docs.dashboards.dashboards).filter((d) => d.visibility === 'public');
  const pages = [
    page('pg-home', 'site-main', 'Give together, grow together', 'Kestrel Bay grows when we give together.', homeBody(docs, latest), { slug: 'home', inNav: false, order: -1 }),
    page('pg-about', 'site-main', 'About us', 'A community foundation for everyone who calls the bay home.', `The Kestrel Bay Community Foundation was started in 2004 by eleven neighbours who wanted the bay’s generosity to last.\n\n## How we work\n\n- We **pool gifts** into permanent funds\n- We **listen**, through community conversations and Vital Signs\n- We **grant** the income to local charities, multi-year and unrestricted where we can\n- We **convene** people around the bay’s hardest questions\n\n## Our people\n\nA staff of 36 and a volunteer board of twelve. See ${link('board-and-staff', 'board and staff')}.`, { order: 0 }),
    page('pg-grants', 'site-main', 'Grants', 'Funding for charities and community groups around the bay.', '## Open now\n\n**Neighbourhood Fund** — up to $20,000 for halls, gardens, gatherings. Closes February 15.\n\n**Core Grants** — three years of unrestricted funding for local charities. By invitation after a conversation.\n\n**Youth Grants** — decided by our youth panel each fall.\n\n**Reconciliation Fund** — led by the Mi’kmaw advisory circle.\n\n## How to apply\n\n1. Call or write to our grants team\n2. Tell us what you need, in your own words (or a short video)\n3. Hear back within six weeks', { order: 1 }),
    page('pg-give', 'site-main', 'Give', 'Give today, give for good.', '## Ways to give\n\n- **Give Local Week**, every July\n- **Start a fund** in your family’s name\n- **Leave a legacy gift** in your will\n- **Give stocks or RRSPs**\n\nEvery fund is invested for the long term, and its income is granted every year, for good.', { order: 2 }),
    page('pg-vital', 'site-main', 'Vital Signs', 'How the bay is doing, in numbers, from the people who live here.', `Vital Signs is our report on life in the bay: housing, food, belonging, work and the water.\n\n${dash.map((d) => `[[dashboard:${d.id}]]`).join('\n\n')}\n\nEvery number, and the data behind it, is on our [Vital Signs site](?site=site-data).`, { order: 3, slug: 'vital-signs' }),
    page('pg-plan', 'site-main', 'Our plan', 'Vital Bay, 2026–2031, and how it overlaps Rooted and Growing.', '## Vital Bay: Five-Year Plan 2026–2031\n\nThree commitments, shaped by 1,200 voices:\n\n1. **Belonging** for everyone who lives here\n2. **A home** for everyone\n3. **A living bay**\n\n## Rooted and Growing, 2024–2027\n\nOur three-year plan finishes in March 2027. Its last year overlaps the new plan on purpose, so nothing we started is dropped.', { order: 4, slug: 'our-plan', inNav: false }),
    page('pg-docs', 'site-main', 'Documents', 'Reports, government filings and the papers behind our work.', `## Government filings and agreements\n\n${GOV_DOCS.map(([, title, , url, publisher, date]) => `- [${title}](${url}) — ${publisher}, ${date.slice(0, 4)}`).join('\n')}\n\n## Our reports\n\n- Annual report 2025\n- Vital Signs 2026\n- Audited financial statements 2025–26 (summary)\n\nBoard members: the papers and minutes are on the [board site](?site=site-board).`, { order: 5 }),
    page('pg-listen', 'site-main', 'Listen', 'Our podcasts.', `${Object.keys(docs.podcasts.podcasts).map((id) => `[[show:${id}]]`).join('\n\n')}\n\nEvery episode is on [our station](?site=site-main&view=station).`, { order: 6, inNav: false }),
    page('pg-people', 'site-main', 'Board and staff', 'The people behind the foundation.', 'Twelve volunteer directors and a staff of 36 across grants, donors, communications, learning and operations.', { order: 7, inNav: false, slug: 'board-and-staff' }),
    page('pg-news', 'site-main', 'News', 'Stories from the bay.', BLOG.filter(([id]) => id !== 'blog-draft').map(([, title, date, summary]) => `**${link(slugify(title), title)}** · ${date}  \n${summary}`).join('\n\n'), { order: 8, slug: 'news', inNav: false }),
    page('pg-data-about', 'site-data', 'About the data', 'Where the numbers come from.', 'Vital Signs draws on the census, municipal and provincial data, our grantees’ reports and our own community survey of 1,200 people. Every indicator has a source and a date.', { order: 0 }),
    ...blog,
  ];
  return migratePages({ id: 'pages', pages: Object.fromEntries(pages) });
}

/* ---------------------------------------------------------------- the podcast station */
function shapePodcasts(pods, staffIds) {
  const shows = Object.values(pods.podcasts).sort((a, b) => a.order - b.order);
  const audio = ['media/podcasts/stem-voices-1.mp3', 'media/podcasts/stem-voices-2.mp3', 'media/podcasts/land-learning-1.mp3', 'media/podcasts/stem-voices-trailer.mp3'];
  const TITLES = [
    ['The hall that came back to life', 'Why we fund core costs', 'Youth at the grant table', 'What the housing numbers say', 'A fish plant, a co-op, a future', 'Welcome to the bay', 'Seven generations thinking', 'The food bank that grows food', 'Legacy gifts, explained', 'Counting what matters', 'Art on the wharf', 'Rural transit, finally', 'Seniors who keep the village going', 'A library of things', 'Reconciliation is a verb', 'The credit union and the community', 'Ice on the harbour', 'The volunteer fire hall', 'Lobster season, moving', 'A garden at the school', 'Tenants at the table', 'Fiddles and fundraising', 'The first winter here', 'What a land bank does', 'Paddling the old routes', 'The night market', 'Small schools, big hearts', 'The care home choir', 'A ramp to the front door', 'Fixing the wharf'],
    ['Cove Road hall committee', 'The skate park crew', 'Peer support line', 'Birch Cove garden club', 'The fish plant co-op', 'Welcome circle hosts', 'The Bay Bus', 'Mural makers', 'Tenant association', 'Youth panel, round two', 'The library of things', 'Night market vendors', 'Shoreline restoration', 'Care home choir'],
    ['Rents and wages', 'Who feels they belong', 'Food bank visits', 'Volunteer hours', 'The warming bay', 'Getting to the hospital', 'Young people staying', 'Newcomers, year one', 'Childcare spaces', 'The cost of heat', 'Vacancy, explained', 'What 1,200 people said'],
  ];
  const episodes = {};
  shows.forEach((show, si) => {
    const titles = TITLES[si] ?? TITLES[0];
    const gap = si === 0 ? 7 : si === 1 ? 14 : 21;
    show.seasons = { 1: { number: 1, title: 'Season 1', description: '' }, 2: { number: 2, title: 'Season 2', description: '' }, ...(si === 0 ? { 3: { number: 3, title: 'Season 3', description: '' } } : {}) };
    titles.forEach((title, ei) => {
      const date = day(TODAY, -gap * (titles.length - 1 - ei) + (ei === titles.length - 1 ? 7 : 0));
      const perSeason = Math.ceil(titles.length / (si === 0 ? 3 : 2));
      const season = Math.floor(ei / perSeason) + 1;
      const id = `ep-kestrel-${si}-${ei}`;
      episodes[id] = {
        id, podcastId: show.id, season, number: (ei % perSeason) + 1, title, slug: slugify(title),
        description: `${show.title}: ${title}. ${['Neighbours tell the story in their own words.', 'What happened, what it cost, and what comes next.', 'The numbers, explained with the people who live them.'][si % 3]}`,
        notes: 'In this episode:\n\n- Who was there, and why it matters\n- What it took\n- What comes next', type: 'full',
        status: date > TODAY ? 'scheduled' : 'published', publishedAt: date,
        audio: { url: audio[(si + ei) % audio.length], duration: 30, mimetype: 'audio/mpeg' }, personIds: show.hostIds ?? [], guests: [], tags: [],
      };
    });
  });
  pods.episodes = episodes;
  pods.station = { ...pods.station, name: 'Kestrel Bay Radio', tagline: 'Voices from around the bay.', description: 'Three series from the Kestrel Bay Community Foundation: weekly conversations, grantee stories and the numbers behind life in the bay.', siteId: 'site-main',
    look: { ...(pods.station.look ?? {}), hero: 'masthead', archive: 'seasons', player: 'bar', art: 'rounded', masthead: { ...photoMasthead(photoById['nicole-gaffney-j9vx']), height: 'm', focus: 50 } } };
  const live = Object.values(episodes).filter((e) => e.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  pods.station.featuredEpisodes = [live[0], live.find((e) => e.podcastId === shows[1]?.id), live.find((e) => e.podcastId === shows[2]?.id), live[5]].filter(Boolean)
    .map((e, i) => ({ episodeId: e.id, blurb: ['The newest conversation from around the bay: start here.', 'A grantee tells the story behind the grant, in their own words.', 'The numbers behind life in the bay, explained by the people who live them.', 'A listener favourite from this season.'][i] }));
  shows.forEach((s, i) => { s.featured = i < 2; });
  return migratePodcasts(pods);
}

/* ---------------------------------------------------------------- social media */
function shapeSocial(docs, latest) {
  const social = migrateSocial({ id: 'social' });
  const at = (d, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00-04:00`).toISOString();
  for (const [nw, handle, since] of [['instagram', '@kestrelbaycf', '2023-03-01'], ['facebook', 'Kestrel Bay Community Foundation', '2019-06-01'], ['tiktok', '@kestrelbaycf', '2025-02-10'], ['youtube', '@KestrelBayRadio', '2024-01-15'], ['linkedin', 'kestrel-bay-cf', '2020-09-01'], ['bluesky', '@kestrelbay.example', '2025-11-01']]) {
    social.channels[nw] = { network: nw, handle, connected: true, connectedAt: at(since), auto: nw === 'youtube' };
  }
  social.settings = { hashtags: ['KestrelBay', 'GiveLocal'], signoff: 'Give local: kestrelbay.example/give', utm: true };
  const eps = Object.values(docs.podcasts.episodes).filter((e) => e.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const articles = Object.values(docs.pages.pages).filter((p) => p.kind === 'article' && p.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const measures = Object.values(docs.strategy.nodes).flatMap((n) => n.measures ?? []);
  const P = (id, kind, title, text, source, networks, status, when, campaign = '') => ({ id, kind, title, text, source, media: null, networks, perNetwork: {}, status, scheduledAt: status === 'scheduled' ? when : null, postedAt: status === 'posted' ? when : null, results: {}, createdBy: null, createdAt: when, campaign });
  const list = [];
  articles.slice(0, 8).forEach((a, i) => list.push(P(`post-a-${i}`, 'article', a.title, `${a.title}\n\n${a.summary}`, { type: 'page', id: a.id }, i % 2 ? ['facebook', 'linkedin', 'bluesky'] : ['instagram', 'facebook', 'linkedin'], 'posted', at(day(a.publishedAt, 1), 11), i < 3 ? 'Vital Signs 2026' : '')));
  eps.slice(0, 6).forEach((e, i) => list.push(P(`post-e-${i}`, 'episode', e.title, `New episode: “${e.title}”. ${e.description}`, { type: 'episode', id: e.id }, ['instagram', 'tiktok', 'youtube', 'facebook'], 'posted', at(day(e.publishedAt, 0), 16))));
  measures.slice(0, 4).forEach((m, i) => list.push(P(`post-d-${i}`, 'datacard', m.name, `${m.name}: here is where we are, and where we are going.`, { type: 'measure', id: m.id }, ['instagram', 'linkedin', 'bluesky'], i < 2 ? 'posted' : 'scheduled', i < 2 ? at(day(TODAY, -20 - i * 9), 9) : at(day(TODAY, 3 + i * 4), 9), 'Vital Signs 2026')));
  list.push(P('post-n-0', 'note', 'Giving Tuesday is coming', 'Giving Tuesday is December 1. Every gift to a local fund is matched 25 cents on the dollar.', null, ['instagram', 'facebook', 'linkedin', 'bluesky', 'tiktok'], 'scheduled', at('2026-12-01', 8), 'Giving Tuesday'));
  list.push(P('post-n-1', 'note', 'Thank you, volunteers', 'To the 412 people who gave their time this year: thank you.', null, ['facebook', 'instagram'], 'scheduled', at('2026-12-05', 10)));
  list.push(P('post-n-2', 'note', 'Neighbourhood Fund opens', 'The Neighbourhood Fund opens January 5: up to $20,000 for halls, gardens and gatherings.', null, ['facebook', 'linkedin'], 'draft', at(TODAY)));
  if (latest) list.push(P('post-e-next', 'episode', `Clip: ${latest.title}`, `A minute from “${latest.title}”.`, { type: 'episode', id: latest.id }, ['tiktok', 'youtube', 'instagram'], 'draft', at(TODAY)));
  list.push(P('post-d-board', 'dashboard', 'Vital Signs dashboard', 'Our numbers, live: the Vital Signs dashboard.', null, ['linkedin', 'facebook'], 'draft', at(TODAY)));
  for (const p of list) {
    if (p.status === 'posted') for (const nw of p.networks) p.results[nw] = mockPush(p, nw, social.channels[nw], p.postedAt);
    social.posts[p.id] = p;
  }
  return social;
}

/* ---------------------------------------------------------------- everything */
/**
 * Photos on the assets (alpha 0.3 PR 8): with the episodes' cover art, a
 * little over half of the Asset manager's tiles show a picture. Library
 * items, map actors and maps take a library photo (from the nature folder)
 * until 55% of them have one; people keep their faces and episodes their art.
 */
function shapeAssets(docs) {
  const hub = migrateAssets(docs.assets ?? blankAssets());
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const cards = gatherAssets(hub, { maps: docs.maps, mapContents, org: docs.org, library: docs.library, podcasts: docs.podcasts })
    .filter((c) => ['library', 'actor', 'map'].includes(c.source) && !c.file?.type?.startsWith('image/'));
  const score = (key) => { let x = 2166136261; for (const ch of key) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
  const picked = [...cards].sort((a, b) => score(a.key) - score(b.key)).slice(0, Math.ceil(cards.length * 0.55));
  const at = '2026-11-01T12:00:00.000Z';
  picked.forEach((c, i) => {
    const id = `asset-photo-${i + 1}`;
    hub.items[id] = { id, kind: 'ref', ref: c.ref, title: c.title, description: '', tags: [], collectionIds: [], abcd: c.abcd ?? null, sensitivity: c.sensitivity ?? 'internal', photoId: photoFor(c.key).id, createdAt: at, createdBy: null };
  });
  return migrateAssets(hub);
}

/** The org's documents and the generated library files, ready for the test platform. */
export function kestrelBundle() {
  const { docs, files } = mockDocs(KESTREL_SPEC);
  const org = docs.org;
  Object.assign(org, {
    description: 'A community foundation for everyone who calls Kestrel Bay home: we pool gifts, grow local leadership and fund what the community asks for.',
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: KESTREL_COLOURS },
    // A custom plan with every plugin switched on, including the newer, optional ones.
    plugins: { podcasts: true, graph: true, rhizome: true, social: true, 'ai-policy': true, 'ai-register': true, 'prompt-commons': true, 'plain-words': true, 'critical-media': true },
    sites: {
      'site-main': { id: 'site-main', name: 'Kestrel Bay Community Foundation', url: 'https://kestrelbay.example', visibility: 'public', shows: 'Who we are, grants, giving, stories, podcasts and documents',
        home: { kind: 'page', slug: 'home' },
        look: { template: 'harbour', masthead: { ...photoMasthead(photoById['john-lee-omne']), height: 'm', focus: 55 }, type: 'sans', header: 'over' } },
      'site-data': { id: 'site-data', name: 'Vital Signs', url: 'https://kestrelbay.example/vital-signs', visibility: 'public', shows: 'Live dashboards: how the bay is doing',
        look: { template: 'signal', masthead: { preset: 'contours', image: null, height: 's', focus: 50 }, type: 'grotesk', header: 'solid' } },
      'site-board': { id: 'site-board', name: 'Board portal', url: 'https://kestrelbay.example/board', visibility: 'private', shows: 'Minutes, governance and finance papers for directors' },
    },
  });
  docs.strategy = shapePlans(docs.strategy);
  docs.podcasts = shapePodcasts(docs.podcasts, Object.keys(org.staff));
  const latest = Object.values(docs.podcasts.episodes).filter((e) => e.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  // Public dashboards: one on the main site, the rest on Vital Signs; one for the board.
  Object.values(docs.dashboards.dashboards).forEach((d, i) => Object.assign(d, i === 0 ? { visibility: 'public', siteId: 'site-main' } : i < 3 ? { visibility: 'public', siteId: 'site-data' } : { visibility: 'private', siteId: 'site-board' }));
  docs.pages = shapePages(docs, latest);
  // The board's papers and the government documents, in the library.
  const lib = docs.library;
  lib.folders['f-board'] = { id: 'f-board', name: 'Board portal', parentId: null };
  lib.folders['f-gov'] = { id: 'f-gov', name: 'Government documents', parentId: null };
  for (const [id, item] of boardDocs(org.staff)) lib.items[id] = item;
  for (const [key, title, kind, url, publisher, issued, abstract] of GOV_DOCS) {
    lib.items[key] = { id: key, kind, url, folderId: 'f-gov', tags: ['government'], createdBy: null, createdAt: Date.parse(`${issued}T12:00:00Z`), updatedAt: Date.parse(`${issued}T12:00:00Z`),
      meta: blankMeta({ type: 'report', title, creators: [{ role: 'author', literal: publisher }], issued, publisher, URL: url, abstract, language: 'en', keywords: ['government'] }) };
  }
  docs.social = shapeSocial(docs, latest);
  // A blank theory of change, to start from the plan (alpha 0.3 PR 8).
  if (docs.studio) Object.assign(docs.studio, { toc: {}, tocLinks: {} });
  docs.assets = shapeAssets(docs);
  // Rhizome's pilot instance (Rhizome stage 1): switched on, with the set-up already run, so design can start straight away.
  docs.rhizome = seedRhizome(docs);
  return { docs, files };
}
