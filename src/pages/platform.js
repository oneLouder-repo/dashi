import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../platform/org.js';
import { PLUGINS, applyRegistry } from '../plugins.js';
import { NetLight } from '../ui/netlight.js';
import { PluginsAdmin } from './pluginAdmin.js';
import { Wordmark } from '../ui/Wordmark.js';
import { SideNav } from '../ui/SideNav.js';
import { Drawer } from '../ui/drawer.js';
import { salesPage } from './sales.js';
import { PLAN_IDS, PLAN_PLUGINS, LIMITS, FEATURES, amount } from '../platform/plans.js';
import { statusBadge, when, KIND_LABEL, TicketThread } from '../help/support.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/dialog.js';
import { Health, Data, Email, Payments, TwoStep, Sessions, Activity, Legal } from './controlCentre.js';

/**
 * The platform's own site (the root domain): the organisations you can
 * open and, for the platform admin, the console to add organisations,
 * set their plan, suspend or remove them, and manage people's sign-in.
 * The console uses the same sidebar as the plugins, one section at a time:
 * #orgs (default), #add, #people, #plans, #requests, #support (tickets; #support/<id> one), #site (the sales site's words),
 * and the control centre (controlCentre.js): #health, #data, #email, #payments, #security (two-step sign-in, sessions, the audit), #activity, #legal.
 */
const app = document.querySelector('#app');
const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body && JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
  return out;
};
const PLANS = [{ id: 'free', label: 'Seed' }, { id: 'basic', label: 'Community' }, { id: 'standard', label: 'Organization' }, { id: 'network', label: 'Network' }, { id: 'custom', label: 'Custom' }];
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40);
const open = (o) => `/auth/switch?org=${encodeURIComponent(o.id)}&next=/`;

let session;
let lastRoute = null;
try {
  session = await (await fetch('/api/session')).json();
} catch {
  location.replace('index.html'); // No server: the local prototype.
  throw new Error('No server');
}
applyRegistry(session.plugins);
// Signed in, but two-step sign-in still wants its code.
if (session.needsCode) { location.replace('/login.html?code=1&next=/'); throw new Error('Two-step sign-in'); }

async function render() {
  const { user } = session;
  const head = h('header', { class: 'platform-head' },
    h('a', { href: '/', class: 'platform-brand', 'aria-label': 'Dashi home' }, Wordmark(22)),
    h('span', { class: 'spacer' }),
    user && NetLight(),
    user
      ? [h('span', { class: 'muted' }, user.email), h('button', { class: 'btn btn-sm', onclick: async () => { await call('POST', '/api/auth/logout'); location.reload(); } }, 'Sign out')]
      : h('a', { class: 'btn btn-sm btn-primary', href: '/login.html?next=/' }, 'Sign in'));

  // Not signed in: Dashi's own public site (sales.js).
  if (!user) return salesPage(app, 'home');

  const yours = h('section', {},
    h('h2', {}, user.isSuper ? 'All organisations' : 'Your organisations'),
    session.orgs.length
      ? h('div', { class: 'cards' }, session.orgs.map((o) => h('a', { class: 'card org-card', href: open(o) },
          h('span', { class: 'logo-initials', style: 'width:40px;height:40px;font-size:15px' }, initials(o.name)),
          h('strong', {}, o.name), h('small', { class: 'muted' }, o.url.replace(/^https?:\/\//, '')),
          o.status !== 'active' && h('span', { class: 'badge badge-warning badge-sm' }, o.status))))
      : h('p', { class: 'empty' }, 'You aren’t in any organisation yet. Ask its admin to add your email to the staff list.'));

  if (!user.isSuper) return app.replaceChildren(head, h('div', { class: 'page-main' }, h('div', { class: 'page' }, yours)));

  // A live server asks platform admins to switch on two-step sign-in before anything else.
  const twoStep = await call('GET', '/api/auth/two-step');
  if (twoStep.required && !twoStep.on) {
    return app.replaceChildren(head, h('div', { class: 'page-main' }, h('div', { class: 'page cc-gate' },
      h('h2', {}, 'One step before the admin'), h('p', { class: 'muted' }, 'This server asks platform admins to use two-step sign-in, so a stolen password isn’t enough to run the platform.'),
      TwoStep({ call, onDone: () => location.reload() }))));
  }

  const [orgs, users, requests, queue] = await Promise.all([call('GET', '/api/admin/orgs'), call('GET', '/api/admin/users'), call('GET', '/api/admin/requests'), call('GET', '/api/tickets?all=1&status=active')]);
  const waitingOnUs = queue.tickets.filter((t) => t.status === 'new' || (t.status === 'open' && !t.lastFromAdmin)).length;
  const openRequests = requests.filter((r) => r.status === 'open').length;
  const f = {
    name: h('input', { class: 'input input-sm', placeholder: 'Organisation name', required: true }),
    slug: h('input', { class: 'input input-sm', placeholder: 'address', required: true, pattern: '[a-z0-9\\-]+' }),
    plan: h('select', { class: 'select select-sm', 'aria-label': 'Plan' }, options(PLANS, 'free')),
    adminEmail: h('input', { class: 'input input-sm', type: 'email', placeholder: 'Their admin’s email' }),
    adminName: h('input', { class: 'input input-sm', placeholder: 'Their admin’s name' }),
  };
  let slugEdited = false;
  f.name.addEventListener('input', () => { if (!slugEdited) f.slug.value = slugify(f.name.value); });
  f.slug.addEventListener('input', () => { slugEdited = true; });
  const suffix = location.host;
  const u = { email: h('input', { class: 'input input-sm', type: 'email', placeholder: 'Email', required: true }), name: h('input', { class: 'input input-sm', placeholder: 'Name' }) };
  const OPTIONAL = PLUGINS.filter((p) => !p.core);
  /**
   * An org's plugins as one row of chips, in the registry's order: on (in its
   * tone), switched off by the org, paused by you, or not in its plan.
   * Click a chip to switch it on for the org or pause it.
   */
  const pluginToggles = (o) => {
    const states = OPTIONAL.map((p) => {
      const inPlan = o.included?.[p.id] !== false && !(p.installed && p.platformOff);
      const state = p.platformOff ? 'platform' : !inPlan ? 'plan' : o.paused[p.id] ? 'paused' : o.chosen[p.id] === false ? 'org' : 'on';
      return { p, state };
    });
    const on = states.filter((x) => x.state === 'on').length;
    const why = { on: 'On. Click to pause it for this organisation.', org: `Switched off by ${o.name} in its settings. Click to switch it back on.`, paused: 'Paused by you. Click to switch it on.', plan: `Not in the ${o.plan} plan. Change the plan, or give it under Own limits.`, platform: 'Switched off for the whole platform (Plugins).' };
    return h('div', { class: 'org-plugins' },
      h('div', { class: 'org-plugin-chips' }, states.map(({ p, state }) => h('button', {
        type: 'button', class: `org-plugin ${state}`, style: `--tone:${p.tone}`, disabled: state === 'plan' || state === 'platform',
        title: `${p.name}: ${why[state]}`, 'aria-pressed': String(state === 'on'), 'aria-label': `${p.name}: ${why[state]}`,
        onclick: () => act(() => call('POST', `/api/admin/orgs/${o.id}/plugins`, { plugin: p.id, on: state !== 'on' })),
      }, icon(p.icon, 16)))),
      h('span', { class: 'org-plugin-sum' }, `${on} of ${OPTIONAL.length} on`));
  };
  const act = async (fn) => { try { await fn(); await reload(); } catch (err) { uiAlert(err.message); } };

  const hash = decodeURIComponent(location.hash.slice(1));
  const route = hash.startsWith('support') ? 'support' : hash.startsWith('plugins') ? 'plugins' : hash.startsWith('legal') ? 'legal' : hash.startsWith('health') ? 'health'
    : ['orgs', 'add', 'people', 'plans', 'requests', 'site', 'security', 'data', 'email', 'payments', 'activity'].includes(hash) ? hash : 'orgs';
  const active = orgs.filter((o) => o.status === 'active').length;
  const stat = (label, value, hint) => h('div', { class: 'stat' }, h('div', { class: 'stat-title' }, label), h('div', { class: 'stat-value' }, value), hint && h('div', { class: 'stat-desc' }, hint));
  const side = SideNav({ label: 'Platform admin', sections: [
    { title: 'Platform admin', items: [
      { label: 'Organisations', sub: `${orgs.length} on the platform`, icon: 'org', href: '#orgs', on: route === 'orgs' },
      { label: 'Add an organisation', icon: 'plus', href: '#add', on: route === 'add' },
      { label: 'People who can sign in', sub: `${users.length} people`, icon: 'person', href: '#people', on: route === 'people' },
      { label: 'Plugins', sub: `${PLUGINS.length} on the platform`, icon: 'sec-plugins', href: '#plugins', on: route === 'plugins' },
      { label: 'Plans', sub: 'What each tier includes', icon: 'star', href: '#plans', on: route === 'plans' },
      { label: 'Requests', sub: 'Sign-ups, plan changes, messages', icon: 'news', href: '#requests', on: route === 'requests', badge: openRequests ? String(openRequests) : null, badgeClass: 'badge-primary' },
      { label: 'Support', sub: `${queue.tickets.length} open ticket${queue.tickets.length === 1 ? '' : 's'}`, icon: 'ticket', href: '#support', on: route === 'support', badge: waitingOnUs ? String(waitingOnUs) : null, badgeClass: 'badge-primary' },
      { label: 'Sales site', sub: 'The words on Dashi’s own site', icon: 'globe', href: '#site', on: route === 'site' },
    ] },
    { title: 'Control centre', items: [
      { label: 'Health', sub: 'The server at a glance', icon: 'gauge', href: '#health', on: route === 'health' },
      { label: 'Data and backups', sub: 'Storage, exports, restores', icon: 'database', href: '#data', on: route === 'data' },
      { label: 'Email', sub: 'Sending, DNS, the words', icon: 'mail', href: '#email', on: route === 'email' },
      { label: 'Payments', sub: 'Stripe, prices with tax', icon: 'tag', href: '#payments', on: route === 'payments' },
      { label: 'Security', sub: 'Two-step, sessions, audit', icon: 'shield', href: '#security', on: route === 'security' },
      { label: 'Activity', sub: 'Who changed what', icon: 'history', href: '#activity', on: route === 'activity' },
      { label: 'Legal', sub: 'Terms, privacy, versions', icon: 'scales', href: '#legal', on: route === 'legal' },
    ] },
    { title: 'Open an organisation', items: session.orgs.map((o) => ({ label: o.name, sub: o.url.replace(/^https?:\/\//, ''), lead: h('span', { class: 'logo-initials', style: 'width:20px;height:20px;font-size:9px' }, initials(o.name)), href: open(o) })) },
  ] });
  const sections = {};
  sections.orgs = () => h('div', {},
    h('div', { class: 'stats stats-border platform-stats' },
      stat('Organisations', orgs.length, `${active} active`),
      stat('People', users.length, `${users.filter((x) => x.is_super).length} platform admins`),
      stat('Members', orgs.reduce((n, o) => n + (o.members ?? 0), 0), 'across every organisation')),
    yours,
    allOrgs);
  sections.add = () => addOrg;
  sections.people = () => people;
  sections.security = () => h('div', {}, h('h2', {}, 'Security'), h('p', { class: 'muted small cc-lede' }, 'Your two-step sign-in, everyone signed in now, and the security audit.'), h('div', { class: 'cc-grid cc-security' }, TwoStep({ call }), Sessions({ call })), Security());
  sections.health = () => Health({ call });
  sections.data = () => Data({ call, orgs });
  sections.email = () => Email({ call });
  sections.payments = () => Payments({ call });
  sections.activity = () => Activity({ call });
  sections.legal = () => Legal({ call, sub: hash.split('/')[1] ?? null });
  sections.plans = () => Plans();
  sections.requests = () => Requests(requests, act);
  sections.site = () => SalesSite();
  sections.support = () => Support(hash.split('/')[1] ?? null);
  sections.plugins = () => {
    const holder = h('div', {}, h('p', { class: 'muted' }, 'Loading the plugins…'));
    PluginsAdmin({ call, sub: hash.split('/')[1] ?? null, rerender: () => render(), previewOrg: session.orgs[0] ?? null }).then((el) => holder.replaceChildren(el));
    return holder;
  };
  window.onhashchange = () => render();

  const addOrg = h('section', { class: 'card card-border bg-base-100 platform-card' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'Add an organisation'),
      h('form', { class: 'inline-form platform-form', onsubmit: (e) => {
        e.preventDefault();
        act(() => call('POST', '/api/admin/orgs', { name: f.name.value, slug: f.slug.value, plan: f.plan.value, adminEmail: f.adminEmail.value || null, adminName: f.adminName.value || null }));
      } },
        f.name, h('span', { class: 'slug-field' }, f.slug, h('span', { class: 'muted' }, `.${suffix}`)), f.plan, f.adminEmail, f.adminName,
        h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, icon('plus', 14), 'Add')),
      h('p', { class: 'muted small' }, 'Their admin can then sign in with that email (with Google, or a password you set below) and add their own staff.')));
  const allOrgs = h('section', {},
      h('h2', {}, 'Manage organisations'),
      h('p', { class: 'muted small' }, 'Each icon is one of the organisation’s plugins. Coloured: on. Grey: paused by you or switched off by the organisation. Dashed: not in its plan. Click one to switch it on or pause it; a paused plugin keeps its content. Change what plugins exist under Plugins.'),
      h('div', { class: 'org-plugin-legend' }, OPTIONAL.map((p) => h('span', { style: `--tone:${p.tone}` }, icon(p.icon, 14), p.short ?? p.name))),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm orgs-table' },
        h('thead', {}, h('tr', {}, ['Name', 'Address', 'Plan', 'Plugins', 'Use', 'Status', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, orgs.map((o) => h('tr', {},
          h('td', {}, h('strong', {}, o.name)),
          h('td', {}, h('a', { href: open(o) }, o.url.replace(/^https?:\/\//, '')),
            (o.domains ?? []).filter((d) => d.status !== 'active').map((d) => h('div', { class: 'small muted' }, `${d.host} (${d.status}) `,
              h('button', { class: 'btn btn-xs btn-ghost', title: 'Switch this domain on without the DNS check', onclick: () => act(() => call('POST', `/api/admin/domains/${d.host}/activate`)) }, 'Switch on')))),
          h('td', {}, h('select', { class: 'select select-xs plan-select', 'aria-label': `Plan for ${o.name}`, onchange: (e) => act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { plan: e.target.value })) }, options(PLANS, o.plan))),
          h('td', {}, pluginToggles(o)),
          h('td', { class: 'small' }, `${o.members} people`, h('br'), `${o.usage?.storageMb ?? 0} MB`,
            h('br'), h('button', { type: 'button', class: `link-button limits-open${ownCount(o) ? ' set' : ''}`, onclick: () => LimitsDrawer(o, act) }, icon('sliders', 12), ownCount(o) ? `Own limits (${ownCount(o)})` : 'Own limits')),
          h('td', {}, h('label', { class: 'feature-toggle' },
            h('input', { type: 'checkbox', class: 'toggle toggle-xs toggle-primary', checked: o.status === 'active', onchange: (e) => act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { status: e.target.checked ? 'active' : 'suspended' })) }),
            o.status)),
          h('td', {}, h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: async () => {
            if (await uiPrompt(`Type its address, ${o.slug}, to confirm`, '', { title: `Delete ${o.name} for good?`, ok: 'Delete', help: 'This deletes the organisation and everything in it. It can’t be undone.' }) === o.slug) act(() => call('DELETE', `/api/admin/orgs/${o.id}`));
          } }, 'Delete'))))))));
  const people = h('section', {},
      h('h2', {}, 'People who can sign in'),
      h('p', { class: 'muted small' }, 'People join an organisation when its admin lists their email in its staff list. Here you can give someone a password (for those without Google) or add another platform admin.'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
        h('thead', {}, h('tr', {}, ['Name', 'Email', 'Organisations', 'Sign-in', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, users.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.name), x.is_super ? h('span', { class: 'badge badge-sm badge-primary', style: 'margin-left:6px' }, 'platform admin') : null),
          h('td', {}, x.email, x.email_verified ? null : h('div', { class: 'muted small' }, 'email not confirmed yet')),
          h('td', {}, x.memberships.map((m) => `${m.name} (${m.role})`).join(', ') || '—'),
          h('td', {}, [...(x.providers ?? (x.google ? ['Google'] : [])), x.has_password && 'password', x.totp_on && 'two-step'].filter(Boolean).join(', ') || 'not yet'),
          h('td', {}, h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-xs', onclick: async () => {
            const pw = await uiPrompt('New password (at least 10 characters)', '', { title: `Set a password for ${x.email}`, type: 'password', help: 'Share it with them safely.', ok: 'Set password' });
            if (pw) act(() => call('POST', `/api/admin/users/${x.id}/password`, { password: pw }));
          } }, 'Set password'),
          x.totp_on && x.id !== user.id ? h('button', { class: 'btn btn-xs btn-ghost', title: 'For a lost phone: they set it up again at their next sign-in', onclick: async () => {
            if (await uiConfirm(`Switch off two-step sign-in for ${x.email}? They’ll be signed out, and set it up again next time.`, { ok: 'Reset two-step' })) act(() => call('DELETE', `/api/admin/users/${x.id}/two-step`));
          } }, 'Reset two-step') : null))))))),
      h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); act(() => call('POST', '/api/admin/users', { email: u.email.value, name: u.name.value, isSuper: true })); } },
        u.email, u.name, h('button', { class: 'btn btn-sm', type: 'submit' }, 'Add a platform admin')));

  app.classList.add('frame');
  document.body.classList.add('app-page');
  // Keep the sidebar where it was scrolled to, and the page too when it is the same section again
  // (after switching a plugin on, say); a new section starts at its top.
  const sideTop = app.querySelector(':scope > .side-nav')?.scrollTop ?? 0;
  const mainTop = app.querySelector(':scope > .page-main')?.scrollTop ?? 0;
  const sameRoute = lastRoute === hash;
  lastRoute = hash;
  const main = h('section', { class: 'page-main' }, h('div', { class: 'page' }, sections[route]()));
  app.replaceChildren(side, main);
  side.scrollTop = sideTop;
  if (sameRoute) main.scrollTop = mainTop;
  document.querySelector('.platform-head')?.remove();
  app.before(head);
}

/**
 * The security audit (server/audit.js) and database backups. The checks run
 * each time this opens; nothing they find (a password in a document, say)
 * is shown, only where it is.
 */
const STATUS = {
  fail: { label: 'Fix', cls: 'badge-error', icon: 'close' },
  warn: { label: 'Look at', cls: 'badge-warning', icon: 'eye' },
  pass: { label: 'OK', cls: 'badge-success', icon: 'check' },
  info: { label: 'Note', cls: 'badge-ghost', icon: 'help' },
};
function Security() {
  const body = h('div', { class: 'audit' }, h('p', { class: 'muted' }, 'Running the checks…'));
  const backups = h('div', {});
  const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
  const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  async function run() {
    const { checks, summary, at } = await call('GET', '/api/admin/audit');
    const groups = [...new Set(checks.map((c) => c.area))];
    body.replaceChildren(h('div', {},
      h('div', { class: 'stats stats-border platform-stats audit-summary' },
        [['fail', 'To fix'], ['warn', 'To look at'], ['pass', 'Passed']].map(([k, label]) => h('div', { class: `stat sum-${k}` },
          h('div', { class: 'stat-title' }, label), h('div', { class: 'stat-value' }, summary[k])))),
      h('p', { class: 'muted small' }, `Checked ${when(at)}. `, h('button', { class: 'btn btn-xs', onclick: run }, 'Run again')),
      groups.map((g) => h('section', { class: 'audit-group' },
        h('h3', {}, g),
        h('ul', { class: 'audit-list' }, checks.filter((c) => c.area === g).map((c) => {
          const st = STATUS[c.status];
          return h('li', { class: `audit-item audit-${c.status}` },
            h('span', { class: `badge badge-sm ${st.cls}` }, icon(st.icon, 12), st.label),
            h('div', {}, h('strong', {}, c.title), h('p', {}, c.detail), c.fix && h('p', { class: 'audit-fix' }, c.fix)));
        }))))));
  }
  async function loadBackups() {
    const list = await call('GET', '/api/admin/backups');
    backups.replaceChildren(list.length
      ? h('ul', { class: 'backup-list' }, list.slice(0, 7).map((b) => h('li', {}, h('span', {}, when(b.at)), h('span', { class: 'muted' }, size(b.size)))))
      : h('p', { class: 'empty' }, 'No snapshots yet.'));
  }
  const now = h('button', { class: 'btn btn-sm', onclick: async () => {
    now.disabled = true;
    try { await call('POST', '/api/admin/backups'); await Promise.all([loadBackups(), run()]); } catch (err) { uiAlert(err.message); }
    now.disabled = false;
  } }, icon('download', 14), 'Back up now');
  run().catch((err) => body.replaceChildren(h('p', { class: 'empty' }, err.message)));
  loadBackups().catch(() => {});
  return h('div', {},
    h('h2', {}, 'Security audit'),
    h('p', { class: 'muted small' }, 'Checks on how the platform is set up and what it stores: settings, how passwords and sign-ins are kept, what visitors can see, and backups. The same checks run from the command line with npm run audit.'),
    body,
    h('section', { class: 'card card-border bg-base-100 platform-card backup-card' }, h('div', { class: 'card-body' },
      h('h2', { class: 'card-title' }, 'Database backups'),
      h('p', { class: 'muted small' }, 'A snapshot of the database is taken every day and kept for two weeks, in the data folder’s backups. Uploaded audio isn’t in it; the host’s disk snapshots cover that.'),
      backups, h('div', {}, now))));
}

/* ---------------------------------------------------------------- plans */
const ownCount = (o) => ['limits', 'features', 'plugins'].reduce((n, k) => n + Object.keys(o.limits?.[k] ?? {}).length, 0);
const PLAN_LABEL = (id) => id[0].toUpperCase() + id.slice(1);

/** What each tier includes: plugins, limits and features, for every org on it. */
function Plans() {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  let plans;
  let overrides;
  const status = h('span', { class: 'muted small', role: 'status' });
  const save = async () => {
    try {
      // Only what differs from Dashi's defaults is stored, so later defaults still apply.
      await call('PUT', '/api/admin/plans', overrides);
      status.textContent = 'Saved. Every organisation on these plans has the change now.';
    } catch (err) { status.textContent = err.message; }
  };
  const setPart = (id, part, key, value) => {
    overrides[id] ??= {};
    overrides[id][part] = { ...(overrides[id][part] ?? {}), [key]: value };
    plans[id][part][key] = value;
  };
  const limitInput = (id, l) => h('input', { class: 'input input-xs plan-num', type: 'number', min: 0, value: plans[id].limits[l.id] ?? '', placeholder: 'No limit', 'aria-label': `${l.label} on ${plans[id].label}`,
    onchange: (e) => setPart(id, 'limits', l.id, e.target.value === '' ? null : Number(e.target.value)) });
  const check = (id, part, key, label) => h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !!plans[id][part][key], 'aria-label': `${label} on ${plans[id].label}`,
    onchange: (e) => setPart(id, part, key, e.target.checked) });
  call('GET', '/api/admin/plans').then((r) => {
    ({ plans, overrides } = r);
    box.replaceChildren(
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm plans-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), PLAN_IDS.map((id) => h('th', {}, plans[id].label)))),
        h('tbody', {},
          h('tr', {}, h('th', {}, 'Price a month ($)'), PLAN_IDS.map((id) => h('td', {}, h('input', { class: 'input input-xs plan-num', type: 'number', min: 0, value: plans[id].price.monthly ?? '', placeholder: 'Ask',
            onchange: (e) => setPart(id, 'price', 'monthly', e.target.value === '' ? null : Number(e.target.value)) })))),
          h('tr', {}, h('th', {}, 'Tagline'), PLAN_IDS.map((id) => h('td', {}, h('textarea', { class: 'textarea textarea-xs', rows: 3, onchange: (e) => { overrides[id] = { ...(overrides[id] ?? {}), tagline: e.target.value }; } }, plans[id].tagline)))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Plugins')),
          PLAN_PLUGINS.map((pid) => h('tr', {}, h('th', {}, PLUGINS.find((p) => p.id === pid)?.name ?? pid), PLAN_IDS.map((id) => h('td', {}, check(id, 'plugins', pid, pid))))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Limits (empty: no limit)')),
          LIMITS.map((l) => h('tr', {}, h('th', {}, l.label, l.unit ? h('small', { class: 'muted' }, ` ${l.unit}`) : null), PLAN_IDS.map((id) => h('td', {}, limitInput(id, l))))),
          h('tr', { class: 'group' }, h('th', { colspan: 5 }, 'Features')),
          FEATURES.map((f) => h('tr', {}, h('th', {}, f.label), PLAN_IDS.map((id) => h('td', {}, check(id, 'features', f.id, f.label)))))))),
      h('div', { class: 'inline-form' }, h('button', { class: 'btn btn-sm btn-primary', onclick: save }, 'Save plans'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await uiConfirm('Go back to Dashi’s default plans?')) { overrides = {}; await save(); location.reload(); } } }, 'Back to the defaults'), status));
  }).catch((err) => box.replaceChildren(h('p', { class: 'empty' }, err.message)));
  return h('div', {},
    h('h2', {}, 'Plans'),
    h('p', { class: 'muted small' }, 'What each tier includes. A change applies at once to every organisation on that plan, and the pricing page shows it. Organisations already over a new limit keep what they have; they just can’t add more.'),
    box);
}

/**
 * An org's own limits, over its plan's, in a side drawer: each limit shows
 * the plan's value beside it, and features and plugins are Plan's / On / Off.
 * Nothing is saved until Save.
 */
async function LimitsDrawer(o, act) {
  const own = structuredClone(o.limits ?? {});
  own.limits ??= {};
  own.features ??= {};
  own.plugins ??= {};
  let tier = null;
  try { tier = (await call('GET', '/api/admin/plans')).plans[o.plan]; } catch { /* shown without the plan's values */ }
  const planLimit = (l) => { const v = tier?.limits?.[l.id]; return tier ? (v == null ? 'No limit' : amount(v, l)) : 'plan’s'; };
  const changed = () => Object.keys(own.limits).length + Object.keys(own.features).length + Object.keys(own.plugins).length;
  const count = h('span', { class: 'muted small' });
  const showCount = () => { const n = changed(); count.textContent = n ? `${n} of your own` : 'Using the plan’s for everything'; };
  const seg = (part, key, planOn) => {
    const cur = own[part][key] == null ? '' : own[part][key] ? 'on' : 'off';
    const group = h('div', { class: 'lim-seg', role: 'radiogroup' });
    const opts = [['', `Plan’s${tier ? (planOn ? ' (on)' : ' (off)') : ''}`], ['on', 'On'], ['off', 'Off']];
    group.append(...opts.map(([v, label]) => h('button', { type: 'button', role: 'radio', class: cur === v ? 'on' : '', 'aria-checked': String(cur === v), onclick: (e) => {
      if (v === '') delete own[part][key]; else own[part][key] = v === 'on';
      group.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-checked', String(b === e.currentTarget)); });
      e.currentTarget.closest('.lim-row').classList.toggle('own', v !== '');
      showCount();
    } }, label)));
    return group;
  };
  const limitRow = (l) => h('label', { class: `lim-row${own.limits[l.id] != null ? ' own' : ''}` },
    h('span', { class: 'lim-name' }, l.label, h('small', {}, `Plan: ${planLimit(l)}`)),
    h('span', { class: 'lim-input' },
      h('input', { class: 'input input-sm', type: 'number', min: 0, value: own.limits[l.id] ?? '', placeholder: 'Plan’s', 'aria-label': l.label,
        oninput: (e) => { if (e.target.value === '') delete own.limits[l.id]; else own.limits[l.id] = Number(e.target.value); e.target.closest('.lim-row').classList.toggle('own', e.target.value !== ''); showCount(); } }),
      h('small', { class: 'muted lim-unit' }, l.unit ?? '')));
  const optRow = (part, key, label) => h('div', { class: `lim-row${own[part][key] != null ? ' own' : ''}` }, h('span', { class: 'lim-name' }, label), seg(part, key, !!tier?.[part]?.[key]));
  showCount();
  const d = Drawer({
    title: 'Own limits', sub: `${o.name} · ${PLAN_LABEL(o.plan)} plan`, wide: true,
    lead: h('span', { class: 'drawer-glyph' }, icon('sliders', 22)),
    body: h('div', { class: 'drawer-stack' },
      h('p', { class: 'muted small' }, `Limits for ${o.name} alone, over the ${PLAN_LABEL(o.plan)} plan’s. Leave a field empty, or on Plan’s, to use the plan’s. Highlighted rows are this organisation’s own.`),
      h('section', { class: 'drawer-section' }, h('h3', {}, 'Limits'), h('div', { class: 'lim-list' }, LIMITS.map(limitRow))),
      h('section', { class: 'drawer-section' }, h('h3', {}, 'Features'), h('div', { class: 'lim-list' }, FEATURES.map((f) => optRow('features', f.id, f.label)))),
      h('section', { class: 'drawer-section' }, h('h3', {}, 'Plugins'), h('div', { class: 'lim-list' }, PLAN_PLUGINS.map((pid) => optRow('plugins', pid, PLUGINS.find((p) => p.id === pid)?.name ?? pid))))),
    actions: [
      count,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await uiConfirm(`Use the ${PLAN_LABEL(o.plan)} plan’s limits for ${o.name} again?`, { ok: 'Use the plan’s' })) { d.close(); act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { limits: {} })); } } }, 'Back to the plan’s'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => { d.close(); act(() => call('PATCH', `/api/admin/orgs/${o.id}`, { limits: own })); } }, 'Save'),
    ],
  });
}

/* ------------------------------------------------------------- requests */
function Requests(requests, act) {
  const KIND = { signup: 'Sign-up', upgrade: 'Plan change', contact: 'Message' };
  const shown = requests.filter((r) => r.status === 'open');
  const done = requests.filter((r) => r.status !== 'open');
  const card = (r) => h('li', { class: `request ${r.status}` },
    h('div', { class: 'request-head' },
      h('span', { class: 'badge badge-sm badge-soft' }, KIND[r.kind] ?? r.kind),
      h('strong', {}, r.org_name ?? r.data.org ?? r.name ?? r.email),
      h('span', { class: 'muted small' }, new Date(r.created_at).toLocaleString()),
      h('span', { class: 'spacer' }),
      r.status === 'open'
        ? [r.org_id && r.data.plan && r.data.plan !== r.org_plan && h('button', { class: 'btn btn-xs btn-primary', onclick: () => act(async () => { await call('PATCH', `/api/admin/orgs/${r.org_id}`, { plan: r.data.plan }); await call('PATCH', `/api/admin/requests/${r.id}`, { status: 'done' }); }) }, `Move to ${PLAN_LABEL(r.data.plan)}`),
           h('button', { class: 'btn btn-xs', onclick: () => act(() => call('PATCH', `/api/admin/requests/${r.id}`, { status: 'done' })) }, 'Done'),
           h('button', { class: 'btn btn-xs btn-ghost', onclick: () => act(() => call('PATCH', `/api/admin/requests/${r.id}`, { status: 'declined' })) }, 'Decline')]
        : h('span', { class: 'muted small' }, r.status)),
    h('p', { class: 'small' }, [r.name, r.email].filter(Boolean).join(' · '),
      r.kind === 'signup' ? ` signed up${r.data.plan && r.data.plan !== 'free' ? ` and would like ${PLAN_LABEL(r.data.plan)}` : ''}.` : '',
      r.kind === 'upgrade' ? ` asks to move from ${PLAN_LABEL(r.data.from ?? r.org_plan)} to ${PLAN_LABEL(r.data.plan)}.` : '',
      r.kind === 'contact' && r.data.plan ? ` (about ${PLAN_LABEL(r.data.plan)})` : ''),
    (r.data.message || r.data.note) && h('blockquote', {}, r.data.message || r.data.note));
  return h('div', {},
    h('h2', {}, 'Requests'),
    h('p', { class: 'muted small' }, 'Sign-ups from the public site, plan changes organisations ask for, and messages from the contact page. New organisations start on Seed (free); moving one to a paid plan is your call, once payment is arranged.'),
    shown.length ? h('ul', { class: 'requests' }, shown.map(card)) : h('p', { class: 'empty' }, 'Nothing waiting.'),
    done.length > 0 && h('details', {}, h('summary', {}, `${done.length} dealt with`), h('ul', { class: 'requests' }, done.map(card))));
}

/* ----------------------------------------------------------- sales site */
function SalesSite() {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const status = h('span', { class: 'muted small', role: 'status' });
  fetch('/api/platform').then((r) => r.json()).then(({ site }) => {
    const text = (obj, key, label, rows = 1) => h('label', { class: 'field' }, h('span', {}, label),
      h(rows > 1 ? 'textarea' : 'input', { class: rows > 1 ? 'textarea textarea-sm' : 'input input-sm', rows, value: rows > 1 ? undefined : obj[key], onchange: (e) => { obj[key] = e.target.value; } }, rows > 1 ? obj[key] : undefined));
    const list = (items, fields, label) => h('fieldset', { class: 'site-list' }, h('legend', {}, label),
      items.map((it) => h('div', { class: 'site-item' }, fields.map(([k, l, rows]) => text(it, k, l, rows)))));
    box.replaceChildren(
      h('section', { class: 'site-edit' }, h('h3', {}, 'Home page'),
        text(site.hero, 'eyebrow', 'Above the title'), text(site.hero, 'title', 'Title'), text(site.hero, 'text', 'Introduction', 3), text(site.hero, 'cta', 'Button'),
        list(site.points, [['title', 'Title'], ['text', 'Text', 2]], 'What Dashi does'),
        list(site.trust, [['title', 'Title'], ['text', 'Text', 2]], 'Why trust it')),
      h('section', { class: 'site-edit' }, h('h3', {}, 'Plans and pricing'), text(site, 'pricingNote', 'Note under the title', 2), h('p', { class: 'muted small' }, 'Prices, taglines and what each plan includes are under Plans.')),
      h('section', { class: 'site-edit' }, h('h3', {}, 'About'),
        text(site.about, 'title', 'Title'), text(site.about, 'intro', 'Introduction', 4),
        list(site.about.sections, [['title', 'Heading'], ['text', 'Text', 4]], 'Sections'),
        list(site.about.faq, [['q', 'Question'], ['a', 'Answer', 2]], 'Questions')),
      h('section', { class: 'site-edit' }, h('h3', {}, 'Contact'), text(site.contact, 'email', 'Email'), text(site.contact, 'note', 'Note')),
      h('div', { class: 'inline-form sticky-save' },
        h('button', { class: 'btn btn-sm btn-primary', onclick: async () => { try { await call('PUT', '/api/admin/site', site); status.textContent = 'Saved. The public site shows it now.'; } catch (err) { status.textContent = err.message; } } }, 'Save'),
        h('a', { class: 'btn btn-sm', href: '/pricing.html', target: '_blank' }, 'View the site ↗'), status));
  });
  return h('div', {}, h('h2', {}, 'Sales site'), h('p', { class: 'muted small' }, 'The words on Dashi’s own public site: the home page visitors see at this address, Plans and pricing, About, and Contact.'), box);
}

/* ----------------------------------------------------------- support */
/**
 * Support tickets from everyone on the platform: the queue (new and open
 * first, then by priority), and one ticket's conversation, where you reply,
 * add internal notes, and set its status and priority.
 */
let supportFilter = 'active';
function Support(id) {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  (id ? SupportTicket(box, id) : SupportQueue(box)).catch((err) => box.replaceChildren(h('p', { class: 'text-error' }, err.message)));
  return box;
}

async function SupportQueue(box) {
  const { tickets, counts } = await call('GET', `/api/tickets?all=1${supportFilter === 'all' ? '' : `&status=${supportFilter}`}`);
  const filters = [['active', 'Needs attention'], ['new', 'New'], ['waiting', 'Waiting on them'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['all', 'All']];
  const count = (f) => (f === 'active' ? (counts.new ?? 0) + (counts.open ?? 0) + (counts.waiting ?? 0) : f === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[f] ?? 0);
  box.replaceChildren(
    h('h2', {}, 'Support'),
    h('p', { class: 'muted small' }, 'Problems, questions and ideas from people using Dashi. Each person sees only their own; you see them all. New ones are emailed to the support address too.'),
    h('div', { class: 'join' }, filters.map(([f, label]) => h('button', { class: `btn btn-xs join-item${supportFilter === f ? ' btn-active' : ''}`, onclick: () => { supportFilter = f; SupportQueue(box); } }, `${label} (${count(f)})`))),
    tickets.length
      ? h('ul', { class: 'ticket-list' }, tickets.map((t) => h('li', {},
          h('a', { href: `#support/${t.id}`, class: 'ticket-row' },
            h('span', { class: 'ticket-n' }, `#${t.n}`),
            h('span', { class: 'ticket-title' }, t.title,
              h('small', { class: 'muted' }, ` ${KIND_LABEL[t.kind]} · ${t.name ?? t.email ?? ''}${t.org ? ` · ${t.org.name}` : ''} · ${when(t.updatedAt)}${t.priority !== 'normal' ? ` · ${t.priority} priority` : ''}${t.status === 'open' && !t.lastFromAdmin && t.replies ? ' · they replied' : ''}`)),
            statusBadge(t.status, { admin: true })))))
      : h('p', { class: 'empty' }, 'Nothing here.'));
}

async function SupportTicket(box, id) {
  const { ticket: t, messages } = await call('GET', `/api/tickets/${encodeURIComponent(id)}`);
  const reply = h('textarea', { class: 'textarea w-full', rows: 4, placeholder: 'Reply to them (they get it by email too), or write an internal note', 'aria-label': 'Reply' });
  const internal = h('input', { type: 'checkbox', class: 'checkbox checkbox-sm' });
  const again = () => SupportTicket(box, id);
  const set = async (patch) => { await call('PATCH', `/api/tickets/${t.id}`, patch); await again(); };
  box.replaceChildren(
    h('nav', { class: 'crumbs' }, h('a', { href: '#support' }, 'Support'), ` / #${t.n}`),
    h('div', { class: 'ticket-head' }, h('h2', {}, t.title), statusBadge(t.status, { admin: true })),
    h('p', { class: 'muted small' }, `${KIND_LABEL[t.kind]} · ${t.name ?? ''} ${t.email ? `<${t.email}>` : ''}${t.org ? ` · ${t.org.name}` : ''} · opened ${when(t.createdAt)}`),
    h('div', { class: 'inline-form' },
      h('label', { class: 'small' }, 'Status ', h('select', { class: 'select select-xs', onchange: (e) => set({ status: e.target.value }) }, options(['new', 'open', 'waiting', 'resolved', 'closed'].map((x) => ({ id: x, label: x })), t.status))),
      h('label', { class: 'small' }, 'Priority ', h('select', { class: 'select select-xs', onchange: (e) => set({ priority: e.target.value }) }, options(['low', 'normal', 'high', 'urgent'].map((x) => ({ id: x, label: x })), t.priority))),
      t.context?.page && h('span', { class: 'muted small' }, `on ${t.context.page} · ${t.context.version ?? ''}`)),
    TicketThread(t, messages, { admin: true }),
    h('form', { class: 'ticket-reply', onsubmit: async (e) => {
      e.preventDefault();
      try { await call('POST', `/api/tickets/${t.id}/messages`, { body: reply.value, internal: internal.checked }); await again(); } catch (err) { uiAlert(err.message); }
    } }, reply,
      h('div', { class: 'row-actions' },
        h('label', { class: 'check small' }, internal, ' Internal note (only platform admins see it)'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Send'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => set({ status: 'resolved' }) }, 'Mark resolved'))));
}

async function reload() {
  session = await (await fetch('/api/session')).json();
  await render();
}
render();
