import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell } from '../ui/Shell.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { uiConfirm, uiForm } from '../ui/dialog.js';
import { PLUGINS, enabledPlugins } from '../plugins.js';
import { loadOrg } from '../platform/docs.js';
import { loadDoc, saveDoc, session } from '../platform/storage.js';
import { currentUser } from '../platform/session.js';
import { uid } from '../core/ops.js';
import { TOOL_VIEWS } from '../pluginViews/index.js';

/**
 * The page of a plugin installed from a package or made in the plugin
 * designer (Platform admin → Plugins). Until it has a page of its own, its
 * data model drives it: each collection gets a table of records, with a
 * form built from its fields, kept in the org's own documents.
 */
const id = new URLSearchParams(location.search).get('id') ?? '';
const org = loadOrg();
const app = document.querySelector('#app');
const p = PLUGINS.find((x) => x.id === id);
const m = session()?.plugins?.[id];
const me = currentUser(org);
Shell(document.querySelector('#shell'), { current: id, org });

const DOC_NAME = /^[\w-]{1,64}(\/[\w-]{1,64})?$/;
const docName = (d) => (DOC_NAME.test(d.name) ? d.name : `plugin/${id}`);
const docs = {};
const docFor = (d) => (docs[docName(d)] ??= loadDoc(docName(d)) ?? { id: docName(d), collections: {} });
const staff = Object.values(org.staff ?? {}).sort((a, b) => a.name.localeCompare(b.name));

function render() {
  if (!p || !m) {
    return app.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty-state' },
      h('h1', {}, 'No such plugin here'),
      h('p', { class: 'muted' }, 'It may have been uninstalled, or it is still in development. The platform admin manages plugins under Platform admin → Plugins.'),
      h('a', { class: 'btn btn-sm', href: 'index.html' }, 'Back to the dashboard'))));
  }
  const usable = enabledPlugins(org).some((x) => x.id === id);
  const features = Object.entries(m.features ?? {}).filter(([, on]) => on).length;
  app.replaceChildren(h('div', { class: 'page plugin-page', style: `--tone:${m.tone}` },
    PluginHeader(id, { actions: h('span', { class: 'pa-ver' }, `v${m.version}`) }),
    !usable && h('p', { class: 'alert alert-warning alert-soft' }, m.status === 'draft'
      ? 'In development: only the platform admin sees this page until the plugin is released.'
      : 'This plugin isn’t switched on for your organisation. Its admin can switch it on under Organisation → Plugins.'),
    TOOL_VIEWS[id] && TOOL_VIEWS[id](toolCtx()),
    h(TOOL_VIEWS[id] ? 'details' : 'div', { class: `plugin-generic${TOOL_VIEWS[id] ? ' plugin-records' : ''}` },
      TOOL_VIEWS[id] && h('summary', {}, icon('table', 15), 'All records, as tables'),
      h('div', { class: 'plugin-generic-main' },
        (m.dataModel?.docs ?? []).flatMap((d) => (d.collections ?? []).map((c) => Collection(d, c))),
        !(m.dataModel?.docs ?? []).some((d) => d.collections?.length) && h('p', { class: 'empty' }, 'This plugin keeps no records yet. Its data model is set in the plugin designer.')),
      h('aside', { class: 'plugin-generic-side panel' },
        h('h2', {}, 'About'),
        h('p', { class: 'muted small' }, m.blurb || 'No description yet.'),
        h('p', { class: 'small' }, `${features} feature${features === 1 ? '' : 's'} on · ${m.category ?? 'Other'}`),
        h('p', { class: 'muted small' }, TOOL_VIEWS[id] ? 'The tables show every record this plugin keeps, field by field.' : 'This page is generated from the plugin’s data model. A plugin can ship its own page later; the records kept here stay.')))));
}

/** What a plugin's own tool view works with: its first document's records, and the forms below. */
function toolCtx() {
  const d = m.dataModel?.docs?.[0] ?? { name: `plugin/${id}`, collections: [] };
  const coll = (cid) => (d.collections ?? []).find((c) => c.id === cid) ?? { id: cid, label: cid, fields: [] };
  const canEdit = !session() || session().canEdit;
  const ctx = {
    id, org, me, canEdit, render,
    doc: (name) => docFor({ name }),
    save: (name) => saveDoc(docName({ name }), docFor({ name })),
    records: (cid) => Object.values(docFor(d).collections?.[cid] ?? {}).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    put: (cid, rec, { quiet = false } = {}) => {
      const doc = docFor(d);
      doc.collections ??= {};
      doc.collections[cid] ??= {};
      const rid = rec.id ?? uid(cid.slice(0, 4));
      const now = new Date().toISOString();
      doc.collections[cid][rid] = { ...rec, id: rid, updatedAt: now, updatedBy: me?.id ?? null, createdAt: rec.createdAt ?? now };
      saveDoc(docName(d), doc);
      if (!quiet) render();
      return rid;
    },
    remove: (cid, rid) => { delete docFor(d).collections?.[cid]?.[rid]; saveDoc(docName(d), docFor(d)); render(); },
    edit: (cid, rec = null) => edit(d, coll(cid), rec?.id ? rec : rec ? { ...rec, id: undefined, _new: true } : null),
  };
  return ctx;
}

function Collection(d, c) {
  const doc = docFor(d);
  const rows = Object.values(doc.collections?.[c.id] ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const shown = (c.fields ?? []).slice(0, 5);
  const canEdit = !session() || session().canEdit;
  return h('section', { class: 'panel plugin-coll' },
    h('div', { class: 'panel-head' },
      h('h2', {}, c.label || c.id), h('span', { class: 'badge badge-ghost' }, String(rows.length)),
      h('span', { class: 'spacer' }),
      canEdit && h('button', { class: 'btn btn-sm btn-primary', onclick: () => edit(d, c, null) }, icon('plus', 14), `Add`)),
    rows.length
      ? h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
          h('thead', {}, h('tr', {}, shown.map((f) => h('th', {}, f.label || f.id)), h('th', {}))),
          h('tbody', {}, rows.map((r) => h('tr', {},
            shown.map((f) => h('td', {}, display(f, r[f.id]))),
            h('td', { class: 'row-actions' }, canEdit && [
              h('button', { class: 'btn btn-xs btn-ghost', onclick: () => edit(d, c, r) }, icon('pencil', 13), 'Edit'),
              h('button', { class: 'btn btn-xs btn-ghost', 'aria-label': 'Delete', onclick: async () => {
                if (!(await uiConfirm(`Delete this ${singular(c.label)}?`))) return;
                delete doc.collections[c.id][r.id];
                saveDoc(docName(d), doc);
                render();
              } }, icon('trash', 13))]))))))
      : h('p', { class: 'muted' }, `No ${(c.label || 'records').toLowerCase()} yet.`));
}

const singular = (s = 'record') => s.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');

function display(f, v) {
  if (v == null || v === '') return h('span', { class: 'muted' }, '—');
  if (f.type === 'boolean') return v ? icon('check', 14) : '';
  if (f.type === 'person') return org.staff?.[v]?.name ?? '—';
  if (f.type === 'url') return h('a', { href: v, target: '_blank', rel: 'noopener' }, String(v).replace(/^https?:\/\//, '').slice(0, 40));
  if (f.type === 'list') return Array.isArray(v) ? v.join(', ') : String(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

async function edit(d, c, record) {
  const fields = (c.fields ?? []).map((f) => {
    const value = record?.[f.id] ?? (f.type === 'boolean' ? false : '');
    const base = { name: f.id, label: f.label || f.id, required: !!f.required, value };
    switch (f.type) {
      case 'longtext': return { ...base, type: 'textarea' };
      case 'number': return { ...base, type: 'number' };
      case 'date': return { ...base, type: 'date' };
      case 'boolean': return { ...base, type: 'checkbox' };
      case 'url': return { ...base, type: 'url', placeholder: 'https://' };
      case 'select': return { ...base, type: 'select', options: [{ id: '', label: '—' }, ...(f.options ?? []).map((o) => ({ id: o, label: o }))] };
      case 'person': return { ...base, type: 'select', options: [{ id: '', label: '—' }, ...staff.map((s) => ({ id: s.id, label: s.name }))] };
      case 'list': return { ...base, value: Array.isArray(value) ? value.join(', ') : value, help: 'Separate items with commas.' };
      default: return base;
    }
  });
  const isNew = !record?.id;
  const v = await uiForm({ title: isNew ? `New ${singular(c.label)}` : `Edit ${singular(c.label)}`, fields, ok: isNew ? 'Add' : 'Save', wide: fields.length > 4 });
  if (!v) return;
  for (const f of c.fields ?? []) if (f.type === 'list' && typeof v[f.id] === 'string') v[f.id] = v[f.id].split(',').map((x) => x.trim()).filter(Boolean);
  const doc = docFor(d);
  doc.collections ??= {};
  doc.collections[c.id] ??= {};
  const rid = record?.id ?? uid(c.id.slice(0, 4));
  const { _new, ...base } = record ?? {};
  doc.collections[c.id][rid] = { ...base, ...v, id: rid, updatedAt: new Date().toISOString(), updatedBy: me?.id ?? null, createdAt: record?.createdAt ?? new Date().toISOString() };
  saveDoc(docName(d), doc);
  render();
}

render();
