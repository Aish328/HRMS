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


/* ---------------- v2 schema: hierarchy, workflow, holidays ---------------- */

// users.manager_id (safe to re-run)
try { db.exec('ALTER TABLE users ADD COLUMN manager_id INTEGER REFERENCES users(id)'); } catch { /* exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN project TEXT DEFAULT ''"); } catch { /* exists */ }
try { db.exec("ALTER TABLE users ADD COLUMN company TEXT DEFAULT 'Sharika Enterprises Limited'"); } catch { /* exists */ }

// leaves table needs new statuses + manager columns → rebuild once (SQLite cannot edit CHECK)
const leaveCols = db.prepare("SELECT name FROM pragma_table_info('leaves')").all().map((r) => r.name);
if (!leaveCols.includes('manager_status')) {
  db.exec(`
    CREATE TABLE leaves_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('casual','sick','earned','unpaid')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','pending_hr','changes_requested','approved','rejected','cancelled')),
      manager_status TEXT,                -- approved | rejected | changes
      manager_decided_by INTEGER REFERENCES users(id),
      manager_decided_at TEXT,
      manager_note TEXT,
      decided_by INTEGER REFERENCES users(id),   -- HR/admin decision (kept for compat)
      decided_at TEXT,
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO leaves_v2 (id, user_id, type, start_date, end_date, days, reason, status,
      decided_by, decided_at, admin_note, created_at)
      SELECT id, user_id, type, start_date, end_date, days, reason, status,
        decided_by, decided_at, admin_note, created_at FROM leaves;
    DROP TABLE leaves;
    ALTER TABLE leaves_v2 RENAME TO leaves;
    CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
    CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
  `);
}

db.exec(`
CREATE TABLE IF NOT EXISTS leave_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_id INTEGER NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  actor_role TEXT NOT NULL,          -- employee | manager | hr
  action TEXT NOT NULL,              -- submitted | approved | rejected | changes_requested | cancelled
  comments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leave_approvals ON leave_approvals(leave_id);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,         -- YYYY-MM-DD
  name TEXT NOT NULL
);
`);

export function recordApproval(leaveId, actorId, actorRole, action, comments = '') {
  db.prepare('INSERT INTO leave_approvals (leave_id, actor_id, actor_role, action, comments) VALUES (?,?,?,?,?)')
    .run(leaveId, actorId, actorRole, action, comments);
}

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
