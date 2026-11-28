/**
 * The 3D studio (EoViz ocean studio, stage 4): the windows a researcher
 * switched on, together in one space, on three.js (vendored in
 * vendor/three). Longitude and latitude lie flat, depth goes down,
 * stretched so the ocean's thin skin can be seen.
 *
 *   section or profile window on a cruise line  →  a curtain along the line, and the bottle cloud
 *   map, T–S or scatter window on a cruise      →  the bottle cloud
 *   any window on a float fleet                 →  ribbons: each depth level traced along the track
 *   any window on a mooring array               →  a helix per mooring: one turn a year, coloured by the variable
 *
 * layersOf() is pure (the tests use it); mount() needs a browser and WebGL.
 */
import { observations } from './ocean.js';
import { queryOf, colourFor, setsOf } from './windows.js';

/** Flat space: degrees to studio units, around a centre; depth in km times the stretch, downwards. */
export function projector(center = { lat: 60, lon: -55 }, stretch = 0.6) {
  const kx = Math.cos((center.lat * Math.PI) / 180);
  return ([lat, lon, depth]) => [(lon - center.lon) * kx, -(depth / 1000) * stretch, -(lat - center.lat)];
}

/**
 * The layers the studio draws, from the windows switched on.
 * → [{ id, kind: 'curtain' | 'cloud' | 'ribbons' | 'helix', var, title, items }]
 *   curtain: items = [{ station, lat, lon, cells: [{ depth, v }] }] in line order
 *   cloud:   items = [{ lat, lon, depth, v }]
 *   ribbons: items = [{ depth, points: [{ lat, lon, date, v }] }]
 *   helix:   items = [{ station, lat, lon, depth, points: [{ date, v }] }]
 */
/**
 * @param {any[]} windows
 * @param {Record<string, any>} collections
 * @param {(w: any, set?: any) => string} [titleOf]
 */
export function layersOf(windows, collections, titleOf = (w) => w.title ?? w.id) {
  const sets = setsOf(collections);
  const out = [];
  for (const w of windows.filter((x) => x.studio)) {
    const set = sets.find((s) => s.key === w.set);
    if (!set) continue;
    const rows = observations(collections, queryOf(w, set)).filter((r) => Number.isFinite(r[w.var]));
    if (!rows.length) continue;
    const base = { id: w.id, var: w.var, title: titleOf(w, set) };
    if (set.kind === 'cruise') {
      out.push({ ...base, kind: 'cloud', items: rows.map((r) => ({ lat: r.lat, lon: r.lon, depth: r.depth, v: r[w.var] })) });
      if (w.form === 'section' || w.form === 'profile') {
        // One curtain per cruise date range: the mean at each station and depth over the slice.
        const cells = new Map();
        for (const r of rows) {
          const key = r.station;
          if (!cells.has(key)) cells.set(key, { station: r.station, lat: r.lat, lon: r.lon, at: new Map() });
          const c = cells.get(key);
          const d = c.at.get(r.depth) ?? { sum: 0, n: 0 };
          d.sum += r[w.var]; d.n += 1; c.at.set(r.depth, d);
        }
        const items = [...cells.values()].sort((a, b) => a.lat - b.lat).map((c) => ({ station: c.station, lat: c.lat, lon: c.lon, cells: [...c.at].sort((a, b) => a[0] - b[0]).map(([depth, d]) => ({ depth, v: d.sum / d.n })) }));
        out.push({ ...base, id: `${w.id}-curtain`, kind: 'curtain', items });
      }
    } else if (set.kind === 'track') {
      const byDepth = new Map();
      for (const r of rows) { if (!byDepth.has(r.depth)) byDepth.set(r.depth, []); byDepth.get(r.depth).push(r); }
      const items = [...byDepth].sort((a, b) => a[0] - b[0]).flatMap(([depth, list]) => {
        const byFloat = new Map();
        for (const r of list) { if (!byFloat.has(r.collection)) byFloat.set(r.collection, []); byFloat.get(r.collection).push({ lat: r.lat, lon: r.lon, date: r.date, v: r[w.var] }); }
        return [...byFloat.values()].map((points) => ({ depth, points: points.sort((a, b) => a.date.localeCompare(b.date)) }));
      });
      out.push({ ...base, kind: 'ribbons', items });
    } else {
      const byStation = new Map();
      for (const r of rows) {
        const key = `${r.station}|${r.depth}`;
        if (!byStation.has(key)) byStation.set(key, { station: r.station, lat: r.lat, lon: r.lon, depth: r.depth, points: [] });
        byStation.get(key).points.push({ date: r.date, v: r[w.var] });
      }
      out.push({ ...base, kind: 'helix', items: [...byStation.values()].map((s) => ({ ...s, points: s.points.sort((a, b) => a.date.localeCompare(b.date)) })) });
    }
  }
  return out;
}

/** The centre of everything in the layers. */
export function centreOf(layers) {
  const pts = layers.flatMap((l) => (l.kind === 'ribbons' ? l.items.flatMap((i) => i.points) : l.items));
  if (!pts.length) return { lat: 60, lon: -55 };
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  return { lat, lon };
}

let threeP = null;
const loadThree = () => (threeP ??= Promise.all([import('../../vendor/three/three.module.min.js'), import('../../vendor/three/OrbitControls.js')]).then(([THREE, oc]) => ({ THREE, OrbitControls: oc.OrbitControls })));

/**
 * Mount the studio in a holder. Returns { update(layers, opts), dispose() }.
 * opts = { stretch, d3, background, visible: Set of layer ids }
 */
export async function mount(holder, { d3 }) {
  const { THREE, OrbitControls } = await loadThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1622');
  scene.fog = new THREE.Fog('#0b1622', 30, 90);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
  camera.position.set(10, 9, 16);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, -1.2, 0);
  holder.append(renderer.domElement);
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.AmbientLight('#ffffff', 1));

  const resize = () => {
    const w = holder.clientWidth || 800; const h = holder.clientHeight || 520;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(holder); resize();
  let raf = 0; let alive = true;
  const loop = () => { if (!alive) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();

  // The darkest end of a ramp is lifted off the dark background, so deep, low values still show.
  const colourOf = (scale) => { const [a, b] = scale.domain(); return (v) => new THREE.Color(scale(a + (b - a) * (0.2 + 0.8 * Math.max(0, Math.min(1, (v - a) / (b - a || 1)))))); };
  function clear() {
    for (const child of [...group.children]) { group.remove(child); child.geometry?.dispose?.(); child.material?.dispose?.(); }
  }

  let fitted = false;
  let home = null;
  function fit() {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()).length() || 10;
    home = { target: new THREE.Vector3(c.x, c.y * 0.6, c.z), position: new THREE.Vector3(c.x + size * 0.32, c.y + size * 0.3, c.z + size * 0.48) };
    camera.position.copy(home.position); controls.target.copy(home.target); camera.far = size * 20; camera.updateProjectionMatrix();
    scene.fog.near = size * 1.2; scene.fog.far = size * 4;
  }

  function update(layers, { stretch = 1, visible = null } = {}) {
    clear();
    const P = projector(centreOf(layers), stretch);
    for (const l of layers) {
      if (visible && !visible.has(l.id)) continue;
      const vals = l.kind === 'cloud' ? l.items.map((i) => i.v) : l.kind === 'curtain' ? l.items.flatMap((i) => i.cells.map((c) => c.v)) : l.items.flatMap((i) => i.points.map((p) => p.v));
      const col = colourOf(colourFor(d3, l.var, vals));
      if (l.kind === 'cloud') {
        const pos = []; const cols = [];
        for (const i of l.items) { pos.push(...P([i.lat, i.lon, i.depth])); const c = col(i.v); cols.push(c.r, c.g, c.b); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        group.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.85 })));
      }
      if (l.kind === 'curtain' && l.items.length > 1) {
        // A strip of quads between neighbouring stations, each depth band coloured by its value.
        const levels = [...new Set(l.items.flatMap((i) => i.cells.map((c) => c.depth)))].sort((a, b) => a - b);
        // A value at a depth, or the nearest one within 300 m at the same station (a flagged bottle leaves no hole).
        const at = (item, depth) => {
          let best = null;
          for (const c of item.cells) if (Math.abs(c.depth - depth) <= 300 && (!best || Math.abs(c.depth - depth) < Math.abs(best.depth - depth))) best = c;
          return best?.v;
        };
        const pos = []; const cols = [];
        for (let s = 0; s < l.items.length - 1; s++) {
          const a = l.items[s]; const b = l.items[s + 1];
          for (let d = 0; d < levels.length - 1; d++) {
            const [z0, z1] = [levels[d], levels[d + 1]];
            const va = at(a, z0); const vb = at(b, z0); const va1 = at(a, z1); const vb1 = at(b, z1);
            if (![va, vb, va1, vb1].every(Number.isFinite)) continue;
            const q = [[a, z0, va], [b, z0, vb], [b, z1, vb1], [a, z0, va], [b, z1, vb1], [a, z1, va1]];
            for (const [it, z, v] of q) { pos.push(...P([it.lat, it.lon, z])); const c = col(v); cols.push(c.r, c.g, c.b); }
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })));
      }
      if (l.kind === 'ribbons') {
        for (const r of l.items) {
          const pos = []; const cols = [];
          for (const p of r.points) { pos.push(...P([p.lat, p.lon, r.depth])); const c = col(p.v); cols.push(c.r, c.g, c.b); }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
          group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })));
        }
      }
      if (l.kind === 'helix') {
        for (const m of l.items) {
          const [x, y, z] = P([m.lat, m.lon, m.depth]);
          // The mooring line, from the surface to its sensor.
          const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, y - 0.4, z)]);
          group.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: '#8fa6b8', transparent: true, opacity: 0.5 })));
          const t0 = Date.parse(m.points[0]?.date ?? '2025-01-01');
          const pos = []; const cols = [];
          for (const p of m.points) {
            const yrs = (Date.parse(p.date) - t0) / (365.25 * 864e5);
            const a = yrs * 2 * Math.PI;
            pos.push(x + Math.cos(a) * 0.35, y + 0.25 - yrs * 0.25, z + Math.sin(a) * 0.35);
            const c = col(p.v); cols.push(c.r, c.g, c.b);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
          group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true })));
        }
      }
    }
    // The sea surface and a grid of degrees under everything, sized to what is drawn.
    const box = new THREE.Box3().setFromObject(group);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
      const span = Math.ceil(Math.max(s.x, s.z) + 4);
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshBasicMaterial({ color: '#2b6c99', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
      surface.rotation.x = -Math.PI / 2; surface.position.set(c.x, 0, c.z); group.add(surface);
      const grid = new THREE.GridHelper(span, span, '#3c5a73', '#1b3245'); grid.position.set(c.x, -0.002, c.z); group.add(grid);
    }
    if (!fitted) { fit(); fitted = true; }
  }

  return {
    update,
    /** A PNG of the scene as it is now. */
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    reset: () => { if (home) { camera.position.copy(home.position); controls.target.copy(home.target); } },
    dispose: () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); clear(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
