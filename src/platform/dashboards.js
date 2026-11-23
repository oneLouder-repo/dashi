import { uid } from '../core/ops.js';
import { measuresUnder, rootOf, childrenOf, descendants, liveNodeId } from './strategy.js';
import { dataMonths, measureFacts } from './data.js';
import { seedGrants } from './reportTrack.js';

/**
 * Dashboards, made in the Workbench and published to sites.
 * { id, dashboards: { [id]: Dashboard } }
 *
 * Dashboard {
 *   title, description,
 *   visibility: 'private' | 'public',   public ones show on their site
 *   siteId,                             which org site publishes it
 *   sourceNodeId,                       the objective or goal it was made from, if any
 *   createdBy,                          staff id of whoever made it
 *   widgets: [Widget],
 * }
 * Widget { id, type, size: 'small' | 'wide', title?, text?, measureId?, nodeId? }
 *   kpi       latest value of a measure against its target
 *   line      a measure over time, with its target
 *   bar       a measure month by month
 *   progress  task status under a strategy node
 *   road      the plan's road: traffic lights passed and ahead (strategic data on a public page)
 *   lights    one row per goal under a node, with a light per workplan and how far along it is
 *   milestones  the next milestones under a node, as a short list
 *   text      a heading and paragraph
 * Add a widget type in charts/widgets.js and list it in WIDGET_TYPES.
 *
 * The same document holds the Workbench's other public pieces, which
 * publish the same way (visibility and siteId):
 *
 * Calculator { title, intro, budget (what the work costs a year, in dollars),
 *              outcomes: [{ id, measureId, label, budget?, perYear? }], amounts: [dollars],
 *              visibility, siteId }
 *   "A gift of $50 means 3 more youth in a program": each outcome's cost is
 *   its budget (or the calculator's) over how many the measure counts in a
 *   year (perYear overrides the count from the data).
 * Story { title, summary, visibility, siteId,
 *         steps: [{ id, heading, text, chart: 'kpi' | 'line' | 'bar' | null, measureId?, audio? }] }
 *   A scrolling data story; audio is { mediaId | url, name } and plays from a Listen button.
 * forms    feedback forms (see feedback.js); reports  funder reports (see funderReports.js)
 */
import { seedForms } from './feedback.js';
export const WIDGET_TYPES = [
  { id: 'kpi', label: 'Headline number', needs: 'measure', size: 'small' },
  { id: 'line', label: 'Line over time', needs: 'measure', size: 'wide' },
  { id: 'bar', label: 'Monthly columns', needs: 'measure', size: 'wide' },
  { id: 'compare', label: 'Compare measures', needs: 'measures', size: 'full' },
  { id: 'progress', label: 'Work progress', needs: 'node', size: 'wide' },
  { id: 'road', label: 'The road so far', needs: 'plan', size: 'full' },
  { id: 'lights', label: 'Goal lights', needs: 'node', size: 'wide' },
  { id: 'milestones', label: 'Next milestones', needs: 'node', size: 'small' },
  { id: 'text', label: 'Text', needs: null, size: 'wide' },
];

export const widget = (type, more = {}) => ({
  id: uid('w'),
  type,
  size: WIDGET_TYPES.find((t) => t.id === type)?.size ?? 'wide',
  ...more,
});

/**
 * Build a dashboard for a strategic objective or goal: an introduction,
 * then a headline number and a line chart for every measure on it and
 * beneath it, then the progress of the work that serves it.
 */
export function dashboardFromNode(strategy, nodeId, createdBy = null) {
  const node = strategy.nodes[nodeId];
  const measures = measuresUnder(strategy, nodeId);
  const goals = childrenOf(strategy, nodeId).filter((n) => n.type === 'goal').map((g) => g.title);
  const intro = node.notes || (goals.length ? `How we are doing on ${goals.length === 1 ? 'our goal' : `${goals.length} goals`}: ${goals.join('; ')}.` : `Progress on ${node.title.toLowerCase()}.`);
  return {
    title: node.title,
    description: `Live from our program data. Part of ${rootOf(strategy)?.title ?? 'our strategy'}.`,
    visibility: 'private',
    siteId: null,
    sourceNodeId: nodeId,
    createdBy,
    widgets: [
      widget('text', { title: node.title, text: intro }),
      ...measures.map((m) => widget('kpi', { measureId: m.id })),
      ...measures.map((m) => widget('line', { measureId: m.id })),
      descendants(strategy, nodeId).some((n) => n.type === 'task') && widget('progress', { nodeId, title: 'The work behind it' }),
    ].filter(Boolean),
  };
}

/** The months a dashboard's player steps through. */
export function dashboardMonths(dash, data) {
  const ids = dash.widgets.flatMap((w) => [w.measureId, ...(w.measureIds ?? [])]).filter(Boolean)
    .flatMap((id) => (data.calcs?.[id] ? (data.calcs[id].expr.match(/\{([^}]+)\}/g) ?? []).map((t) => t.slice(1, -1)) : [id]));
  return dataMonths(data, ids.length ? ids : undefined);
}

/** Example dashboards: one public dashboard per example org. */
export function seedDashboards(strategy) {
  const examples = [
    { objectiveId: 'obj-equity', id: 'dash-equity', title: 'Reach and equity', siteId: 'site-impact', createdBy: 's-eval' },
    { objectiveId: 'obj-meals', id: 'dash-meals', title: 'Meals and good food boxes', siteId: 'site-main', createdBy: 'r-lead' },
  ];
  const dashboards = {};
  for (const ex of examples) {
    if (!strategy.nodes[ex.objectiveId]) continue;
    dashboards[ex.id] = { ...dashboardFromNode(strategy, ex.objectiveId, ex.createdBy), id: ex.id, title: ex.title, visibility: 'public', siteId: ex.siteId };
  }
  Object.assign(dashboards, boardDashboards(strategy));
  return { id: 'dashboards', dashboards, ...seedExtras(strategy) };
}

/**
 * A strategy scorecard for any org: the road of the plan that holds the most
 * work, up to four headline numbers, the goal lights of the plan running
 * today, what is coming up, and the tasks. Good for a board pack.
 */
export function scorecardDashboard(strategy, createdBy = null, today = new Date().toISOString().slice(0, 10)) {
  const plans = Object.values(strategy.nodes).filter((n) => n.type === 'plan');
  const root = rootOf(strategy);
  const master = root?.type === 'plan' ? root : childrenOf(strategy, root?.id).find((n) => n.type === 'plan') ?? plans[0];
  const current = plans.find((n) => n !== master && n.start && n.end && n.start <= today && today <= n.end) ?? master;
  const from = master?.id ?? root?.id;
  const measures = from ? measuresUnder(strategy, from).slice(0, 4) : [];
  const widgets = [];
  if (master) widgets.push(widget('road', { nodeId: master.id, title: 'The road so far' }));
  for (const m of measures) widgets.push(widget('kpi', { measureId: m.id }));
  if (current) {
    widgets.push(widget('lights', { nodeId: current.id, title: `Goals in ${current.title}` }));
    widgets.push(widget('milestones', { nodeId: master.id, title: 'Coming up', size: 'wide' }));
    widgets.push(widget('progress', { nodeId: current.id, title: 'Tasks', size: 'full' }));
  }
  return { title: 'Strategy scorecard', description: 'Where the plan stands: live from the roadmap and our program data.', visibility: 'private', siteId: null, sourceNodeId: master?.id ?? null, createdBy, widgets };
}

/**
 * The board dashboard: one page for a board meeting. A short welcome, the
 * headline numbers, how they have moved together, the goal lights and the
 * road, what is coming up, and a note of what the board is asked to decide.
 * It goes on the members-only portal when there is one.
 */
export function boardDashboard(strategy, createdBy = null, { sites = {}, today = new Date().toISOString().slice(0, 10) } = {}) {
  const base = scorecardDashboard(strategy, createdBy, today);
  const plans = Object.values(strategy.nodes).filter((n) => n.type === 'plan');
  const master = strategy.nodes[base.sourceNodeId] ?? plans[0];
  const current = plans.find((n) => n !== master && n.start && n.end && n.start <= today && today <= n.end) ?? master;
  const measures = base.sourceNodeId ? measuresUnder(strategy, base.sourceNodeId).slice(0, 4) : [];
  const portal = Object.values(sites).find((x) => x.visibility === 'private');
  const widgets = [
    widget('text', { title: 'For the board', size: 'full', text: `Where ${master?.title ?? 'the plan'} stands this month, live from the roadmap and our program data. The numbers update on their own; the notes below are ours.` }),
    ...measures.map((m) => widget('kpi', { measureId: m.id })),
  ];
  if (measures.length > 1) widgets.push(widget('compare', { measureIds: measures.map((m) => m.id), title: 'How the numbers moved together' }));
  if (current) widgets.push(widget('lights', { nodeId: current.id, title: `Goals in ${current.title}` }));
  if (master) widgets.push(widget('milestones', { nodeId: master.id, title: 'Coming up' }));
  if (master) widgets.push(widget('road', { nodeId: master.id, title: 'The road so far' }));
  widgets.push(widget('text', { title: 'What we ask of the board', size: 'full', text: 'To decide: the decisions for this meeting.\nFor advice: where the board’s view would help.\nFor information: what the board should know.' }));
  return { title: 'Board dashboard', description: 'One page for the board meeting: the headline numbers, the goal lights, what is next, and what we ask of the board.', visibility: 'private', siteId: portal?.id ?? null, sourceNodeId: master?.id ?? null, createdBy, widgets };
}

/** The STEM example's board scorecard: the road, the headline numbers, the goal lights, and what is next. */
function boardDashboards(strategy) {
  const plan = Object.values(strategy.nodes).find((n) => n.type === 'plan' && n.start && n.end && n.start <= '2026-11-15' && '2026-11-15' <= n.end) ?? Object.values(strategy.nodes).find((n) => n.type === 'plan');
  if (!plan || !strategy.nodes['obj-equity']) return {};
  // The road runs across every plan in the framework; the lights follow the plan running today.
  const root = rootOf(strategy);
  const master = root?.type === 'framework' && childrenOf(strategy, root.id).filter((n) => n.type === 'plan').length < 2 ? childrenOf(strategy, root.id).find((n) => n.type === 'plan') : root;
  return {
    'dash-board': {
      id: 'dash-board', title: 'Board scorecard', description: 'Where the strategic plan stands, for the board pack: live from the roadmap and our program data.',
      visibility: 'private', siteId: 'site-board', sourceNodeId: master?.id ?? plan.id, createdBy: 's-ed',
      widgets: [
        widget('road', { nodeId: master?.id ?? plan.id, title: 'The road so far' }),
        widget('kpi', { measureId: 'm-reach' }), widget('kpi', { measureId: 'm-equity' }), widget('kpi', { measureId: 'm-trained' }), widget('kpi', { measureId: 'm-partners' }),
        widget('lights', { nodeId: plan.id, title: `Goals in ${plan.title}` }),
        widget('milestones', { nodeId: master?.id ?? plan.id, title: 'Coming up', size: 'wide' }),
        widget('progress', { nodeId: plan.id, title: 'Tasks this year', size: 'full' }),
      ],
    },
  };
}

export const STORY_CHARTS = [
  { id: '', label: 'No chart' },
  { id: 'kpi', label: 'Headline number' },
  { id: 'line', label: 'Line over time' },
  { id: 'bar', label: 'Monthly columns' },
];

/**
 * How many a measure counts in a year, from its data: a monthly rate
 * times twelve, a yearly count as it is, a running total's growth over the
 * last year, otherwise the latest value. Null for percentages.
 */
export function yearlyCount(measure, series) {
  const f = measure && measureFacts(measure, series);
  const unit = measure?.unit ?? '';
  if (!f || unit.startsWith('%')) return null;
  const pts = series.points;
  if (/\/\s*mo/.test(unit)) return pts.slice(-12).reduce((t, p) => t + p.value, 0) * (12 / Math.min(12, pts.length));
  if (/\/\s*y/.test(unit)) return f.value;
  const before = pts.at(-13);
  const rising = pts.every((p, i) => !i || p.value >= pts[i - 1].value);
  if (rising && before && f.value > before.value) return f.value - before.value;
  return f.value;
}

/** Each outcome of a calculator with its yearly count and cost of one. */
export function calculatorRates(calc, index, data) {
  return calc.outcomes.map((o) => {
    const m = index[o.measureId];
    const fromData = m ? yearlyCount(m, data.series[o.measureId]) : null;
    const perYear = o.perYear > 0 ? o.perYear : fromData;
    const budget = o.budget > 0 ? o.budget : calc.budget;
    return { ...o, measure: m, fromData, perYear, budget, costOfOne: perYear > 0 && budget > 0 ? budget / perYear : null };
  }).filter((o) => o.measure);
}

/** The measures a calculator or story reads, for publishing just those. */
export const measuresOf = (item) => [...(item.outcomes ?? []), ...(item.steps ?? [])].map((x) => x.measureId).filter(Boolean);

export const blankCalculator = (siteId = null) => ({
  title: 'What your gift does', intro: 'Slide to see what a gift makes possible.', budget: 0,
  outcomes: [], amounts: [25, 50, 100, 250], visibility: 'private', siteId,
});
export const blankStory = (siteId = null) => ({ title: 'Untitled story', summary: '', visibility: 'private', siteId, steps: [] });

/** Example calculators and stories for the example orgs. */
function seedExtras(strategy) {
  const has = (id) => Object.values(strategy.nodes).some((n) => n.measures?.some((m) => m.id === id));
  const calculators = {};
  const stories = {};
  if (has('m-reach')) {
    calculators['calc-reach'] = {
      id: 'calc-reach', title: 'What your gift does', budget: 9200000, amounts: [25, 50, 100, 250, 1000], visibility: 'public', siteId: 'site-impact',
      intro: 'Our network runs hands-on STEM programs in every province and territory. Slide to see what a gift makes possible, worked out from what our programs cost and who they reached last year.',
      outcomes: [
        { id: 'o-reach', measureId: 'm-reach', label: 'more young people in a hands-on STEM program' },
      ],
    };
    stories['story-reach'] = {
      id: 'story-reach', title: 'A year of reaching more young people', visibility: 'public', siteId: 'site-impact',
      summary: 'How our network grew its reach, and who it is reaching, in four steps.',
      steps: [
        { id: 'st-1', heading: 'More young people than ever', chart: 'line', measureId: 'm-reach',
          text: 'Over the last year our members ran camps, clubs and classroom workshops for close to half a million young people. That is up by almost half in eighteen months.' },
        has('m-equity') && { id: 'st-2', heading: 'Reaching the youth who are most often left out', chart: 'line', measureId: 'm-equity',
          text: 'More than half of them now come from equity-deserving groups: Indigenous, Black and racialized youth, youth with disabilities and youth in rural and remote places.',
          audio: { url: 'media/podcasts/stem-voices-1.mp3', name: 'From STEM Voices, episode 1' } },
        has('m-girls') && { id: 'st-3', heading: 'Closing the gender gap', chart: 'bar', measureId: 'm-girls',
          text: 'Girls and gender-diverse youth are close to half of everyone in our programs, after girls-only clubs and new mentors in twelve communities.' },
        has('m-trained') && { id: 'st-4', heading: 'The instructors behind it', chart: 'kpi', measureId: 'm-trained',
          text: 'None of it works without the people who teach. 690 instructors have now trained in culturally responsive practice, most of them this year.' },
      ].filter(Boolean),
    };
  }
  if (has('m-meals')) {
    calculators['calc-meals'] = {
      id: 'calc-meals', title: 'What your gift shares', budget: 150000, amounts: [10, 25, 50, 100], visibility: 'public', siteId: 'site-main',
      intro: 'Slide to see how far a gift goes at our tables and in good food boxes.',
      outcomes: [
        { id: 'o-meals', measureId: 'm-meals', label: 'more meals shared at a community table' },
        has('m-boxes') && { id: 'o-boxes', measureId: 'm-boxes', label: 'more good food boxes for a family', budget: 36000 },
      ].filter(Boolean),
    };
  }
  return { calculators, stories };
}

/** Bring an older dashboards document up to the current shape. */
export function migrateDashboards(doc, strategy = null, org = null) {
  if (!doc.calculators || !doc.stories) {
    const extras = strategy ? seedExtras(strategy) : { calculators: {}, stories: {} };
    doc.calculators ??= extras.calculators;
    doc.stories ??= extras.stories;
  }
  // Feedback forms and funder reports arrived in alpha.6; the examples get starter forms and a board scorecard.
  if (!doc.forms) doc.forms = org?.id === 'org-example' ? seedForms(org) : {};
  doc.reports ??= {};
  // Funding report tracks arrived in 0.4.1; the Kestrel Bay test org gets three example grants.
  doc.grants ??= {};
  if (strategy && org?.id === 'org-kestrel' && !doc.grantsSeeded && !Object.keys(doc.grants).length) {
    doc.grants = seedGrants(strategy, undefined, Object.keys(org.staff ?? {})[0] ?? null);
    doc.grantsSeeded = true;
  }
  // An early alpha.6 copy put the example's numbers form on the main site, which has no dashboards.
  if (org?.id === 'org-example' && doc.forms['form-numbers']?.siteId === 'site-main' && org.sites?.['site-impact']) doc.forms['form-numbers'].siteId = 'site-impact';
  if (strategy && org?.id === 'org-example' && !doc.dashboards['dash-board']) Object.assign(doc.dashboards, boardDashboards(strategy));
  return doc;
}

/**
 * Dashboards that pointed at a plan since folded into another (a yearly
 * plan inside a long-range one, see flattenPlans) point at where it went.
 * Returns true when something changed.
 */
export function refoldDashboards(doc, strategy) {
  if (!strategy?.folded) return false;
  let changed = false;
  const live = (id) => { const to = liveNodeId(strategy, id); if (to !== id) changed = true; return to; };
  for (const d of Object.values(doc.dashboards ?? {})) {
    if (d.sourceNodeId) d.sourceNodeId = live(d.sourceNodeId);
    for (const w of d.widgets ?? []) if (w.nodeId) w.nodeId = live(w.nodeId);
  }
  return changed;
}
