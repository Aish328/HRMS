import { Router } from 'express';
import PDFDocument from 'pdfkit';
import db, { todayStr } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { toCsv } from '../utils/helpers.js';

export const dashboardRouter = Router();
export const notificationsRouter = Router();
export const activityRouter = Router();
export const reportsRouter = Router();

// ---------------- Dashboard (admin) ----------------
dashboardRouter.use(requireAuth, requireRole('admin'));

dashboardRouter.get('/summary', (_req, res) => {
  const today = todayStr();
  const totalEmployees = db.prepare("SELECT COUNT(*) c FROM users WHERE role='employee' AND status='active'").get().c;
  const present = db.prepare('SELECT COUNT(*) c FROM attendance WHERE work_date = ?').get(today).c;
  const onLeave = db.prepare(
    "SELECT COUNT(DISTINCT user_id) c FROM leaves WHERE status='approved' AND start_date <= ? AND end_date >= ?"
  ).get(today, today).c;
  const absent = Math.max(0, totalEmployees - present - onLeave);
  const pendingLeaves = db.prepare("SELECT COUNT(*) c FROM leaves WHERE status='pending'").get().c;

  // Last 14 days trend
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = todayStr(d);
    const c = db.prepare('SELECT COUNT(*) c FROM attendance WHERE work_date = ?').get(ds).c;
    const l = db.prepare(
      "SELECT COUNT(DISTINCT user_id) c FROM leaves WHERE status='approved' AND start_date <= ? AND end_date >= ?"
    ).get(ds, ds).c;
    trend.push({ date: ds, present: c, onLeave: l });
  }

  // Department headcount + presence today
  const departments = db.prepare(
    `SELECT d.name,
       COUNT(u.id) AS headcount,
       SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS present
     FROM departments d
     LEFT JOIN users u ON u.department_id = d.id AND u.role='employee' AND u.status='active'
     LEFT JOIN attendance a ON a.user_id = u.id AND a.work_date = ?
     GROUP BY d.id ORDER BY d.name`
  ).all(today);

  // Avg working hours this month
  const monthStart = today.slice(0, 8) + '01';
  const avg = db.prepare(
    'SELECT AVG(working_minutes) m FROM attendance WHERE work_date >= ? AND working_minutes IS NOT NULL'
  ).get(monthStart).m;

  res.json({
    totalEmployees, present, absent, onLeave, pendingLeaves,
    avgWorkingHours: avg ? Number((avg / 60).toFixed(1)) : 0,
    trend, departments,
  });
});

// ---------------- Notifications (all roles) ----------------
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(
        "SELECT * FROM notifications WHERE audience='admin' OR user_id = ? ORDER BY created_at DESC LIMIT 40"
      ).all(req.user.id)
    : db.prepare(
        "SELECT * FROM notifications WHERE audience='user' AND user_id = ? ORDER BY created_at DESC LIMIT 40"
      ).all(req.user.id);
  const unread = rows.filter((r) => !r.read).length;
  res.json({ notifications: rows, unread });
});

notificationsRouter.post('/read-all', (req, res) => {
  if (req.user.role === 'admin') {
    db.prepare("UPDATE notifications SET read = 1 WHERE audience='admin' OR user_id = ?").run(req.user.id);
  } else {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  }
  res.json({ ok: true });
});

// ---------------- Activity log (admin) ----------------
activityRouter.use(requireAuth, requireRole('admin'));
activityRouter.get('/', (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit) || 50);
  const rows = db.prepare(
    `SELECT al.*, u.name FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC LIMIT ?`
  ).all(limit);
  res.json({ activity: rows });
});

// ---------------- Reports (admin) ----------------
reportsRouter.use(requireAuth, requireRole('admin'));

function attendanceRows(from, to) {
  return db.prepare(
    `SELECT a.work_date, u.employee_code, u.name, d.name AS department,
       a.punch_in_at, a.punch_out_at, a.working_minutes,
       a.punch_in_lat, a.punch_in_lng, a.face_match_score
     FROM attendance a JOIN users u ON u.id = a.user_id
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE a.work_date >= ? AND a.work_date <= ?
     ORDER BY a.work_date DESC, u.name`
  ).all(from, to);
}

reportsRouter.get('/attendance.csv', (req, res) => {
  const { from = todayStr(), to = todayStr() } = req.query;
  const rows = attendanceRows(from, to).map((r) => ({
    ...r,
    hours: r.working_minutes != null ? (r.working_minutes / 60).toFixed(2) : '',
  }));
  const csv = toCsv(rows, [
    { key: 'work_date', label: 'Date' },
    { key: 'employee_code', label: 'Code' },
    { key: 'name', label: 'Employee' },
    { key: 'department', label: 'Department' },
    { key: 'punch_in_at', label: 'Punch in' },
    { key: 'punch_out_at', label: 'Punch out' },
    { key: 'hours', label: 'Hours' },
    { key: 'face_match_score', label: 'Face match score' },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance_${from}_${to}.csv"`);
  res.send(csv);
});

reportsRouter.get('/leaves.csv', (req, res) => {
  const rows = db.prepare(
    `SELECT l.created_at, u.employee_code, u.name, l.type, l.start_date, l.end_date,
       l.days, l.status, l.reason FROM leaves l JOIN users u ON u.id = l.user_id
     ORDER BY l.created_at DESC`
  ).all();
  const csv = toCsv(rows, [
    { key: 'created_at', label: 'Requested' },
    { key: 'employee_code', label: 'Code' },
    { key: 'name', label: 'Employee' },
    { key: 'type', label: 'Type' },
    { key: 'start_date', label: 'From' },
    { key: 'end_date', label: 'To' },
    { key: 'days', label: 'Days' },
    { key: 'status', label: 'Status' },
    { key: 'reason', label: 'Reason' },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leave_report.csv"');
  res.send(csv);
});

reportsRouter.get('/attendance.pdf', (req, res) => {
  const { from = todayStr(), to = todayStr() } = req.query;
  const rows = attendanceRows(from, to);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="attendance_${from}_${to}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);
  doc.fontSize(18).text('Attendance report', { continued: false });
  doc.fontSize(10).fillColor('#555').text(`Period: ${from} to ${to}  ·  Generated ${new Date().toLocaleString()}`);
  doc.moveDown(0.8);

  const cols = [70, 60, 110, 80, 55, 55, 40];
  const headers = ['Date', 'Code', 'Employee', 'Department', 'In', 'Out', 'Hrs'];
  const drawRow = (vals, bold = false) => {
    const y = doc.y;
    let x = doc.page.margins.left;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#111');
    vals.forEach((v, i) => {
      doc.text(String(v ?? ''), x, y, { width: cols[i], lineBreak: false });
      x += cols[i];
    });
    doc.moveDown(0.9);
  };
  drawRow(headers, true);
  doc.moveTo(doc.page.margins.left, doc.y - 4).lineTo(555, doc.y - 4).strokeColor('#999').stroke();

  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
  for (const r of rows) {
    if (doc.y > 760) { doc.addPage(); drawRow(headers, true); }
    drawRow([
      r.work_date, r.employee_code, r.name, r.department || '—',
      fmtTime(r.punch_in_at), fmtTime(r.punch_out_at),
      r.working_minutes != null ? (r.working_minutes / 60).toFixed(1) : '—',
    ]);
  }
  if (!rows.length) doc.font('Helvetica').fontSize(10).text('No attendance records in this period.');
  doc.end();
});
