/**
 * Mobilize's starting set for "Strategic AI at Actua": knowledge objects
 * drawn from the AI strategy, Actua's public reports and the ecosystem
 * mapping sessions, plus a knowledge mobilization goal and a learning
 * design goal in the plan, so the loop has workplan items to feed.
 *
 * The same honesty rules as the rest of the Actua seed (clients/actua.js):
 *   - Figures come from Actua's public reports, linked as library sources.
 *   - Stories of use and review notes are examples to show the loop, and
 *     say so ("Example:"). Replace them with what really comes back.
 *   - Indigenous land-based knowledge is held by its holders: the object
 *     stays a draft until they sign off, and never shows in the asset library.
 */
import { applyCollectionOp } from '../core/collections.js';
import { strategyOps } from '../platform/strategy.js';
import { blankMobilize, migrateMobilize, migrateObject } from './model.js';

const at = (d) => `${d}T15:00:00.000Z`;
const aud = (id, group, who, use) => ({ id, group, who, use });
const msg = (id, name, staffId = null, forIds = []) => ({ id, name, staffId, for: forIds });
const out = (id, kind, title, status, audienceIds = [], note = '') => ({ id, kind, title, status, audienceIds, note });
const up = (id, d, kind, text, more = {}) => ({ id, at: at(d), kind, text, ...more });
const rv = (id, d, by, heard, change, more = {}) => ({ id, at: at(d), by, heard, change, loop: 'single', planChange: '', ...more });

/** A strategy node by its title (the Actua plan's ids are made when it is seeded). */
const nodeByTitle = (strategy, start) => Object.values(strategy?.nodes ?? {}).find((n) => (n.title ?? '').startsWith(start))?.id ?? null;

/** Add a node with a fixed id, unless one with that id is already there. */
function addFixed(doc, id, spec) {
  if (doc.nodes[id]) return id;
  const { children = [], ...data } = spec;
  const op = strategyOps.addNode(doc, { ...data, id });
  applyCollectionOp(doc, op);
  for (const [i, c] of children.entries()) addFixed(doc, `${id}-${i + 1}`, { ...c, parentId: id });
  return id;
}

const task = (title, start, end, status, assigneeIds) => ({ type: 'task', title, start, end, status, assigneeIds });

/**
 * Two goals for the plan: knowledge mobilization under "National voice and
 * evidence", and learning design under "Educators confident with AI". Each
 * has a workplan. Returns the strategy (changed in place) and the ids.
 */
export function addMobilizeGoals(strategy) {
  const voice = nodeByTitle(strategy, 'National voice and evidence');
  const educators = nodeByTitle(strategy, 'Educators confident with AI');
  if (voice) {
    addFixed(strategy, 'goal-kmb', { type: 'goal', parentId: voice, title: 'Knowledge mobilization: what Actua learns reaches the people who can use it, and comes back', measures: [{ id: 'm-a-kmb-objects', name: 'Knowledge objects out in the world', unit: 'objects', target: '8' }, { id: 'm-a-kmb-uptake', name: 'Stories of use gathered', unit: 'stories / quarter', target: 'TBC' }] });
    addFixed(strategy, 'wp-kmb', { type: 'workplan', parentId: 'goal-kmb', title: 'Mobilize pilot', start: '2026-12-01', end: '2027-06-30', staffIds: ['a-research', 'a-comms'], teamIds: ['t-mel'], children: [
      task('Name a knowledge lead and agree the review rhythm', '2026-12-01', '2026-12-15', 'active', ['a-research']),
      task('Draft the first eight knowledge objects from the AI strategy', '2026-12-01', '2027-01-31', 'active', ['a-research', 'a-comms']),
      task('Agree consent and sign-off with InSTEM and community partners', '2027-01-05', '2027-03-31', 'planned', ['a-network', 'a-research']),
      task('Quarterly review: what came back, and what we change', '2027-03-01', '2027-03-15', 'planned', ['a-research', 'a-ceo']),
      task('Academic stream: two conference abstracts from the objects', '2027-01-15', '2027-04-30', 'planned', ['a-research']),
    ] });
  }
  if (educators) {
    addFixed(strategy, 'goal-learning-design', { type: 'goal', parentId: educators, title: 'Learning development grounded in adult education (andragogy, Kolb, UDL)', measures: [] });
    addFixed(strategy, 'wp-learning-design', { type: 'workplan', parentId: 'goal-learning-design', title: 'AI PD learning design', start: '2027-01-05', end: '2027-06-30', staffIds: ['a-ai', 'a-research'], teamIds: ['t-ai'], children: [
      task('Turn the confidence-gap finding into a Teach module for educators', '2027-01-05', '2027-02-28', 'planned', ['a-ai']),
      task('Staff learning circle on the AI use policy', '2027-02-01', '2027-03-31', 'planned', ['a-research']),
      task('Gather behaviour and results (Kirkpatrick 3 and 4) as stories of use, not quizzes', '2027-03-01', '2027-05-31', 'planned', ['a-research']),
    ] });
  }
  return { strategy, ids: { voice, educators } };
}

/** The knowledge objects. `strategy` should already carry the goals above. */
export function actuaMobilize(strategy) {
  const id = (t) => nodeByTitle(strategy, t);
  const plan = (...titles) => titles.map(id).filter(Boolean);
  const has = (nid) => (strategy?.nodes?.[nid] ? [nid] : []);
  const objects = [
    {
      id: 'ko-confidence-gap', title: 'Youth are ahead of their teachers on AI confidence', kind: 'finding', strength: 'established', stage: 'out', stream: 'both', ownerId: 'a-research',
      message: '71% of youth say they use AI effectively, against 38% of educators, and 78% of teachers say they need to build their AI skills.',
      summary: 'From Ready for AI? (Actua with Abacus Data): 502 K-12 educators surveyed in November 2024 and 1,000 youth aged 12–18 with a parent or caregiver in February 2025. 84% of youth want to learn more. The gap is not about access alone: educators want support to teach with AI, not just about it.',
      audiences: [aud('a1', 'educators', 'K-12 teachers and school leaders', 'Join AI PD that starts from what students already do with AI'), aud('a2', 'members', 'Member universities and colleges', 'Plan teacher workshops into their CanCode Stream 2 delivery'), aud('a3', 'funders', 'ISED (CanCode) and corporate partners', 'See why teacher training is half the job, not an add-on'), aud('a4', 'media', 'Education reporters', 'Tell the story as a confidence gap, not a technology gap')],
      messengers: [msg('m1', 'Jennifer Flanagan', 'a-ceo', ['a3', 'a4']), msg('m2', 'Jen Spencer', 'a-vpo', ['a2']), msg('m3', 'A teacher from the AI Exchange community of practice', null, ['a1'])],
      outputs: [out('o1', 'brief', 'Ready for AI? in one page', 'out', ['a1', 'a3']), out('o2', 'posts', 'Three-post thread for Bluesky and LinkedIn', 'out', ['a4', 'a1']), out('o3', 'talk', '12-minute talk for the AI Exchange conference', 'drafting', ['a1', 'a2']), out('o4', 'module', 'Closing the confidence gap: a Teach module for educators', 'idea', ['a1'])],
      effect: { hoped: 'More educators feel ready to use AI with students; members add teacher sessions to their plans.', signs: 'The confident-educator measure moves from the 38% baseline in Ready for AI? 2027; members name teacher sessions in their CanCode plans.' },
      uptake: [up('u1', '2026-10-14', 'count', 'Brief opened from the members-only site', { n: 212, outputId: 'o1' }), up('u2', '2026-10-30', 'story', 'Example: a member program lead used the 71% / 38% slide to open a school board meeting, and was asked back to run a PD day.', { outputId: 'o1' }), up('u3', '2026-11-12', 'citation', 'Example: a partner newsletter quoted the brief and linked to it.', { outputId: 'o2' })],
      reviews: [rv('r1', '2026-09-15', 'a-research', 'Members liked the numbers but asked what to do on Monday.', 'Add one classroom activity to the brief, and plan a Teach module.', { next: '2026-12-14' })],
      nextReview: '2026-12-14',
      evidence: { sources: ['lib-pub-ready', 'lib-gov-cancode-guide'], from: 'Ready for AI? survey, 2024–25', notes: 'Check the figures against the final report before any external use.' },
      links: { plan: plan('Educators confident with AI', 'Ready for AI? 2027'), related: ['ko-adult-learning'] },
      consent: { share: 'open', holders: 'Actua (survey data held with Abacus Data)', terms: 'Public report; quote with citation', ocap: false, signedOff: null },
      tags: ['educators', 'ai literacy', 'research', 'actua publication'],
    },
    {
      id: 'ko-family-literacy', title: 'AI literacy is family and community literacy', kind: 'practice', strength: 'emerging', stage: 'reviewed', stream: 'both', ownerId: 'a-comms',
      message: 'Young people learn about AI with the adults around them, so programs that bring families in reach further and last longer than skills training alone.',
      summary: 'The framing at the heart of the AI strategy: AI literacy rooted in human agency, learned at home and in community, not only in class. Grounded in the AI literacy competencies (Long and Magerko), Actua’s tips for parents and the families pilot from the ecosystem mapping sessions.',
      audiences: [aud('a1', 'families', 'Parents and caregivers', 'Find one next step to take with their child'), aud('a2', 'policy', 'Federal and provincial policy staff', 'Fund family and community AI literacy, not only classroom training'), aud('a3', 'members', 'Member programs', 'Add a family moment to camps and clubs')],
      messengers: [msg('m1', 'Valeria Iannitti', 'a-vpd', ['a2']), msg('m2', 'Member program instructors', null, ['a1', 'a3'])],
      outputs: [out('o1', 'episode', 'Family AI night: a conversation with a parent and an instructor', 'drafting', ['a1']), out('o2', 'brief', 'Policy brief: AI literacy as family literacy', 'out', ['a2']), out('o3', 'paper', 'Practice paper for a science policy venue', 'idea', ['a2'])],
      effect: { hoped: 'Funders and policy makers name families in AI literacy programs; members run family moments.', signs: 'Policy submissions that use the framing; family moments in member plans; parent voices gathered.' },
      uptake: [up('u1', '2026-09-20', 'citation', 'The framing appears in “Reclaiming human intelligence in the Age of AI” (Canadian Science Policy Centre).'), up('u2', '2026-10-22', 'story', 'Example: two members asked for a family-night kit after reading the brief.')],
      reviews: [rv('r1', '2026-11-05', 'a-comms', 'Policy readers responded; parents did not see themselves in a policy brief.', 'Parents need their own output. Bigger than an output: the plan has no measure for family reach beyond counts.', { loop: 'double', planChange: 'Add a measure under “Families as a community of AI literacy” for families who take a next step (not only families taking part), and fund a family-night kit in the 2027 pilot.', next: '2027-02-03' })],
      nextReview: '2027-02-03',
      evidence: { sources: ['lib-pub-iannitti', 'lib-pub-parents', 'lib-ref-long', 'lib-doc-report'], from: 'AI strategy framing; ecosystem mapping sessions', notes: '' },
      links: { plan: plan('Families as a community of AI literacy', 'Shift the story from'), related: ['ko-parent-voice'] },
      consent: { share: 'open', holders: 'Actua', terms: '', ocap: false, signedOff: null },
      tags: ['families', 'ai literacy', 'systems change'],
    },
    {
      id: 'ko-pipelines-systems', title: 'From pipelines to systems: change at three tiers', kind: 'finding', strength: 'tested', stage: 'ready', stream: 'academic', ownerId: 'a-research',
      message: 'A national STEM organization changes more when it works at three tiers at once: its own practice, the norms of its network, and the policy and funding around it.',
      summary: 'From the ecosystem mapping sessions with Actua’s senior leadership, using van Wijk et al.’s micro, meso and macro levels. The pilot probe (the Family AI Literacy Tour) tests all three tiers in one limited project.',
      audiences: [aud('a1', 'researchers', 'Systems change and STEM education researchers', 'Compare with other national intermediaries'), aud('a2', 'funders', 'Foundations funding systems change', 'Fund probes across tiers, not single programs'), aud('a3', 'staff', 'Actua leadership and staff', 'Sort their work by tier and spot gaps')],
      messengers: [msg('m1', 'Research and evaluation lead', 'a-research', ['a1']), msg('m2', 'Systems change advisor (guest)', 'a-advisor', ['a2', 'a3'])],
      outputs: [out('o1', 'paper', 'Practice paper: a national intermediary maps its system', 'drafting', ['a1']), out('o2', 'poster', 'Poster: three tiers, one probe', 'idea', ['a1', 'a2']), out('o3', 'session', 'Staff session: sorting our work by tier', 'out', ['a3'])],
      effect: { hoped: 'The tour pilot is designed across all three tiers; one funder backs a cross-tier probe.', signs: 'Tour measures at each tier; a funder conversation that uses the model.' },
      uptake: [up('u1', '2026-11-19', 'decision', 'Leadership agreed the Family AI Literacy Tour will be designed as a three-tier probe.')],
      reviews: [],
      nextReview: '2027-02-15',
      evidence: { sources: ['lib-pub-pipelines', 'lib-ref-vanwijk', 'lib-ref-kania', 'lib-doc-report'], from: 'Ecosystem mapping sessions, 2026', notes: 'The report is a draft (02): check with the authors before citing.' },
      links: { plan: plan('Family AI Literacy Tour', 'Design measurement in from day one'), related: [] },
      consent: { share: 'partners', holders: 'Actua and the session facilitators', terms: 'Draft report: share with named partners until final', ocap: false, signedOff: null },
      tags: ['systems change', 'micro', 'meso', 'macro'],
    },
    {
      id: 'ko-land-based', title: 'Land-based and unplugged AI literacy', kind: 'practice', strength: 'emerging', stage: 'draft', stream: 'practice', ownerId: 'a-network',
      message: 'AI literacy can be taught on the land and without screens, when the learning is shaped with the community and its knowledge keepers.',
      summary: 'Held with InSTEM partners and the communities they work with. This object stays a draft until the holders decide what may be shared, with whom and how. Actua’s Indigenous land-based STEM discussion paper is the public starting point; what partners teach is theirs.',
      audiences: [aud('a1', 'communities', 'InSTEM partner communities', 'Decide whether and how this is shared'), aud('a2', 'members', 'Member programs working with Indigenous youth', 'Learn from it, on the communities’ terms')],
      messengers: [msg('m1', 'Community knowledge keepers, as they choose', null, ['a1', 'a2'])],
      outputs: [],
      effect: { hoped: 'Shared only as the communities want; if they choose, other programs learn from it.', signs: 'The holders’ own sense of whether it helped.' },
      uptake: [], reviews: [], nextReview: null,
      evidence: { sources: ['lib-pub-landbased'], from: 'InSTEM partners', notes: '' },
      links: { plan: plan('Land-based and unplugged AI literacy'), related: [] },
      consent: { share: 'held', holders: 'InSTEM partner communities and their knowledge keepers', terms: 'OCAP: the communities own, control, access and possess this knowledge. Nothing is shared without their sign-off.', ocap: true, signedOff: null },
      tags: ['indigenous', 'ai literacy', 'equity'],
    },
    {
      id: 'ko-ai-policy-lessons', title: 'Writing an AI use policy with instructors, not for them', kind: 'lesson', strength: 'emerging', stage: 'draft', stream: 'practice', ownerId: 'a-research',
      message: 'An AI use policy lands better when instructors and youth help write it: they know where AI already shows up in camps and clubs.',
      summary: 'Lessons as the AI use policy is drafted from the Responsibility and Ethics in AI resource. Still being shaped: the instructor and youth advisory consultation is ahead.',
      audiences: [aud('a1', 'staff', 'Actua staff and instructors', 'Help shape the policy, then use it'), aud('a2', 'members', 'Member organizations writing their own', 'Borrow the process, not just the text')],
      messengers: [msg('m1', 'Research and evaluation lead', 'a-research', ['a1', 'a2'])],
      outputs: [out('o1', 'module', 'Staff learning circle: our AI use policy', 'idea', ['a1'])],
      effect: { hoped: '', signs: '' },
      uptake: [], reviews: [], nextReview: null,
      evidence: { sources: ['lib-pub-ethics'], from: 'AI use policy workplan', notes: '' },
      links: { plan: plan('An internal AI use policy', 'Youth data, privacy and consent'), related: [] },
      consent: { share: 'internal', holders: 'Actua', terms: 'Internal until the board approves the policy', ocap: false, signedOff: null },
      tags: ['responsible ai'],
    },
    {
      id: 'ko-apple-guides', title: 'Apple’s AI teacher guides: where they fit Actua’s principles', kind: 'resource', strength: 'emerging', stage: 'draft', stream: 'practice', ownerId: 'a-ai',
      message: 'Apple’s free AI guides for teachers, made with Common Sense Media, can support educator PD if paired with Actua’s own responsible AI principles.',
      summary: 'A resource review in progress for the Apple AI resources pilot: three Teachers’ Essential Guides (AI fundamentals, creativity, STEM with a 5E model), each with a workbook. The review asks what fits, what needs adding, and which members could pilot one.',
      audiences: [aud('a1', 'educators', 'Educators in member PD', 'Use one guide with Actua’s framing'), aud('a2', 'staff', 'AI-Ready program staff', 'Decide whether to pilot')],
      messengers: [msg('m1', 'AI programs lead', 'a-ai', ['a2'])],
      outputs: [out('o1', 'session', 'Pilot workshop with two member programs', 'idea', ['a1'])],
      effect: { hoped: 'A clear yes, no or yes-with-changes on piloting.', signs: 'The pilot decision, and how the two programs found it.' },
      uptake: [], reviews: [], nextReview: '2027-03-01',
      evidence: { sources: ['lib-apple-guides', 'lib-apple-creativity'], from: 'Apple AI resources pilot', notes: '' },
      links: { plan: [...has('wp-learning-design'), ...plan('Apple AI resources pilot', 'Use Apple’s free AI teacher guides')], related: ['ko-adult-learning'] },
      consent: { share: 'internal', holders: 'Actua', terms: '', ocap: false, signedOff: null },
      tags: ['apple', 'educators'],
    },
    {
      id: 'ko-parent-voice', title: 'What parents are telling us about AI', kind: 'question', strength: 'emerging', stage: 'out', stream: 'practice', ownerId: 'a-comms',
      message: 'Parents are curious and worried in equal measure; we are still learning what they want from Actua, and sharing what we hear as we go.',
      summary: 'An open question shared to learn with others: what parents and caregivers say at registration, on the worry wall and in the Ready for AI? parent sample. Building the parent research constituency the strategy calls for.',
      audiences: [aud('a1', 'families', 'Parents and caregivers', 'Add their voice'), aud('a2', 'members', 'Member programs', 'Ask the same questions, so answers add up')],
      messengers: [msg('m1', 'Member program instructors', null, ['a1']), msg('m2', 'Senior Director, Communications', 'a-comms', ['a2'])],
      outputs: [out('o1', 'posts', '“What would you ask about AI?” prompt for families', 'out', ['a1']), out('o2', 'story', 'Story card: one parent’s question', 'drafting', ['a1', 'a2'])],
      effect: { hoped: 'Actua can say “parents are telling us…” with evidence.', signs: 'Parent voices gathered (the plan’s measure), and one consistent question across members.' },
      uptake: [up('u1', '2026-08-28', 'count', 'Parent responses at summer camp registration (example figure)', { n: 140, outputId: 'o1' })],
      reviews: [rv('r1', '2026-08-30', 'a-comms', 'Example: questions cluster on safety, homework and jobs.', 'Ask one consistent national question at every tour stop.', { next: '2026-11-20' })],
      nextReview: '2026-11-20',
      evidence: { sources: ['lib-pub-ready', 'lib-pub-parents'], from: 'Registration questions and the worry wall', notes: 'Parent responses are personal data: report only in aggregate.' },
      links: { plan: plan('Build a parent research constituency', 'Families as a community of AI literacy'), related: ['ko-family-literacy'] },
      consent: { share: 'partners', holders: 'Parents and caregivers who responded', terms: 'Aggregate only; no quotes without permission', ocap: false, signedOff: null },
      tags: ['families', 'research'],
    },
    {
      id: 'ko-adult-learning', title: 'Teacher AI PD works best as adult learning, not a lecture', kind: 'practice', strength: 'tested', stage: 'ready', stream: 'practice', ownerId: 'a-ai',
      message: 'Educators take up AI when PD starts from their own classroom, lets them try it, and gives them peers to keep going with.',
      summary: 'Learning design for AI-Ready educator PD, grounded in adult education: andragogy (start from why it matters to their work), Kolb’s cycle (a case, reflection, the idea, then trying it), Universal Design for Learning (more than one way in) and a community of practice to carry on, like the AI Exchange.',
      audiences: [aud('a1', 'staff', 'Actua and member PD designers', 'Design modules with these four beats'), aud('a2', 'educators', 'Educators in AI PD', 'Expect to try, not just listen')],
      messengers: [msg('m1', 'AI programs lead', 'a-ai', ['a1']), msg('m2', 'AI Exchange facilitators', null, ['a2'])],
      outputs: [out('o1', 'module', 'Design pattern: a four-beat AI PD module', 'drafting', ['a1']), out('o2', 'session', 'Design clinic for member PD leads', 'idea', ['a1'])],
      effect: { hoped: 'New PD modules follow the four beats; educators keep meeting after the session.', signs: 'Module reviews; AI Exchange attendance after August 2026; stories of use at three months (Kirkpatrick 3).' },
      uptake: [], reviews: [], nextReview: '2027-03-15',
      evidence: { sources: ['lib-raise-exchange', 'lib-ref-touretzky', 'lib-ref-unesco'], from: 'AI Exchange community of practice; adult education literature', notes: 'Add Knowles, Kolb and CAST (UDL) to the library before citing.' },
      links: { plan: [...has('goal-learning-design'), ...plan('Keep the AI Exchange community of practice')], related: ['ko-confidence-gap'] },
      consent: { share: 'open', holders: 'Actua', terms: '', ocap: false, signedOff: null },
      tags: ['educators', 'ai literacy'],
    },
  ];
  // Every object starts with the same dates, so the seed is the same each time.
  const doc = blankMobilize();
  doc.settings = { reviewEvery: 90, lead: 'a-research', note: 'A starting set to react to: figures come from Actua’s public reports; anything marked “Example” shows how the loop works and should be replaced with what really comes back.' };
  for (const o of objects) doc.objects[o.id] = migrateObject({ createdAt: at('2026-11-21'), updatedAt: at('2026-11-28'), ...o });
  return migrateMobilize(doc);
}
