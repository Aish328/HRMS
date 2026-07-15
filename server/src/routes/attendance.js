import { Router } from 'express';
import { z } from 'zod';
import db, { logActivity, notify, todayStr } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { saveSelfie, imageSimilarity } from '../utils/helpers.js';
import { getFence, setFence, clearFence, checkFence } from '../geofence.js';

const router = Router();
router.use(requireAuth);

const punchSchema = z.object({
  selfie: z.string().startsWith('data:image/', 'Selfie must come from the camera.'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  livenessPassed: z.boolean(),
  livenessScore: z.number().min(0).max(1).optional(),
});

// ---- Employee: today's status ----
router.get('/today', (req, res) => {
  const row = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND work_date = ?')
    .get(req.user.id, todayStr());
  res.json({ attendance: row || null, serverTime: new Date().toISOString() });
});

// ---- Employee: recent history ----
router.get('/mine', (req, res) => {
  const limit = Math.min(60, parseInt(req.query.limit) || 14);
  const rows = db.prepare(
    'SELECT * FROM attendance WHERE user_id = ? ORDER BY work_date DESC LIMIT ?'
  ).all(req.user.id, limit);
  res.json({ records: rows });
});

// ---- Employee: punch in ----
router.post('/punch-in', (req, res) => {
  const parsed = punchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { selfie, lat, lng, livenessPassed } = parsed.data;

  if (!livenessPassed) {
    return res.status(400).json({ error: 'Liveness check failed. Blink and move slightly, then retry.' });
  }

  // Geofence check
  const fenceError = checkFence(lat, lng);
  if (fenceError) return res.status(400).json({ error: fenceError });

  const date = todayStr();
  const existing = db.prepare('SELECT id FROM attendance WHERE user_id = ? AND work_date = ?')
    .get(req.user.id, date);
  if (existing) return res.status(409).json({ error: 'You have already punched in today.' });

  let file;
  try { file = saveSelfie(selfie); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO attendance (user_id, work_date, punch_in_at, punch_in_lat, punch_in_lng,
       punch_in_selfie, liveness_passed)
     VALUES (?,?,?,?,?,?,1)`
  ).run(req.user.id, date, now, lat, lng, file);

  logActivity(req.user.id, 'punch_in', `Punched in at ${now}`, req.ip);
  notify({ audience: 'admin', title: `${req.user.name} punched in`, kind: 'attendance' });

  const row = db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ attendance: row });
});

// ---- Employee: punch out ----
router.post('/punch-out', (req, res) => {
  const parsed = punchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { selfie, lat, lng, livenessPassed } = parsed.data;

  if (!livenessPassed) {
    return res.status(400).json({ error: 'Liveness check failed. Blink and move slightly, then retry.' });
  }

  const date = todayStr();
  const rec = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND work_date = ?')
    .get(req.user.id, date);
  if (!rec) return res.status(400).json({ error: 'Punch in first before punching out.' });
  if (rec.punch_out_at) return res.status(409).json({ error: 'You have already punched out today.' });

  let file;
  try { file = saveSelfie(selfie); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const score = imageSimilarity(rec.punch_in_selfie, file);
  const now = new Date();
  const minutes = Math.max(0, Math.round((now - new Date(rec.punch_in_at)) / 60000));

  db.prepare(
    `UPDATE attendance SET punch_out_at = ?, punch_out_lat = ?, punch_out_lng = ?,
       punch_out_selfie = ?, face_match_score = ?, working_minutes = ? WHERE id = ?`
  ).run(now.toISOString(), lat, lng, file, score, minutes, rec.id);

  logActivity(req.user.id, 'punch_out', `Punched out, ${minutes} min worked`, req.ip);
  if (score !== null && score < 0.55) {
    notify({
      audience: 'admin',
      title: `Verification flag: ${req.user.name}`,
      body: 'Punch-out selfie differs significantly from punch-in. Review in Attendance.',
      kind: 'attendance',
    });
  }

  const row = db.prepare('SELECT * FROM attendance WHERE id = ?').get(rec.id);
  res.json({ attendance: row });
});


// ---- Employee: monthly calendar data ----
// Returns per-day status for the requested month: full | half | absent | weekend | holiday | future
router.get('/calendar', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayStr().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayStr();

  const records = db.prepare(
    `SELECT work_date, punch_in_at, punch_out_at, working_minutes FROM attendance
     WHERE user_id = ? AND work_date >= ? AND work_date <= ?`
  ).all(req.user.id, `${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`);
  const byDate = new Map(records.map((r) => [r.work_date, r]));

  const holidays = db.prepare(
    'SELECT date, name FROM holidays WHERE date >= ? AND date <= ?'
  ).all(`${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`);
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));

  const FULL_DAY_MIN = 360; // ≥6h counts as a full day; anything shorter is a half day

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    const rec = byDate.get(dateStr);
    let status;
    if (holidayMap.has(dateStr)) status = 'holiday';
    else if (dateStr > today) status = 'future';
    else if (rec) {
      if (rec.punch_out_at == null) status = dateStr === today ? 'working' : 'half';
      else status = (rec.working_minutes ?? 0) >= FULL_DAY_MIN ? 'full' : 'half';
    }
    else if (dow === 0 || dow === 6) status = 'weekend';
    else status = 'absent';

    days.push({
      date: dateStr, status,
      holidayName: holidayMap.get(dateStr) || null,
      punchIn: rec?.punch_in_at || null,
      punchOut: rec?.punch_out_at || null,
      workingMinutes: rec?.working_minutes ?? null,
    });
  }

  // Monthly attendance % = full + 0.5*half over elapsed working days (mon–fri, non-holiday)
  const elapsed = days.filter((d) => d.date <= today && !['weekend', 'holiday', 'future'].includes(d.status) || (d.date <= today && d.status === 'absent'));
  const workDays = days.filter((d) => d.date <= today && d.status !== 'weekend' && d.status !== 'holiday' && d.status !== 'future');
  const credit = workDays.reduce((s, d) => s + (d.status === 'full' || d.status === 'working' ? 1 : d.status === 'half' ? 0.5 : 0), 0);
  const percentage = workDays.length ? Math.round((credit / workDays.length) * 100) : 0;

  res.json({ month, days, percentage });
});

// ---- Admin: list attendance with filters + pagination ----
router.get('/', requireRole('admin'), (req, res) => {
  const { date = '', from = '', to = '', q = '', department = '', page = '1', pageSize = '15' } = req.query;
  const limit = Math.min(100, parseInt(pageSize) || 15);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];
  if (date) { where += ' AND a.work_date = ?'; params.push(date); }
  if (from) { where += ' AND a.work_date >= ?'; params.push(from); }
  if (to) { where += ' AND a.work_date <= ?'; params.push(to); }
  if (q) { where += ' AND (u.name LIKE ? OR u.employee_code LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (department) { where += ' AND u.department_id = ?'; params.push(Number(department)); }

  const base = `FROM attendance a JOIN users u ON u.id = a.user_id
    LEFT JOIN departments d ON d.id = u.department_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...params).c;
  const rows = db.prepare(
    `SELECT a.*, u.name, u.employee_code, d.name AS department ${base}
     ORDER BY a.work_date DESC, a.punch_in_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ records: rows, total, page: Number(page), pageSize: limit });
});

// ---- Admin: get / set / delete geofence ----
router.get('/geofence', requireRole('admin'), (_req, res) => {
  res.json({ fence: getFence() });
});

router.post('/geofence', requireRole('admin'), (req, res) => {
  const { lat, lng, radiusM } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof radiusM !== 'number') {
    return res.status(400).json({ error: 'lat, lng and radiusM must be numbers.' });
  }
  setFence(lat, lng, radiusM);
  res.json({ ok: true, fence: getFence() });
});

router.delete('/geofence', requireRole('admin'), (_req, res) => {
  clearFence();
  res.json({ ok: true });
});

export default router;
