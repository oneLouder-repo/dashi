/**
 * One place to load every document of the open org, so plugins can read
 * each other's data: the strategy can show map actors as assets,
 * dashboards read strategy measures and program data, the public site
 * reads all of them.
 *
 * Example orgs get example data; any other org starts empty.
 */
import { loadOrSeed, saveDoc, activeOrg } from './storage.js';
import './session.js';
import { setLinkOrg } from '../plugins.js';
import { blankOrg, migrateOrg } from './org.js';
import { migrateStrategy, measureIndex } from './strategy.js';
import { blankStrategy } from './strategySeed.js';
import { seedData } from './data.js';
import { seedDashboards, migrateDashboards, refoldDashboards } from './dashboards.js';
import { blankPodcasts, migratePodcasts } from './podcasts.js';
import { loadPages as loadPagesFor } from './pages.js';
import { loadMapIndex, loadAllMaps } from './maps.js';
import { SEEDS } from './seeds.js';
import { blankStudio, migrateStudio, seedStudio } from './studio.js';
import { blankLibrary, migrateLibrary } from './library.js';
import { addBoardDocs } from './boardSeed.js';
import { migratePlanDocs, seedPlanDocs } from './plandocs.js';
import { blankAssets, migrateAssets } from './assetHub.js';
import { defaultGraphSettings } from './graph.js';
import { blankSocial, migrateSocial } from './social.js';
import { blankRhizome } from '../rhizome/setup.js';
import { blankTeach } from '../learning/cartridge.js';
import { withTriageTeach, withTriageLearn, withStreamDemo } from '../learning/triage.js';
import { blankLearn } from '../learning/records.js';
import { blankPlace, migratePlace } from '../place/model.js';
import { blankEco, migrateEco } from '../eoviz/model.js';
import { blankMobilize, migrateMobilize } from '../mobilize/model.js';

const seedFor = (doc) => SEEDS[activeOrg()]?.[doc];

export const loadOrg = () => {
  const org = migrateOrg(loadOrSeed('org', seedFor('org') ?? (() => blankOrg({ id: activeOrg(), name: 'New org' }))));
  setLinkOrg(org);
  return org;
};
export const loadStrategy = () => migrateStrategy(loadOrSeed('strategy', seedFor('strategy') ?? blankStrategy));
export const loadData = () => loadOrSeed('data', () => seedData(Object.keys(measureIndex(loadStrategy()))));
// Example orgs get the example calculators and stories when an older document has none.
export function loadDashboards() {
  const doc = loadOrSeed('dashboards', () => seedDashboards(loadStrategy()));
  const refolded = refoldDashboards(doc, loadStrategy());
  if (doc.calculators && doc.stories && doc.forms && doc.reports && doc.grants && (activeOrg() !== 'org-example' || (doc.dashboards['dash-board'] && doc.forms['form-numbers']?.siteId !== 'site-main'))) {
    if (refolded) saveDoc('dashboards', doc, undefined, { quiet: true });
    return doc;
  }
  migrateDashboards(doc, seedFor('strategy') ? loadStrategy() : null, loadOrg());
  saveDoc('dashboards', doc, undefined, { quiet: true });
  return doc;
}
export const loadPodcasts = () => migratePodcasts(loadOrSeed('podcasts', seedFor('podcasts') ?? blankPodcasts));
export const loadPages = () => loadPagesFor(activeOrg());
export const loadStudio = () => migrateStudio(loadOrSeed('studio', () => (seedFor('strategy') ? seedStudio(loadStrategy(), { staff: Object.keys(loadOrg().staff) }) : blankStudio())), loadStrategy());
export const loadMaps = () => loadMapIndex(seedFor('maps'));
/** The library. The STEM example's board documents are added to older copies that lack them. */
export function loadLibrary() {
  const lib = migrateLibrary(loadOrSeed('library', seedFor('library') ?? blankLibrary));
  if (addBoardDocs(lib, activeOrg())) saveDoc('library', lib, undefined, { quiet: true });
  return lib;
}
export const loadAssets = () => migrateAssets(loadOrSeed('assets', blankAssets));
/** The asset graph's settings: which vocabularies it speaks, and what it takes in. */
export const loadGraphSettings = () => ({ ...defaultGraphSettings(), ...loadOrSeed('graph', defaultGraphSettings) });

/** The Social Media Integrator's posts and channels (alpha 0.3). */
/** Rhizome's instance for this org: its context profile, set-up and baseline (Rhizome stage 1). */
export const loadRhizome = () => ({ ...blankRhizome(), ...loadOrSeed('rhizome', blankRhizome) });
/** Teach's cartridges and Learn's learner records (eLearning stages 1 and 2). */
/** Teach and Learn. Kestrel Bay gets the NPO Triage pack once, also on a saved document from before it existed. */
const triageFor = (org) => org?.id === 'org-kestrel';
export const loadTeach = () => { const d = { ...blankTeach(), ...loadOrSeed('teach', blankTeach) }; const org = loadOrg(); return triageFor(org) ? withStreamDemo(withTriageTeach(d, org)) : d; };
export const loadLearn = () => { const d = { ...blankLearn(), ...loadOrSeed('learn', blankLearn) }; const org = loadOrg(); return triageFor(org) ? withTriageLearn(d, loadTeach(), org) : d; };
/** Place's places and pins for this org (Place stage 1). */
export const loadPlace = () => migratePlace(loadOrSeed('place', blankPlace));
/** EoViz's sites, readings and files (EoViz stage 1). */
export const loadEco = () => migrateEco(loadOrSeed('eco', blankEco));
export const loadMobilize = () => migrateMobilize(loadOrSeed('mobilize', blankMobilize));
export const loadSocial = () => migrateSocial(loadOrSeed('social', blankSocial));

/** Plan documents. Every org with a plan starts with a draft of one; example orgs publish it to their public site. */
export const loadPlanDocs = () => migratePlanDocs(loadOrSeed('plandocs', () => seedPlanDocs(loadStrategy(), loadData(), loadOrg(), { publish: !!seedFor('strategy') })), loadStrategy());

export function loadAll() {
  const maps = loadMaps();
  return {
    org: loadOrg(),
    strategy: loadStrategy(),
    data: loadData(),
    dashboards: loadDashboards(),
    maps,
    mapContents: loadAllMaps(maps),
    podcasts: loadPodcasts(),
    pages: loadPages(),
    studio: loadStudio(),
    library: loadLibrary(),
    assets: loadAssets(),
    plandocs: loadPlanDocs(),
  };
}

export { saveDoc };
