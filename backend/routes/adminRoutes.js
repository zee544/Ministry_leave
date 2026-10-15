const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const pool = require('../config/db');
const { verifyToken, requireAdmin, requireHOD } = require('../middleware/auth');

const {
  sendActingOfficerAssignedEmail,
  sendAdminAwaitingApprovalEmail,
  sendEmployeeDeclinedByActingOfficerEmail,
  sendHodAwaitingFinalApprovalEmail,
  sendEmployeeDeclinedByAdminEmail,
  sendFinalApprovalEmails,
  sendEmployeeDeclinedByHodEmail,
  sendActingOfficerCancelledEmail,
  sendAdminNewLeaveEmail,   // ⭐ NEW — added for direct-to-admin case
} = require('../utils/leaveEmails');

async function sendEmailNotification(send, label) {
  try {
    await send();
    return true;
  } catch (error) {
    console.error(`[Email] ${label} notification failed (${error.code || 'UNKNOWN'}).`);
    return false;
  }
}

function sendEmailNotificationInBackground(send, label) {
  setImmediate(() => {
    void sendEmailNotification(send, label);
  });
}

// ============================================
// HOLIDAY API HELPER
// ============================================
const holidayCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchHolidaysForYear(year) {
  const cached = holidayCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.dates;
  }

  try {
    const res = await axios.get('https://induwara.lk/api/v1/holidays', {
      params: { year, type: 'public' },
      timeout: 6000,
    });

    if (!res.data?.ok || !res.data?.data?.holidays) {
      throw new Error('Unexpected holiday API response shape');
    }

    const dates = new Set(
      res.data.data.holidays
        .filter((h) => h.public === true)
        .map((h) => h.date)
    );

    holidayCache.set(year, { dates, fetchedAt: Date.now() });
    console.log(`[Holiday API] Cached ${dates.size} public holidays for ${year}`);
    return dates;
  } catch (err) {
    console.error(`[Holiday API] Failed for ${year}:`, err.message);
    if (cached) return cached.dates;
    return new Set();
  }
}

async function getHolidaysBetween(fromDate, toDate) {
  const startYear = new Date(fromDate).getFullYear();
  const endYear = new Date(toDate).getFullYear();
  const all = new Set();

  const yearHolidaysList = await Promise.all(
    Array.from({ length: Math.max(0, endYear - startYear + 1) }, (_, index) =>
      fetchHolidaysForYear(startYear + index)
    )
  );
  for (const yearHolidays of yearHolidaysList) {
    for (const d of yearHolidays) {
      if (d >= fromDate && d <= toDate) all.add(d);
    }
  }
  return all;
}

async function computeWorkingDays(fromDate, toDate) {
  const fromStr = fromDate instanceof Date
    ? fromDate.toISOString().split('T')[0]
    : fromDate;
  const toStr = toDate instanceof Date
    ? toDate.toISOString().split('T')[0]
    : toDate;

  const holidaySet = await getHolidaysBetween(fromStr, toStr);

  const start = new Date(fromStr);
  const end = new Date(toStr);
  const toKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !holidaySet.has(toKey(cur))) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days > 0 ? days : 0.5;
}

// ============================================
// PUBLIC / AUTHENTICATED ROUTES
// ============================================

router.get('/holidays', verifyToken, async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

  try {
    const dates = await fetchHolidaysForYear(year);
    return res.status(200).json({
      year,
      holidays: Array.from(dates).sort(),
      supported: dates.size > 0,
    });
  } catch (error) {
    console.error('[Holiday API] /holidays route error:', error);
    return res.status(500).json({ message: 'Failed to fetch holidays.' });
  }
});

router.get('/employees/acting-officers', verifyToken, async (req, res) => {
  const division = req.user.division;
  const userId = req.user.id;

  try {
    const [rows] = await pool.query(
      `SELECT id, name, designation, division, email, status
       FROM employees
       WHERE division = ? AND status = 'Active' AND id != ?
       ORDER BY name ASC`,
      [division, userId]
    );

    console.log(`[API] Fetched ${rows.length} acting officers for division: ${division}`);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[API Error] /employees/acting-officers:', error);
    return res.status(500).json({ message: 'Failed to fetch acting officers.' });
  }
});

// ============================================
// CREATE LEAVE
// ============================================
router.post('/leaves', verifyToken, async (req, res) => {
  const { type, fromDate, toDate, actingOfficer, reason, address } = req.body;
  const applicantRole = req.user.role;
  const applicantId = req.user.id;

  if (!['employee', 'admin'].includes(applicantRole)) {
    return res.status(403).json({ message: 'Only employees and admins can submit leave applications.' });
  }
  // ⭐ actingOfficer is now OPTIONAL for employees
  if (!type || !fromDate || !toDate) {
    return res.status(400).json({ message: 'All required fields must be filled.' });
  }

  try {
    const profileTable = applicantRole === 'admin' ? 'admins' : 'employees';
    const profileQuery = pool.query(
      `SELECT name, division FROM ${profileTable} WHERE id = ? LIMIT 1`,
      [applicantId]
    );
    const workingDaysQuery = type === 'Half-day'
      ? Promise.resolve(0.5)
      : computeWorkingDays(fromDate, toDate);
    const [[profiles], noOfDays] = await Promise.all([profileQuery, workingDaysQuery]);
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Applicant profile not found.' });
    }
    const applicant = profiles[0];
    const employee = applicant.name;
    const division = applicant.division;
    const appliedBy = applicant.name;

    // ⭐ Decide acting officer + status
    const hasActingOfficer =
      applicantRole === 'employee' &&
      Boolean(actingOfficer && String(actingOfficer).trim());
    const assignedActingOfficer = hasActingOfficer ? actingOfficer : null;

    const status = applicantRole === 'admin'
      ? 'Admin Approved'
      : (hasActingOfficer ? 'Pending Acting Officer' : 'Pending');

    const today = new Date().toISOString().split('T')[0];

    const [result] = await pool.query(
      `INSERT INTO leaves 
       (employee, division, type, from_date, to_date, no_of_days, acting_officer,
        applicant_user_id, applicant_role, status, applied_by, applied_on, reason, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee, division, type, fromDate, toDate, noOfDays, assignedActingOfficer,
        applicantId, applicantRole, status, appliedBy, today, reason, address,
      ]
    );

    console.log(`[API] New leave created: ${result.insertId} for ${employee} (${noOfDays} day(s)) — status: ${status}`);

    const leaveEmailData = {
      employee,
      division,
      type,
      from: fromDate,
      to: toDate,
      noOfDays,
      reason,
      address,
    };

    // ⭐ Email routing — 3 cases
    sendEmailNotificationInBackground(
      () => {
        if (applicantRole === 'admin') {
          // Admin leave → HOD direct
          return sendHodAwaitingFinalApprovalEmail(leaveEmailData);
        }
        if (hasActingOfficer) {
          // Employee + acting officer → notify acting officer
          return sendActingOfficerAssignedEmail(leaveEmailData, assignedActingOfficer);
        }
        // Employee + no acting officer → notify Admin directly
        return sendAdminNewLeaveEmail(leaveEmailData);
      },
      applicantRole === 'admin'
        ? 'HOD direct approval request'
        : hasActingOfficer
          ? 'Acting officer assignment'
          : 'Admin new leave request'
    );

    return res.status(201).json({
      message: applicantRole === 'admin'
        ? 'Leave application submitted successfully. Awaiting HOD approval.'
        : hasActingOfficer
          ? 'Leave application submitted successfully. Awaiting acting officer confirmation.'
          : 'Leave application submitted successfully. Awaiting admin approval.',
      leaveId: result.insertId,
      status,
      noOfDays,
      emailSent: null,
      emailQueued: true,
    });
  } catch (error) {
    console.error('[Admin API Error] POST /leaves:', error);
    return res.status(500).json({ message: 'Failed to submit leave application.' });
  }
});

// ============================================
// ACTING OFFICER CONFIRM / DECLINE
// ============================================
router.put('/leaves/:id/acting-confirm', verifyToken, async (req, res) => {
  const leaveId = req.params.id;
  const { action, reason } = req.body;
  const actingOfficer = req.user.name;

  if (!action || (action !== 'confirm' && action !== 'decline')) {
    return res.status(400).json({
      success: false,
      message: 'Action must be "confirm" or "decline".'
    });
  }

  try {
    const [leave] = await pool.query('SELECT * FROM leaves WHERE id = ?', [leaveId]);

    if (leave.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave record not found.' });
    }

    const leaveData = leave[0];

    if (leaveData.applicant_role === 'admin' || leaveData.acting_officer !== actingOfficer) {
      return res.status(403).json({
        success: false,
        message: 'You are not the assigned acting officer for this leave.'
      });
    }

    if (leaveData.status !== 'Pending Acting Officer') {
      return res.status(400).json({
        success: false,
        message: `This leave is not awaiting acting officer confirmation. Current status: ${leaveData.status}`
      });
    }

    const newStatus = action === 'confirm' ? 'Pending' : 'Declined';
    const declinedBy = action === 'decline' ? 'Acting Officer' : null;
    const confirmed = action === 'confirm' ? 1 : 0;
    const finalDeclineReason = (action === 'decline' && reason) ? reason.trim() : null;

    const [result] = await pool.query(
      `UPDATE leaves 
       SET status = ?, 
           acting_officer_confirmed = ?, 
           declined_by = ?,
           decline_reason = ?
       WHERE id = ? AND status = 'Pending Acting Officer'`,
      [newStatus, confirmed, declinedBy, finalDeclineReason, leaveId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        success: false,
        message: 'This leave request has already been processed.',
      });
    }

    const [updatedLeave] = await pool.query('SELECT * FROM leaves WHERE id = ?', [leaveId]);

    const emailLeave = {
      employee: leaveData.employee,
      division: leaveData.division,
      type: leaveData.type,
      from: leaveData.from_date?.toISOString?.().split('T')[0] || leaveData.from_date,
      to: leaveData.to_date?.toISOString?.().split('T')[0] || leaveData.to_date,
      noOfDays: leaveData.no_of_days,
      actingOfficer: actingOfficer,
      reason: leaveData.reason,
    };

    const emailSent = await sendEmailNotification(
      () => action === 'confirm'
        ? sendAdminAwaitingApprovalEmail(emailLeave, actingOfficer)
        : sendEmployeeDeclinedByActingOfficerEmail(emailLeave, actingOfficer, reason),
      action === 'confirm' ? 'Admin approval request' : 'Acting officer decline'
    );

    return res.status(200).json({
      success: true,
      message: `Leave ${action === 'confirm' ? 'confirmed' : 'declined'} by acting officer.`,
      id: leaveId,
      status: newStatus,
      leave: updatedLeave[0],
      emailSent,
    });
  } catch (error) {
    console.error('[Acting API Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process acting officer confirmation.',
      error: error.message
    });
  }
});

// ============================================
// EMPLOYEE CANCEL ROUTE
// ============================================
/**
 * @route   PUT /api/admin/leaves/:id/cancel
 * @desc    Employee cancels their own leave request
 *          ✅ Sets status to "Cancelled" + saves reason
 *          ✅ Visible to Employee, Admin, Acting Officer, HOD
 */
router.put('/leaves/:id/cancel', verifyToken, async (req, res) => {
  const leaveId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;
  const { reason } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM leaves WHERE id = ?', [leaveId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave record not found.'
      });
    }

    const leave = rows[0];

    if (
      Number(leave.applicant_user_id) !== Number(userId) ||
      leave.applicant_role !== userRole
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own leave requests.'
      });
    }

    if (leave.status !== 'Pending' && leave.status !== 'Pending Acting Officer') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel leave with status "${leave.status}". Only pending leaves can be cancelled.`
      });
    }

    const cancelReason = reason ? reason.trim() : null;

    await pool.query(
      `UPDATE leaves 
       SET status = 'Cancelled',
           declined_by = 'Employee',
           decline_reason = ?
       WHERE id = ? AND applicant_user_id = ? AND applicant_role = ?`,
      [cancelReason, leaveId, userId, userRole]
    );

    console.log(`[API] Leave ${leaveId} cancelled by user ${userId} (${userRole}). Reason: ${cancelReason || '—'}`);

    // ✅ Email to Acting Officer — "no action needed" (only if acting officer exists)
    const emailLeave = {
      employee: leave.employee,
      division: leave.division,
      type: leave.type,
      from: leave.from_date?.toISOString?.().split('T')[0] || leave.from_date,
      to: leave.to_date?.toISOString?.().split('T')[0] || leave.to_date,
      noOfDays: leave.no_of_days,
      actingOfficer: leave.acting_officer,
    };

    const emailSent = leave.acting_officer
      ? await sendEmailNotification(
        () => sendActingOfficerCancelledEmail(emailLeave, cancelReason),
        'Acting officer cancellation'
      )
      : null;

    return res.status(200).json({
      success: true,
      message: 'Leave request cancelled successfully.',
      id: leaveId,
      status: 'Cancelled',
      reason: cancelReason,
      emailSent,
    });
  } catch (error) {
    console.error('[Cancel API Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel leave request.'
    });
  }
});

// ============================================
// EMPLOYEE LIST
// ============================================
router.get('/leaves/employee', verifyToken, async (req, res) => {
  const applicantId = req.user.id;
  const applicantRole = req.user.role;

  try {
    const [rows] = await pool.query(
      `SELECT 
        id, employee, division, type,
        applicant_user_id as applicantUserId,
        applicant_role as applicantRole,
        DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
        DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
        no_of_days as noOfDays,
        acting_officer as actingOfficer,
        status, applied_by as appliedBy,
        DATE_FORMAT(applied_on, '%Y-%m-%d') as appliedOn,
        reason, address,
        recommended_by_admin as recommendedByAdmin,
        declined_by as declinedBy,
        decline_reason as declineReason,
        acting_officer_confirmed
       FROM leaves
       WHERE applicant_user_id = ? AND applicant_role = ?
       ORDER BY applied_on DESC, id DESC`,
      [applicantId, applicantRole]
    );

    console.log(`[Employee API] Fetched ${rows.length} leaves for user ${applicantId} (${applicantRole})`);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Employee API Error] /leaves/employee:', error);
    return res.status(500).json({ message: 'Failed to retrieve employee leave records.' });
  }
});

// ============================================
// ACTING OFFICER LIST
// ============================================
router.get('/leaves/acting-officer', verifyToken, async (req, res) => {
  const actingOfficerName = req.user.name;

  try {
    const [rows] = await pool.query(
      `SELECT 
        id, employee, division, type,
        applicant_user_id as applicantUserId,
        applicant_role as applicantRole,
        DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
        DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
        no_of_days as noOfDays,
        acting_officer as actingOfficer,
        status, applied_by as appliedBy,
        DATE_FORMAT(applied_on, '%Y-%m-%d') as appliedOn,
        reason, address,
        recommended_by_admin as recommendedByAdmin,
        declined_by as declinedBy,
        decline_reason as declineReason,
        acting_officer_confirmed
       FROM leaves 
       WHERE LOWER(TRIM(acting_officer)) = LOWER(TRIM(?))
       ORDER BY applied_on DESC, id DESC`,
      [actingOfficerName]
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Acting Officer API Error]:', error);
    return res.status(500).json({ message: 'Failed to fetch acting officer leaves.' });
  }
});

// ============================================
// HOD LIST
// ============================================
router.get('/hod/leaves', verifyToken, requireHOD, async (req, res) => {
  const division = req.user.division;

  try {
    const [rows] = await pool.query(
      `SELECT 
        id, employee, division, type,
        applicant_user_id as applicantUserId,
        applicant_role as applicantRole,
        DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
        DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
        no_of_days as noOfDays,
        acting_officer as actingOfficer,
        status, applied_by as appliedBy,
        DATE_FORMAT(applied_on, '%Y-%m-%d') as appliedOn,
        reason, address,
        recommended_by_admin as recommendedByAdmin,
        declined_by as declinedBy,
        decline_reason as declineReason,
        acting_officer_confirmed
       FROM leaves WHERE division = ?
       ORDER BY applied_on DESC, id DESC`,
      [division]
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[HOD API Error] /hod/leaves:', error);
    return res.status(500).json({ message: 'Failed to retrieve HOD leave records.' });
  }
});

// ============================================
// HOD APPROVE / DECLINE
// ============================================
router.put('/leaves/:id/hod-approve', verifyToken, requireHOD, async (req, res) => {
  const division = req.user.division;
  const leaveId = req.params.id;
  const { action, reason } = req.body;

  if (!action || (action !== 'approve' && action !== 'decline')) {
    return res.status(400).json({ message: 'Action must be "approve" or "decline".' });
  }

  try {
    const [check] = await pool.query(
      `SELECT id, status, applicant_user_id as applicantUserId,
              applicant_role as applicantRole, applied_by as appliedBy,
              employee, division, type,
              DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
              DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
              no_of_days as noOfDays, acting_officer as actingOfficer,
              reason, address
       FROM leaves WHERE id = ? AND division = ?`,
      [leaveId, division]
    );

    if (check.length === 0) {
      return res.status(404).json({
        message: 'Leave record not found or does not belong to your division.',
      });
    }

    const currentStatus = check[0].status;
    if (currentStatus !== 'Admin Approved') {
      return res.status(409).json({
        message: `Cannot process leave with status "${currentStatus}". Only "Admin Approved" leaves can be finalized by HOD.`,
      });
    }

    if (
      (check[0].applicantRole === req.user.role &&
        Number(check[0].applicantUserId) === Number(req.user.id)) ||
      (check[0].applicantUserId == null && check[0].appliedBy === req.user.name)
    ) {
      return res.status(403).json({ message: 'You cannot approve or reject your own leave request.' });
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Declined';
    const declinedBy = action === 'decline' ? 'HOD' : null;
    const finalDeclineReason = (action === 'decline' && reason) ? reason.trim() : null;

    const [result] = await pool.query(
      `UPDATE leaves 
       SET status = ?, 
           declined_by = ?,
           decline_reason = ?
       WHERE id = ? AND division = ? AND status = 'Admin Approved'`,
      [newStatus, declinedBy, finalDeclineReason, leaveId, division]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: 'This leave request has already been processed.',
      });
    }

    const emailLeave = check[0];
    sendEmailNotificationInBackground(
      () => action === 'approve'
        ? sendFinalApprovalEmails(emailLeave)
        : sendEmployeeDeclinedByHodEmail(emailLeave, reason),
      action === 'approve' ? 'Final approval' : 'HOD decline'
    );

    return res.status(200).json({
      message: `Leave ${action === 'approve' ? 'approved' : 'declined'} by HOD successfully.`,
      id: leaveId,
      status: newStatus,
      emailSent: null,
      emailQueued: true,
    });
  } catch (error) {
    console.error('[HOD API Error] /leaves/:id/hod-approve:', error);
    return res.status(500).json({ message: 'Failed to process HOD approval.' });
  }
});

// ============================================
// EMPLOYEE UPDATE OWN LEAVE
// ============================================
router.put('/leaves/:id', verifyToken, async (req, res) => {
  const leaveId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  const { type, from, to, reason, address, actingOfficer } = req.body;

  if (role !== 'employee') {
    return res.status(403).json({
      success: false,
      message: 'Only employees can edit their leave requests.',
    });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM leaves WHERE id = ?', [leaveId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave record not found.' });
    }

    const leave = rows[0];

    if (
      Number(leave.applicant_user_id) !== Number(userId) ||
      leave.applicant_role !== role
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own leave requests.',
      });
    }

    if (leave.status !== 'Pending' && leave.status !== 'Pending Acting Officer') {
      return res.status(400).json({
        success: false,
        message: `Cannot edit leave with status "${leave.status}". Only pending leaves can be edited.`,
      });
    }

    const finalType = type || leave.type;
    const finalFrom = from || leave.from_date;
    const finalTo = to || leave.to_date;

    let computedDays;
    if (finalType === 'Half-day') {
      computedDays = 0.5;
    } else if (finalFrom && finalTo) {
      computedDays = await computeWorkingDays(finalFrom, finalTo);
    }

    await pool.query(
      `UPDATE leaves
       SET type = COALESCE(?, type),
           from_date = COALESCE(?, from_date),
           to_date = COALESCE(?, to_date),
           no_of_days = COALESCE(?, no_of_days),
           reason = COALESCE(?, reason),
           address = COALESCE(?, address),
           acting_officer = COALESCE(?, acting_officer)
       WHERE id = ? AND applicant_user_id = ? AND applicant_role = ?`,
      [
        type || null,
        from || null,
        to || null,
        computedDays || null,
        reason !== undefined ? reason : null,
        address !== undefined ? address : null,
        actingOfficer || null,
        leaveId,
        userId,
        role,
      ]
    );

    const [updated] = await pool.query(
      `SELECT 
        id, employee, division, type,
        applicant_user_id as applicantUserId,
        applicant_role as applicantRole,
        DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
        DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
        no_of_days as noOfDays,
        acting_officer as actingOfficer,
        status, applied_by as appliedBy,
        DATE_FORMAT(applied_on, '%Y-%m-%d') as appliedOn,
        reason, address,
        recommended_by_admin as recommendedByAdmin,
        declined_by as declinedBy,
        decline_reason as declineReason,
        acting_officer_confirmed
       FROM leaves WHERE id = ?`,
      [leaveId]
    );

    return res.status(200).json({
      success: true,
      message: 'Leave request updated successfully.',
      leave: updated[0],
    });
  } catch (error) {
    console.error('[Admin API Error] PUT /leaves/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update leave request.',
    });
  }
});

// ============================================
// ADMIN-ONLY ROUTES
// ============================================
router.use(verifyToken, requireAdmin);

router.get('/dashboard-stats', async (req, res) => {
  const division = req.user.division;

  try {
    const [empCount] = await pool.query('SELECT COUNT(*) as count FROM employees WHERE division = ?', [division]);
    const [pendingCount] = await pool.query('SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = "Pending"', [division]);
    const [awaitingHodCount] = await pool.query('SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = "Admin Approved"', [division]);
    const [approvedCount] = await pool.query('SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = "Approved"', [division]);
    const [actingCount] = await pool.query('SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = "Pending Acting Officer"', [division]);

    return res.status(200).json({
      division,
      totalEmployees: empCount[0].count,
      pendingLeaves: pendingCount[0].count,
      awaitingHodLeaves: awaitingHodCount[0].count,
      approvedLeaves: approvedCount[0].count,
      pendingActingOfficer: actingCount[0].count,
    });
  } catch (error) {
    console.error('[Admin API Error] /dashboard-stats:', error);
    return res.status(500).json({ message: 'Failed to fetch division statistics.' });
  }
});

router.get('/leaves', async (req, res) => {
  const division = req.user.division;

  try {
    const [rows] = await pool.query(
      `SELECT 
        id, employee, division, type,
        applicant_user_id as applicantUserId,
        applicant_role as applicantRole,
        DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
        DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
        no_of_days as noOfDays,
        acting_officer as actingOfficer,
        status, applied_by as appliedBy,
        DATE_FORMAT(applied_on, '%Y-%m-%d') as appliedOn,
        reason, address,
        recommended_by_admin as recommendedByAdmin,
        declined_by as declinedBy,
        decline_reason as declineReason,
        acting_officer_confirmed
       FROM leaves WHERE division = ?
       ORDER BY applied_on DESC, id DESC`,
      [division]
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Admin API Error] /leaves:', error);
    return res.status(500).json({ message: 'Failed to retrieve division leave records.' });
  }
});

router.put('/leaves/:id/status', async (req, res) => {
  const division = req.user.division;
  const leaveId = req.params.id;
  const { status, reason } = req.body;

  if (!status) return res.status(400).json({ message: 'New status is required.' });

  try {
    const [check] = await pool.query(
      'SELECT id, status, applicant_role as applicantRole FROM leaves WHERE id = ? AND division = ?',
      [leaveId, division]
    );

    if (check.length === 0) {
      return res.status(404).json({
        message: 'Leave record not found or does not belong to your division.',
      });
    }

    if (check[0].applicantRole === 'admin') {
      return res.status(403).json({
        message: 'Admin leave requests can only be approved or rejected by the HOD of their division.',
      });
    }

    const currentStatus = check[0].status;
    if (currentStatus !== 'Pending') {
      return res.status(400).json({
        message: `Cannot update leave with status "${currentStatus}". Only "Pending" leaves can be pre-approved.`,
      });
    }

    if (status !== 'Admin Approved' && status !== 'Declined') {
      return res.status(400).json({
        message: 'Admin can only set status to "Admin Approved" or "Declined".',
      });
    }

    const finalDeclineReason = (status === 'Declined' && reason) ? reason.trim() : null;
    const finalDeclinedBy = status === 'Declined' ? 'Admin' : null;

    const [result] = await pool.query(
      `UPDATE leaves 
       SET status = ?, 
           recommended_by_admin = ?,
           declined_by = ?,
           decline_reason = ?
       WHERE id = ? AND division = ? AND status = 'Pending'`,
      [
        status,
        status === 'Admin Approved' ? 1 : 0,
        finalDeclinedBy,
        finalDeclineReason,
        leaveId,
        division
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: 'This leave request has already been processed.',
      });
    }

    const [emailLeaveRows] = await pool.query(
      `SELECT employee, division, type,
        DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
        DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
        no_of_days as noOfDays,
        acting_officer as actingOfficer,
        reason, address
       FROM leaves WHERE id = ?`,
      [leaveId]
    );

    let emailSent = null;
    if (emailLeaveRows.length > 0) {
      const emailLeave = emailLeaveRows[0];

      if (status === 'Admin Approved') {
        emailSent = await sendEmailNotification(
          () => sendHodAwaitingFinalApprovalEmail(emailLeave),
          'HOD final approval request'
        );
      } else if (status === 'Declined') {
        emailSent = await sendEmailNotification(
          () => sendEmployeeDeclinedByAdminEmail(emailLeave, reason),
          'Admin decline'
        );
      }
    }

    console.log(`[Admin API] Leave ${leaveId} updated successfully to ${status}`);
    return res.status(200).json({
      message: `Leave status updated to "${status}" successfully.`,
      id: leaveId,
      status,
      emailSent,
    });
  } catch (error) {
    console.error('[Admin API Error] /leaves/:id/status:', error);
    return res.status(500).json({ message: 'Failed to update leave record.' });
  }
});

router.get('/employees', async (req, res) => {
  const division = req.user.division;

  try {
    const [rows] = await pool.query(
      `SELECT 
        id, name, designation, division, email,
        DATE_FORMAT(appointment_date, '%Y-%m-%d') as appointment_date,
        status
       FROM employees WHERE division = ?
       ORDER BY name ASC`,
      [division]
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Admin API Error] /employees:', error);
    return res.status(500).json({ message: 'Failed to fetch division employees.' });
  }
});


router.post('/employees', verifyToken, requireAdmin, async (req, res) => {
    const division = req.user.division;
    const { name, designation, email, appointment_date, password } = req.body;

    // Required fields
    if (!name?.trim() || !email?.trim() || !division) {
        return res.status(400).json({
            message: 'Name, division, and email are required.'
        });
    }

    try {
        const rawPassword =
            password && password.trim()
                ? password.trim()
                : 'Ministry@123';

        if (rawPassword.length < 6) {
            return res.status(400).json({
                message: 'Password must be at least 6 characters.'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPassword, salt);

        const [result] = await pool.query(
            `INSERT INTO employees
            (name, designation, division, email, password, appointment_date, status)
            VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
            [
                name.trim(),
                designation?.trim() || null,
                division,
                email.trim(),
                hashedPassword,
                appointment_date || null
            ]
        );

        return res.status(201).json({
            message: 'Employee registered successfully in division.',
            employee: {
                id: result.insertId,
                name: name.trim(),
                designation: designation?.trim() || null,
                division,
                email: email.trim(),
                appointment_date: appointment_date || null,
                status: 'Active'
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'An employee with this email already exists.'
            });
        }

        console.error('[Admin API Error] POST /employees:', error);

        return res.status(500).json({
            message: 'Failed to create employee.'
        });
    }
});


router.put('/employees/:id', async (req, res) => {
  const division = req.user.division;
  const empId = req.params.id;
  const { name, designation, email, appointment_date, status } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE employees 
       SET name = COALESCE(?, name), 
           designation = COALESCE(?, designation), 
           email = COALESCE(?, email), 
           appointment_date = COALESCE(?, appointment_date), 
           status = COALESCE(?, status) 
       WHERE id = ? AND division = ?`,
      [name, designation, email, appointment_date, status, empId, division]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Employee not found or does not belong to your assigned division.',
      });
    }

    return res.status(200).json({ message: 'Employee updated successfully.' });
  } catch (error) {
    console.error('[Admin API Error] PUT /employees/:id:', error);
    return res.status(500).json({ message: 'Failed to update employee.' });
  }
});

router.patch('/employees/:id/status', async (req, res) => {
  const division = req.user.division;
  const empId = req.params.id;

  try {
    const [result] = await pool.query(
      `UPDATE employees 
       SET status = CASE WHEN status = 'Active' THEN 'Inactive' ELSE 'Active' END 
       WHERE id = ? AND division = ?`,
      [empId, division]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Employee not found or does not belong to your assigned division.',
      });
    }

    return res.status(200).json({ message: 'Employee status toggled successfully.' });
  } catch (error) {
    console.error('[Admin API Error] PATCH /employees/:id/status:', error);
    return res.status(500).json({ message: 'Failed to update employee status.' });
  }
});

router.get('/divisions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, code FROM divisions ORDER BY name ASC');
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Admin API Error] /divisions:', error);
    return res.status(500).json({ message: 'Failed to fetch divisions list.' });
  }
});

module.exports = router;