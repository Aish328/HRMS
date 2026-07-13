import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db, { logActivity } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { publicUser } from './auth.js';
// employees data
const router = Router();
router.use(requireAuth, requireRole('admin'));

const employeeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Enter a valid email address.'),
  employeeCode: z.string().min(2, 'Employee code is required.'),
  departmentId: z.number().int().positive().nullable().optional(),
  designation: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  joinDate: z.string().optional().default(''),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  password: z.string().min(8, 'Password must be at least 8 characters.').optional(),
});

router.get('/departments', (_req, res) => {
  res.json({ departments: db.prepare('SELECT * FROM departments ORDER BY name').all() });
});

router.post('/departments', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Department name is too short.' });
  try {
    const info = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name);
    res.status(201).json({ department: { id: info.lastInsertRowid, name } });
  } catch {
    res.status(409).json({ error: 'A department with this name already exists.' });
  }
});

// List with search, department filter, pagination
router.get('/', (req, res) => {
  const { q = '', department = '', page = '1', pageSize = '10', status = '' } = req.query;
  const limit = Math.min(50, Math.max(1, parseInt(pageSize) || 10));
  const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

  let where = "WHERE u.role = 'employee'";
  const params = [];
  if (q) {
    where += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.employee_code LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (department) { where += ' AND u.department_id = ?'; params.push(Number(department)); }
  if (status) { where += ' AND u.status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...params).c;
  const rows = db.prepare(
    `SELECT u.*, d.name AS department FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     ${where} ORDER BY u.name LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ employees: rows.map(publicUser), total, page: Number(page), pageSize: limit });
});

router.post('/', (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const password = d.password || 'welcome123';
  try {
    const info = db.prepare(
      `INSERT INTO users (employee_code, name, email, password_hash, role, department_id,
        designation, phone, join_date, status)
       VALUES (?,?,?,?,'employee',?,?,?,?,?)`
    ).run(
      d.employeeCode.trim(), d.name.trim(), d.email.toLowerCase().trim(),
      bcrypt.hashSync(password, 10), d.departmentId || null,
      d.designation, d.phone, d.joinDate, d.status
    );
    logActivity(req.user.id, 'employee_create', `Added ${d.name} (${d.employeeCode})`, req.ip);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ employee: publicUser(user), initialPassword: d.password ? undefined : password });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'An employee with this email or code already exists.' });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found.' });

  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  db.prepare(
    `UPDATE users SET
      name = COALESCE(?, name), email = COALESCE(?, email),
      employee_code = COALESCE(?, employee_code),
      department_id = ?, designation = COALESCE(?, designation),
      phone = COALESCE(?, phone), join_date = COALESCE(?, join_date),
      status = COALESCE(?, status)
     WHERE id = ?`
  ).run(
    d.name ?? null, d.email ? d.email.toLowerCase() : null, d.employeeCode ?? null,
    d.departmentId !== undefined ? d.departmentId : existing.department_id,
    d.designation ?? null, d.phone ?? null, d.joinDate ?? null, d.status ?? null, id
  );
  if (d.password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(d.password, 10), id);
  }
  logActivity(req.user.id, 'employee_update', `Updated employee #${id}`, req.ip);
  const user = db.prepare(
    'SELECT u.*, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?'
  ).get(id);
  res.json({ employee: publicUser(user) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(id);
  if (!existing) return res.status(404).json({ error: 'Employee not found.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logActivity(req.user.id, 'employee_delete', `Deleted ${existing.name} (${existing.employee_code})`, req.ip);
  res.json({ ok: true });
});

export default router;
