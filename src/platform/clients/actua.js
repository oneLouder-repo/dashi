/**
 * "Strategic AI at Actua": a client workspace for Actua's AI strategy.
 * Built from public sources (read 2026-11-21) and the Tamarack draft
 * report "From Pipelines to Systems, Reprise" (Ecosystem Mapping Report,
 * Draft 02). Nothing here is Actua's own plan: it is a starting draft to
 * react to.
 *
 * Honesty rules for this seed:
 *   - Facts carry their source (library items, actor notes).
 *   - Relationships on the map are marked `basis: documented` (a public
 *     source names it) or `basis: speculative` (a reasonable guess to test
 *     with Actua). Speculative links say so in their label.
 *   - Targets in the plan are placeholders where Actua hasn't published
 *     one, and say so.
 */
import { migrateOrg } from '../org.js';
import { seedStrategy } from '../strategySeed.js';
import { migrateStrategy } from '../strategy.js';
import { studioFromPlans, plansOf } from '../studio.js';
import { migratePages, slugify } from '../pages.js';
import { mapEntry, mapDocName } from '../maps.js';
import { createMap, ops, applyOp } from '../../core/ops.js';
import { blankLibrary, blankMeta, migrateBib } from '../library.js';

/**
 * Actua's palette. Approximate: Actua's logo is cobalt (its logo files are
 * named "Cobalt"), with a teal and a warm accent for charts. Check against
 * Actua's brand guide before sharing outside.
 */
export const ACTUA_COLOURS = {
  primary: '#1f3fbf', 'primary-content': '#ffffff',
  secondary: '#00857f', 'secondary-content': '#ffffff',
  accent: '#f2a03d', 'accent-content': '#2b1a05',
  neutral: '#1b2340', 'neutral-content': '#eef1fb',
  'base-100': '#ffffff', 'base-200': '#f3f5fb', 'base-300': '#e2e7f4', 'base-content': '#1b2340',
};

/**
 * Tags: one controlled list for the library, bibliography, map and plan,
 * so everything can be found the same way. Lower case; the tier tags match
 * the map's lens (Micro / Meso / Macro).
 */
export const ACTUA_TAGS = {
  theme: ['ai literacy', 'responsible ai', 'families', 'educators', 'youth', 'equity', 'indigenous', 'girls in stem', 'systems change', 'measurement'],
  lever: ['cancode', 'apple', 'policy', 'funding', 'research', 'media'],
  tier: ['micro', 'meso', 'macro'],
  status: ['speculative', 'to verify', 'actua publication'],
};

const T0 = Date.parse('2026-11-21T14:00:00Z');
const STAFF = [
  ['a-admin', 'Workspace admin', 'Sets up and looks after this space', 'admin', ['t-mel']],
  ['a-ceo', 'Jennifer Flanagan', 'President and CEO', 'lead', ['t-lead']],
  ['a-vpo', 'Jen Spencer', 'VP, Outreach and Education', 'lead', ['t-lead', 't-ai']],
  ['a-vpd', 'Valeria Iannitti', 'VP, Development and Partnerships', 'lead', ['t-lead', 't-part']],
  ['a-comms', 'Alison Gareau', 'Senior Director, Communications', 'lead', ['t-part']],
  ['a-ai', 'AI programs lead (to name)', 'AI-Ready Generation program lead', 'staff', ['t-ai']],
  ['a-research', 'Research and evaluation lead (to name)', 'Research, evaluation and learning', 'staff', ['t-mel']],
  ['a-network', 'Member network lead (to name)', 'Network and member relations', 'staff', ['t-ai']],
  ['a-advisor', 'Systems change advisor', 'Tamarack Institute (guest)', 'guest', ['t-mel']],
];

export function actuaOrg() {
  return migrateOrg({
    id: 'org-actua-ai',
    name: 'Strategic AI at Actua',
    description: 'A working space for Actua’s AI strategy: the plan, the ecosystem it works in, the evidence behind it and the files that go with it.',
    mission: 'Every young person in Canada has the skills and confidence to thrive with AI, and families and communities shape how it is used.',
    contact: { email: '', phone: '', website: 'https://actua.ca/aiready', address: 'Ottawa, ON' },
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: ACTUA_COLOURS },
    plugins: { podcasts: false, 'critical-media': true },
    staff: Object.fromEntries(STAFF.map(([id, name, title, roleId, teamIds]) => [id, { id, name, title, roleId, teamIds, interests: [], email: '', avatar: null }])),
    teams: {
      't-lead': { id: 't-lead', name: 'Leadership', color: '#1f3fbf' },
      't-ai': { id: 't-ai', name: 'AI-Ready programs', color: '#00857f' },
      't-mel': { id: 't-mel', name: 'Research and learning', color: '#7a4fb5' },
      't-part': { id: 't-part', name: 'Partnerships and advocacy', color: '#c77a1a' },
    },
    sites: {
      'site-main': { id: 'site-main', name: 'AI strategy (members only)', url: 'https://actua-ai.dashi.example', visibility: 'private', shows: 'The AI strategy, the ecosystem map and the reading list, for staff and the board',
        look: { template: 'signal', masthead: { preset: 'confluence', image: null, height: 'm', focus: 50 }, type: 'grotesk', header: 'solid' } },
    },
  });
}

/* ---------- The plan ---------- */

const task = (title, start, end, status, assigneeIds, more = {}) => ({ type: 'task', title, start, end, status, assigneeIds, ...more });
const wp = (title, start, end, staffIds, children) => ({ type: 'workplan', title, start, end, staffIds, teamIds: [], children });
const m = (id, name, unit, target) => ({ id, name, unit, target: String(target) });

export function actuaStrategy() {
  return migrateStrategy(seedStrategy({
    type: 'framework',
    title: 'Strategic AI at Actua',
    mission: 'Every young person in Canada has the skills and confidence to thrive with AI, and families and communities shape how it is used.',
    vision: 'AI literacy is treated as family and community literacy: rooted in human agency, open to every young person, and built with the communities Actua serves.',
    values: 'Human agency · Equity first · Learning by doing · Rooted in community · Responsible and safe',
    children: [
      {
        type: 'plan', title: 'AI-Ready Generation 2026–2028', start: '2026-04-01', end: '2028-03-31',
        theme: 'From AI skills training to AI literacy, aligned with CanCode phase 5 (to March 2028)',
        children: [
          {
            type: 'objective', title: 'CanCode: youth AI literacy at national scale',
            measures: [m('m-a-youth', 'Youth in AI-Ready programming', 'youth / year', 'TBC with CanCode workbook'), m('m-a-priority', 'Share from CanCode priority groups', '%', 'TBC'), m('m-a-communities', 'Communities reached', 'communities / year', 600)],
            children: [
              { type: 'goal', title: 'Every member runs AI-Ready activities in camps and clubs (Stream 1: students)', measures: [], children: [wp('AI-Ready in the member network', '2026-10-01', '2028-03-31', ['a-ai', 'a-network'], [
                task('Map which members already run AI activities', '2026-10-01', '2026-11-30', 'active', ['a-network']),
                task('Refresh Learning Hub AI activities for grades 2–12', '2026-11-01', '2027-03-31', 'planned', ['a-ai']),
                task('Summer 2027 camps: AI module in every member program', '2027-05-01', '2027-08-31', 'planned', ['a-ai', 'a-network']),
              ])] },
              { type: 'goal', title: 'Reach CanCode priority groups first: girls, Indigenous, Black, disabled, rural and northern youth', measures: [], children: [] },
              { type: 'goal', title: 'Land-based and unplugged AI literacy with InSTEM partners', measures: [], children: [] },
            ],
          },
          {
            type: 'objective', title: 'Educators confident with AI (CanCode Stream 2: teachers)',
            measures: [m('m-a-educators', 'Educators trained in AI literacy', 'educators', 'TBC'), m('m-a-confident', 'Educators who feel confident using AI with students', '% (Ready for AI? baseline 38%)', 'TBC')],
            children: [
              { type: 'goal', title: 'Adapt MIT RAISE Day of AI for Canadian classrooms', measures: [], children: [] },
              { type: 'goal', title: 'Use Apple’s free AI teacher guides (with Common Sense Media) in educator PD', measures: [], children: [wp('Apple AI resources pilot', '2027-01-15', '2027-06-30', ['a-ai', 'a-vpd'], [
                task('Review the three Apple Teachers’ Essential Guides against Actua’s AI principles', '2027-01-15', '2027-02-28', 'planned', ['a-ai']),
                task('Explore Apple Community Education Initiative support for under-resourced members', '2027-02-01', '2027-04-30', 'planned', ['a-vpd']),
                task('Pilot one guide with two member programs', '2027-04-01', '2027-06-30', 'planned', ['a-ai', 'a-network']),
              ])] },
              { type: 'goal', title: 'Keep the AI Exchange community of practice going after August 2026', measures: [], children: [] },
            ],
          },
          {
            type: 'objective', title: 'Families as a community of AI literacy',
            measures: [m('m-a-families', 'Families taking part', 'families', 'TBC'), m('m-a-parentvoice', 'Parent voices gathered (worry wall, registration questions)', 'responses', 'TBC')],
            children: [
              { type: 'goal', title: 'Give families a next step from every Actua AI touchpoint (family AI guide, tips for parents)', measures: [], children: [] },
              { type: 'goal', title: 'Build a parent research constituency so Actua can say "parents are telling us…"', measures: [], children: [] },
            ],
          },
          {
            type: 'objective', title: 'Responsible AI, inside and out',
            measures: [],
            children: [
              { type: 'goal', title: 'An internal AI use policy for staff and instructors', measures: [], children: [wp('AI use policy', '2026-11-01', '2027-03-31', ['a-research', 'a-comms'], [
                task('Draft guidelines from the Responsibility and Ethics in AI resource', '2026-11-01', '2026-12-15', 'active', ['a-research']),
                task('Consult instructors and the youth advisory', '2027-01-05', '2027-02-15', 'planned', ['a-research']),
                task('Board approval', '2027-03-01', '2027-03-31', 'planned', ['a-ceo']),
              ])] },
              { type: 'goal', title: 'Youth data, privacy and consent for AI activities', measures: [], children: [] },
            ],
          },
          {
            type: 'objective', title: 'National voice and evidence',
            measures: [m('m-a-briefs', 'Policy submissions and briefs', 'briefs / year', 4)],
            children: [
              { type: 'goal', title: 'Ready for AI? 2027: repeat the youth, parent and educator survey', measures: [], children: [] },
              { type: 'goal', title: 'Shift the story from "AI skills training" to "AI literacy as family and community literacy"', measures: [], children: [] },
              { type: 'goal', title: 'Position Actua alongside the National AI Literacy Initiative (Amii) for K-12', measures: [], children: [] },
            ],
          },
        ],
      },
      {
        // A sibling plan (plans never nest): the worked example from the mapping sessions, as a probe.
        type: 'plan', title: 'Families and AI literacy: systems change pilot 2027', start: '2027-01-01', end: '2027-12-31',
        theme: 'A fully articulated but limited probe across Micro, Meso and Macro',
        children: [
          {
            type: 'objective', title: 'Family AI Literacy Tour in 5 to 7 member communities',
            measures: [m('m-a-tour', 'Tour stops held', 'communities', 6)],
            children: [
              { type: 'goal', title: 'Design measurement in from day one (outputs, outcomes, impacts)', measures: [], children: [wp('Tour design', '2027-01-04', '2027-04-30', ['a-research', 'a-advisor'], [
                task('Bring in a research partner early', '2027-01-04', '2027-02-15', 'planned', ['a-research']),
                task('Agree one consistent national question for every stop', '2027-02-01', '2027-02-28', 'planned', ['a-research', 'a-advisor']),
                task('Choose host members and partner channels (schools, libraries, newcomer, faith and Indigenous partners)', '2027-02-15', '2027-04-30', 'planned', ['a-network']),
              ])] },
              { type: 'goal', title: 'Members bring venue, relationships and logistics; Actua brings content, speakers and research design', measures: [], children: [] },
            ],
          },
          {
            type: 'objective', title: 'Media as mission delivery',
            measures: [],
            children: [{ type: 'goal', title: 'Every media appearance points families to a next step', measures: [], children: [] }],
          },
        ],
      },
    ],
  }, 'strategy-actua-ai'));
}

/* ---------- The ecosystem map ---------- */

// Depth on the Micro / Meso / Macro lens: 0–0.33 macro, 0.33–0.67 meso, 0.67–1 micro.
const ACTORS = [
  // id, label, category, depth, spread, description, notes (source or why)
  ['actua', 'Actua national office', 'ally', 0.45, 0, 'Steward of a national STEM outreach ecosystem.', 'Reaches about 500,000 youth a year in 600 communities through 40+ university and college members (actua.ca/our-reach).', 'agent'],
  // Macro
  ['ised', 'ISED: CanCode', 'resource', 0.12, -0.55, 'Federal funder of K-12 digital and AI skills.', 'CanCode phase 5: $30M for 2026–28; Stream 1 students, Stream 2 teachers; extra consideration for teaching responsible AI use. Actua was a CanCode 4.0 recipient (ISED, Feb 2025).'],
  ['aistrategy', 'National AI Strategy: AI for All', 'gatekeeper', 0.08, -0.15, 'Federal frame for AI literacy and skills.', 'Actua welcomed youth AI literacy in the strategy (statement, June 4, 2026).'],
  ['amii', 'Amii: National AI Literacy Initiative', 'ally', 0.18, 0.2, 'Leads the federal AI literacy initiative.', 'Launched Sept 2026: Essentials for Students, Educators and Canadians; up to 50,000 K-12 educators. Actua is not named in it.'],
  ['ssf', 'Strategic Science Fund', 'resource', 0.15, -0.85, 'Federal science fund.', 'Actua publishes Strategic Science Fund annual reports (2024/25, 2025/26).'],
  ['provinces', 'Provincial ministries of education', 'gatekeeper', 0.2, 0.55, 'Set curriculum and classroom AI rules.', 'Speculative: no Actua link documented here.'],
  ['media', 'National and regional media', 'other', 0.22, 0.85, 'Carries the national story on youth and AI.', 'Report: media as mission delivery.'],
  ['bigtech', 'Generative AI platforms', 'problem', 0.1, 0.45, 'Shape how young people meet AI every day.', 'Speculative: framed as a problem maker for misinformation, privacy and bias concerns parents raise.'],
  ['cifar', 'CIFAR', 'other', 0.26, 0.05, 'Research institute; a funder of Amii.', 'Report names CIFAR as a meso research network.'],
  // Meso
  ['members', 'Actua member network (40+ universities and colleges)', 'ally', 0.5, -0.35, 'Where programs are delivered.', 'Members host camps, clubs and workshops.'],
  ['microsoft', 'Microsoft Canada (Microsoft Elevate)', 'resource', 0.4, -0.75, 'Funds and partners on AI-Ready Generation.', 'Named AI-Ready collaborator (actua.ca/aiready).'],
  ['apple', 'Apple Education', 'resource', 0.38, 0.75, 'Free AI teacher guides and community education grants.', 'Teachers’ Essential Guides to AI Fundamentals, Creativity and STEM with Apple Intelligence (with Common Sense Media); Community Education Initiative; Apple Learning Coach (in Canada). No Apple–Actua link found yet.'],
  ['raise', 'MIT RAISE (Day of AI)', 'ally', 0.42, 0.45, 'AI literacy curriculum partner.', 'Actua adapts Day of AI for Canada; co-hosted AI Exchange, Aug 2026.'],
  ['tmu', 'Toronto Metropolitan University', 'ally', 0.47, 0.6, 'Co-host of AI Exchange 2026.', 'TMU story, Oct 2026.'],
  ['hkjc', 'Hong Kong Jockey Club', 'other', 0.36, 0.95, 'International partner on AI Exchange.', 'TMU story, Oct 2026.'],
  ['abacus', 'Abacus Data', 'other', 0.55, 0.9, 'Survey partner.', 'Fielded Ready for AI? (2025): 502 educators, 1,000 youth and parents.'],
  ['corporate', 'Corporate and foundation funders', 'resource', 0.35, -1, 'RBC, TD, Suncor, Toyota, CIBC, Enbridge, Cenovus, Imperial, Deciem, Rideau Hall Foundation.', 'Listed on 2026 Actua releases.'],
  ['google', 'Google.org (earlier AI Project)', 'resource', 0.6, -0.95, 'Funded Actua’s first AI curriculum.', 'AI Education Handbook, January 2020, with CIRA.'],
  ['unions', 'Teacher federations and school boards', 'gatekeeper', 0.4, 0.2, 'Shape teacher PD and classroom access.', 'Report lists teacher unions at the meso tier.'],
  ['indigenous', 'Indigenous community partners and Elders', 'community', 0.55, 0.15, 'Co-design land-based STEM (InSTEM).', 'actua.ca/our-approach.'],
  ['channels', 'Parent councils, libraries, newcomer, cultural and faith groups', 'community', 0.6, 0.6, 'Ways to reach families.', 'Report: there is no single channel for reaching parents.'],
  ['tamarack', 'Tamarack Institute', 'ally', 0.52, -0.6, 'Systems change advisor.', 'Facilitated the 2026 ecosystem mapping sessions.'],
  ['mila', 'Mila and Vector Institute', 'other', 0.3, 0.3, 'National AI institutes.', 'Speculative: no Actua link found.'],
  // Micro
  ['youth', 'Youth (12–18)', 'community', 0.92, 0.1, '71% say they use AI effectively; 84% want to learn more.', 'Ready for AI? (2025).'],
  ['instructors', 'Undergraduate instructors (1,000 a year)', 'ally', 0.75, -0.3, '"For youth by youth" outreach team.', 'actua.ca/our-reach.'],
  ['educators', 'K-12 educators', 'community', 0.8, 0.45, '78% say they need to improve their AI skills.', 'Ready for AI? (2025).'],
  ['parents', 'Parents and caregivers', 'community', 0.85, 0.75, 'Worried about privacy, safety, misinformation and use.', 'Report: families are the missing element.'],
  ['alumni', 'Alumni who became instructors and parents', 'community', 0.88, -0.65, 'The multigenerational story.', 'Report: documented in places, poorly leveraged.'],
  ['priority', 'Priority youth: girls, Indigenous, Black, disabled, rural and northern', 'community', 0.95, -0.2, 'CanCode and Actua priority groups.', 'Applicant guide 2026–28; Actua statement June 2026.'],
];

// from, to, type, label, basis ('documented' | 'speculative'), source
const LINKS = [
  ['ised', 'actua', 'resource-flow', 'CanCode funds AI-Ready', 'documented', 'actua.ca/aiready; ISED Feb 2025'],
  ['ssf', 'actua', 'resource-flow', 'Strategic Science Fund', 'documented', 'Actua SSF annual reports'],
  ['microsoft', 'actua', 'resource-flow', 'AI-Ready collaboration', 'documented', 'actua.ca/aiready'],
  ['corporate', 'actua', 'resource-flow', 'Program funding', 'documented', 'Actua releases, 2026'],
  ['google', 'actua', 'resource-flow', 'AI Project, 2019–20', 'documented', 'Actua, Jan 2020'],
  ['apple', 'educators', 'information', 'Free AI teacher guides', 'documented', 'Apple Education Community, Nov 2025'],
  ['apple', 'actua', 'resource-flow', 'Possible Community Education Initiative partner (speculative)', 'speculative', 'No link found yet'],
  ['raise', 'actua', 'learning', 'Day of AI adapted for Canada', 'documented', 'actua.ca/aiready'],
  ['tmu', 'actua', 'relationship', 'AI Exchange 2026 co-host', 'documented', 'TMU, Oct 2026'],
  ['hkjc', 'actua', 'relationship', 'AI Exchange partner', 'documented', 'TMU, Oct 2026'],
  ['abacus', 'actua', 'information', 'Ready for AI? survey', 'documented', 'Actua, May 2025'],
  ['actua', 'aistrategy', 'power', 'Advocacy: CanCode and youth AI literacy', 'documented', 'Actua statement, June 2026'],
  ['aistrategy', 'ised', 'power', 'Sets CanCode’s AI focus', 'documented', 'ISED, July 2026'],
  ['aistrategy', 'amii', 'resource-flow', 'National AI Literacy Initiative', 'documented', 'ISED, Sept 2026'],
  ['cifar', 'amii', 'resource-flow', 'Funder', 'documented', 'Amii, Sept 2026'],
  ['amii', 'educators', 'information', 'AI for All: Essentials for Educators', 'documented', 'Amii, Sept 2026'],
  ['amii', 'actua', 'relationship', 'Possible K-12 alignment (speculative)', 'speculative', 'Not named in the initiative'],
  ['actua', 'members', 'resource-flow', 'Curriculum, training, funding', 'documented', 'actua.ca/our-approach'],
  ['members', 'instructors', 'relationship', 'Hire and host', 'documented', 'actua.ca/our-reach'],
  ['instructors', 'youth', 'learning', 'Camps, clubs and workshops', 'documented', 'actua.ca/our-approach'],
  ['instructors', 'priority', 'learning', 'Programs designed with communities', 'documented', 'actua.ca/our-approach'],
  ['youth', 'actua', 'feedback', 'Reflection journals and surveys', 'documented', 'AI-Ready Youth Reflection Journal; Ready for AI?'],
  ['indigenous', 'actua', 'relationship', 'Co-designed land-based STEM (InSTEM)', 'documented', 'actua.ca/our-approach'],
  ['tamarack', 'actua', 'learning', 'Ecosystem mapping sessions', 'documented', 'Mapping report, Draft 02'],
  ['parents', 'actua', 'feedback', 'Worry wall, parent-voice map (proposed)', 'speculative', 'Mapping report worked example'],
  ['channels', 'parents', 'relationship', 'Routes to reach families', 'documented', 'Mapping report worked example'],
  ['media', 'parents', 'information', 'Points families to a next step (proposed)', 'speculative', 'Mapping report worked example'],
  ['actua', 'media', 'information', 'National voice on youth and AI', 'documented', 'Mapping report; Actua releases'],
  ['alumni', 'instructors', 'learning', 'Campers become instructors', 'documented', 'Mapping report worked example'],
  ['alumni', 'parents', 'relationship', 'Instructors become parents of campers', 'documented', 'Mapping report worked example'],
  ['bigtech', 'youth', 'power', 'Shapes everyday AI use (speculative)', 'speculative', 'Framing to test'],
  ['unions', 'educators', 'power', 'PD time and classroom norms (speculative)', 'speculative', 'Framing to test'],
  ['provinces', 'unions', 'power', 'Curriculum and AI guidance (speculative)', 'speculative', 'Framing to test'],
  ['mila', 'amii', 'relationship', 'Pan-Canadian AI institutes (speculative)', 'speculative', 'Framing to test'],
  ['educators', 'youth', 'learning', 'Classroom AI literacy', 'documented', 'Ready for AI? (2025)'],
];

export function actuaMap() {
  const map = { ...createMap({ name: 'Actua AI literacy ecosystem', lensId: 'micro-meso-macro' }), id: 'map-actua-ai' };
  const layerId = map.layers[0].id;
  map.layers[0].name = 'Ecosystem (documented)';
  // Speculative links on a layer of their own, so they can be hidden or shown in one click.
  const addLayer = ops.addLayer({ id: 'layer-speculative', name: 'Speculative links (to test)' });
  applyOp(map, addLayer);
  const ids = {};
  for (const [key, label, category, depth, spread, description, notes, kind = 'actor'] of ACTORS) {
    const speculative = /^Speculative/.test(notes);
    const op = ops.addActor({ id: `actor-${key}`, label, category, kind, place: { depth, spread }, layerId, meta: { description, notes, basis: speculative ? 'speculative' : 'documented' } });
    applyOp(map, op);
    ids[key] = op.id;
  }
  for (const [from, to, type, label, basis, source] of LINKS) {
    applyOp(map, ops.addConnector({ id: `conn-${from}-${to}`, from: { actorId: ids[from] }, to: { actorId: ids[to] }, type, label, strength: basis === 'speculative' ? 1 : 3, layerId: basis === 'speculative' ? 'layer-speculative' : layerId, meta: { basis, source } }));
  }
  // The worked example's throughline: tagged on the actors (meta.throughline) rather than a group frame, which would cover half the map.
  for (const k of ['youth', 'parents', 'channels', 'members', 'abacus', 'media', 'aistrategy']) map.actors[ids[k]].meta.throughline = 'Families and AI literacy';
  return map;
}

/* ---------- The library ---------- */

const ACTUA = { role: 'author', literal: 'Actua' };
const person = (given, family) => ({ role: 'author', given, family });

/** [key, kind, folder, tags, meta] */
const ITEMS = [
  // Actua publications
  ['pub-ready', 'link', 'f-actua', ['ai literacy', 'research', 'educators', 'youth', 'families', 'actua publication'], { type: 'report', title: 'Ready for AI? Report', creators: [ACTUA], issued: '2025-06', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2025/06/2025-Actua-Ready-for-AI-report.pdf', abstract: 'Survey with Abacus Data of 502 K-12 educators (Nov 2024) and 1,000 youth aged 12–18 with their parents or caregivers (Feb 2025). 71% of youth say they use AI effectively against 38% of educators; 78% of teachers say they need to improve their AI skills; 84% of youth want to learn more.' }],
  ['pub-pipelines', 'link', 'f-actua', ['systems change', 'actua publication'], { type: 'report', title: 'Pipelines to Systems: Thinking About Systemic Change in STEM', creators: [ACTUA], issued: '2026', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2026/07/Science-Report-Pipelines-to-Systems-Actua.pdf', abstract: 'Discussion paper calling for systemic change that bends systems to serve people. The starting point for the ecosystem mapping sessions.' }],
  ['pub-ethics', 'link', 'f-actua', ['responsible ai', 'actua publication'], { type: 'report', title: 'Responsibility and Ethics in Artificial Intelligence', creators: [ACTUA], issued: '2026-02', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2026/02/Responsibility-and-Ethics-in-Artificial-Intelligence_Actua_2026.pdf' }],
  ['pub-parents', 'link', 'f-actua', ['families', 'ai literacy', 'actua publication'], { type: 'report', title: 'AI-Ready Generation: Tips for Parents', creators: [ACTUA], issued: '2025-04', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2025/04/2025-AI-Ready-Generation-Tips-for-Parents.pdf' }],
  ['pub-journal', 'link', 'f-actua', ['youth', 'ai literacy', 'actua publication'], { type: 'report', title: 'AI-Ready Generation Youth Reflection Journal', creators: [ACTUA], issued: '2025-10', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2025/10/AI-Ready-Generation-Youth-Reflection-Journal-Actua.pdf' }],
  ['pub-whyai', 'link', 'f-actua', ['ai literacy', 'actua publication'], { type: 'report', title: 'AI-Ready Generation: Why AI?', creators: [ACTUA], issued: '2025-10', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2025/10/Actua-AI-Ready-Generation-Why-AI.pdf' }],
  ['pub-statement', 'link', 'f-policy', ['policy', 'cancode', 'actua publication'], { type: 'webpage', title: 'Actua statement on the National AI Strategy', creators: [ACTUA], issued: '2026-06-04', containerTitle: 'Actua', URL: 'https://actua.ca/news-views/ai-strategy-statement', accessed: '2026-11-21' }],
  ['pub-cancode', 'link', 'f-policy', ['cancode', 'policy', 'actua publication'], { type: 'webpage', title: 'Actua welcomes CanCode renewal as foundation for Canada’s digital and AI future', creators: [ACTUA], issued: '2026-04-29', containerTitle: 'Actua', URL: 'https://actua.ca/news-views/2026-cancode-renewal', accessed: '2026-11-21' }],
  ['pub-girls', 'link', 'f-actua', ['girls in stem', 'equity', 'actua publication'], { type: 'report', title: 'From Insight to Action: Building Collective Resilience for Girls in STEM', creators: [ACTUA], issued: '2026', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2026/06/Actua-From-Insight-to-Action-Report-2026.pdf' }],
  ['pub-landbased', 'link', 'f-actua', ['indigenous', 'actua publication'], { type: 'report', title: 'Indigenous Land-based STEM Education Discussion Paper', creators: [ACTUA], issued: '2021-06', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2022/02/Indigenous-Land-Based-STEM-Education-Discussion-Paper-Actua-Canada.pdf' }],
  ['pub-annual', 'link', 'f-actua', ['actua publication'], { type: 'report', title: '2025/2026 Annual Report', creators: [ACTUA], issued: '2026-04', publisher: 'Actua', URL: 'https://actua.ca/wp-content/uploads/2026/04/2025-2026-Annual-Report-EN.pdf' }],
  ['pub-iannitti', 'link', 'f-ai', ['ai literacy', 'responsible ai', 'policy'], { type: 'webpage', title: 'Reclaiming human intelligence in the Age of AI', creators: [person('Valeria', 'Iannitti')], issued: '2026-09', containerTitle: 'Canadian Science Policy Centre', URL: 'https://sciencepolicy.ca/posts/reclaiming-human-intelligence-in-the-age-of-ai/', accessed: '2026-11-21' }],
  // CanCode and government
  ['gov-cancode5', 'link', 'f-policy', ['cancode', 'policy', 'funding'], { type: 'webpage', title: 'Government of Canada invests $30 million to launch fifth phase of CanCode program to offer new training opportunities for youth and teachers', creators: [{ role: 'author', literal: 'Innovation, Science and Economic Development Canada' }], issued: '2026-07-08', containerTitle: 'Government of Canada', URL: 'https://www.canada.ca/en/innovation-science-economic-development/news/2026/07/government-of-canada-invests-30-million-to-launch-fifth-phase-of-cancode-program-to-offer-new-training-opportunities-for-youth-and-teachers.html', accessed: '2026-11-21', abstract: '$30M for 2026–28; aims to reach 1.1 million students and train 76,000 teachers. Part of AI for All, Canada’s national AI strategy.' }],
  ['gov-cancode-guide', 'link', 'f-policy', ['cancode', 'funding'], { type: 'webpage', title: 'CanCode program 2026–2028: Applicant guide', creators: [{ role: 'author', literal: 'Innovation, Science and Economic Development Canada' }], issued: '2026-08-06', containerTitle: 'Government of Canada', URL: 'https://ised-isde.canada.ca/site/ised/en/programs-and-initiatives/cancode/cancode-program-2026-2028-applicant-guide', accessed: '2026-11-21', abstract: 'Stream 1 student training, Stream 2 teacher training and resources; up to $5M per fiscal year per stream; projects end March 31, 2028; quarterly results reporting; extra consideration for teaching responsible AI use. Closed to applications Aug 6, 2026.' }],
  ['gov-cancode4', 'link', 'f-policy', ['cancode', 'funding'], { type: 'webpage', title: 'Government of Canada announces recipients of CanCode 4.0 funding', creators: [{ role: 'author', literal: 'Innovation, Science and Economic Development Canada' }], issued: '2025-02-25', containerTitle: 'Government of Canada', URL: 'https://www.canada.ca/en/innovation-science-economic-development/news/2025/02/government-of-canada-announces-recipients-of-cancode-40-funding.html', accessed: '2026-11-21', abstract: '$39.2M to 22 organizations, Actua among them.' }],
  ['gov-ailit', 'link', 'f-policy', ['ai literacy', 'policy', 'educators'], { type: 'webpage', title: 'Government of Canada launches National AI Literacy Initiative', creators: [{ role: 'author', literal: 'Innovation, Science and Economic Development Canada' }], issued: '2026-09-09', containerTitle: 'Government of Canada', URL: 'https://www.canada.ca/en/innovation-science-economic-development/news/2026/09/government-of-canada-launches-national-ai-literacy-initiative.html', accessed: '2026-11-21' }],
  ['amii-ailit', 'link', 'f-policy', ['ai literacy', 'educators'], { type: 'webpage', title: 'Amii leads National AI Literacy Initiative to empower 1 million learners', creators: [person('Lynda', 'Vang')], issued: '2026-09-09', containerTitle: 'Amii', URL: 'https://www.amii.ca/updates-insights/amii-leads-national-ai-literacy-initiative', accessed: '2026-11-21' }],
  // Apple
  ['apple-guides', 'link', 'f-apple', ['apple', 'educators', 'ai literacy'], { type: 'webpage', title: 'New AI Resources for Educators', creators: [{ role: 'author', literal: 'Apple' }], issued: '2025-11-13', containerTitle: 'Apple Education Community', URL: 'https://education.apple.com/resource/250014633', accessed: '2026-11-21', abstract: 'Three free guides made with Common Sense Media: Teachers’ Essential Guide to AI Fundamentals with Apple, to Creativity with Apple Intelligence, and to STEM with Apple Intelligence (5E inquiry model), each with a workbook.' }],
  ['apple-creativity', 'link', 'f-apple', ['apple', 'educators'], { type: 'webpage', title: 'Teachers’ Essential Guide to Creativity with Apple Intelligence', creators: [{ role: 'author', literal: 'Apple' }, { role: 'author', literal: 'Common Sense Media' }], issued: '2026-03-19', containerTitle: 'Apple Education Community', URL: 'https://education.apple.com/resource/250014919', accessed: '2026-11-21' }],
  ['apple-cei', 'link', 'f-apple', ['apple', 'funding', 'equity'], { type: 'webpage', title: 'Apple launches new professional learning resources for teachers and expands global education grant program', creators: [{ role: 'author', literal: 'Apple' }], issued: '2024-10-01', containerTitle: 'Apple Newsroom (Canada)', URL: 'https://www.apple.com/ca/newsroom/2024/10/apple-launches-new-resources-for-teachers-expands-education-grant-program/', accessed: '2026-11-21', abstract: 'Community Education Initiative grants expand to 100 new schools and communities; Apple Learning Coach available in Canada; Everyone Can Create activities.' }],
  ['raise-exchange', 'link', 'f-ai', ['educators', 'ai literacy'], { type: 'webpage', title: 'Actua partners with TMU to host AI conference to empower educators', creators: [{ role: 'author', literal: 'Toronto Metropolitan University' }], issued: '2026-10-01', containerTitle: 'Toronto Metropolitan University', URL: 'https://www.torontomu.ca/engineering-architectural-science/stories-events/stories/2026/10/actua-partners-with-tmu-to-host-ai-conference-to-empower-educators/', accessed: '2026-11-21' }],
  // Research literature
  ['ref-vanwijk', 'ref', 'f-systems', ['systems change', 'micro', 'meso', 'macro'], { type: 'article-journal', title: 'Social innovation: Integrating micro, meso, and macro level insights from institutional theory', creators: [person('Jakomijn', 'van Wijk'), person('Charlene', 'Zietsma'), person('Silvia', 'Dorado'), person('Frank G. A.', 'de Bakker'), person('Ignasi', 'Martí')], issued: '2019', containerTitle: 'Business & Society', volume: '58', issue: '5', page: '887-918', DOI: '10.1177/0007650318789104' }],
  ['ref-centola', 'ref', 'f-systems', ['systems change', 'meso'], { type: 'article-journal', title: 'Experimental evidence for tipping points in social convention', creators: [person('Damon', 'Centola'), person('Joshua', 'Becker'), person('Devon', 'Brackbill'), person('Andrea', 'Baronchelli')], issued: '2018', containerTitle: 'Science', volume: '360', issue: '6393', page: '1116-1119', DOI: '10.1126/science.aas8827' }],
  ['ref-kania', 'ref', 'f-systems', ['systems change'], { type: 'report', title: 'The water of systems change', creators: [person('John', 'Kania'), person('Mark', 'Kramer'), person('Peter', 'Senge')], issued: '2018', publisher: 'FSG' }],
  ['ref-long', 'ref', 'f-ai', ['ai literacy'], { type: 'paper-conference', title: 'What is AI literacy? Competencies and design considerations', creators: [person('Duri', 'Long'), person('Brian', 'Magerko')], issued: '2020', containerTitle: 'Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems', page: '1-16', DOI: '10.1145/3313831.3376727' }],
  ['ref-touretzky', 'ref', 'f-ai', ['ai literacy', 'youth'], { type: 'paper-conference', title: 'Envisioning AI for K-12: What should every child know about AI?', creators: [person('David', 'Touretzky'), person('Christina', 'Gardner-McCune'), person('Fred', 'Martin'), person('Deborah', 'Seehorn')], issued: '2019', containerTitle: 'Proceedings of the AAAI Conference on Artificial Intelligence', volume: '33', issue: '01', page: '9795-9799', DOI: '10.1609/aaai.v33i01.33019795' }],
  ['ref-ng', 'ref', 'f-ai', ['ai literacy'], { type: 'article-journal', title: 'Conceptualizing AI literacy: An exploratory review', creators: [person('Davy Tsz Kit', 'Ng'), person('Jac Ka Lok', 'Leung'), person('Samuel Kai Wah', 'Chu'), person('Maggie Shen', 'Qiao')], issued: '2021', containerTitle: 'Computers and Education: Artificial Intelligence', volume: '2', page: '100041', DOI: '10.1016/j.caeai.2021.100041' }],
  ['ref-unesco', 'ref', 'f-ai', ['ai literacy', 'youth', 'responsible ai'], { type: 'report', title: 'AI competency framework for students', creators: [{ role: 'author', literal: 'UNESCO' }], issued: '2024', publisher: 'UNESCO', publisherPlace: 'Paris' }],
];

const DOCS = [
  ['doc-report', 'f-systems', ['systems change', 'families', 'micro', 'meso', 'macro'], 'Ecosystem mapping report (Draft 02): key points', `# Ecosystem mapping report (Draft 02): key points

A summary of *From Pipelines to Systems, Reprise: Systems, ecosystems and systems change at Actua*, from the 1.5-day mapping sessions with Actua’s senior leadership.

## The model

Three tiers after van Wijk et al. (2019): **Macro / Us** (structural change: budgets, policy), **Meso / We** (norms, relationships, shared values) and **Micro / Me** (one’s own practice). Actors sorted into key allies, resource providers, problem makers and others.

## What we learned

- Systems change rarely needs a seismic shift: it is a careful re-alignment of work across scales.
- Design the whole chain first (needs, relational supports, data, advocacy), then the interventions.
- Relationships are key infrastructure. Many of Actua’s are informal and fade when programs end; families are the clearest example.
- Messaging reaches individuals but norms form at the meso tier, through repeated, direct contact (Centola et al., 2018).
- At the macro tier, Actua’s biggest lever may be the story: from "AI skills training" to **"AI literacy as family and community literacy"**.

## The worked example: Families and AI literacy

1. Families are the missing element.
2. Engagement exists but is fragmented.
3. Actua can't yet say "parents are telling us X".
4. There is a multigenerational story: campers become instructors, then parents.
5. Design the whole chain from the start.
6. AI literacy is a good place to start.
7. There is no single channel for reaching parents.
8. A flagship idea: a Family AI Literacy Tour in 5 to 7 member communities.
9. The tour as a research opportunity: a worry wall, one national question.
10. Media as mission delivery.

## Caveats from the report

The map was made quickly by a subset of senior leadership, without youth or marginalized perspectives. Treat it as a first model to grow.
`],
  ['doc-onepager', 'f-working', ['ai literacy', 'cancode', 'apple', 'speculative'], 'AI strategy on a page (draft for discussion)', `# AI strategy on a page (draft)

**Purpose:** every young person in Canada has the skills and confidence to thrive with AI, and families and communities shape how it is used.

## Five priorities, 2026–2028

1. **CanCode: youth AI literacy at national scale.** Phase 5 runs to March 31, 2028, with two streams (students, teachers) and extra weight for teaching responsible AI use.
2. **Educators confident with AI.** Day of AI (MIT RAISE), the AI Exchange community, and Apple’s free AI teacher guides as PD material.
3. **Families as a community of AI literacy.** The Family AI Literacy Tour pilot.
4. **Responsible AI, inside and out.** An AI use policy; youth data and consent.
5. **National voice and evidence.** Ready for AI? 2027; the family and community literacy story.

## To decide

- Is Apple a funder to pursue (Community Education Initiative), a content source, or both?
- Where does Actua sit next to the National AI Literacy Initiative led by Amii?
- Which CanCode performance indicators become our plan measures?
`],
  ['doc-tour', 'f-working', ['families', 'research', 'measurement'], 'Family AI Literacy Tour: concept note', `# Family AI Literacy Tour: concept note

**What:** a tour of 5 to 7 member communities, bringing families, youth and educators together around AI.

**Who does what:** Actua provides content, speakers, research design and narrative. Members provide venue, relationships and logistics.

## Research from day one

- A research partner on board before the first stop.
- A few registration questions, the same everywhere.
- An interactive "worry wall" or parent-voice map.
- One consistent national question.

## Reaching families

Schools, parent councils, libraries, universities, newcomer, cultural and faith groups, and Indigenous partners.

## After each stop

Every media moment points families to a next step: the family AI guide, an educator tool, or the parent and alumni ambassador network.
`],
];

export function actuaLibrary() {
  const lib = blankLibrary();
  const folders = [['f-actua', 'Actua publications'], ['f-policy', 'CanCode and policy'], ['f-apple', 'Apple AI in education'], ['f-ai', 'AI literacy research'], ['f-systems', 'Systems change'], ['f-working', 'Working drafts']];
  for (const [id, name] of folders) lib.folders[id] = { id, name, parentId: null };
  ITEMS.forEach(([key, kind, folderId, tags, meta], i) => {
    const id = `lib-${key}`;
    lib.items[id] = { id, kind, url: meta.URL ?? '', folderId, tags, createdBy: 'a-research', createdAt: T0 - (ITEMS.length - i) * 36e5, updatedAt: T0, meta: blankMeta({ language: 'en', keywords: tags.filter((t) => !ACTUA_TAGS.status.includes(t)), ...meta }) };
  });
  DOCS.forEach(([key, folderId, tags, title, body]) => {
    const id = `lib-${key}`;
    lib.items[id] = { id, kind: 'doc', folderId, tags, body, createdBy: 'a-advisor', createdAt: T0, updatedAt: T0, meta: blankMeta({ type: 'manuscript', title, creators: [{ role: 'author', literal: 'Strategic AI at Actua' }], issued: '2026-11-21', keywords: tags }) };
  });

  // The annotated bibliography, with a lexicon in the same terms as the tags.
  const bib = migrateBib({ id: 'bib-actua-ai', title: 'Strategic AI at Actua: annotated bibliography', description: 'The evidence behind the AI strategy: Actua’s own publications, CanCode and policy, Apple’s education resources, AI literacy research and systems change. Check every citation before it goes outside Actua.' });
  const facets = { Tier: ['Micro', 'Meso', 'Macro'], Theme: ['AI literacy', 'Responsible AI', 'Families', 'Educators', 'Equity', 'Systems change'], Lever: ['CanCode', 'Apple', 'Policy', 'Research'], Evidence: ['Peer-reviewed', 'Grey literature', 'Actua publication', 'Government'] };
  const termId = {};
  for (const [facet, terms] of Object.entries(facets)) {
    const fid = `facet-${slugify(facet)}`;
    bib.lexicon.facets[fid] = { id: fid, name: facet };
    for (const t of terms) { const tid = `term-${slugify(t)}`; termId[t] = tid; bib.lexicon.terms[tid] = { id: tid, label: t, definition: '', facetId: fid }; }
  }
  bib.lexicon.constrainTags = false;
  const ANN = {
    'pub-ready': [['AI literacy', 'Educators', 'Families', 'Research', 'Actua publication', 'Micro'], 'Actua’s own baseline. The gap between youth confidence (71% use AI effectively) and educator confidence (38%) is the clearest case for Stream 2 teacher training, and the parent sample is the seed of the parent research constituency the mapping report calls for. Repeat in 2027 to measure change.'],
    'pub-pipelines': [['Systems change', 'Actua publication', 'Macro'], 'Frames the shift from moving more learners through the pipeline to changing the systems they move through. Every objective in the plan should be readable through this lens.'],
    'pub-ethics': [['Responsible AI', 'Actua publication'], 'The starting text for the internal AI use policy and for the responsible-use content CanCode gives extra weight to.'],
    'gov-cancode-guide': [['CanCode', 'Policy', 'Government', 'Equity', 'Macro'], 'The rules that shape the next two years: two streams, $5M per stream per year cap, quarterly results reporting and priority groups. The quantitative data workbook defines the indicators, so plan measures should mirror it.'],
    'gov-cancode5': [['CanCode', 'Policy', 'Government', 'Macro'], 'Phase 5 at $30M is smaller than earlier phases (Actua says so in its June 2026 statement), so competition for each dollar is sharper. Ties CanCode explicitly to AI for All.'],
    'gov-ailit': [['AI literacy', 'Policy', 'Government', 'Educators', 'Macro'], 'The national initiative Actua is not yet named in. Its Essentials for Educators stream overlaps with Actua’s teacher work: a partner, or a gap to explain to funders.'],
    'apple-guides': [['Apple', 'Educators', 'AI literacy', 'Grey literature', 'Meso'], 'Free, classroom-ready guides with workbooks. Worth testing as PD material against Actua’s principles (human agency, unplugged and land-based options) before adopting.'],
    'apple-cei': [['Apple', 'Equity', 'Grey literature', 'Meso'], 'The Community Education Initiative funds under-resourced communities with hardware, grants and educator support, and Apple Learning Coach runs in Canada. No Apple–Actua link was found: a lead to pursue, marked speculative on the map.'],
    'ref-vanwijk': [['Systems change', 'Micro', 'Meso', 'Macro', 'Peer-reviewed'], 'The source of the three-tier model used on the ecosystem map. Useful for explaining why the map is drawn as rings.'],
    'ref-centola': [['Systems change', 'Meso', 'Peer-reviewed'], 'Experimental evidence that a committed minority (about 25%) can tip a group’s convention. Supports investing in meso-tier gatherings, like the AI Exchange community, rather than messaging alone.'],
    'ref-kania': [['Systems change', 'Grey literature'], 'Six conditions of systems change across structural, relational and transformative layers; the second lens the report suggests for the map.'],
    'ref-long': [['AI literacy', 'Peer-reviewed'], 'A widely cited definition of AI literacy with competencies and design considerations. A good check on whether AI-Ready activities cover more than tool use.'],
    'ref-touretzky': [['AI literacy', 'Peer-reviewed'], 'The "five big ideas" behind AI4K12 guidelines; a common reference for K-12 AI curricula, including Day of AI.'],
    'ref-ng': [['AI literacy', 'Peer-reviewed'], 'A review that groups AI literacy into knowing, using, evaluating and ethics. Helps frame measures beyond reach.'],
    'ref-unesco': [['AI literacy', 'Responsible AI', 'Grey literature'], 'An international framework for student AI competencies, with a human-centred mindset and ethics alongside technique.'],
    'pub-iannitti': [['AI literacy', 'Responsible AI', 'Policy', 'Actua publication'], 'Actua’s public voice on AI literacy principles: human agency, productive struggle, collaboration and logic, with unplugged and land-based learning.'],
  };
  for (const [key, [terms, text]] of Object.entries(ANN)) {
    const id = `lib-${key}`;
    bib.itemIds.push(id);
    bib.lexicon.cells[id] = Object.fromEntries(terms.filter((t) => termId[t]).map((t, i) => [termId[t], i === 0 ? 3 : 2]));
    bib.annotations[id] = { text, tags: terms.map((t) => t.toLowerCase()), by: 'a-research', addedAt: T0, updatedAt: T0 };
  }
  for (const key of ['gov-cancode4', 'amii-ailit', 'apple-creativity', 'pub-parents', 'pub-statement', 'pub-cancode', 'raise-exchange']) bib.itemIds.push(`lib-${key}`);
  bib.groups = [
    { id: 'group-cancode', name: 'CanCode', rule: 'tag:cancode' },
    { id: 'group-apple', name: 'Apple', rule: 'tag:apple' },
    { id: 'group-evidence', name: 'Peer-reviewed evidence', rule: 'type:article-journal OR type:paper-conference' },
    { id: 'group-tier', name: '', rule: 'by facet:Tier' },
  ];
  bib.weeks = {};
  lib.bibs[bib.id] = bib;
  return lib;
}

export function actuaPages() {
  const page = (id, title, summary, body, order) => [id, { id, kind: 'page', siteId: 'site-main', title, slug: slugify(title), summary, body, cover: null, status: 'published', publishedAt: '2026-11-21', authorId: 'a-comms', inNav: true, order }];
  return migratePages({ id: 'pages', pages: Object.fromEntries([
    page('pg-about', 'About this space', 'Where Actua’s AI strategy is worked out.', 'This members-only site gathers **Actua’s AI strategy**: the plan, the ecosystem it works in, and the reading behind it.\n\n## How to read the map\n\nSolid links are documented in a public source. Faint links marked *speculative* are guesses to test with the people involved.\n\n> AI literacy as family and community literacy.', 0),
  ]) });
}

/**
 * The Planning Studio around Actua's two plans (0.2, PR 10): context, SOAR
 * cards from the mapping sessions and public sources, a result for every
 * measure, and each plan assembled on the canvas. The theory of change is
 * left blank on purpose: Actua has a plan but no theory yet, to try
 * "Lay it out from the plan" and "Send to plan" on.
 */
export function actuaStudio(strategy) {
  const plans = plansOf(strategy);
  const main = plans.find((p) => /AI-Ready/.test(p.title));
  const pilot = plans.find((p) => /pilot/i.test(p.title));
  const team = (ids) => ids.map(([staffId, role]) => ({ staffId, role }));
  const spec = {};
  if (main) spec[main.id] = {
    notes: 'Worked out with the leadership team and the youth advisory, alongside the CanCode phase 5 workbook (to March 2028).',
    team: team([['a-vpo', 'lead'], ['a-ai', 'facilitator'], ['a-research', 'member'], ['a-network', 'member'], ['a-advisor', 'advisor']]),
    context: [
      ['political', 'Canada’s national AI strategy (AI for All) names youth AI literacy; CanCode phase 5 funds it to March 2028.'],
      ['economic', 'CanCode phase 5: $30M for 2026–28 across all recipients, aiming at 1.1M students and 76,000 teachers.'],
      ['social', 'Parents worry about AI and want to be part of it: Ready for AI? found only 38% of educators feel confident.'],
      ['technology', 'Free AI teacher guides from Apple and Common Sense Media, MIT RAISE Day of AI, and Amii’s national initiative.'],
      ['internal', 'A national office supporting 40+ university and college members who run the camps and clubs.'],
    ],
    cards: {
      s: [
        { text: 'A national network of 40+ members in every province and territory', feeds: 'Every member runs AI-Ready' },
        { text: 'Decades of hands-on STEM camps and clubs young people love', feeds: 'Every member runs AI-Ready' },
        { text: 'Trusted InSTEM relationships with Indigenous communities', feeds: 'Land-based' },
        'Our own evidence: the Ready for AI? survey of youth, parents and educators',
      ],
      o: [
        { text: 'CanCode phase 5 puts AI at the centre (Streams 1 and 2)', feeds: 'Every member runs AI-Ready' },
        { text: 'Apple’s free AI teacher guides with Common Sense Media', feeds: 'Apple' },
        { text: 'MIT RAISE Day of AI, ready to adapt for Canada', feeds: 'MIT RAISE' },
        { text: 'Amii’s National AI Literacy Initiative for K-12', feeds: 'Amii' },
      ],
      a: [
        { text: 'AI literacy as family and community literacy', feeds: 'next step from every' },
        { text: 'Youth furthest from opportunity reached first', feeds: 'priority groups' },
        'Every educator confident to use AI with students',
      ],
      r: [
        'Youth in AI-Ready programming each year, most from priority groups',
        'Educators who feel confident using AI with students, up from 38%',
        'Parents telling us what they need, in their own words',
      ],
    },
  };
  if (pilot) spec[pilot.id] = {
    notes: 'A fully articulated but limited probe from the mapping sessions, across Micro, Meso and Macro.',
    team: team([['a-research', 'lead'], ['a-network', 'member'], ['a-advisor', 'advisor']]),
    context: [
      ['social', 'Families meet AI through schools, libraries, faith and newcomer groups as much as through Actua.'],
      ['internal', 'Members bring venues, relationships and logistics; the national office brings content, speakers and research design.'],
    ],
    cards: {
      s: [{ text: 'Members already hold the local relationships', feeds: 'Members bring venue' }],
      o: [{ text: 'Libraries and newcomer centres asking for family AI sessions', feeds: 'Family AI Literacy Tour' }],
      a: [{ text: 'One national question asked the same way at every stop', feeds: 'Design measurement' }],
      r: ['Tour stops held, and what families told us at each'],
    },
  };
  return studioFromPlans(strategy, spec);
}

export function actuaDocs() {
  const map = actuaMap();
  const strategy = actuaStrategy();
  return {
    org: actuaOrg(),
    strategy,
    studio: actuaStudio(strategy),
    maps: { maps: { 'map-actua-ai': mapEntry({ id: 'map-actua-ai', title: 'Actua AI literacy ecosystem', description: 'Who shapes youth AI literacy in Canada, and how they relate to Actua. Speculative links are marked.', ownerId: 'a-research', memberIds: ['a-ceo', 'a-vpo', 'a-vpd', 'a-ai', 'a-advisor'] }) } },
    [mapDocName('map-actua-ai')]: map,
    library: actuaLibrary(),
    pages: actuaPages(),
    data: { id: 'data-actua-ai', series: {} },
  };
}
