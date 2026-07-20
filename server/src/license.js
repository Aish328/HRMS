/*
 * ============================================================================
 *  LICENSE GATE  —  open, expiry-based activation for the HRMS deployment
 * ============================================================================
 *
 *  PURPOSE (read this first — it's what keeps this legitimate):
 *  This is a *disclosed* evaluation-license mechanism, the same primitive
 *  commercial software uses. The deployment runs only while a valid, unexpired,
 *  cryptographically-signed license is present. When the license lapses, the
 *  app locks and shows a clear message telling the operator who to contact to
 *  renew. It is NOT hidden, and it does NOT trigger on anything other than the
 *  neutral condition of license expiry. Document it to the company (see
 *  docs/LICENSING.md) — transparency is the whole point.
 *
 *  HOW IT WORKS:
 *   - You (the issuer) hold an Ed25519 PRIVATE key. Keep it secret; it never
 *     ships with the app.
 *   - The app ships with only the PUBLIC key, which can verify but not forge.
 *   - A license is a small JSON payload {licensee, issued, expires, ...} signed
 *     with your private key. The company cannot alter the expiry without the
 *     private key — any tampering fails signature verification.
 *   - The server verifies the license on startup and on every /api request
 *     (cheap: one signature check, cached). Past expiry → 402 Payment Required
 *     with a lockout payload; the frontend renders a full-screen lock.
 *
 *  TO RENEW: you issue a new license file with a later expiry (see
 *  scripts/license-cli.js) and drop it in. No code changes, no redeploy.
 * ============================================================================
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the license file and public key live. Overridable via env for flexibility.
const LICENSE_PATH = process.env.LICENSE_PATH || path.join(__dirname, '..', 'license', 'license.json');
const PUBKEY_PATH = process.env.LICENSE_PUBKEY_PATH || path.join(__dirname, '..', 'license', 'license-public.pem');

// Re-verify at most once per minute to avoid re-reading files on every request.
const CACHE_MS = 60_000;
let cache = { at: 0, result: null };

/**
 * Verify the on-disk license against the bundled public key.
 * Returns { ok:true, license } or { ok:false, reason, detail }.
 */
export function verifyLicense() {
  const now = Date.now();
  if (cache.result && now - cache.at < CACHE_MS) return cache.result;

  let result;
  try {
    if (!fs.existsSync(PUBKEY_PATH)) {
      result = { ok: false, reason: 'no_pubkey', detail: 'License public key missing from deployment.' };
    } else if (!fs.existsSync(LICENSE_PATH)) {
      result = { ok: false, reason: 'no_license', detail: 'No license file found. This deployment requires activation.' };
    } else {
      const pubKey = fs.readFileSync(PUBKEY_PATH, 'utf8');
      const raw = fs.readFileSync(LICENSE_PATH, 'utf8');
      const { payload, signature } = JSON.parse(raw);

      // payload is base64url of the canonical JSON; signature is base64.
      const payloadBuf = Buffer.from(payload, 'base64url');
      const sigBuf = Buffer.from(signature, 'base64');

      // Ed25519 verify (algorithm arg is null for Ed25519 in Node's crypto).
      const valid = crypto.verify(null, payloadBuf, pubKey, sigBuf);
      if (!valid) {
        result = { ok: false, reason: 'bad_signature', detail: 'License signature is invalid or the file was modified.' };
      } else {
        const license = JSON.parse(payloadBuf.toString('utf8'));
        const expires = new Date(license.expires).getTime();
        const notBefore = license.issued ? new Date(license.issued).getTime() : 0;

        if (Number.isNaN(expires)) {
          result = { ok: false, reason: 'malformed', detail: 'License expiry is not a valid date.' };
        } else if (now < notBefore) {
          result = { ok: false, reason: 'not_yet_valid', detail: `License is not valid until ${license.issued}.`, license };
        } else if (now > expires) {
          result = { ok: false, reason: 'expired', detail: `License expired on ${license.expires}.`, license };
        } else {
          result = { ok: true, license, daysLeft: Math.ceil((expires - now) / 86_400_000) };
        }
      }
    }
  } catch (e) {
    result = { ok: false, reason: 'error', detail: `License check failed: ${e.message}` };
  }

  cache = { at: now, result };
  return result;
}

/** Force the next verifyLicense() to re-read from disk (e.g. after renewal). */
export function invalidateLicenseCache() {
  cache = { at: 0, result: null };
}

/**
 * Express middleware. Mount BEFORE the API routers. Allows a tiny allowlist
 * (health + the license status endpoint) so the frontend can always ask
 * "am I locked?" and render an honest screen. Everything else is blocked when
 * the license is invalid.
 */
export function licenseGate(req, res, next) {
  // Always allow these, even when locked, so the UI can explain itself.
  const allowlist = ['/api/health', '/api/license/status'];
  if (allowlist.includes(req.path)) return next();

  const check = verifyLicense();
  if (check.ok) {
    // Surface days-remaining in a header so the client can warn near expiry.
    res.setHeader('X-License-Days-Left', String(check.daysLeft ?? ''));
    return next();
  }

  // Locked. 402 Payment Required is the honest status for "license lapsed".
  return res.status(402).json({
    error: 'license_invalid',
    reason: check.reason,
    message:
      check.reason === 'expired'
        ? 'This HRMS deployment’s license has expired. Please contact the system provider to renew.'
        : 'This HRMS deployment is not activated. Please contact the system provider.',
    detail: check.detail,
    // Contact shown to whoever hits the locked app — set via env when you deploy.
    contact: process.env.LICENSE_CONTACT || 'the system provider',
    licensee: check.license?.licensee,
    expired_on: check.license?.expires,
  });
}

/** Public status endpoint — lets the frontend poll lock state without auth. */
export function licenseStatusHandler(_req, res) {
  const check = verifyLicense();
  res.json({
    ok: check.ok,
    reason: check.reason || null,
    daysLeft: check.daysLeft ?? null,
    licensee: check.license?.licensee ?? null,
    expires: check.license?.expires ?? null,
    contact: process.env.LICENSE_CONTACT || 'the system provider',
  });
}
