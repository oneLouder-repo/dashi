/**
 * Rhizome's built-in tip library (Rhizome stage 2): short tips in plain
 * words, each filed under a theme, with where the idea comes from. A rule
 * names a tip; the engine fills in its {placeholders} from what matched:
 *
 *   {name} {map} {zone} {from} {to} {rel} {count} {items} {value} {label}
 *
 * The tip harvester (a later stage) adds reviewed packs alongside these, and
 * an org's own tips sit apart from both, so a refresh never touches them.
 * Tips here are our own summaries: sources are named, never copied.
 */
export const TIP_PACK_VERSION = '2026.11';

export const SOURCES = {
  meadows: 'Donella Meadows, “Leverage Points: Places to Intervene in a System” (1999)',
  water: 'Kania, Kramer and Senge, “The Water of Systems Change” (FSG, 2018)',
  abcd: 'Kretzmann and McKnight, “Building Communities from the Inside Out” (1993)',
  holley: 'June Holley, “Network Weaver Handbook” (2012)',
  soar: 'Stavros and Hinrichs, “The Thin Book of SOAR” (2009)',
  toc: 'Weiss, “Nothing as Practical as Good Theory” (1995), and the theory of change practice that followed',
  impact: 'Kania and Kramer, “Collective Impact” (Stanford Social Innovation Review, 2011)',
  place: 'Tamarack Institute, place-based approaches to community change (tamarackcommunity.ca), with Kretzmann and McKnight’s asset maps',
  hygiene: 'Everyday planning practice: every goal needs an owner, a measure, a date and work behind it',
};

export const TIPS = [
  // Network weaving
  { id: 'net-bridge', theme: 'network', source: 'holley', text: '{name} is the only way between parts of {map}. If they step back, those parts lose touch. Introduce the people on either side to each other, so the bridge isn’t a single plank.' },
  { id: 'net-hub', theme: 'network', source: 'holley', text: '{name} is one of your most connected actors ({value} links). Hubs spread news fast, but a lot rests on one door: ask them who else should be in the room, and share the load.' },
  { id: 'net-isolates', theme: 'network', source: 'holley', text: '{count} actors on your maps aren’t linked to anyone yet: {items}. Either the links are missing from the map, or these are relationships waiting to be made. A short call each is often enough to find out which.' },
  { id: 'net-weave', theme: 'network', source: 'holley', text: 'On {map}, {label} have actors in them but no links between them. Weaving one tie across that gap (a shared meeting, a joint project) can change how the whole system talks.' },
  { id: 'net-reciprocity', theme: 'network', source: 'holley', text: '{count} resource flows run one way only, for example {items}. Relationships that only take wear thin. Look for what could flow back: recognition, data, a seat at the table.' },
  { id: 'net-hub-unplanned', theme: 'impact', source: 'impact', text: '{name} is one of your best connected partners, but no plan, workplan or studio idea leans on them. A partner this central could carry part of the work.' },
  // Leverage and power
  { id: 'lev-gatekeeper', theme: 'leverage', source: 'meadows', text: '{name} is a gatekeeper you barely touch ({value} links). Gatekeepers shape the rules of the system (leverage point 5): a closer relationship here can do more than many smaller ones elsewhere.' },
  { id: 'lev-problem-central', theme: 'leverage', source: 'meadows', text: '{name} is marked as a problem maker, yet sits on many of the shortest paths in {map}. Where a problem sits in the middle of the flows, changing those flows (leverage point 6) may matter more than pushing back directly.' },
  { id: 'water-power', theme: 'water', source: 'water', text: 'Power flows one way in {count} places, for example {items}. Power dynamics are one of the six conditions of systems change: who decides, and who is never asked?' },
  { id: 'water-zone', theme: 'water', source: 'water', text: 'Nobody on {map} sits in {label}. If that part of the lens matters to your change, the map (or the work) has a blind spot there.' },
  // Equity
  { id: 'eq-community-thin', theme: 'equity', source: 'abcd', text: '{name} is a community actor with only {value} link. The people closest to the issue are often the least connected to the decisions: who could open a door for them?' },
  // Strategy hygiene
  { id: 'hyg-hollow-objective', theme: 'hygiene', source: 'hygiene', text: '“{name}” has no workplan anywhere under it. An objective with no work behind it is a hope, not a plan yet.' },
  { id: 'hyg-hollow-goal', theme: 'hygiene', source: 'hygiene', text: 'The goal “{name}” has no workplan under it. Who will do something about it, and by when?' },
  { id: 'hyg-unstaffed', theme: 'hygiene', source: 'hygiene', text: '{count} workplans have nobody named on them: {items}. Work with no owner tends to wait.' },
  { id: 'hyg-overdue', theme: 'hygiene', source: 'hygiene', text: '“{name}” ended {value} days ago with tasks still open. Close it, move its end date, or carry the open tasks into what comes next.' },
  { id: 'hyg-blocked', theme: 'hygiene', source: 'hygiene', text: '“{name}” has {value} blocked tasks. Blocked work is often waiting on one decision or one person: name it.' },
  { id: 'hyg-no-measure', theme: 'hygiene', source: 'hygiene', text: 'The objective “{name}” has no measure. How will you know it’s working? Even one rough indicator helps.' },
  // ABCD
  { id: 'abcd-unused', theme: 'abcd', source: 'abcd', text: '{count} assets aren’t used by any plan, workplan or studio idea, for example {items}. Asset-based work starts from what’s already there: which of these could carry part of a goal?' },
  { id: 'abcd-thin', theme: 'abcd', source: 'abcd', text: 'You have few {label} assets ({value}) compared with your other types. That may be a gap in the community, or in what’s been mapped: a walk-about or a gifts conversation often finds more.' },
  // SOAR
  { id: 'soar-loose', theme: 'soar', source: 'soar', text: '{count} SOAR ideas were never patched into a goal or objective, for example {items}. Either they’ve been set aside on purpose, or the plan is missing something people cared about.' },
  { id: 'soar-strengths', theme: 'soar', source: 'soar', text: 'The strength “{name}” isn’t wired into anything in the plan. Appreciative strategy builds from strengths: what goal could this one carry?' },
  // Place-based development
  { id: 'place-unplaced', theme: 'place', source: 'place', text: '{count} actors and assets have no place on the map yet, for example {items}. Place-based work starts from where things really are: placing them shows which neighbourhoods are rich in assets and which are left out.' },
  // Theory of change
  { id: 'toc-untested', theme: 'toc', source: 'toc', text: '{count} links in your theory of change are untested, for example {items}. Pick the one the plan leans on most and look for evidence, from research or your own data.' },
];
export const tipById = Object.fromEntries(TIPS.map((t) => [t.id, t]));

/** Fill a tip's placeholders. Missing values drop out cleanly. */
export function fillTip(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null || vars[k] === '' ? '' : String(vars[k])))
    .replace(/\s+([,.:])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}
