import { Router } from 'express';
import { z } from 'zod';
import db, { logActivity, todayStr } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Walk up the manager chain from `startId`; returns true if `targetId` is found.
// Used to prevent circular reporting (A → B → A).
function chainContains(startId, targetId) {
  let current = startId;
  const seen = new Set();
  while (current != null && !seen.has(current)) {
    if (current === targetId) return true;
    seen.add(current);
    const row = db.prepare('SELECT manager_id FROM users WHERE id = ?').get(current);
    current = row ? row.manager_id : null;
  }
  return false;
}

// ---- Org chart tree (visible to everyone signed in) ----
router.get('/chart', (_req, res) => {
  const users = db.prepare(
    `SELECT u.id, u.name, u.employee_code, u.designation, u.manager_id, u.role,
       u.project, u.company, d.name AS department
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.status = 'active' ORDER BY u.name`
  ).all();

  // Build tree: roots are users with no manager (or whose manager is inactive/missing)
  const byId = new Map(users.map((u) => [u.id, { ...u, reports: [] }]));
  const roots = [];
  for (const u of byId.values()) {
    if (u.manager_id && byId.has(u.manager_id)) byId.get(u.manager_id).reports.push(u);
    else roots.push(u);
  }
  res.json({ roots, count: users.length });
});

// ---- Reporting chain for one employee (self-service) ----
router.get('/chain/:id', (req, res) => {
  const chain = [];
  let current = Number(req.params.id);
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const u = db.prepare(
      `SELECT u.id, u.name, u.designation, u.manager_id, d.name AS department
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
    ).get(current);
    if (!u) break;
    chain.push(u);
    current = u.manager_id;
  }
  res.json({ chain });
});

// ---- Admin: assign / change / remove a manager ----
router.put('/manager/:id', requireRole('admin'), (req, res) => {
  const schema = z.object({ managerId: z.number().int().positive().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'managerId must be a user id or null.' });

  const employeeId = Number(req.params.id);
  const { managerId } = parsed.data;

  const employee = db.prepare('SELECT id, name FROM users WHERE id = ?').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });

  if (managerId != null) {
    if (managerId === employeeId) return res.status(400).json({ error: 'An employee cannot report to themselves.' });
    const manager = db.prepare("SELECT id, name FROM users WHERE id = ? AND status = 'active'").get(managerId);
    if (!manager) return res.status(404).json({ error: 'Manager not found or inactive.' });
    // Circular check: the proposed manager's chain must not contain the employee
    if (chainContains(managerId, employeeId)) {
      return res.status(400).json({ error: `Circular reporting: ${manager.name} already reports (directly or indirectly) to ${employee.name}.` });
    }
  }

  db.prepare('UPDATE users SET manager_id = ? WHERE id = ?').run(managerId, employeeId);
  logActivity(req.user.id, 'org_change', `Set manager of ${employee.name} to ${managerId ?? 'none'}`, req.ip);
  res.json({ ok: true });
});


// ============ Org tree node CRUD (admin) ============
import bcrypt from 'bcryptjs';

function nextEmployeeCode() {
  const row = db.prepare(
    "SELECT employee_code FROM users WHERE employee_code LIKE 'EMP%' ORDER BY CAST(SUBSTR(employee_code, 4) AS INTEGER) DESC LIMIT 1"
  ).get();
  const n = row ? parseInt(row.employee_code.slice(3)) + 1 : 1;
  return 'EMP' + String(n).padStart(3, '0');
}

function uniqueEmail(name) {
  const base = name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.');
  let email = `${base}@company.com`;
  let i = 1;
  while (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    email = `${base}${i++}@company.com`;
  }
  return email;
}

const nodeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.').max(80),
  designation: z.string().min(2, 'Add a designation.').max(80),
  project: z.string().max(80).optional().default(''),
  company: z.string().max(120).optional().default('Sharika Enterprises Limited'),
  managerId: z.number().int().positive().nullable().optional(),
});

// Add a new member as a child node under a manager
router.post('/node', requireRole('admin'), (req, res) => {
  const parsed = nodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { name, designation, project, company, managerId } = parsed.data;

  if (managerId != null) {
    const mgr = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").get(managerId);
    if (!mgr) return res.status(404).json({ error: 'Parent node (manager) not found.' });
  }

  const code = nextEmployeeCode();
  const email = uniqueEmail(name);
  const info = db.prepare(
    `INSERT INTO users (employee_code, name, email, password_hash, role, designation, project, company, manager_id, join_date)
     VALUES (?,?,?,?,'employee',?,?,?,?,date('now'))`
  ).run(code, name, email, bcrypt.hashSync('welcome123', 10), designation, project, company, managerId ?? null);

  logActivity(req.user.id, 'org_node_add', `Added ${name} (${designation}) under manager ${managerId ?? 'root'}`, req.ip);
  res.status(201).json({
    ok: true,
    member: { id: Number(info.lastInsertRowid), employee_code: code, email, tempPassword: 'welcome123' },
  });
});

// Edit a member node (name / designation / project / company / manager)
router.put('/node/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Member not found.' });

  const parsed = nodeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;

  if (data.managerId !== undefined && data.managerId !== null) {
    if (data.managerId === id) return res.status(400).json({ error: 'A member cannot report to themselves.' });
    if (chainContains(data.managerId, id)) {
      return res.status(400).json({ error: 'Circular reporting is not allowed.' });
    }
  }

  db.prepare(
    `UPDATE users SET
       name = COALESCE(?, name),
       designation = COALESCE(?, designation),
       project = COALESCE(?, project),
       company = COALESCE(?, company),
       manager_id = CASE WHEN ? = 1 THEN ? ELSE manager_id END
     WHERE id = ?`
  ).run(
    data.name ?? null, data.designation ?? null, data.project ?? null, data.company ?? null,
    data.managerId !== undefined ? 1 : 0, data.managerId ?? null, id
  );

  logActivity(req.user.id, 'org_node_edit', `Edited node ${user.name}`, req.ip);
  res.json({ ok: true });
});

// Remove a node — children are promoted to the removed node's manager
router.delete('/node/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Member not found.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be removed from the tree.' });

  const children = db.prepare('SELECT COUNT(*) c FROM users WHERE manager_id = ?').get(id).c;

  // Promote children up one level, then delete the user (cascades attendance/leaves)
  db.prepare('UPDATE users SET manager_id = ? WHERE manager_id = ?').run(user.manager_id ?? null, id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);

  logActivity(req.user.id, 'org_node_remove', `Removed ${user.name}; ${children} report(s) promoted`, req.ip);
  res.json({ ok: true, promoted: children });
});

// ---- Holidays ----
router.get('/holidays', (req, res) => {
  const upcomingOnly = req.query.upcoming === '1';
  const rows = upcomingOnly
    ? db.prepare('SELECT * FROM holidays WHERE date >= ? ORDER BY date LIMIT 6').all(todayStr())
    : db.prepare('SELECT * FROM holidays ORDER BY date').all();
  res.json({ holidays: rows });
});

router.post('/holidays', requireRole('admin'), (req, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string().min(2).max(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a valid date and name.' });
  try {
    db.prepare('INSERT INTO holidays (date, name) VALUES (?,?)').run(parsed.data.date, parsed.data.name);
    res.status(201).json({ ok: true });
  } catch {
    res.status(409).json({ error: 'A holiday already exists on this date.' });
  }
});

router.delete('/holidays/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM holidays WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
