/**
 * One Rhizome instance per org, and switching it on (Rhizome stage 1).
 *
 * Turning the plugin on starts a short set-up run that gets the instance
 * ready for the org's context. It shows as a checklist on the plugin's home
 * page, can be paused between steps, and can be run again.
 *
 *   rhizome doc { id: 'rhizome', version, profile, setup: { [step]: iso }, baseline, calibration, snapshots: [] }
 *
 * Facts and measures are worked out live from the org's documents (they're
 * cheap); the doc keeps only what must last: the context profile, when each
 * step ran, the calibration, and small snapshots to show change over time.
 */
import { buildFacts, factCounts } from './facts.js';
import { measureFacts } from './measures.js';

export const RHIZOME_VERSION = 1;

/** Themes the tip library (stage 2) is filed under; the profile picks the ones that matter here. */
export const THEMES = [
  { id: 'network', label: 'Network weaving', blurb: 'Hubs, bridges, isolates and the ties between them' },
  { id: 'leverage', label: 'Leverage points', blurb: 'Where a small shift moves a whole system (Meadows)' },
  { id: 'water', label: 'Water of systems change', blurb: 'Structural, relational and transformative conditions' },
  { id: 'abcd', label: 'Asset-based community development', blurb: 'Start from what the community already has' },
  { id: 'soar', label: 'SOAR and appreciative strategy', blurb: 'Strengths, opportunities, aspirations, results' },
  { id: 'toc', label: 'Theory of change', blurb: 'Causal bets, assumptions and evidence' },
  { id: 'impact', label: 'Collective impact', blurb: 'Shared agendas, measures and backbone work' },
  { id: 'hygiene', label: 'Strategy hygiene', blurb: 'Owners, measures, dates and work behind every goal' },
  { id: 'ai', label: 'AI literacy and responsible AI', blurb: 'Understanding, using and questioning AI' },
  { id: 'curriculum', label: 'Curriculum design', blurb: 'Learning outcomes, pathways and assessment' },
  { id: 'equity', label: 'Equity of access', blurb: 'Who is reached, who is missing, and why' },
  { id: 'evaluation', label: 'Program evaluation', blurb: 'Knowing whether it worked, and for whom' },
];
export const themeById = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export const SECTORS = [
  { id: 'foundation', label: 'Community foundation' },
  { id: 'education', label: 'Education and STEM outreach' },
  { id: 'media', label: 'Community media' },
  { id: 'nonprofit', label: 'Nonprofit or charity' },
  { id: 'network', label: 'Network or coalition' },
  { id: 'public', label: 'Public sector' },
  { id: 'other', label: 'Something else' },
];

/** Ready-made context profiles for the two pilots. */
export const CONTEXT_PRESETS = {
  kestrel: {
    sector: 'foundation',
    focus: ['Vital Signs', 'Granting', 'Community wellbeing', 'Partnerships across sectors', 'Local leadership'],
    serves: 'Everyone who calls Kestrel Bay home, a small coastal region',
    words: ['community foundation', 'Vital Signs', 'grants', 'donors', 'endowment', 'wellbeing'],
    themes: ['network', 'abcd', 'leverage', 'impact', 'hygiene'],
  },
  'actua-ai': {
    sector: 'education',
    focus: ['AI strategy', 'Curriculum creation for STEM and AI', 'Apple AI', 'CanCode', 'Educator training'],
    serves: 'Youth across Canada, with a focus on Indigenous and underrepresented youth, and the educators who teach them',
    words: ['AI literacy', 'computational thinking', 'STEM outreach', 'curriculum', 'responsible AI'],
    themes: ['ai', 'curriculum', 'equity', 'evaluation', 'toc', 'network'],
    // Actua's map links say whether they are documented or speculative; rules weigh speculative ones lower.
    weights: { speculative: 0.5 },
  },
};

export const blankRhizome = () => ({ id: 'rhizome', version: RHIZOME_VERSION, profile: null, setup: {}, baseline: null, calibration: null, snapshots: [] });

/** A first context profile, from what Dashi already knows about the org. */
export function profileFromOrg(org = {}, strategy = null) {
  const preset = CONTEXT_PRESETS[org.slug] ?? CONTEXT_PRESETS[String(org.id ?? '').replace(/^org-/, '')];
  if (preset) return structuredClone({ ...preset, weights: preset.weights ?? {} });
  const plans = Object.values(strategy?.nodes ?? {}).filter((n) => n.type === 'objective').map((n) => n.title).slice(0, 5);
  return { sector: 'nonprofit', focus: plans, serves: org.description ?? '', words: [], themes: ['network', 'hygiene', 'soar'], weights: {} };
}

/**
 * The set-up steps, in order. `stage` says when a step arrives: stage 1 steps
 * run now; the rest show on the checklist as coming next.
 */
export const SETUP_STEPS = [
  { id: 'switchOn', label: 'Switch on', blurb: 'Rhizome is on for this organisation, for the roles you chose in Organisation → Plugins.', stage: 1 },
  { id: 'profile', label: 'Context profile', blurb: 'Sector, focus, who you serve, your words and the themes that matter. This tunes everything else.', stage: 1 },
  { id: 'index', label: 'Read in your data', blurb: 'Build the fact layer from every plugin you use, work out the measures, and keep a baseline to compare against later.', stage: 1 },
  { id: 'calibrate', label: 'Calibrate', blurb: 'Set thresholds from your own data (percentiles), so “few links” means few for you.', stage: 1 },
  { id: 'packs', label: 'Pick tip packs and starter analyses', blurb: 'Match the shared library to your context. Arrives with the rules engine.', stage: 2 },
  { id: 'harvest', label: 'Context harvest (optional)', blurb: 'Search for tips and resources from your own field, into a review queue. Arrives with the tip harvester.', stage: 2, optional: true },
  { id: 'firstRun', label: 'First run', blurb: 'Run the starter analyses and show a short welcome report. Arrives with the rules engine.', stage: 2 },
];
export const STAGE_NOW = 1;
export const stepsNow = () => SETUP_STEPS.filter((s) => s.stage <= STAGE_NOW);

/** The next step to run, or null when every step available now is done. */
export const nextStep = (doc) => stepsNow().find((s) => !doc?.setup?.[s.id]) ?? null;
export const setupDone = (doc) => !nextStep(doc);

/** A small summary of the facts and measures, kept as the baseline and in snapshots. */
export function summaryOf(facts, measures, at) {
  const fc = factCounts(facts);
  return { at, entities: fc.entities, relations: fc.relations, types: fc.types, counts: { ...measures.counts } };
}

/**
 * Run one set-up step on the doc (changed in place, and returned).
 * `docs` are the org's documents and `plugins` the plugins on (for the fact layer).
 */
export function runStep(doc, stepId, { docs = {}, plugins = null, profile = null, now = new Date().toISOString() } = {}) {
  const today = now.slice(0, 10);
  if (stepId === 'switchOn') doc.setup.switchOn = now;
  else if (stepId === 'profile') {
    doc.profile = cleanProfile(profile ?? doc.profile ?? profileFromOrg(docs.org, docs.strategy));
    doc.setup.profile = now;
  } else if (stepId === 'index' || stepId === 'calibrate') {
    const facts = buildFacts(docs, { plugins });
    const m = measureFacts(facts, { today });
    if (stepId === 'index') {
      doc.baseline = summaryOf(facts, m, now);
      doc.snapshots = [doc.baseline];
      doc.setup.index = now;
    } else {
      doc.calibration = { at: now, ...m.calibration };
      doc.setup.calibrate = now;
    }
  }
  return doc;
}

/** Run every step available now, in order: what the test platform's seed does for Kestrel. */
export function runSetup(doc, opts = {}) {
  for (const s of stepsNow()) runStep(doc, s.id, opts);
  return doc;
}

/** Start the set-up again from the top (keeps the profile as a starting point). */
export function resetSetup(doc) {
  doc.setup = {};
  doc.baseline = null;
  doc.calibration = null;
  doc.snapshots = [];
  return doc;
}

/** Add a snapshot now (at most one a day, the last 24 kept). */
export function snapshot(doc, facts, measures, now = new Date().toISOString()) {
  const s = summaryOf(facts, measures, now);
  const list = (doc.snapshots ?? []).filter((x) => x.at.slice(0, 10) !== now.slice(0, 10));
  doc.snapshots = [...list, s].slice(-24);
  return s;
}

/** What changed since the baseline: { key: delta } for each count that moved. */
export function sinceBaseline(doc, measures) {
  const base = doc?.baseline?.counts;
  if (!base) return {};
  const out = {};
  for (const [k, v] of Object.entries(measures.counts)) if (base[k] != null && base[k] !== v) out[k] = v - base[k];
  return out;
}

const list = (v, n = 12) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
export function cleanProfile(p = {}) {
  return {
    sector: SECTORS.some((s) => s.id === p.sector) ? p.sector : 'other',
    focus: list(p.focus),
    serves: String(p.serves ?? '').slice(0, 400),
    words: list(p.words, 24),
    themes: list(p.themes, 12).filter((t) => themeById[t]),
    weights: { speculative: Math.min(1, Math.max(0, Number(p.weights?.speculative ?? 1))) },
  };
}

/** Seed an instance for a test org with the set-up already run (the client platform's Kestrel). */
export function seedRhizome(docs, { now = '2026-11-22T12:00:00.000Z' } = {}) {
  const mapContents = Object.fromEntries(Object.keys(docs).filter((k) => k.startsWith('map/')).map((k) => [k.slice(4), docs[k]]));
  const all = { ...docs, mapContents };
  return runSetup(blankRhizome(), { docs: all, now, profile: profileFromOrg(docs.org, docs.strategy) });
}
