import { Router } from 'express';
import { z } from 'zod';
import db, { logActivity, notify, transaction, recordApproval } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { daysBetweenInclusive } from '../utils/helpers.js';

const router = Router();
router.use(requireAuth);

const BALANCE_COLUMN = {
  casual: 'leave_balance_casual',
  sick: 'leave_balance_sick',
  earned: 'leave_balance_earned',
};

const APPROVALS_SQL = `
  SELECT la.*, u.name AS actor_name, u.designation AS actor_designation
  FROM leave_approvals la LEFT JOIN users u ON u.id = la.actor_id
  WHERE la.leave_id = ? ORDER BY la.created_at, la.id`;

function withApprovals(leave) {
  return { ...leave, approvals: db.prepare(APPROVALS_SQL).all(leave.id) };
}

const applySchema = z.object({
  type: z.enum(['casual', 'sick', 'earned', 'unpaid']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick an end date.'),
  reason: z.string().min(5, 'Add a short reason (at least 5 characters).').max(500),
});

// ---- Employee: apply (goes to manager first, or straight to HR if no manager) ----
router.post('/', (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { type, startDate, endDate, reason } = parsed.data;

  if (endDate < startDate) return res.status(400).json({ error: 'End date must be on or after the start date.' });
  const days = daysBetweenInclusive(startDate, endDate);
  if (days > 30) return res.status(400).json({ error: 'A single request cannot exceed 30 days.' });

  const overlap = db.prepare(
    `SELECT id FROM leaves WHERE user_id = ? AND status IN ('pending','pending_hr','approved')
       AND NOT (end_date < ? OR start_date > ?)`
  ).get(req.user.id, startDate, endDate);
  if (overlap) return res.status(409).json({ error: 'You already have a leave request overlapping these dates.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (type !== 'unpaid' && user[BALANCE_COLUMN[type]] < days) {
    return res.status(400).json({ error: `Not enough ${type} leave balance (${user[BALANCE_COLUMN[type]]} left, ${days} requested).` });
  }

  // If the employee has a manager, the request starts at the manager stage.
  const initialStatus = user.manager_id ? 'pending' : 'pending_hr';

  const info = db.prepare(
    'INSERT INTO leaves (user_id, type, start_date, end_date, days, reason, status) VALUES (?,?,?,?,?,?,?)'
  ).run(req.user.id, type, startDate, endDate, days, reason, initialStatus);
  const leaveId = Number(info.lastInsertRowid);

  recordApproval(leaveId, req.user.id, 'employee', 'submitted', reason);
  logActivity(req.user.id, 'leave_apply', `${type} leave ${startDate} → ${endDate} (${days}d)`, req.ip);

  if (user.manager_id) {
    notify({
      userId: user.manager_id, audience: 'user',
      title: `Leave request from ${req.user.name}`,
      body: `${type} leave, ${startDate} to ${endDate} (${days} day${days > 1 ? 's' : ''}) — awaiting your approval.`,
      kind: 'leave',
    });
  }
  notify({
    audience: 'admin',
    title: `Leave request from ${req.user.name}`,
    body: `${type} leave, ${startDate} to ${endDate}${user.manager_id ? ' — at manager stage.' : ' — awaiting HR decision.'}`,
    kind: 'leave',
  });
  notify({
    userId: req.user.id, audience: 'user',
    title: 'Leave request submitted',
    body: user.manager_id ? 'Sent to your manager for approval.' : 'Sent to HR for approval.',
    kind: 'leave',
  });

  res.status(201).json({ leave: withApprovals(db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)) });
});

// ---- Employee: my leaves (with approval timeline) ----
router.get('/mine', (req, res) => {
  const rows = db.prepare('SELECT * FROM leaves WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  res.json({ leaves: rows.map(withApprovals) });
});

// ---- Employee: cancel own request ----
router.post('/:id/cancel', (req, res) => {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  if (!['pending', 'pending_hr', 'changes_requested'].includes(leave.status)) {
    return res.status(400).json({ error: 'Only requests that are still in progress can be cancelled.' });
  }
  db.prepare("UPDATE leaves SET status = 'cancelled' WHERE id = ?").run(leave.id);
  recordApproval(leave.id, req.user.id, 'employee', 'cancelled');
  res.json({ ok: true });
});

// ---- Manager: pending requests from my direct reports ----
router.get('/team', (req, res) => {
  const rows = db.prepare(
    `SELECT l.*, u.name, u.employee_code FROM leaves l
     JOIN users u ON u.id = l.user_id
     WHERE u.manager_id = ? AND l.status = 'pending'
     ORDER BY l.created_at DESC`
  ).all(req.user.id);
  res.json({ leaves: rows.map(withApprovals) });
});

// ---- Manager: decide ----
router.post('/:id/manager-decision', (req, res) => {
  const schema = z.object({
    decision: z.enum(['approved', 'rejected', 'changes']),
    note: z.string().max(300).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(Number(req.params.id));
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });

  const requester = db.prepare('SELECT manager_id, name FROM users WHERE id = ?').get(leave.user_id);
  if (!requester || requester.manager_id !== req.user.id) {
    return res.status(403).json({ error: 'You are not the reporting manager for this employee.' });
  }
  if (leave.status !== 'pending') return res.status(400).json({ error: 'This request is not at the manager stage.' });

  const { decision, note } = parsed.data;
  const nextStatus = decision === 'approved' ? 'pending_hr'
    : decision === 'rejected' ? 'rejected' : 'changes_requested';

  db.prepare(
    `UPDATE leaves SET status = ?, manager_status = ?, manager_decided_by = ?,
       manager_decided_at = datetime('now'), manager_note = ? WHERE id = ?`
  ).run(nextStatus, decision, req.user.id, note, leave.id);

  const action = decision === 'changes' ? 'changes_requested' : decision;
  recordApproval(leave.id, req.user.id, 'manager', action, note);
  logActivity(req.user.id, 'leave_manager_decision', `${decision} leave #${leave.id}`, req.ip);

  const titles = {
    approved: 'Manager approved your leave',
    rejected: 'Manager rejected your leave',
    changes: 'Manager requested changes to your leave',
  };
  notify({
    userId: leave.user_id, audience: 'user',
    title: titles[decision],
    body: `${leave.type} leave (${leave.start_date} to ${leave.end_date}).${note ? ' Note: ' + note : ''}${decision === 'approved' ? ' Now awaiting HR approval.' : ''}`,
    kind: 'leave',
  });
  if (decision === 'approved') {
    notify({
      audience: 'admin',
      title: `Manager approval completed — ${requester.name}`,
      body: `${leave.type} leave (${leave.start_date} to ${leave.end_date}) now awaits your HR decision.`,
      kind: 'leave',
    });
  }

  res.json({ leave: withApprovals(db.prepare('SELECT * FROM leaves WHERE id = ?').get(leave.id)) });
});

// ---- Admin: list ----
router.get('/', requireRole('admin'), (req, res) => {
  const { status = '', q = '', page = '1', pageSize = '15' } = req.query;
  const limit = Math.min(100, parseInt(pageSize) || 15);
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND l.status = ?'; params.push(status); }
  if (q) { where += ' AND (u.name LIKE ? OR u.employee_code LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const countBase = `FROM leaves l JOIN users u ON u.id = l.user_id ${where}`;
  const total = db.prepare(`SELECT COUNT(*) AS c ${countBase}`).get(...params).c;
  const rows = db.prepare(
    `SELECT l.*, u.name, u.employee_code, m.name AS manager_name
     FROM leaves l JOIN users u ON u.id = l.user_id
     LEFT JOIN users m ON m.id = u.manager_id
     ${where}
     ORDER BY CASE l.status WHEN 'pending_hr' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, l.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  res.json({ leaves: rows.map(withApprovals), total, page: Number(page), pageSize: limit });
});

// ---- Admin (HR): final decision — only at pending_hr ----
router.post('/:id/decision', requireRole('admin'), (req, res) => {
  const schema = z.object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().max(300).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(Number(req.params.id));
  if (!leave) return res.status(404).json({ error: 'Leave request not found.' });
  if (leave.status !== 'pending_hr') {
    return res.status(400).json({
      error: leave.status === 'pending'
        ? 'This request is still awaiting the manager. It reaches HR after manager approval.'
        : 'This request was already decided.',
    });
  }

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

  recordApproval(leave.id, req.user.id, 'hr', decision, note);
  logActivity(req.user.id, 'leave_decision', `${decision} leave #${leave.id}`, req.ip);
  notify({
    userId: leave.user_id, audience: 'user',
    title: `HR ${decision} your leave`,
    body: `Your ${leave.type} leave (${leave.start_date} to ${leave.end_date}) is now ${decision}.${note ? ' Note: ' + note : ''}`,
    kind: 'leave',
  });

  res.json({ leave: withApprovals(db.prepare('SELECT * FROM leaves WHERE id = ?').get(leave.id)) });
});

export default router;
