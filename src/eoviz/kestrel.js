import { blankEco, addParsed, matchBottles } from './model.js';
import { mockFile, readFile } from './formats.js';

/**
 * Kestrel Bay's EoViz demo (stage 1): three separate partner groups, each
 * with its own sites, files and dashboard (d, 2026-11-27: separate, not one
 * shared network), read from the mock instrument files. The numbers are
 * made up.
 *
 *   Mill Creek Streamkeepers   volunteers and the school's stream class: monthly
 *                              DataStream samples, a HOBO logger, the school's
 *                              air sensor, the community gardens' soil tests
 *   RV Kestrel ocean lab       the research vessel's chemist (the lab user): the
 *                              harbour buoy sonde, the CTD cast, the rosette bottles,
 *                              and dissolved carbon from the lab
 *
 * Order of partners (d, 2026-11-27): Streamkeepers now; a shared bay network
 * next (both groups choosing 'network'); an Indigenous guardians programme after,
 * on its own terms (OCAP).
 */
export const KESTREL_PARTNERS = {
  streamkeepers: { id: 'streamkeepers', name: 'Mill Creek Streamkeepers', kind: 'volunteer', share: 'open', colour: 'green',
    about: 'Neighbours and the high school’s stream class. They sample Mill Creek monthly, keep a logger in the riffle, and run the “Swim or not?” E. coli board every summer.' },
  vessel: { id: 'vessel', name: 'RV Kestrel ocean lab', kind: 'lab', share: 'own', colour: 'blue',
    about: 'The research vessel’s chemist: CTD casts in the harbour channel, water from the rosette bottles, and dissolved organic and inorganic carbon run in the lab ashore.' },
};

const FILES = [
  // [format, file name, partner, who brought it in, when]
  ['geojson', 'kestrel-sites.geojson', 'streamkeepers', 'Ana Ruiz', '2025-09-02T14:00:00Z'],
  ['datastream', 'mill-creek-2025-datastream.csv', 'streamkeepers', 'Ana Ruiz', '2025-09-02T14:05:00Z'],
  ['hobo', 'riffle-logger-20451877.csv', 'streamkeepers', 'Mr. Okafor’s class', '2025-09-10T18:20:00Z'],
  ['openaq', 'school-sensor-openaq.json', 'streamkeepers', 'Mr. Okafor’s class', '2025-09-10T18:25:00Z'],
  ['lab-edd', 'garden-soil-results.csv', 'streamkeepers', 'Ana Ruiz', '2025-10-01T15:00:00Z'],
  ['exo', 'harbour-buoy-exo2.csv', 'vessel', 'Dr. Mireille Haché', '2025-09-05T12:00:00Z'],
  ['xle', 'upper-creek-well.xle', 'streamkeepers', 'Ana Ruiz', '2025-09-05T12:10:00Z'],
  ['cnv', 'KB25-07_hc_004.cnv', 'vessel', 'Dr. Mireille Haché', '2025-08-14T16:00:00Z'],
  ['btl', 'KB25-07_hc_004.btl', 'vessel', 'Dr. Mireille Haché', '2025-08-14T16:02:00Z'],
  ['toc', 'TOC-L_run_2025-08-19.txt', 'vessel', 'Dr. Mireille Haché', '2025-08-19T15:30:00Z'],
];

export function seedKestrelEco() {
  const doc = blankEco();
  doc.partners = structuredClone(KESTREL_PARTNERS);
  for (const [format, name, partnerId, by, at] of FILES) {
    const { parsed } = readFile(mockFile(format).text, name, format);
    if (format === 'geojson') {
      // Places only: the sites, then each partner's own.
      for (const [siteName, info] of Object.entries(parsed.sites ?? {})) {
        const id = `s-${siteName.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}`;
        doc.sites[id] = { id, name: siteName, kind: info.kind ?? 'water', geo: info.geo ?? null, note: '', tags: [], partnerId: siteName === 'Harbour buoy' ? 'vessel' : 'streamkeepers' };
      }
      continue;
    }
    if (format === 'toc') matchBottles(doc, parsed);
    addParsed(doc, parsed, { name, format, by, at, partnerId, size: Math.round(mockFile(format).text.length) });
  }
  // The vessel's station, and a held-back site (shown only inside its group).
  const channel = Object.values(doc.sites).find((s) => s.name === 'Harbour channel');
  if (channel) Object.assign(channel, { geo: { lat: 43.29, lng: -61.18, precision: 'exact' }, note: 'CTD station, cruise KB25-07, cast 4.' });
  const well = Object.values(doc.sites).find((s) => s.name === 'Upper Mill Creek well');
  if (well) Object.assign(well, { held: true, note: 'On a landowner’s field, by agreement: the place is not shown outside the group.' });
  return doc;
}
