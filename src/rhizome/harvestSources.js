/**
 * The tip harvester's source registry (alpha 0.3 PR 20): where fresh tips
 * and resources come from, one entry per source, filed under a theme.
 *
 *   { id, theme, title, author, year, kind, url?, fetch, points: [..] }
 *
 * kind     article | guide | book | course | framework | site
 * fetch    true: an online run may fetch the page (politely: robots.txt, a
 *          pause between requests to one site, a size cap). Books and pages
 *          behind sign-ins stay false.
 * points   the source's key ideas, summarised in our own words. An offline
 *          run distils candidates from these, so the harvester works with no
 *          network at all. Never paste the source's own sentences here.
 *
 * Add a source by adding an entry, then run `npm run tips:refresh` (offline)
 * or `npm run tips:refresh -- --online`. New candidates land in the review
 * queue; nothing reaches the tip library until a reviewer approves it.
 * Every entry with a url is also a "Read more" resource for its theme.
 */
export const HARVEST_REGISTRY_VERSION = '2026.11.22';

export const HARVEST_SOURCES = [
  // Network weaving
  { id: 'holley-handbook', theme: 'network', title: 'Network Weaver Handbook', author: 'June Holley', year: 2012, kind: 'book', url: 'https://networkweaver.com/', fetch: true,
    points: [
      'Map who already knows whom before planning new ties: the gaps often sit between clusters, not inside them.',
      'Close triangles: when two people you know should know each other, introduce them and step back.',
      'Spread the weaving role so the network does not depend on one well-connected person.',
      'Small, quick collaborations between a few members build trust faster than big formal projects.',
    ] },
  // Leverage points
  { id: 'meadows-leverage', theme: 'leverage', title: 'Leverage Points: Places to Intervene in a System', author: 'Donella Meadows', year: 1999, kind: 'article', url: 'https://donellameadows.org/archives/leverage-points-places-to-intervene-in-a-system/', fetch: true,
    points: [
      'Changing numbers such as budgets and targets is the easiest move and usually the weakest one.',
      'Who gets information, and when, can shift a system more than adding resources.',
      'The rules of a system, and who writes them, are a deeper place to push than the flows inside it.',
      'The goal a system serves, and the mindset behind it, are the most powerful and the hardest to change.',
    ] },
  // Water of systems change
  { id: 'fsg-water', theme: 'water', title: 'The Water of Systems Change', author: 'Kania, Kramer and Senge (FSG)', year: 2018, kind: 'guide', url: 'https://www.fsg.org/resource/water_of_systems_change/', fetch: true,
    points: [
      'Policies, practices and resource flows are the visible conditions; relationships and power dynamics sit underneath them.',
      'Mental models, the beliefs people hold about how things work, hold the other conditions in place.',
      'Ask who holds decision-making power in each condition, and who is never consulted.',
    ] },
  // Asset-based community development
  { id: 'abcd-institute', theme: 'abcd', title: 'Asset-Based Community Development Institute', author: 'DePaul University', year: null, kind: 'site', url: 'https://resources.depaul.edu/abcd-institute/', fetch: true,
    points: [
      'Start with what people, associations and institutions already bring, not with a list of needs.',
      'Local associations are often invisible in formal maps, and are among the strongest assets a place has.',
      'Ask residents about their gifts, skills and passions: a gifts conversation often finds assets nobody had mapped.',
    ] },
  { id: 'kretzmann-mcknight', theme: 'abcd', title: 'Building Communities from the Inside Out', author: 'Kretzmann and McKnight', year: 1993, kind: 'book', fetch: false,
    points: [
      'An asset map has five kinds of asset: individuals, associations, institutions, physical places and the local economy.',
      'Connecting assets to each other creates more value than bringing in outside resources alone.',
    ] },
  // SOAR
  { id: 'thin-book-soar', theme: 'soar', title: 'The Thin Book of SOAR', author: 'Stavros and Hinrichs', year: 2009, kind: 'book', fetch: false,
    points: [
      'Begin strategy with strengths and opportunities, then name aspirations and the results that would show them.',
      'Bring the people affected by the plan into the conversation: SOAR works best as a whole-system process.',
      'Turn each aspiration into at least one measurable result, or it stays a wish.',
    ] },
  // Theory of change
  { id: 'center-toc', theme: 'toc', title: 'What is Theory of Change?', author: 'Center for Theory of Change', year: null, kind: 'guide', url: 'https://www.theoryofchange.org/what-is-theory-of-change/', fetch: true,
    points: [
      'Work backwards from the long-term change to the preconditions that must hold first.',
      'Write down the assumptions behind each causal step, so they can be tested.',
      'Mark which links rest on evidence and which are bets, and test the bets the plan leans on most.',
    ] },
  // Collective impact
  { id: 'ssir-collective-impact', theme: 'impact', title: 'Collective Impact', author: 'Kania and Kramer (SSIR)', year: 2011, kind: 'article', url: 'https://ssir.org/articles/entry/collective_impact', fetch: true,
    points: [
      'Partners need a common agenda: a shared understanding of the problem and a joint approach to it.',
      'Shared measurement keeps partners honest with each other about progress.',
      'Mutually reinforcing activities beat everyone doing the same thing in parallel.',
      'A backbone organisation, with staff of its own, keeps the effort coordinated.',
    ] },
  { id: 'ci-forum', theme: 'impact', title: 'Collective Impact Forum', author: 'Collective Impact Forum', year: null, kind: 'site', url: 'https://collectiveimpactforum.org/', fetch: true,
    points: [
      'Centre equity in collective impact: the people most affected should help set the agenda.',
      'Continuous communication between partners builds the trust that shared measurement needs.',
    ] },
  // Place-based development
  { id: 'tamarack-place', theme: 'place', title: 'Tamarack Institute: community change', author: 'Tamarack Institute', year: null, kind: 'site', url: 'https://www.tamarackcommunity.ca/', fetch: true,
    points: [
      'Place-based work defines its boundary as a real place, and the people who live there help decide what changes.',
      'Bring together residents, community groups, business and government around one place, not one program.',
      'Expect place-based change to take years: plan for learning and adapting, not a single project cycle.',
      'Community engagement is a spectrum, from informing to co-deciding: name where each piece of the work sits.',
    ] },
  // Strategy hygiene
  { id: 'planning-practice', theme: 'hygiene', title: 'Everyday planning practice', author: 'Common practice', year: null, kind: 'guide', fetch: false,
    points: [
      'Every objective needs one named owner, even when many people do the work.',
      'A measure you can check monthly beats a perfect measure you check once a year.',
      'When a deadline passes, decide on purpose: close it, move it, or carry the open work forward.',
    ] },
  // AI literacy and responsible AI
  { id: 'ai4k12', theme: 'ai', title: 'AI4K12: Five Big Ideas in AI', author: 'AI4K12 Initiative', year: 2019, kind: 'framework', url: 'https://ai4k12.org/', fetch: true,
    points: [
      'Five big ideas frame AI learning: perception, representation and reasoning, learning, natural interaction, and societal impact.',
      'Learners understand AI better when they train and test a small model themselves.',
      'Talk about societal impact alongside the technical ideas, not as an add-on at the end.',
    ] },
  { id: 'unesco-ai-students', theme: 'ai', title: 'AI competency framework for students', author: 'UNESCO', year: 2024, kind: 'framework', url: 'https://www.unesco.org/en/articles/ai-competency-framework-students', fetch: true,
    points: [
      'Put human agency first: learners should know they can question and override AI.',
      'Ethics of AI is a competency to teach, not a warning label.',
      'Grow from understanding AI, to applying it, to creating with it, step by step.',
    ] },
  { id: 'elements-of-ai', theme: 'ai', title: 'Elements of AI', author: 'University of Helsinki and MinnaLearn', year: 2018, kind: 'course', url: 'https://www.elementsofai.com/', fetch: true,
    points: [
      'A free, plain-language course shows that adults with no coding background can grasp how AI works.',
      'Separating what AI can do today from science fiction helps people make better choices about it.',
    ] },
  // Curriculum design
  { id: 'wiggins-ubd', theme: 'curriculum', title: 'Understanding by Design', author: 'Wiggins and McTighe', year: 2005, kind: 'book', fetch: false,
    points: [
      'Design backwards: decide what learners should understand, then how you will know, then the activities.',
      'Plan the evidence of learning before the lesson, not after it.',
    ] },
  { id: 'csta-standards', theme: 'curriculum', title: 'CSTA K–12 Computer Science Standards', author: 'Computer Science Teachers Association', year: 2017, kind: 'framework', url: 'https://csteachers.org/k12standards/', fetch: true,
    points: [
      'Map each activity to a standard, so a pathway builds over grades instead of repeating.',
      'Computing practices, such as collaborating and testing, deserve as much space as concepts.',
    ] },
  // Equity of access
  { id: 'fnigc-ocap', theme: 'equity', title: 'The First Nations Principles of OCAP', author: 'First Nations Information Governance Centre', year: null, kind: 'framework', url: 'https://fnigc.ca/ocap-training/', fetch: true,
    points: [
      'Data about First Nations communities should be owned, controlled, accessed and possessed by those communities.',
      'Agree how data will be used and returned before collecting it, not after.',
    ] },
  { id: 'access-reach', theme: 'equity', title: 'Reach and access in outreach programs', author: 'Common practice', year: null, kind: 'guide', fetch: false,
    points: [
      'Count who is missing as carefully as who came: reach figures hide who was never invited.',
      'Remove the hidden costs of taking part, such as travel, devices and time off, before adding more programs.',
    ] },
  // Program evaluation
  { id: 'better-evaluation', theme: 'evaluation', title: 'BetterEvaluation', author: 'BetterEvaluation', year: null, kind: 'site', url: 'https://www.betterevaluation.org/', fetch: true,
    points: [
      'Decide who the evaluation is for, and what they will do with it, before choosing methods.',
      'Mix methods: numbers show how much, stories show how and why.',
      'Plan how findings will be shared back with the people who gave the data.',
    ] },
  { id: 'patton-developmental', theme: 'evaluation', title: 'Developmental Evaluation', author: 'Michael Quinn Patton', year: 2010, kind: 'book', fetch: false,
    points: [
      'In complex, changing work, evaluate to help the work adapt, not only to judge it at the end.',
      'An evaluator inside the team can feed back learning while decisions are still open.',
    ] },
];
export const harvestSourceById = Object.fromEntries(HARVEST_SOURCES.map((s) => [s.id, s]));

/** "Read more" resources: every source with a link, by theme. */
export const resourcesFor = (theme) => HARVEST_SOURCES.filter((s) => s.url && (!theme || s.theme === theme));
