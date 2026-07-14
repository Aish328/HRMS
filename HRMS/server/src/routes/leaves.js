import { Router } from 'express';
import { z } from 'zod';
import db, { logActivity, notify, transaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { daysBetweenInclusive } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth);

const BALANCE_COLUMN = {
  casual: 'leave_balance_casual',
  sick: 'leave_balance_sick',
  earned: 'leave_balance_earned',
};

const applySchema = z.object({
  type: z.enum(['casual', 'sick', 'earned', 'unpaid']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date.'),
  reason: z.string().min(5, 'Add a short reason (at least 5 characters).').max(500),
});

// ---- Employee: apply ----
router.post('/', (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { type, startDate, endDate, reason } = parsed.data;

  if (endDate < startDate) return res.status(400).json({ error: 'End date must be on or after the start date.' });
  const days = daysBetweenInclusive(startDate, endDate);
  if (days > 30) return res.status(400).json({ error: 'A single request cannot exceed 30 days.' });

  const overlap = db.prepare(
    `SELECT id FROM leaves WHERE user_id = ? AND status IN ('pending','approved')
       AND NOT (end_date < ? OR start_date > ?)`
  ).get(req.user.id, startDate, endDate);
  if (overlap) return res.status(409).json({ error: 'You already have a leave request overlapping these dates.' });

  if (type !== 'unpaid') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (user[BALANCE_COLUMN[type]] < days) {
      return res.status(400).json({ error: `Not enough ${type} leave balance (${user[BALANCE_COLUMN[type]]} left, ${days} requested).` });
    }
  }

  const info = db.prepare(
    'INSERT INTO leaves (user_id, type, start_date, end_date, days, reason) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, type, startDate, endDate, days, reason);

  logActivity(req.user.id, 'leave_apply', `${type} leave ${startDate} → ${endDate} (${days}d)`, req.ip);
  notify({
    audience: 'admin',
    title: `Leave request from ${req.user.name}`,
    body: `${type} leave, ${startDate} to ${endDate} (${days} day${days > 1 ? 's' : ''})`,
    kind: 'leave',
  });

  res.status(201).json({ leave: db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid) });
});

// ---- Employee: my leaves ----
router.get('/mine', (req, res) => {
  const rows = db.prepare('SELECT * FROM leaves WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  res.json({ leaves: rows });
});

// ---- Employee: cancel own pending request ----
router.post('/:id/cancel', (req, res) => {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled.' });
  db.prepare("UPDATE leaves SET status = 'cancelled' WHERE id = ?").run(leave.id);
  res.json({ ok: true });
});

// ---- Admin: list with filters ----
router.get('/', requireRole('admin'), (req, res) => {
  const { status = '', q = '', page = '1', pageSize = '15' } = req.query;
  const limit = Math.min(100, parseInt(pageSize) || 15);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND l.status = ?'; params.push(status); }
  if (q) { where += ' AND (u.name LIKE ? OR u.employee_code LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const base = `FROM leaves l JOIN users u ON u.id = l.user_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS c ${base}`).get(...params).c;
  const rows = db.prepare(
    `SELECT l.*, u.name, u.employee_code ${base} ORDER BY
       CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  res.json({ leaves: rows, total, page: Number(page), pageSize: limit });
});

// ---- Admin: approve / reject ----
router.post('/:id/decision', requireRole('admin'), (req, res) => {
  const schema = z.object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().max(300).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(Number(req.params.id));
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  if (leave.status !== 'pending') return res.status(400).json({ error: 'This request was already decided.' });

  const { decision, note } = parsed.data;

  transaction(() => {
    db.prepare(
      "UPDATE leaves SET status = ?, decided_by = ?, decided_at = datetime('now'), admin_note = ? WHERE id = ?"
    ).run(decision, req.user.id, note, leave.id);

    if (decision === 'approved' && leave.type !== 'unpaid') {
      const col = BALANCE_COLUMN[leave.type];
      db.prepare(`UPDATE users SET ${col} = MAX(0, ${col} - ?) WHERE id = ?`).run(leave.days, leave.user_id);
    }
  });

  logActivity(req.user.id, 'leave_decision', `${decision} leave #${leave.id}`, req.ip);
  notify({
    userId: leave.user_id,
    title: `Leave ${decision}`,
    body: `Your ${leave.type} leave (${leave.start_date} to ${leave.end_date}) was ${decision}.${note ? ' Note: ' + note : ''}`,
    kind: 'leave',
  });

  res.json({ leave: db.prepare('SELECT * FROM leaves WHERE id = ?').get(leave.id) });
});

export default router;
