import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { uiAlert, uiConfirm, uiPrompt } from '../ui/dialog.js';
import { taxInsideOf } from '../platform/plans.js';

/**
 * The platform admin's control centre: one place to run the hosted
 * platform once it is live.
 *
 *   #health    the server, database, backups, off-site copies, email and payments at a glance; the maintenance banner; errors
 *   #data      storage per organisation, exports, backups, and how to restore
 *   #email     the provider, a test message, the sending domain's DNS, and the words of each email
 *   #payments  Stripe: prices (tax included), tax settings, trials, each org's billing, free accounts
 *   #twostep   your two-step sign-in, and where everyone is signed in (with the security audit, in #security)
 *   #activity  the audit log: who changed what
 *   #legal     terms, privacy, accessibility, data processing: edit, publish a version, see acceptances
 *
 * Secrets (API keys) are never shown or stored here: they are server
 * settings (Fly secrets). Each panel shows whether a key is set and working.
 */
const size = (n) => (n == null ? '—' : n > 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const ago = (sec) => (sec < 3600 ? `${Math.round(sec / 60)} min` : sec < 172800 ? `${Math.round(sec / 3600)} h` : `${Math.round(sec / 86400)} days`);

/** A light: ok (green), warn (amber), off (grey) or bad (red), with a label. */
const light = (state, label) => h('span', { class: `cc-light cc-${state}` }, h('i'), label);
const card = (title, ...body) => h('section', { class: 'cc-card' }, h('h3', {}, title), ...body);
/** replaceChildren, skipping empty parts (it would show null and false as text). */
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
const loading = () => h('p', { class: 'muted' }, 'Loading…');
const fail = (box) => (err) => fill(box, h('p', { class: 'text-error' }, err.message));
const head = (title, lede) => [h('h2', {}, title), lede && h('p', { class: 'muted small cc-lede' }, lede)];
const kv = (rows) => h('dl', { class: 'cc-kv' }, rows.filter(Boolean).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
const envName = (s) => h('code', { class: 'cc-env' }, s);

/* ---------------------------------------------------------------- health */
export function Health({ call }) {
  const box = h('div', {}, loading());
  const load = async () => {
    const x = await call('GET', '/api/admin/health');
    const errs = await call('GET', '/api/admin/errors');
    const diskShare = x.disk ? 1 - x.disk.free / x.disk.total : null;
    const backupAge = x.backups.latest ? (Date.now() - Date.parse(x.backups.latest.at)) / 1000 : null;
    const tiles = [
      { title: 'Server', state: 'ok', value: `Up ${ago(x.uptimeSec)}`, sub: `Dashi ${x.version} · Node ${x.node.replace(/^v/, '')}`, href: null },
      { title: 'Disk', state: diskShare == null ? 'off' : diskShare > 0.9 ? 'bad' : diskShare > 0.75 ? 'warn' : 'ok', value: x.disk ? `${Math.round(diskShare * 100)}% used` : 'Unknown', sub: x.disk ? `${size(x.disk.free)} free of ${size(x.disk.total)}` : '', href: '#data' },
      { title: 'Daily backups', state: backupAge == null ? 'bad' : backupAge > 2 * 86400 ? 'warn' : 'ok', value: backupAge == null ? 'None yet' : `${ago(backupAge)} ago`, sub: `${x.backups.count} kept, ${x.backups.keepDays} days`, href: '#data' },
      { title: 'Off-site copies', state: !x.litestream.configured ? 'warn' : x.litestream.running ? 'ok' : 'bad', value: !x.litestream.configured ? 'Not set up' : x.litestream.running ? 'Copying' : 'Not running', sub: x.litestream.configured ? `Litestream → ${x.litestream.bucket}` : 'Litestream to a bucket', href: '#data' },
      { title: 'Email', state: x.mail.enabled ? 'ok' : 'warn', value: x.mail.enabled ? `Sending (${x.mail.provider})` : 'Logged only', sub: x.mail.from, href: '#email' },
      { title: 'Payments', state: !x.stripe.connected ? 'off' : x.stripe.webhook ? (x.stripe.mode === 'live' ? 'ok' : 'warn') : 'bad', value: !x.stripe.connected ? 'Not connected' : `Stripe, ${x.stripe.mode} mode`, sub: !x.stripe.connected ? 'Plans set by hand' : x.stripe.webhook ? (x.stripe.checkoutOn ? 'Card payments on' : 'Card payments off') : 'No webhook secret', href: '#payments' },
      { title: 'Two-step sign-in', state: x.twoStep.admins.every((a) => a.on) ? 'ok' : x.twoStep.required ? 'bad' : 'warn', value: `${x.twoStep.admins.filter((a) => a.on).length} of ${x.twoStep.admins.length} admins`, sub: x.twoStep.required ? 'Required on this server' : 'Not required here', href: '#security' },
      { title: 'Errors', state: x.errors.day ? 'warn' : 'ok', value: x.errors.day ? `${x.errors.day} today` : 'None today', sub: x.errors.latest ? `Last: ${when(x.errors.latest.at)}` : 'Nothing logged', href: '#health-errors' },
    ];
    const banner = x.banner ?? { on: false, text: '', level: 'info' };
    const text = h('input', { class: 'input input-sm cc-wide', value: banner.text, placeholder: 'Dashi will be down for maintenance on Sunday 6 to 7 a.m. Eastern.', 'aria-label': 'Banner text' });
    const level = h('select', { class: 'select select-sm', 'aria-label': 'Banner style' }, options([{ id: 'info', label: 'Notice' }, { id: 'warning', label: 'Warning' }], banner.level));
    const on = h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', checked: banner.on, 'aria-label': 'Show the banner' });
    const saved = h('span', { class: 'muted small', role: 'status' });
    fill(box, 
      ...head('Health', 'How the platform is doing right now. Each tile opens its own panel. An outside uptime monitor should also watch /healthz (see the guides).'),
      h('div', { class: 'cc-tiles' }, tiles.map((t) => h(t.href ? 'a' : 'div', { class: `cc-tile cc-${t.state}`, href: t.href },
        h('span', { class: 'cc-tile-title' }, h('i'), t.title), h('strong', {}, t.value), h('small', {}, t.sub)))),
      h('div', { class: 'cc-grid' },
        card('Server', kv([
          ['Address', `${x.https ? 'https' : 'http'}://${x.baseDomain}`],
          ['Running since', when(x.startedAt)],
          ['Memory', `${size(x.memory.rss)} (heap ${size(x.memory.heap)})`],
          ['Database', `${size(x.database.size)} · ${x.database.orgs} organisations · ${x.database.users} people · ${x.database.sessions} signed in`],
          ['Mode', x.production ? (x.staging ? 'Test server (staging)' : 'Live') : 'Development'],
          ['Sign-up', x.openSignup ? 'Open to anyone' : 'Closed'],
          ['Test sign-in', x.devLogin ? light('warn', 'On: anyone can sign in as anyone') : 'Off'],
        ]), h('p', { class: 'small' }, h('a', { href: '/healthz', target: '_blank' }, '/healthz'), ' · ', h('a', { href: '/version', target: '_blank' }, '/version'))),
        card('Maintenance banner',
          h('p', { class: 'muted small' }, 'A line across the top of every page, for planned maintenance or an incident.'),
          h('div', { class: 'inline-form cc-banner-text' }, text),
          h('div', { class: 'inline-form' }, level, h('label', { class: 'check small' }, on, ' Show it'),
            h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
              try { await call('PUT', '/api/admin/ops', { banner: { text: text.value, level: level.value, on: on.checked } }); saved.textContent = on.checked ? 'Showing on every page.' : 'Saved, not showing.'; } catch (err) { saved.textContent = err.message; }
            } }, 'Save'), saved))),
      h('section', { class: 'cc-card', id: 'health-errors' },
        h('div', { class: 'cc-card-head' }, h('h3', {}, 'Recent server errors'), errs.length ? h('button', { class: 'btn btn-xs', onclick: async () => { if (await uiConfirm('Clear the error list?', { ok: 'Clear' })) { await call('DELETE', '/api/admin/errors'); load(); } } }, 'Clear') : null),
        errs.length
          ? h('ul', { class: 'cc-errors' }, errs.slice(0, 30).map((e) => h('li', {}, h('details', {}, h('summary', {}, h('span', { class: 'muted small' }, when(e.at)), ' ', h('code', {}, `${e.method ?? ''} ${e.path ?? ''}`), ' ', e.message), h('pre', {}, e.stack)))))
          : h('p', { class: 'empty' }, 'No errors. Good.')));
  };
  load().catch(fail(box));
  return box;
}

/* ------------------------------------------------------------------ data */
export function Data({ call, orgs }) {
  const box = h('div', {}, loading());
  const load = async () => {
    const [x, backups] = await Promise.all([call('GET', '/api/admin/health'), call('GET', '/api/admin/backups')]);
    const total = orgs.reduce((n, o) => n + (o.usage?.storageMb ?? 0), 0);
    const now = h('button', { class: 'btn btn-sm', onclick: async () => {
      now.disabled = true;
      try { await call('POST', '/api/admin/backups'); await load(); } catch (err) { uiAlert(err.message); now.disabled = false; }
    } }, icon('download', 14), 'Back up now');
    const ls = x.litestream;
    fill(box, 
      ...head('Data and backups', 'Where the platform’s data is, how much each organisation keeps, and the copies that protect it. There are three layers: a snapshot every day on the server’s disk, Litestream copying every change to a bucket off the server within seconds, and the host’s daily snapshots of the whole disk (audio and files included).'),
      h('div', { class: 'cc-grid' },
        card('Off-site copies (Litestream)',
          ls.configured
            ? kv([['Status', ls.running ? light('ok', 'Copying every change') : light('bad', 'Not running: check fly logs')], ['Bucket', ls.bucket], ls.syncs != null && ['Syncs since start', String(ls.syncs)], ls.errors ? ['Sync errors', light('bad', String(ls.errors))] : null])
            : [h('p', {}, light('warn', 'Not set up')), h('p', { class: 'small' }, 'Attach a bucket with ', h('code', {}, 'fly storage create'), '. Fly sets ', envName('BUCKET_NAME'), ' and the keys as secrets, and Dashi starts Litestream on its next deploy. The data guide has the steps.')]),
        card('Daily snapshots',
          backups.length
            ? h('ul', { class: 'backup-list' }, backups.slice(0, 6).map((b) => h('li', {}, h('span', {}, when(b.at)), h('span', { class: 'muted' }, size(b.size)))))
            : h('p', { class: 'empty' }, 'No snapshots yet.'),
          h('p', { class: 'muted small' }, `Kept for ${x.backups.keepDays} days (BACKUP_DAYS), in the data folder’s backups.`), h('div', {}, now)),
        card('Disk', kv([['Used', x.disk ? `${size(x.disk.total - x.disk.free)} of ${size(x.disk.total)}` : 'Unknown'], ['Database', size(x.database.size)], ['Organisations’ files', `${total.toLocaleString()} MB`]]),
          h('p', { class: 'muted small' }, 'Grow the volume with ', h('code', {}, 'fly volumes extend'), ' before it passes 80%.'))),
      h('section', { class: 'cc-card' },
        h('h3', {}, 'Each organisation'),
        h('p', { class: 'muted small' }, 'Export gives one JSON file with an organisation’s documents, people and file list: for a request to see or move its data (PIPEDA), or before deleting it. Its audio and library files stay on the server.'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
          h('thead', {}, h('tr', {}, ['Organisation', 'Plan', 'People', 'Storage', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, orgs.slice().sort((a, b) => (b.usage?.storageMb ?? 0) - (a.usage?.storageMb ?? 0)).map((o) => {
            const max = o.limits?.limits?.storageMb ?? null;
            return h('tr', {}, h('td', {}, h('strong', {}, o.name)), h('td', {}, o.plan), h('td', {}, String(o.members ?? 0)),
              h('td', {}, `${(o.usage?.storageMb ?? 0).toLocaleString()} MB`, max ? h('span', { class: 'muted small' }, ` of ${max.toLocaleString()}`) : null),
              h('td', {}, h('a', { class: 'btn btn-xs', href: `/api/admin/orgs/${o.id}/export`, download: '' }, icon('download', 12), 'Export')));
          }))))),
      h('section', { class: 'cc-card' },
        h('h3', {}, 'Restoring'),
        h('ol', { class: 'cc-steps' },
          h('li', {}, h('strong', {}, 'One organisation’s mistake'), ' (a deleted plan, say): open a daily snapshot on your computer with ', h('code', {}, 'fly ssh sftp get /data/backups/<file>'), ', and copy the document back. Ask in support if you need a hand.'),
          h('li', {}, h('strong', {}, 'The whole database, to a moment'), ': over ', h('code', {}, 'fly ssh console'), ', restore to a new file with ', h('code', {}, 'litestream restore -o /data/restored.db -timestamp <time> /data/toolbox.db'), ', move it into place with ', h('code', {}, 'mv /data/restored.db /data/toolbox.db'), ', remove ', h('code', {}, 'toolbox.db-wal'), ' and ', h('code', {}, '-shm'), ', then ', h('code', {}, 'fly machine restart'), '.'),
          h('li', {}, h('strong', {}, 'A lost volume'), ': deploy to a new volume; Dashi restores the latest copy from the bucket on its first start. Audio comes back from the host’s volume snapshot (', h('code', {}, 'fly volumes snapshots list'), ').')),
        h('p', { class: 'muted small' }, 'Practise a restore on the test server once a quarter, so it is routine when it matters.')));
  };
  load().catch(fail(box));
  return box;
}

/* ----------------------------------------------------------------- email */
export function Email({ call }) {
  const box = h('div', {}, loading());
  const load = async () => {
    const x = await call('GET', '/api/admin/email');
    const to = h('input', { class: 'input input-sm', type: 'email', placeholder: 'Send to (your email if empty)', 'aria-label': 'Test address' });
    const testMsg = h('span', { class: 'small', role: 'status' });
    const selector = h('input', { class: 'input input-sm', placeholder: 'DKIM selector (optional)', 'aria-label': 'DKIM selector' });
    const dns = h('div', {}, h('p', { class: 'muted small' }, 'Checking DNS…'));
    const checkDns = async () => {
      dns.replaceChildren(h('p', { class: 'muted small' }, 'Checking DNS…'));
      const r = await call('GET', `/api/admin/email/dns?selector=${encodeURIComponent(selector.value)}`);
      dns.replaceChildren(r.note ? h('p', { class: 'muted small' }, r.note) : h('ul', { class: 'cc-checks' }, r.checks.map((c) => h('li', {},
        light(c.ok ? (c.warn ? 'warn' : 'ok') : 'bad', c.label),
        h('div', {}, c.value ? h('code', { class: 'cc-dns' }, c.value) : h('span', { class: 'muted small' }, 'Not found'), c.fix && h('p', { class: 'small' }, c.fix))))));
    };
    const fields = {};
    const templates = Object.entries(x.templates).map(([k, t]) => {
      fields[k] = {
        subject: h('input', { class: 'input input-sm w-full', value: t.subject, 'aria-label': `${t.label}: subject` }),
        lines: h('textarea', { class: 'textarea textarea-sm w-full', rows: 3, 'aria-label': `${t.label}: message` }, t.lines),
        button: h('input', { class: 'input input-sm', value: t.button, 'aria-label': `${t.label}: button` }),
      };
      return h('details', { class: 'cc-template' }, h('summary', {}, h('strong', {}, t.label), h('span', { class: 'muted small' }, ` · ${t.subject}`)),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Subject'), fields[k].subject),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Message (one paragraph a line)'), fields[k].lines),
        h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Button'), fields[k].button),
        h('button', { class: 'btn btn-xs btn-ghost', onclick: () => { const d = x.defaults[k]; fields[k].subject.value = d.subject; fields[k].lines.value = d.lines; fields[k].button.value = d.button; } }, 'Back to the original words'));
    });
    const savedT = h('span', { class: 'muted small', role: 'status' });
    fill(box, 
      ...head('Email', 'Password resets, invitations, email checks, support replies and payment notices. Dashi sends through Postmark or Resend; the key is a server secret.'),
      h('div', { class: 'cc-grid' },
        card('Sending', kv([
          ['Status', x.enabled ? light('ok', `Sending through ${x.provider}`) : light('warn', 'Not sending: messages go to the server log')],
          ['From', x.from],
          ['Support tickets go to', x.support],
          ['Settings', h('span', {}, envName('MAIL_PROVIDER'), ' ', envName('MAIL_API_KEY'), ' ', envName('MAIL_FROM'), ' ', envName('SUPPORT_EMAIL'))],
        ]),
        h('form', { class: 'inline-form', onsubmit: async (e) => {
          e.preventDefault();
          testMsg.textContent = 'Sending…';
          try { const r = await call('POST', '/api/admin/email/test', { to: to.value }); testMsg.textContent = r.logged ? 'Written to the server log (no key set).' : 'Sent. Check the inbox (and spam).'; } catch (err) { testMsg.textContent = err.message; }
        } }, to, h('button', { class: 'btn btn-sm', type: 'submit' }, icon('mail', 14), 'Send a test')), testMsg),
        card(`Sending domain: ${x.domain ?? '—'}`,
          h('p', { class: 'muted small' }, 'Three DNS records decide whether mail from Dashi reaches inboxes or spam. Add them where the domain’s DNS is managed.'),
          dns, h('div', { class: 'inline-form' }, selector, h('button', { class: 'btn btn-sm', onclick: () => checkDns().catch(fail(dns)) }, 'Check again')))),
      h('section', { class: 'cc-card' },
        h('h3', {}, 'The words of each email'),
        h('p', { class: 'muted small' }, '{name}, {org}, {by} and {amount} are filled in. Every email ends with a button and the link written out.'),
        templates,
        h('div', { class: 'inline-form' }, h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
          const body = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { subject: f.subject.value, lines: f.lines.value, button: f.button.value }]));
          try { await call('PUT', '/api/admin/email/templates', body); savedT.textContent = 'Saved.'; } catch (err) { savedT.textContent = err.message; }
        } }, 'Save the emails'), savedT)));
    checkDns().catch(fail(dns));
  };
  load().catch(fail(box));
  return box;
}

/* -------------------------------------------------------------- payments */
const STATUS_LABEL = { active: ['ok', 'Paying'], trialing: ['ok', 'Trial'], past_due: ['bad', 'Payment failed'], canceled: ['off', 'Cancelled'], unpaid: ['bad', 'Unpaid'], incomplete: ['warn', 'Not finished'] };
export function Payments({ call }) {
  const box = h('div', {}, loading());
  const load = async () => {
    const x = await call('GET', '/api/admin/billing');
    const s = x.settings;
    const f = {
      taxLabel: h('input', { class: 'input input-sm', value: s.taxLabel, style: 'width:90px', 'aria-label': 'Tax name' }),
      taxRate: h('input', { class: 'input input-sm', type: 'number', step: '0.5', min: 0, max: 30, value: s.taxRate, style: 'width:80px', 'aria-label': 'Tax rate' }),
      taxNumber: h('input', { class: 'input input-sm', value: s.taxNumber, placeholder: '123456789 RT0001', 'aria-label': 'Business number' }),
      taxMode: h('select', { class: 'select select-sm', 'aria-label': 'How tax is worked out' }, options([{ id: 'automatic', label: 'Stripe Tax works out each province’s rate' }, { id: 'fixed', label: 'One tax rate on every invoice' }], s.taxMode)),
      taxRateId: h('input', { class: 'input input-sm', value: s.taxRateId, placeholder: 'txr_…', 'aria-label': 'Stripe tax rate id' }),
      trialDays: h('input', { class: 'input input-sm', type: 'number', min: 0, max: 90, value: s.trialDays, style: 'width:80px', 'aria-label': 'Trial days' }),
      graceDays: h('input', { class: 'input input-sm', type: 'number', min: 0, max: 60, value: s.graceDays, style: 'width:80px', 'aria-label': 'Grace days' }),
      checkoutOn: h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', checked: s.checkoutOn, disabled: !x.stripe.connected, 'aria-label': 'Card payments on' }),
    };
    const priceFields = {};
    const paid = ['basic', 'standard'];
    const priceRows = paid.map((plan) => {
      const shown = x.plans[plan].price.monthly ?? 0;
      priceFields[plan] = {
        month: h('input', { class: 'input input-xs cc-price-id', value: s.prices[plan]?.month ?? '', placeholder: 'price_…', 'aria-label': `${plan} monthly price id` }),
        year: h('input', { class: 'input input-xs cc-price-id', value: s.prices[plan]?.year ?? '', placeholder: 'price_…', 'aria-label': `${plan} yearly price id` }),
      };
      const make = h('button', { class: 'btn btn-xs', disabled: !x.stripe.connected, onclick: async () => {
        const year = await uiPrompt(`Yearly price for ${x.plans[plan].label}, in dollars, ${s.taxLabel} included`, String(shown * 12), { title: 'Create the prices in Stripe', help: `The pricing page shows $${shown} a month billed yearly. A monthly price is made at 1.2× that unless you change it next.` });
        if (!year) return;
        const month = await uiPrompt(`Monthly price, in dollars, ${s.taxLabel} included`, String(Math.round(shown * 1.2)), { title: 'Create the prices in Stripe' });
        if (!month) return;
        try { await call('POST', '/api/admin/billing/create-prices', { plan, year: Number(year), month: Number(month) }); await load(); } catch (err) { uiAlert(err.message); }
      } }, 'Create in Stripe');
      return h('tr', {}, h('td', {}, h('strong', {}, x.plans[plan].label), h('div', { class: 'muted small' }, `$${shown}/mo shown, of which ${s.taxLabel} $${taxInsideOf(shown, s.taxRate)}`)),
        h('td', {}, priceFields[plan].month), h('td', {}, priceFields[plan].year), h('td', {}, make));
    });
    const checks = h('div', {});
    const saved = h('span', { class: 'muted small', role: 'status' });
    const save = async () => {
      const body = { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value])),
        prices: Object.fromEntries(paid.map((p) => [p, { month: priceFields[p].month.value.trim(), year: priceFields[p].year.value.trim() }])) };
      try { await call('PUT', '/api/admin/billing', body); saved.textContent = 'Saved.'; } catch (err) { saved.textContent = err.message; }
    };
    const runCheck = async () => {
      checks.replaceChildren(h('p', { class: 'muted small' }, 'Asking Stripe…'));
      const { results } = await call('POST', '/api/admin/billing/check');
      checks.replaceChildren(results.length ? h('ul', { class: 'cc-checks' }, results.map((r) => h('li', {}, light(r.ok ? 'ok' : 'bad', `${r.plan}, ${r.interval}ly`),
        h('div', {}, h('code', { class: 'cc-dns' }, r.id), r.amount != null ? ` $${r.amount}` : '', r.problems.map((p) => h('p', { class: 'small' }, p)))))) : h('p', { class: 'muted small' }, 'No prices to check yet.'));
    };
    fill(box, 
      ...head('Payments', 'Organisations pay by card on Stripe’s own page; Stripe tells Dashi, and Dashi sets the plan. Every price includes tax. Card details never reach this server.'),
      h('div', { class: 'cc-grid' },
        card('Stripe', kv([
          ['Connection', x.stripe.connected ? light(x.stripe.mode === 'live' ? 'ok' : 'warn', x.stripe.mode === 'live' ? 'Live' : 'Test mode: no real charges') : light('off', 'Not connected')],
          ['Webhook', x.stripe.webhook ? light('ok', 'Secret set') : light(x.stripe.connected ? 'bad' : 'off', 'No secret: payments won’t change plans')],
          ['Webhook address', h('code', { class: 'cc-dns' }, x.stripe.webhookUrl)],
          ['Settings', h('span', {}, envName('STRIPE_SECRET_KEY'), ' ', envName('STRIPE_WEBHOOK_SECRET'))],
        ]), h('p', { class: 'muted small' }, 'Send these events to the webhook: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed.')),
        card('Tax', h('p', { class: 'muted small' }, 'Prices include tax. For a price of $113 with 13% HST, the customer pays $113 and the receipt shows $13 of HST.'),
          h('div', { class: 'cc-form' },
            h('label', {}, h('span', {}, 'Tax name'), f.taxLabel), h('label', {}, h('span', {}, 'Rate shown, %'), f.taxRate),
            h('label', {}, h('span', {}, 'Business number (on receipts)'), f.taxNumber),
            h('label', { class: 'cc-span' }, h('span', {}, 'How tax is worked out'), f.taxMode),
            h('label', {}, h('span', {}, 'Tax rate id (one rate only)'), f.taxRateId)))),
      h('section', { class: 'cc-card' },
        h('h3', {}, 'Prices'),
        h('p', { class: 'muted small' }, 'Each paid plan has a monthly and a yearly price in Stripe, made with “Include tax in price”. Create them here, or paste ids from the Stripe dashboard. Custom is set by hand.'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' }, h('thead', {}, h('tr', {}, ['Plan', 'Monthly', 'Yearly', ''].map((t) => h('th', {}, t)))), h('tbody', {}, priceRows))),
        h('div', { class: 'cc-form' },
          h('label', {}, h('span', {}, 'Free trial, days'), f.trialDays), h('label', {}, h('span', {}, 'Grace after a failed payment, days'), f.graceDays),
          h('label', { class: 'check' }, f.checkoutOn, h('span', {}, ' Let organisations pay by card'))),
        h('div', { class: 'inline-form' }, h('button', { class: 'btn btn-sm btn-primary', onclick: save }, 'Save'), h('button', { class: 'btn btn-sm', disabled: !x.stripe.connected, onclick: () => runCheck().catch(fail(checks)) }, 'Check the prices with Stripe'), saved),
        checks),
      h('section', { class: 'cc-card' },
        h('h3', {}, 'Organisations'),
        h('p', { class: 'muted small' }, 'A free account (for a pilot partner, say) keeps the plan you give it under Organisations whatever happens in Stripe.'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
          h('thead', {}, h('tr', {}, ['Organisation', 'Plan', 'Billing', 'Renews', 'Last payment', 'Free account'].map((t) => h('th', {}, t)))),
          h('tbody', {}, x.orgs.map((o) => {
            const b = o.billing;
            const st = STATUS_LABEL[b.status];
            return h('tr', {}, h('td', {}, h('strong', {}, o.name)), h('td', {}, o.plan),
              h('td', {}, b.comp ? light('ok', 'Free account') : st ? light(st[0], `${st[1]}${b.interval ? `, ${b.interval}ly` : ''}`) : h('span', { class: 'muted' }, '—'), b.failedAt ? h('div', { class: 'small text-error' }, `Failed ${day(b.failedAt)}`) : null),
              h('td', { class: 'small' }, b.cancelAtPeriodEnd ? `Ends ${day(b.periodEnd)}` : day(b.trialEnd && b.status === 'trialing' ? b.trialEnd : b.periodEnd)),
              h('td', { class: 'small' }, b.lastInvoice ? [`$${b.lastInvoice.amount.toFixed(2)} (${s.taxLabel} $${b.lastInvoice.tax.toFixed(2)})`, h('br'), day(b.lastInvoice.at)] : '—'),
              h('td', {}, h('label', { class: 'check small' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs toggle-primary', checked: !!b.comp, onchange: async (e) => {
                let note = b.compNote ?? '';
                if (e.target.checked) { note = await uiPrompt('A note, for your records', note || 'Pilot partner', { title: `Free account for ${o.name}`, required: false }); if (note == null) { e.target.checked = false; return; } }
                try { await call('PATCH', `/api/admin/orgs/${o.id}/billing`, { comp: e.target.checked, compNote: note }); await load(); } catch (err) { uiAlert(err.message); }
              } }), b.comp && b.compNote ? h('span', { class: 'muted' }, b.compNote) : null)));
          }))))),
      x.events.length ? card('Latest from Stripe', h('ul', { class: 'cc-events' }, x.events.map((e) => h('li', {}, h('span', { class: 'muted small' }, when(e.at)), ' ', h('code', {}, e.type), e.org ? ` · ${e.org}` : '')))) : null);
  };
  load().catch(fail(box));
  return box;
}

/* --------------------------------------------- your two-step sign-in, sessions */
/** A QR code for `text` as an SVG: black squares on white, with a quiet border (made here, nothing sent anywhere). */
async function qrSvg(text, size = 184) {
  const { default: qrcode } = await import('../../vendor/qrcode/qrcode.js');
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 8} ${n + 8}`);
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code for your authenticator app');
  svg.setAttribute('class', 'cc-qr');
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); path.setAttribute('fill', '#000'); path.setAttribute('shape-rendering', 'crispEdges');
  svg.append(bg, path);
  return svg;
}

export function TwoStep({ call, onDone }) {
  const box = h('div', { class: 'cc-card' }, loading());
  const load = async () => {
    const st = await call('GET', '/api/auth/two-step');
    if (st.on) {
      const code = h('input', { class: 'input input-sm', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456', 'aria-label': 'Code' });
      return fill(box, h('h3', {}, 'Your two-step sign-in'), h('p', {}, light('ok', 'On'), ' Signing in asks for a code from your authenticator app.'),
        !st.required && h('div', { class: 'inline-form' }, code, h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => {
          try { await call('POST', '/api/auth/two-step/disable', { code: code.value }); load(); } catch (err) { uiAlert(err.message); }
        } }, 'Switch off')),
        st.required && h('p', { class: 'muted small' }, 'Required for platform admins on this server. If you lose your phone, another platform admin can reset it under People.'));
    }
    const start = h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
      const { secret, url } = await call('POST', '/api/auth/two-step/setup');
      const code = h('input', { class: 'input input-sm', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456', 'aria-label': 'Code from your app' });
      const msg = h('span', { class: 'small text-error', role: 'alert' });
      const qrBox = h('div', { class: 'cc-qr-box' });
      qrSvg(url).then((svg) => qrBox.replaceChildren(svg)).catch(() => qrBox.remove());
      fill(box, h('h3', {}, 'Set up two-step sign-in'),
        h('ol', { class: 'cc-steps' },
          h('li', {}, 'Open an authenticator app on your phone (1Password, Google Authenticator, Microsoft Authenticator or Authy), add an account and scan this code:', qrBox),
          h('li', {}, 'Can’t scan it? Choose “Enter a setup key” instead. Account: ', h('strong', {}, 'Dashi'), '. Key: ', h('code', { class: 'cc-secret' }, secret.match(/.{1,4}/g).join(' ')), ' (letters A–Z and digits 2–7 only, so O is a letter, never zero). Type: time-based. On a computer, a password manager can open ', h('a', { href: url }, 'this setup link'), ' instead.'),
          h('li', {}, 'Type the six-digit code it shows.')),
        h('form', { class: 'inline-form', onsubmit: async (e) => {
          e.preventDefault();
          try { await call('POST', '/api/auth/two-step/enable', { code: code.value }); onDone ? onDone() : load(); } catch (err) { msg.textContent = err.message; }
        } }, code, h('button', { class: 'btn btn-sm btn-primary', type: 'submit' }, 'Switch on'), msg),
        h('p', { class: 'muted small' }, 'Keep the key somewhere safe (in your password manager) in case you lose your phone.'));
      code.focus();
    } }, icon('key', 14), 'Set up two-step sign-in');
    fill(box, h('h3', {}, 'Your two-step sign-in'),
      h('p', {}, light(st.required ? 'bad' : 'warn', 'Off'), st.required ? ' This server asks platform admins to use it before anything else.' : ' A code from your phone as well as your password, so a stolen password isn’t enough.'),
      start);
  };
  load().catch(fail(box));
  return box;
}

export function Sessions({ call }) {
  const box = h('div', { class: 'cc-card' }, loading());
  const load = async () => {
    const list = await call('GET', '/api/admin/sessions');
    const device = (agent = '') => (/iPhone|iPad/.test(agent) ? 'iPhone or iPad' : /Android/.test(agent) ? 'Android' : /Mac OS/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : agent ? 'Browser' : 'Unknown');
    const browser = (agent = '') => (/Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : '');
    fill(box, 
      h('div', { class: 'cc-card-head' }, h('h3', {}, `Signed in now (${list.length})`)),
      h('p', { class: 'muted small' }, 'Everyone with a live session. Sign one out, or a person everywhere (after a lost laptop, or when someone leaves).'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table table-sm' },
        h('thead', {}, h('tr', {}, ['Person', 'Device', 'From', 'Since', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, list.map((x) => h('tr', {},
          h('td', {}, h('strong', {}, x.name || x.email), x.is_super ? h('span', { class: 'badge badge-xs badge-primary', style: 'margin-left:6px' }, 'admin') : null, h('div', { class: 'muted small' }, x.email)),
          h('td', { class: 'small' }, `${browser(x.agent)} ${device(x.agent)}`.trim(), x.two_step && x.totp_on ? h('div', { class: 'muted' }, 'with two-step') : null),
          h('td', { class: 'small' }, x.ip ?? '—'),
          h('td', { class: 'small' }, when(x.created_at)),
          h('td', {}, x.current ? h('span', { class: 'badge badge-sm badge-ghost' }, 'This one') : h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-xs', onclick: async () => { await call('DELETE', `/api/admin/sessions/${x.id}`); load(); } }, 'Sign out'),
            h('button', { class: 'btn btn-xs btn-ghost', onclick: async () => { if (await uiConfirm(`Sign ${x.email} out on every device?`, { ok: 'Sign out everywhere' })) { await call('POST', `/api/admin/users/${x.user_id}/signout`); load(); } } }, 'Everywhere')))))))));
  };
  load().catch(fail(box));
  return box;
}

/* --------------------------------------------------------------- activity */
const ACTION_LABEL = [
  [/^POST \/api\/admin\/orgs$/, 'Added an organisation'], [/^PATCH \/api\/admin\/orgs\/[^/]+$/, 'Changed an organisation'], [/^DELETE \/api\/admin\/orgs\/[^/]+$/, 'Deleted an organisation'],
  [/\/plugins$/, 'Switched a plugin for an organisation'], [/^PUT \/api\/admin\/plans/, 'Changed the plans'], [/^PUT \/api\/admin\/site/, 'Edited the sales site'],
  [/^POST \/api\/admin\/users$/, 'Added a person'], [/\/password$/, 'Set someone’s password'], [/\/signout$/, 'Signed someone out everywhere'], [/^DELETE \/api\/admin\/sessions/, 'Signed out a session'],
  [/\/two-step$/, 'Reset someone’s two-step sign-in'], [/^POST \/api\/admin\/backups/, 'Took a backup'], [/^PUT \/api\/admin\/ops/, 'Changed the maintenance banner'],
  [/^POST \/api\/admin\/email\/test/, 'Sent a test email'], [/^PUT \/api\/admin\/email/, 'Edited the emails'], [/^PUT \/api\/admin\/billing/, 'Changed payment settings'],
  [/create-prices/, 'Created prices in Stripe'], [/\/billing$/, 'Changed an organisation’s billing'], [/^PUT \/api\/admin\/legal/, 'Changed the company details'], [/^POST \/api\/admin\/legal\//, 'Published a legal page'],
  [/^DELETE \/api\/admin\/errors/, 'Cleared the error list'], [/plugins/, 'Changed a plugin'], [/domains/, 'Changed a domain'], [/requests/, 'Updated a request'],
];
const label = (action) => ACTION_LABEL.find(([re]) => re.test(action))?.[1] ?? action;

export function Activity({ call }) {
  const box = h('div', {}, loading());
  let rows = [];
  const more = async () => {
    const next = await call('GET', `/api/admin/audit-log${rows.length ? `?before=${rows.at(-1).id}` : ''}`);
    rows = [...rows, ...next];
    fill(box, ...head('Activity', 'Who changed what in the platform admin, sign-ins to admin accounts, security changes and plans changed by payments. Kept for a year.'),
      rows.length ? h('ul', { class: 'cc-log' }, rows.map((r) => h('li', {},
        h('span', { class: 'cc-log-when' }, when(r.at)),
        h('span', {}, h('strong', {}, label(r.action)), r.target ? ` · ${r.target}` : '', Object.keys(r.detail).length ? h('span', { class: 'muted small' }, ` ${Object.entries(r.detail).map(([k, v]) => `${k}: ${v}`).join(', ')}`) : null),
        h('span', { class: 'muted small' }, r.email ?? 'Stripe', r.ip ? ` · ${r.ip}` : '')))) : h('p', { class: 'empty' }, 'Nothing yet.'),
      next.length === 100 ? h('button', { class: 'btn btn-sm', onclick: () => more().catch(fail(box)) }, 'Older') : null);
  };
  more().catch(fail(box));
  return box;
}

/* ------------------------------------------------------------------ legal */
export function Legal({ call, sub }) {
  const box = h('div', {}, loading());
  const load = async () => {
    const x = await call('GET', '/api/admin/legal');
    const kind = x.docs.find((d) => d.id === sub) ?? null;
    if (kind) return fill(box, LegalEditor(kind, x, call, load));
    const c = Object.fromEntries(Object.entries(x.company).map(([k, v]) => [k, h('input', { class: 'input input-sm w-full', value: v, 'aria-label': k })]));
    const saved = h('span', { class: 'muted small', role: 'status' });
    fill(box, 
      ...head('Legal', 'The terms, privacy policy, accessibility statement and data processing agreement on Dashi’s own site. They start from best-practice wording for a Canadian service: have a lawyer review them before taking payments. Each change is published as a new version, and Dashi records who accepted which version of the terms and privacy policy.'),
      h('div', { class: 'cc-legal-list' }, x.docs.map((d) => {
        const cur = d.versions.at(-1);
        return h('a', { class: 'cc-legal-card', href: `#legal/${d.id}` },
          h('span', { class: 'cc-legal-icon' }, icon(d.id === 'terms' ? 'scales' : d.id === 'privacy' ? 'shield' : d.id === 'accessibility' ? 'people' : d.id === 'security' ? 'lock' : 'seal', 20)),
          h('strong', {}, d.label),
          h('small', {}, `Version ${cur.v}${cur.at ? `, ${day(cur.at)}` : ' (starting text)'}`),
          d.accept ? h('small', { class: 'muted' }, `${cur.accepted} of ${x.users} people accepted this version`) : h('small', { class: 'muted' }, 'Shown on the site'));
      })),
      card('Company details', h('p', { class: 'muted small' }, 'Filled into every page where it says {{company}}, {{address}}, {{email}}, {{security}}, {{province}} or {{domain}}. The security email is also published in security.txt for researchers.'),
        h('div', { class: 'cc-form' },
          h('label', {}, h('span', {}, 'Legal name'), c.name), h('label', {}, h('span', {}, 'Privacy and legal email'), c.email), h('label', {}, h('span', {}, 'Security reports email'), c.security),
          h('label', { class: 'cc-span' }, h('span', {}, 'Mailing address'), c.address), h('label', {}, h('span', {}, 'Province (governing law)'), c.province), h('label', {}, h('span', {}, 'Domain'), c.domain)),
        h('div', { class: 'inline-form' }, h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
          try { await call('PUT', '/api/admin/legal', { company: Object.fromEntries(Object.entries(c).map(([k, el]) => [k, el.value])) }); saved.textContent = 'Saved.'; } catch (err) { saved.textContent = err.message; }
        } }, 'Save'), h('a', { class: 'btn btn-sm', href: '/legal.html', target: '_blank' }, 'View the pages ↗'), saved)));
  };
  load().catch(fail(box));
  return box;
}

function LegalEditor(kind, x, call, reload) {
  const cur = kind.versions.at(-1);
  const body = h('textarea', { class: 'textarea w-full cc-legal-text', rows: 28, 'aria-label': kind.label, spellcheck: true }, cur.body);
  const note = h('input', { class: 'input input-sm cc-wide', placeholder: 'What changed (shown in the version list)', 'aria-label': 'What changed' });
  const msg = h('span', { class: 'muted small', role: 'status' });
  return h('div', {},
    h('nav', { class: 'crumbs' }, h('a', { href: '#legal' }, 'Legal'), ` / ${kind.label}`),
    h('h2', {}, kind.label),
    h('p', { class: 'muted small' }, 'Markdown: ## for a heading, - for a list, **bold**, | tables |. ', kind.accept ? 'Publishing a new version asks everyone to accept it the next time they open Dashi.' : 'Publishing updates the page on the site.'),
    h('div', { class: 'cc-legal-edit' },
      h('div', {}, body,
        h('div', { class: 'inline-form' }, note, h('button', { class: 'btn btn-sm btn-primary', onclick: async () => {
          if (!(await uiConfirm(`Publish this as version ${cur.v + 1} of the ${kind.label.toLowerCase()}?`, { ok: 'Publish' }))) return;
          try { const r = await call('POST', `/api/admin/legal/${kind.id}`, { body: body.value, note: note.value }); msg.textContent = r.unchanged ? 'Nothing changed.' : `Published version ${r.v}.`; if (!r.unchanged) setTimeout(reload, 600); } catch (err) { msg.textContent = err.message; }
        } }, 'Publish a new version'), h('a', { class: 'btn btn-sm', href: `/legal.html?doc=${kind.id}`, target: '_blank' }, 'View ↗'), msg)),
      h('aside', { class: 'cc-card' }, h('h3', {}, 'Versions'),
        h('ul', { class: 'cc-versions' }, kind.versions.slice().reverse().map((v) => h('li', {},
          h('strong', {}, `Version ${v.v}`), h('span', { class: 'muted small' }, v.at ? day(v.at) : 'starting text'),
          v.note ? h('span', { class: 'small' }, v.note) : null,
          kind.accept ? h('span', { class: 'muted small' }, `${v.accepted} accepted`) : null,
          h('a', { class: 'small', href: `/legal.html?doc=${kind.id}&v=${v.v}`, target: '_blank' }, 'Read'))))),
    ));
}
