/**
 * Two-step sign-in: six-digit codes from an authenticator app (1Password,
 * Google Authenticator, Authy, Microsoft Authenticator…), as in RFC 6238.
 * Nothing to install: node's crypto does the HMAC.
 *
 * The secret is shown once, as a QR-ready otpauth:// address and as text,
 * while the person sets it up. A code is accepted for 30 seconds either
 * side of now, to allow for a phone's clock being a little off, and each
 * code works once.
 */
import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s) {
  const clean = String(s).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(randomBytes(20));

/** The code for a time step (30 seconds since 1970). */
export function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', fromBase32(secret)).update(msg).digest();
  const off = mac[mac.length - 1] & 15;
  const n = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const stepOf = (ms = Date.now()) => Math.floor(ms / 30_000);

/**
 * The time step a code belongs to (now, or one either side), or null.
 * Pass `after` (the last step used) so the same code can't be used twice.
 */
export function checkCode(secret, code, { now = Date.now(), after = -1 } = {}) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!secret || !/^\d{6}$/.test(c)) return null;
  const step = stepOf(now);
  for (const s of [step, step - 1, step + 1]) if (s > after && codeAt(secret, s) === c) return s;
  return null;
}

export const otpauthUrl = (secret, account, issuer = 'Dashi') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?${new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })}`;
