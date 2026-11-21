import { h } from '../ui/dom.js';
import { icon, SECTION_ICONS } from '../ui/icons.js';
import { PHOSPHOR } from '../ui/phosphor.js';
import { uiAlert, uiConfirm, uiForm, uiPanel } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { BUILT_IN_PLUGINS } from '../plugins.js';
import {
  STATUSES, CATEGORIES, FIELD_TYPES, TIERS, manifestProblems, packageOf, manifestFromPackage, compareVersions, bumpVersion,
} from '../platform/pluginRegistry.js';

/**
 * Platform admin → Plugins: every plugin on the platform, and a designer
 * for each one (#plugins/<id>): what it is called and how it looks, its
 * features (and which plans get them), its data model, its versions, and
 * its package (export, update from a file, reset or uninstall).
 *
 * The designer edits a working copy; Save keeps it (same version), and
 * Release makes it the next version, keeping the one before for rollback.
 */
const TIER_LABEL = { free: 'Free', basic: 'Basic', standard: 'Standard', custom: 'Custom' };
const TONES = ['#3e8fa6', '#2c4fa3', '#b05bd8', '#ef7f2d', '#c8432f', '#e35a2c', '#4da65c', '#56657f', '#0f7ea8', '#a1462e', '#5b6b2f', '#8a3fa0'];
const fill = (el, ...c) => el.replaceChildren(...c.flat(Infinity).filter((x) => x != null && x !== false));
const statusOf = (id) => STATUSES.find((s) => s.id === id) ?? STATUSES[0];
const download = (name, data) => {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

export async function PluginsAdmin({ call, sub, rerender, previewOrg = null }) {
  const box = h('div', { class: 'plugin-admin' }, h('p', { class: 'muted' }, 'Loading the plugins…'));
  let data;
  try {
    data = await call('GET', '/api/admin/plugins');
    data.previewOrg = previewOrg;
  } catch (err) {
    box.replaceChildren(h('p', { class: 'alert alert-error' }, err.message));
    return box;
  }
  if (sub && data.plugins[sub]) box.replaceChildren(Designer({ call, data, id: sub, rerender }));
  else box.replaceChildren(List({ call, data, rerender }));
  return box;
}

/* ---------------------------------------------------------------- the list */

function List({ call, data, rerender }) {
  const all = Object.values(data.plugins);
  const byCat = CATEGORIES.map((c) => [c, all.filter((m) => (m.category ?? 'Other') === c)]).filter(([, l]) => l.length);
  const counts = { installed: all.filter((m) => m.status === 'installed').length, draft: all.filter((m) => m.status === 'draft').length, disabled: all.filter((m) => m.status === 'disabled').length };
  return h('div', {},
    h('div', { class: 'pa-head' },
      h('div', {},
        h('h2', {}, 'Plugins'),
        h('p', { class: 'muted small' }, `${all.length} plugins: ${counts.installed} installed, ${counts.draft} in development, ${counts.disabled} switched off. Open one to change its look, features, data model and versions.`)),
      h('div', { class: 'pa-actions' },
        h('button', { class: 'btn btn-sm', onclick: () => installDialog({ call, data, rerender }) }, icon('package', 15), 'Install or update…'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => newPlugin({ call, rerender }) }, icon('plus', 15), 'New plugin'))),
    h('div', { class: 'pa-cards' }, byCat.flatMap(([, list]) => list).map((m) => PluginCard(m, data))));
}

/** Sub-plugins and owned documents come from the built-in list (src/plugins.js) or the manifest. */
const parentOf = (m) => { const id = BUILT_IN_PLUGINS.find((p) => p.id === m.id)?.parent ?? m.parent; return id && BUILT_IN_PLUGINS.find((p) => p.id === id); };
const ownsOf = (m) => BUILT_IN_PLUGINS.find((p) => p.id === m.id)?.owns ?? (m.dataModel?.docs ?? []).map((d) => d.name).filter(Boolean);

function PluginCard(m, data) {
  const st = statusOf(m.status);
  const cols = (m.dataModel?.docs ?? []).reduce((n, d) => n + (d.collections?.length ?? 0), 0);
  return h('a', { class: `pa-card status-${m.status}`, href: `#plugins/${m.id}`, style: `--tone:${m.look?.tone}` },
    h('span', { class: 'pa-tile' }, icon(m.look?.icon, 22)),
    h('span', { class: 'pa-card-text' },
      h('strong', {}, m.name),
      h('span', { class: 'pa-meta' },
        h('span', { class: 'pa-ver' }, `v${m.version}`),
        h('span', { class: `pa-status ${m.status}` }, st.label),
        h('span', { class: 'muted' }, `${m.category ?? 'Other'} · ${m.core ? 'core' : m.builtIn ? 'built in' : 'installed'}`),
        parentOf(m) && h('span', { class: 'badge badge-ghost badge-sm', title: 'A sub-plugin: it lives inside this plugin and only works when it is on' }, `Inside ${parentOf(m).name}`)),
      ownsOf(m).length > 0 && h('span', { class: 'pa-owns muted small' }, `Owns ${ownsOf(m).join(', ')}`),
      h('span', { class: 'pa-blurb' }, m.blurb || 'No description yet.'),
      h('span', { class: 'pa-stats' },
        h('span', {}, icon('features', 13), `${(m.features ?? []).filter((f) => f.enabled !== false).length}/${(m.features ?? []).length} features`),
        h('span', {}, icon('database', 13), `${cols} collections`),
        h('span', {}, icon('people', 13), m.core ? 'Every org' : `${data.usage?.[m.id] ?? 0} of ${data.orgs} orgs`))));
}

async function newPlugin({ call, rerender }) {
  const v = await uiForm({
    title: 'Start a new plugin', message: 'It starts as a draft, with one list of records. Shape it in the designer, then release it.', ok: 'Create',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Partner Directory' },
      { name: 'id', label: 'Id', required: true, placeholder: 'partner-directory', help: 'Lowercase letters, digits and dashes. It can’t change later.', pattern: '[a-z][a-z0-9\\-]{1,39}' },
    ],
    validate: async (x) => { await call('POST', '/api/admin/plugins/new', { id: x.id, name: x.name }); },
  });
  if (v) { location.hash = `plugins/${v.id}`; rerender(); }
}

/* ---------------------------------------------------------------- install / update */

async function installDialog({ call, data, rerender, target = null }) {
  let parsed = null;
  const preview = h('div', { class: 'pa-install-preview muted small' }, 'Choose a .json package exported from Dashi, or paste one below.');
  const text = h('textarea', { class: 'textarea w-full pa-json', rows: 6, placeholder: '{ "dashiPlugin": 1, "manifest": { … } }', oninput: () => read(text.value) });
  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'file-input file-input-sm w-full', onchange: async (e) => { const f = e.target.files[0]; if (f) { text.value = await f.text(); read(text.value); } } });
  function read(raw) {
    parsed = null;
    try {
      const m = manifestFromPackage(JSON.parse(raw));
      const problems = manifestProblems(m, { installing: true });
      const current = data.plugins[m?.id];
      if (target && m?.id !== target) throw new Error(`This package is for “${m?.id}”, not ${target}.`);
      if (problems.length) throw new Error(problems.join(' '));
      parsed = m;
      const newer = !current || compareVersions(m.version, current.version) > 0;
      preview.className = `pa-install-preview ${newer ? 'ok' : 'warn'}`;
      fill(preview,
        h('span', { class: 'pa-tile', style: `--tone:${m.look?.tone ?? '#56657f'}` }, icon(m.look?.icon ?? 'sec-plugins', 20)),
        h('span', {}, h('strong', {}, `${m.name} ${m.version}`), h('br'),
          current
            ? (newer ? `Updates ${current.name} from ${current.version}. The current version is kept, so you can roll back.` : `${current.name} is already at ${current.version}. Raise the version in the package to update it.`)
            : `A new plugin with ${(m.features ?? []).length} features and ${(m.dataModel?.docs ?? []).length} documents. It installs switched on; you can switch it off in the designer.`));
    } catch (err) {
      preview.className = 'pa-install-preview bad';
      preview.textContent = raw.trim() ? err.message.replace(/^Unexpected.*JSON.*$/, 'That isn’t valid JSON.') : 'Choose a .json package exported from Dashi, or paste one below.';
    }
  }
  const out = await uiPanel({
    title: target ? `Update ${data.plugins[target].name} from a package` : 'Install or update a plugin',
    message: 'A package is a plugin’s manifest: its features, look and data model. Installing one never runs code.',
    ok: target ? 'Update' : 'Install', cancel: 'Cancel',
    build: (set) => {
      const res = h('div', { class: 'pa-install' }, file, text, preview);
      text.addEventListener('input', () => set(parsed));
      file.addEventListener('change', () => setTimeout(() => set(parsed), 50));
      set(null);
      return res;
    },
  });
  if (!out) return;
  try {
    const r = await call('POST', '/api/admin/plugins/install', { package: out });
    toast(r.updated ? `${r.plugin.name} updated to ${r.plugin.version}` : `${r.plugin.name} installed`, 'ok');
    location.hash = `plugins/${r.plugin.id}`;
    rerender();
  } catch (err) {
    uiAlert(err.message, { title: 'Not installed', kind: 'error' });
  }
}

/* ---------------------------------------------------------------- the designer */

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'look', label: 'Look and feel', icon: 'brush' },
  { id: 'features', label: 'Features', icon: 'features' },
  { id: 'data', label: 'Data model', icon: 'database' },
  { id: 'versions', label: 'Versions', icon: 'history' },
  { id: 'package', label: 'Package', icon: 'package' },
];

function Designer({ call, data, id, rerender }) {
  const saved = data.plugins[id];
  let m = structuredClone(saved);
  let tab = sessionStorage.getItem('pa-tab') ?? 'overview';
  let dirty = false;
  const root = h('div', { class: 'pa-designer', style: `--tone:${m.look.tone}` });

  const say = (name) => window.dispatchEvent(new CustomEvent(name, { detail: { name: `plugin:${id}` } }));
  const touch = (fn, redraw = false) => { fn(m); if (!dirty) say('toolbox:save-pending'); dirty = true; if (redraw) draw(); else { paintBar(); paintPreview(); } };
  const bar = h('div', { class: 'pa-savebar' });
  const previewBox = h('aside', { class: 'pa-preview' });

  async function save() {
    const problems = manifestProblems(m);
    if (problems.length) return uiAlert(problems.join('\n'), { title: 'Fix these first', kind: 'error' });
    try {
      const r = await call('PUT', `/api/admin/plugins/${id}`, m);
      Object.assign(saved, r.plugin);
      m = structuredClone(r.plugin);
      dirty = false;
      say('toolbox:saved');
      toast('Plugin saved', 'ok');
      draw();
    } catch (err) { uiAlert(err.message, { title: 'Not saved', kind: 'error' }); }
  }
  async function release() {
    if (dirty) await save();
    if (dirty) return;
    const v = await uiForm({
      title: `Release ${m.name}`, message: `Now at ${m.version}. The current version is kept, so you can roll back.`, ok: 'Release',
      fields: [
        { name: 'part', label: 'What kind of change', type: 'select', value: 'minor', options: [
          { id: 'patch', label: `Fix: ${bumpVersion(m.version, 'patch')}` },
          { id: 'minor', label: `New features: ${bumpVersion(m.version, 'minor')}` },
          { id: 'major', label: `Big change: ${bumpVersion(m.version, 'major')}` }] },
        { name: 'notes', label: 'What changed', type: 'textarea', placeholder: 'For the changelog', required: true },
      ],
    });
    if (!v) return;
    try {
      const r = await call('POST', `/api/admin/plugins/${id}/release`, v);
      toast(`${r.plugin.name} ${r.plugin.version} released`, 'ok');
      rerender();
    } catch (err) { uiAlert(err.message, { title: 'Not released', kind: 'error' }); }
  }

  function paintBar() {
    fill(bar,
      h('a', { class: 'btn btn-sm btn-ghost', href: '#plugins' }, '← All plugins'),
      h('span', { class: 'pa-title' }, h('span', { class: 'pa-tile' }, icon(m.look.icon, 18)), h('strong', {}, m.name), h('span', { class: 'pa-ver' }, `v${m.version}`), h('span', { class: `pa-status ${m.status}` }, statusOf(m.status).label)),
      h('span', { class: 'spacer' }),
      dirty ? h('span', { class: 'pa-dirty' }, 'Unsaved changes') : h('span', { class: 'muted small' }, 'All changes saved'),
      dirty && h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await uiConfirm('Throw away your unsaved changes?')) { m = structuredClone(saved); dirty = false; say('toolbox:save-sent'); draw(); } } }, 'Discard'),
      h('button', { class: 'btn btn-sm', disabled: !dirty, onclick: save }, 'Save'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: release }, icon('branch', 14), 'Release…'));
  }

  function paintPreview() {
    root.style.setProperty('--tone', m.look.tone);
    fill(previewBox,
      h('p', { class: 'pa-preview-label' }, 'Preview'),
      h('div', { class: 'pa-prev-header' },
        h('span', { class: 'shell-link', style: `--tone:${m.look.tone}` }, icon(m.look.icon, 18), h('span', {}, m.short || m.name))),
      h('div', { class: 'card pa-prev-card', style: `--tone:${m.look.tone}` },
        h('div', { class: 'pa-prev-band' }),
        h('div', { class: 'pa-prev-body' },
          h('div', { class: 'pa-prev-title' }, h('span', { class: `tone-tile${m.look.accent === 'solid' ? ' solid' : ''}` }, icon(m.look.icon, 22)), h('strong', {}, m.name)),
          h('p', {}, m.blurb || 'Describe the plugin under Overview.'),
          h('small', {}, `${(m.features ?? []).filter((f) => f.enabled !== false).length} features on · v${m.version}`))),
      h('p', { class: 'muted small' }, 'How it shows in the header and on an organisation’s dashboard.'),
      !m.builtIn && data.previewOrg && h('a', { class: 'btn btn-sm w-full', href: `/auth/switch?org=${encodeURIComponent(data.previewOrg.id)}&next=${encodeURIComponent(`/plugin.html?id=${m.id}`)}`, target: '_blank', title: `Open its page in ${data.previewOrg.name}` }, icon('eye', 14), 'Open its page'));
  }

  function draw() {
    sessionStorage.setItem('pa-tab', tab);
    paintBar();
    paintPreview();
    const body = { overview: Overview, look: Look, features: Features, data: DataModel, versions: Versions, package: Package }[tab]({ m, touch, call, data, id, rerender, saved, isDirty: () => dirty });
    fill(root, bar,
      h('div', { class: 'pa-tabs', role: 'tablist' }, TABS.map((t) => h('button', { role: 'tab', 'aria-selected': String(t.id === tab), class: t.id === tab ? 'on' : '', onclick: () => { tab = t.id; draw(); } }, icon(t.icon, 15), t.label))),
      h('div', { class: 'pa-split' }, h('div', { class: 'pa-body' }, body), previewBox));
  }
  window.onbeforeunload = () => (dirty ? true : undefined);
  draw();
  return root;
}

/* ---------------------------------------------------------------- designer tabs */

const field = (label, input, help) => h('label', { class: 'pa-field' }, h('span', { class: 'pa-label' }, label), input, help && h('small', { class: 'muted' }, help));
const text = (value, oninput, extra = {}) => h('input', { class: 'input input-sm w-full', value: value ?? '', oninput: (e) => oninput(e.target.value), ...extra });

function Overview({ m, touch }) {
  return h('div', { class: 'pa-form' },
    h('div', { class: 'pa-row2' },
      field('Name', text(m.name, (v) => touch((x) => { x.name = v; }))),
      field('Short name', text(m.short, (v) => touch((x) => { x.short = v; }), { maxlength: 24 }), 'Beside its icon in the header.')),
    field('Description', h('textarea', { class: 'textarea textarea-sm w-full', rows: 3, value: m.blurb ?? '', oninput: (e) => touch((x) => { x.blurb = e.target.value; }) }), 'On the dashboard card, and in Organisation → Plugins.'),
    h('div', { class: 'pa-row2' },
      field('Category', h('select', { class: 'select select-sm w-full', onchange: (e) => touch((x) => { x.category = e.target.value; }) }, CATEGORIES.map((c) => h('option', { selected: c === m.category }, c)))),
      field('Status', h('select', { class: 'select select-sm w-full', disabled: m.core, onchange: (e) => touch((x) => { x.status = e.target.value; }, true) }, STATUSES.map((s) => h('option', { value: s.id, selected: s.id === m.status }, s.label))), m.core ? 'A core plugin is always on.' : statusOf(m.status).hint)),
    !m.builtIn && field('For each organisation', h('span', { class: 'pa-check' },
      h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: !m.defaultOff, onchange: (e) => touch((x) => { x.defaultOff = !e.target.checked; }, true) }),
      ' On unless the org switches it off'), m.defaultOff ? 'Off until an organisation switches it on in Organisation → Plugins.' : 'On for every organisation whose plan includes it.'),
    h('div', { class: 'pa-row2' },
      field('Author', text(m.author, (v) => touch((x) => { x.author = v; }))),
      field('Web page', text(m.homepage, (v) => touch((x) => { x.homepage = v; }), { type: 'url', placeholder: 'https://' }))),
    h('div', { class: 'pa-facts' },
      fact('Id', h('code', {}, m.id)), fact('Page', h('code', {}, m.href)), fact('Kind', m.core ? 'Core (always on)' : m.builtIn ? 'Built in' : 'Installed from a package or the designer')),
    !m.builtIn && h('div', { class: 'pa-plans' },
      h('span', { class: 'pa-label' }, 'Plans that include it'),
      h('div', { class: 'pa-tiers' }, TIERS.map((t) => h('label', { class: 'pa-tier' },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs checkbox-primary', checked: m.plans?.[t] !== false, onchange: (e) => touch((x) => { x.plans = { ...(x.plans ?? {}), [t]: e.target.checked }; }) }), TIER_LABEL[t]))),
      h('small', { class: 'muted' }, 'Built-in plugins follow Platform admin → Plans.')));
}
const fact = (label, value) => h('div', { class: 'pa-fact' }, h('span', { class: 'muted small' }, label), h('span', {}, value));

function Look({ m, touch }) {
  const names = [...Object.keys(SECTION_ICONS).filter((n) => n.startsWith('sec-')), ...Object.keys(PHOSPHOR)];
  let filter = '';
  const grid = h('div', { class: 'pa-icons' });
  const paintGrid = () => grid.replaceChildren(...names.filter((n) => !filter || n.toLowerCase().includes(filter)).map((n) =>
    h('button', { type: 'button', class: `pa-icon${n === m.look.icon ? ' on' : ''}`, title: n, 'aria-label': n, onclick: () => { touch((x) => { x.look.icon = n; }); paintGrid(); } }, icon(n, 20))));
  paintGrid();
  const swatches = h('div', { class: 'pa-swatches' });
  const paintSw = () => swatches.replaceChildren(...TONES.map((t) => h('button', { type: 'button', class: `pa-swatch${t === m.look.tone ? ' on' : ''}`, style: `background:${t}`, 'aria-label': t, onclick: () => { touch((x) => { x.look.tone = t; }); colour.value = t; paintSw(); } })));
  const colour = h('input', { type: 'color', class: 'dui-color', value: m.look.tone, oninput: (e) => { touch((x) => { x.look.tone = e.target.value; }); paintSw(); } });
  paintSw();
  return h('div', { class: 'pa-form' },
    field('Tone', h('div', { class: 'pa-tone' }, swatches, colour), 'The plugin’s colour: its icon, buttons, links and highlights on its pages.'),
    field('Icon tile', h('div', { class: 'pa-seg' }, ['soft', 'solid'].map((a) => h('button', { type: 'button', class: m.look.accent === a ? 'on' : '', onclick: () => touch((x) => { x.look.accent = a; }, true) }, a === 'soft' ? 'Soft tint' : 'Solid')))),
    h('div', { class: 'pa-field' },
      h('span', { class: 'pa-label' }, 'Icon'),
      h('input', { class: 'input input-sm w-full', placeholder: 'Search icons (Dashi sections first, then Phosphor)', oninput: (e) => { filter = e.target.value.trim().toLowerCase(); paintGrid(); } }),
      grid));
}

function Features({ m, touch }) {
  const rows = h('div', { class: 'pa-feats' });
  const paint = () => fill(rows,
    h('div', { class: 'pa-feat head' }, h('span', {}, 'On'), h('span', {}, 'Feature'), h('span', {}, 'Plans'), h('span', {})),
    ...(m.features ?? []).map((f, i) => h('div', { class: `pa-feat${f.enabled === false ? ' off' : ''}` },
      h('input', { type: 'checkbox', class: 'toggle toggle-xs toggle-primary', checked: f.enabled !== false, 'aria-label': `${f.label} on`, onchange: (e) => { touch((x) => { x.features[i].enabled = e.target.checked; }); paint(); } }),
      h('div', { class: 'pa-feat-text' },
        h('div', { class: 'pa-feat-line' },
          h('input', { class: 'input input-xs pa-feat-label', value: f.label, placeholder: 'Feature name', oninput: (e) => touch((x) => { x.features[i].label = e.target.value; }) }),
          h('input', { class: 'input input-xs pa-mono', value: f.id, placeholder: 'id', title: 'Its id: code asks featureOn(plugin, id)', oninput: (e) => touch((x) => { x.features[i].id = e.target.value.trim(); }) })),
        h('input', { class: 'input input-xs w-full', value: f.description ?? '', placeholder: 'What it does', oninput: (e) => touch((x) => { x.features[i].description = e.target.value; }) })),
      h('div', { class: 'pa-tiers compact' }, TIERS.map((t) => h('label', { class: 'pa-tier', title: TIER_LABEL[t] },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: f.plans?.[t] !== false, onchange: (e) => touch((x) => { x.features[i].plans = { ...(x.features[i].plans ?? {}), [t]: e.target.checked }; }) }), TIER_LABEL[t][0]))),
      h('div', { class: 'pa-row-tools' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', disabled: i === 0, 'aria-label': 'Move up', onclick: () => { touch((x) => { const [a] = x.features.splice(i, 1); x.features.splice(i - 1, 0, a); }); paint(); } }, '↑'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Remove ${f.label}`, onclick: async () => { if (await uiConfirm(`Remove the feature “${f.label || f.id}”?`)) { touch((x) => { x.features.splice(i, 1); }); paint(); } } }, icon('trash', 13))))));
  paint();
  return h('div', { class: 'pa-form' },
    h('p', { class: 'muted small' }, 'Switch a feature off to hide it on every organisation; untick a plan to leave it out of that tier. The letters are Free, Basic, Standard and Custom.'),
    rows,
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { touch((x) => { x.features.push({ id: `feature-${x.features.length + 1}`, label: '', description: '', enabled: true, plans: { free: true, basic: true, standard: true, custom: true } }); }); paint(); rows.querySelector('.pa-feat:last-child .pa-feat-label')?.focus(); } }, icon('plus', 14), 'Add a feature'));
}

function DataModel({ m, touch }) {
  const box = h('div', { class: 'pa-model' });
  const docs = () => m.dataModel.docs;
  const paint = () => fill(box, ...docs().map((d, di) => h('section', { class: 'pa-doc' },
    h('div', { class: 'pa-doc-head' },
      icon('database', 16),
      h('input', { class: 'input input-sm pa-mono', value: d.name, title: 'Document name (where it is stored)', oninput: (e) => touch((x) => { x.dataModel.docs[di].name = e.target.value; }) }),
      h('input', { class: 'input input-sm', value: d.label, placeholder: 'Label', oninput: (e) => touch((x) => { x.dataModel.docs[di].label = e.target.value; }) }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: async () => { if (await uiConfirm(`Remove the document “${d.label || d.name}” from the model?`)) { touch((x) => { x.dataModel.docs.splice(di, 1); }); paint(); } } }, icon('trash', 13))),
    h('input', { class: 'input input-xs w-full pa-doc-desc', value: d.description ?? '', placeholder: 'What this document holds', oninput: (e) => touch((x) => { x.dataModel.docs[di].description = e.target.value; }) }),
    (d.collections ?? []).map((c, ci) => h('div', { class: 'pa-coll' },
      h('div', { class: 'pa-coll-head' },
        h('input', { class: 'input input-xs pa-coll-label', value: c.label, placeholder: 'Collection', oninput: (e) => touch((x) => { x.dataModel.docs[di].collections[ci].label = e.target.value; }) }),
        h('input', { class: 'input input-xs pa-mono', value: c.id, placeholder: 'id', oninput: (e) => touch((x) => { x.dataModel.docs[di].collections[ci].id = e.target.value.trim(); }) }),
        h('span', { class: 'muted small' }, `${(c.fields ?? []).length} fields`),
        h('button', { type: 'button', class: 'btn btn-ghost btn-xs', 'aria-label': 'Remove collection', onclick: async () => { if (await uiConfirm(`Remove the collection “${c.label || c.id}”?`)) { touch((x) => { x.dataModel.docs[di].collections.splice(ci, 1); }); paint(); } } }, icon('trash', 13))),
      h('table', { class: 'table table-xs pa-fields' },
        h('thead', {}, h('tr', {}, ['Field', 'Id', 'Type', 'Required', 'Choices', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, (c.fields ?? []).map((fl, fi) => {
          const set = (fn) => touch((x) => fn(x.dataModel.docs[di].collections[ci].fields[fi]));
          return h('tr', {},
            h('td', {}, h('input', { class: 'input input-xs w-full', value: fl.label, oninput: (e) => set((y) => { y.label = e.target.value; }) })),
            h('td', {}, h('input', { class: 'input input-xs w-full pa-mono', value: fl.id, oninput: (e) => set((y) => { y.id = e.target.value.trim(); }) })),
            h('td', {}, h('select', { class: 'select select-xs w-full', onchange: (e) => { set((y) => { y.type = e.target.value; }); paint(); } }, FIELD_TYPES.map((t) => h('option', { value: t.id, selected: t.id === fl.type }, t.label)))),
            h('td', {}, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !!fl.required, onchange: (e) => set((y) => { y.required = e.target.checked; }) })),
            h('td', {}, fl.type === 'select' ? h('input', { class: 'input input-xs w-full', value: (fl.options ?? []).join(', '), placeholder: 'a, b, c', oninput: (e) => set((y) => { y.options = e.target.value.split(',').map((o) => o.trim()).filter(Boolean); }) }) : h('span', { class: 'muted' }, '—')),
            h('td', {}, h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Remove field', onclick: () => { touch((x) => { x.dataModel.docs[di].collections[ci].fields.splice(fi, 1); }); paint(); } }, icon('close', 12))));
        }))),
      h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: () => { touch((x) => { const fs = x.dataModel.docs[di].collections[ci].fields; fs.push({ id: `field${fs.length + 1}`, label: '', type: 'text', required: false }); }); paint(); } }, icon('plus', 12), 'Add a field'))),
    h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { touch((x) => { (x.dataModel.docs[di].collections ??= []).push({ id: `items${(d.collections?.length ?? 0) + 1}`, label: 'New collection', fields: [{ id: 'title', label: 'Title', type: 'text', required: true }] }); }); paint(); } }, icon('plus', 12), 'Add a collection'))));
  paint();
  return h('div', { class: 'pa-form' },
    h('p', { class: 'muted small' }, m.builtIn
      ? 'How this plugin keeps its data, document by document. For a built-in plugin this describes the code; changing it here documents a change you are making in the code.'
      : 'What this plugin keeps. Its page gives each collection a table to add and edit records, stored in the organisation’s own documents.'),
    box,
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { touch((x) => { x.dataModel.docs.push({ name: `plugin/${x.id}${x.dataModel.docs.length ? `-${x.dataModel.docs.length + 1}` : ''}`, label: 'New document', description: '', collections: [] }); }); paint(); } }, icon('plus', 14), 'Add a document'));
}

function Versions({ m, call, data, id, rerender }) {
  const kept = data.history?.[id] ?? [];
  return h('div', { class: 'pa-form' },
    h('div', { class: 'pa-facts' }, fact('Current version', h('strong', {}, m.version)), fact('Kept for rollback', `${kept.length} earlier version${kept.length === 1 ? '' : 's'}`)),
    kept.length > 0 && h('div', {},
      h('h4', { class: 'pa-sub' }, 'Earlier versions'),
      h('ul', { class: 'pa-kept' }, kept.map((k) => h('li', {},
        h('span', { class: 'pa-ver' }, `v${k.version}`), h('span', { class: 'muted small' }, `kept ${new Date(k.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-xs', onclick: async () => {
          if (!(await uiConfirm(`Go back to ${m.name} ${k.version}? The current version (${m.version}) is kept, so you can come back to it.`, { ok: 'Roll back' }))) return;
          try { await call('POST', `/api/admin/plugins/${id}/rollback`, { version: k.version }); toast(`Back to ${k.version}`, 'ok'); rerender(); } catch (err) { uiAlert(err.message, { kind: 'error' }); }
        } }, icon('history', 13), 'Roll back'))))),
    h('h4', { class: 'pa-sub' }, 'Changelog'),
    (m.changelog ?? []).length
      ? h('ol', { class: 'pa-changelog' }, m.changelog.map((c) => h('li', {}, h('div', {}, h('span', { class: 'pa-ver' }, `v${c.version}`), h('span', { class: 'muted small' }, ` ${c.date}${c.by ? ` · ${c.by}` : ''}`)), h('p', {}, c.notes))))
      : h('p', { class: 'muted' }, 'Nothing released yet. Use Release… (top right) when the draft is ready.'));
}

function Package({ m, call, data, id, rerender, isDirty }) {
  const json = JSON.stringify(packageOf(m), null, 2);
  return h('div', { class: 'pa-form' },
    h('div', { class: 'pa-pack-actions' },
      h('button', { class: 'btn btn-sm', onclick: () => download(`${m.id}-${m.version}.dashi-plugin.json`, packageOf(m)) }, icon('download', 14), 'Export package'),
      h('button', { class: 'btn btn-sm', onclick: () => installDialog({ call, data, rerender, target: id }) }, icon('upload', 14), 'Update from a package…'),
      m.builtIn && h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
        if (!(await uiConfirm(`Put ${m.name} back to how it ships with Dashi? Your version is kept, so you can roll back.`, { ok: 'Reset' }))) return;
        try { await call('POST', `/api/admin/plugins/${id}/reset`); toast('Back to Dashi’s defaults', 'ok'); rerender(); } catch (err) { uiAlert(err.message, { kind: 'error' }); }
      } }, icon('refresh', 14), 'Reset to defaults'),
      !m.builtIn && h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: async () => {
        if (!(await uiConfirm(`Uninstall ${m.name}? Organisations stop seeing it at once. Records they kept in it stay in their documents.`, { ok: 'Uninstall', danger: true }))) return;
        try { await call('DELETE', `/api/admin/plugins/${id}`); toast(`${m.name} uninstalled`, 'ok'); location.hash = 'plugins'; rerender(); } catch (err) { uiAlert(err.message, { kind: 'error' }); }
      } }, icon('trash', 14), 'Uninstall')),
    isDirty() && h('p', { class: 'alert alert-warning alert-soft small' }, 'The package below includes your unsaved changes.'),
    h('p', { class: 'muted small' }, 'A package carries the manifest only: name, look, features, data model and changelog. Move a plugin between Dashi servers by exporting it here and installing it there; bump the version to update one that is already installed.'),
    h('pre', { class: 'pa-json-view' }, json));
}
