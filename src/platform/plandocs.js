import { uid } from '../core/ops.js';
import { childrenOf, rootOf, liveNodeId } from './strategy.js';
import { measureFacts, seriesOf } from './data.js';

/**
 * Strategic plan documents: a designed, themable plan made from the org's
 * own strategy (mission, vision, values, objectives, goals, measures and
 * their latest data), edited in place in the Plan designer, printed or
 * saved as PDF, and published to a public web view.
 *
 * { id: 'plandocs', docs: { [id]: PlanDoc } }
 * PlanDoc {
 *   id, planId, template: 'modern' | 'bold' | 'editorial', palette (a theme id, or '' for the org's),
 *   text: { [key]: string }      words changed from what the strategy says (see textKeys)
 *   hidden: { [sectionId]: true } sections left out
 *   rich: { [key]: html }         words with formatting (bold, lists, links, colour), cleaned
 *   images: { [slot]: Image }     slot is 'cover', 'obj:<objectiveId>' or 'background'
 *   colours: [c0, c1, c2] | null  custom colours over the palette; palette may be 'doc:<id>'
 *   fonts: { head, body }         ids from FONTS
 *   background: { kind, strength } kind from BACKGROUNDS; strength 0–100
 *   cover: a COVERS id;  scale: a SCALES id
 *   siteId, status: 'draft' | 'published', publishedAt,
 *   snapshot                      the plan as it was published (what visitors see)
 *   createdAt, updatedAt
 * }
 * Image { kind: 'art' | 'url', art?, url?, credit?, license?, source? }
 *
 * Words come from the strategy until someone types over them; "Reset"
 * drops what was typed. Visitors only ever see the published snapshot, so
 * nothing else in the strategy leaves the server.
 */
export const TEMPLATES = [
  { id: 'modern', label: 'Modern', blurb: 'Clean, airy pages with a big cover picture' },
  { id: 'bold', label: 'Bold', blurb: 'Strong colour blocks and large numbers' },
  { id: 'editorial', label: 'Editorial', blurb: 'Serif headings, like a printed report' },
];

/** Colour sets made for printed pages: three colours, the paper and the ink. */
export const DOC_PALETTES = [
  { id: 'lake', label: 'Lake Superior', c: ['#1f5b8a', '#2a9d8f', '#e9a03b'], paper: '#ffffff', ink: '#16212e' },
  { id: 'prairie', label: 'Prairie dawn', c: ['#c2622d', '#e2b33c', '#5d7f3f'], paper: '#fffaf2', ink: '#2a1f16' },
  { id: 'boreal', label: 'Boreal', c: ['#24543f', '#7a9e4b', '#b8862f'], paper: '#fbfbf6', ink: '#17231c' },
  { id: 'salish', label: 'Salish sea', c: ['#0f6e7a', '#3a8fc2', '#d85f4b'], paper: '#ffffff', ink: '#11262b' },
  { id: 'aurora', label: 'Aurora', c: ['#3b2f8f', '#17a589', '#e2457b'], paper: '#ffffff', ink: '#1a1638' },
  { id: 'maple', label: 'Maple', c: ['#b3262e', '#e07a3a', '#3f6e5a'], paper: '#fffdfa', ink: '#2a1214' },
  { id: 'terracotta', label: 'Terracotta', c: ['#b4573a', '#d9a066', '#3d6b6f'], paper: '#fbf6f0', ink: '#2c1d16' },
  { id: 'sunflower', label: 'Sunflower', c: ['#e0a500', '#2f5d8c', '#c4452d'], paper: '#ffffff', ink: '#1f2430' },
  { id: 'plum', label: 'Plum', c: ['#6b2d6b', '#c06c84', '#f1a65a'], paper: '#fffafc', ink: '#2a1328' },
  { id: 'berry', label: 'Berry', c: ['#9b1d4d', '#4a5bd4', '#f2b134'], paper: '#ffffff', ink: '#220d18' },
  { id: 'moss', label: 'Moss and stone', c: ['#566b3a', '#8a8f86', '#c9973a'], paper: '#f8f7f2', ink: '#22261c' },
  { id: 'ochre', label: 'Ochre and teal', c: ['#c58b1b', '#13706b', '#8c3b2e'], paper: '#fffcf5', ink: '#1f1d16' },
  { id: 'coral', label: 'Coral', c: ['#e2604a', '#2b8a9b', '#f2c14e'], paper: '#ffffff', ink: '#232a30' },
  { id: 'slate', label: 'Slate', c: ['#3b4a5c', '#6f8aa3', '#d07a3c'], paper: '#ffffff', ink: '#1c232c' },
  { id: 'midnight', label: 'Midnight', c: ['#203a74', '#5d4bb3', '#f0b429'], paper: '#f7f8fc', ink: '#121a33' },
  { id: 'newsprint', label: 'Newsprint', c: ['#222222', '#7a7a7a', '#c0392b'], paper: '#f6f3ec', ink: '#1a1a1a' },
];
export const docPaletteById = Object.fromEntries(DOC_PALETTES.map((p) => [p.id, p]));

/** Type: system font stacks, so pages look the same on screen, in print and on the site. */
export const FONTS = [
  { id: 'rounded', label: 'Friendly', stack: "'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'sans', label: 'Clean', stack: "'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif" },
  { id: 'humanist', label: 'Humanist', stack: "'Gill Sans', 'Gill Sans MT', Optima, Candara, 'Segoe UI', sans-serif" },
  { id: 'serif', label: 'Book', stack: "Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif" },
  { id: 'didone', label: 'Elegant', stack: "Didot, 'Bodoni 72', 'Bodoni MT', 'Playfair Display', Georgia, serif" },
  { id: 'slab', label: 'Slab', stack: "Rockwell, 'Roboto Slab', 'Courier New', Georgia, serif" },
  { id: 'condensed', label: 'Condensed', stack: "'Avenir Next Condensed', 'Arial Narrow', 'Roboto Condensed', sans-serif" },
  { id: 'mono', label: 'Typewriter', stack: "'SF Mono', Menlo, Consolas, 'Courier New', monospace" },
];
export const fontById = Object.fromEntries(FONTS.map((f) => [f.id, f]));

/** What sits behind the words on inside pages. */
export const BACKGROUNDS = [
  { id: 'plain', label: 'Plain' },
  { id: 'tint', label: 'Soft tint' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'lines', label: 'Ruled' },
  { id: 'corner', label: 'Corner shape' },
  { id: 'waves', label: 'Waves' },
  { id: 'image', label: 'A picture' },
];

export const COVERS = [
  { id: 'template', label: 'As the template' },
  { id: 'full', label: 'Full-bleed picture' },
  { id: 'split', label: 'Split' },
  { id: 'band', label: 'Picture band' },
  { id: 'type', label: 'Words only' },
];

export const SCALES = [{ id: 's', label: 'Small', v: 0.92 }, { id: 'm', label: 'Medium', v: 1 }, { id: 'l', label: 'Large', v: 1.1 }];

export const SECTIONS = [
  { id: 'cover', label: 'Cover' },
  { id: 'letter', label: 'A message from us' },
  { id: 'foundations', label: 'Vision, mission and values' },
  { id: 'glance', label: 'The plan at a glance' },
  { id: 'objectives', label: 'A page for each objective' },
  { id: 'numbers', label: 'By the numbers' },
  { id: 'closing', label: 'Get in touch' },
];

export const blankPlanDocs = () => ({ id: 'plandocs', docs: {} });

export function newPlanDoc(planId, more = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('pd'), planId, template: 'modern', palette: '', text: {}, rich: {}, hidden: {}, colours: null, fonts: {}, background: { kind: 'plain', strength: 50 }, cover: 'template', scale: 'm',
    images: { cover: { kind: 'art', art: 'waves' } }, siteId: null, status: 'draft', publishedAt: null, snapshot: null,
    createdAt: now, updatedAt: now, ...more,
  };
}

/** The plan's content from the strategy and program data, as a plan document shows it. */
export function planSnapshot(strategy, data, planId, org) {
  const root = rootOf(strategy) ?? {};
  const plan = strategy.nodes[planId];
  if (!plan) return null;
  const factsOf = (m) => (data ? measureFacts(m, seriesOf(m.id, data)) : null);
  const measures = (n) => (n.measures ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit ?? '', target: m.target ?? '', facts: factsOf(m) }));
  const objectivesUnder = (id) => childrenOf(strategy, id).flatMap((n) => (n.type === 'objective' ? [n] : n.type === 'plan' ? objectivesUnder(n.id) : []));
  const workplansUnder = (id) => childrenOf(strategy, id).flatMap((n) => (n.type === 'workplan' ? [n] : workplansUnder(n.id)));
  return {
    takenAt: new Date().toISOString().slice(0, 10),
    org: { name: org?.name ?? '', contact: org?.contact ?? {}, logo: org?.logo ?? null },
    framework: { mission: root.mission ?? '', vision: root.vision ?? '', values: root.values ?? '' },
    plan: { id: plan.id, title: plan.title, start: plan.start, end: plan.end, theme: plan.theme ?? '', notes: plan.notes ?? '' },
    objectives: objectivesUnder(plan.id).map((o) => ({
      id: o.id, title: o.title, notes: o.notes ?? '', measures: measures(o),
      goals: childrenOf(strategy, o.id).filter((g) => g.type === 'goal').map((g) => ({
        id: g.id, title: g.title, notes: g.notes ?? '', measures: measures(g),
        workplans: workplansUnder(g.id).map((w) => ({ id: w.id, title: w.title, start: w.start, end: w.end })),
      })),
    })),
  };
}

const years = (p) => [p?.start, p?.end].filter(Boolean).map((d) => String(d).slice(0, 4)).filter((y, i, a) => a.indexOf(y) === i).join('–');

/** What each editable piece of text says before anyone changes it. */
export function defaultText(snap, key) {
  if (!snap) return '';
  const [kind, id, field] = key.split(':');
  const obj = (oid) => snap.objectives.find((o) => o.id === oid);
  const goal = (gid) => snap.objectives.flatMap((o) => o.goals).find((g) => g.id === gid);
  switch (kind) {
    case 'title': return snap.plan.title;
    case 'subtitle': return [snap.org.name, years(snap.plan)].filter(Boolean).join(' · ');
    case 'tagline': return snap.plan.theme || snap.framework.vision || '';
    case 'letterTitle': return 'Where we are going, together';
    case 'letter': {
      const n = snap.objectives.length;
      const g = snap.objectives.reduce((s, o) => s + o.goals.length, 0);
      return snap.plan.notes || `This plan sets out how ${snap.org.name || 'we'} will work toward our vision${years(snap.plan) ? ` from ${years(snap.plan).replace('–', ' to ')}` : ''}. It was shaped with our staff, partners and the communities we serve. It names ${n} strategic objective${n === 1 ? '' : 's'} and ${g} goal${g === 1 ? '' : 's'}, each with measures we will report on openly, so everyone can see how we are doing.`;
    }
    case 'letterSign': return `The team at ${snap.org.name || 'our organisation'}`;
    case 'vision': return snap.framework.vision;
    case 'mission': return snap.framework.mission;
    case 'values': return snap.framework.values;
    case 'glanceIntro': return 'Our objectives, and the goals that will get us there.';
    case 'numbersTitle': return 'By the numbers';
    case 'numbersIntro': return `Where things stand as of ${snap.takenAt}.`;
    case 'closingTitle': return 'Get in touch';
    case 'closing': return 'We would love to hear from you: partners, funders, neighbours and anyone who shares this vision.';
    case 'obj':
      if (field === 'title') return obj(id)?.title ?? '';
      if (field === 'intro') return obj(id)?.notes || '';
      return '';
    case 'goal':
      if (field === 'title') return goal(id)?.title ?? '';
      if (field === 'notes') return goal(id)?.notes ?? '';
      return '';
    default: return '';
  }
}

export const textOf = (pd, snap, key) => (pd.text?.[key] ?? defaultText(snap, key));

/** Measures across the plan that have data, for "By the numbers". */
export function headlineMeasures(snap, max = 6) {
  return snap.objectives.flatMap((o) => [...o.measures, ...o.goals.flatMap((g) => g.measures)]).filter((m) => m.facts).slice(0, max);
}

export function migratePlanDocs(doc, strategy = null) {
  doc.docs ??= {};
  for (const pd of Object.values(doc.docs)) {
    if (strategy?.folded && pd.planId) pd.planId = liveNodeId(strategy, pd.planId);
    pd.text ??= {};
    pd.hidden ??= {};
    pd.images ??= {};
    pd.status ??= 'draft';
    pd.rich ??= {};
  }
  return doc;
}

/** A published plan doc is on a public site. */
export const isLivePlan = (pd) => pd.status === 'published' && !!pd.snapshot;

/** A first plan document for an org's first plan; published to its first public site when `publish`. */
export function seedPlanDocs(strategy, data, org, { publish = true, art = 'hills' } = {}) {
  const doc = blankPlanDocs();
  const plan = Object.values(strategy?.nodes ?? {}).filter((n) => n.type === 'plan').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  if (!plan) return doc;
  const site = Object.values(org?.sites ?? {}).find((s) => s.visibility === 'public');
  const pd = newPlanDoc(plan.id, { images: { cover: { kind: 'art', art } } });
  if (publish && site) Object.assign(pd, { siteId: site.id, status: 'published', publishedAt: new Date().toISOString().slice(0, 10), snapshot: planSnapshot(strategy, data, plan.id, org) });
  doc.docs[pd.id] = pd;
  return doc;
}
