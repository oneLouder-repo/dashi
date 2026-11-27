import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The control centre (alpha.8): two-step sign-in, Stripe, legal versions, email checks, health.
const dataDir = mkdtempSync(join(tmpdir(), 'dashi-cc-'));
Object.assign(process.env, {
  DATA_DIR: dataDir, DEV_LOGIN: 'true', SEED_EXAMPLES: 'true', BASE_DOMAIN: 'localhost', NODE_ENV: 'test',
  SUPER_ADMIN_PASSWORD: 'a long test passphrase', STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_test',
});
const { base32, fromBase32, codeAt, checkCode, stepOf, otpauthUrl } = await import('../server/totp.js');
const { form, verifySignature, planOfPrice, eventChange, checkoutParams, billingSettings, taxInside } = await import('../server/billing.js');
const { checkMailDns, mailDomain } = await import('../server/ops.js');
const { publishLegal, currentVersion, versionsOf, dueFor, fillLegal, LEGAL_KINDS } = await import('../src/platform/legal.js');

let srv;
before(async () => { srv = await (await import('../server/index.js')).start({ port: 0, quiet: true }); });
after(() => { srv.server.closeAllConnections?.(); srv.server.close(); srv.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

function call(host, method, path, { body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = request({ host: '127.0.0.1', port: srv.port, method, path, headers: {
      host, ...(cookie && { cookie }), ...(data && { 'content-type': 'application/json' }), ...(method !== 'GET' && { 'x-toolbox': '1' }), ...headers,
    } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const cookieOf = (res) => res.headers['set-cookie'][0].split(';')[0];
async function devSignIn(email, host = 'localhost') {
  const opts = await call(host, 'GET', '/api/auth/options');
  return cookieOf(await call(host, 'POST', '/api/auth/dev', { body: { userId: opts.json.dev.find((u) => u.email === email).id } }));
}

/* ------------------------------------------------------------- units */
test('two-step codes match RFC 6238, work once, and allow a little clock drift', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(fromBase32(secret).toString(), '12345678901234567890');
  assert.equal(codeAt(secret, stepOf(59_000)), '287082');
  assert.equal(codeAt(secret, stepOf(1111111109_000)), '081804');
  const now = 1111111109_000;
  const step = checkCode(secret, '081804', { now });
  assert.equal(step, stepOf(now));
  assert.equal(checkCode(secret, '081804', { now, after: step }), null, 'the same code twice is refused');
  assert.equal(checkCode(secret, codeAt(secret, stepOf(now) - 1), { now }), stepOf(now) - 1, 'thirty seconds late still works');
  assert.equal(checkCode(secret, codeAt(secret, stepOf(now) - 3), { now }), null);
  assert.equal(checkCode(secret, 'abc'), null);
  assert.match(otpauthUrl(secret, 'me@x.ca'), /^otpauth:\/\/totp\/Dashi%3Ame%40x\.ca\?secret=GEZ/);
});

test('Stripe: form encoding, signatures, and which plan a price is', () => {
  assert.equal(form({ a: 1, line_items: [{ price: 'p', quantity: 1 }], meta: { org_id: 'o' }, skip: null }).toString(), 'a=1&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&meta%5Borg_id%5D=o');
  const body = '{"id":"evt_1"}';
  const t = 1_800_000_000;
  const sig = createHmac('sha256', 'whsec_x').update(`${t}.${body}`).digest('hex');
  assert.ok(verifySignature(body, `t=${t},v1=${sig}`, 'whsec_x', { now: t * 1000 }));
  assert.ok(!verifySignature(body, `t=${t},v1=${sig}`, 'whsec_y', { now: t * 1000 }), 'another secret');
  assert.ok(!verifySignature(`${body} `, `t=${t},v1=${sig}`, 'whsec_x', { now: t * 1000 }), 'a changed body');
  assert.ok(!verifySignature(body, `t=${t},v1=${sig}`, 'whsec_x', { now: (t + 600) * 1000 }), 'too old to trust');
  const settings = billingSettings({ prices: { basic: { month: 'price_bm', year: 'price_by' } } });
  assert.deepEqual(planOfPrice(settings, 'price_by'), { plan: 'basic', interval: 'year' });
  assert.equal(planOfPrice(settings, 'price_zz'), null);
  assert.equal(taxInside(113, 13), 13);
});

test('a Stripe event sets the plan, but never for a free account', () => {
  const settings = billingSettings({ prices: { standard: { month: 'price_sm', year: 'price_sy' } } });
  const org = { id: 'o1', billing: '{}' };
  const sub = (status, extra = {}) => ({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_1', status, metadata: { org_id: 'o1' }, items: { data: [{ price: { id: 'price_sy' }, current_period_end: 1_800_000_000 }] }, ...extra } } });
  const findOrg = ({ orgId }) => (orgId === 'o1' ? org : null);
  const paying = eventChange(sub('active'), { settings, findOrg });
  assert.equal(paying.plan, 'standard');
  assert.equal(paying.billing.interval, 'year');
  assert.equal(paying.billing.periodEnd, new Date(1_800_000_000_000).toISOString());
  assert.equal(eventChange(sub('canceled'), { settings, findOrg }).plan, 'free');
  assert.equal(eventChange(sub('past_due'), { settings, findOrg }).plan, 'standard', 'a failed payment keeps the plan during the grace period');
  org.billing = JSON.stringify({ comp: true });
  assert.equal(eventChange(sub('canceled'), { settings, findOrg }).plan, undefined, 'a free account keeps its plan');
  assert.equal(eventChange({ type: 'invoice.paid', data: { object: { customer: 'cus_9' } } }, { settings, findOrg }), null, 'not one of ours');
  const failed = eventChange({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_1', subscription_details: { metadata: { org_id: 'o1' } }, amount_due: 5880 } } }, { settings, findOrg });
  assert.equal(failed.notify.amount, 58.8);
});

test('checkout asks for the address (for tax), a trial once, and the right tax setup', () => {
  const settings = billingSettings({ prices: { basic: { year: 'price_by' } }, trialDays: 14 });
  const p = checkoutParams({ settings, org: { id: 'o1' }, billing: {}, user: { email: 'a@b.ca' }, plan: 'basic', interval: 'year', returnUrl: 'https://x.dashi.ca/org.html#plan' });
  assert.equal(p.mode, 'subscription');
  assert.equal(p.subscription_data.trial_period_days, 14);
  assert.deepEqual(p.automatic_tax, { enabled: true });
  assert.equal(p.billing_address_collection, 'required');
  assert.equal(p.success_url, 'https://x.dashi.ca/org.html?paid=1#plan');
  const again = checkoutParams({ settings: { ...settings, taxMode: 'fixed', taxRateId: 'txr_1' }, org: { id: 'o1' }, billing: { hadTrial: true, customerId: 'cus_1' }, user: {}, plan: 'basic', interval: 'year', returnUrl: 'https://x' });
  assert.equal(again.subscription_data.trial_period_days, undefined, 'one trial per organisation');
  assert.deepEqual(again.line_items[0].tax_rates, ['txr_1']);
  assert.equal(again.automatic_tax, undefined);
  assert.equal(again.customer, 'cus_1');
  assert.throws(() => checkoutParams({ settings, org: {}, billing: {}, user: {}, plan: 'basic', interval: 'month', returnUrl: '' }), /can’t be paid/);
  assert.equal(p.allow_promotion_codes, true);
  assert.equal(p.currency, undefined, 'Canadian dollars unless asked');
});

test('the grassroots rate takes the coupon on Community and Organization once declared; US dollars on request', () => {
  const settings = billingSettings({ prices: { basic: { month: 'price_bm' }, network: { month: 'price_nm' } }, grassrootsCoupon: 'grass30' });
  const args = { settings, org: { id: 'o1' }, user: { email: 'a@b.ca' }, interval: 'month', returnUrl: 'https://x', grassrootsPlans: ['basic', 'standard'] };
  const small = checkoutParams({ ...args, billing: { grassroots: { declared: true } }, plan: 'basic', currency: 'usd' });
  assert.deepEqual(small.discounts, [{ coupon: 'grass30' }]);
  assert.equal(small.allow_promotion_codes, undefined, 'Stripe takes a coupon or promotion codes, not both');
  assert.equal(small.currency, 'usd');
  assert.equal(small.metadata.grassroots, 'yes');
  assert.equal(checkoutParams({ ...args, billing: {}, plan: 'basic' }).discounts, undefined, 'not declared');
  assert.equal(checkoutParams({ ...args, billing: { grassroots: { declared: true } }, plan: 'network' }).discounts, undefined, 'not on Network');
});

test('legal pages publish versions and know who still has to accept', () => {
  let stored = {};
  assert.equal(currentVersion(stored, 'terms').v, 1);
  assert.match(fillLegal(currentVersion(stored, 'terms').body, { name: 'Dashi Inc.' }), /Dashi Inc\./);
  assert.ok(!/\{\{/.test(fillLegal(currentVersion(stored, 'privacy').body)), 'every placeholder is filled');
  assert.equal(publishLegal(stored, 'terms', currentVersion(stored, 'terms').body), stored, 'no change, no version');
  stored = publishLegal(stored, 'terms', 'New terms', { note: 'Plain words', at: '2026-12-01T00:00:00Z' });
  assert.deepEqual(versionsOf(stored, 'terms').map((v) => v.v), [1, 2]);
  assert.deepEqual(dueFor(stored, [{ doc: 'terms', version: 1 }, { doc: 'privacy', version: 1 }]), [{ kind: 'terms', v: 2 }]);
  assert.equal(LEGAL_KINDS.filter((k) => k.accept).length, 2);
});

test('the email check reads SPF, DKIM and DMARC from DNS', async () => {
  assert.equal(mailDomain('Dashi <hello@dashi.ca>'), 'dashi.ca');
  const records = { 'send.dashi.ca': [['v=spf1 include:amazonses.com ~all']], '_dmarc.dashi.ca': [['v=DMARC1; p=none; rua=mailto:d@dashi.ca']], 'resend._domainkey.dashi.ca': [['p=MIGf']] };
  const resolver = { resolveTxt: async (n) => { if (!records[n]) throw new Error('ENOTFOUND'); return records[n]; } };
  const r = await checkMailDns('dashi.ca', { provider: 'resend', resolver });
  assert.deepEqual(r.checks.map((c) => [c.id, c.ok]), [['spf', true], ['dkim', true], ['dmarc', true]]);
  assert.ok(r.checks[2].warn, 'p=none is a start, not the end');
  const none = await checkMailDns('dashi.ca', { provider: 'postmark', resolver: { resolveTxt: async () => [] } });
  assert.ok(none.checks.every((c) => !c.ok && c.fix));
});

/* ------------------------------------------------------------ server */
test('a platform admin with two-step sign-in has no admin rights until the code', async () => {
  const pw = await call('localhost', 'POST', '/api/auth/password', { body: { email: 'admin@localhost', password: 'a long test passphrase' } });
  assert.equal(pw.status, 200);
  let cookie = cookieOf(pw);
  const setup = await call('localhost', 'POST', '/api/auth/two-step/setup', { cookie });
  assert.match(setup.json.secret, /^[A-Z2-7]{32}$/);
  assert.equal((await call('localhost', 'POST', '/api/auth/two-step/enable', { cookie, body: { code: '000000' } })).status, 400);
  const on = await call('localhost', 'POST', '/api/auth/two-step/enable', { cookie, body: { code: codeAt(setup.json.secret, stepOf()) } });
  assert.equal(on.status, 200);
  // A fresh sign-in now waits for a code.
  const again = await call('localhost', 'POST', '/api/auth/password', { body: { email: 'admin@localhost', password: 'a long test passphrase' } });
  assert.equal(again.json.needCode, true);
  cookie = cookieOf(again);
  assert.equal((await call('localhost', 'GET', '/api/session', { cookie })).json.needsCode, true);
  assert.equal((await call('localhost', 'GET', '/api/admin/orgs', { cookie })).status, 403, 'no admin without the code');
  assert.equal((await call('localhost', 'POST', '/api/auth/code', { cookie, body: { code: codeAt(setup.json.secret, stepOf()) } })).status, 401, 'the code used to switch it on can’t be used again');
  const next = codeAt(setup.json.secret, stepOf() + 1);
  assert.equal((await call('localhost', 'POST', '/api/auth/code', { cookie, body: { code: next } })).status, 200);
  assert.equal((await call('localhost', 'GET', '/api/admin/orgs', { cookie })).status, 200);
  const log = (await call('localhost', 'GET', '/api/admin/audit-log', { cookie })).json;
  assert.ok(log.some((r) => r.action === 'Two-step sign-in switched on'));
  assert.ok(log.some((r) => r.action === 'Platform admin signed in with two-step'));
});

test('a signed Stripe webhook moves an org to the plan it paid for, once', async () => {
  const admin = await devSignIn('admin@localhost');
  await call('localhost', 'PUT', '/api/admin/billing', { cookie: admin, body: { prices: { basic: { month: 'price_bm', year: 'price_by' } }, checkoutOn: true } });
  const org = (await call('localhost', 'GET', '/api/admin/orgs', { cookie: admin })).json.find((o) => o.id === 'org-riverbend');
  const event = { id: 'evt_test_1', type: 'customer.subscription.created', data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_rb', status: 'active', metadata: { org_id: org.id }, items: { data: [{ price: { id: 'price_by' }, current_period_end: 1_900_000_000 }] } } } };
  const raw = JSON.stringify(event);
  const sign = (body, secret = 'whsec_test') => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`; };
  const hook = (body, sig) => call('localhost', 'POST', '/api/stripe/webhook', { body, headers: { 'stripe-signature': sig, 'x-toolbox': '' } });
  assert.equal((await hook(raw, sign(raw, 'whsec_wrong'))).status, 400, 'an unsigned call is refused');
  assert.equal((await hook(raw, sign(raw))).status, 200);
  let after = (await call('localhost', 'GET', '/api/admin/orgs', { cookie: admin })).json.find((o) => o.id === org.id);
  assert.equal(after.plan, 'basic');
  assert.equal((await hook(raw, sign(raw))).json.repeat, true, 'the same event twice changes nothing');
  const billing = (await call('localhost', 'GET', '/api/admin/billing', { cookie: admin })).json;
  assert.equal(billing.orgs.find((o) => o.id === org.id).billing.customerId, 'cus_rb');
  assert.equal(billing.stripe.mode, 'test');
  // Cancelled: back to Free, unless it's a free account.
  const cancel = JSON.stringify({ ...event, id: 'evt_test_2', type: 'customer.subscription.deleted' });
  await hook(cancel, sign(cancel));
  after = (await call('localhost', 'GET', '/api/admin/orgs', { cookie: admin })).json.find((o) => o.id === org.id);
  assert.equal(after.plan, 'free');
  // The org's admin sees its billing; checkout needs Stripe, which isn't reachable in a test.
  const mira = await devSignIn('mira@riverbend.example', 'riverbend.localhost').catch(() => null);
  if (mira) {
    const b = (await call('riverbend.localhost', 'GET', '/api/billing', { cookie: mira })).json;
    assert.equal(b.online, true);
    assert.deepEqual(b.prices.basic, { month: true, year: true });
    assert.equal(b.taxLabel, 'HST');
  }
});

test('signing up records the terms accepted; a new version asks everyone again', async () => {
  const res = await call('localhost', 'POST', '/api/signup', { body: { orgName: 'Harbour Arts', slug: 'harbourarts', name: 'Lee', email: 'lee@harbour.example', password: 'a good long one', accept: true } });
  assert.equal(res.status, 201);
  const lee = cookieOf(res);
  let s = (await call('localhost', 'GET', '/api/session', { cookie: lee })).json;
  assert.deepEqual(s.legalDue, []);
  assert.equal(s.emailVerified, false, 'a new account confirms its email');
  const admin = await devSignIn('admin@localhost');
  assert.equal((await call('localhost', 'POST', '/api/admin/legal/terms', { cookie: admin, body: { body: '# Terms\n\nNew words.', note: 'Shorter' } })).json.v, 2);
  s = (await call('localhost', 'GET', '/api/session', { cookie: lee })).json;
  assert.deepEqual(s.legalDue, [{ kind: 'terms', v: 2 }]);
  await call('localhost', 'POST', '/api/legal/accept', { cookie: lee, body: {} });
  assert.deepEqual((await call('localhost', 'GET', '/api/session', { cookie: lee })).json.legalDue, []);
  const page = (await call('localhost', 'GET', '/api/legal/terms?v=1')).json;
  assert.equal(page.v, 1);
  assert.equal(page.latest, 2);
  const legal = (await call('localhost', 'GET', '/api/admin/legal', { cookie: admin })).json;
  assert.equal(legal.docs.find((d) => d.id === 'terms').versions.at(-1).accepted, 1);
});

test('health, email, exports, sessions and the banner, for platform admins only', async () => {
  const admin = await devSignIn('admin@localhost');
  const amara = await devSignIn('amara@example.org', 'example.localhost');
  assert.equal((await call('example.localhost', 'GET', '/api/admin/health', { cookie: amara })).status, 403);
  const health = (await call('localhost', 'GET', '/api/admin/health', { cookie: admin })).json;
  assert.ok(health.uptimeSec >= 0 && health.database.orgs >= 1);
  assert.equal(health.litestream.configured, false);
  assert.equal(health.stripe.connected, true);
  const test = await call('localhost', 'POST', '/api/admin/email/test', { cookie: admin, body: { to: 'me@example.org' } });
  assert.equal(test.json.logged, true, 'no mail key: written to the log');
  const email = (await call('localhost', 'GET', '/api/admin/email', { cookie: admin })).json;
  assert.ok(email.templates.invite.subject.includes('{org}'));
  await call('localhost', 'PUT', '/api/admin/email/templates', { cookie: admin, body: { reset: { subject: 'Reset your Dashi password', lines: 'Here is your link.', button: 'Reset' } } });
  assert.equal((await call('localhost', 'GET', '/api/admin/email', { cookie: admin })).json.templates.reset.subject, 'Reset your Dashi password');
  const exp = await call('localhost', 'GET', '/api/admin/orgs/org-example/export', { cookie: admin });
  assert.match(exp.headers['content-disposition'], /attachment; filename="example-dashi-export-/);
  assert.ok(exp.json.docs.org && exp.json.people.length);
  const sessions = (await call('localhost', 'GET', '/api/admin/sessions', { cookie: admin })).json;
  assert.ok(sessions.some((x) => x.current));
  await call('localhost', 'PUT', '/api/admin/ops', { cookie: admin, body: { banner: { on: true, text: 'Maintenance Sunday 6 a.m.', level: 'warning' } } });
  assert.deepEqual((await call('example.localhost', 'GET', '/api/session')).json.banner, { text: 'Maintenance Sunday 6 a.m.', level: 'warning' });
  const log = (await call('localhost', 'GET', '/api/admin/audit-log', { cookie: admin })).json;
  assert.ok(log.some((r) => r.action === 'PUT /api/admin/ops'), 'admin changes are logged');
});

test('security.txt names the security contact, a policy and an expiry a year ahead', async () => {
  const r = await call('localhost', 'GET', '/.well-known/security.txt');
  assert.equal(r.status, 200);
  assert.match(r.text, /^Contact: mailto:security@dashi\.app$/m);
  assert.match(r.text, /^Policy: http:\/\/localhost(:\d+)?\/legal\.html\?doc=security$/m);
  const expires = new Date(r.text.match(/^Expires: (.+)$/m)[1]);
  assert.ok(expires - Date.now() > 300 * 864e5 && expires - Date.now() < 366 * 864e5);
  assert.ok(!/\{\{/.test(fillLegal(currentVersion({}, 'security').body)), 'every placeholder is filled');
});
