import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import authRouter from './routes/auth.js';
import employeesRouter from './routes/employees.js';
import attendanceRouter from './routes/attendance.js';
import leavesRouter from './routes/leaves.js';
import { dashboardRouter, notificationsRouter, activityRouter, reportsRouter } from './routes/misc.js';
import orgRouter from './routes/org.js';
import { requireAuth } from './middleware/auth.js';
import { uploadsDir } from './utils/helpers.js';
import { licenseGate, licenseStatusHandler, verifyLicense } from './license.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      // Allow map tiles from OpenStreetMap and common CDNs
      imgSrc:     ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
      connectSrc: ["'self'", 'https://*.tile.openstreetmap.org'],
      workerSrc:  ["'self'", 'blob:'],
    },
  },
}));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '8mb' })); // selfies arrive as base64 JSON

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// License: public status endpoint (always reachable) + gate for everything else.
// Mounted before all /api routers so an expired license locks the whole app.
// See docs/LICENSING.md — disclosed evaluation license, not a hidden mechanism.
app.get('/api/license/status', licenseStatusHandler);
app.use('/api', licenseGate);

app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/leaves', leavesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/org', orgRouter);

// Selfie images: served only to authenticated users
app.use('/api/uploads', requireAuth, express.static(uploadsDir, { maxAge: '7d', immutable: true }));

// Serve the built frontend in production (npm run build inside /client)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

// Central error handler — never leaks stack traces to clients
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HRMS server running → http://localhost:${PORT}`);
  const lic = verifyLicense();
  if (lic.ok) console.log(`License OK — licensed to "${lic.license.licensee}", ${lic.daysLeft} day(s) remaining (expires ${lic.license.expires}).`);
  else console.warn(`⚠ License ${lic.reason}: ${lic.detail} — the app is LOCKED until a valid license is present.`);
});
