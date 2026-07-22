import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db, { logActivity } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

router.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { email, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account is inactive. Contact your HR admin.' });
  }
  logActivity(user.id, 'login', `Signed in as ${user.role}`, req.ip);
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    `SELECT u.*, d.name AS department FROM users u
     LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  const reportCount = db.prepare("SELECT COUNT(*) c FROM users WHERE manager_id = ? AND status = 'active'").get(user.id).c;
  const manager = user.manager_id
    ? db.prepare('SELECT id, name, designation FROM users WHERE id = ?').get(user.manager_id)
    : null;
  res.json({ user: { ...publicUser(user), isManager: reportCount > 0, manager } });
});

router.post('/change-password', requireAuth, (req, res) => {
  const schema = z.object({
    current: z.string().min(1),
    next: z.string().min(8, 'New password must be at least 8 characters.'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(parsed.data.current, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(parsed.data.next, 10), user.id);
  logActivity(user.id, 'password_change', 'Password updated', req.ip);
  res.json({ ok: true });
});

export function publicUser(u) {
  return {
    id: u.id,
    employeeCode: u.employee_code,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.department_id,
    department: u.department || null,
    designation: u.designation,
    phone: u.phone,
    joinDate: u.join_date,
    status: u.status,
    managerId: u.manager_id ?? null,
    leaveBalance: {
      casual: u.leave_balance_casual,
      sick: u.leave_balance_sick,
      earned: u.leave_balance_earned,
      comp: u.leave_balance_comp ?? 0,
    },
  };
}

export default router;
