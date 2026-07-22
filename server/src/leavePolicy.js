/*
 * Leave policy engine — Phase 1
 * ------------------------------------------------------------------
 * Implements the company's approved leave policy:
 *   - Financial-year basis (default Apr–Mar, configurable in leave_settings)
 *   - Quotas: CL 8, SL 7, EL 15 (configurable)
 *   - Pro-rata accrual from date of joining for mid-year joiners
 *   - Year-end: CL/SL lapse (no carry-forward); EL carries forward up to a max,
 *     capped at a balance ceiling, and any excess is flagged for payroll encashment
 *
 * No salary or money is handled here — EL excess is only *flagged* (days), and
 * Payroll multiplies by Basic Salary elsewhere.
 */
import db, { getLeaveSettings } from './db.js';

// ---- Financial-year helpers ----

// Returns the FY label (e.g. "2026-2027") that a given date falls in.
export function fyLabelFor(date, fyStartMonth = 4) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  const startYear = m >= fyStartMonth ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

// Current financial year label.
export function currentFyLabel(fyStartMonth = 4) {
  return fyLabelFor(new Date(), fyStartMonth);
}

// The Date on which a FY starts, for a given FY label.
export function fyStartDate(fyLabel, fyStartMonth = 4) {
  const startYear = Number(fyLabel.split('-')[0]);
  return new Date(startYear, fyStartMonth - 1, 1);
}

/**
 * Pro-rata quota for an employee for the CURRENT financial year.
 * Full quota if they joined before this FY; proportional (by whole months
 * remaining, inclusive of joining month) if they joined during it.
 */
export function proRataQuota(fullQuota, joinDateStr, fyStartMonth = 4) {
  const settings = getLeaveSettings();
  const startMonth = fyStartMonth || settings.fy_start_month;
  const fyStart = fyStartDate(currentFyLabel(startMonth), startMonth);
  const fyEndExclusive = new Date(fyStart.getFullYear() + 1, fyStart.getMonth(), 1);

  if (!joinDateStr) return fullQuota;
  const join = new Date(joinDateStr + (joinDateStr.length === 10 ? 'T00:00:00' : ''));

  // Joined before this FY started → full quota.
  if (join <= fyStart) return fullQuota;
  // Joined after this FY (shouldn't happen) → 0.
  if (join >= fyEndExclusive) return 0;

  // Whole months from joining month through FY end (inclusive).
  const monthsTotal = 12;
  const monthsElapsedBeforeJoin =
    (join.getFullYear() - fyStart.getFullYear()) * 12 + (join.getMonth() - fyStart.getMonth());
  const monthsRemaining = monthsTotal - monthsElapsedBeforeJoin;
  const prorated = (fullQuota * monthsRemaining) / monthsTotal;
  // Round to nearest half day (leave is granted in 0.5 steps).
  return Math.round(prorated * 2) / 2;
}

/**
 * Grant/refresh CURRENT-FY balances for one user (used at rollout and for new
 * joiners). CL/SL are set to pro-rata quota; EL is set to pro-rata quota PLUS
 * any carried-forward EL passed in (capped). Comp-off untouched (Phase 2).
 */
export function grantCurrentFyBalances(userId, { carryForwardEl = 0 } = {}) {
  const s = getLeaveSettings();
  const user = db.prepare('SELECT id, join_date FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const cl = proRataQuota(s.cl_quota, user.join_date, s.fy_start_month);
  const sl = proRataQuota(s.sl_quota, user.join_date, s.fy_start_month);
  let el = proRataQuota(s.el_quota, user.join_date, s.fy_start_month) + carryForwardEl;
  if (el > s.el_balance_cap) el = s.el_balance_cap; // hard ceiling

  db.prepare(
    `UPDATE users SET leave_balance_casual = ?, leave_balance_sick = ?, leave_balance_earned = ? WHERE id = ?`
  ).run(cl, sl, el, userId);

  return { cl, sl, el };
}

/**
 * Year-end roll: for every user, lapse CL/SL, carry EL forward up to the
 * carry-forward max, then grant the new FY's pro-rata quotas on top (capped),
 * and flag any EL that would exceed the cap for payroll encashment.
 *
 * This is designed to be run once at FY end (manual HR action or a scheduled
 * job). It records encashment flags under the CLOSING FY label.
 */
export function runYearEndRoll() {
  const s = getLeaveSettings();
  const closingFy = currentFyLabel(s.fy_start_month);
  const users = db.prepare('SELECT id, join_date, leave_balance_earned FROM users').all();

  const flagStmt = db.prepare(
    `INSERT OR REPLACE INTO el_encashment_flags (user_id, fy_label, days) VALUES (?,?,?)`
  );

  const results = [];
  db.exec('BEGIN');
  try {
    for (const u of users) {
      const el = u.leave_balance_earned || 0;
      // Carry forward up to the max; anything above the carry-forward max is
      // flagged for encashment (paid out rather than carried).
      const carried = Math.min(el, s.el_carry_forward_max);
      const excess = Math.max(0, el - s.el_carry_forward_max);
      if (excess > 0) flagStmt.run(u.id, closingFy, excess);

      // Grant next FY balances (CL/SL fresh, EL = new quota + carried, capped).
      const granted = grantCurrentFyBalances(u.id, { carryForwardEl: carried });
      results.push({ userId: u.id, carried, encashFlagged: excess, granted });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { closingFy, count: results.length, results };
}
