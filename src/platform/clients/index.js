/**
 * Client orgs: real organisations set up on a test platform of their own
 * (TEST_PLATFORM=clients), instead of the six made-up test orgs.
 *
 *   sjr.<base>       Social Justice Radio: a podcast station with its whole archive
 *   actua-ai.<base>  Strategic AI at Actua: plan, ecosystem map, bibliography and files
 *   kestrel.<base>   Kestrel Bay Community Foundation (made up, alpha 0.3): the biggest test org,
 *                    every plugin on, a busy public portal, a board site and the Social Media Integrator
 *   tamarack.<base>  Tamarack Institute (alpha client): the ecosystem surfer, its Networks for Change on a map of Canada
 *
 * Each builder is a pure function of public sources, so the server seeds
 * the same documents every time. See docs/INTAKE.md for turning this into
 * an intake script any new client can run.
 */
import { sjrDocs } from './sjr.js';
import { addKestrelStories, kestrelCommunityDoc } from './kestrelStories.js';
import { migrateAssets, blankAssets } from '../assetHub.js';
import { seedPlanDocs } from '../plandocs.js';
import { actuaDocs } from './actua.js';
import { kestrelBundle } from './kestrel.js';
import { tamarackDocs } from './tamarack.js';
import { seedKestrelEco } from '../../eoviz/kestrel.js';

/**
 * A fresh start for testing (0.2, PR 9): when this mark changes, the client
 * test platform puts these documents back to their seeded versions on its
 * next start (after saving a copy in the data folder's backups), or empties
 * the collections named in `clear`. Bump it in
 * a PR that should start clean; restarts within a PR keep your work.
 * Only the client test platform (npm run clients) does this, never a hosted server.
 */
export const CLIENT_RESET = {
  mark: 'a03-pr8',
  // Whole documents put back to their seeded versions.
  docs: {},
  // Collections emptied inside a document, keeping the rest (alpha 0.3 PR 8: a blank theory of change in every client org, SOAR and Assemble kept).
  clear: Object.fromEntries(['org-sjr', 'org-actua-ai', 'org-kestrel'].map((id) => [id, { studio: ['toc', 'tocLinks'] }])),
};

/**
 * Top-ups: small additions to client orgs that are already set up, made once
 * each (kept in platform_docs 'clients-topups'), without resetting anything.
 * `run(read)` gets the org's documents by name and returns the ones to write.
 */
export const CLIENT_TOPUPS = [
  { id: 'a03-plandoc-stories', org: 'org-kestrel', label: 'story cards and a community update', run: (read) => {
    const assets = addKestrelStories(migrateAssets(read('assets') ?? blankAssets()));
    const out = { assets };
    const strategy = read('strategy');
    const plandocs = read('plandocs');
    // No plan documents yet: the designer makes the first one when it opens; just add the community update beside it.
    const docs = plandocs ?? (strategy ? seedPlanDocs(strategy, read('data'), read('org')) : null);
    if (docs && !docs.docs?.['pd-kestrel-community']) {
      const update = kestrelCommunityDoc(strategy, read('data'), read('org'), assets);
      if (update) { docs.docs[update.id] = update; out.plandocs = docs; }
    }
    return out;
  } },
  // EoViz stage 1 (alpha 0.4): Kestrel's two partners and their files, for a Kestrel set up before EoViz.
  { id: 'a04-eoviz', org: 'org-kestrel', label: 'EoViz demo data', run: (read) => {
    const eco = read('eco');
    const org = read('org');
    const out = {};
    if (!eco || !Object.keys(eco.sites ?? {}).length) out.eco = seedKestrelEco();
    if (org && org.plugins?.eoviz == null) out.org = { ...org, plugins: { ...(org.plugins ?? {}), eoviz: true } };
    return out;
  } },
];

export const CLIENT_ORGS = [
  { id: 'org-sjr', slug: 'sjr', name: 'Social Justice Radio', plan: 'standard', docs: sjrDocs },
  { id: 'org-actua-ai', slug: 'actua-ai', name: 'Strategic AI at Actua', plan: 'custom', docs: actuaDocs },
  { id: 'org-kestrel', slug: 'kestrel', name: 'Kestrel Bay Community Foundation', plan: 'custom', docs: () => kestrelBundle().docs, bundle: kestrelBundle },
  { id: 'org-tamarack', slug: 'tamarack', name: 'Tamarack Institute', plan: 'custom', docs: tamarackDocs },
];
