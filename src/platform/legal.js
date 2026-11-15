/**
 * The platform's legal pages: Terms of service, Privacy policy,
 * Accessibility statement and Data processing agreement.
 *
 * These are starting points written to common Canadian practice (PIPEDA,
 * Ontario law, CASL, WCAG 2.1 AA). They are not legal advice: have a lawyer
 * read them before the platform takes paying customers. The platform admin
 * edits them in Platform admin → Legal; each change is published as a new
 * version, and the server records who accepted which version.
 *
 * Stored as the platform document "legal":
 *   { company: { name, address, email, province, domain },
 *     docs: { [kind]: { versions: [{ v, at, body, note }] } } }
 *
 * {{company}}, {{address}}, {{email}}, {{security}}, {{province}}, {{domain}} and
 * {{updated}} in a body are filled in from the company details.
 */
export const LEGAL_KINDS = [
  { id: 'terms', label: 'Terms of service', short: 'Terms', accept: true },
  { id: 'privacy', label: 'Privacy policy', short: 'Privacy', accept: true },
  { id: 'accessibility', label: 'Accessibility statement', short: 'Accessibility', accept: false },
  { id: 'dpa', label: 'Data processing agreement', short: 'Data processing', accept: false },
  { id: 'security', label: 'Security and reporting a vulnerability', short: 'Security', accept: false },
];

export const COMPANY_DEFAULTS = { name: 'Dashi', address: '', email: 'privacy@dashi.app', security: 'security@dashi.app', province: 'Ontario', domain: 'dashi.app' };

const TERMS = `These terms are an agreement between you and {{company}} ("we", "us") about using Dashi, the planning and ecosystem mapping platform at {{domain}}. If you use Dashi for an organisation, you agree to them for that organisation and confirm you may do so. Last updated {{updated}}.

## 1. What Dashi is
Dashi is a hosted service for mapping ecosystems, planning strategy, keeping data and documents, and publishing public sites, dashboards and podcasts. We may improve, change or retire features. We will tell organisation admins at least 30 days before we remove a feature they pay for.

## 2. Accounts
- Give accurate information, and keep your password and sign-in codes to yourself.
- Tell us at {{email}} straight away if you think someone else has used your account.
- An organisation's admin decides who belongs to it and what they can see and change.
- You must be at least 16 to have an account. Organisations that invite younger people (for example, a youth advisory group) are responsible for any consent those people or their parents need to give.

## 3. Your content
Everything your organisation puts into Dashi (maps, plans, data, documents, audio, pages) stays yours. You give us permission to store, copy, back up and show it only as needed to run Dashi for you, including showing what you choose to publish to the public. We do not sell your content and do not use it to train artificial intelligence models.

You are responsible for having the rights to what you upload, and for the accuracy of what you publish.

## 4. Acceptable use
Do not use Dashi to:
- break the law, or infringe anyone's copyright, privacy or other rights;
- upload malware, or try to get into accounts, organisations or systems that are not yours;
- test our security without written permission (see our security contact at {{email}});
- send spam or bulk messages that break Canada's Anti-Spam Legislation (CASL);
- publish hateful, harassing or sexually exploitative content, or anything that puts people at risk;
- put an unreasonable load on the service, or resell it without our agreement.

We may remove content or suspend an account that breaks these rules. Where we can, we will tell you first and give you a chance to fix it.

## 5. Plans, payment and tax
- Free plans cost nothing and have the limits shown on the pricing page.
- Paid plans are billed in advance, monthly or yearly, in Canadian dollars, through our payment processor (Stripe). **Every price we show includes the sales tax that applies (HST, or GST and provincial tax)**; your receipt shows the tax portion and our business number.
- A trial, where offered, turns into a paid plan at its end unless you cancel before then.
- Paid plans renew automatically. Cancel at any time from Organisation settings → Plan; the plan then runs to the end of the period already paid for.
- If a payment fails we will email your admin and try again. If it is still unpaid after the grace period, your organisation moves to the Free plan. Nothing is deleted, but you can't add more of anything that is over the Free limits until you upgrade or remove some.
- Refunds: if you are not happy, write to us within 14 days of your first paid charge for a full refund. After that, payments are not refunded except where the law requires.
- We may change prices with at least 30 days' notice by email. A change applies from your next renewal.

## 6. Availability, support and backups
We aim to keep Dashi available around the clock, and we take a backup of the database every day and keep off-site copies. Planned maintenance is announced in the app ahead of time. We do not promise the service will never be interrupted, and you should keep your own copies of anything critical (an organisation admin can export its data at any time).

## 7. Privacy and security
How we handle personal information is set out in our Privacy policy. Organisations that use Dashi to hold other people's personal information are covered by our Data processing agreement, which forms part of these terms.

## 8. Ending
You can stop using Dashi and ask us to delete your organisation at any time. We may end these terms if you seriously or repeatedly break them, or with 60 days' notice if we stop offering Dashi. Either way, an admin can export the organisation's data for 30 days afterwards; then we delete it, and backups holding it expire within 30 more days.

## 9. Warranties and liability
Dashi is provided "as is". To the extent the law allows, we disclaim implied warranties, including fitness for a particular purpose. Our total liability for any claim about Dashi is limited to the amount your organisation paid us in the 12 months before the claim, or $100 if that is more. We are not liable for indirect or consequential losses, such as lost profits or lost data you could have exported. Nothing in these terms limits liability that cannot be limited by law.

## 10. Changes to these terms
We will post changes here and, for important changes, email organisation admins at least 30 days before they apply. If you keep using Dashi after that, the new terms apply. We keep a record of which version each person accepted.

## 11. Law
These terms are governed by the laws of {{province}} and the federal laws of Canada that apply there. The courts of {{province}} decide any dispute, unless the law where you live gives you the right to go to your own courts.

## 12. Contact
{{company}}{{address}}. Email {{email}}.`;

const PRIVACY = `This policy explains what personal information {{company}} collects through Dashi ({{domain}}), why, and the choices you have. It follows Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) and its ten fair information principles. Last updated {{updated}}.

## Who is responsible
{{company}} is responsible for personal information about the people who sign up for and use Dashi. Our privacy contact can be reached at {{email}}.

When an organisation uses Dashi to keep information about other people (its staff, partners, participants or the public), that organisation decides what is kept and why, and we handle it on its behalf under our Data processing agreement. Questions about that information are best sent to the organisation first.

## What we collect
- **Account details:** your name, email address, password (stored only as a one-way hash), and, if you choose, a two-step sign-in secret, and sign-in through Google, Microsoft or Facebook (we receive your name and email from them).
- **Organisation details:** its name, address on Dashi, plan, and the people in it.
- **Content you add:** maps, plans, data, documents, audio and pages. Some of it you may choose to publish.
- **Payment details:** handled by Stripe. We receive your billing name, address, the last four digits of your card and your payment history; we never see or store full card numbers.
- **Technical information:** your IP address and browser for sign-in sessions and security, and server logs kept for up to 30 days. We do not use advertising or tracking cookies, or third-party analytics. We use one cookie to keep you signed in.
- **Messages:** support tickets and emails you send us.
- **Feedback forms:** answers people give on an organisation's public forms are kept for that organisation.

## Why we use it
To provide and secure Dashi, to sign you in, to bill for paid plans, to answer support requests, to send messages about your account (such as password resets, invitations, receipts and important changes), and to meet legal obligations such as tax records. We send marketing emails only if you have agreed, and every one has an unsubscribe link, as Canada's Anti-Spam Legislation requires.

## Consent
By creating an account you consent to the uses above. You can withdraw consent at any time by closing your account, subject to legal and contractual limits (for example, we must keep invoices for six years for the Canada Revenue Agency).

## Who we share it with
We do not sell personal information. We share it only with service providers who help us run Dashi, under contracts that require them to protect it and use it only for us:

| Provider | What for | Where |
| --- | --- | --- |
| Fly.io | Hosting the app and database | Toronto, Canada |
| Tigris Data | Encrypted off-site database copies | Canada and the United States |
| Postmark or Resend | Sending account emails | United States |
| Stripe | Payments and receipts | Canada and the United States |
| Google, Microsoft or Facebook | Sign-in, only if you choose it | United States |

Information held outside Canada is subject to the laws of that country, and may be accessed by its courts, law enforcement and national security authorities. We may also disclose information when the law requires it, or to protect someone's safety.

## How long we keep it
While your account is open. When an organisation is deleted, its content is removed straight away and expires from backups within 30 days. Billing records are kept for six years. Security logs are kept for up to one year.

## How we protect it
Encryption in transit (HTTPS) and at rest for backups, hashed passwords, two-step sign-in for administrators, limits on sign-in attempts, access only for people who need it, a log of administrative actions, daily backups, and regular security checks. If a breach creates a real risk of significant harm, we will notify you and the Office of the Privacy Commissioner of Canada as the law requires.

## Your rights
You can ask to see the personal information we hold about you, correct it, or have it deleted. Write to {{email}}; we will answer within 30 days. If you are not satisfied, you can complain to the Office of the Privacy Commissioner of Canada (priv.gc.ca).

## Children
Dashi is not meant for children under 13. Organisations that involve young people are responsible for obtaining any consent needed.

## Changes
We will post changes here and email account holders about important ones before they apply.`;

const ACCESSIBILITY = `{{company}} wants everyone to be able to use Dashi and the public sites organisations publish with it, including people who use screen readers, keyboards, magnification, captions or voice control. Last updated {{updated}}.

## Our goal
We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA, the standard used by the Accessibility for Ontarians with Disabilities Act (AODA) and the Accessible Canada Act.

## What we do
- Build pages that work with a keyboard alone, with visible focus.
- Label buttons, form fields and icons for screen readers.
- Keep text and controls readable, with enough colour contrast, in light and dark themes.
- Respect the browser's text size and "reduce motion" settings.
- Offer transcripts for podcast episodes where the organisation provides them.
- Test new features with automated checks and by hand.

## What we know is not there yet
- Some charts and the ecosystem map canvas are visual. We provide tables and lists of the same information where we can, and are working on better descriptions.
- Organisations write their own pages, images and documents. We prompt for image descriptions, but their content is their responsibility.

## Tell us
If something in Dashi is hard to use, or you need information in another format, write to {{email}}. We will reply within five business days and work with you on a solution.`;

const DPA = `This agreement forms part of the Terms of service between {{company}} ("the processor", "we") and the organisation using Dashi ("the organisation"). It covers personal information the organisation puts into Dashi about other people. Last updated {{updated}}.

## 1. Roles
The organisation decides what personal information it keeps in Dashi and why, and is responsible for having the right to collect it and for telling people how it is used. We process that information only to provide Dashi, on the organisation's documented instructions, which are these terms and the settings the organisation chooses in Dashi.

## 2. Confidentiality
Everyone at {{company}} who can access the organisation's information is bound by confidentiality, and only accesses it when needed to run, support or secure the service, or when the organisation asks us to (for example in a support ticket).

## 3. Security
We keep technical and organisational measures appropriate to the information, including: encryption in transit and for backups; hashed passwords and two-step sign-in for administrators; role-based access within each organisation; separation between organisations; logging of administrative actions; daily backups with off-site copies; prompt security updates; and periodic outside security testing.

## 4. Sub-processors
We use the service providers listed in our Privacy policy. We will give at least 30 days' notice by email of a new sub-processor, and the organisation may object; if we cannot address the objection, the organisation may end its plan and receive a refund of any prepaid period it has not used. Each sub-processor is bound by written terms at least as protective as these.

## 5. Where information is kept
The main database and files are hosted in Toronto, Canada. Some providers (listed in the Privacy policy) process information in the United States.

## 6. Helping the organisation
We will help the organisation respond to requests from people to see, correct or delete their information, mostly through Dashi's own tools (export, edit, delete), and with reasonable help on request.

## 7. Breaches
If we become aware of a breach of security safeguards involving the organisation's information, we will tell the organisation without undue delay, and within 72 hours where possible, with what we know, what we are doing, and what the organisation may need to do. We keep a record of every breach for at least 24 months, as PIPEDA requires.

## 8. Return and deletion
When the organisation's plan ends, an admin can export its information for 30 days. We then delete it, and backups holding it expire within 30 more days, unless the law requires us to keep it.

## 9. Audits
On reasonable written request, once a year, we will answer an organisation's security questionnaire and share a summary of our most recent outside security test.

## 10. Contact
Privacy and security questions: {{email}}.`;

const SECURITY = `How we keep Dashi secure, and how to tell us about a security problem. Last updated {{updated}}.

## How we protect Dashi
- Every connection uses HTTPS, with HSTS and a strict content security policy.
- Passwords are stored as salted hashes, never as text. Sign-in attempts are limited.
- Administrators must use two-step sign-in. Every administrative action is logged.
- Each organisation's information is kept apart from every other organisation's, and checked on every request.
- The database is copied off the server continuously and backed up daily, with backups encrypted at rest. We test restoring them every quarter.
- Payments are handled by Stripe. Card details never reach our servers.
- We watch Dashi around the clock from outside, scan it for weaknesses every month, and apply security updates promptly.

## Reporting a vulnerability
If you think you have found a security problem in Dashi, please email {{security}} with what you found, how to reproduce it, and how we can reach you. Please don't post it publicly until we have fixed it.

We will:
- reply within 3 business days to confirm we have your report;
- tell you what we found and when we expect to fix it, and keep you updated;
- fix serious problems as fast as we can, normally within 30 days;
- credit you on this page once it's fixed, if you'd like.

## Testing in good faith
We will not take legal action against you, or ask anyone else to, for research that follows these rules:
- Only test with accounts and organisations you created yourself. Never read, change or delete other people's information; if you reach some by accident, stop, don't keep it, and tell us.
- Don't disrupt the service: no denial-of-service, spam, or heavy automated scanning of the live site.
- No social engineering of our staff or customers, and no physical attacks.
- Give us a reasonable time to fix the problem before you tell anyone else.

We don't offer cash rewards at this time.

Our security contact details are also published at https://{{domain}}/.well-known/security.txt.`;

export const LEGAL_DEFAULTS = { terms: TERMS, privacy: PRIVACY, accessibility: ACCESSIBILITY, dpa: DPA, security: SECURITY };

/** A kind's published versions, oldest first; the built-in text counts as version 1. */
export function versionsOf(stored, kind) {
  const list = stored?.docs?.[kind]?.versions ?? [];
  return list.length ? list : [{ v: 1, at: null, body: LEGAL_DEFAULTS[kind] ?? '', note: 'Starting text' }];
}
export const currentVersion = (stored, kind) => versionsOf(stored, kind).at(-1);

/** Fill a body's {{…}} with the company's details. */
export function fillLegal(body, company = {}, updated = '') {
  const c = { ...COMPANY_DEFAULTS, ...company };
  const values = { company: c.name, address: c.address ? `, ${c.address}` : '', email: c.email, security: c.security || c.email, province: c.province, domain: c.domain, updated: updated || 'when Dashi opened' };
  return String(body).replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m);
}

/** Publish a new version of a kind, if its text changed. Returns the new stored document. */
export function publishLegal(stored = {}, kind, body, { at = new Date().toISOString(), note = '' } = {}) {
  const versions = versionsOf(stored, kind);
  const last = versions.at(-1);
  if (String(body).trim() === String(last.body).trim()) return stored;
  const next = { v: last.v + 1, at, body: String(body), note: String(note).slice(0, 200) };
  const kept = stored?.docs?.[kind]?.versions?.length ? versions : [last];
  return { ...stored, docs: { ...(stored.docs ?? {}), [kind]: { versions: [...kept, next] } } };
}

/**
 * The security.txt file (RFC 9116) that tells researchers where to report a
 * problem. It must carry an expiry date; this one is always a year ahead.
 */
export function securityTxt(company = {}, origin, { now = Date.now() } = {}) {
  const c = { ...COMPANY_DEFAULTS, ...company };
  const expires = new Date(now + 365 * 864e5);
  expires.setUTCHours(0, 0, 0, 0);
  return [
    `Contact: mailto:${c.security || c.email}`,
    `Expires: ${expires.toISOString()}`,
    `Policy: ${origin}/legal.html?doc=security`,
    'Preferred-Languages: en, fr',
    `Canonical: ${origin}/.well-known/security.txt`,
    '',
  ].join('\n');
}

/** What a person still has to accept: kinds whose current version they haven't. */
export function dueFor(stored, accepted = []) {
  return LEGAL_KINDS.filter((k) => k.accept).map((k) => ({ kind: k.id, v: currentVersion(stored, k.id).v }))
    .filter(({ kind, v }) => !accepted.some((a) => a.doc === kind && a.version === v));
}
