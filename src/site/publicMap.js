import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { WHEEL } from '../ui/wheel.js';
import { baseStyle } from '../place/basemaps.js';
import { layersFor, featureName, boundsOf } from '../place/model.js';

/**
 * The org's shared Place map on a public site (the example coalition's members
 * site, alpha 0.4): `[[map:place]]` shows every public layer, `[[map:<layer or group>]]`
 * just those. One dot per member community, its colours the networks it's in;
 * click one for its networks and a link to its community page. Under the map,
 * a key you can filter by and every community as a plain list, so the map is
 * never the only way in (screen readers, slow phones, no WebGL).
 *
 * MapLibre loads only when a page has a map, from the same vendor build as
 * Place (CSP-safe, its worker served from this site).
 */
const hex = (id) => WHEEL.find((w) => w.id === id)?.hex ?? '#56657f';

let loading = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  loading ??= new Promise((resolve, reject) => {
    const css = h('link', { rel: 'stylesheet', href: 'vendor/maplibre/maplibre-gl.css' });
    const js = h('script', { src: 'vendor/maplibre/maplibre-gl-csp.js' });
    js.onload = () => { window.maplibregl.setWorkerUrl('vendor/maplibre/maplibre-gl-csp-worker.js'); resolve(window.maplibregl); };
    js.onerror = () => { loading = null; reject(new Error('map library did not load')); };
    document.head.append(css, js);
  });
  return loading;
}

/** Member communities: one entry per place (or per unmatched feature), with every layer it's in. */
export function membersOf(pub, layers) {
  const out = new Map();
  for (const l of layers) {
    for (const f of l.features) {
      if (!/Point/.test(f.geometry?.type ?? '')) continue;
      const [lng, lat] = f.geometry.coordinates;
      const name = featureName(f, l.nameCol);
      const key = f.properties?.placeId ?? `${name}@${lat},${lng}`;
      const m = out.get(key) ?? { key, placeId: f.properties?.placeId ?? null, name: pub.places[f.properties?.placeId]?.name ?? name, lat, lng, province: f.properties?.province ?? '', layers: [] };
      if (!m.layers.some((x) => x.layer.id === l.id)) m.layers.push({ layer: l, props: f.properties ?? {} });
      out.set(key, m);
    }
  }
  return [...out.values()];
}

/**
 * @param pub    publicPlace(doc): what visitors may see
 * @param id     'place', a layer id or a layer group
 * @param link   the site's link maker: link({ place: id }) opens a community page
 * @param focus  a place id to mark (its own community page)
 */
export function PublicMap(pub, id, { link, focus = null }) {
  const layers = layersFor(pub, id);
  if (!pub || !layers.length) return null;
  const off = new Set();
  const members = membersOf(pub, layers);
  const mapEl = h('div', { class: 'pub-map-canvas', role: 'region', 'aria-label': 'Map of member communities. The same communities are listed under the map.' });
  const note = h('p', { class: 'pub-map-note', hidden: true });
  const shown = () => members.filter((m) => m.layers.some((x) => !off.has(x.layer.id)));

  // The key: each layer, with how many communities are in it. Click one to hide or show it.
  const key = h('div', { class: 'pub-map-key', role: 'group', 'aria-label': 'Networks on the map' });
  const drawKey = () => key.replaceChildren(...layers.map((l) => h('button', {
    type: 'button', class: `pub-map-chip${off.has(l.id) ? ' off' : ''}`, 'aria-pressed': String(!off.has(l.id)), style: `--c:${hex(l.colour)}`,
    title: l.note ?? '',
    onclick: () => { off.has(l.id) ? off.delete(l.id) : off.add(l.id); drawKey(); drawList(); drawMarkers(); },
  }, h('span', { class: 'pub-map-swatch' }), l.name, h('small', {}, String(members.filter((m) => m.layers.some((x) => x.layer.id === l.id)).length)))));

  // Every community, by province: the map's text twin.
  const list = h('div', { class: 'pub-map-list' });
  const drawList = () => {
    const byProv = {};
    for (const m of shown()) (byProv[m.province || 'Elsewhere'] ??= []).push(m);
    list.replaceChildren(h('details', {},
      h('summary', {}, icon('listBullets', 15), `Every community on the map (${shown().length})`),
      h('div', { class: 'pub-map-provs' }, Object.entries(byProv).sort(([a], [b]) => a.localeCompare(b)).map(([prov, ms]) => h('section', {},
        h('h4', {}, prov),
        h('ul', {}, ms.sort((a, b) => a.name.localeCompare(b.name)).map((m) => h('li', {},
          m.placeId ? h('a', { href: link({ place: m.placeId }) }, m.name) : h('span', {}, m.name),
          h('span', { class: 'pub-map-dots' }, m.layers.map((x) => h('span', { class: 'pub-map-swatch', style: `--c:${hex(x.layer.colour)}`, title: x.layer.name })))))))))));
  };

  let map = null;
  let markers = [];
  const dot = (m) => {
    const cols = m.layers.filter((x) => !off.has(x.layer.id)).map((x) => hex(x.layer.colour));
    const fill = cols.length > 1 ? `conic-gradient(${cols.map((c, i) => `${c} ${(i / cols.length) * 360}deg ${((i + 1) / cols.length) * 360}deg`).join(', ')})` : cols[0];
    return h('button', { type: 'button', class: `pub-map-dot${focus && m.placeId === focus ? ' on' : ''}`, style: `--fill:${fill}`, 'aria-label': `${m.name}: ${m.layers.map((x) => x.layer.name).join(', ')}` },
      h('span', { class: 'pub-map-label' }, m.name));
  };
  const popup = (m) => h('div', { class: 'pub-map-pop' },
    h('strong', {}, m.name), m.province && h('small', {}, m.province),
    h('ul', {}, m.layers.map((x) => h('li', {}, h('span', { class: 'pub-map-swatch', style: `--c:${hex(x.layer.colour)}` }), x.layer.name,
      x.props.basis && h('em', {}, x.props.basis)))),
    m.placeId && h('a', { href: link({ place: m.placeId }) }, 'See this community →'));
  function drawMarkers() {
    if (!map) return;
    markers.forEach((mk) => mk.remove());
    markers = shown().map((m) => {
      const el = dot(m);
      const mk = new window.maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat])
        .setPopup(new window.maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '260px' }).setDOMContent(popup(m)))
        .addTo(map);
      return mk;
    });
  }

  const start = async () => {
    try {
      const gl = await loadMapLibre();
      const v = pub.view;
      map = new gl.Map({
        container: mapEl,
        style: baseStyle(pub.basemap, { drawn: pub.drawn }),
        center: v ? [v.lng, v.lat] : [-96, 56], zoom: v?.zoom ?? 3,
        attributionControl: { compact: true }, dragRotate: false, cooperativeGestures: true,
      });
      map.addControl(new gl.NavigationControl({ showCompass: false }), 'bottom-right');
      const zoomClass = () => mapEl.classList.toggle('distant', map.getZoom() < (v?.labelZoom ?? 6));
      map.on('zoom', zoomClass);
      zoomClass();
      map.once('load', () => {
        // A layer or group map frames its own communities.
        if (id !== 'place' && members.length > 1) {
          const b = boundsOf(members);
          if (b) map.fitBounds(b, { padding: 40, maxZoom: v?.regionZoom ?? 6, duration: 0 });
        }
      });
      drawMarkers();
      // Keep the canvas the size of its box (a page that reflows, a phone turned).
      new ResizeObserver(() => map.resize()).observe(mapEl);
    } catch {
      note.hidden = false;
      note.textContent = 'The map couldn’t load in this browser. Every community is listed below.';
      mapEl.hidden = true;
    }
  };
  // Start once the page has put the map in place (MapLibre needs its size).
  requestAnimationFrame(() => { if (mapEl.isConnected) start(); else setTimeout(start, 50); });

  drawKey();
  drawList();
  return h('figure', { class: 'pub-map' }, key, mapEl, note, list);
}
