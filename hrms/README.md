# SEL HRMS 
# changes made
A production-ready HR management system with two experiences in one app:

- **Admin dashboard** (desktop web) — analytics, employee management, attendance review with map + selfie verification, leave approvals, reports, audit trail.
- **Employee app** (mobile-first web) — selfie punch in/out with liveness check and geolocation, leave requests, profile and attendance summary.

No Docker anywhere. Everything runs with Node.js and npm.

---

## Quick start (the short version)

Requirements: **Node.js 22.5 or newer** (https://nodejs.org — download the LTS installer).

```bash
# 1. Backend
cd server
npm install
cp .env.example .env        # then edit JWT_SECRET to any long random string
npm run seed                # loads demo departments, employees, attendance
npm start                   # → http://localhost:4000

# 2. Frontend (new terminal)
cd client
npm install
npm run build               # the server at :4000 now serves the built app
```

Open **http://localhost:4000** and sign in:

| Role | Email | Password |
|---|---|---|
| Admin | admin@company.com | admin123 |
| Employee | arjun@company.com (…or any EMP account) | emp123 |

For development with hot reload, run `npm run dev` in *both* folders and use http://localhost:5173 (Vite proxies `/api` to the backend).

**Non-technical users:** just double-click `start-windows.bat` (Windows) or run `./start-mac-linux.sh` (Mac/Linux) — it installs, seeds, builds and starts everything. Then read `docs/HR_GUIDE.md`.

> Camera and location APIs require a secure context. `http://localhost` counts as secure, so punching works on the same machine. To punch from a phone, see "Using it from a phone" below.

---

## Architecture

```
Browser (React SPA)
   │  JSON over REST, JWT in Authorization header
   ▼
Express API  ──  middleware: helmet, CORS, rate-limit (login), requireAuth, requireRole
   │
   ▼
SQLite (node:sqlite, WAL mode)  +  ./uploads (selfie JPEGs on disk)
```

**One process serves everything.** The Express server exposes `/api/*` and also serves the built React app, so a single `npm start` runs the whole product on port 4000.

**Roles.** JWTs carry `{id, role}`. `requireAuth` validates the token; `requireRole('admin')` guards admin routes. The SPA mirrors this with `<RequireRole>` route guards — but the server is the enforcement point.

**Attendance integrity.**
- The punch screen has *no file input* — images come only from a live `getUserMedia` stream.
- Client-side liveness: frames are sampled every 350 ms onto a 32×32 grayscale grid; the capture button unlocks only after several frames show natural motion (blink / small head turn). Static photos and screens fail.
- Server-side: base64 payload must be a real JPEG/PNG data URL within size bounds; one attendance row per user per day is enforced by a `UNIQUE(user_id, work_date)` constraint; punch-out requires an open punch-in.
- Punch-out selfies get an image-similarity score against the punch-in selfie. Low scores raise an admin notification and are flagged in the verification review. **This is a heuristic, not biometric face recognition** — see `docs/SECURITY.md` for how to plug in a real face-matching service.

**Why SQLite instead of PostgreSQL/MongoDB?** The brief asked for a system an HR person can run locally without Docker. SQLite (built into Node 22.5+, zero installation, zero services to manage) is the most suitable choice for that constraint. The schema is plain relational SQL and ports to PostgreSQL nearly verbatim — `docs/DATABASE.md` has the full schema and migration notes.

## Folder structure

```
hrms/
├── server/
│   ├── src/
│   │   ├── index.js            # Express app, static serving, error handler
│   │   ├── db.js               # schema, connection, notify/log helpers
│   │   ├── seed.js             # demo data (npm run seed)
│   │   ├── middleware/auth.js  # JWT sign/verify, role guard
│   │   ├── utils/helpers.js    # selfie storage, similarity, CSV
│   │   └── routes/
│   │       ├── auth.js         # login, me, change-password
│   │       ├── employees.js    # CRUD, departments, search/filter/pagination
│   │       ├── attendance.js   # punch in/out, today, history, admin list
│   │       ├── leaves.js       # apply, cancel, approve/reject
│   │       └── misc.js         # dashboard, notifications, activity, reports
│   ├── uploads/                # selfie JPEGs (created at runtime)
│   └── data/hrms.db            # SQLite database (created at runtime)
├── client/
│   └── src/
│       ├── api/client.ts       # fetch wrapper, auth token, blob downloads
│       ├── store/auth.tsx      # auth context
│       ├── components/         # ui kit, toasts, notification bell, guards
│       ├── hooks/useDebounce.ts
│       └── pages/
│           ├── Login.tsx
│           ├── admin/          # Dashboard, Employees, Attendance, Leaves, Reports, Activity
│           └── employee/       # Home, Punch, Leaves, Profile
└── docs/                       # HR guide, security notes, database schema
```

## API overview

All endpoints are under `/api` and (except login) require `Authorization: Bearer <token>`.

| Method & path | Role | Purpose |
|---|---|---|
| POST /auth/login | — | Sign in, returns JWT (rate-limited) |
| GET /auth/me · POST /auth/change-password | any | Session info, password change |
| GET/POST /employees · PUT/DELETE /employees/:id | admin | Employee CRUD with `q`, `department`, `page` params |
| GET/POST /employees/departments | admin | Department list / create |
| GET /attendance/today · /attendance/mine | employee | Own status and history |
| POST /attendance/punch-in · /punch-out | employee | Selfie + geo + liveness punch |
| GET /attendance | admin | Filterable, paginated records |
| POST /leaves · GET /leaves/mine · POST /leaves/:id/cancel | employee | Leave lifecycle |
| GET /leaves · POST /leaves/:id/decision | admin | Review and approve/reject |
| GET /dashboard/summary | admin | Metrics, 14-day trend, department presence |
| GET /notifications · POST /notifications/read-all | any | Polled notification feed |
| GET /activity | admin | Audit trail |
| GET /reports/attendance.csv · .pdf · /reports/leaves.csv | admin | Exports |
| GET /uploads/:file | any authed | Selfie images |

## Using it from a phone (same Wi-Fi)

Browsers only allow camera/GPS on HTTPS or localhost. Two easy options:

1. **Tunnel (simplest):** `npx localtunnel --port 4000` (or ngrok/cloudflared) gives you an HTTPS URL to open on the phone.
2. **Port forward from the phone's perspective** using `adb reverse tcp:4000 tcp:4000` for Android over USB, then open `http://localhost:4000` on the phone.

For a real deployment, put the server behind any HTTPS reverse proxy (Caddy is a two-line config) — still no Docker required.

## Production checklist

- Set a strong `JWT_SECRET` in `server/.env`.
- Change the seeded admin password immediately (Profile → Change password, or edit via Employees).
- Serve over HTTPS (required for camera/GPS off-localhost).
- Back up `server/data/hrms.db` and `server/uploads/` regularly (both are plain files).
- Read `docs/SECURITY.md`.
