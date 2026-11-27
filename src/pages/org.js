import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar, Logo } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { Drawer } from '../ui/drawer.js';
import { readImage } from '../ui/images.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc, isHosted, session } from '../platform/storage.js';
import { toast } from '../ui/Shell.js';
import { loadOrg } from '../platform/docs.js';
import { ROLES, staffList, teamList, membersOf } from '../platform/org.js';
import { renameOrg } from '../platform/session.js';
import { PLUGINS, pausedForOrg, featureOn, chosenByOrg, roleHas, linkTo, orderPlugins } from '../plugins.js';
import { LIMITS, FEATURES, PLAN_IDS, PLAN_PLUGINS, amount } from '../platform/plans.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/dialog.js';

const api = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: body && JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
  return out;
};

/**
 * Organisation settings: the org's profile, its people and teams, plugins,
 * plan and domain. The sections are listed in the shared sidebar and live in
 * the URL hash (#people/<staff id> opens that person). The public sites and
 * their look live in Web; other organisations on the platform
 * are the platform admin's business, so they aren't listed here.
 */
const store = new Store(loadOrg(), applyCollectionOp);
autosaveDoc('org', store, 150);
const app = document.querySelector('#app');
const TABS = [
  ['profile', 'Profile', 'org', 'Name, contact, logo'],
  ['people', 'People', 'person', 'Who works here, and their role'],
  ['teams', 'Teams', 'users', 'Groups that share work'],
  ['plugins', 'Plugins', 'workbench', 'What your org uses'],
  ['plan', 'Plan', 'star', 'What you have, and what you use'],
  ['domain', 'Domain', 'link', 'Your own web address'],
];
app.classList.add('frame');
const main = h('section', { class: 'page-main' });
let side = h('nav');
const route = () => decodeURIComponent(location.hash.slice(1)).split('/');
const tab = () => { const [t] = route(); return t === 'sites' ? 'profile' : TABS.some(([id]) => id === t) ? t : 'profile'; };
const set = (key, value) => store.apply(col.set(key, value));
// Sites and their look moved to Web.
if (location.hash === '#sites') location.replace(linkTo('pages', '#look') ?? '#profile');
if (location.hash === '#platform') history.replaceState(null, '', '#profile');

let lastTab = null;
function render() {
  const org = store.doc;
  Shell(document.querySelector('#shell'), { current: 'org', org });
  const t = tab();
  const scroll = t === lastTab ? main.scrollTop : 0;
  lastTab = t;
  const focused = app.contains(document.activeElement) ? document.activeElement.name : null;
  side = swapSide(side, SideNav({ label: 'Organisation', sections: [
    { title: 'Organisation', items: TABS.map(([id, label, ic, sub]) => ({ label, sub, icon: ic, href: `#${id}`, on: t === id })) },
    { title: 'Elsewhere', items: [
      { label: 'Public sites and look', sub: 'In Web', icon: 'globe', href: linkTo('pages', '#look') },
      { label: 'My profile', sub: 'Your own picture and details', icon: 'userCircle', href: 'me.html' },
    ] },
  ] }));
  main.replaceChildren(
    h('div', { class: 'page' },
      h('div', { class: 'org-head' }, Logo(org, 56), h('div', {}, h('h1', {}, org.name), h('p', { class: 'lede' }, org.description || org.mission))),
      { profile: Profile, people: People, teams: Teams, plugins: Plugins, plan: Plan, domain: Domain }[t](org)));
  if (!app.contains(main)) app.replaceChildren(side, main);
  main.scrollTop = scroll;
  if (focused) app.querySelector(`[name="${focused}"]`)?.focus({ preventScroll: true });
}

const field = (label, control, hint) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), control, hint && h('span', { class: 'label' }, hint));
const text = (name, value, onchange, attrs = {}) => h('input', { class: 'input input-sm', name, value: value ?? '', onchange: (e) => onchange(e.target.value.trim()), ...attrs });
const area = (name, value, onchange) => h('textarea', { class: 'textarea textarea-sm', name, rows: 3, onchange: (e) => onchange(e.target.value.trim()) }, value ?? '');

function imagePicker({ name, current, onPick, onClear, preview }) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'file-input file-input-sm', name, onchange: async (e) => {
    try { onPick(await readImage(e.target.files[0])); } catch (err) { uiAlert(err.message); }
  } });
  return h('div', { class: 'image-picker' }, preview, h('div', {}, input, current && h('button', { class: 'btn btn-xs btn-ghost', onclick: onClear }, 'Remove')));
}

function Profile(org) {
  const contact = (k) => (v) => set('contact', { ...org.contact, [k]: v });
  return h('div', { class: 'settings-grid' },
    h('section', { class: 'panel' },
      h('h2', {}, 'About'),
      field('Name', text('name', org.name, (v) => { if (v) { set('name', v); renameOrg(org.id, v); } })),
      field('Description', area('description', org.description, (v) => set('description', v)), 'One or two sentences, shown on your public sites.'),
      field('Mission', area('mission', org.mission, (v) => set('mission', v)))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Contact details'),
      field('Email', text('email', org.contact.email, contact('email'), { type: 'email' })),
      field('Phone', text('phone', org.contact.phone, contact('phone'), { type: 'tel' })),
      field('Website', text('website', org.contact.website, contact('website'), { type: 'url' })),
      field('Address', area('address', org.contact.address, contact('address')))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Logo'),
      h('p', { class: 'muted' }, 'Shown on your public sites and in the header. A square image or SVG works best.'),
      imagePicker({ name: 'logo', current: org.logo, preview: Logo(org, 72), onPick: (url) => set('logo', url), onClear: () => set('logo', null) })));
}

/** Hosted: who has signed in, from the server (fetched once per page). */
let signInStatus = null;
async function loadSignInStatus() {
  if (!isHosted() || !session()?.canAdmin || signInStatus) return;
  try { const res = await fetch('/api/people/status'); if (res.ok) { signInStatus = await res.json(); render(); } } catch { /* shown without it */ }
}
async function sendInvite(s, button) {
  button.disabled = true;
  try {
    const res = await fetch('/api/invite', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify({ staffId: s.id }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error ?? `The server said ${res.status}`);
    toast(out.mail ? `Invitation sent to ${s.email}` : `Invitation made for ${s.email}. This server can’t send email yet, so the link is in the server’s log.`);
  } catch (err) { toast(err.message, 'error'); }
  button.disabled = false;
}
const signInCell = (s) => {
  if (!isHosted() || !session()?.canAdmin || !s.email) return null;
  const st = signInStatus?.[s.id];
  const seen = st?.lastSignIn ? `Last signed in ${new Date(st.lastSignIn).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Hasn’t signed in yet';
  return h('div', { class: 'invite-cell' },
    h('small', { class: 'muted' }, signInStatus ? seen : ''),
    h('button', { class: 'btn btn-xs', title: `Email ${s.email} a link to set a password and sign in (good for a week)`, onclick: (e) => sendInvite(s, e.currentTarget) }, st?.lastSignIn ? 'Send sign-in link' : 'Invite'));
};

/* -------------------------------------------------------------- people */
const isAdminHere = () => !isHosted() || !!session()?.canAdmin;
const roleOf = (id) => ROLES.find((r) => r.id === id) ?? ROLES[2];
const view = { q: '', role: 'all', team: 'all' };

/** The people directory: find someone, see their role and teams, open them to change anything. */
function People(org) {
  loadSignInStatus();
  const staff = staffList(org);
  const teams = teamList(org);
  const count = (rid) => staff.filter((s) => s.roleId === rid).length;
  const list = h('div', { class: 'ppl-list', role: 'list' });
  const empty = h('p', { class: 'empty', hidden: true }, 'Nobody matches. Try another name, or clear the filters.');
  const shown = h('span', { class: 'muted small' });
  const draw = () => {
    const q = view.q.trim().toLowerCase();
    const rows = staff.filter((s) => (view.role === 'all' || s.roleId === view.role)
      && (view.team === 'all' || (view.team === 'none' ? !s.teamIds.length : s.teamIds.includes(view.team)))
      && (!q || [s.name, s.title, s.email].some((x) => (x ?? '').toLowerCase().includes(q))));
    list.replaceChildren(...rows.map((s) => PersonRow(org, s)));
    empty.hidden = rows.length > 0;
    shown.textContent = rows.length === staff.length ? `${staff.length} people` : `${rows.length} of ${staff.length} people`;
  };
  const roleChip = (id, label, n) => h('button', { type: 'button', class: `ppl-chip${view.role === id ? ' on' : ''}`, 'aria-pressed': String(view.role === id),
    onclick: (e) => { view.role = id; e.currentTarget.parentElement.querySelectorAll('.ppl-chip').forEach((c) => { c.classList.toggle('on', c === e.currentTarget); c.setAttribute('aria-pressed', String(c === e.currentTarget)); }); draw(); } },
    label, h('span', { class: 'ppl-chip-n' }, String(n)));
  draw();
  return h('div', { class: 'ppl' },
    h('div', { class: 'ppl-head' },
      h('div', {}, h('h2', {}, 'People'), h('p', { class: 'muted small' }, 'Everyone on your staff list. Click someone to change their details, role or teams. People change their own picture in My profile.')),
      isAdminHere() && h('button', { class: 'btn btn-sm btn-primary', onclick: () => AddPerson(org) }, icon('plus', 14), 'Add person')),
    h('div', { class: 'ppl-tools' },
      h('label', { class: 'input input-sm ppl-search' }, icon('search', 15),
        h('input', { type: 'search', name: 'people-search', placeholder: 'Find a name, title or email', value: view.q, 'aria-label': 'Find a person', oninput: (e) => { view.q = e.target.value; draw(); } })),
      h('div', { class: 'ppl-chips', role: 'group', 'aria-label': 'Role' },
        roleChip('all', 'Everyone', staff.length), ROLES.map((r) => roleChip(r.id, r.short ?? r.label, count(r.id)))),
      h('select', { class: 'select select-sm ppl-team-filter', name: 'people-team', 'aria-label': 'Team', onchange: (e) => { view.team = e.target.value; draw(); } },
        options([{ id: 'all', label: 'Every team' }, ...teams.map((t) => ({ id: t.id, label: t.name })), { id: 'none', label: 'In no team' }], view.team)),
      shown),
    list, empty,
    h('section', { class: 'ppl-roles' },
      h('h3', {}, 'What each role can do'),
      h('div', { class: 'ppl-roles-grid' }, ROLES.map((r) => h('div', { class: `ppl-role role-${r.id}` }, h('span', { class: `role-badge role-${r.id}` }, r.label), h('p', {}, `${r.can}.`)))),
      h('p', { class: 'muted small' }, isHosted() ? 'Each person signs in with the email on their record. Someone new gets an emailed invitation to set a password when you add them; Invite sends it again.' : 'On the hosted platform, each person signs in with the email on their record.')));
}

const teamDots = (org, s, max = 3) => {
  const ts = s.teamIds.map((id) => org.teams[id]).filter(Boolean);
  return h('span', { class: 'ppl-teams' }, ts.slice(0, max).map((t) => h('span', { class: 'ppl-team' }, h('i', { style: `background:${t.color}` }), t.name)),
    ts.length > max && h('span', { class: 'ppl-team more' }, `+${ts.length - max}`),
    !ts.length && h('span', { class: 'muted small' }, 'No team'));
};

function PersonRow(org, s) {
  const st = signInStatus?.[s.id];
  const seen = !isHosted() || !session()?.canAdmin || !s.email ? null : st?.lastSignIn ? `Signed in ${new Date(st.lastSignIn).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : signInStatus ? 'Not signed in yet' : '';
  return h('button', { type: 'button', role: 'listitem', class: 'ppl-row', onclick: () => { history.replaceState(null, '', `#people/${s.id}`); PersonDrawer(s.id); } },
    Avatar(s, 38),
    h('span', { class: 'ppl-who' }, h('strong', {}, s.name), h('small', {}, [s.title, s.email].filter(Boolean).join(' · ') || 'No title or email yet')),
    teamDots(org, s),
    h('span', { class: `role-badge role-${s.roleId}` }, roleOf(s.roleId).label),
    h('span', { class: `ppl-seen${st?.lastSignIn ? ' on' : ''}` }, seen),
    icon('chevronRight', 16));
}

/** One person, in a drawer: their details, role and teams, and their sign-in. */
function PersonDrawer(id) {
  const org = store.doc;
  const s0 = org.staff[id];
  if (!s0) return;
  const admin = isAdminHere();
  const upd = (patch) => store.apply(col.update('staff', id, patch));
  const build = () => {
    const s = store.doc.staff[id];
    if (!s) return h('p', { class: 'empty' }, 'This person has been removed.');
    const st = signInStatus?.[s.id];
    return h('div', { class: 'drawer-stack' },
      h('section', { class: 'drawer-section' },
        h('h3', {}, 'Details'),
        field('Name', text('p-name', s.name, (v) => v && upd({ name: v }), { disabled: !admin })),
        field('Title', text('p-title', s.title, (v) => upd({ title: v }), { disabled: !admin })),
        field('Email (to sign in)', text('p-email', s.email, (v) => upd({ email: v.toLowerCase() }), { type: 'email', disabled: !admin, placeholder: 'name@yourorg.org' }))),
      h('section', { class: 'drawer-section' },
        h('h3', {}, 'Role'),
        h('div', { class: 'role-pick', role: 'radiogroup', 'aria-label': 'Role' }, ROLES.map((r) =>
          h('label', { class: `role-option${s.roleId === r.id ? ' on' : ''}` },
            h('input', { type: 'radio', name: `role-${id}`, value: r.id, checked: s.roleId === r.id, disabled: !admin, onchange: () => { upd({ roleId: r.id }); d.setBody(build()); } }),
            h('span', {}, h('strong', {}, r.label), h('small', {}, r.can)))))),
      h('section', { class: 'drawer-section' },
        h('h3', {}, 'Teams'),
        teamList(store.doc).length ? h('div', { class: 'team-pick' }, teamList(store.doc).map((t) => {
          const on = s.teamIds.includes(t.id);
          return h('button', { type: 'button', class: `team-toggle${on ? ' on' : ''}`, style: `--team:${t.color}`, 'aria-pressed': String(on), disabled: !admin,
            onclick: () => { upd({ teamIds: on ? s.teamIds.filter((x) => x !== t.id) : [...s.teamIds, t.id] }); d.setBody(build()); } },
            h('i'), t.name, on && icon('check', 13));
        })) : h('p', { class: 'muted small' }, 'No teams yet. Make one under Teams.')),
      isHosted() && session()?.canAdmin && s.email && h('section', { class: 'drawer-section' },
        h('h3', {}, 'Sign-in'),
        h('p', { class: 'muted small' }, st?.lastSignIn ? `Last signed in ${new Date(st.lastSignIn).toLocaleDateString(undefined, { dateStyle: 'medium' })}.` : 'Hasn’t signed in yet.'),
        h('button', { class: 'btn btn-sm', onclick: (e) => sendInvite(s, e.currentTarget) }, icon('mail', 14), st?.lastSignIn ? 'Email a sign-in link' : 'Send the invitation')));
  };
  const d = Drawer({
    title: s0.name, sub: s0.title || null, lead: Avatar(s0, 44), body: build(),
    onClose: () => { if (location.hash.startsWith('#people/')) history.replaceState(null, '', '#people'); },
    actions: [
      admin && h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: async () => { const s = store.doc.staff[id]; if (s && await uiConfirm(`Remove ${s.name}? They lose access to ${store.doc.name}.`)) { store.apply(col.remove('staff', id)); d.close(); } } }, icon('trash', 14), 'Remove'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => d.close() }, 'Done'),
    ].filter(Boolean),
  });
  const keep = () => { const s = store.doc.staff[id]; if (s) d.setTitle(s.name, s.title || null); };
  store.addEventListener('change', keep);
  d.el.addEventListener('close', () => store.removeEventListener('change', keep));
}

function AddPerson(org) {
  const f = {
    name: h('input', { class: 'input input-sm w-full', name: 'new-name', required: true, placeholder: 'Their name' }),
    title: h('input', { class: 'input input-sm w-full', name: 'new-title', placeholder: 'Their title' }),
    email: h('input', { class: 'input input-sm w-full', name: 'new-email', type: 'email', placeholder: 'name@yourorg.org' }),
  };
  let role = 'staff';
  const teamsOn = new Set();
  const msg = h('p', { class: 'dui-error', hidden: true });
  const body = h('div', { class: 'drawer-stack' },
    h('section', { class: 'drawer-section' }, h('h3', {}, 'Details'), field('Name', f.name), field('Title', f.title), field('Email (to sign in)', f.email, isHosted() ? 'They get an invitation to set a password.' : null)),
    h('section', { class: 'drawer-section' }, h('h3', {}, 'Role'),
      h('div', { class: 'role-pick', role: 'radiogroup', 'aria-label': 'Role' }, ROLES.map((r) => h('label', { class: `role-option${r.id === role ? ' on' : ''}` },
        h('input', { type: 'radio', name: 'new-role', value: r.id, checked: r.id === role, onchange: (e) => { role = r.id; e.target.closest('.role-pick').querySelectorAll('.role-option').forEach((x) => x.classList.toggle('on', x.contains(e.target))); } }),
        h('span', {}, h('strong', {}, r.label), h('small', {}, r.can)))))),
    teamList(org).length > 0 && h('section', { class: 'drawer-section' }, h('h3', {}, 'Teams'),
      h('div', { class: 'team-pick' }, teamList(org).map((t) => h('button', { type: 'button', class: 'team-toggle', style: `--team:${t.color}`, 'aria-pressed': 'false',
        onclick: (e) => { const on = !teamsOn.has(t.id); on ? teamsOn.add(t.id) : teamsOn.delete(t.id); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', String(on)); } }, h('i'), t.name)))),
    msg);
  const add = () => {
    const name = f.name.value.trim();
    if (!name) { msg.textContent = 'Give them a name.'; msg.hidden = false; f.name.focus(); return; }
    const op = store.apply(col.add('staff', { name, title: f.title.value.trim(), roleId: role, teamIds: [...teamsOn], interests: [], avatar: null, email: f.email.value.trim().toLowerCase() }));
    d.close();
    toast(`${name} is on the staff list`);
    if (op?.id) setTimeout(() => { history.replaceState(null, '', `#people/${op.id}`); }, 0);
  };
  const d = Drawer({ title: 'Add a person', sub: 'They join your staff list straight away.', lead: h('span', { class: 'drawer-glyph' }, icon('person', 22)), body,
    actions: [h('span', { class: 'spacer' }), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => d.close() }, 'Cancel'), h('button', { class: 'btn btn-sm btn-primary', onclick: add }, icon('plus', 14), 'Add person')] });
  f.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
}

/* --------------------------------------------------------------- teams */
const TEAM_COLOURS = ['#2a78d6', '#7a4fc9', '#c2410c', '#2a9d8f', '#f4a93b', '#c4433a', '#3f8f3a', '#d0621b', '#59607a', '#c2185b'];

/** Teams as cards: who is in each, and a drawer to name, colour and fill one. */
function Teams(org) {
  const staff = staffList(org);
  const teams = teamList(org);
  const loose = staff.filter((s) => !s.teamIds.length).length;
  return h('div', { class: 'tm' },
    h('div', { class: 'ppl-head' },
      h('div', {}, h('h2', {}, 'Teams'), h('p', { class: 'muted small' }, 'Teams group people who share work. Plan, Ecosystem and dashboards use them to assign work and filter people. Click a team to change it.')),
      isAdminHere() && h('button', { class: 'btn btn-sm btn-primary', onclick: newTeam }, icon('plus', 14), 'New team')),
    h('div', { class: 'tm-grid' },
      teams.map((t) => {
        const people = membersOf(org, t.id);
        return h('button', { type: 'button', class: 'tm-card', style: `--team:${t.color}`, onclick: () => TeamDrawer(t.id) },
          h('span', { class: 'tm-bar' }),
          h('span', { class: 'tm-title' }, h('strong', {}, t.name), h('small', {}, `${people.length} ${people.length === 1 ? 'person' : 'people'}`)),
          h('span', { class: 'tm-avatars' }, people.slice(0, 7).map((s) => h('span', { title: s.name }, Avatar(s, 30))), people.length > 7 && h('span', { class: 'tm-more' }, `+${people.length - 7}`)),
          h('span', { class: 'tm-leads muted small' }, people.filter((s) => s.roleId === 'lead' || s.roleId === 'admin').map((s) => s.name.split(' ')[0]).slice(0, 3).join(', ') ? `Led by ${people.filter((s) => s.roleId === 'lead' || s.roleId === 'admin').map((s) => s.name.split(' ')[0]).slice(0, 3).join(', ')}` : 'No lead yet'));
      }),
      isAdminHere() && h('button', { type: 'button', class: 'tm-card tm-new', onclick: newTeam }, icon('plus', 22), h('strong', {}, 'New team'))),
    loose > 0 && h('p', { class: 'muted small tm-loose' }, icon('info', 13), ` ${loose} ${loose === 1 ? 'person is' : 'people are'} in no team. `, h('a', { href: '#people', onclick: () => { view.team = 'none'; } }, 'See who')));
}

async function newTeam() {
  const name = await uiPrompt('Name of the new team', '', { title: 'New team', ok: 'Make team', placeholder: 'e.g. Programs' });
  if (!name?.trim()) return;
  const used = new Set(teamList(store.doc).map((t) => t.color));
  const op = store.apply(col.add('teams', { name: name.trim(), color: TEAM_COLOURS.find((c) => !used.has(c)) ?? '#59607a' }));
  if (op?.id) TeamDrawer(op.id);
}

function TeamDrawer(id) {
  const admin = isAdminHere();
  const t0 = store.doc.teams[id];
  if (!t0) return;
  let q = '';
  const upd = (patch) => store.apply(col.update('teams', id, patch));
  const setMember = (s, on) => store.apply(col.update('staff', s.id, { teamIds: on ? [...new Set([...s.teamIds, id])] : s.teamIds.filter((x) => x !== id) }));
  const swatch = h('span', { class: 'tm-swatch', style: `background:${t0.color}` });
  const results = h('ul', { class: 'tm-results' });
  const drawResults = () => {
    const org = store.doc;
    const ql = q.trim().toLowerCase();
    const out = staffList(org).filter((s) => !s.teamIds.includes(id) && (!ql || [s.name, s.title].some((x) => (x ?? '').toLowerCase().includes(ql)))).slice(0, ql ? 12 : 6);
    results.replaceChildren(...out.map((s) => h('li', {}, h('button', { type: 'button', class: 'tm-person', onclick: () => { setMember(s, true); d.setBody(build()); } },
      Avatar(s, 28), h('span', {}, h('strong', {}, s.name), h('small', {}, s.title ?? '')), h('span', { class: 'tm-add' }, icon('plus', 14), 'Add')))),
      out.length ? null : h('li', { class: 'muted small' }, ql ? 'Nobody else by that name.' : 'Everyone is already in this team.'));
  };
  const build = () => {
    const org = store.doc;
    const t = org.teams[id];
    if (!t) return h('p', { class: 'empty' }, 'This team has been deleted.');
    const people = membersOf(org, id);
    const find = h('input', { type: 'search', name: 'team-find', placeholder: 'Find someone to add', 'aria-label': 'Find someone to add', value: q, oninput: (e) => { q = e.target.value; drawResults(); } });
    drawResults();
    return h('div', { class: 'drawer-stack' },
      h('section', { class: 'drawer-section' },
        h('h3', {}, 'Name and colour'),
        field('Name', text('team-name', t.name, (v) => v && upd({ name: v }), { disabled: !admin })),
        h('div', { class: 'tm-colours', role: 'radiogroup', 'aria-label': 'Colour' },
          TEAM_COLOURS.map((c) => h('button', { type: 'button', role: 'radio', class: `tm-colour${t.color === c ? ' on' : ''}`, style: `--c:${c}`, 'aria-checked': String(t.color === c), 'aria-label': c, disabled: !admin, onclick: () => { upd({ color: c }); d.setBody(build()); } })),
          h('label', { class: 'tm-colour custom', title: 'Another colour' }, h('input', { type: 'color', value: t.color, disabled: !admin, onchange: (e) => { upd({ color: e.target.value }); d.setBody(build()); } }), icon('palette', 14)))),
      h('section', { class: 'drawer-section' },
        h('h3', {}, `In this team · ${people.length}`),
        people.length ? h('ul', { class: 'tm-members' }, people.map((s) => h('li', {},
          Avatar(s, 30), h('span', {}, h('strong', {}, s.name), h('small', {}, [s.title, roleOf(s.roleId).label].filter(Boolean).join(' · '))),
          admin && h('button', { type: 'button', class: 'btn btn-xs btn-ghost', 'aria-label': `Take ${s.name} out of ${t.name}`, title: 'Take out of this team', onclick: () => { setMember(s, false); d.setBody(build()); } }, icon('close', 13))))) : h('p', { class: 'muted small' }, 'Nobody yet. Add people below.')),
      admin && h('section', { class: 'drawer-section' },
        h('h3', {}, 'Add people'),
        h('label', { class: 'input input-sm w-full' }, icon('search', 15), find),
        results));
  };
  const d = Drawer({
    title: t0.name, sub: 'Team', lead: swatch, body: build(),
    actions: [
      admin && h('button', { class: 'btn btn-sm btn-ghost btn-error', onclick: async () => {
        const t = store.doc.teams[id];
        if (!t || !await uiConfirm(`Delete the ${t.name} team? Its people stay on the staff list.`)) return;
        for (const s of membersOf(store.doc, id)) setMember(s, false);
        store.apply(col.remove('teams', id));
        d.close();
      } }, icon('trash', 14), 'Delete team'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => d.close() }, 'Done'),
    ].filter(Boolean),
  });
  const keep = () => { const t = store.doc.teams[id]; if (t) { d.setTitle(t.name, 'Team'); swatch.style.background = t.color; } };
  store.addEventListener('change', keep);
  d.el.addEventListener('close', () => store.removeEventListener('change', keep));
}

/** #people/<id> opens that person (links from search and the dashboard). */
function openFromHash() {
  const [t, id] = route();
  if (t === 'people' && id && store.doc.staff[id] && !document.querySelector('dialog.drawer-panel[open]')) PersonDrawer(id);
}

/**
 * Plugins, and each role's palette of them. The org switches a plugin on
 * for everyone (the first column), then can take it out of a role's
 * palette: leaders might get every tool, the board the reading ones. A
 * plugin's features open in a drawer.
 */
const READING_SET = ['strategy', 'palette', 'library', 'pages'];
let orderOpen = false;   // the menu-order box stays open while you move things
function Plugins(org) {
  const cats = [...new Set(PLUGINS.filter((p) => !p.platformOff).map((p) => p.category ?? 'Other'))];
  // Sub-plugins sit right under their parent (Planning Studio under Plan).
  const tops = cats.flatMap((c) => PLUGINS.filter((p) => !p.platformOff && !p.parent && (p.category ?? 'Other') === c));
  const list = tops.flatMap((p) => [p, ...PLUGINS.filter((x) => !x.platformOff && x.parent === p.id)]);
  const optional = list.filter((p) => !p.core);
  const parentOf = (p) => p.parent && PLUGINS.find((x) => x.id === p.parent);
  const inUse = (p) => p.core || (!pausedForOrg(org, p.id) && chosenByOrg(org, p) && (!parentOf(p) || inUse(parentOf(p))));
  const setRole = (pid, rid, on) => {
    const next = structuredClone(org.pluginRoles ?? {});
    const row = next[pid] ?? {};
    if (on) delete row[rid]; else row[rid] = false;
    if (Object.keys(row).length) next[pid] = row; else delete next[pid];
    set('pluginRoles', next);
  };
  const palette = (r) => optional.filter((p) => inUse(p) && roleHas(org, p.id, r.id));
  const preset = async (kind) => {
    if (kind === 'all') {
      if (!await uiConfirm('Give every role every plugin your organisation uses?', { ok: 'Same for everyone' })) return;
      set('pluginRoles', {});
      return;
    }
    if (!await uiConfirm('Board directors, guests and viewers get the reading tools (Plan, Data Workbench, Library, Web); admins, leads and staff keep everything. You can fine-tune it after.', { ok: 'Use it' })) return;
    const next = {};
    for (const p of optional) for (const r of ['board', 'guest', 'viewer']) if (!READING_SET.includes(p.id)) (next[p.id] ??= {})[r] = false;
    set('pluginRoles', next);
  };
  const head = h('tr', {},
    h('th', { scope: 'col', class: 'rp-plugin-col' }, 'Plugin'),
    h('th', { scope: 'col', class: 'rp-use-col' }, h('span', {}, 'In use'), h('small', {}, 'for the org')),
    ROLES.map((r) => {
      const mine = palette(r);
      return h('th', { scope: 'col', class: `rp-role role-${r.id}` },
        h('span', { class: 'rp-role-name' }, r.short ?? r.label),
        h('span', { class: 'rp-dots', 'aria-hidden': 'true' }, optional.filter(inUse).map((p) => h('i', { class: mine.includes(p) ? 'on' : '', style: `--tone:${p.tone}` }))),
        h('small', { class: 'rp-count' }, `${mine.length} of ${optional.filter(inUse).length}`));
    }));
  const row = (p) => {
    const paused = pausedForOrg(org, p.id);
    const used = inUse(p);
    const parent = parentOf(p);
    const own = Object.keys(org.pluginPeople?.[p.id] ?? {}).length;
    return h('tr', { class: `${used ? 'on' : 'off'}${paused ? ' locked' : ''}${parent ? ' rp-sub' : ''}`, style: `--tone:${p.tone}` },
      h('th', { scope: 'row', class: 'rp-plugin' },
        h('button', { type: 'button', class: 'rp-plugin-btn', onclick: () => PluginDrawer(p.id), 'aria-label': `${p.name}: features and who has it` },
          h('span', { class: 'tone-tile' }, icon(p.icon, 18)),
          h('span', { class: 'rp-plugin-text' }, h('strong', {}, p.name), h('small', {}, [parent ? `Inside ${parent.name}` : p.category, `${(p.features ?? []).length || 'no'} feature${(p.features ?? []).length === 1 ? '' : 's'}`, own && `${own} ${own === 1 ? 'person' : 'people'} set apart`].filter(Boolean).join(' · '))))),
      h('td', { class: 'rp-use' },
        p.core ? h('span', { class: 'rp-always' }, 'Always')
          : paused ? h('span', { class: 'badge badge-warning badge-soft badge-sm', title: 'Ask the platform admin, or change your plan under Plan' }, 'Not in plan')
          : parent && !inUse(parent) ? h('span', { class: 'badge badge-ghost badge-sm', title: `Switch on ${parent.name} first` }, `Needs ${parent.short ?? parent.name}`)
          : h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', 'aria-label': `Use ${p.name}`, checked: chosenByOrg(org, p),
              onchange: (e) => set('plugins', { ...org.plugins, [p.id]: e.target.checked }) })),
      p.core
        ? h('td', { class: 'rp-everyone', colspan: ROLES.length }, h('span', {}, 'Everyone', p.id === 'org' ? ', so admins can always reach settings' : ''))
        : ROLES.map((r) => h('td', { class: 'rp-cell' },
            h('input', { type: 'checkbox', class: 'checkbox checkbox-sm rp-check', disabled: !used, checked: used && roleHas(org, p.id, r.id),
              'aria-label': `${p.name} for ${r.label}`, title: used ? `${p.name} for ${r.label}` : `${p.name} is switched off for the whole organisation`,
              onchange: (e) => setRole(p.id, r.id, e.target.checked) }))));
  };
  // The plugin bar's order: up and down arrows, saved as org.pluginOrder.
  const barList = orderPlugins(org, PLUGINS.filter((p) => !p.platformOff && !p.parent && p.nav !== false && p.id !== 'home' && inUse(p)));
  const moveTo = (i, j) => { const ids = barList.map((p) => p.id); [ids[i], ids[j]] = [ids[j], ids[i]]; set('pluginOrder', ids); };
  const orderBox = h('details', { class: 'rp-order', open: orderOpen, ontoggle: (e) => { orderOpen = e.target.open; } },
    h('summary', {}, icon('listNumbers', 14), ' Order of the plugin menu', h('small', { class: 'muted' }, ' · the bar at the top of every page')),
    h('ol', { class: 'rp-order-list' }, barList.map((p, i) => h('li', { style: `--tone:${p.tone}` },
      h('span', { class: 'tone-tile' }, icon(p.icon, 16)), h('span', { class: 'rp-order-name' }, p.name),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost btn-square', 'aria-label': `Move ${p.name} up`, title: 'Move up', disabled: i === 0, onclick: () => moveTo(i, i - 1) }, icon('chevronUp', 14)),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost btn-square', 'aria-label': `Move ${p.name} down`, title: 'Move down', disabled: i === barList.length - 1, onclick: () => moveTo(i, i + 1) }, icon('chevronDown', 14))))),
    org.pluginOrder?.length ? h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => set('pluginOrder', []) }, 'Back to the usual order') : null);
  return h('div', { class: 'rp' },
    h('p', { class: 'lede' }, 'Choose the plugins your organisation uses, then which roles get each one. Leaders can have a different palette of tools from the board or guests. Switching one off hides it from the dashboard and header; its data is kept.'),
    h('div', { class: 'rp-presets' },
      h('span', { class: 'section-label' }, 'Start from'),
      h('button', { class: 'btn btn-sm', onclick: () => preset('all') }, 'Same tools for everyone'),
      h('button', { class: 'btn btn-sm', onclick: () => preset('reading') }, 'Reading tools for the board and guests')),
    orderBox,
    h('div', { class: 'rp-scroll' },
      h('table', { class: 'rp-table' }, h('thead', {}, head), h('tbody', {}, list.map(row)))),
    h('p', { class: 'muted small rp-note' }, icon('info', 13), ' Board directors, guests and viewers can only read, whatever their palette. Someone who opens a plugin outside their palette is told who to ask.'));
}

/**
 * One person set apart from their role: switch a plugin off for someone
 * whose role has it, or on for someone whose role doesn't
 * (org.pluginPeople[pid][staffId]). The server enforces it like the role.
 */
function PeopleApart(org, p) {
  const people = Object.values(org.staff ?? {}).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const setPerson = (sid, value) => {
    const next = structuredClone(org.pluginPeople ?? {});
    const row = next[p.id] ?? {};
    if (value === 'role') delete row[sid]; else row[sid] = value === 'on';
    if (Object.keys(row).length) next[p.id] = row; else delete next[p.id];
    set('pluginPeople', next);
  };
  return h('section', { class: 'drawer-section' }, h('h3', {}, 'For one person'),
    h('p', { class: 'muted small' }, 'Someone can have a different setting from their role: off for one staff member, or on for one guest.'),
    people.length ? h('ul', { class: 'rp-people' }, people.map((st) => {
      const own = org.pluginPeople?.[p.id]?.[st.id];
      const byRole = roleHas(org, p.id, st.roleId);
      const role = ROLES.find((r) => r.id === st.roleId);
      return h('li', { class: own == null ? '' : 'apart' },
        h('span', { class: 'rp-person' }, h('strong', {}, st.name || 'Unnamed'), h('small', { class: 'muted' }, role?.label ?? '')),
        h('select', { class: 'select select-xs', 'aria-label': `${p.name} for ${st.name}`, onchange: (e) => setPerson(st.id, e.target.value) },
          h('option', { value: 'role', selected: own == null }, `As their role (${byRole ? 'on' : 'off'})`),
          h('option', { value: 'on', selected: own === true }, 'On for them'),
          h('option', { value: 'off', selected: own === false }, 'Off for them')));
    })) : h('p', { class: 'muted small' }, 'No people yet.'));
}

/** A plugin's features (a lock means your plan leaves that one out) and which roles have it. */
function PluginDrawer(id) {
  const draw = () => {
    const org = store.doc;
    const p = PLUGINS.find((x) => x.id === id);
    const tier = org.platform?.tier ?? null;
    return h('div', { class: 'rp-drawer' },
      h('p', {}, p.blurb),
      h('section', { class: 'drawer-section' }, h('h3', {}, 'Features'),
        (p.features ?? []).length
          ? h('ul', { class: 'org-plug-feats' }, p.features.map((f) => {
              const ok = featureOn(p.id, f.id, tier);
              return h('li', { class: ok ? '' : 'off' }, icon(ok ? 'check' : 'lock', 13), h('span', {}, h('strong', {}, f.label), f.description && h('small', {}, ok ? f.description : `${f.description} (not in your plan)`)));
            }))
          : h('p', { class: 'muted small' }, 'No separate features: it all comes together.')),
      h('section', { class: 'drawer-section' }, h('h3', {}, 'Who has it'),
        h('ul', { class: 'rp-who' }, ROLES.map((r) => h('li', {}, h('span', { class: `role-badge role-${r.id}` }, r.label), h('span', { class: 'muted small' }, p.core || roleHas(org, p.id, r.id) ? 'Yes' : 'Not in their palette'))))),
      !p.core && PeopleApart(org, p));
  };
  const p = PLUGINS.find((x) => x.id === id);
  const d = Drawer({ title: p.name, sub: p.category ?? 'Plugin', lead: h('span', { class: 'tone-tile solid', style: `--tone:${p.tone}` }, icon(p.icon, 20)), body: draw() });
  const keep = () => d.setBody(draw());
  store.addEventListener('change', keep);
  d.el.addEventListener('close', () => store.removeEventListener('change', keep));
}

/**
 * The org's plan, in the look of the pricing page and the control centre's
 * tiles: the plan you're on, how much of it you use, what it includes, and
 * the other plans side by side, each one a click from asking to move.
 */
function Plan(org) {
  if (!isHosted()) return h('p', { class: 'note' }, 'Plans apply on the hosted platform. This local copy has everything switched on.');
  const box = h('div', { class: 'pl' }, h('p', { class: 'muted' }, 'Loading…'));
  api('GET', '/api/plan').then(({ plan, usage, plans }) => {
    const price = (p) => (p.price?.monthly == null ? 'Let’s talk' : p.price.monthly === 0 ? 'Free' : `$${p.price.monthly}`);
    const limitText = (max, l) => (max == null ? `Unlimited ${l.short}` : max === 0 ? `No ${l.short}` : l.unit ? `${amount(max, l)} of ${l.short}` : `${max} ${l.short}`);
    const tile = (l) => {
      const max = plan.limits[l.id];
      const used = usage[l.id] ?? 0;
      const share = max ? Math.min(1, used / max) : 0;
      const state = max === 0 ? 'off' : share >= 1 ? 'bad' : share > 0.8 ? 'warn' : 'ok';
      return h('div', { class: `cc-tile pl-tile cc-${state}` },
        h('span', { class: 'cc-tile-title', title: l.label }, h('i'), l.short[0].toUpperCase() + l.short.slice(1)),
        h('strong', {}, l.unit ? amount(used, l) : used.toLocaleString()),
        h('small', {}, max == null ? 'No limit on your plan' : max === 0 ? 'Not in your plan' : `of ${amount(max, l)}${share >= 1 ? ': full' : share > 0.8 ? ': nearly full' : ''}`),
        max ? h('span', { class: 'pl-meter', role: 'meter', 'aria-valuenow': String(used), 'aria-valuemax': String(max), 'aria-label': l.label }, h('span', { style: `width:${Math.max(2, share * 100).toFixed(1)}%` })) : null);
    };
    const ask = async (id) => {
      const note = await uiPrompt('Anything the platform admin should know? (optional)', '', { title: `Ask to move to ${plans[id].label}`, ok: 'Send the request', required: false, multiline: true, help: 'They’ll be in touch to set it up with you. Nothing changes until then.' });
      if (note === null) return;
      try { await api('POST', '/api/plan/request', { plan: id, note }); toast(`Sent. The platform admin will be in touch about ${plans[id].label}.`); } catch (err) { uiAlert(err.message); }
    };
    const pricing = `${location.protocol}//${location.host.split('.').slice(1).join('.')}/pricing.html`;
    const otherCard = (id) => {
      const p = plans[id];
      const bigger = PLAN_IDS.indexOf(id) > PLAN_IDS.indexOf(plan.id);
      return h('article', { class: 'pl-card' },
        h('div', { class: 'pl-card-head' }, h('h3', {}, p.label), h('span', { class: `badge badge-sm ${bigger ? 'badge-primary badge-soft' : 'badge-ghost'}` }, bigger ? 'More room' : 'Smaller')),
        h('p', { class: 'pl-price' }, h('strong', {}, price(p)), p.price?.monthly ? h('span', { class: 'muted small' }, ` ${p.price.note}`) : null),
        h('p', { class: 'muted small pl-tag' }, p.tagline),
        h('ul', { class: 'pl-list' }, ['users', 'maps', 'dashboards', 'storageMb'].map((lid) => h('li', {}, icon('check', 13), limitText(p.limits[lid], LIMITS.find((x) => x.id === lid))))),
        org.platform && h('button', { class: `btn btn-sm ${bigger ? 'btn-primary' : ''}`, onclick: () => ask(id) }, `Ask to move to ${p.label}`));
    };
    box.replaceChildren(
      h('section', { class: 'pl-hero' },
        h('div', { class: 'pl-hero-main' },
          h('span', { class: 'pl-eyebrow' }, 'Your plan'),
          h('h2', {}, plan.label),
          plan.price?.monthly != null && h('p', { class: 'pl-price' }, h('strong', {}, price(plan)), plan.price.monthly ? h('span', { class: 'muted' }, ` ${plan.price.note} · includes HST`) : null),
          h('p', { class: 'muted' }, plan.tagline)),
        h('div', { class: 'pl-hero-side' },
          h('a', { class: 'btn btn-sm', href: pricing, target: '_blank', rel: 'noopener' }, 'Compare every plan ↗'),
          h('a', { class: 'btn btn-sm btn-ghost', href: 'help.html#support' }, 'Questions? Ask us'))),
      h('h3', { class: 'pl-h3' }, 'What you use'),
      h('div', { class: 'cc-tiles pl-tiles' }, LIMITS.filter((l) => usage[l.id] != null || l.id === 'storageMb').map(tile)),
      h('div', { class: 'cc-grid pl-included' },
        h('section', { class: 'cc-card' },
          h('h3', {}, 'Plugins in your plan'),
          h('ul', { class: 'pl-plugins' }, PLAN_PLUGINS.map((id) => {
            const p = PLUGINS.find((x) => x.id === id);
            if (!p) return null;
            const on = !!plan.plugins[id];
            return h('li', { class: on ? '' : 'off', style: `--tone:${p.tone}`, title: on ? '' : 'Not in your plan' }, h('span', { class: 'tone-tile' }, icon(p.icon, 16)), h('span', {}, p.name), icon(on ? 'check' : 'lock', 14));
          }))),
        h('section', { class: 'cc-card' },
          h('h3', {}, 'Features'),
          h('ul', { class: 'pl-feats' }, FEATURES.map((f) => h('li', { class: plan.features[f.id] ? '' : 'off' }, icon(plan.features[f.id] ? 'check' : 'lock', 14), f.label))),
          h('p', { class: 'muted small' }, 'Organisation and Help are always on, on every plan.'))),
      Billing(plans, plan),
      h('div', { class: 'pl-others-head' },
        h('h3', { class: 'pl-h3' }, 'Other plans'),
        h('span', { class: 'muted small' }, 'Asking sends a note to the platform admin, who sets it up with you. Prices include HST.')),
      h('div', { class: 'pl-cards' }, PLAN_IDS.filter((id) => id !== plan.id).map(otherCard)));
  }).catch((err) => box.replaceChildren(h('p', { class: 'empty' }, err.message)));
  return box;
}

/**
 * Paying by card (when the platform admin has switched it on): pick a plan
 * and monthly or yearly, then pay on Stripe's page. Afterwards, the billing
 * portal changes the card, downloads receipts or cancels. Admins only.
 */
function Billing(plans, current) {
  const box = h('div', {});
  let currency = 'cad';
  try { currency = localStorage.getItem('dashi.currency') === 'usd' ? 'usd' : 'cad'; } catch {}
  api('GET', '/api/billing').then((b) => {
    const st = b.billing;
    const g = b.grassroots ?? { percent: 30, plans: [], declared: false };
    const paid = Object.keys(b.prices).filter((id) => plans[id] && (b.prices[id].month || b.prices[id].year));
    const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' }) : '');
    const go = async (url, body) => { try { location.assign((await api('POST', url, body)).url); } catch (err) { uiAlert(err.message); } };
    const STATUS = { active: 'Paid by card', trialing: `Free trial until ${day(st.trialEnd)}`, past_due: 'The last payment didn’t go through', canceled: 'Cancelled' };
    if (st.comp) return box.replaceChildren(h('p', { class: 'note' }, 'Your organisation has a free account from Dashi. Thank you for helping us build it.'));
    const grassrootsOn = (id) => g.declared && g.online && g.plans.includes(id);
    const money = (n) => `${currency === 'usd' ? 'US$' : 'C$'}${n % 1 ? n.toFixed(2) : n}`;
    const cost = (id, interval) => {
      const pr = plans[id].price;
      const base = currency === 'usd' ? (interval === 'year' ? pr.usdYearly : pr.usdMonthly) : (interval === 'year' ? pr.yearly : pr.monthly);
      if (base == null) return '';
      const off = grassrootsOn(id) ? Math.round(base * (100 - g.percent)) / 100 : null;
      return off != null ? h('span', {}, h('s', { class: 'muted' }, money(base)), ' ', h('strong', {}, money(off))) : h('strong', {}, money(base));
    };
    const declare = async (on) => {
      try { await api('PUT', '/api/billing/grassroots', { declared: on }); g.declared = on; draw(); toast(on ? `Thank you. The grassroots rate (${g.percent}% off) is on for Community and Organization.` : 'The grassroots rate is off.'); } catch (err) { uiAlert(err.message); }
    };
    const setCurrency = (c) => { currency = c; try { localStorage.setItem('dashi.currency', c); } catch {} draw(); };
    const budget = currency === 'usd' ? `US$${(g.budgetUsd ?? 200000).toLocaleString()}` : `C$${(g.budgetCad ?? 250000).toLocaleString()}`;
    const draw = () => box.replaceChildren(h('section', { class: 'card card-border bg-base-100 billing-card' }, h('div', { class: 'card-body' },
      h('div', { class: 'billing-head' },
        h('h2', { class: 'card-title' }, 'Billing'),
        h('div', { class: 'join billing-cur', role: 'group', 'aria-label': 'Currency' },
          ['cad', 'usd'].map((c) => h('button', { class: `btn btn-xs join-item ${currency === c ? 'btn-active' : ''}`, 'aria-pressed': String(currency === c), onclick: () => setCurrency(c) }, c.toUpperCase())))),
      new URLSearchParams(location.search).get('paid') && h('p', { class: 'note' }, 'Thank you. Your plan changes as soon as Stripe confirms the payment, usually within a minute.'),
      st.status && h('p', {}, h('strong', {}, STATUS[st.status] ?? st.status), st.periodEnd && st.status !== 'canceled' ? ` · ${st.cancelAtPeriodEnd ? 'ends' : 'renews'} ${day(st.periodEnd)}` : '',
        st.lastInvoice ? h('span', { class: 'muted' }, ` · last payment $${st.lastInvoice.amount.toFixed(2)}, including $${st.lastInvoice.tax.toFixed(2)} ${b.taxLabel}`) : ''),
      st.portal && h('button', { class: 'btn btn-sm', onclick: () => go('/api/billing/portal') }, 'Change card, see receipts, or cancel'),
      b.alpha && h('p', { class: 'note' }, `Thank you for testing Dashi’s alpha. Your first ${b.alpha.months} months are half price${b.alpha.online ? ', applied at checkout' : ''}.`),
      h('label', { class: 'billing-grass' },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: g.declared, onchange: (e) => declare(e.target.checked) }),
        h('span', {}, h('strong', {}, `Grassroots rate: ${g.percent}% off Community and Organization. `),
          `Tick this if your organisation’s yearly budget is under ${budget}. We take your word for it.`,
          g.declared && !g.online ? h('span', { class: 'muted' }, ' The platform admin applies it when they set up your plan.') : '')),
      b.online && !['active', 'trialing', 'past_due'].includes(st.status) && paid.length > 0 && h('div', { class: 'billing-plans' },
        h('p', { class: 'muted small' }, `Pay by card. Prices include ${b.taxLabel}. Paying yearly gives you two months free.${b.trialDays ? ` Your first ${b.trialDays} days are free, and you can cancel before you pay anything.` : ''}`),
        paid.map((id) => h('div', { class: 'billing-plan' },
          h('strong', {}, plans[id].label),
          h('span', { class: 'small' }, cost(id, 'month'), h('span', { class: 'muted' }, ' a month')),
          b.prices[id].year && h('button', { class: `btn btn-sm ${id === current.id ? '' : 'btn-primary'}`, onclick: () => go('/api/billing/checkout', { plan: id, interval: 'year', currency }) }, 'Pay yearly ', h('span', { class: 'billing-yr' }, cost(id, 'year'))),
          b.prices[id].month && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => go('/api/billing/checkout', { plan: id, interval: 'month', currency }) }, 'Pay monthly')))))));
    draw();
  }).catch(() => {});
  return box;
}

/**
 * Organisation → Domain: the org's Dashi address (its subdomain, the
 * namespace for everything it has on Dashi), which the admin can change
 * with a live check as they type, then its own domains (Custom plan). The
 * Dashi address keeps working beside an own domain, as a mirror.
 */
function Domain(org) {
  if (!isHosted()) return h('p', { class: 'note' }, 'Your Dashi address and your own domain work on the hosted platform.');
  return h('div', { class: 'domain-page' }, Address(), OwnDomains(org));
}

/** The Dashi address: yourname.dashi.app, checked against every other org as the admin types. */
function Address() {
  const current = session()?.org?.slug ?? '';
  const status = h('p', { class: 'small addr-status', role: 'status', 'aria-live': 'polite' });
  const save = h('button', { class: 'btn btn-sm btn-primary', type: 'submit', disabled: true }, 'Change address');
  const base = h('span', { class: 'addr-base' }, '');
  const input = h('input', { class: 'input input-sm addr-input', name: 'slug', value: current, autocomplete: 'off', spellcheck: false, 'aria-label': 'Your Dashi address', maxlength: 40 });
  let timer = null;
  let last = null;
  const check = async () => {
    const slug = input.value.trim().toLowerCase();
    if (slug !== input.value) input.value = slug;
    if (slug === current) { status.className = 'small addr-status muted'; status.textContent = 'This is your address now.'; save.disabled = true; return; }
    const res = await api('GET', `/api/domains/address?slug=${encodeURIComponent(slug)}`).catch((err) => ({ ok: false, why: err.message }));
    if (input.value.trim().toLowerCase() !== slug) return; // They typed on.
    last = res;
    status.className = `small addr-status ${res.ok ? 'ok' : 'bad'}`;
    status.textContent = res.ok ? `${res.host} is free.` : res.why;
    save.disabled = !res.ok;
  };
  input.addEventListener('input', () => { save.disabled = true; clearTimeout(timer); timer = setTimeout(check, 250); });
  api('GET', `/api/domains/address?slug=${encodeURIComponent(current)}`).then((r) => { base.textContent = `.${r.base}`; check(); }).catch(() => {});
  const form = h('form', { class: 'addr-form', onsubmit: async (e) => {
    e.preventDefault();
    if (!last?.ok) return;
    if (!await uiConfirm(`Move to ${last.host}? Everyone signs in there from now on. ${current}${base.textContent} keeps sending people to the new address for 30 days, then anyone can take it. Links you have shared to your own domain keep working.`, { ok: 'Change address' })) return;
    save.disabled = true;
    try {
      const out = await api('POST', '/api/domains/address', { slug: last.slug });
      location.assign(`${out.url.replace(/\/$/, '')}/org.html#domain`);
    } catch (err) { status.className = 'small addr-status bad'; status.textContent = err.message; save.disabled = false; }
  } }, h('div', { class: 'addr-field' }, input, base), save);
  return h('section', { class: 'card card-border bg-base-100 domain-card' }, h('div', { class: 'card-body' },
    h('h2', { class: 'card-title text-base' }, 'Your Dashi address'),
    h('p', { class: 'muted small' }, 'Your organisation’s own space on Dashi: staff sign in here and your public sites live here. One word, letters and numbers (a dash between words is fine), not case sensitive.'),
    form, status));
}

/** The org's own domains (Custom plan): add one, see the DNS records to set, check them. */
function OwnDomains(org) {
  const box = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const load = () => api('GET', '/api/domains').then(({ domains, allowed, target }) => {
    const input = h('input', { class: 'input input-sm', placeholder: 'www.yourorg.org', name: 'new-domain' });
    const msg = h('span', { class: 'small', role: 'status' });
    const STATUS = { pending: ['badge-warning', 'Waiting for DNS'], verified: ['badge-info', 'Yours; not pointing here yet'], active: ['badge-success', 'Working'] };
    // (replaceChildren would print `false` for the parts a plan leaves out: the old “falsefalse”.)
    box.replaceChildren(...[
      h('h2', { class: 'domain-own-title' }, 'Your own domain'),
      h('p', { class: 'muted' }, `Your Dashi address, ${location.host.replace(/:\d+$/, '')}, always works, as a mirror of your own domain. `, allowed ? 'You can also use your own domain. You keep managing its DNS where it is; add the records below at your registrar (where you bought the domain), then press Check.' : 'Using your own domain comes with the Custom plan.'),
      h('div', {}, domains.map((d) => h('div', { class: 'card card-border bg-base-100 domain-card' }, h('div', { class: 'card-body' },
        h('div', { class: 'domain-head' }, h('strong', {}, d.host), h('span', { class: `badge badge-sm ${STATUS[d.status][0]}` }, STATUS[d.status][1]), d.primary && h('span', { class: 'badge badge-sm badge-ghost' }, 'Main address'),
          h('span', { class: 'spacer' }),
          d.status !== 'active' && h('button', { class: 'btn btn-xs btn-primary', onclick: async (e) => { e.target.disabled = true; await api('POST', `/api/domains/${d.host}/check`).catch((err) => uiAlert(err.message)); load(); } }, 'Check now'),
          d.status === 'active' && !d.primary && h('button', { class: 'btn btn-xs', onclick: async () => { await api('POST', `/api/domains/${d.host}/primary`); load(); } }, 'Make main address'),
          h('button', { class: 'btn btn-xs btn-ghost btn-error', onclick: async () => { if (await uiConfirm(`Stop using ${d.host}? It stops working at once.`)) { await api('DELETE', `/api/domains/${d.host}`); load(); } } }, 'Remove')),
        d.records.length > 0 && h('table', { class: 'table table-sm dns-table' },
          h('thead', {}, h('tr', {}, ['Type', 'Name (host)', 'Value', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.records.map((r) => h('tr', {}, h('td', {}, h('code', {}, r.type)), h('td', {}, h('code', {}, r.name)), h('td', {}, h('code', { class: 'dns-value' }, r.value),
            h('button', { class: 'btn btn-xs btn-ghost', onclick: () => navigator.clipboard?.writeText(r.value) }, 'Copy')), h('td', { class: 'muted small' }, r.why))))),
        d.records.length > 0 && h('p', { class: 'muted small' }, 'Some registrars want only the first part of the name (', h('code', {}, '_dashi'), ' or ', h('code', {}, d.records.some((r) => r.type === 'CNAME') ? d.host.split('.')[0] : '@'), '). Changes can take an hour or two to show; Dashi checks again every hour for a week.'),
        d.note && h('p', { class: 'small' }, d.note))))),
      allowed && h('form', { class: 'inline-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/domains', { host: input.value }); load(); } catch (err) { msg.textContent = err.message; }
      } }, input, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Add domain'), msg),
      allowed && h('details', { class: 'domain-help' }, h('summary', {}, 'www or the bare domain?'),
        h('p', { class: 'small' }, `Use www.yourorg.org if you can: it takes one CNAME record pointing at ${target}, which keeps working if Dashi’s servers move. A bare domain (yourorg.org) needs A records to Dashi’s addresses instead, unless your registrar offers ALIAS or ANAME records. Many registrars can forward the bare domain to www for you.`)),
    ].filter(Boolean));
  }).catch((err) => box.replaceChildren(h('p', { class: 'empty' }, err.message)));
  load();
  return box;
}

store.addEventListener('change', render);
window.addEventListener('hashchange', () => { render(); openFromHash(); });
render();
openFromHash();
