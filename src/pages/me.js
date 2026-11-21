import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar } from '../ui/Shell.js';
import { readImage } from '../ui/images.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { autosaveDoc, session } from '../platform/storage.js';
import { loadAll } from '../platform/docs.js';
import { ROLES } from '../platform/org.js';
import { currentUser } from '../platform/session.js';
import { statusById, taskSummary, ancestors, NODE_TYPES } from '../platform/strategy.js';
import { mapsFor } from '../platform/maps.js';
import { short, today, addDays } from '../strategy/dates.js';
import { uiAlert, uiForm, uiPanel } from '../ui/dialog.js';
import { linkTo } from '../plugins.js';

/**
 * My profile: the signed-in person's picture and details, the strategic
 * areas they follow, and everything that is theirs across the plugins:
 * tasks, workplans, dashboards, maps and shows.
 */
const docs = loadAll();
const store = new Store(docs.org, applyCollectionOp);
autosaveDoc('org', store, 150);
const app = document.querySelector('#app');
const now = today();

function render() {
  const org = store.doc;
  Shell(document.querySelector('#shell'), { current: 'me', org });
  const me = currentUser(org);
  if (!me) return app.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'empty' }, 'This org has no staff yet.')));
  const update = (patch) => store.apply(col.update('staff', me.id, patch));
  const role = ROLES.find((r) => r.id === me.roleId);
  const hostedNotAdmin = !!session() && !session().canAdmin;
  const nodes = Object.values(docs.strategy.nodes);
  const myTasks = nodes.filter((n) => n.type === 'task' && (n.assigneeIds ?? []).includes(me.id)).sort((a, b) => (a.end ?? '9999').localeCompare(b.end ?? '9999'));
  const myWorkplans = nodes.filter((n) => n.type === 'workplan' && ((n.staffIds ?? []).includes(me.id) || (n.teamIds ?? []).some((t) => (me.teamIds ?? []).includes(t))));
  const areas = nodes.filter((n) => n.type === 'objective' || n.type === 'goal');
  const followed = areas.filter((n) => (me.interests ?? []).includes(n.id));
  const myDashboards = Object.values(docs.dashboards.dashboards).filter((d) => d.createdBy === me.id);
  const myMaps = mapsFor(docs.maps, me.id);
  const myShows = Object.values(docs.podcasts.podcasts).filter((p) => (p.hostIds ?? []).includes(me.id));
  const open = myTasks.filter((t) => t.status !== 'done');
  const soon = addDays(now, 14);
  const groups = [
    { id: 'overdue', label: 'Overdue', tasks: open.filter((t) => t.end && t.end < now) },
    { id: 'soon', label: 'Next two weeks', tasks: open.filter((t) => t.end && t.end >= now && t.end <= soon) },
    { id: 'later', label: 'Later', tasks: open.filter((t) => !t.end || t.end > soon) },
    { id: 'done', label: 'Done', tasks: myTasks.filter((t) => t.status === 'done') },
  ];

  const card = (title, count, body, extra = {}) => h('section', { class: `me-card ${extra.cls ?? ''}` },
    h('div', { class: 'me-card-head' }, extra.icon && icon(extra.icon, 18), h('h2', {}, title), count != null && h('span', { class: 'me-count' }, String(count)), h('span', { class: 'spacer' }), extra.action),
    body);
  const empty = (text) => h('p', { class: 'me-empty' }, text);
  const contact = [
    me.email && [icon('mail', 15), h('a', { href: `mailto:${me.email}` }, me.email)],
    me.phone && [icon('phone', 15), h('a', { href: `tel:${me.phone.replace(/[^\d+]/g, '')}` }, me.phone)],
    me.location && [icon('pin', 15), h('span', {}, me.location)],
  ].filter(Boolean).map((bits) => h('span', { class: 'me-contact-item' }, bits));

  app.replaceChildren(h('div', { class: 'page me-page' },
    h('section', { class: 'me-hero' },
      h('div', { class: 'me-hero-main' },
        h('label', { class: 'me-avatar', title: 'Change your picture' },
          Avatar(me, 104),
          h('span', { class: 'me-avatar-edit' }, icon('upload', 16), 'Change'),
          h('input', { type: 'file', accept: 'image/*', class: 'sr-only', onchange: async (e) => {
            try { update({ avatar: await readImage(e.target.files[0], 192) }); } catch (err) { uiAlert(err.message, { title: 'That picture didn’t work', kind: 'error' }); }
          } })),
        h('div', { class: 'me-id' },
          h('p', { class: 'me-greet' }, greeting()),
          h('h1', {}, me.name, me.pronouns && h('span', { class: 'me-pronouns' }, me.pronouns)),
          h('p', { class: 'me-title' }, [me.title || 'Add your title', role?.label].filter(Boolean).join(' · ')),
          contact.length > 0 && h('div', { class: 'me-contact' }, contact),
          h('div', { class: 'me-chips' },
            (me.teamIds ?? []).map((tid) => org.teams[tid] && h('span', { class: 'me-team', style: `--team:${org.teams[tid].color}` }, org.teams[tid].name)))),
        h('div', { class: 'me-hero-actions' },
          h('button', { class: 'btn btn-sm btn-primary', onclick: () => editProfile(me, update, hostedNotAdmin) }, icon('pencil', 14), 'Edit profile'),
          me.avatar && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => update({ avatar: null }) }, 'Remove picture'))),
      h('div', { class: 'me-stats' },
        stat(open.length, 'open tasks', 'features'),
        stat(groups[0].tasks.length, 'overdue', 'warn', groups[0].tasks.length ? 'alert' : ''),
        stat(groups[1].tasks.length, 'due in 2 weeks', 'calendar'),
        stat(myWorkplans.length, 'workplans', 'sec-strategy'),
        stat(myMaps.length, 'maps', 'sec-mapper'),
        stat(myDashboards.length, 'dashboards', 'sec-data'))),

    h('div', { class: 'me-layout' },
      h('div', { class: 'me-main' },
        card('My tasks', open.length, myTasks.length
          ? h('div', { class: 'me-taskgroups' }, groups.filter((g) => g.tasks.length).map((g) =>
              h('details', { class: `me-taskgroup ${g.id}`, open: g.id !== 'done' },
                h('summary', {}, h('span', {}, g.label), h('span', { class: 'me-count' }, String(g.tasks.length))),
                h('ul', { class: 'me-tasks' }, g.tasks.map((t) => h('li', { class: t.status === 'done' ? 'done' : '' },
                  h('span', { class: 'me-dot', style: `background:${statusById[t.status].color}`, title: statusById[t.status].label }),
                  h('div', { class: 'me-task-text' },
                    h('a', { href: linkTo('strategy', `#${t.id}`) }, t.title),
                    h('small', {}, docs.strategy.nodes[t.parentId]?.title ?? '')),
                  h('span', { class: `me-when ${g.id}` }, t.end ? short(t.end) : 'No date')))))))
          : empty('No tasks assigned to you. When someone assigns you one in Strategy & Work, it shows here.'),
          { icon: 'features', cls: 'tasks' }),
        card('My workplans', myWorkplans.length, myWorkplans.length
          ? h('ul', { class: 'me-workplans' }, myWorkplans.map((w) => {
              const s = taskSummary(docs.strategy, w.id);
              const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
              return h('li', {},
                h('a', { href: linkTo('strategy', `#${w.id}`), class: 'me-wp-title' }, w.title),
                h('small', { class: 'muted' }, ancestors(docs.strategy, w.id).filter((a) => a.type === 'goal' || a.type === 'objective').map((a) => a.title).join(' › ')),
                h('div', { class: 'me-wp-bar' }, h('progress', { class: 'progress progress-primary', value: s.done, max: s.total || 1, 'aria-label': `${s.done} of ${s.total} tasks done` }), h('span', {}, `${s.done}/${s.total} · ${pct}%`)));
            }))
          : empty('You aren’t on any workplans yet.'), { icon: 'sec-strategy' })),

      h('aside', { class: 'me-side' },
        card('About me', null, h('div', { class: 'me-about' },
          me.bio ? h('p', {}, me.bio) : h('p', { class: 'muted' }, 'A line or two about you and your work helps colleagues and partners know who to ask.'),
          h('button', { class: 'btn btn-xs btn-ghost', onclick: () => editProfile(me, update, hostedNotAdmin) }, me.bio ? 'Edit' : 'Write a short bio')),
          { icon: 'userCircle' }),
        card('Areas I follow', followed.length, h('div', {},
          followed.length
            ? h('ul', { class: 'me-areas' }, followed.map((n) => {
                const s = taskSummary(docs.strategy, n.id);
                return h('li', {},
                  h('span', { class: 'glyph' }, NODE_TYPES[n.type].glyph),
                  h('div', { class: 'me-area-text' }, h('a', { href: linkTo('strategy', `#${n.id}`) }, n.title),
                    h('div', { class: 'me-wp-bar' }, h('progress', { class: 'progress progress-primary', value: s.done, max: s.total || 1 }), h('span', {}, `${s.done}/${s.total}`))));
              }))
            : empty('Follow the objectives and goals you care about to see their progress here.')),
          { icon: 'target', action: h('button', { class: 'btn btn-xs', onclick: () => chooseAreas(me, areas, update) }, followed.length ? 'Change' : 'Choose') }),
        card('My ecosystem maps', myMaps.length, myMaps.length
          ? h('ul', { class: 'me-links' }, myMaps.map((m) => h('li', {}, h('a', { href: linkTo('mapper', `#${m.id}`) }, m.title),
              h('small', {}, `${Object.keys(docs.mapContents[m.id]?.actors ?? {}).length} actors · ${m.ownerId === me.id ? 'owner' : 'member'}`))))
          : empty('You don’t own or belong to any maps yet.'), { icon: 'sec-mapper' }),
        card('Dashboards I made', myDashboards.length, myDashboards.length
          ? h('ul', { class: 'me-links' }, myDashboards.map((d) => h('li', {}, h('a', { href: linkTo('palette', `#${d.id}`) }, d.title), h('small', {}, `${d.widgets.length} widgets · ${d.visibility}`))))
          : empty('Make one from an objective in Strategy & Work, or in the Data Workbench.'), { icon: 'sec-data' }),
        myShows.length > 0 && card('Shows I host', myShows.length,
          h('ul', { class: 'me-links' }, myShows.map((p) => h('li', {}, h('a', { href: linkTo('podcasts', `#series/${p.id}`) }, p.title), h('small', {}, p.category)))), { icon: 'sec-podcasts' }))),
    h('p', { class: 'note' }, session() ? 'Your name, title, picture, contact details, bio and the areas you follow are yours to change. Your role and teams are set by your organisation’s admin.' : 'Accounts are mocked for now: use the menu under your picture (top right) to see the platform as anyone in the org.'),
  ));
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

async function editProfile(me, update, emailLocked) {
  const v = await uiForm({
    title: 'Edit your profile', ok: 'Save profile', wide: true,
    fields: [
      { half: true, name: 'name', label: 'Name', value: me.name, required: true, autocomplete: 'name' },
      { half: true, name: 'pronouns', label: 'Pronouns', value: me.pronouns ?? '', placeholder: 'e.g. she/her, they/them', help: 'Optional. Shown beside your name.' },
      { half: true, name: 'title', label: 'Job title', value: me.title ?? '', placeholder: 'e.g. Program Manager', autocomplete: 'organization-title' },
      { half: true, name: 'email', label: 'Email', type: 'email', value: me.email ?? '', readonly: emailLocked, help: emailLocked ? 'Your sign-in email. Your organisation’s admin can change it.' : 'Also your sign-in email.', autocomplete: 'email' },
      { half: true, name: 'phone', label: 'Phone', type: 'tel', value: me.phone ?? '', placeholder: 'Optional', autocomplete: 'tel' },
      { half: true, name: 'location', label: 'Where you work', value: me.location ?? '', placeholder: 'e.g. Halifax, or Remote' },
      { name: 'bio', label: 'About you', type: 'textarea', value: me.bio ?? '', placeholder: 'A line or two about you and your work.' },
    ],
    validate: (x) => { if (!x.name.trim()) throw new Error('Your name can’t be empty.'); },
  });
  if (!v) return;
  const patch = { name: v.name.trim(), pronouns: v.pronouns.trim(), title: v.title.trim(), phone: v.phone.trim(), location: v.location.trim(), bio: v.bio.trim() };
  if (!emailLocked) patch.email = v.email.trim();
  update(patch);
}

async function chooseAreas(me, areas, update) {
  const picked = new Set(me.interests ?? []);
  const out = await uiPanel({
    title: 'Areas you follow', message: 'Objectives and goals from Strategy & Work. Followed ones show on your profile with their progress.', ok: 'Save', cancel: 'Cancel',
    build: (set) => {
      set([...picked]);
      return h('ul', { class: 'me-pick' }, areas.map((n) => h('li', {}, h('label', {},
        h('input', { type: 'checkbox', class: 'checkbox checkbox-sm checkbox-primary', checked: picked.has(n.id), onchange: (e) => { if (e.target.checked) picked.add(n.id); else picked.delete(n.id); set([...picked]); } }),
        h('span', { class: 'glyph' }, NODE_TYPES[n.type].glyph), h('span', {}, n.title), h('small', { class: 'muted' }, n.type)))));
    },
  });
  if (out) update({ interests: out });
}

const stat = (n, label, ic, cls = '') => h('div', { class: `me-stat ${cls}` }, icon(ic, 16), h('strong', {}, String(n)), h('span', {}, label));

store.addEventListener('change', render);
render();
