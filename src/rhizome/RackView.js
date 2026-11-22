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
 * Rack(env) draws it; env = { doc, save, render, ctx, canSet, toast, linkFact }.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { MODULES, CATEGORIES, FIELDS, HP, isNumeric, blankPatch, addModule, removeModule, moveModule, swapRack, inRack, rowsOf, connect, disconnect, runPatch, ruleToPatch, patchToRule, starterPatch, describeModule } from './rack.js';
import { RULES, ruleById, OPS } from './rules.js';
import { TIPS, tipById } from './tips.js';
import { ENTITY_TYPES, typeLabel } from './facts.js';
import { themeById } from './setup.js';

const svgNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, parent = null) => {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
};
const n = (count, word, plural = `${word}s`) => `${count.toLocaleString()} ${count === 1 ? word : plural}`;
const CAT_TONE = { Routing: '#56657f', Sources: '#3e8fa6', Shapers: '#ee7d2b', Logic: '#8a4fd8', Voice: '#d23c2c', Displays: '#22252b', Engines: '#2f6fd6' };
const PCTS = ['p25', 'p50', 'p75', 'p90'];
const PCT_LABEL = { p25: '25%', p50: 'median', p75: '75%', p90: '90%' };

let dragFrom = null; // { m, port, dir, x, y } while a cable is being patched

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
  const { signals, inputs } = runPatch(patch, env.ctx());
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
  const drawer = h('aside', { class: 'rk-drawer' },
    h('h4', {}, 'Modules'),
    CATEGORIES.map((cat) => h('div', { class: 'rk-cat' },
      h('small', { style: `--c:${CAT_TONE[cat]}` }, cat),
      Object.entries(MODULES).filter(([, d]) => d.cat === cat).map(([type, d]) => h('button', {
        class: `rk-add ${d.look}`, title: d.blurb, disabled: !canSet || (type === 'patchbay' && patch.modules.some((m) => m.type === 'patchbay')),
        onclick: () => { addModule(patch, type); commit(`${d.label} added`); },
      }, h('b', {}, d.label), h('span', {}, d.stage ? `Stage ${d.stage}` : d.stage === null ? 'Open' : `${d.hp} HP`))))),
    h('p', { class: 'rk-hint' }, 'Drag from a jack to a jack to patch a cable. Drag a plug to move it, or click a cable to pull it out. Drag a knob up or down, or use the arrow keys.'));

  /* ------------------------------------------------------ the twin racks */
  const stage = h('div', { class: 'rk-stage' });
  const cables = svg('svg', { class: 'rk-cables', 'aria-hidden': 'true' });
  const racks = h('div', { class: 'rk-twins' },
    Case('a', 'Rack A · controls'), Case('b', 'Rack B · screens and engines'));
  stage.append(racks, cables);

  function Case(rack, title) {
    const mods = inRack(patch, rack);
    const rows = rowsOf(mods);
    return h('section', { class: `rk-case rk-${rack}` },
      h('div', { class: 'rk-cheek' }),
      h('div', { class: 'rk-body' },
        h('div', { class: 'rk-plate' }, h('span', {}, title), h('em', {}, rack === 'a' ? 'RHIZOME' : 'MODEL 3')),
        rows.length ? rows.map((row) => h('div', { class: 'rk-row' },
          h('div', { class: 'rk-rail' }),
          h('div', { class: 'rk-mods' }, row.map((m) => Module(m)), Blank(HP - row.reduce((s, m) => s + (MODULES[m.type]?.hp ?? 10), 0))),
          h('div', { class: 'rk-rail' }))) : h('div', { class: 'rk-row' }, h('div', { class: 'rk-rail' }), h('div', { class: 'rk-mods' }, Blank(HP, rack === 'a' ? 'Add modules from the left' : 'Screens and engines land here')), h('div', { class: 'rk-rail' }))),
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
    const face = def.look === 'digital' ? Digital(m, def, ins) : Face(m, def, ins, outs, p, set);
    return h('div', { class: `rk-mod ${def.look} t-${m.type}`, style: `flex:${def.hp} 1 0;--c:${CAT_TONE[def.cat]}`, 'data-mod': m.id },
      h('header', {},
        h('i', { class: 'rk-screw' }),
        h('span', { class: 'rk-title' }, def.label),
        h('i', { class: 'rk-screw' })),
      face,
      Jacks(m, def, ins, outs),
      canSet && m.type !== 'patchbay' ? h('div', { class: 'rk-tools' },
        h('button', { title: 'Move left', onclick: () => { if (moveModule(patch, m.id, -1)) commit(); } }, '‹'),
        h('button', { title: 'Move to the other rack', onclick: () => { swapRack(patch, m.id); commit(); } }, '⇄'),
        h('button', { title: 'Move right', onclick: () => { if (moveModule(patch, m.id, 1)) commit(); } }, '›'),
        h('button', { title: 'Take it out of the rack', onclick: () => { removeModule(patch, m.id); commit(`${def.label} taken out`); } }, '×')) : null);
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
        Knob({ label: 'type', options: types, value: p.type, show: (t) => typeLabel(t, 2), onChange: (v) => set({ type: v }) }));
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
          ? Knob({ label: 'threshold', options: PCTS, value: p.pct ?? 'p25', show: (x) => `your ${PCT_LABEL[x]}`, onChange: (v) => set({ pct: v }), small: true })
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
        Toggle(['green', 'amber'], p.phosphor === 'amber' ? 'amber' : 'green', (v) => set({ phosphor: v })));
    }
    if (m.type === 'meter') {
      const s = ins.in;
      const count = !s ? 0 : s.kind === 'findings' ? s.findings.length : s.rows.length;
      const top = !s ? 0 : s.kind === 'findings' ? Math.max(0, ...s.findings.map((f) => f.score ?? 0)) : Math.max(0, ...s.rows.map((r) => r._w?.score ?? 0));
      return h('div', { class: 'rk-face' }, Vu(count, top));
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
  function Knob({ label, options = null, value, min = 0, max = 1, step = 0.05, show = (v) => v, onChange, small = false }) {
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
    svg('circle', { cx: 30, cy: 30, r: 20, class: 'rk-skirt' }, dial);
    svg('circle', { cx: 30, cy: 30, r: 15, class: 'rk-cap' }, dial);
    const pointer = svg('line', { x1: 30, y1: 30, x2: 30, y2: 13, class: 'rk-pointer' }, dial);
    const out = h('span', { class: 'rk-knob-val' }, text());
    const paint = () => { pointer.setAttribute('transform', `rotate(${-135 + frac() * 270} 30 30)`); out.textContent = text(); el.setAttribute('aria-valuetext', text()); };
    const nudge = (d) => {
      if (discrete) idx = Math.min(options.length - 1, Math.max(0, idx + d));
      else val = Math.round(Math.min(max, Math.max(min, val + d * step)) / step) * step;
      paint();
    };
    const done = () => onChange(discrete ? options[idx] : Math.round(val * 100) / 100);
    const el = h('div', { class: `rk-knob${small ? ' small' : ''}`, role: 'slider', tabindex: canSet ? 0 : -1, 'aria-label': label, 'aria-disabled': String(!canSet),
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
        const toIn = Math.hypot(pb.x - x, pb.y - y) <= Math.hypot(pa.x - x, pa.y - y);
        startCable(e, { id: toIn ? c.to.m : c.from.m }, toIn ? c.to.port : c.from.port, toIn ? 'in' : 'out', c);
      });
      for (const p of [pa, pb]) svg('circle', { cx: p.x, cy: p.y, r: 6.5, class: 'rk-plug', fill: c.color }, g);
    }
  }
  // Pressing a jack starts a cable. Pressing a jack that already has a cable
  // pulls that plug out: drag it to another jack to re-patch, or let go
  // anywhere else to take the cable away (like a real modular).
  function startCable(e, m, port, dir, lifted) {
    if (!canSet || e.button > 0) return;
    e.preventDefault();
    const held = lifted ?? patch.cables.filter((x) => (dir === 'in' ? x.to.m === m.id && x.to.port === port : x.from.m === m.id && x.from.port === port)).at(-1);
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

  /* ------------------------------------------------------ the rule it makes */
  const ruleBox = h('details', { class: 'rz-panel rk-asrule' },
    h('summary', {}, compiled.rule ? 'This patch, as a rule' : 'Why this patch isn’t a rule yet'),
    compiled.rule ? h('pre', { class: 'rz-json' }, JSON.stringify(compiled.rule, null, 2)) : h('p', { class: 'rz-note' }, compiled.problem));

  return h('div', { class: 'rk-wrap' }, strip, h('div', { class: 'rk-work' }, drawer, stage), ruleBox);
}

export { describeModule };
