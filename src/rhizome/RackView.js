/**
 * The rack (Rhizome stage 3): twin racks of modules, cabled together.
 * Rack A (left) holds the controls, rack B (right) the screens and engines,
 * so a knob turned on the left shows on a screen on the right.
 *
 * The look: a 1950s rack. Wood cheeks, brushed rails with screws, ivory
 * faceplates, bakelite knobs, CRT screens with scanlines, VU needles and
 * coloured patch cables. The engines (the AI visualiser, Claude, the open
 * slot) are modern glass, on purpose: the future, plugged into the past.
 *
 * Rack 2.0 (d, 2026-11-27) draws the same patch another way: one
 * full-width rack in rows, like Reason, in the late-90s sampler look (warm
 * white panels, big knurled dials, backlit dot-matrix screens, rubber pads),
 * with the modules, the neuro-symbolic tools and an inspector in draggable
 * tool panels. Classic / 2.0 on the strip switches, per person; the patch,
 * the engine and every module are the same in both.
 *
 * Rack(env) draws it; env = { doc, save, render, ctx, canSet, toast, linkFact }.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { MODULES, CATEGORIES, FIELDS, HP, LIST_SOURCE, TYPE_SOURCE, order, isNumeric, blankPatch, addModule, removeModule, moveModule, swapRack, placeModule, inRack, rowsOf, connect, disconnect, runPatch, ruleToPatch, patchToRule, starterPatch, describeModule, unfoldTranslator, museVariants } from './rack.js';
import { MOCK_MODEL, usageOf } from './neuro.js';
import { RULES, ruleById, OPS } from './rules.js';
import { TIPS, tipById } from './tips.js';
import { ENTITY_TYPES, typeLabel } from './facts.js';
import { themeById } from './setup.js';
import { graphOf, plotLayout, spectrumOf, vennCounts } from './rackGraph.js';
import { VisualiserPanel } from './VisualiserView.js';
import { Readout, readoutLines } from './Readout.js';
import { RippleMark } from '../ui/Wordmark.js';
import { Drawer } from '../ui/drawer.js';
import { PLUGINS } from '../plugins.js';

const svgNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, parent = null) => {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
};
const n = (count, word, plural = `${word}s`) => `${count.toLocaleString()} ${count === 1 ? word : plural}`;
const CAT_TONE = { Routing: '#56657f', Sources: '#3e8fa6', Shapers: '#ee7d2b', Logic: '#8a4fd8', 'Sets & graphs': '#2e9d8f', Voice: '#d23c2c', Displays: '#22252b', Engines: '#2f6fd6', 'Neuro-symbolic': '#6c4ee6' };
const PCTS = ['p25', 'p50', 'p75', 'p90'];
const PCT_LABEL = { p25: '25%', p50: 'median', p75: '75%', p90: '90%' };

let dragFrom = null; // { m, port, dir, x, y } while a cable is being patched
let flipped = false; // looking at the back of the rack
const visState = {}; // where each visualiser is up to (lane, playing, speed), kept across re-renders
let selected = null; // the module the Rack 2.0 inspector shows
const tutorState = {}; // which question each Tutor is on, and whether its answer shows
let trayTab = 'modules'; // the Rack 2.0 tool tray's open tab
const TRAY_KEY = 'dashi.rhizome.rack2-tray';

/** Classic ('1') or Rack 2.0 ('2'), remembered per person in this browser. */
const VKEY = 'dashi.rhizome.rack-view';
export const rackVersion = () => { try { return localStorage.getItem(VKEY) === '2' ? '2' : '1'; } catch { return '1'; } };
const setRackVersion = (v) => { try { localStorage.setItem(VKEY, v); } catch { /* private window: just for now */ } };
/**
 * Rack 2.0 mixes makers, like a real studio rack (d, 2026-11-27): each kind
 * of module takes a family look, all wearing the Dashi badge. The looks are
 * inspired by late-90s gear, not copies of it, and name no maker.
 *   sampler  warm white, red labels, green-yellow LCD (the big samplers)
 *   module   slate blue, yellow labels, amber LCD (rack sound modules)
 *   groove   charcoal, orange labels, red LED readouts (grooveboxes)
 *   station  graphite, teal labels, blue-green LCD (workstations)
 *   pads     pale grey, blue LCD and rubber pads (the drum machines), for the neuro-symbolic tools
 */
const FAMILY = { Routing: 'groove', Sources: 'sampler', Shapers: 'module', Logic: 'module', 'Sets & graphs': 'station', Voice: 'sampler', Displays: 'groove', Engines: 'station', 'Neuro-symbolic': 'pads' };
const FAMILY_OF = { scope: 'module', printer: 'sampler', meter: 'sampler', venn: 'station', spectrum: 'groove', plotter: 'sampler' };
/** A Rack 2.0 row is the whole width, so it holds twice a classic row. */
const HP2 = HP * 2;

export function Rack(env, patchId) {
  const { doc, canSet } = env;
  doc.patches ??= {};
  let patch = doc.patches[patchId] ?? Object.values(doc.patches).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  if (!patch) {
    patch = starterPatch();
    if (canSet) { patch.at = new Date().toISOString(); doc.patches[patch.id] = patch; env.save(); }
  }
  const commit = (note) => {
    patch.at = new Date().toISOString();
    if (canSet) { doc.patches[patch.id] = patch; env.save(note); }
    env.render();
  };
  const v2 = rackVersion() === '2';
  const { signals, inputs, traces } = runPatch(patch, env.ctx());
  const facts = env.ctx().facts;
  const measures = env.ctx().measures;

  /* ------------------------------------------------------ the strip above */
  const compiled = patchToRule(patch);
  const own = doc.ownRules?.[compiled.rule?.id];
  const strip = h('div', { class: 'rk-strip' },
    h('select', { class: 'select select-bordered select-sm rk-pick', title: 'Your patches', onchange: (e) => { location.hash = `#rack/${e.target.value}`; } },
      Object.values(doc.patches).map((p) => h('option', { value: p.id, selected: p.id === patch.id }, p.name || 'Untitled patch')),
      doc.patches[patch.id] ? null : h('option', { value: patch.id, selected: true }, patch.name)),
    canSet ? h('input', { class: 'input input-bordered input-sm rk-name', value: patch.name, maxlength: 80, title: 'The patch’s name', onchange: (e) => { patch.name = e.target.value.trim() || 'Untitled patch'; commit('Renamed'); } }) : h('b', {}, patch.name),
    canSet && h('label', { class: 'rk-vis', title: 'Public patches will be offered to the shared library when it opens' },
      h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: patch.visibility !== 'private', onchange: (e) => { patch.visibility = e.target.checked ? 'public' : 'private'; commit(e.target.checked ? 'Public' : 'Private'); } }),
      patch.visibility === 'private' ? 'Private' : 'Public'),
    h('span', { class: 'rk-grow' }),
    h('div', { class: 'rk-vtoggle', role: 'radiogroup', 'aria-label': 'Which rack' },
      [['1', 'Classic'], ['2', 'Rack 2.0']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(rackVersion() === v), class: rackVersion() === v ? 'on' : '',
        title: v === '2' ? 'One wide rack, tool panels, and the neuro-symbolic tools close at hand' : 'The twin 1950s racks', onclick: () => { if (rackVersion() !== v) { setRackVersion(v); env.render(); } } }, label))),
    h('button', { class: `btn btn-sm ${flipped ? 'btn-primary' : 'btn-ghost'}`, 'aria-pressed': String(flipped), title: 'Turn the rack round to see the power bus and the wiring', onclick: () => { flipped = !flipped; env.render(); } }, icon('swap', 14), flipped ? 'Front' : 'Flip'),
    canSet && h('select', { class: 'select select-bordered select-sm', title: 'Open one of the built-in rules as a patch', onchange: (e) => {
      if (!e.target.value) return;
      const p = ruleToPatch(ruleById[e.target.value]);
      p.at = new Date().toISOString();
      doc.patches[p.id] = p; env.save(`Opened “${p.name}” in the rack`);
      location.hash = `#rack/${p.id}`;
    } }, h('option', { value: '' }, 'Open a rule…'), RULES.map((r) => h('option', { value: r.id }, r.name))),
    canSet && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { const p = blankPatch(); p.at = new Date().toISOString(); doc.patches[p.id] = p; env.save('A new, empty rack'); location.hash = `#rack/${p.id}`; } }, icon('plus', 14), 'New'),
    canSet && h('button', { class: `btn btn-sm ${own ? 'btn-outline' : 'btn-primary'}`, disabled: !compiled.rule, title: compiled.problem ?? 'Keep this patch as one of your rules, in Analyses', onclick: () => {
      const rule = { ...compiled.rule, visibility: patch.visibility ?? 'public', patchId: patch.id };
      (doc.ownRules ??= {})[rule.id] = rule;
      if (!(doc.analyses ?? []).includes('own')) doc.analyses = [...(doc.analyses ?? []), 'own'];
      commit(own ? 'Your rule is updated' : 'Added to Analyses as one of your rules');
    } }, icon('check', 14), own ? 'Update my rule' : 'Add to analyses'),
    canSet && Object.keys(doc.patches).length > 1 && h('button', { class: 'btn btn-sm btn-ghost', title: 'Delete this patch', onclick: async () => {
      if (!(await env.confirm(`Delete the patch “${patch.name}”?`))) return;
      delete doc.patches[patch.id];
      env.save('Patch deleted');
      location.hash = '#rack';
    } }, icon('trash', 14)));

  /* ------------------------------------------------------ the module drawer */
  const addButtons = (cats) => cats.map((cat) => h('div', { class: 'rk-cat' },
      h('small', { style: `--c:${CAT_TONE[cat]}` }, cat),
      Object.entries(MODULES).filter(([, d]) => d.cat === cat).map(([type, d]) => h('button', {
        class: `rk-add ${d.look}${d.neuro ? ' neuro' : ''}`, title: d.blurb, disabled: !canSet || (type === 'patchbay' && patch.modules.some((m) => m.type === 'patchbay')),
        onclick: () => { const made = addModule(patch, type); selected = made?.id ?? selected; commit(`${d.label} added`); },
        draggable: v2 && canSet ? 'true' : null, ondragstart: v2 ? (e) => { e.dataTransfer.setData('text/x-rk-module', type); e.dataTransfer.effectAllowed = 'copy'; } : null,
      }, h('b', {}, d.label), h('span', {}, d.neuro ? 'mock' : d.stage ? `Stage ${d.stage}` : d.stage === null ? 'Open' : `${d.hp} HP`)))));
  const drawer = h('aside', { class: 'rk-drawer' },
    h('h4', {}, 'Modules'),
    CATEGORIES.map((cat) => h('div', { class: 'rk-cat' },
      h('small', { style: `--c:${CAT_TONE[cat]}` }, cat),
      Object.entries(MODULES).filter(([, d]) => d.cat === cat).map(([type, d]) => h('button', {
        class: `rk-add ${d.look}`, title: d.blurb, disabled: !canSet || (type === 'patchbay' && patch.modules.some((m) => m.type === 'patchbay')),
        onclick: () => { addModule(patch, type); commit(`${d.label} added`); },
      }, h('b', {}, d.label), h('span', {}, d.stage ? `Stage ${d.stage}` : d.stage === null ? 'Open' : `${d.hp} HP`))))),
    h('p', { class: 'rk-hint' }, 'Drag from a jack to a jack to patch a cable. An output can feed many inputs. Drag a plug from an input, or press a cable, to move it or pull it out. Drag a knob up or down, or use the arrow keys.'));

  /* ------------------------------------------------------ the twin racks */
  const stage = h('div', { class: 'rk-stage' });
  const cables = svg('svg', { class: 'rk-cables', 'aria-hidden': 'true' });
  const racks = h('div', { class: `rk-twins${v2 ? ' rk-one' : ''}` },
    Case('a', v2 ? 'Controls' : 'Rack A · controls'), Case('b', v2 ? 'Screens · engines · neuro-symbolic' : 'Rack B · screens and engines'));
  stage.append(racks, cables);

  function Case(rack, title) {
    const mods = inRack(patch, rack);
    const width = v2 ? HP2 : HP;
    const rows = rowsOf(mods, width);
    return h('section', { class: `rk-case rk-${rack}` },
      h('div', { class: 'rk-cheek' }),
      h('div', { class: 'rk-body' },
        h('div', { class: 'rk-plate' }, h('span', {}, title), h('em', {}, v2 ? (rack === 'a' ? 'RHIZOME · RULES' : 'RHIZOME · NEURO') : rack === 'a' ? 'RHIZOME' : 'MODEL 3')),
        rows.length ? rows.map((row) => h('div', { class: 'rk-row' },
          h('div', { class: 'rk-rail' }),
          h('div', { class: 'rk-mods' }, row.map((m) => Module(m)), Blank(width - row.reduce((s, m) => s + (MODULES[m.type]?.hp ?? 10), 0))),
          h('div', { class: 'rk-rail' }))) : h('div', { class: 'rk-row' }, h('div', { class: 'rk-rail' }), h('div', { class: 'rk-mods' }, Blank(width, rack === 'a' ? (v2 ? 'Add modules from the Modules panel' : 'Add modules from the left') : (v2 ? 'Screens, engines and neuro-symbolic tools land here' : 'Screens and engines land here'))), h('div', { class: 'rk-rail' }))),
      h('div', { class: 'rk-cheek' }));
  }
  function Blank(hp, words = '') { return hp > 0 ? h('div', { class: 'rk-blank', style: `flex:${hp} 1 0` }, words && h('span', {}, words)) : null; }

  /* ------------------------------------------------------ one module */
  function Module(m) {
    const def = MODULES[m.type];
    const ins = inputs[m.id] ?? {};
    const outs = signals[m.id] ?? {};
    const p = m.params ?? {};
    const set = (patchParams, note = null) => { Object.assign(m.params, patchParams); commit(note); };
    const face = m.type === 'visualiser' ? VisFace(m, p, set) : def.neuro ? NeuroFace(m, def, ins, outs, p, set) : def.look === 'digital' ? Digital(m, def, ins) : Face(m, def, ins, outs, p, set);
    const movable = canSet && m.type !== 'patchbay';
    return h('div', { class: `rk-mod ${def.look}${def.neuro ? ' neuro' : ''} t-${m.type}${v2 ? ` fam-${FAMILY_OF[m.type] ?? FAMILY[def.cat] ?? 'sampler'}` : ''}${v2 && selected === m.id ? ' sel' : ''}`, style: `flex:${def.hp} 1 0;--c:${CAT_TONE[def.cat]}`, 'data-mod': m.id },
      h('header', { onclick: v2 ? (e) => { if (e.target.closest('button')) return; selected = selected === m.id ? null : m.id; if (selected) trayTab = 'inspect'; env.render(); } : null, title: v2 ? 'Click to inspect' : null },
        movable ? Grip(m, def) : h('i', { class: 'rk-screw' }),
        h('span', { class: 'rk-title', title: def.label }, h('span', { class: 'rk-title-long' }, def.label), def.short ? h('span', { class: 'rk-title-short' }, def.short) : null),
        movable ? h('button', { type: 'button', class: 'rk-x', title: `Take the ${def.label} out of the rack`, 'aria-label': `Take the ${def.label} out of the rack`, onclick: () => { removeModule(patch, m.id); commit(`${def.label} taken out`); } }, '×') : h('i', { class: 'rk-screw' })),
      m.type === 'visualiser' ? h('span', { class: 'rk-brand-future', 'aria-hidden': 'true' }, h('b', {}, 'DASHI'), h('i', {}), h('small', {}, 'VIS·01')) : null,
      face,
      def.brand || (v2 && m.type !== 'visualiser') ? h('span', { class: 'rk-logo', title: 'Dashi' }, RippleMark(15, 'rk-logo-mark')) : null,
      Jacks(m, def, ins, outs));
  }

  /* ------------------------------------------------------ grab a module by its handle */
  // Drag the handle to move a module anywhere in either rack; the arrow keys
  // move it too (left and right along the rack, up and down to the other rack).
  function Grip(m, def) {
    return h('button', {
      type: 'button', class: 'rk-grip', title: `Drag to move the ${def.label}. Arrow keys move it too.`, 'aria-label': `Move the ${def.label}`,
      onkeydown: (e) => {
        const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (d) { e.preventDefault(); if (moveModule(patch, m.id, d)) { commit(); refocus(m.id); } }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); swapRack(patch, m.id); commit(); refocus(m.id); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeModule(patch, m.id); commit(`${def.label} taken out`); }
      },
      onpointerdown: (e) => startMove(e, m),
    }, h('i', {}), h('i', {}), h('i', {}));
  }
  const refocus = (id) => requestAnimationFrame(() => document.querySelector(`[data-mod="${id}"] .rk-grip`)?.focus());
  function startMove(e, m) {
    if (e.button > 0) return;
    e.preventDefault();
    const el = stage.querySelector(`[data-mod="${m.id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('rk-ghost');
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.append(ghost);
    el.classList.add('rk-moving');
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    let drop = null;
    const clear = () => stage.querySelectorAll('.rk-drop-before, .rk-drop-after, .rk-drop-end').forEach((x) => x.classList.remove('rk-drop-before', 'rk-drop-after', 'rk-drop-end'));
    const move = (ev) => {
      ghost.style.left = `${ev.clientX - dx}px`;
      ghost.style.top = `${ev.clientY - dy}px`;
      ghost.hidden = true;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.hidden = false;
      clear();
      drop = null;
      const target = under?.closest('[data-mod]');
      const caseEl = under?.closest('.rk-case');
      if (target && target !== el && target.closest('.rk-twins') === racks) {
        const tm = patch.modules.find((x) => x.id === target.dataset.mod);
        if (!tm) return;
        const tr = target.getBoundingClientRect();
        const after = tm.type === 'patchbay' || ev.clientX > tr.left + tr.width / 2;
        target.classList.add(after ? 'rk-drop-after' : 'rk-drop-before');
        drop = { rack: tm.rack ?? (caseEl?.classList.contains('rk-b') ? 'b' : 'a'), ref: tm.id, after };
      } else if (caseEl && !target) {
        caseEl.classList.add('rk-drop-end');
        drop = { rack: caseEl.classList.contains('rk-b') ? 'b' : 'a', ref: null, after: false };
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      ghost.remove();
      el.classList.remove('rk-moving');
      clear();
      if (drop && placeModule(patch, m.id, drop.rack, drop.ref, drop.after)) commit('Moved');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Everything on a cable, in full, in a tray. */
  function openReadout(signal, title) {
    const n = signal?.kind === 'findings' ? signal.findings.length : signal?.rows?.length ?? 0;
    Drawer({ title, sub: `${n} ${signal?.kind === 'findings' ? (n === 1 ? 'finding' : 'findings') : (n === 1 ? 'row' : 'rows')}, in full`, wide: true, body: Readout(signal, { typeLabel, toast: env.toast }) });
  }

  /* ------------------------------------------------------ the AI visualiser */
  function VisFace(m, p, set) {
    const trace = traces[m.id];
    const state = (visState[m.id] ??= { lane: 0, playing: false, speed: 'normal' });
    if (!trace) return h('div', { class: 'rk-face' });
    const panel = (big, st) => VisualiserPanel({
      trace, state: st, big, canSet, graph: graphOf(facts),
      onAsk: (q) => { set({ q, mode: 'ask' }, 'Asked the visualiser'); },
      onWeights: (weights) => set({ weights }),
      mode: p.mode ?? 'ask', pick: Number(p.pick) || 0,
      onMode: (mode) => set({ mode, pick: 0 }, mode === 'statements' ? 'The visualiser reads the rack’s statements' : 'The visualiser takes questions'),
      onPick: (pick) => set({ pick }),
      onExpand: big ? null : () => openTray(),
    });
    const openTray = () => {
      const st = { ...state, playing: false };
      Drawer({ title: 'AI visualiser', sub: 'Watch a tiny engine think, one step at a time', wide: true, body: panel(true, st), onClose: () => { Object.assign(state, st, { playing: false }); env.render(); } });
    };
    return h('div', { class: 'rk-face rk-vis-face' }, panel(false, state));
  }

  function Jacks(m, def, ins, outs) {
    if (m.type === 'patchbay') return null; // the patchbay's jacks are its face
    return h('footer', { class: 'rk-jacks' },
      h('div', {}, def.ins.map((port) => Jack(m, port, 'in', ins[port]))),
      h('div', {}, def.outs.map((port) => Jack(m, port, 'out', outs[port]))));
  }
  function Jack(m, port, dir, sig) {
    const count = sig ? (sig.kind === 'findings' ? sig.findings.length : sig.rows.length) : null;
    return h('span', { class: `rk-jack ${dir}${sig && count ? ' live' : ''}`, 'data-jack': `${m.id}|${port}|${dir}`, title: `${dir === 'in' ? 'In' : 'Out'}: ${port}${count != null ? ` · ${count}` : ''}`, onpointerdown: (e) => startCable(e, m, port, dir) },
      h('i', {}), h('small', {}, port === 'in' || port === 'out' ? dir.toUpperCase() : port === 'reject' ? 'REJ' : port.toUpperCase()));
  }

  /* ------------------------------------------------------ analog faces */
  function Face(m, def, ins, outs, p, set) {
    const rows = (s) => (s?.kind === 'rows' ? s.rows : []);
    if (m.type === 'facts') {
      const types = Object.keys(ENTITY_TYPES).filter((t) => Object.values(facts.entities).some((e) => e.type === t));
      return h('div', { class: 'rk-face' },
        Nixie(rows(outs.out).length),
        Knob({ label: 'type', options: types, value: p.type, show: (t) => typeLabel(t, 2), onChange: (v) => set({ type: v }), big: true }));
    }
    if (m.type === 'measure') {
      const lists = Object.keys(measures.lists).filter((l) => l !== 'supported');
      return h('div', { class: 'rk-face' },
        Nixie(rows(outs.out).length),
        Knob({ label: 'measure', options: lists, value: p.list, show: (l) => l.replace(/([A-Z])/g, ' $1').toLowerCase(), onChange: (v) => set({ list: v }) }));
    }
    if (m.type === 'filter') {
      const numeric = isNumeric(p.field);
      const ops = numeric ? ['lte', 'lt', 'gte', 'gt', 'eq'] : ['eq', 'ne', 'yes', 'no'];
      return h('div', { class: 'rk-face' },
        h('div', { class: 'rk-knobs' },
          Knob({ label: 'field', options: Object.keys(FIELDS), value: p.field, show: (f) => FIELDS[f], onChange: (v) => set({ field: v, op: isNumeric(v) ? (isNumeric(p.field) ? p.op : 'lte') : 'eq', pct: isNumeric(v) ? p.pct ?? 'p25' : null }) }),
          Knob({ label: 'test', options: ops, value: ops.includes(p.op) ? p.op : ops[0], show: (o) => OPS[o]?.label ?? o, onChange: (v) => set({ op: v }) })),
        numeric
          ? Knob({ label: 'level', options: PCTS, value: p.pct ?? 'p25', show: (x) => `your ${PCT_LABEL[x]}`, onChange: (v) => set({ pct: v }), small: true })
          : ['yes', 'no'].includes(p.op) ? null : h('input', { class: 'rk-tape', value: p.value ?? '', placeholder: 'value', disabled: !canSet, onchange: (e) => set({ value: e.target.value.trim() }) }),
        h('div', { class: 'rk-leds' }, Led('pass', rows(outs.pass).length, 'green'), Led('reject', rows(outs.reject).length, 'red')));
    }
    if (m.type === 'weigh') {
      const top = rows(outs.out)[0]?._w?.score;
      return h('div', { class: 'rk-face' },
        h('div', { class: 'rk-knobs' },
          Knob({ label: 'base', min: 0, max: 1, step: 0.05, value: Number(p.base ?? 0.5), onChange: (v) => set({ base: v }) }),
          Knob({ label: 'weight', min: 0, max: 1, step: 0.05, value: Number(p.w ?? 0), onChange: (v) => set({ w: v }) })),
        Knob({ label: 'by', options: ['degree', 'betweenness', 'votes', 'value', 'measures', 'staff'], value: p.field ?? 'degree', show: (f) => FIELDS[f], onChange: (v) => set({ field: v }), small: true }),
        h('div', { class: 'rk-readout' }, top != null ? `top ${top.toFixed(2)}` : '—'));
    }
    if (m.type === 'gate') {
      return h('div', { class: 'rk-face' },
        Toggle(['and', 'or', 'not'], p.mode, (v) => set({ mode: v })),
        Led('out', rows(outs.out).length, 'amber'));
    }
    if (m.type === 'say') {
      const f = outs.out?.findings ?? [];
      return h('div', { class: 'rk-face' },
        h('select', { class: 'rk-dymo', disabled: !canSet, title: 'The tip it speaks with', onchange: (e) => set({ tip: e.target.value }) },
          TIPS.map((t) => h('option', { value: t.id, selected: t.id === p.tip }, `${themeById[t.theme]?.label ?? t.theme} · ${t.id}`))),
        h('div', { class: 'rk-crt amber small' }, h('p', {}, f[0]?.text ?? (tipById[p.tip]?.text ?? '').replace(/\{(\w+)\}/g, '‹$1›'))),
        h('div', { class: 'rk-switchrow' }, Toggle(['each', 'grouped'], p.group ? 'grouped' : 'each', (v) => set({ group: v === 'grouped' })), Led('findings', f.length, 'amber')));
    }
    if (m.type === 'scope') {
      const s = ins.in;
      const lines = !s ? [] : s.kind === 'findings' ? s.findings.slice(0, 6).map((f) => [f.score?.toFixed(2), f.text]) : s.rows.slice(0, 8).map((r) => [r._w?.score?.toFixed(2) ?? '', r.name]);
      const total = !s ? 0 : s.kind === 'findings' ? s.findings.length : s.rows.length;
      return h('div', { class: 'rk-face' },
        h('div', { class: `rk-crt big ${p.phosphor === 'amber' ? 'amber' : 'green'}` },
          h('div', { class: 'rk-crt-head' }, h('span', {}, !s ? 'NO SIGNAL' : s.kind === 'findings' ? 'FINDINGS' : 'ROWS'), h('span', {}, String(total).padStart(3, '0'))),
          !s ? h('p', { class: 'rk-nosig' }, 'Patch a cable into IN') : lines.length ? h('ol', {}, lines.map(([sc, t]) => h('li', {}, sc ? h('b', {}, sc) : null, t))) : h('p', { class: 'rk-nosig' }, 'Nothing flowing'),
          total > lines.length ? h('small', {}, `+${total - lines.length} more`) : null),
        h('div', { class: 'rk-switchrow' },
          Toggle(['green', 'amber'], p.phosphor === 'amber' ? 'amber' : 'green', (v) => set({ phosphor: v })),
          h('button', { type: 'button', class: 'rk-read', disabled: !total, title: 'Read every line in full, with why each one got through', onclick: () => openReadout(s, 'Scope readout') }, 'Read')));
    }
    if (m.type === 'printer') {
      const s = ins.in;
      const lines = readoutLines(s, { typeLabel });
      return h('div', { class: 'rk-face' },
        h('div', { class: 'rk-paper', tabindex: '0', 'aria-label': 'The paper roll' },
          !s ? h('p', { class: 'rk-paper-idle' }, '— patch a cable into IN —') : !lines.length ? h('p', { class: 'rk-paper-idle' }, '— nothing to print —')
            : lines.slice(0, 40).map((l, i) => h('div', { class: 'rk-paper-line' },
              h('p', {}, h('b', {}, `${String(i + 1).padStart(2, '0')}${l.score != null ? ` · ${l.score.toFixed(2)}` : ''}`), ' ', l.text),
              l.trail.length > 0 && h('small', {}, l.trail.map((t) => `${t.kind === 'weigh' ? '⚖' : t.kind === 'cite' ? (t.ok ? '↳' : '?') : t.kind === 'meaning' ? '≈' : t.ok ? '✓' : '✗'} ${t.text}`).join('  ')))),
          lines.length > 40 && h('p', { class: 'rk-paper-idle' }, `— ${lines.length - 40} more: tear it off to read them all —`)),
        h('div', { class: 'rk-switchrow' },
          Led('lines', lines.length, 'amber'),
          h('button', { type: 'button', class: 'rk-read', disabled: !lines.length, title: 'Tear it off: read it all in a tray, find in it, copy it', onclick: () => openReadout(s, 'Teleprinter') }, 'Tear off')));
    }
    if (m.type === 'meter') {
      const s = ins.in;
      const count = !s ? 0 : s.kind === 'findings' ? s.findings.length : s.rows.length;
      const top = !s ? 0 : s.kind === 'findings' ? Math.max(0, ...s.findings.map((f) => f.score ?? 0)) : Math.max(0, ...s.rows.map((r) => r._w?.score ?? 0));
      return h('div', { class: 'rk-face' }, Vu(count, top));
    }
    if (m.type === 'complement') {
      const type = rows(ins.in).find((r) => r.type)?.type;
      return h('div', { class: 'rk-face' },
        h('div', { class: 'rk-glyph', title: 'Everything else' }, 'Aᶜ'),
        h('div', { class: 'rk-readout' }, type ? typeLabel(type, 2).toLowerCase() : '—'),
        Led('out', rows(outs.out).length, 'green'));
    }
    if (m.type === 'neighbours') {
      return h('div', { class: 'rk-face' },
        Knob({ label: 'hops', options: [1, 2, 3], value: Number(p.hops ?? 1), onChange: (v) => set({ hops: v }), small: true }),
        h('div', { class: 'rk-leds col' }, Led('ring', rows(outs.ring).length, 'amber'), Led('ball', rows(outs.ball).length, 'green')));
    }
    if (m.type === 'triads') {
      const c = rows(outs.closed).length, o = rows(outs.open).length;
      return h('div', { class: 'rk-face' },
        TriadGlyph(c, o),
        h('div', { class: 'rk-leds col' }, Led('closed', c, 'green'), Led('open', o, 'red')));
    }
    if (m.type === 'prism') {
      const counts = ['1', '2', '3'].map((k) => rows(outs[k]).length);
      return h('div', { class: 'rk-face' }, PrismGlyph(counts), h('div', { class: 'rk-leds col' }, counts.map((c, i) => Led(`#${i + 1}`, c, ['red', 'amber', 'green'][i]))));
    }
    if (m.type === 'venn') return h('div', { class: 'rk-face' }, VennFace(ins));
    if (m.type === 'spectrum') {
      const numeric = Object.keys(FIELDS).filter(isNumeric);
      return h('div', { class: 'rk-face' }, SpectrumFace(ins.in, p.field ?? 'degree'),
        Knob({ label: 'band', options: numeric, value: p.field ?? 'degree', show: (f) => FIELDS[f], onChange: (v) => set({ field: v }), small: true }));
    }
    if (m.type === 'plotter') {
      return h('div', { class: 'rk-face' }, PlotterFace(ins.in, p.ink ?? 'blue'),
        Toggle(['blue', 'red', 'black'], p.ink ?? 'blue', (v) => set({ ink: v })));
    }
    if (m.type === 'patchbay') return Patchbay(m, ins, outs);
    return h('div', { class: 'rk-face' });
  }

  function Patchbay(m, ins, outs) {
    const label = (port, dir) => {
      const c = patch.cables.find((x) => (dir === 'in' ? x.to.m === m.id && x.to.port === port : x.from.m === m.id && x.from.port === port));
      if (!c) return '—';
      const other = patch.modules.find((x) => x.id === (dir === 'in' ? c.from.m : c.to.m));
      return other ? MODULES[other.type].label : '—';
    };
    return h('div', { class: 'rk-face rk-bay' },
      MODULES.patchbay.ins.map((port) => h('div', { class: 'rk-bay-col' },
        h('small', {}, label(port, 'in')), Jack(m, port, 'in', ins[port]),
        h('span', { class: 'rk-normal', title: 'Normalled: what goes in comes out below' }, '↓'),
        Jack(m, port, 'out', outs[port]), h('small', {}, label(port, 'out')))));
  }


  /* ------------------------------------------------------ set and graph faces */
  function TriadGlyph(closed, open) {
    const box = svg('svg', { viewBox: '0 0 64 40', class: 'rk-glyph-svg' });
    const tri = (x, shut, lit) => {
      const pts = [[x, 6], [x - 11, 32], [x + 11, 32]];
      const g = svg('g', { class: `rk-tri${lit ? ' lit' : ''}` }, box);
      svg('line', { x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] }, g);
      svg('line', { x1: pts[0][0], y1: pts[0][1], x2: pts[2][0], y2: pts[2][1] }, g);
      if (shut) svg('line', { x1: pts[1][0], y1: pts[1][1], x2: pts[2][0], y2: pts[2][1] }, g);
      else svg('line', { x1: pts[1][0], y1: pts[1][1], x2: pts[2][0], y2: pts[2][1], class: 'gap' }, g);
      for (const [cx, cy] of pts) svg('circle', { cx, cy, r: 3 }, g);
    };
    tri(17, true, closed > 0);
    tri(47, false, open > 0);
    return box;
  }
  function PrismGlyph(counts) {
    const box = svg('svg', { viewBox: '0 0 64 40', class: 'rk-glyph-svg' });
    const total = counts.reduce((a, b) => a + b, 0);
    svg('line', { x1: 2, y1: 20, x2: 24, y2: 20, class: `rk-beam${total ? ' lit' : ''}` }, box);
    svg('path', { d: 'M24,6 L38,34 L10,34 Z', class: 'rk-prism' }, box);
    ['#e5402a', '#f2a516', '#39d353'].forEach((c, i) => svg('line', { x1: 32, y1: 20, x2: 62, y2: 8 + i * 12, stroke: c, class: `rk-ray${counts[i] ? ' lit' : ''}` }, box));
    return box;
  }
  function VennFace(ins) {
    const sets = ['a', 'b', 'c'].map((k) => (ins[k]?.kind === 'rows' ? ins[k].rows : ins[k] ? [] : null));
    const v = vennCounts(sets);
    const box = svg('svg', { viewBox: '0 0 120 96', class: 'rk-venn' });
    svg('rect', { x: 1, y: 1, width: 118, height: 94, rx: 4, class: 'rk-paper' }, box);
    const C = { a: [46, 38], b: [74, 38], c: [60, 62] };
    for (const [k, [cx, cy]] of Object.entries(C)) {
      svg('circle', { cx, cy, r: 24, class: `rk-venn-c ${k}${sets['abc'.indexOf(k)] ? ' on' : ''}` }, box);
      const t = svg('text', { x: cx + (k === 'a' ? -30 : k === 'b' ? 30 : 0), y: cy + (k === 'c' ? 34 : -22), class: 'rk-venn-k' }, box);
      t.textContent = k.toUpperCase();
    }
    const at = { a: [38, 32], b: [82, 32], c: [60, 76], ab: [60, 28], ac: [47, 56], bc: [73, 56], abc: [60, 47] };
    for (const [k, [x, y]] of Object.entries(at)) {
      const t = svg('text', { x, y, class: `rk-venn-n${v[k] ? '' : ' zero'}` }, box);
      t.textContent = String(v[k]);
    }
    return box;
  }
  function SpectrumFace(sig, field) {
    const rowsIn = sig?.kind === 'rows' ? sig.rows : [];
    const sp = spectrumOf(rowsIn, field, 12);
    const box = svg('svg', { viewBox: '0 0 120 64', class: 'rk-spectrum' });
    svg('rect', { x: 0, y: 0, width: 120, height: 64, rx: 6, class: 'rk-spec-bg' }, box);
    for (let y = 12; y < 56; y += 11) svg('line', { x1: 6, y1: y, x2: 114, y2: y, class: 'rk-spec-grid' }, box);
    const w = sp.bins.length ? 108 / sp.bins.length : 0;
    sp.bins.forEach((b, i) => {
      const hgt = sp.max ? Math.max(b.n ? 2 : 0, (b.n / sp.max) * 46) : 0;
      // Segmented bars, like an old graphic equaliser.
      for (let y = 0; y < hgt; y += 4) svg('rect', { x: 6 + i * w + 1, y: 54 - y - 3, width: Math.max(1, w - 2), height: 3, class: `rk-spec-seg${y > 34 ? ' hot' : y > 22 ? ' warm' : ''}` }, box);
    });
    const label = svg('text', { x: 60, y: 62, class: 'rk-spec-text' }, box);
    label.textContent = sp.count ? `${sp.lo?.toFixed?.(sp.hi - sp.lo < 3 ? 2 : 0)} … ${sp.hi?.toFixed?.(sp.hi - sp.lo < 3 ? 2 : 0)}` : 'NO SIGNAL';
    return h('div', { class: 'rk-spec-wrap', title: sp.count ? `${n(sp.count, 'row')} on ${FIELDS[field]}` : 'Patch a cable into IN' }, box);
  }
  function PlotterFace(sig, ink) {
    const rowsIn = sig?.kind === 'rows' ? sig.rows : sig?.kind === 'findings' ? sig.findings.flatMap((f) => f.rows ?? []) : [];
    const lay = plotLayout(graphOf(facts), rowsIn, { max: 40 });
    const W = 200, H = 130;
    const box = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: `rk-plot ink-${ink}` });
    svg('rect', { x: 0, y: 0, width: W, height: H, class: 'rk-plot-paper' }, box);
    for (let x = 10; x < W; x += 10) svg('line', { x1: x, y1: 0, x2: x, y2: H, class: 'rk-plot-grid' }, box);
    for (let y = 10; y < H; y += 10) svg('line', { x1: 0, y1: y, x2: W, y2: y, class: 'rk-plot-grid' }, box);
    if (!lay.nodes.length) {
      const t = svg('text', { x: W / 2, y: H / 2, class: 'rk-plot-empty' }, box);
      t.textContent = sig ? 'Nothing to plot' : 'Patch a cable into IN';
      return h('div', { class: 'rk-plot-wrap' }, box);
    }
    const P = (nd) => [8 + nd.x * (W - 16), 6 + nd.y * (H - 16)];
    const pen = svg('g', { class: 'rk-pen' }, box);
    lay.edges.forEach(([i, j], k) => {
      const [x1, y1] = P(lay.nodes[i]), [x2, y2] = P(lay.nodes[j]);
      svg('line', { x1, y1, x2, y2, class: 'rk-plot-edge', style: `--d:${(k * 0.03).toFixed(2)}s` }, pen);
    });
    lay.nodes.forEach((nd, k) => {
      const [x, y] = P(nd);
      const r = 2 + Math.min(4, nd.deg * 0.7);
      const c = svg('circle', { cx: x, cy: y, r, class: 'rk-plot-node', style: `--d:${(0.4 + k * 0.02).toFixed(2)}s` }, pen);
      svg('title', {}, c).textContent = `${nd.name} · ${n(nd.deg, 'tie')} here`;
    });
    // The busiest few get a handwritten label, like a plotter annotating its own drawing.
    [...lay.nodes].sort((a, b) => b.deg - a.deg).slice(0, 3).filter((nd) => nd.deg).forEach((nd) => {
      const [x, y] = P(nd);
      const t = svg('text', { x: x + 6, y: y - 4, class: 'rk-plot-label' }, pen);
      t.textContent = nd.name.length > 18 ? `${nd.name.slice(0, 17)}…` : nd.name;
    });
    return h('div', { class: 'rk-plot-wrap' }, box,
      h('small', {}, `${n(lay.nodes.length, 'point')} · ${n(lay.edges.length, 'tie')}${lay.more > 0 ? ` · +${lay.more} off the paper` : ''}`));
  }

  /* ------------------------------------------------------ neuro-symbolic faces (mocked Claude tools) */
  function Usage(u) { return u ? h('small', { class: 'rk-usage', title: 'An estimate only: four characters a token, at placeholder prices. No call is made.' }, `≈ ${u.inTok} in · ${u.outTok} out · $${u.cost.toFixed(4)} · mock`) : null; }
  function openPrompt(m, def) {
    const tr = traces[m.id] ?? {};
    const u = tr.usage ?? (tr.prompt ? usageOf(tr.prompt, tr.reply ?? '') : null);
    Drawer({ title: `${def.label}: the prompt`, sub: `What it would send to ${MOCK_MODEL.replace(' (mocked)', '')}. This is a mock: nothing is sent.`, wide: true,
      body: h('div', { class: 'rk-prompt' },
        h('h4', {}, 'Prompt'), h('pre', {}, tr.prompt ?? '—'),
        tr.reply ? [h('h4', {}, 'Reply (mocked)'), h('pre', {}, tr.reply)] : null,
        u ? h('p', { class: 'rz-note' }, `About ${u.inTok} tokens in and ${u.outTok} out, roughly $${u.cost.toFixed(4)} at placeholder prices. When Claude arrives (the AI plugin, alpha 0.7) your organisation’s own key and cost caps will apply.`) : null) });
  }
  function NeuroFace(m, def, ins, outs, p, set) {
    const tr = traces[m.id] ?? {};
    const Pad = (label, onclick, opts = {}) => h('button', { type: 'button', class: `rk-pad${opts.alt ? ' alt' : ''}`, disabled: opts.disabled ?? false, title: opts.title ?? label, onclick }, label);
    const promptPad = () => Pad('PROMPT', () => openPrompt(m, def), { alt: true, title: 'Show the prompt it would send' });
    const count = (sig) => (!sig ? 0 : sig.kind === 'findings' ? sig.findings.length : sig.rows.length);
    if (m.type === 'translator') {
      return h('div', { class: 'rk-face rk-neuro' },
        h('textarea', { class: 'rk-lcd-in', rows: 2, disabled: !canSet, 'aria-label': 'Your question', onchange: (e) => set({ q: e.target.value.trim() }, 'The Translator has a new question') }, p.q ?? ''),
        h('div', { class: 'rk-lcd' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'PATCH'), h('span', {}, `CONF ${Math.round((tr.confidence ?? 0) * 100)}%`)),
          h('ol', {}, (tr.steps ?? []).map((st) => h('li', {}, st))),
          tr.unknown?.length ? h('small', {}, `no word for: ${tr.unknown.slice(0, 4).join(', ')}`) : null,
          tr.clarify ? h('small', { class: 'rk-ask-back' }, `? ${tr.clarify}`) : null),
        h('div', { class: 'rk-switchrow' },
          Pad('UNFOLD', () => { unfoldTranslator(patch, m.id, env.ctx()); commit('Unfolded into the rack: read it, turn a knob, run it'); }, { disabled: !canSet, title: 'Put the proposed modules in the rack, cabled up' }),
          promptPad(), Led('out', count(outs.out), 'green')),
        Usage(tr.usage));
    }
    if (m.type === 'concept') {
      return h('div', { class: 'rk-face rk-neuro' },
        h('input', { class: 'rk-lcd-in', value: p.seed ?? '', disabled: !canSet, 'aria-label': 'The concept', placeholder: 'a concept', onchange: (e) => set({ seed: e.target.value.trim() }) }),
        h('div', { class: 'rk-lcd' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'MEANING'), h('span', {}, `CUT ${Number(p.cut ?? 0.3).toFixed(2)}`)),
          (tr.ranked ?? []).slice(0, 5).map((x) => h('div', { class: 'rk-lcd-bar' }, h('span', {}, x.name), h('i', { style: `width:${Math.round(x.sim * 100)}%` }))),
          !ins.in ? h('p', { class: 'rk-nosig' }, 'PATCH IN') : null),
        h('div', { class: 'rk-switchrow' },
          Knob({ label: 'cut', min: 0, max: 1, step: 0.05, value: Number(p.cut ?? 0.3), onChange: (v) => set({ cut: v }), small: true }),
          h('div', { class: 'rk-leds col' }, Led('near', count(outs.near), 'green'), Led('far', count(outs.far), 'amber'))));
    }
    if (m.type === 'narrator') {
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd tall' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'SUMMARY'), h('span', {}, String(p.audience ?? 'board').toUpperCase())),
          (tr.sentences ?? []).length ? h('p', {}, tr.sentences.map((st) => [st.text, ' ', h('sup', {}, st.cites.length ? `[${st.cites.slice(0, 3).map((c) => c + 1).join(',')}${st.cites.length > 3 ? '…' : ''}]` : '[?]'), ' '])) : h('p', { class: 'rk-nosig' }, 'PATCH FINDINGS IN')),
        h('div', { class: 'rk-switchrow' },
          Toggle(['board', 'team', 'public'], p.audience ?? 'board', (v) => set({ audience: v })),
          Knob({ label: 'imagination', min: 0, max: 1, step: 0.05, value: Number(p.imagination ?? 0.2), onChange: (v) => set({ imagination: v }), small: true }),
          promptPad()),
        Usage(tr.usage));
    }
    if (m.type === 'verifier') {
      const flagged = outs.flag?.findings ?? [];
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'GROUNDING'), h('span', {}, `${tr.checked ?? 0} CHK`)),
          !ins.in ? h('p', { class: 'rk-nosig' }, 'PATCH WORDS IN') : flagged.length
            ? h('ol', {}, flagged.slice(0, 3).map((f) => h('li', {}, (f.trail ?? []).filter((t) => t.ok === false).map((t) => t.text)[0] ?? 'Flagged')))
            : h('p', {}, 'ALL GROUNDED ✓')),
        h('div', { class: 'rk-leds' }, Led('ok', count(outs.ok), 'green'), Led('flag', count(outs.flag), 'red')));
    }
    if (m.type === 'critic') {
      const notes = tr.notes ?? [];
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd tall' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'REVIEW'), h('span', {}, `${notes.length} NOTE${notes.length === 1 ? '' : 'S'}`)),
          notes.length ? h('ol', {}, notes.slice(0, 4).map((x) => h('li', {}, x.text))) : h('p', {}, 'NOTHING TO ADD ✓')),
        h('div', { class: 'rk-switchrow' }, Pad('READ', () => openReadout(outs.out, 'Critic'), { disabled: !notes.length }), Led('notes', notes.length, 'amber')));
    }
    if (m.type === 'tutor') {
      const qs = tr.questions ?? [];
      const st = (tutorState[m.id] ??= { at: 0, show: false });
      const q = qs[Math.min(st.at, Math.max(0, qs.length - 1))];
      const redraw = () => env.render();
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd tall' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, q ? String(q.kind).toUpperCase() : 'TUTOR'), h('span', {}, `${qs.length ? Math.min(st.at, qs.length - 1) + 1 : 0}/${qs.length}`)),
          q ? h('p', {}, q.text) : null,
          q && st.show && q.answer ? h('small', { class: 'rk-answer' }, `→ ${q.answer}`) : null),
        h('div', { class: 'rk-switchrow' },
          Pad(st.show ? 'HIDE' : 'REVEAL', () => { st.show = !st.show; redraw(); }, { disabled: !q?.answer }),
          Pad('NEXT', () => { st.at = (st.at + 1) % Math.max(1, qs.length); st.show = false; redraw(); }, { alt: true, disabled: qs.length < 2 })));
    }
    if (m.type === 'muse') {
      const vs = tr.variants ?? [];
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd tall' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'WHAT IF'), h('span', {}, `${vs.length} IDEAS`)),
          vs.length ? h('ol', { class: 'rk-muse' }, vs.map((v, k) => h('li', {}, h('span', {}, `${v.label}: `, h('b', {}, v.count), ` (now ${v.before})`),
            canSet ? h('button', { type: 'button', class: 'rk-mini', title: v.why, onclick: () => { const fresh = museVariants({ ...patch, modules: patch.modules.filter((x) => !MODULES[x.type]?.reads) }, env.ctx())[k]; if (fresh) { fresh.apply(patch); commit(`Muse: ${v.label}`); } } }, 'TRY') : null)))
            : h('p', {}, 'PATCH A FEW MODULES AND I’LL PLAY WHAT-IF')));
    }
    if (m.type === 'roundtable') {
      const said = tr.said ?? [];
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd tall' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'ROUND TABLE'), h('span', {}, `${(p.seats ?? []).length} SEATS`)),
          !ins.in ? h('p', { class: 'rk-nosig' }, 'PATCH FINDINGS IN') : h('ol', {}, said.slice(0, 5).map((x) => h('li', {}, x.text)))),
        h('div', { class: 'rk-switchrow' }, Pad('READ', () => openReadout(outs.out, 'Round table'), { disabled: !said.length }), promptPad()));
    }
    if (m.type === 'guardrail') {
      const held = outs.hold?.findings ?? [];
      return h('div', { class: 'rk-face rk-neuro' },
        h('div', { class: 'rk-lcd tall' },
          h('div', { class: 'rk-lcd-head' }, h('span', {}, 'GUARDRAIL'), h('span', {}, String(p.audience ?? 'team').toUpperCase())),
          !ins.in ? h('p', { class: 'rk-nosig' }, 'PATCH WORDS IN') : held.length
            ? h('ol', {}, held.slice(0, 3).map((f) => h('li', {}, h('span', {}, (f.held ?? [])[0] ?? 'Held'),
              canSet ? h('button', { type: 'button', class: 'rk-mini', title: 'I’ve looked at it: let it through', onclick: () => set({ approved: [...(p.approved ?? []), f.id] }, 'Approved by a person') }, 'OK') : null)))
            : h('p', {}, 'NOTHING HELD ✓')),
        h('div', { class: 'rk-switchrow' },
          Toggle(['team', 'board', 'public'], p.audience ?? 'team', (v) => set({ audience: v })),
          h('div', { class: 'rk-leds col' }, Led('pass', count(outs.pass), 'green'), Led('hold', count(outs.hold), 'red'))),
        (p.approved ?? []).length ? h('small', { class: 'rk-usage' }, `${p.approved.length} approved by a person`) : null);
    }
    return h('div', { class: 'rk-face rk-neuro' });
  }

  /* ------------------------------------------------------ digital faces (the engines) */
  function Digital(m, def, ins) {
    const s = ins.in;
    const count = !s ? null : s.kind === 'findings' ? s.findings.length : s.rows.length;
    return h('div', { class: 'rk-face rk-glass' },
      h('div', { class: 'rk-glass-top' }, h('span', { class: 'rk-dot' }), h('span', {}, def.stage ? `Arrives in stage ${def.stage}` : 'Open slot')),
      h('p', {}, def.blurb),
      h('div', { class: 'rk-glass-meter' }, h('span', { style: `width:${count ? Math.min(100, 12 + Math.log2(count + 1) * 12) : 0}%` })),
      h('small', {}, count == null ? 'Nothing patched in yet' : `${n(count, s.kind === 'findings' ? 'finding' : 'row')} waiting at the input`));
  }

  /* ------------------------------------------------------ controls */
  function Knob({ label, options = null, value, min = 0, max = 1, step = 0.05, show = (v) => v, onChange, small = false, big = false }) {
    const discrete = !!options;
    let idx = discrete ? Math.max(0, options.indexOf(value)) : 0;
    let val = discrete ? null : Number(value);
    const frac = () => (discrete ? (options.length > 1 ? idx / (options.length - 1) : 0.5) : (val - min) / (max - min));
    const text = () => (discrete ? show(options[idx]) : val.toFixed(2));
    const dial = svg('svg', { viewBox: '0 0 60 60', class: 'rk-dial' });
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180;
      svg('line', { x1: 30 + Math.sin(a) * 25, y1: 30 - Math.cos(a) * 25, x2: 30 + Math.sin(a) * 28, y2: 30 - Math.cos(a) * 28, class: 'rk-tick' }, dial);
    }
    let pointer;
    if (big) {
      // The main input: a chunky fluted knob with a chrome skirt and a bright index line.
      svg('circle', { cx: 30, cy: 30, r: 23, class: 'rk-skirt big' }, dial);
      pointer = svg('g', {}, dial);
      const flutes = 18;
      let d = '';
      for (let i = 0; i < flutes * 2; i++) {
        const a = (i / (flutes * 2)) * Math.PI * 2, r = i % 2 ? 17.2 : 19;
        d += `${i ? 'L' : 'M'}${(30 + Math.sin(a) * r).toFixed(2)},${(30 - Math.cos(a) * r).toFixed(2)}`;
      }
      svg('path', { d: `${d}Z`, class: 'rk-cap big' }, pointer);
      svg('circle', { cx: 30, cy: 30, r: 12.5, class: 'rk-cap-top' }, pointer);
      svg('line', { x1: 30, y1: 26, x2: 30, y2: 12, class: 'rk-pointer big' }, pointer);
    } else {
      svg('circle', { cx: 30, cy: 30, r: 20, class: 'rk-skirt' }, dial);
      svg('circle', { cx: 30, cy: 30, r: 15, class: 'rk-cap' }, dial);
      pointer = svg('line', { x1: 30, y1: 30, x2: 30, y2: 13, class: 'rk-pointer' }, dial);
    }
    const out = h('span', { class: 'rk-knob-val' }, text());
    const paint = () => { pointer.setAttribute('transform', `rotate(${-135 + frac() * 270} 30 30)`); out.textContent = text(); el.setAttribute('aria-valuetext', text()); };
    const nudge = (d) => {
      if (discrete) idx = Math.min(options.length - 1, Math.max(0, idx + d));
      else val = Math.round(Math.min(max, Math.max(min, val + d * step)) / step) * step;
      paint();
    };
    const done = () => onChange(discrete ? options[idx] : Math.round(val * 100) / 100);
    const el = h('div', { class: `rk-knob${small ? ' small' : ''}${big ? ' big' : ''}`, role: 'slider', tabindex: canSet ? 0 : -1, 'aria-label': label, 'aria-disabled': String(!canSet),
      onkeydown: (e) => { if (!canSet) return; const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); nudge(d); done(); } },
      onpointerdown: (e) => {
        if (!canSet) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const y0 = e.clientY;
        let moved = 0;
        const move = (ev) => { const steps = Math.trunc((y0 - ev.clientY) / (discrete ? 14 : 6)); if (steps !== moved) { nudge(steps - moved); moved = steps; } };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); if (moved) done(); else if (discrete) { idx = (idx + 1) % options.length; paint(); done(); } };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      },
    }, dial, h('small', {}, label), out);
    paint();
    return el;
  }
  function Toggle(options, value, onChange) {
    return h('div', { class: 'rk-toggle', role: 'radiogroup' }, options.map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o === value), class: o === value ? 'on' : '', disabled: !canSet, onclick: () => { if (o !== value) onChange(o); },
    }, h('i', {}), o.toUpperCase())));
  }
  function Led(label, count, color) { return h('span', { class: `rk-led ${color}${count ? ' lit' : ''}` }, h('i', {}), h('small', {}, `${label} ${count}`)); }
  function Nixie(count) { return h('div', { class: 'rk-nixie', title: `${count} rows` }, String(Math.min(9999, count)).padStart(4, '0').split('').map((d) => h('span', {}, d))); }
  function Vu(count, top) {
    const box = svg('svg', { viewBox: '0 0 120 74', class: 'rk-vu' });
    svg('rect', { x: 2, y: 2, width: 116, height: 70, rx: 6, class: 'rk-vu-face' }, box);
    // The scale: rows on a log scale, red past 100.
    const arc = (a) => [60 + Math.sin(a) * 46, 66 - Math.cos(a) * 46];
    for (let i = 0; i <= 8; i++) {
      const a = (-50 + i * 12.5) * Math.PI / 180;
      const [x1, y1] = arc(a);
      svg('line', { x1, y1, x2: 60 + Math.sin(a) * 52, y2: 66 - Math.cos(a) * 52, class: i >= 6 ? 'rk-vu-red' : 'rk-vu-tick' }, box);
    }
    const t = Math.min(1, Math.log10(count + 1) / 2);
    const a = (-50 + t * 100) * Math.PI / 180;
    svg('line', { x1: 60, y1: 66, x2: 60 + Math.sin(a) * 50, y2: 66 - Math.cos(a) * 50, class: 'rk-vu-needle' }, box);
    svg('circle', { cx: 60, cy: 66, r: 4, class: 'rk-vu-hub' }, box);
    const label = svg('text', { x: 60, y: 30, class: 'rk-vu-text' }, box);
    label.textContent = 'VU';
    return h('div', { class: 'rk-vu-wrap' }, box, h('small', {}, `${n(count, 'row')} · top ${top ? top.toFixed(2) : '—'}`));
  }

  /* ------------------------------------------------------ cables */
  const jackAt = (mid, port, dir) => stage.querySelector(`[data-jack="${mid}|${port}|${dir}"] i`);
  const centre = (el) => {
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
  };
  const sag = (a, b) => {
    const drop = 30 + Math.hypot(b.x - a.x, b.y - a.y) * 0.22;
    return `M${a.x},${a.y} C${a.x},${a.y + drop} ${b.x},${b.y + drop} ${b.x},${b.y}`;
  };
  function drawCables() {
    const s = stage.getBoundingClientRect();
    cables.setAttribute('width', s.width);
    cables.setAttribute('height', s.height);
    cables.replaceChildren();
    for (const c of patch.cables) {
      const a = jackAt(c.from.m, c.from.port, 'out'), b = jackAt(c.to.m, c.to.port, 'in');
      if (!a || !b) continue;
      const pa = centre(a), pb = centre(b);
      const g = svg('g', { class: 'rk-cable' }, cables);
      const d = sag(pa, pb);
      svg('path', { d, class: 'rk-cable-shadow' }, g);
      svg('path', { d, class: 'rk-cable-line', stroke: c.color }, g);
      // Press a cable to lift its nearer plug: drag it to a jack to re-patch, or let go off a jack to pull it out.
      svg('path', { d, class: 'rk-cable-hit' }, g).addEventListener('pointerdown', (e) => {
        const s = stage.getBoundingClientRect(), x = e.clientX - s.left, y = e.clientY - s.top;
        // A press over a jack (a plug, or a cable sagging across one) is a press on that jack.
        const under = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest?.('[data-jack]')).find(Boolean);
        if (under) { const [jm, jport, jdir] = under.dataset.jack.split('|'); return startCable(e, { id: jm }, jport, jdir); }
        const toIn = Math.hypot(pb.x - x, pb.y - y) <= Math.hypot(pa.x - x, pa.y - y);
        startCable(e, { id: toIn ? c.to.m : c.from.m }, toIn ? c.to.port : c.from.port, toIn ? 'in' : 'out', c);
      });
      for (const p of [pa, pb]) svg('circle', { cx: p.x, cy: p.y, r: 6.5, class: 'rk-plug', fill: c.color }, g);
    }
  }

  // Pressing a jack starts a cable. Pressing an input that has a cable pulls
  // that plug out: drag it to another jack to re-patch, or let go anywhere
  // else to take the cable away (like a real modular).
  function startCable(e, m, port, dir, lifted) {
    if (!canSet || e.button > 0) return;
    e.preventDefault();
    // An output can feed many inputs, so pressing one always starts a new cable;
    // pressing an input that has a cable lifts it (press the cable itself to move an output plug).
    const held = lifted ?? (dir === 'in' ? patch.cables.filter((x) => x.to.m === m.id && x.to.port === port).at(-1) : null);
    let start = { m: m.id, port, dir }, color = null;
    if (held) {
      // The fixed end is the other end of the lifted cable.
      start = dir === 'in' ? { m: held.from.m, port: held.from.port, dir: 'out' } : { m: held.to.m, port: held.to.port, dir: 'in' };
      color = held.color;
      disconnect(patch, held.id);
      drawCables();
    }
    const fixed = jackAt(start.m, start.port, start.dir);
    if (!fixed) return;
    const from = centre(fixed);
    const temp = svg('path', { class: 'rk-cable-temp', d: '' }, cables);
    if (color) temp.setAttribute('stroke', color);
    dragFrom = start;
    const at = (ev) => { const s = stage.getBoundingClientRect(); return { x: ev.clientX - s.left, y: ev.clientY - s.top }; };
    temp.setAttribute('d', sag(from, at(e)));
    const move = (ev) => temp.setAttribute('d', sag(from, at(ev)));
    const end = (ev, cancelled) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      temp.remove();
      dragFrom = null;
      const target = cancelled ? null : document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-jack]');
      if (!target) return held ? commit('Cable pulled out') : undefined;
      const [tm, tport, tdir] = target.dataset.jack.split('|');
      if (held && tm === m.id && tport === port && tdir === dir) { connect(patch, held.from, held.to, held.color); return drawCables(); } // put back
      if (tdir === start.dir) { if (held) commit('Cable pulled out'); return env.toast(start.dir === 'out' ? 'Patch an output into an input' : 'Patch an input from an output'); }
      const a = start.dir === 'out' ? { m: start.m, port: start.port } : { m: tm, port: tport };
      const b = start.dir === 'out' ? { m: tm, port: tport } : { m: start.m, port: start.port };
      if (connect(patch, a, b, color || undefined)) commit(held ? 'Re-patched' : 'Patched');
      else { if (held) commit('Cable pulled out'); env.toast('That cable would make a loop, or those jacks don’t fit'); }
    };
    const up = (ev) => end(ev, false);
    const cancel = (ev) => end(ev, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }
  // Draw once laid out, and again whenever the racks change size.
  requestAnimationFrame(drawCables);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawCables()).observe(racks);


  /* ------------------------------------------------------ the back of the rack */
  // Turn the rack round: the power bus along the top shows which plugins feed
  // the patch (and the ones that could), and the wiring shows the patch as a
  // flow, left to right, with how many rows run along every cable.
  function Back() {
    const count = (sig) => (!sig ? 0 : sig.kind === 'findings' ? sig.findings.length : sig.rows.length);
    const feeding = {};
    for (const m of patch.modules) {
      const plugin = m.type === 'facts' ? TYPE_SOURCE[m.params?.type] : m.type === 'measure' ? LIST_SOURCE[m.params?.list] : null;
      if (!plugin) continue;
      const f = (feeding[plugin] ??= { mods: 0, rows: 0 });
      f.mods++; f.rows += count(signals[m.id]?.out);
    }
    const available = {};
    for (const e of Object.values(facts.entities)) available[e.source] = (available[e.source] ?? 0) + 1;
    const plugIds = [...new Set([...Object.keys(feeding), ...Object.keys(available)])].filter((id) => PLUGINS.some((p) => p.id === id));
    const on = env.ctx().plugins;
    const bus = h('div', { class: 'rk-bus' },
      h('span', { class: 'rk-bus-label' }, 'POWER BUS'),
      plugIds.map((id) => {
        const pl = PLUGINS.find((p) => p.id === id);
        const f = feeding[id];
        const off = on && !on.has(id);
        return h('div', { class: `rk-fuse${f ? ' live' : ''}${off ? ' off' : ''}`, style: `--tone:${pl.tone ?? '#888'}`, title: f ? `${pl.name} feeds ${n(f.mods, 'source module')} with ${n(f.rows, 'row')}` : off ? `${pl.name} is switched off for you` : `${pl.name} could feed this patch: ${n(available[id] ?? 0, 'thing')} in the fact layer` },
          h('i', {}), h('b', {}, pl.name), h('small', {}, f ? `${f.rows} rows` : `${available[id] ?? 0} facts`));
      }));

    // Columns by depth: the longest run of cables from a source.
    const ids = order(patch);
    const depth = {};
    for (const id of ids) depth[id] = Math.max(0, ...patch.cables.filter((c) => c.to.m === id).map((c) => (depth[c.from.m] ?? 0) + 1));
    const cols = [];
    for (const id of ids) (cols[depth[id]] ??= []).push(id);
    const BW = 128, BH = 52, GX = 64, GY = 18, PAD = 18;
    const W = PAD * 2 + cols.length * BW + Math.max(0, cols.length - 1) * GX;
    const H = PAD * 2 + Math.max(1, ...cols.map((c) => c.length)) * (BH + GY) - GY;
    const pos = {};
    cols.forEach((col, x) => col.forEach((id, y) => { pos[id] = { x: PAD + x * (BW + GX), y: PAD + y * (BH + GY) + ((H - PAD * 2) - (col.length * (BH + GY) - GY)) / 2 }; }));
    const box = svg('svg', { viewBox: `0 0 ${Math.max(W, 320)} ${Math.max(H, 120)}`, class: 'rk-wiring', width: Math.max(W, 320), height: Math.max(H, 120), role: 'img', 'aria-label': `The patch as a flow: ${n(patch.modules.length, 'module')}, ${n(patch.cables.length, 'cable')}` });
    const byId = Object.fromEntries(patch.modules.map((m) => [m.id, m]));
    const tags = [];
    for (const c of patch.cables) {
      const a = pos[c.from.m], b = pos[c.to.m];
      if (!a || !b) continue;
      // Each jack has its own height on the box, so wires into a three-input Venn don't pile up.
      const at = (list, port) => (list.length > 1 ? (list.indexOf(port) + 1) / (list.length + 1) : 0.5);
      const x1 = a.x + BW, y1 = a.y + BH * at(MODULES[byId[c.from.m].type].outs, c.from.port), x2 = b.x, y2 = b.y + BH * at(MODULES[byId[c.to.m].type].ins, c.to.port);
      const mid = (x1 + x2) / 2;
      const rows = count(signals[c.from.m]?.[c.from.port]);
      const g = svg('g', { class: 'rk-wire' }, box);
      svg('path', { d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, stroke: c.color, 'stroke-width': Math.min(7, 1.6 + Math.log2(rows + 1) * 0.9), class: rows ? '' : 'dead' }, g);
      // The row count rides near the far end of the wire, drawn after every wire so none hides it.
      const tx = x2 - 24, ty = y2;
      tags.push(() => {
        const tg = svg('g', { class: 'rk-wire-tagg' }, box);
        svg('rect', { x: tx - 14, y: ty - 7, width: 28, height: 14, rx: 7, class: 'rk-wire-tag', stroke: c.color }, tg);
        svg('text', { x: tx, y: ty + 3.5, class: 'rk-wire-n' }, tg).textContent = String(rows);
      });
      svg('title', {}, g).textContent = `${MODULES[byId[c.from.m].type].label} ${c.from.port} → ${MODULES[byId[c.to.m].type].label} ${c.to.port}: ${n(rows, 'row')}`;
    }
    for (const id of ids) {
      const m = byId[id], def = MODULES[m.type], { x, y } = pos[id];
      const g = svg('g', { class: `rk-node ${def.look}` }, box);
      svg('rect', { x, y, width: BW, height: BH, rx: 5, style: `--c:${CAT_TONE[def.cat]}` }, g);
      svg('rect', { x, y, width: 4, height: BH, class: 'rk-node-tab', fill: CAT_TONE[def.cat] }, g);
      const t1 = svg('text', { x: x + 12, y: y + 19, class: 'rk-node-t' }, g); t1.textContent = def.label;
      const d = describeModule(m);
      const t2 = svg('text', { x: x + 12, y: y + 35, class: 'rk-node-d' }, g); t2.textContent = d === def.label ? `${def.hp} HP · rack ${(m.rack ?? 'a').toUpperCase()}` : d.length > 20 ? `${d.slice(0, 19)}…` : d;
    }
    tags.forEach((draw) => draw());
    const used = patch.modules.reduce((sum, m) => sum + (MODULES[m.type]?.hp ?? 0), 0);
    return h('section', { class: 'rk-back' },
      h('div', { class: 'rk-back-head' },
        h('span', { class: 'rk-serial' }, h('b', {}, 'Dashi'), h('small', {}, `RHIZOME MODEL 3 · ${patch.modules.length} MODULES · ${patch.cables.length} CABLES · ${used} HP`)),
        h('small', {}, 'Seen from behind. Thicker wires carry more rows.')),
      bus,
      h('div', { class: 'rk-wiring-wrap' }, patch.modules.length ? box : h('p', { class: 'rk-nosig' }, 'Nothing wired yet')));
  }

  /* ------------------------------------------------------ the rule it makes */
  const ruleBox = h('details', { class: 'rz-panel rk-asrule' },
    h('summary', {}, compiled.rule ? 'This patch, as a rule' : 'Why this patch isn’t a rule yet'),
    compiled.rule ? h('pre', { class: 'rz-json' }, JSON.stringify(compiled.rule, null, 2)) : h('p', { class: 'rz-note' }, compiled.problem));

  if (!v2) return h('div', { class: 'rk-wrap' }, strip, h('div', { class: 'rk-work' }, drawer, flipped ? Back() : stage), ruleBox);

  /* ------------------------------------------------------ Rack 2.0: one tool tray over a wide rack */
  // One floating, draggable tray with tabs (like Teach's tool tray): Modules,
  // Neuro-symbolic and Inspect. Drag a module from it onto the rack, or click to add.
  const work = h('div', { class: 'rk-work rk2-work' }, flipped ? Back() : stage);
  stage.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/x-rk-module')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  stage.addEventListener('drop', (e) => {
    const type = e.dataTransfer?.getData('text/x-rk-module');
    if (!type || !MODULES[type] || !canSet) return;
    e.preventDefault();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const ref = target?.closest('[data-mod]');
    const caseEl = target?.closest('.rk-case');
    const made = addModule(patch, type);
    if (!made) return;
    if (ref) { const r = ref.getBoundingClientRect(); const tm = patch.modules.find((x) => x.id === ref.dataset.mod); placeModule(patch, made.id, tm?.rack ?? made.rack, tm?.id, e.clientX > r.left + r.width / 2); }
    else if (caseEl) placeModule(patch, made.id, caseEl.classList.contains('rk-b') ? 'b' : 'a');
    selected = made.id;
    commit(`${MODULES[type].label} added`);
  });
  return h('div', { class: 'rk-wrap rk2' }, strip, work, ruleBox, Tray());

  function Tray() {
    let pos = { x: null, y: 260, folded: false };
    try { pos = { ...pos, ...JSON.parse(localStorage.getItem(TRAY_KEY) ?? '{}') }; } catch { /* fine */ }
    const keep = () => { try { localStorage.setItem(TRAY_KEY, JSON.stringify(pos)); } catch { /* fine */ } };
    const minTop = () => Math.ceil((document.querySelector('#shell')?.getBoundingClientRect().bottom ?? 60) + 8);
    const tray = h('aside', { class: `rk2-tray${pos.folded ? ' folded' : ''}`, 'aria-label': 'Rack tools' });
    const place = () => {
      pos.y = Math.max(minTop(), Math.min(innerHeight - 50, pos.y));
      if (pos.x != null) { pos.x = Math.max(0, Math.min(innerWidth - 140, pos.x)); tray.style.left = `${pos.x}px`; tray.style.right = 'auto'; }
      tray.style.top = `${pos.y}px`;
    };
    place();
    requestAnimationFrame(place);
    const head = h('header', { class: 'rk2-tray-head' }, icon('dragHandle', 14), h('b', {}, 'Rack tools'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': pos.folded ? 'Open the tray' : 'Fold the tray', onclick: () => { pos.folded = !pos.folded; tray.classList.toggle('folded', pos.folded); keep(); } }, icon(pos.folded ? 'chevronDown' : 'chevronUp', 14)));
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = tray.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev) => { pos.x = ev.clientX - dx; pos.y = ev.clientY - dy; place(); };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); keep(); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
    const tabs = [['modules', 'Modules'], ['neuro', 'Neuro-symbolic'], ['inspect', 'Inspect']];
    const tabBar = h('div', { class: 'rk2-tray-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(trayTab === id), class: trayTab === id ? 'on' : '',
      onclick: () => { trayTab = id; tray.replaceWith(Tray()); } }, label, id === 'inspect' && selected ? h('i', { class: 'rk2-dot', 'aria-hidden': 'true' }) : null)));
    const body = trayTab === 'neuro' ? NeuroPanel() : trayTab === 'inspect' ? Inspector()
      : h('div', { class: 'rk2-panel' }, h('p', { class: 'rk-hint' }, 'Drag a module onto the rack, or click to add it. Click a module’s name to inspect it.'), h('div', { class: 'rk2-grid' }, addButtons(CATEGORIES.filter((c) => c !== 'Neuro-symbolic'))));
    tray.append(head, tabBar, body);
    return tray;
  }

  /** The neuro-symbolic tools: ask in words, add a tool, or wire the loop. */
  function NeuroPanel() {
    const q = h('textarea', { class: 'rk2-ask', rows: 3, placeholder: 'Ask in plain words, e.g. Who is one step away from our hubs?', disabled: !canSet });
    const firstSay = patch.modules.find((m) => m.type === 'say' && patch.cables.some((c) => c.to.m === m.id));
    return h('div', { class: 'rk2-panel' },
      h('p', { class: 'rk2-mock' }, h('b', {}, 'Mocked'), ` · ${MOCK_MODEL}. Each tool shows the prompt it would send. Claude arrives with the AI plugin.`),
      q,
      h('button', { type: 'button', class: 'rk-pad wide', disabled: !canSet, onclick: () => {
        const text = q.value.trim();
        if (!text) return env.toast('Ask a question first');
        const t = addModule(patch, 'translator', { q: text });
        selected = t.id;
        commit('The Translator proposes a patch');
      } }, 'Translate to a patch'),
      h('button', { type: 'button', class: 'rk-pad wide alt', disabled: !canSet || !firstSay, title: firstSay ? 'Narrator and Verifier after your Say: words from the findings, checked against the facts' : 'Patch a Say first', onclick: () => {
        const nm = addModule(patch, 'narrator'), vf = addModule(patch, 'verifier'), pr = addModule(patch, 'printer');
        connect(patch, { m: firstSay.id, port: 'out' }, { m: nm.id, port: 'in' });
        connect(patch, { m: nm.id, port: 'out' }, { m: vf.id, port: 'in' });
        connect(patch, { m: vf.id, port: 'flag' }, { m: pr.id, port: 'in' });
        selected = nm.id;
        commit('Wired the loop: Say → Narrator → Verifier');
      } }, 'Wire the loop after Say'),
      addButtons(['Neuro-symbolic']),
      h('dl', { class: 'rk2-kinds' },
        h('dt', {}, 'Words → rules'), h('dd', {}, 'Translator, Concept lens'),
        h('dt', {}, 'Rules → words'), h('dd', {}, 'Narrator'),
        h('dt', {}, 'Checks'), h('dd', {}, 'Verifier, Critic, Guardrail'),
        h('dt', {}, 'Learn and make'), h('dd', {}, 'Tutor, Muse, Round table')),
      h('p', { class: 'rk-hint' }, 'Neural tools read and write words; the rack’s rules count and check. Every tool keeps a person in the loop: nothing it says goes anywhere until you patch it on.'));
  }

  /** The selected module: what it is, its settings, what flows through it, and for a tool, its prompt. */
  function Inspector() {
    const m = patch.modules.find((x) => x.id === selected);
    if (!m) return h('div', { class: 'rk2-panel' }, h('p', { class: 'rk-hint' }, 'Click a module’s name in the rack to see it here: its settings, what flows in and out, and for a neuro-symbolic tool, the prompt it would send.'));
    const def = MODULES[m.type];
    const count = (sig) => (!sig ? '—' : sig.kind === 'findings' ? n(sig.findings.length, 'finding') : n(sig.rows.length, 'row'));
    const tr = traces[m.id];
    return h('div', { class: 'rk2-panel rk2-inspect' },
      h('header', {}, h('b', {}, def.label), h('small', { style: `--c:${CAT_TONE[def.cat]}` }, def.cat)),
      h('p', { class: 'rk-hint' }, def.blurb),
      h('dl', {},
        Object.entries(m.params ?? {}).filter(([, v]) => v != null && typeof v !== 'object').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]),
        def.ins.flatMap((port) => [h('dt', {}, `in ${port}`), h('dd', {}, count(inputs[m.id]?.[port]))]),
        def.outs.flatMap((port) => [h('dt', {}, `out ${port}`), h('dd', {}, count(signals[m.id]?.[port]))])),
      h('div', { class: 'rk2-row' },
        def.outs.length > 0 && h('button', { type: 'button', class: 'rk-pad', onclick: () => openReadout(signals[m.id]?.[def.outs[0]], `${def.label} · ${def.outs[0]}`) }, 'Read out'),
        tr?.prompt && h('button', { type: 'button', class: 'rk-pad alt', onclick: () => openPrompt(m, def) }, 'Prompt'),
        canSet && m.type !== 'patchbay' && h('button', { type: 'button', class: 'rk-pad', onclick: () => { removeModule(patch, m.id); selected = null; commit(`${def.label} taken out`); } }, 'Remove')));
  }
}

export { describeModule };
