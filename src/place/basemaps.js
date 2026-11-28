/**
 * Place's base maps (Place stage 1). MapLibre GL draws them; every overlay
 * (outlines, links, pins) goes on top, the same whichever base is chosen.
 *
 *   street  OpenStreetMap's raster tiles. Fine while we build; the free
 *           OpenStreetMap servers aren't for real traffic, so go-live
 *           (alpha 0.4) points STREET_TILES at our own tile host.
 *   drawn   the org's own drawn map (land, marsh, rivers, roads) as GeoJSON
 *           in the place document. Works offline. Kestrel Bay is made up,
 *           so it has one, out at sea where it never sits on a real town.
 *           `drawn` can also be the address of a shared GeoJSON file served
 *           by Dashi, such as CANADA_MAP (provinces, neighbours, lakes).
 *   blank   no base at all, just the overlays on a plain ground.
 *
 * Text on the map is HTML (markers), never map glyphs, so nothing needs a
 * font server either.
 */
export const STREET_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
export const STREET_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
/** Where the street map's tiles come from, for the server's Content-Security-Policy (connect-src). */
export const TILE_ORIGINS = [...new Set(STREET_TILES.map((u) => new URL(u.replace(/\{[a-z]\}/g, '0')).origin))];

/** Canada's provinces and territories, from Natural Earth (vendor/geo/README.md), for orgs that work across the country. */
export const CANADA_MAP = 'vendor/geo/canada.json';

export const BASEMAPS = [
  { id: 'street', label: 'Street map', sub: 'OpenStreetMap, needs the internet', icon: 'globe' },
  { id: 'drawn', label: 'Drawn map', sub: 'Your own drawn coast and roads, works offline', icon: 'brush' },
  { id: 'blank', label: 'No base map', sub: 'Just your places and links', icon: 'tiles' },
];

/** Colours for the drawn and blank bases, in light and dark. */
export const GROUND = {
  light: { water: '#d4e6ec', land: '#f6f2e7', shore: '#8fa3ab', marsh: '#dcebcf', river: '#9ccbdc', road: '#ffffff', casing: '#c9c1ad', blank: '#eef0f3' },
  dark: { water: '#1b2a33', land: '#2a2d33', shore: '#56656d', marsh: '#2f3d2f', river: '#2f5a6a', road: '#4a4e57', casing: '#1e2025', blank: '#1d1f24' },
};

/** A MapLibre style for one base map. `drawn` is the place document's drawn GeoJSON. */
export function baseStyle(id, { drawn = null, dark = false } = {}) {
  const g = dark ? GROUND.dark : GROUND.light;
  if (id === 'street') {
    return {
      version: 8,
      sources: { osm: { type: 'raster', tiles: STREET_TILES, tileSize: 256, maxzoom: 19, attribution: STREET_ATTRIBUTION } },
      layers: [
        { id: 'ground', type: 'background', paint: { 'background-color': g.blank } },
        { id: 'osm', type: 'raster', source: 'osm', paint: dark ? { 'raster-brightness-max': 0.72, 'raster-saturation': -0.35 } : { 'raster-saturation': -0.15 } },
      ],
    };
  }
  if (id === 'drawn' && drawn) {
    // A shared file: MapLibre fetches it from its worker, so the address must be absolute.
    if (typeof drawn === 'string' && typeof location !== 'undefined') drawn = new URL(drawn, location.href).href;
    const is = (k) => ['==', ['get', 'layer'], k];
    return {
      version: 8,
      sources: { drawn: { type: 'geojson', data: drawn, attribution: typeof drawn === 'string' ? 'Base map: Natural Earth' : 'Drawn map: made up for Dashi' } },
      layers: [
        { id: 'ground', type: 'background', paint: { 'background-color': g.water } },
        { id: 'land', type: 'fill', source: 'drawn', filter: ['any', is('land'), is('island')], paint: { 'fill-color': g.land } },
        { id: 'neighbour', type: 'fill', source: 'drawn', filter: is('neighbour'), paint: { 'fill-color': g.marsh, 'fill-opacity': 0.45 } },
        { id: 'province', type: 'fill', source: 'drawn', filter: is('province'), paint: { 'fill-color': g.land } },
        { id: 'lake', type: 'fill', source: 'drawn', filter: is('lake'), paint: { 'fill-color': g.water } },
        { id: 'province-line', type: 'line', source: 'drawn', filter: is('province'), paint: { 'line-color': g.shore, 'line-width': 0.8 } },
        { id: 'marsh', type: 'fill', source: 'drawn', filter: is('marsh'), paint: { 'fill-color': g.marsh } },
        { id: 'shore', type: 'line', source: 'drawn', filter: ['any', is('land'), is('island')], paint: { 'line-color': g.shore, 'line-width': 1.2 } },
        { id: 'river', type: 'line', source: 'drawn', filter: is('river'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': g.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 14, 5] } },
        { id: 'road-casing', type: 'line', source: 'drawn', filter: is('road'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': g.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 9] } },
        { id: 'road', type: 'line', source: 'drawn', filter: is('road'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': g.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 14, 6] } },
      ],
    };
  }
  return { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': g.blank } }] };
}

/** The base maps this place document can use (drawn only when it has a drawing). */
export const basemapsFor = (doc) => BASEMAPS.filter((b) => b.id !== 'drawn' || doc?.drawn);
