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
 *   coverFilter: a COVER_FILTERS id (how the cover photo is toned)
 *   layout: [id]                  the order of pages: SECTIONS ids and area ids (alpha 0.3)
 *   areas: { [id]: Area }         pages you add: text, picture, data or story (see AREA_KINDS)
 *   starter                       the STARTERS id it was last set up from
 *   siteId, status: 'draft' | 'published', publishedAt,
 *   release                       the latest published version: { version, at, by, design, snapshot }
 *   releases: [{ version, at, by }]  earlier versions, newest first
 *   snapshot                      the plan as it was published (kept for older readers; = release.snapshot)
 *   createdAt, updatedAt
 * }
 * Image { kind: 'art' | 'url', art?, url?, credit?, license?, source?, photoId? }
 * Area  { id, kind: 'text' | 'image' | 'data' | 'story', style, measureIds?, stories? }
 *       Its words are text keys 'area:<id>:<field>', its pictures image slots 'area:<id>:<n>'.
 *
 * Publishing (alpha 0.3) freezes the design and the plan together as a
 * release. Public sites, the PDF download and links everywhere show the
 * latest release, so you can keep designing without visitors seeing
 * half-done pages, and publish again when it's ready.
 *
 * Words come from the strategy until someone types over them; "Reset"
 * drops what was typed. Visitors only ever see the published snapshot, so
 * nothing else in the strategy leaves the server.
 */
export const TEMPLATES = [
  { id: 'modern', label: 'Modern', blurb: 'Clean, airy pages with a big cover picture' },
  { id: 'bold', label: 'Bold', blurb: 'Strong colour blocks and large numbers' },
  { id: 'editorial', label: 'Editorial', blurb: 'Serif headings, like a printed report' },
  { id: 'magazine', label: 'Magazine', blurb: 'Huge headlines, two columns, room for photos' },
  { id: 'nature', label: 'Field guide', blurb: 'Warm paper, rounded photos, a calm outdoor feel' },
  { id: 'minimal', label: 'Minimal', blurb: 'Ink and fine rules, colour only where it counts' },
  { id: 'brief', label: 'Brief', blurb: 'Compact pages with a header band, for funders and boards' },
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
  { id: 'frame', label: 'Framed photo' },
  { id: 'circle', label: 'Circle' },
  { id: 'poster', label: 'Poster' },
  { id: 'stripe', label: 'Colour stripe' },
  { id: 'mosaic', label: 'Photo mosaic' },
];

/** How the cover photo is toned (art is drawn in the doc's colours already). */
export const COVER_FILTERS = [
  { id: 'none', label: 'As it is' },
  { id: 'duotone', label: 'Duotone' },
  { id: 'soft', label: 'Soft' },
  { id: 'mono', label: 'Black and white' },
];

/**
 * Pages you can add between the standard sections (the content-area editor).
 * Each has a few styles; every one fits on one page.
 */
export const AREA_KINDS = [
  { id: 'text', label: 'Text', icon: 'textAa', blurb: 'A page of words: a heading and a few paragraphs', styles: [{ id: 'page', label: 'Page' }, { id: 'columns', label: 'Two columns' }, { id: 'quote', label: 'Big quote' }] },
  { id: 'image', label: 'Picture', icon: 'image', blurb: 'A photo or two, with a caption', styles: [{ id: 'full', label: 'Full page' }, { id: 'caption', label: 'With words' }, { id: 'pair', label: 'Two photos' }] },
  { id: 'data', label: 'Data', icon: 'chart', blurb: 'Measures from the plan, as big numbers or bars', styles: [{ id: 'big', label: 'Big numbers' }, { id: 'bars', label: 'Bars' }] },
  { id: 'story', label: 'Story', icon: 'story', blurb: 'Story cards from Assets: a title, a few words and a picture', styles: [{ id: 'cards', label: 'Cards' }, { id: 'feature', label: 'Feature' }] },
];
export const areaKindById = Object.fromEntries(AREA_KINDS.map((k) => [k.id, k]));
export const MAX_AREA_STORIES = 3;
export const MAX_AREA_MEASURES = 6;

/** What a new area says before anyone types. */
const AREA_WORDS = {
  text: { kicker: 'In focus', title: 'A new page', body: 'Write what this page is about. Select words to make them bold, add a list or a link.', quote: '' },
  image: { title: 'A picture of our work', caption: 'Say what we see here, and who is in it (with their permission).' },
  data: { kicker: 'Our numbers', title: 'How we are doing', intro: 'A few of the measures we report on.' },
  story: { kicker: 'Stories', title: 'Stories from the community', intro: '' },
};
export const areaTextKeys = (kind) => Object.keys(AREA_WORDS[kind] ?? {});

/**
 * A new area, with its words filled in (into pd.text) so it reads well from
 * the start. Returns { area, text }.
 */
export function newArea(kind, { style, measureIds, stories } = {}) {
  const k = areaKindById[kind] ?? AREA_KINDS[0];
  const area = { id: uid('area'), kind: k.id, style: style ?? k.styles[0].id };
  if (k.id === 'data') area.measureIds = measureIds ?? [];
  if (k.id === 'story') area.stories = stories ?? [];
  const text = {};
  for (const [f, v] of Object.entries(AREA_WORDS[k.id])) if (v) text[`area:${area.id}:${f}`] = v;
  return { area, text };
}

/** The pages in order: the saved layout, with any section or area it doesn't name put back where it belongs. */
export function layoutOf(pd) {
  const std = SECTIONS.map((s) => s.id);
  const areas = Object.keys(pd.areas ?? {});
  const known = new Set([...std, ...areas]);
  const out = (pd.layout ?? []).filter((id, i, a) => known.has(id) && a.indexOf(id) === i);
  for (const id of std) {
    if (out.includes(id)) continue;
    // A standard section missing from the layout goes after the section before it.
    const before = std.slice(0, std.indexOf(id)).reverse().find((x) => out.includes(x));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  }
  for (const id of areas) if (!out.includes(id)) out.splice(Math.max(0, out.indexOf('closing')), 0, id);
  return out;
}

/** Every measure in the plan (objectives' and goals'), for data areas. */
export const allMeasures = (snap) => (snap?.objectives ?? []).flatMap((o) => [...o.measures, ...o.goals.flatMap((g) => g.measures)]);

/**
 * Doc starters: a whole document set up in one click (which sections show,
 * the pages to add, a template and a cover). Words already typed are kept.
 * `areas` are [kind, style] pairs, put before `before` (a section id).
 */
export const STARTERS = [
  { id: 'plan', kicker: 'Strategic plan', label: 'Strategic plan', blurb: 'Every section: the full plan, cover to contact', template: 'modern', cover: 'template', show: ['cover', 'letter', 'foundations', 'glance', 'objectives', 'numbers', 'closing'], areas: [] },
  { id: 'onepager', kicker: 'Plan on a page', label: 'Plan on a page', blurb: 'The plan at a glance and the numbers, nothing else', template: 'brief', cover: 'template', show: ['glance', 'numbers'], areas: [] },
  { id: 'annual', kicker: 'Annual report', label: 'Annual report', blurb: 'A letter, stories, pictures and the year in numbers', template: 'magazine', cover: 'full', photo: 'john-lee-omne', show: ['cover', 'letter', 'numbers', 'closing'], areas: [['story', 'feature', 'numbers'], ['image', 'caption', 'numbers'], ['data', 'bars', 'closing']] },
  { id: 'funder', kicker: 'Funder brief', label: 'Funder brief', blurb: 'Foundations, objectives and measures, compact', template: 'brief', cover: 'stripe', show: ['cover', 'foundations', 'objectives', 'numbers', 'closing'], areas: [['data', 'big', 'closing']] },
  { id: 'community', kicker: 'Community update', label: 'Community update', blurb: 'Stories and photos first, the plan in brief', template: 'nature', cover: 'frame', photo: 'nicole-gaffney-j9vx', show: ['cover', 'glance', 'closing'], areas: [['story', 'cards', 'glance'], ['image', 'pair', 'glance'], ['text', 'quote', 'closing']] },
  { id: 'board', kicker: 'Board pack', label: 'Board pack', blurb: 'Plain pages for directors: goals, measures, progress', template: 'minimal', cover: 'type', show: ['cover', 'glance', 'objectives', 'numbers'], areas: [['text', 'columns', 'glance']] },
];
export const starterById = Object.fromEntries(STARTERS.map((s) => [s.id, s]));

/**
 * Set a plan doc up from a starter: a patch to apply (template, cover,
 * hidden, layout, areas, text). Areas this starter made last time are
 * replaced; areas you added yourself stay.
 */
export function applyStarter(pd, starterId, { photo = null } = {}) {
  const st = starterById[starterId];
  if (!st) return {};
  const hidden = Object.fromEntries(SECTIONS.filter((s) => !st.show.includes(s.id)).map((s) => [s.id, true]));
  const areas = Object.fromEntries(Object.entries(pd.areas ?? {}).filter(([, a]) => !a.starter));
  const text = { ...pd.text };
  const layout = SECTIONS.map((s) => s.id).concat(Object.keys(areas));
  for (const [kind, style, before] of st.areas) {
    const { area, text: words } = newArea(kind, { style });
    area.starter = st.id;
    areas[area.id] = area;
    Object.assign(text, words);
    const at = layout.indexOf(before);
    layout.splice(at < 0 ? layout.length : at, 0, area.id);
  }
  // The cover's small heading follows the starter, unless someone wrote their own.
  if (!text.coverKicker || STARTERS.some((x) => x.kicker === text.coverKicker)) text.coverKicker = st.kicker;
  if (text.coverKicker === 'Strategic plan') delete text.coverKicker;
  const images = { ...pd.images };
  if (photo) images.cover = photo;
  return { starter: st.id, template: st.template, cover: st.cover, hidden, areas, layout, text, images };
}

/* ---------- Releases: what's published ---------- */

/** The design fields a release freezes. */
export const DESIGN_KEYS = ['template', 'palette', 'text', 'rich', 'hidden', 'images', 'colours', 'paper', 'fonts', 'background', 'cover', 'coverFilter', 'scale', 'layout', 'areas'];
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
export const designOf = (pd) => Object.fromEntries(DESIGN_KEYS.filter((k) => pd[k] !== undefined).map((k) => [k, clone(pd[k])]));
const sameSnap = (a, b) => JSON.stringify({ ...a, takenAt: 0 }) === JSON.stringify({ ...b, takenAt: 0 });

/** A new release of the doc as it is now: a patch to apply (release, releases, snapshot, status, publishedAt). */
export function releasePatch(pd, snap, by = null) {
  const at = new Date().toISOString();
  const version = (pd.release?.version ?? 0) + 1;
  const release = { version, at, by, design: designOf(pd), snapshot: clone(snap) };
  const releases = [{ version, at, by }, ...(pd.releases ?? []).filter((r) => r.version !== version)].slice(0, 12);
  return { release, releases, snapshot: release.snapshot, status: 'published', publishedAt: at.slice(0, 10) };
}

/** Has anything changed since the latest release (the design, or the plan and its numbers)? */
export function unreleased(pd, snap) {
  if (!pd.release) return true;
  return JSON.stringify(designOf(pd)) !== JSON.stringify(pd.release.design) || (snap && !sameSnap(snap, pd.release.snapshot));
}

/** The plan doc as visitors see it: the latest release's design and snapshot (older docs: as saved). */
export function publishedDoc(pd) {
  if (!pd?.release) return pd;
  return { ...pd, ...clone(pd.release.design), snapshot: pd.release.snapshot, publishedAt: pd.release.at?.slice(0, 10) ?? pd.publishedAt };
}

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
    images: { cover: { kind: 'art', art: 'waves' } }, coverFilter: 'none', layout: null, areas: {}, siteId: null, status: 'draft', publishedAt: null, snapshot: null,
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
    case 'coverKicker': return 'Strategic plan';
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
    pd.areas ??= {};
    // Published before releases (alpha 0.3): what was live becomes release 1, so nothing changes for visitors.
    if (pd.status === 'published' && pd.snapshot && !pd.release) {
      const at = pd.publishedAt ? `${pd.publishedAt}T12:00:00.000Z` : new Date().toISOString();
      pd.release = { version: 1, at, by: null, design: designOf(pd), snapshot: pd.snapshot };
      pd.releases = [{ version: 1, at, by: null }];
    }
  }
  return doc;
}

/** A published plan doc is on a public site. */
export const isLivePlan = (pd) => pd.status === 'published' && !!(pd.release?.snapshot ?? pd.snapshot);

/** A first plan document for an org's first plan; published to its first public site when `publish`. */
export function seedPlanDocs(strategy, data, org, { publish = true, art = 'hills' } = {}) {
  const doc = blankPlanDocs();
  const plan = Object.values(strategy?.nodes ?? {}).filter((n) => n.type === 'plan').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  if (!plan) return doc;
  const site = Object.values(org?.sites ?? {}).find((s) => s.visibility === 'public');
  const pd = newPlanDoc(plan.id, { images: { cover: { kind: 'art', art } } });
  if (publish && site) Object.assign(pd, { siteId: site.id }, releasePatch(pd, planSnapshot(strategy, data, plan.id, org)));
  doc.docs[pd.id] = pd;
  return doc;
}
