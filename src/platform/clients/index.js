/**
 * Client orgs: real organisations set up on a test platform of their own
 * (TEST_PLATFORM=clients), instead of the six made-up test orgs.
 *
 *   sjr.<base>       Social Justice Radio: a podcast station with its whole archive
 *   actua-ai.<base>  Strategic AI at Actua: plan, ecosystem map, bibliography and files
 *   kestrel.<base>   Kestrel Bay Community Foundation (made up, alpha 0.3): the biggest test org,
 *                    every plugin on, a busy public portal, a board site and the Social Media Integrator
 *
 * Each builder is a pure function of public sources, so the server seeds
 * the same documents every time. See docs/INTAKE.md for turning this into
 * an intake script any new client can run.
 */
import { sjrDocs } from './sjr.js';
import { actuaDocs } from './actua.js';
import { kestrelBundle } from './kestrel.js';

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

export const CLIENT_ORGS = [
  { id: 'org-sjr', slug: 'sjr', name: 'Social Justice Radio', plan: 'standard', docs: sjrDocs },
  { id: 'org-actua-ai', slug: 'actua-ai', name: 'Strategic AI at Actua', plan: 'custom', docs: actuaDocs },
  { id: 'org-kestrel', slug: 'kestrel', name: 'Kestrel Bay Community Foundation', plan: 'custom', docs: () => kestrelBundle().docs, bundle: kestrelBundle },
];
