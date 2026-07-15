# Database

SQLite via Node's built-in `node:sqlite` (WAL mode, foreign keys on). File: `server/data/hrms.db`. The schema is defined in `server/src/db.js`.

## Entity relationships

```
departments 1 ──< users 1 ──< attendance
                      │
                      ├────< leaves  (decided_by → users.id)
                      ├────< notifications
                      └────< activity_log
```

## Tables
- **departments** — id, name (unique)
- **users** — employee_code (unique), name, email (unique), password_hash, role (admin|employee), department_id FK, designation, phone, join_date, status, per-type leave balances
- **attendance** — user_id FK, work_date, punch_in_at/lat/lng/selfie, punch_out_at/lat/lng/selfie, face_match_score, liveness_passed, working_minutes; **UNIQUE(user_id, work_date)** prevents duplicate daily punches
- **leaves** — user_id FK, type, start/end dates, days, reason, status (pending|approved|rejected|cancelled), decided_by FK, decided_at, admin_note
- **notifications** — user_id FK (nullable), audience (user|admin), title, body, kind, read
- **activity_log** — user_id FK, action, detail, ip, created_at

Indexes cover the hot paths: attendance by date and by user, leaves by user and status, notifications by (user, read).

## Migrating to PostgreSQL
The SQL is deliberately portable. To move:
1. Replace `AUTOINCREMENT` → `GENERATED ALWAYS AS IDENTITY`, `TEXT` timestamps → `timestamptz DEFAULT now()`, `INTEGER` booleans → `boolean`.
2. Swap the driver: replace `node:sqlite` calls in `db.js` with `pg` (`pool.query`), keeping the same prepared-statement shape (`?` → `$1, $2…`).
3. Everything else (routes, validation, frontend) is unchanged — no ORM lock-in.
