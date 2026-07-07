// Seeds the database with an admin, departments, 8 employees, 30 days of
// attendance and a handful of leave requests. Safe to re-run: it wipes tables.
import bcrypt from 'bcryptjs';
import db, { todayStr } from './db.js';

console.log('Seeding HRMS database…');

db.exec('DELETE FROM notifications; DELETE FROM activity_log; DELETE FROM leaves; DELETE FROM attendance; DELETE FROM users; DELETE FROM departments;');

const insDept = db.prepare('INSERT INTO departments (name) VALUES (?)');
const deptIds = {};
for (const d of ['Engineering', 'Operations', 'Sales', 'Human Resources', 'Finance']) {
  deptIds[d] = insDept.run(d).lastInsertRowid;
}

const hash = (p) => bcrypt.hashSync(p, 10);
const insUser = db.prepare(
  `INSERT INTO users (employee_code, name, email, password_hash, role, department_id, designation, phone, join_date)
   VALUES (?,?,?,?,?,?,?,?,?)`
);

insUser.run('ADM001', 'Priya Sharma', 'admin@company.com', hash('admin123'), 'admin', deptIds['Human Resources'], 'HR Manager', '+91 98100 00001', '2021-04-01');

const employees = [
  ['EMP001', 'Arjun Mehta', 'arjun@company.com', 'Engineering', 'Senior Developer', '2022-01-10'],
  ['EMP002', 'Sneha Iyer', 'sneha@company.com', 'Engineering', 'Frontend Developer', '2022-06-15'],
  ['EMP003', 'Rahul Verma', 'rahul@company.com', 'Operations', 'Operations Lead', '2021-09-01'],
  ['EMP004', 'Ananya Gupta', 'ananya@company.com', 'Sales', 'Account Executive', '2023-02-20'],
  ['EMP005', 'Vikram Singh', 'vikram@company.com', 'Sales', 'Sales Manager', '2020-11-05'],
  ['EMP006', 'Kavya Nair', 'kavya@company.com', 'Finance', 'Accountant', '2023-07-03'],
  ['EMP007', 'Rohan Das', 'rohan@company.com', 'Engineering', 'DevOps Engineer', '2022-10-12'],
  ['EMP008', 'Meera Pillai', 'meera@company.com', 'Human Resources', 'HR Executive', '2024-01-08'],
];

const empIds = [];
for (const [code, name, email, dept, desig, join] of employees) {
  const id = insUser.run(code, name, email, hash('emp123'), 'employee', deptIds[dept], desig, '+91 98100 00000', join).lastInsertRowid;
  empIds.push(id);
}

// 30 days of attendance around Gurugram (28.45, 77.02) with realistic jitter
const insAtt = db.prepare(
  `INSERT INTO attendance (user_id, work_date, punch_in_at, punch_in_lat, punch_in_lng,
     punch_out_at, punch_out_lat, punch_out_lng, face_match_score, liveness_passed, working_minutes)
   VALUES (?,?,?,?,?,?,?,?,?,1,?)`
);

const rand = (a, b) => a + Math.random() * (b - a);
for (let i = 29; i >= 0; i--) {
  const d = new Date(); d.setDate(d.getDate() - i);
  if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
  const ds = todayStr(d);
  for (const uid of empIds) {
    if (Math.random() < 0.12) continue; // ~12% absent
    const inH = 9 + rand(-0.5, 1.0);
    const punchIn = new Date(d); punchIn.setHours(Math.floor(inH), Math.floor((inH % 1) * 60), 0, 0);
    const lat = 28.45 + rand(-0.02, 0.02);
    const lng = 77.02 + rand(-0.02, 0.02);
    const isToday = i === 0;
    const punchedOut = !isToday || Math.random() < 0.3;
    let outIso = null, mins = null, olat = null, olng = null, score = null;
    if (punchedOut) {
      const workMin = Math.round(rand(7.5, 9.5) * 60);
      const out = new Date(punchIn.getTime() + workMin * 60000);
      outIso = out.toISOString(); mins = workMin;
      olat = lat + rand(-0.003, 0.003); olng = lng + rand(-0.003, 0.003);
      score = Number(rand(0.62, 0.95).toFixed(3));
    }
    insAtt.run(uid, ds, punchIn.toISOString(), lat, lng, outIso, olat, olng, score, mins);
  }
}

// Leave requests
const insLeave = db.prepare(
  `INSERT INTO leaves (user_id, type, start_date, end_date, days, reason, status, decided_by, decided_at)
   VALUES (?,?,?,?,?,?,?,?,?)`
);
const future = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayStr(d); };
const past = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return todayStr(d); };

insLeave.run(empIds[0], 'casual', future(3), future(4), 2, 'Family function out of town.', 'pending', null, null);
insLeave.run(empIds[1], 'sick', past(6), past(5), 2, 'Viral fever, doctor advised rest.', 'approved', 1, past(6));
insLeave.run(empIds[3], 'earned', future(10), future(14), 5, 'Planned vacation with family.', 'pending', null, null);
insLeave.run(empIds[4], 'casual', past(12), past(12), 1, 'Personal errand.', 'rejected', 1, past(12));
insLeave.run(empIds[6], 'sick', todayStr(), future(1), 2, 'Migraine, unable to travel.', 'approved', 1, past(1));

db.prepare("UPDATE users SET leave_balance_sick = leave_balance_sick - 2 WHERE id = ?").run(empIds[1]);
db.prepare("UPDATE users SET leave_balance_sick = leave_balance_sick - 2 WHERE id = ?").run(empIds[6]);

db.prepare('INSERT INTO notifications (audience, title, body, kind) VALUES (?,?,?,?)')
  .run('admin', 'Welcome to your HRMS', 'Sample data is loaded. Explore the dashboard to get started.', 'system');

console.log('Done. Sign in with:');
console.log('  Admin    → admin@company.com / admin123');
console.log('  Employee → arjun@company.com / emp123 (any EMP account, same password)');
