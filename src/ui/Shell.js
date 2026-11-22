import { h } from './dom.js';
import { icon } from './icons.js';
import { RippleMark } from './Wordmark.js';
import { enabledPlugins, canOpen, orgUses, currentWho, toneFor, topOf, PLUGINS } from '../plugins.js';
import { ROLES, initials } from '../platform/org.js';
import { FeedbackButton, version } from './Support.js';
import { NetLight } from './netlight.js';
import { toast } from './toast.js';
import { uiAlert, uiPrompt } from './dialog.js';
import { SearchBox, wireSearchKey } from './SearchBox.js';
import { setPlugin } from './crumbs.js';
import { session } from '../platform/storage.js';
import { orgList, openOrg, createOrg, currentUser, signInAs, can, signOut, signedInUser, platformUrl } from '../platform/session.js';

/**
 * The header shared by every page, in two rows:
 *
 *   top    the dashi mark (with the server-call light, for the platform
 *          admin), the open organisation, then search, help and your profile (which holds the organisation
 *          switcher, settings, "view as" and sign out)
 *   bar    the org's plugins, each with its icon and full name (the open
 *          one is lit; nothing changes size when you switch)
 *
 * Accounts are mocked locally: "Sign in as" picks a staff record, so you
 * can see the platform as anyone.
 */
export function Shell(el, { current, org }) {
  const me = currentUser(org);
  const role = ROLES.find((r) => r.id === me?.roleId);
  const account = signedInUser();
  // A sub-plugin's pages belong to its parent: the parent's tab is lit and its colour used.
  const home = topOf(current);
  const link = (id, href, label, iconName) => {
    const on = id === home;
    return h('a', { href, class: `shell-link${on ? ' active' : ''}`, style: `--tone:${toneFor(id)}`, 'aria-current': on ? 'page' : null },
      icon(iconName, 18), h('span', {}, label));
  };
  const orgs = orgList();
  const switcher = orgs.length > 1 || can.manageOrgs();

  // The page takes its plugin's colour (buttons, links, highlights).
  document.body.dataset.plugin = current;
  document.body.style.setProperty('--color-primary', toneFor(home));
  el.classList.add('shell');
  el.replaceChildren(
    h('div', { class: 'shell-top' },
      h('a', { class: 'shell-home', href: 'index.html', title: 'Dashi home' }, RippleMark(26), h('span', { class: 'shell-word' }, 'dashi'), StageBadge()),
      // The server-call light: for the platform admin only, a bare light beside the logo (click for the recent calls).
      account?.isSuper && (netLight ??= NetLight({ compact: true })),
      h('span', { class: 'shell-slash', 'aria-hidden': 'true' }, '/'),
      h('a', { class: 'shell-orgname', href: 'org.html', title: `${org.name}: organisation settings` }, org.name),
      h('span', { class: 'shell-gap' }),
      SearchBox(org),
      h('a', { class: `shell-icon${current === 'help' ? ' active' : ''}`, href: 'help.html', 'aria-label': 'Help', 'data-tip': 'Help' }, icon('question', 19)),
      h('details', { class: 'dropdown dropdown-end shell-user' },
        h('summary', { title: 'Your profile', 'aria-label': 'Your profile and organisations' }, Avatar(me, 30)),
        h('ul', { class: 'menu dropdown-content shell-menu' },
          h('li', { class: 'shell-me' }, h('div', {}, Avatar(me, 36), h('span', {}, h('strong', {}, me?.name ?? 'Not signed in'), h('small', {}, [role?.label, account?.email].filter(Boolean).join(' · '))))),
          h('li', {}, h('a', { href: 'me.html' }, icon('person', 16), 'My profile and work')),
          h('li', {}, h('a', { href: 'org.html' }, icon('settings', 16), 'Organisation settings')),
          switcher && [
            h('li', { class: 'menu-title' }, account?.isSuper ? 'Organisations (platform admin)' : 'Organisations'),
            orgs.map((o) => h('li', {}, h('button', { class: o.id === org.id ? 'menu-active' : '', onclick: () => o.id !== org.id && openOrg(o.id) }, h('span', { class: 'shell-org-dot' }, initials(o.name)), o.name))),
            can.manageOrgs() && (platformUrl()
              ? h('li', {}, h('a', { href: platformUrl() }, icon('shield', 16), 'Platform admin'))
              : h('li', {}, h('button', { onclick: async () => {
                  const name = await uiPrompt('Name of the new organisation', '', { title: 'New organisation', ok: 'Create' });
                  if (name?.trim()) { createOrg(name.trim()); location.assign('org.html'); }
                } }, icon('plus', 16), 'New organisation…'))),
          ],
          can.viewAs() && [
            h('li', { class: 'menu-title' }, account ? 'View as (to see what they see)' : 'Sign in as (mock accounts)'),
            Object.values(org.staff).sort((a, b) => a.name.localeCompare(b.name)).map((s) =>
              h('li', {}, h('button', { class: s.id === me?.id ? 'menu-active' : '', onclick: async () => {
                try { await signInAs(org.id, s.id); location.reload(); } catch (err) { uiAlert(err.message, { title: 'Couldn’t switch' }); }
              } }, Avatar(s, 20), s.name)))],
          can.signOut() && h('li', { class: 'shell-out' }, h('button', { onclick: signOut }, icon('swap', 16), 'Sign out'))))),
    PluginBar(org, link),
  );
  wireSearchKey();
  RoleGate(org, current, role);
  setPlugin(current);
  // Pages draw the header again on every change; the listeners below go on once.
  if (wired) return;
  wired = true;
  FeedbackButton();
  if (session()?.staging) StagingBanner();
  if (session()?.banner) MaintenanceBanner(session().banner);
  if (session()?.legalDue?.length) LegalPrompt(session().legalDue);
  // The "confirm your email" note is paused until Dashi goes live (VerifyNote below).
  SkipLink(); // last, so it lands first in the page
  // A small note in the bottom-left corner when a change is saved, or when it couldn't be.
  // "Saved" shows on the save light in the header; a failure also gets a note.
  window.addEventListener('toolbox:save-failed', (e) => toast(`Not saved: ${e.detail.why}`, 'error'));
  window.addEventListener('toolbox:save-conflict', (e) => conflictBanner(e.detail));
  // Close a menu when clicking elsewhere.
  document.addEventListener('click', (e) => {
    for (const d of document.querySelectorAll('.shell details[open]')) if (!d.contains(e.target)) d.open = false;
  });
}
let wired = false;
let netLight = null;

/**
 * The plugin bar keeps to one row. Plugins that don't fit go into a
 * "More" menu at its end, as a grid of tiles; the plugin you're in always
 * stays on the bar (it takes the last place that fits). It is measured
 * again whenever the bar changes width, so it works at any screen size and
 * with any number of plugins switched on.
 */
export function PluginBar(org, link) {
  const plugins = enabledPlugins(org).filter((p) => p.nav !== false && !p.parent);
  const links = plugins.map((p) => link(p.id, p.href, p.name, p.icon));
  const tiles = h('div', { class: 'shell-more-grid' });
  const count = h('b', { class: 'shell-more-count' });
  const more = h('details', { class: 'dropdown dropdown-end shell-more' },
    h('summary', { class: 'shell-link', style: '--tone:#5b6270', title: 'More plugins', 'aria-label': 'More plugins' }, icon('sec-plugins', 18), h('span', {}, 'More'), count),
    h('div', { class: 'dropdown-content shell-more-menu' },
      h('p', { class: 'shell-more-title' }, 'More plugins'),
      tiles,
      h('a', { class: 'shell-more-manage', href: 'org.html#plugins' }, icon('settings', 15), 'Organisation → Plugins')));
  const nav = h('nav', { class: 'shell-bar', 'aria-label': 'Plugins' },
    link('home', 'index.html', 'Home', 'sec-home'),
    h('span', { class: 'shell-bar-sep', 'aria-hidden': 'true' }),
    links, more);
  const fits = () => nav.scrollWidth <= nav.clientWidth + 1;
  const fit = () => {
    if (!nav.isConnected || !nav.clientWidth) return;
    for (const a of links) a.hidden = false;
    more.hidden = true;
    if (fits()) return;
    more.hidden = false;
    const active = links.find((a) => a.classList.contains('active'));
    // Hide from the end, keeping the plugin you're in.
    for (let i = links.length - 1; i >= 0 && !fits(); i--) if (links[i] !== active) links[i].hidden = true;
    // Still too wide (a very narrow screen): the active one goes last of all.
    if (!fits() && active) active.hidden = true;
    const hidden = plugins.filter((_, i) => links[i].hidden);
    count.textContent = hidden.length;
    tiles.replaceChildren(...hidden.map((p) => link(p.id, p.href, p.name, p.icon)));
    more.querySelector('summary').classList.toggle('holds-active', !!active?.hidden);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestAnimationFrame(fit)).observe(nav);
  requestAnimationFrame(fit);
  document.fonts?.ready?.then(fit);
  return nav;
}

/**
 * A plugin this person can't open: switched off for the org, inside a
 * parent that is off, or left out of their role or for them alone
 * (Organisation → Plugins). Say so kindly over the page, with a way home.
 * The server already withholds the plugin's documents (platform/access.js).
 */
function RoleGate(org, current, role) {
  const p = PLUGINS.find((x) => x.id === current);
  const blocked = p && !p.core && !canOpen(org, p.id);
  document.querySelector('.role-gate')?.remove();
  if (!blocked) return;
  const forOrg = !orgUses(org, p.id);
  const forMe = !forOrg && org.pluginPeople?.[p.id]?.[currentWho(org).staffId] === false;
  document.body.append(h('div', { class: 'role-gate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'role-gate-title' },
    h('div', { class: 'role-gate-card', style: `--tone:${p.tone}` },
      h('span', { class: 'role-gate-icon', 'aria-hidden': 'true' }, icon(p.icon, 26)),
      h('h1', { id: 'role-gate-title' }, forOrg ? `${p.name} isn’t switched on here` : `${p.name} isn’t in your toolkit`),
      h('p', {}, forOrg
        ? `Your organisation doesn’t use ${p.name} at the moment. An admin can switch it on under Organisation → Plugins.`
        : forMe ? `An admin has switched ${p.name} off for you. If you need it, ask them: it’s under Organisation → Plugins.`
        : `Your organisation gives ${role?.label ? `the ${role.label} role` : 'your role'} its own set of tools, and ${p.name} isn’t one of them yet. If you need it, ask an admin: they can change it under Organisation → Plugins.`),
      h('a', { class: 'btn btn-primary', href: 'index.html' }, 'Back to your dashboard'))));
}

/** For keyboards: the first Tab stop jumps past the header to the page's main content. */
function SkipLink() {
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main';
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  document.body.prepend(h('a', { class: 'skip-link', href: `#${main.id}` }, 'Skip to content'));
}

/** "alpha" beside the wordmark, with the exact version on hover. */
function StageBadge() {
  const v = version();
  const stage = /alpha|beta/.exec(v)?.[0];
  return stage && h('span', { class: 'stage-badge', title: `Dashi ${v}: still being built. Tell us what you find with Feedback (bottom right).` }, stage);
}

/** A test server says so on every page. */
function StagingBanner() {
  document.body.prepend(h('div', { class: 'staging-banner', role: 'note' },
    h('strong', {}, 'Test server.'), ' Data here is for testing and may be reset. Please don’t put anything private in it. ',
    h('a', { href: 'help.html#alpha' }, 'Testing guide')));
}

/** The platform admin's maintenance or incident notice (Platform admin → Health). */
function MaintenanceBanner({ text, level }) {
  document.body.prepend(h('div', { class: `maint-banner maint-${level}`, role: 'status' }, icon(level === 'warning' ? 'alert' : 'info', 15), h('span', {}, text)));
}

/** New terms or privacy policy: ask once, with links to read them. */
function LegalPrompt(due) {
  const names = { terms: 'Terms of service', privacy: 'Privacy policy' };
  const bar = h('div', { class: 'legal-prompt', role: 'dialog', 'aria-label': 'Updated terms' },
    h('span', {}, 'We’ve updated our ', due.map((d, i) => [i ? ' and ' : '', h('a', { href: `/legal.html?doc=${d.kind}`, target: '_blank' }, names[d.kind] ?? d.kind)]), '. Please read and accept them to keep using Dashi.'),
    h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
      const res = await fetch('/api/legal/accept', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: '{}' });
      if (res.ok) bar.remove(); else toast('That didn’t save. Try again.', 'error');
    } }, 'I accept'));
  document.body.append(bar);
}

/** A new account hasn't confirmed its email yet: a quiet note with a resend link. */
function VerifyNote() {
  const note = h('div', { class: 'verify-note', role: 'note' }, 'Please confirm your email address: we sent you a link. ',
    h('button', { class: 'link-button', onclick: async () => {
      await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: '{}' });
      note.replaceChildren('Sent. Check your inbox (and spam).');
    } }, 'Send it again'));
  document.body.prepend(note);
}

/** Someone else saved the same document: say so until the page is reloaded. */
function conflictBanner({ why }) {
  if (document.querySelector('.conflict-banner')) return;
  document.body.append(h('div', { class: 'alert alert-warning conflict-banner', role: 'alert' },
    h('span', {}, why ?? 'Someone else saved changes here while you were working.'),
    h('button', { class: 'btn btn-sm', onclick: () => location.reload() }, 'Reload')));
}

/** A person's picture, or their initials. */
export function Avatar(person, size = 28) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`;
  return person?.avatar
    ? h('img', { class: 'avatar-img', src: person.avatar, alt: '', width: size, height: size, decoding: 'async', style })
    : h('span', { class: 'avatar-initials', style, 'aria-hidden': 'true' }, initials(person?.name));
}

/** The org's logo, or its initials in a square. */
export function Logo(org, size = 28) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  return org.logo
    ? h('img', { class: 'logo-img', src: org.logo, alt: `${org.name} logo`, width: size, height: size, style })
    : h('span', { class: 'logo-initials', style, 'aria-hidden': 'true' }, initials(org.name));
}

export { toast } from './toast.js';
