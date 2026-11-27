/**
 * Payments through Stripe: an org's admin picks a plan and pays on Stripe's
 * own checkout page; Stripe tells Dashi what happened (the webhook), and
 * Dashi sets the org's plan. Card details never touch this server.
 *
 * Secrets live in the server's environment (Fly secrets), never in the
 * database or the admin pages:
 *
 *   STRIPE_SECRET_KEY       sk_live_… (or sk_test_… while testing)
 *   STRIPE_WEBHOOK_SECRET   whsec_…   from the webhook endpoint in Stripe
 *
 * Everything else (which Stripe price is which plan, the trial, how tax is
 * worked out, the business number on receipts) is the platform document
 * "billing", set in Platform admin → Payments.
 *
 * Prices include tax. Each Stripe price is created with
 * tax_behavior=inclusive, so the customer pays the price they saw and the
 * HST (or GST, or GST + QST) is the part inside it. Stripe Tax works out the
 * right rate for the customer's province; or, with one fixed tax rate
 * (txr_…), every invoice shows that rate.
 *
 * Stripe's API is plain HTTPS with form-encoded bodies, so there is no SDK.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

export const BILLING_DEFAULTS = {
  currency: 'cad',
  taxLabel: 'HST',
  /** For showing the tax inside a price on the pricing page (Ontario: 13). */
  taxRate: 13,
  /** The business number on receipts and invoices (required in Canada for invoices over $30). */
  taxNumber: '',
  /** 'automatic' (Stripe Tax) or 'fixed' (one inclusive tax rate, taxRateId). */
  taxMode: 'automatic',
  taxRateId: '',
  trialDays: 14,
  /** Days a failed payment keeps the plan before it is flagged for the admin. */
  graceDays: 7,
  /** Stripe price ids: { basic: { month, year }, standard: { month, year } }. */
  prices: {},
  /** The Stripe coupon for the grassroots rate (30% off Community and Organization), made in Payments. */
  grassrootsCoupon: '',
  /** The Stripe coupon for alpha testers: half price for the first 12 months. */
  alphaCoupon: '',
  /** Let org admins pay by card. Off until the admin has checked the setup. */
  checkoutOn: false,
};

export const billingSettings = (stored = {}) => ({ ...BILLING_DEFAULTS, ...stored, prices: { ...(stored.prices ?? {}) } });

export const stripeReady = () => !!config.stripe.secretKey;
export const stripeMode = () => (config.stripe.secretKey.startsWith('sk_live_') || config.stripe.secretKey.startsWith('rk_live_') ? 'live' : config.stripe.secretKey ? 'test' : null);

/** Stripe's form encoding: nested objects and arrays become a[b][0]=c. */
export function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [i, x])) : v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/** One call to Stripe's API. Throws with Stripe's own message when it says no. */
export async function stripe(path, params = null, { method = params ? 'POST' : 'GET', fetcher = fetch } = {}) {
  if (!stripeReady()) throw new Error('Stripe isn’t connected: set STRIPE_SECRET_KEY');
  const res = await fetcher(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${config.stripe.secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2024-06-20' },
    body: params && method !== 'GET' ? form(params).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error?.message ?? `Stripe said ${res.status}`);
  return out;
}

/**
 * Check a webhook really came from Stripe: the Stripe-Signature header is
 * t=<seconds>,v1=<HMAC-SHA256 of "t.body" with the endpoint's secret>. Older
 * than five minutes is refused, so a captured request can't be replayed.
 */
export function verifySignature(raw, header, secret, { now = Date.now(), tolerance = 300 } = {}) {
  if (!secret || !header) return false;
  const parts = Object.groupBy(String(header).split(',').map((p) => p.split('=')), ([k]) => k);
  const t = Number(parts.t?.[0]?.[1]);
  if (!t || Math.abs(now / 1000 - t) > tolerance) return false;
  const want = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return (parts.v1 ?? []).some(([, sig]) => {
    const got = Buffer.from(sig ?? '', 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** Which plan and billing period a Stripe price is, from the settings. */
export function planOfPrice(settings, priceId) {
  for (const [plan, p] of Object.entries(settings.prices ?? {})) {
    for (const interval of ['month', 'year']) if (p?.[interval] && p[interval] === priceId) return { plan, interval };
  }
  return null;
}

/** The tax inside a price that includes it: $113 with 13% HST holds $13. */
export const taxInside = (amount, rate) => Math.round((amount * rate / (100 + rate)) * 100) / 100;

const PAYING = new Set(['active', 'trialing', 'past_due']);
const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);

/**
 * What a Stripe event changes for an org. Returns { orgId, billing, plan? ,
 * notify? } or null when the event isn't about a Dashi org. `findOrg` looks
 * an org up by its Stripe customer id; `org` rows carry their billing JSON.
 */
export function eventChange(event, { settings, findOrg }) {
  const o = event.data?.object ?? {};
  const byMeta = o.metadata?.org_id ?? o.client_reference_id ?? o.subscription_details?.metadata?.org_id ?? null;
  const org = findOrg({ orgId: byMeta, customerId: o.customer ?? (o.object === 'customer' ? o.id : null) });
  if (!org) return null;
  const billing = JSON.parse(org.billing || '{}');
  const out = { orgId: org.id, billing };
  switch (event.type) {
    case 'checkout.session.completed':
      Object.assign(billing, { customerId: o.customer ?? billing.customerId, subscriptionId: o.subscription ?? billing.subscriptionId });
      return out;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const item = o.items?.data?.[0];
      const found = planOfPrice(settings, item?.price?.id);
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : o.status;
      Object.assign(billing, {
        customerId: o.customer, subscriptionId: o.id, status,
        plan: found?.plan ?? billing.plan ?? null, interval: found?.interval ?? item?.price?.recurring?.interval ?? null,
        periodEnd: iso(item?.current_period_end ?? o.current_period_end), trialEnd: iso(o.trial_end),
        cancelAtPeriodEnd: !!o.cancel_at_period_end, hadTrial: billing.hadTrial || !!o.trial_end,
      });
      if (billing.comp) return out; // A free account the admin gave: payments don't change its plan.
      if (PAYING.has(status) && found) out.plan = found.plan;
      else if (!PAYING.has(status)) out.plan = 'free';
      return out;
    }
    case 'invoice.paid':
      Object.assign(billing, {
        failedAt: null,
        lastInvoice: { amount: (o.amount_paid ?? 0) / 100, tax: ((o.tax ?? (o.total_taxes ?? []).reduce((n, t) => n + (t.amount ?? 0), 0)) || 0) / 100, currency: o.currency, at: iso(o.status_transitions?.paid_at ?? o.created), url: o.hosted_invoice_url ?? null, number: o.number ?? null },
      });
      return out;
    case 'invoice.payment_failed':
      Object.assign(billing, { failedAt: billing.failedAt ?? new Date().toISOString(), status: 'past_due' });
      out.notify = { kind: 'payment_failed', url: o.hosted_invoice_url ?? null, amount: (o.amount_due ?? 0) / 100 };
      return out;
    default:
      return null;
  }
}

/**
 * The Checkout page's settings for one org paying for one plan.
 * currency 'usd' uses the price's USD option (made with the price); the
 * grassroots rate applies the coupon when the org has declared a small
 * budget, and then promotion codes are off (Stripe allows one or the other).
 */
export function checkoutParams({ settings, org, billing, user, plan, interval, returnUrl, currency = 'cad', grassrootsPlans = [] }) {
  const price = settings.prices?.[plan]?.[interval];
  if (!price) throw new Error('That plan can’t be paid for online yet');
  // An alpha tester's half-price year beats the grassroots rate (Stripe Checkout takes one discount).
  const alpha = !!(billing.alphaSupporter && settings.alphaCoupon);
  const grassroots = !alpha && !!(billing.grassroots?.declared && settings.grassrootsCoupon && grassrootsPlans.includes(plan));
  const coupon = alpha ? settings.alphaCoupon : grassroots ? settings.grassrootsCoupon : null;
  return {
    mode: 'subscription',
    line_items: [{ price, quantity: 1, ...(settings.taxMode === 'fixed' && settings.taxRateId && { tax_rates: [settings.taxRateId] }) }],
    ...(billing.customerId ? { customer: billing.customerId, customer_update: { address: 'auto', name: 'auto' } } : { customer_email: user.email }),
    client_reference_id: org.id,
    ...(currency === 'usd' && { currency: 'usd' }),
    metadata: { org_id: org.id, plan, ...(grassroots && { grassroots: 'yes' }), ...(alpha && { alpha_supporter: 'yes' }) },
    subscription_data: { metadata: { org_id: org.id, plan }, ...(!billing.hadTrial && settings.trialDays > 0 && { trial_period_days: settings.trialDays }) },
    ...(settings.taxMode === 'automatic' && { automatic_tax: { enabled: true } }),
    tax_id_collection: { enabled: true },
    billing_address_collection: 'required',
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true }),
    success_url: returnUrl.includes('#') ? returnUrl.replace('#', '?paid=1#') : `${returnUrl}?paid=1`,
    cancel_url: returnUrl,
  };
}
