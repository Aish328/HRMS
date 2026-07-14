// SQLite database layer. Schema is written in portable SQL so it can be
// migrated to PostgreSQL with minimal changes (see docs/DATABASE.md).
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'hrms.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  department_id INTEGER REFERENCES departments(id),
  designation TEXT,
  phone TEXT,
  join_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  leave_balance_casual REAL NOT NULL DEFAULT 12,
  leave_balance_sick REAL NOT NULL DEFAULT 10,
  leave_balance_earned REAL NOT NULL DEFAULT 15,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,                -- YYYY-MM-DD (server local)
  punch_in_at TEXT NOT NULL,              -- ISO timestamp
  punch_in_lat REAL, punch_in_lng REAL,
  punch_in_selfie TEXT,                   -- stored filename
  punch_out_at TEXT,
  punch_out_lat REAL, punch_out_lng REAL,
  punch_out_selfie TEXT,
  face_match_score REAL,                  -- heuristic 0..1 similarity punch-out vs punch-in
  liveness_passed INTEGER NOT NULL DEFAULT 0,
  working_minutes INTEGER,
  UNIQUE (user_id, work_date)
);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('casual','sick','earned','unpaid')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL = all admins
  audience TEXT NOT NULL DEFAULT 'user' CHECK (audience IN ('user','admin')),
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL DEFAULT 'info',      -- info | leave | attendance | system
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
`);

// Simple transaction helper (node:sqlite has no .transaction like better-sqlite3)
export function transaction(fn) {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export default db;

export function logActivity(userId, action, detail = '', ip = '') {
  db.prepare('INSERT INTO activity_log (user_id, action, detail, ip) VALUES (?,?,?,?)')
    .run(userId, action, detail, ip);
}

export function notify({ userId = null, audience = 'user', title, body = '', kind = 'info' }) {
  db.prepare('INSERT INTO notifications (user_id, audience, title, body, kind) VALUES (?,?,?,?,?)')
    .run(userId, audience, title, body, kind);
}

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
