/**
 * Kestrel Bay on the map (Place stage 1). Kestrel Bay Community Foundation
 * is made up, and so is its bay: a drawn coast, two islands, a salt marsh,
 * a river and four roads, out in the Atlantic where it never sits on a real
 * town. Its places reuse the names Kestrel's own data already uses (Kestrel
 * Point, Birch Cove, Cove Road, Wharf Street); the rest are new and clearly
 * fictional.
 *
 * Pins are matched by name at seed time (actor and library ids are made
 * fresh each seed), so every copy of an actor (one per ecosystem map) is
 * pinned to the same spot, and episodes by their fixed ids.
 *
 * Drawn in kilometres from the mouth of the bay, then turned into degrees.
 */
import { migratePlace, PLACE_VERSION } from './model.js';

const ORIGIN = { lat: 43.3, lng: -61.2 };
const KM_LAT = 111.0;
const KM_LNG = 111.32 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
/** [x km east, y km north] → [lng, lat]. */
export const kmToLngLat = ([x, y]) => [r5(ORIGIN.lng + x / KM_LNG), r5(ORIGIN.lat + y / KM_LAT)];
const pt = (x, y) => { const [lng, lat] = kmToLngLat([x, y]); return { lat, lng }; };
const ring = (pts) => { const r = pts.map(kmToLngLat); return [...r, r[0]]; };
const poly = (pts) => ({ type: 'Polygon', coordinates: [ring(pts)] });
const line = (pts) => ({ type: 'LineString', coordinates: pts.map(kmToLngLat) });
const feature = (layer, name, geometry) => ({ type: 'Feature', properties: { layer, name }, geometry });

/** The mainland's south coast, west to east, round the bay. */
const COAST = [
  [-45, 3], [-38, 1.5], [-30, 2.5], [-24, 0.5], [-19, 1.2], [-15.5, -0.8], [-13, -2.5], [-11.2, -4.8], [-10.2, -6.2], [-9.0, -6.0],
  [-8.2, -4.6], [-7.4, -2.6], [-6.6, -0.6], [-6.0, 1.6], [-5.6, 3.8], [-5.0, 5.6], [-4.4, 7.0], [-3.4, 8.2], [-2.2, 8.9], [-1.0, 9.6],
  [0.2, 9.8], [1.4, 9.5], [2.6, 8.8], [3.6, 7.6], [4.4, 6.0], [4.9, 4.2], [5.3, 2.4], [5.9, 0.6], [6.8, -1.0], [8.0, -2.4],
  [9.3, -3.6], [10.6, -4.6], [11.6, -4.4], [12.2, -3.4], [13.6, -2.0], [16, -0.8], [20, 0.2], [26, -0.5], [33, 1.0], [45, 0.5],
];

const AREAS = {
  'kestrel-bay': [[-12, -7], [13, -6], [14, 6], [10, 16], [-2, 18], [-10, 16], [-13, 4]],
  'kestrel-harbour': [[-0.6, 9.9], [1.6, 9.7], [2.8, 10.6], [2.6, 12.2], [1.0, 12.6], [-0.6, 11.8]],
  'birch-cove': [[5.6, 1.4], [7.6, 1.4], [8.0, 4.0], [7.2, 5.4], [4.8, 5.2], [5.1, 3.4]],
  'gannet-point': [[-11, -4.6], [-9.6, -6.0], [-8.4, -5.2], [-7.6, -3.0], [-9.4, -2.4], [-11.6, -3.0]],
  millbrook: [[-7.6, 13.2], [-4.6, 13.0], [-4.2, 15.4], [-6.0, 16.4], [-7.9, 15.6]],
  'north-shore': [[6.0, 8.2], [12.5, 7.6], [13.5, 13.0], [9.0, 15.0], [5.8, 12.6]],
  'saltmarsh-flats': [[-4.4, 7.2], [-3.4, 8.3], [-2.2, 9.0], [-1.0, 9.7], [-1.2, 10.4], [-2.6, 10.2], [-4.0, 9.2], [-4.8, 8.0]],
  'heron-island': [[-0.6, 3.0], [0.2, 2.5], [1.3, 2.9], [1.5, 3.8], [0.7, 4.5], [-0.3, 4.2]],
};

/** The drawn base map: land, islands, the marsh, the river and the roads. */
export function kestrelDrawing() {
  return {
    type: 'FeatureCollection',
    features: [
      feature('land', 'Mainland', poly([...COAST, [45, 45], [-45, 45]])),
      feature('island', 'Heron Island', poly(AREAS['heron-island'])),
      feature('island', 'Tern Ledge', poly([[1.8, -7.3], [2.8, -7.6], [3.4, -7.0], [2.7, -6.5], [2.0, -6.7]])),
      feature('marsh', 'Saltmarsh Flats', poly(AREAS['saltmarsh-flats'])),
      feature('river', 'Millbrook River', line([[-2.0, 9.4], [-3.0, 10.8], [-4.4, 12.4], [-5.6, 13.8], [-6.6, 15.4], [-8.0, 17.6], [-10, 21]])),
      feature('road', 'Shore Road', line([[-9.6, -4.4], [-8.0, -2.2], [-7.0, 0.4], [-6.4, 3.6], [-5.4, 6.6], [-3.8, 9.6], [-1.8, 10.6], [0.6, 10.6], [2.6, 10.2], [4.4, 8.4], [5.6, 6.0], [6.2, 3.8], [6.8, 1.0], [8.4, -1.6], [10.6, -3.4]])),
      feature('road', 'Ridge Road', line([[0.8, 10.6], [1.0, 12.8], [1.4, 15.5], [1.6, 20], [2.5, 30]])),
      feature('road', 'Millbrook Road', line([[-1.8, 10.6], [-3.6, 12.2], [-6.0, 14.4], [-8.5, 17], [-12, 22]])),
      feature('road', 'Cove Road', line([[6.2, 3.8], [7.6, 5.4], [9, 9], [9.4, 11]])),
    ],
  };
}

/** [id, name, kind, [x, y] km, within, description, tags] */
const PLACES = [
  ['kestrel-bay', 'Kestrel Bay', 'region', [0, 6], null, 'The whole bay and the communities round it: everyone the foundation serves.', ['watershed']],
  ['kestrel-harbour', 'Kestrel Harbour', 'community', [1.0, 11.1], 'kestrel-bay', 'The town at the head of the bay: council, library, the main street and most services.', ['town']],
  ['wharf-street', 'Wharf Street', 'site', [0.6, 10.15], 'kestrel-harbour', 'The main street down to the harbour: shops, the credit union, the arts council and the night market.', ['main street']],
  ['bay-health', 'Bay Health Centre', 'site', [2.3, 11.7], 'kestrel-harbour', 'The regional health authority’s clinic for the whole bay.', ['health']],
  ['birch-cove', 'Birch Cove', 'neighbourhood', [6.3, 3.6], 'kestrel-bay', 'The east shore: older homes, a strong seniors’ network and the food hub.', ['east shore']],
  ['cove-road-hall', 'Cove Road hall', 'site', [6.7, 4.4], 'birch-cove', 'The community hall that came back to life: meals, meetings and fiddle nights.', ['hall']],
  ['gannet-point', 'Gannet Point', 'community', [-9.3, -4.3], 'kestrel-bay', 'A fishing village on the west headland, home of the fisheries co-operative.', ['fishing']],
  ['kestrel-point', 'Kestrel Point', 'community', [10.8, -3.5], 'kestrel-bay', 'The east headland. More and more of its houses are short-term rentals.', ['housing']],
  ['millbrook', 'Millbrook', 'community', [-6.0, 14.5], 'kestrel-bay', 'An inland village up the river, with the regional school.', ['inland']],
  ['north-shore', 'North Shore (First Nation lands)', 'community', [9.4, 11.2], 'kestrel-bay', 'A placeholder for a First Nation’s lands. With a real organisation, name and outline this place with the Nation itself.', ['First Nation']],
  ['saltmarsh-flats', 'Saltmarsh Flats', 'landmark', [-2.8, 9.4], 'kestrel-bay', 'The salt marsh at the head of the bay: birds, flood protection and a boardwalk.', ['nature']],
  ['heron-island', 'Heron Island', 'landmark', [0.45, 3.5], 'kestrel-bay', 'An island in the bay, on the old paddling routes.', ['nature', 'water']],
  ['ridge-road', 'Ridge Road lands', 'site', [1.3, 15.4], 'kestrel-bay', 'Farmland up Ridge Road, where a developer wants to build.', ['housing', 'land']],
];

/** Actors by their name on the maps: [place, own spot (km) or null, places served]. */
const ACTORS = {
  'Municipal councils': ['kestrel-harbour', [0.95, 11.0], ['kestrel-bay']],
  'Provincial ministries': ['kestrel-bay', null, ['kestrel-bay']],
  'Federal community programs': ['kestrel-bay', null, []],
  'Donors and fundholders': ['kestrel-bay', null, []],
  'Fisheries co-operative': ['gannet-point', [-8.8, -4.9], ['gannet-point', 'kestrel-point']],
  'University extension office': ['kestrel-harbour', [1.6, 11.35], []],
  'Faith communities': ['birch-cove', [6.0, 4.0], ['birch-cove']],
  Libraries: ['kestrel-harbour', [0.2, 11.25], ['kestrel-harbour', 'millbrook']],
  'Community groups and charities': ['cove-road-hall', null, ['birch-cove']],
  'Regional health authority': ['bay-health', null, ['kestrel-bay']],
  'Arts council': ['wharf-street', [0.45, 10.25], []],
  'Seniors associations': ['birch-cove', [6.6, 3.0], ['birch-cove', 'millbrook']],
  'Local media': ['kestrel-harbour', [1.3, 10.6], []],
  'Schools and school board': ['millbrook', [-5.7, 14.2], ['kestrel-bay']],
  'Food bank network': ['birch-cove', [5.9, 2.6], ['birch-cove', 'gannet-point', 'millbrook']],
  'Youth councils': ['millbrook', [-6.4, 14.85], []],
  'Local businesses': ['wharf-street', [0.75, 10.05], []],
  'Newcomer settlement agency': ['kestrel-harbour', [0.35, 10.7], ['kestrel-bay']],
  Developers: ['ridge-road', null, []],
  'Vacation-rental platforms': ['kestrel-point', null, []],
  'First Nations governments': ['north-shore', null, ['north-shore']],
  'Credit union': ['wharf-street', [0.95, 10.2], ['kestrel-bay']],
};

/** Episodes (stories of a place) by id, and library items by title: [place, own spot or null, note]. */
const EPISODES = {
  'ep-kestrel-0-0': ['cove-road-hall', null, 'The hall’s comeback, told by the people who did it'],
  'ep-kestrel-0-4': ['gannet-point', [-9.0, -4.55], null],
  'ep-kestrel-0-7': ['birch-cove', [5.75, 2.85], null],
  'ep-kestrel-0-10': ['wharf-street', [0.55, 9.98], null],
  'ep-kestrel-0-13': ['kestrel-harbour', [0.05, 11.4], null],
  'ep-kestrel-0-14': ['north-shore', [9.0, 10.6], null],
  'ep-kestrel-0-16': ['kestrel-harbour', [1.2, 10.0], null],
  'ep-kestrel-0-19': ['millbrook', [-5.5, 14.0], null],
  'ep-kestrel-0-24': ['heron-island', null, 'The old routes pass the island'],
  'ep-kestrel-0-25': ['wharf-street', [0.85, 9.95], null],
  'ep-kestrel-0-27': ['birch-cove', [6.9, 3.25], null],
  'ep-kestrel-0-29': ['gannet-point', [-8.6, -4.7], null],
  'ep-kestrel-1-0': ['cove-road-hall', [6.85, 4.55], null],
  'ep-kestrel-1-3': ['birch-cove', [6.2, 3.3], null],
  'ep-kestrel-0-23': ['ridge-road', [1.5, 15.6], null],
};
const LIBRARY = {
  'The rural housing squeeze': ['kestrel-point', [10.6, -3.3], 'Kestrel Point is the bay’s sharpest case'],
  'Food security in coastal towns': ['birch-cove', null, null],
  'Housing data snapshot': ['kestrel-bay', null, null],
  'Vital Signs 2025 report': ['kestrel-bay', null, null],
  'Youth panel handbook': ['millbrook', null, null],
};

/** Kestrel's place document, built against the rest of its seeded documents. */
export function seedKestrelPlace(docs) {
  const places = {};
  for (const [id, name, kind, xy, within, description, tags] of PLACES) {
    places[id] = { id, name, kind, geo: pt(...xy), within, description, tags, ...(AREAS[id] ? { area: poly(AREAS[id]) } : {}) };
  }
  const pins = {};
  const pin = (key, [placeId, spot, serves], note = null) => {
    pins[key] = { placeId, ...(spot ? pt(...spot) : {}), ...(serves?.length ? { serves } : {}), ...(note ? { note } : {}) };
  };
  for (const [k, d] of Object.entries(docs)) {
    if (!k.startsWith('map/')) continue;
    const mapId = k.slice(4);
    for (const a of Object.values(d.actors ?? {})) if (ACTORS[a.label]) pin(`actor:${mapId}/${a.id}`, ACTORS[a.label]);
  }
  for (const [id, [placeId, spot, note]] of Object.entries(EPISODES)) if (docs.podcasts?.episodes?.[id]) pin(`episode:${id}`, [placeId, spot, []], note);
  for (const item of Object.values(docs.library?.items ?? {})) {
    const title = item.meta?.title ?? item.title;
    const hit = LIBRARY[title];
    if (hit) pin(`library:${item.id}`, [hit[0], hit[1], []], hit[2]);
  }
  return migratePlace({
    version: PLACE_VERSION,
    basemap: 'drawn',
    // No saved view: the map opens fitted to every place.
    view: null,
    places, pins, drawn: kestrelDrawing(),
  });
}
