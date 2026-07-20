#!/usr/bin/env node
/*
 * ============================================================================
 *  LICENSE CLI  —  you (the issuer) run this. Keeps the private key with YOU.
 * ============================================================================
 *
 *  Commands:
 *
 *   node scripts/license-cli.js keygen
 *       Generates an Ed25519 keypair:
 *         - license/license-private.pem   ← KEEP SECRET. Never deploy. Back up.
 *         - license/license-public.pem    ← ships with the app (verify-only).
 *       Run this ONCE. If you lose the private key you can't issue renewals.
 *
 *   node scripts/license-cli.js issue --licensee "Sharika Enterprises" --days 45
 *       Signs a license valid for N days from now, writing license/license.json.
 *       Options:
 *         --licensee "<name>"   who it's for (shown on the lock screen)
 *         --days <N>            validity window in days (e.g. 30, 45, 90)
 *         --expires YYYY-MM-DD  explicit end date (overrides --days)
 *         --out <path>          output file (default license/license.json)
 *
 *   node scripts/license-cli.js inspect
 *       Prints the current license and whether it's valid right now.
 *
 *  RENEWAL is just another `issue` with a later date — drop the new
 *  license.json onto the server, done. No redeploy.
 * ============================================================================
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const licenseDir = path.join(__dirname, '..', 'license');
const PRIV = path.join(licenseDir, 'license-private.pem');
const PUB = path.join(licenseDir, 'license-public.pem');
const DEFAULT_OUT = path.join(licenseDir, 'license.json');

function ensureDir() { fs.mkdirSync(licenseDir, { recursive: true }); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function keygen() {
  ensureDir();
  if (fs.existsSync(PRIV)) {
    console.error(`Refusing to overwrite existing private key at ${PRIV}.`);
    console.error('Delete it manually if you really mean to regenerate (this invalidates all issued licenses).');
    process.exit(1);
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(PUB, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('Keypair generated:');
  console.log(`  PRIVATE (keep secret, back up):  ${PRIV}`);
  console.log(`  PUBLIC  (ship with app):         ${PUB}`);
  console.log('\n⚠  Add license/license-private.pem to .gitignore. Never commit or deploy it.');
}

function issue(args) {
  if (!fs.existsSync(PRIV)) {
    console.error('No private key found. Run:  node scripts/license-cli.js keygen');
    process.exit(1);
  }
  const licensee = args.licensee || 'Unnamed Licensee';
  const issued = new Date();

  let expires;
  if (args.expires) {
    expires = new Date(`${args.expires}T23:59:59`);
    if (Number.isNaN(expires.getTime())) { console.error('Bad --expires date. Use YYYY-MM-DD.'); process.exit(1); }
  } else {
    const days = Number(args.days || 30);
    if (!Number.isFinite(days) || days <= 0) { console.error('Bad --days value.'); process.exit(1); }
    expires = new Date(issued.getTime() + days * 86_400_000);
  }

  const payloadObj = {
    licensee,
    product: 'SEL HRMS',
    issued: issued.toISOString(),
    expires: expires.toISOString(),
    license_id: crypto.randomBytes(6).toString('hex'),
  };

  const payloadBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const privKey = fs.readFileSync(PRIV, 'utf8');
  const signature = crypto.sign(null, payloadBuf, privKey); // Ed25519

  const licenseFile = {
    _comment: 'Signed license for SEL HRMS. Do not edit — any change breaks the signature.',
    payload: payloadBuf.toString('base64url'),
    signature: signature.toString('base64'),
  };

  const out = args.out ? path.resolve(String(args.out)) : DEFAULT_OUT;
  ensureDir();
  fs.writeFileSync(out, JSON.stringify(licenseFile, null, 2));
  console.log('License issued:');
  console.log(`  Licensee: ${licensee}`);
  console.log(`  Valid:    ${payloadObj.issued}  →  ${payloadObj.expires}`);
  console.log(`  File:     ${out}`);
  console.log('\nDeploy this file to the server as license/license.json (the public key must already be there).');
}

function inspect() {
  const file = DEFAULT_OUT;
  if (!fs.existsSync(file)) { console.error('No license.json found.'); process.exit(1); }
  if (!fs.existsSync(PUB)) { console.error('No public key found.'); process.exit(1); }
  const { payload, signature } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const payloadBuf = Buffer.from(payload, 'base64url');
  const valid = crypto.verify(null, payloadBuf, fs.readFileSync(PUB, 'utf8'), Buffer.from(signature, 'base64'));
  const obj = JSON.parse(payloadBuf.toString('utf8'));
  const now = Date.now();
  const exp = new Date(obj.expires).getTime();
  console.log('License contents:', JSON.stringify(obj, null, 2));
  console.log('Signature valid: ', valid);
  console.log('Currently valid: ', valid && now <= exp && now >= new Date(obj.issued).getTime());
  if (valid) console.log('Days remaining:  ', Math.ceil((exp - now) / 86_400_000));
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);
switch (cmd) {
  case 'keygen': keygen(); break;
  case 'issue': issue(args); break;
  case 'inspect': inspect(); break;
  default:
    console.log('Usage:');
    console.log('  node scripts/license-cli.js keygen');
    console.log('  node scripts/license-cli.js issue --licensee "Sharika Enterprises" --days 45');
    console.log('  node scripts/license-cli.js issue --licensee "Sharika Enterprises" --expires 2026-09-30');
    console.log('  node scripts/license-cli.js inspect');
}
