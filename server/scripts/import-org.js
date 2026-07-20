#!/usr/bin/env node
/*
 * ============================================================================
 *  ORG IMPORT  —  loads the real SEL org chart into the HRMS database.
 * ============================================================================
 *
 *  Reads org-data.json (the cleaned people list) and:
 *    1. Creates any missing departments.
 *    2. Inserts each person (idempotent: updates if the email already exists).
 *    3. Links managers via manager_id AFTER everyone exists (two-pass), so
 *       reporting order in the file doesn't matter.
 *    4. Validates: no unknown managers, no reporting cycles.
 *
 *  Safe to re-run. Existing attendance/leave data is NOT touched — this only
 *  creates/updates users and departments.
 *
 *  Usage (from server/):
 *      node scripts/import-org.js
 *      node scripts/import-org.js --dry-run     # validate only, write nothing
 *
 *  Default password for everyone is set below; users should change it on first
 *  login. Change DEFAULT_PASSWORD before running if you want something else.
 * ============================================================================
 */

import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'org-data.json');
const DEFAULT_PASSWORD = 'nice';          // <-- change here if desired
const DRY = process.argv.includes('--dry-run');

function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

// ---- Load & pre-validate ----------------------------------------------------
if (!fs.existsSync(DATA_FILE)) {
  console.error(`Missing ${DATA_FILE}. Put the cleaned org-data.json next to this script.`);
  process.exit(1);
}
const people = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// Build name lookup for manager resolution (normalized name -> person)
const byName = new Map();
for (const p of people) {
  const k = norm(p.name);
  if (byName.has(k)) {
    console.error(`Duplicate name in data: "${p.name}" — manager linking would be ambiguous. Fix before importing.`);
    process.exit(1);
  }
  byName.set(k, p);
}

// Validate every manager ("head") resolves to a real person
let bad = 0;
for (const p of people) {
  if (p.head && !byName.has(norm(p.head))) {
    console.error(`Unknown manager for ${p.name}: "${p.head}" is not in the people list.`);
    bad++;
  }
}
if (bad) { console.error(`${bad} unresolved manager(s). Aborting.`); process.exit(1); }

// Cycle detection: walk each person's head chain
for (const p of people) {
  const seen = new Set();
  let cur = p;
  while (cur && cur.head) {
    if (seen.has(norm(cur.name))) {
      console.error(`Reporting cycle detected involving "${p.name}". Aborting.`);
      process.exit(1);
    }
    seen.add(norm(cur.name));
    cur = byName.get(norm(cur.head));
  }
}
console.log(`Validation passed: ${people.length} people, all managers resolve, no cycles.`);

if (DRY) { console.log('--dry-run: no changes written.'); process.exit(0); }

// ---- Import ----------------------------------------------------------------
const pwHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

const getDept = db.prepare('SELECT id FROM departments WHERE name = ?');
const insDept = db.prepare('INSERT INTO departments (name) VALUES (?)');
function deptId(name) {
  if (!name) return null;
  const row = getDept.get(name);
  if (row) return row.id;
  return Number(insDept.run(name).lastInsertRowid);
}

const getUser = db.prepare('SELECT id FROM users WHERE email = ?');
const insUser = db.prepare(`
  INSERT INTO users (employee_code, name, email, password_hash, role, department_id, designation, company, status)
  VALUES (?,?,?,?,?,?,?, 'Sharika Enterprises Limited', 'active')
`);
const updUser = db.prepare(`
  UPDATE users SET employee_code=?, name=?, role=?, department_id=?, designation=? WHERE email=?
`);

let created = 0, updated = 0;
const idByName = new Map();

// Pass 1 — upsert everyone (no manager yet)
const tx1 = () => {
  for (const p of people) {
    const dId = deptId(p.dept);
    const existing = getUser.get(p.mail);
    if (existing) {
      updUser.run(p.code, p.name, p.role, dId, p.desig, p.mail);
      idByName.set(norm(p.name), existing.id);
      updated++;
    } else {
      const info = insUser.run(p.code, p.name, p.mail, pwHash, p.role, dId, p.desig);
      idByName.set(norm(p.name), Number(info.lastInsertRowid));
      created++;
    }
  }
};

// Pass 2 — set manager_id now that everyone has an id
const setMgr = db.prepare('UPDATE users SET manager_id=? WHERE id=?');
const tx2 = () => {
  for (const p of people) {
    const myId = idByName.get(norm(p.name));
    const mgrId = p.head ? idByName.get(norm(p.head)) : null;
    setMgr.run(mgrId ?? null, myId);
  }
};

db.exec('BEGIN');
try { tx1(); tx2(); db.exec('COMMIT'); }
catch (e) { db.exec('ROLLBACK'); console.error('Import failed, rolled back:', e.message); process.exit(1); }

console.log(`Done. Created ${created}, updated ${updated}. Managers linked.`);
console.log(`Default password for new users: "${DEFAULT_PASSWORD}" (ask them to change it).`);

// Quick summary of roots (should be your 5 management)
const roots = db.prepare('SELECT name, designation FROM users WHERE manager_id IS NULL ORDER BY name').all();
console.log('\nTop of tree (no manager):');
for (const r of roots) console.log(`  ${r.name} — ${r.designation}`);
process.exit(0);
