const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const pool = require('../config/db');
const { broadcastNotification } = require('./notificationsStream');
const { verifyToken, requireAdmin, requireHOD, requireAdminOrHOD } = require('../middleware/auth');

const {
  sendActingOfficerAssignedEmail,
  sendAdminAwaitingApprovalEmail,
  sendEmployeeDeclinedByActingOfficerEmail,
  sendHodAwaitingFinalApprovalEmail,
  sendEmployeeDeclinedByAdminEmail,
  sendFinalApprovalEmails,
  sendEmployeeDeclinedByHodEmail,
  sendActingOfficerCancelledEmail,
  sendAdminNewLeaveEmail,
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

  return days;
}


// ============================================
// WORKFLOW & BASE QUERY HELPERS
// ============================================
const LEAVE_BASE_QUERY = `
  SELECT
    l.id,
    l.employee,
    l.division,
    l.type,
    l.applicant_user_id AS applicantUserId,
    l.applicant_role AS applicantRole,
    DATE_FORMAT(l.from_date, '%Y-%m-%d') AS \`from\`,
    DATE_FORMAT(l.to_date, '%Y-%m-%d') AS \`to\`,
    l.no_of_days AS noOfDays,
    l.acting_officer AS actingOfficer,
    l.status,
    l.applied_by AS appliedBy,
    DATE_FORMAT(l.applied_on, '%Y-%m-%d') AS appliedOn,
    l.reason,
    l.address,
    l.recommended_by_admin AS recommendedByAdmin,
    l.declined_by AS declinedBy,
    l.decline_reason AS declineReason,
    l.acting_officer_confirmed AS acting_officer_confirmed,
    l.acting_officer_confirmed AS actingOfficerConfirmed,
    l.approved_by AS approvedBy,
    l.approver_role AS approverRole,
    l.approved_by_id AS approvedById,
    l.target_approver_id AS targetApproverId,
    l.target_approver_role AS targetApproverRole,
    l.target_approver_email AS targetApproverEmail,
    COALESCE(
      l.approver_signature,
      (SELECT h.signature_image FROM hod h WHERE h.id = l.approved_by_id LIMIT 1),
      (SELECT h.signature_image FROM hod h WHERE LOWER(CONVERT(h.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approved_by_id IS NULL LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE s.id = l.approved_by_id LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE LOWER(CONVERT(s.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approved_by_id IS NULL LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE a.id = l.approved_by_id LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE LOWER(CONVERT(a.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approved_by_id IS NULL LIMIT 1)
    ) AS approverSignature,
    COALESCE(
      l.admin_signature,
      (SELECT a.signature_image FROM admins a WHERE LOWER(CONVERT(a.division USING utf8mb4)) = LOWER(CONVERT(l.division USING utf8mb4)) LIMIT 1)
    ) AS adminSignature,
    COALESCE(
      l.applicant_signature,
      (SELECT e.signature_image FROM employees e WHERE e.id = l.applicant_user_id AND l.applicant_role = 'employee' LIMIT 1),
      (SELECT h.signature_image FROM hod h WHERE h.id = l.applicant_user_id AND l.applicant_role = 'hod' LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE a.id = l.applicant_user_id AND l.applicant_role = 'admin' LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE s.id = l.applicant_user_id AND l.applicant_role = 'secretary' LIMIT 1)
    ) AS applicantSignature,
    COALESCE(
      l.acting_officer_signature,
      (SELECT e.signature_image FROM employees e WHERE LOWER(CONVERT(e.name USING utf8mb4)) = LOWER(CONVERT(l.acting_officer USING utf8mb4)) LIMIT 1)
    ) AS actingOfficerSignature
  FROM leaves l
`;

async function resolveWorkflow(applicantRole, applicantId, applicantEmail, division) {
  try {
    const [rules] = await pool.query(
      `SELECT * FROM approval_rules
       WHERE rule_type = 'USER_HIERARCHY'
         AND (
           (applicant_id IS NOT NULL AND applicant_id = ? AND applicant_role = ?) OR
           (applicant_email IS NOT NULL AND applicant_email != '' AND LOWER(applicant_email) = LOWER(?)) OR
           (applicant_role = ? AND (applicant_id IS NULL OR applicant_id = 0) AND (applicant_email IS NULL OR applicant_email = '') AND (division IS NULL OR division = ?))
         )
       ORDER BY (applicant_id IS NOT NULL AND applicant_id = ?) DESC,
                (applicant_email IS NOT NULL AND applicant_email != '') DESC,
                id ASC
       LIMIT 1`,
      [applicantId || 0, applicantRole, applicantEmail || '', applicantRole, division || '', applicantId || 0]
    );

    if (rules.length > 0) {
      const r = rules[0];
      return {
        targetApproverRole: r.approver_role,
        targetApproverId: r.approver_id,
        targetApproverEmail: r.approver_email,
        requireAdminApproval: false,
      };
    }
  } catch (err) {
    console.warn('[Workflow] Warning checking approval_rules:', err.message);
  }

  let requireAdminApproval = true;
  if (division) {
    try {
      const [divRules] = await pool.query(
        `SELECT * FROM approval_rules WHERE rule_type = 'DIVISION_DEFAULT' AND division = ? LIMIT 1`,
        [division]
      );
      if (divRules.length > 0) {
        requireAdminApproval = Boolean(divRules[0].require_admin_approval);
      }

      const [adminsInDiv] = await pool.query(
        `SELECT id FROM admins WHERE division = ? LIMIT 1`,
        [division]
      );
      if (adminsInDiv.length === 0) {
        requireAdminApproval = false;
      }
    } catch (err) {
      console.warn('[Workflow] Warning checking division rules:', err.message);
    }
  }

  if (applicantRole === 'admin') {
    return {
      targetApproverRole: 'hod',
      targetApproverId: null,
      targetApproverEmail: null,
      requireAdminApproval: false,
    };
  }

  if (applicantRole === 'hod') {
    return {
      targetApproverRole: 'secretary',
      targetApproverId: null,
      targetApproverEmail: null,
      requireAdminApproval: false,
    };
  }

  if (applicantRole === 'executive_officer') {
    return {
      targetApproverRole: 'secretary',
      targetApproverId: null,
      targetApproverEmail: null,
      requireAdminApproval: false,
    };
  }

  if (applicantRole === 'secretary') {
    return {
      targetApproverRole: 'secretary',
      targetApproverId: null,
      targetApproverEmail: null,
      requireAdminApproval: false,
    };
  }

  return {
    targetApproverRole: 'hod',
    targetApproverId: null,
    targetApproverEmail: null,
    requireAdminApproval,
  };
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

router.get('/divisions', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, code FROM divisions ORDER BY name ASC');
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Divisions API Error]:', error);
    return res.status(500).json({ message: 'Failed to fetch divisions list.' });
  }
});

router.get('/employees/acting-officers', verifyToken, async (req, res) => {
  // ✅ Get the division directly from the logged-in user's token
  const division = req.user.division;

  if (!division) {
    return res.status(400).json({ message: 'User division not found in token.' });
  }

  try {
    // ✅ Fetch ONLY Active employees in THIS specific division
    const [rows] = await pool.query(
      `SELECT id, name, designation, division, email, status
       FROM employees
       WHERE TRIM(division) = TRIM(?) AND status = 'Active'
       ORDER BY name ASC`,
      [division]
    );

    console.log(`[API] Fetched ${rows.length} acting officers for division: ${division}`);
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[API Error] /employees/acting-officers:', error);
    return res.status(500).json({ message: 'Failed to fetch acting officers.' });
  }
});

// ============================================
// SECRETARY — READ ONLY (all divisions, all leaves)
// ============================================
router.get('/leaves/all', verifyToken, async (req, res) => {
  if (req.user.role !== 'secretary') {
    return res.status(403).json({ message: 'Only the Secretary can access this endpoint.' });
  }

  try {
    const [rows] = await pool.query(
      `${LEAVE_BASE_QUERY} ORDER BY l.applied_on DESC, l.id DESC`
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Secretary API] /leaves/all:', error);
    return res.status(500).json({ message: 'Failed to fetch leave records.' });
  }
});

// ============================================
// EXECUTIVE OFFICER — Division leaves
// ============================================
router.get('/leaves/division', verifyToken, async (req, res) => {
  if (req.user.role !== 'executive_officer') {
    return res.status(403).json({ message: 'Only Executive Officers can access this endpoint.' });
  }

  const division = req.user.division;

  try {
    const [rows] = await pool.query(
      `${LEAVE_BASE_QUERY} WHERE l.division = ? ORDER BY l.applied_on DESC, l.id DESC`,
      [division]
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[EO API] /leaves/division:', error);
    return res.status(500).json({ message: 'Failed to fetch division leave records.' });
  }
});

// ============================================
// ✅ EO APPROVE / DECLINE (MUST BE ABOVE ADMIN-ONLY ROUTES)
// ============================================
router.put('/leaves/:id/eo-approve', verifyToken, async (req, res) => {
  if (req.user.role !== 'executive_officer') {
    return res.status(403).json({ message: 'Only Executive Officers can perform this action.' });
  }

  const division = req.user.division;
  const leaveId = req.params.id;
  const { action, reason } = req.body;

  if (!['approve', 'decline'].includes(action)) {
    return res.status(400).json({ message: 'Action must be "approve" or "decline".' });
  }

  try {
    const [check] = await pool.query(
      `SELECT id, status,
              applicant_role as applicantRole,
              applicant_user_id as applicantUserId,
              employee, division, type,
              DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
              DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
              no_of_days as noOfDays,
              acting_officer as actingOfficer,
              reason, address
       FROM leaves WHERE id = ? AND division = ?`,
      [leaveId, division]
    );

    if (check.length === 0) {
      return res.status(404).json({ message: 'Leave record not found or does not belong to your division.' });
    }

    if (check[0].status !== 'Pending') {
      return res.status(409).json({
        message: `Cannot process leave with status "${check[0].status}". Only "Pending" leaves can be processed by Executive Officer.`,
      });
    }

    if (
      check[0].applicantRole === 'executive_officer' &&
      Number(check[0].applicantUserId) === Number(req.user.id)
    ) {
      return res.status(403).json({ message: 'You cannot approve or reject your own leave request.' });
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Declined';
    
    // ✅ FIX: Save the actual EO name for declines so the frontend can filter by EO
    const declinedBy = action === 'decline' ? (req.user.name || 'Executive Officer') : null;
    const declineReason = (action === 'decline' && reason) ? reason.trim() : null;
    const approvedBy = action === 'approve' ? (req.user.name || 'Executive Officer') : null;
    const approverRole = action === 'approve' ? 'executive_officer' : null;

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           declined_by = ?,
           decline_reason = ?,
           approved_by = ?,
           approver_role = ?
       WHERE id = ? AND division = ? AND status = 'Pending'`,
      [newStatus, declinedBy, declineReason, approvedBy, approverRole, leaveId, division]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ message: 'This leave request has already been processed.' });
    }

    const emailLeave = check[0];

    sendEmailNotificationInBackground(
      () => action === 'approve'
        ? sendFinalApprovalEmails(emailLeave)
        : sendEmployeeDeclinedByAdminEmail(emailLeave, reason),
      action === 'approve' ? 'EO final approval' : 'EO decline'
    );

    return res.status(200).json({
      message: `Leave ${action === 'approve' ? 'approved' : 'declined'} by Executive Officer successfully.`,
      id: leaveId,
      status: newStatus,
      approvedBy,
      approverRole,
      emailSent: null,
      emailQueued: true,
    });
  } catch (error) {
    console.error('[EO API] /leaves/:id/eo-approve:', error);
    return res.status(500).json({ message: 'Failed to process Executive Officer action.' });
  }
});

// ============================================
// SECRETARY — Approve / Decline EO leaves
// ============================================
router.put('/leaves/:id/secretary-approve', verifyToken, async (req, res) => {
  if (req.user.role !== 'secretary') {
    return res.status(403).json({ message: 'Only the Secretary can perform this action.' });
  }

  const leaveId = req.params.id;
  const { action, reason } = req.body;
  const userId = req.user.id;

  if (!['approve', 'decline'].includes(action)) {
    return res.status(400).json({ message: 'Action must be "approve" or "decline".' });
  }

  try {
    const [check] = await pool.query(
      `SELECT id, status,
              applicant_role as applicantRole,
              applicant_user_id as applicantUserId,
              employee, division, type,
              target_approver_role, target_approver_id,
              DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
              DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
              no_of_days as noOfDays,
              acting_officer as actingOfficer,
              reason, address
       FROM leaves WHERE id = ?`,
      [leaveId]
    );

    if (check.length === 0) {
      return res.status(404).json({ message: 'Leave record not found.' });
    }

    // Secretary cannot approve their own leave request
    if (check[0].applicantRole === 'secretary' && Number(check[0].applicantUserId) === Number(userId)) {
      return res.status(403).json({ message: 'You cannot approve or reject your own leave request.' });
    }

    // A user-scoped approval setting may target one Secretary. Keep the
    // legacy untargeted workflow available to any Secretary, but enforce an
    // explicit target at the API boundary as well as in the UI.
    if (
      check[0].target_approver_role === 'secretary' &&
      check[0].target_approver_id !== null &&
      Number(check[0].target_approver_id) !== Number(userId)
    ) {
      return res.status(403).json({ message: 'This leave request is assigned to another authorized Secretary.' });
    }

    if (check[0].status !== 'Pending') {
      return res.status(409).json({
        message: `Cannot process leave with status "${check[0].status}". Only "Pending" leaves can be processed.`,
      });
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Declined';
    const declinedBy = action === 'decline' ? (req.user.name || 'Secretary') : null;
    const declineReason = (action === 'decline' && reason) ? reason.trim() : null;
    const approvedBy = action === 'approve' ? (req.user.name || 'Secretary') : null;
    const approverRole = action === 'approve' ? 'secretary' : null;
    const approvedById = action === 'approve' ? userId : null;

    let approverSignature = null;
    try {
      const [secRows] = await pool.query(
        `SELECT signature_image FROM secretary WHERE id = ? LIMIT 1`,
        [userId]
      );
      if (secRows.length > 0 && secRows[0].signature_image) {
        approverSignature = secRows[0].signature_image;
      }
    } catch (e) {}

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           declined_by = ?,
           decline_reason = ?,
           approved_by = ?,
           approver_role = ?,
           approved_by_id = ?,
           approver_signature = COALESCE(?, approver_signature)
       WHERE id = ? AND status = 'Pending'`,
      [newStatus, declinedBy, declineReason, approvedBy, approverRole, approvedById, approverSignature, leaveId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ message: 'This leave request has already been processed.' });
    }

    const emailLeave = check[0];

    sendEmailNotificationInBackground(
      () => action === 'approve'
        ? sendFinalApprovalEmails(emailLeave)
        : sendEmployeeDeclinedByAdminEmail(emailLeave, reason),
      action === 'approve' ? 'Secretary final approval' : 'Secretary decline'
    );

    return res.status(200).json({
      message: `Leave ${action === 'approve' ? 'approved' : 'declined'} by Secretary successfully.`,
      id: leaveId,
      status: newStatus,
      approvedBy,
      approverRole,
      emailSent: null,
      emailQueued: true,
    });
  } catch (error) {
    console.error('[Secretary API] /leaves/:id/secretary-approve:', error);
    return res.status(500).json({ message: 'Failed to process Secretary action.' });
  }
});

// ============================================
// CREATE LEAVE
// ============================================
router.post('/leaves', verifyToken, async (req, res) => {
  let { type, fromDate, toDate, actingOfficer, reason, address } = req.body;
  const applicantRole = req.user.role;
  const applicantId = req.user.id;

  if (!['employee', 'admin', 'hod', 'executive_officer', 'secretary'].includes(applicantRole)) {
    return res.status(403).json({
      message: 'Only employees, admins, HODs, Executive Officers, and Secretary can submit leave applications.',
    });
  }

  if (!type || !fromDate || !toDate) {
    return res.status(400).json({ message: 'All required fields must be filled.' });
  }

  if (type === 'Half-day') {
    if (!fromDate) {
      return res.status(400).json({ message: 'Half-day leave requires a date.' });
    }
    toDate = fromDate;
  }

  try {
    const profileTable =
      applicantRole === 'admin' ? 'admins' :
      applicantRole === 'hod' ? 'hod' :
      applicantRole === 'executive_officer' ? 'executive_officers' :
      applicantRole === 'secretary' ? 'secretary' :
      'employees';

    const profileQuery = pool.query(
      `SELECT id, name, email, ${applicantRole === 'secretary' ? "'Ministry' as division" : "COALESCE(division, 'Ministry') as division"}, signature_image FROM ${profileTable} WHERE id = ? LIMIT 1`,
      [applicantId]
    );
    const workingDaysQuery = type === 'Half-day'
      ? Promise.resolve(0.5)
      : computeWorkingDays(fromDate, toDate);
    const [[profiles], noOfDays] = await Promise.all([profileQuery, workingDaysQuery]);

    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Applicant profile not found.' });
    }

    if (type !== 'Half-day' && noOfDays === 0) {
      return res.status(400).json({
        message: 'The selected range contains no working days (weekends/holidays only).',
      });
    }

    const applicant = profiles[0];
    const employee = applicant.name;
    const division = applicant.division || req.user.division || 'Ministry';
    const appliedBy = applicant.name;
    const applicantEmail = applicant.email || req.user.email || '';
    const applicantSignature = applicant.signature_image || null;

    // Resolve configurable approval workflow
    const workflow = await resolveWorkflow(applicantRole, applicantId, applicantEmail, division);

    const hasActingOfficer = Boolean(actingOfficer && String(actingOfficer).trim() && String(actingOfficer).trim() !== '—');
    const assignedActingOfficer = hasActingOfficer ? actingOfficer.trim() : null;

    // Initial status
    const status = hasActingOfficer ? 'Pending Acting Officer' : 'Pending';
    const today = new Date().toISOString().split('T')[0];

    const needsTransaction = ['hod', 'executive_officer', 'secretary'].includes(applicantRole);

    let result;
    let notification;
    let connection;
    let transactionStarted = false;

    try {
      connection = needsTransaction ? await pool.getConnection() : pool;
      if (needsTransaction) {
        await connection.beginTransaction();
        transactionStarted = true;
      }

      [result] = await connection.query(
        `INSERT INTO leaves
         (employee, division, type, from_date, to_date, no_of_days, acting_officer,
          applicant_user_id, applicant_role, status, applied_by, applied_on, reason, address,
          target_approver_id, target_approver_role, target_approver_email, applicant_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee, division, type, fromDate, toDate, noOfDays, assignedActingOfficer,
          applicantId, applicantRole, status, appliedBy, today, reason, address,
          workflow.targetApproverId, workflow.targetApproverRole, workflow.targetApproverEmail, applicantSignature
        ]
      );

      // Notification to target approver
      if (workflow.targetApproverRole === 'secretary' && applicantRole !== 'secretary') {
        const secretaryQuery = workflow.targetApproverId
          ? `SELECT id, name FROM secretary WHERE id = ? LIMIT 1`
          : `SELECT id, name FROM secretary LIMIT 1`;
        const [secretaryRows] = await connection.query(
          secretaryQuery,
          workflow.targetApproverId ? [workflow.targetApproverId] : []
        );
        if (secretaryRows.length > 0) {
          const assignedSecretary = secretaryRows[0];
          const message = `${employee} (${applicantRole.toUpperCase()}) submitted a ${type} leave request (${fromDate} to ${toDate}) for ${division}.`;
          const [notificationResult] = await connection.query(
            `INSERT INTO notifications (message, type, recipient, division, link, read_status)
             VALUES (?, 'leave_application', ?, ?, '/secretarydashboard?tab=pending', 0)`,
            [message, assignedSecretary.name, division]
          );
          notification = {
            id: notificationResult.insertId,
            message,
            type: 'leave_application',
            recipient: assignedSecretary.name,
            division,
            link: '/secretarydashboard?tab=pending',
            read: false,
            timestamp: new Date().toISOString(),
          };
        }
      } else if (workflow.targetApproverId && workflow.targetApproverRole === 'hod') {
        const [targetHOD] = await connection.query(`SELECT name, division FROM hod WHERE id = ? LIMIT 1`, [workflow.targetApproverId]);
        if (targetHOD.length > 0) {
          const message = `${employee} submitted a ${type} leave request (${fromDate} to ${toDate}) awaiting your approval.`;
          const [notificationResult] = await connection.query(
            `INSERT INTO notifications (message, type, recipient, division, link, read_status)
             VALUES (?, 'leave_application', ?, ?, '/hoddashboard?tab=leaves', 0)`,
            [message, targetHOD[0].name, division]
          );
          notification = {
            id: notificationResult.insertId,
            message,
            type: 'leave_application',
            recipient: targetHOD[0].name,
            division,
            link: '/hoddashboard?tab=leaves',
            read: false,
            timestamp: new Date().toISOString(),
          };
        }
      }

      if (needsTransaction && transactionStarted) {
        await connection.commit();
        transactionStarted = false;
      }
    } catch (error) {
      if (transactionStarted && connection) await connection.rollback();
      throw error;
    } finally {
      if (needsTransaction && connection) connection.release();
    }

    if (notification) {
      try { broadcastNotification(notification); } catch (e) {
        console.warn('[Notifications] broadcast failed:', e.message);
      }
    }

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

    if (hasActingOfficer) {
      sendEmailNotificationInBackground(
        () => sendActingOfficerAssignedEmail(leaveEmailData, assignedActingOfficer),
        'Acting officer assignment'
      );
    } else if (applicantRole === 'employee') {
      sendEmailNotificationInBackground(
        () => workflow.requireAdminApproval
          ? sendAdminNewLeaveEmail(leaveEmailData)
          : sendHodAwaitingFinalApprovalEmail(leaveEmailData),
        workflow.requireAdminApproval ? 'Admin new leave request' : 'HOD direct approval request'
      );
    }

    return res.status(201).json({
      message: hasActingOfficer
        ? 'Leave application submitted successfully. Awaiting acting officer confirmation.'
        : 'Leave application submitted successfully. Awaiting approval according to configured rules.',
      leaveId: result.insertId,
      status,
      noOfDays,
      emailSent: null,
      emailQueued: true,
    });
  } catch (error) {
    console.error('[API Error] POST /leaves:', error);
    return res.status(500).json({ message: error.message || 'Failed to submit leave application.' });
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

    let actingOfficerSignature = null;
    try {
      const [aoRows] = await pool.query(
        `SELECT signature_image FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
        [actingOfficer]
      );
      if (aoRows.length > 0 && aoRows[0].signature_image) {
        actingOfficerSignature = aoRows[0].signature_image;
      }
    } catch (e) {}

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           acting_officer_confirmed = ?,
           declined_by = ?,
           decline_reason = ?,
           acting_officer_signature = COALESCE(?, acting_officer_signature)
       WHERE id = ? AND status = 'Pending Acting Officer'`,
      [newStatus, confirmed, declinedBy, finalDeclineReason, actingOfficerSignature, leaveId]
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

    let emailSent = null;
    if (action === 'confirm') {
      emailSent = await sendEmailNotification(
        () => sendAdminAwaitingApprovalEmail(emailLeave, actingOfficer),
        'Admin approval request'
      );
      sendEmailNotificationInBackground(
        () => sendHodAwaitingFinalApprovalEmail(emailLeave),
        'HOD parallel approval request'
      );
    } else {
      emailSent = await sendEmailNotification(
        () => sendEmployeeDeclinedByActingOfficerEmail(emailLeave, actingOfficer, reason),
        'Acting officer decline'
      );
    }

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
router.put('/leaves/:id/cancel', verifyToken, async (req, res) => {
  const leaveId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;
  const { reason } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM leaves WHERE id = ?', [leaveId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave record not found.' });
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
      `${LEAVE_BASE_QUERY}
       WHERE l.applicant_user_id = ? AND l.applicant_role = ?
       ORDER BY l.applied_on DESC, l.id DESC`,
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
      `${LEAVE_BASE_QUERY}
       WHERE LOWER(TRIM(l.acting_officer)) = LOWER(TRIM(?))
       ORDER BY l.applied_on DESC, l.id DESC`,
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
  const userId = req.user.id;
  const userEmail = (req.user.email || '').toLowerCase();

  try {
    // Shows leaves in this HOD's division (for alternative HOD approvers)
    // PLUS leaves explicitly assigned to this HOD (e.g. Anandani -> Priyanka)
    // Excludes the HOD's own leave applications so they don't see/approve their own leaves
    const [rows] = await pool.query(
      `${LEAVE_BASE_QUERY}
       WHERE (
         (LOWER(CONVERT(l.division USING utf8mb4)) = LOWER(CONVERT(? USING utf8mb4))
           AND (l.target_approver_id IS NULL OR l.target_approver_id = ?)
           AND (l.target_approver_role IS NULL OR l.target_approver_role = 'hod'))
         OR (l.target_approver_id = ? AND l.target_approver_role = 'hod')
         OR (l.target_approver_email IS NOT NULL AND LOWER(l.target_approver_email) = ?)
       )
       AND l.applicant_user_id != ?
       ORDER BY l.applied_on DESC, l.id DESC`,
      [division, userId, userId, userEmail, userId]
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
  const userId = req.user.id;
  const userEmail = (req.user.email || '').toLowerCase();

  if (!action || (action !== 'approve' && action !== 'decline')) {
    return res.status(400).json({ message: 'Action must be "approve" or "decline".' });
  }

  try {
    const [check] = await pool.query(
      `SELECT id, status, applicant_user_id as applicantUserId,
              applicant_role as applicantRole, applied_by as appliedBy,
              employee, division, type, target_approver_id, target_approver_role, target_approver_email,
              DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
              DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
              no_of_days as noOfDays, acting_officer as actingOfficer,
              reason, address
       FROM leaves WHERE id = ?`,
      [leaveId]
    );

    if (check.length === 0) {
      return res.status(404).json({
        message: 'Leave record not found.',
      });
    }

    const leave = check[0];

    // Authorization check
    const isTargetedToMe =
      Number(leave.target_approver_id) === Number(userId) ||
      (leave.target_approver_email && leave.target_approver_email.toLowerCase() === userEmail);

    const isInMyDivision =
      leave.division === division &&
      (leave.target_approver_role === null || leave.target_approver_role === 'hod') &&
      (leave.target_approver_id === null || Number(leave.target_approver_id) === Number(userId));

    if (!isTargetedToMe && !isInMyDivision) {
      return res.status(403).json({
        message: 'You are not authorized to approve this leave request.',
      });
    }

    if (leave.applicantRole === 'executive_officer' && leave.target_approver_role === 'secretary') {
      return res.status(403).json({
        message: 'Executive Officer leave requests are handled by the Secretary only.',
      });
    }

    const currentStatus = leave.status;

    if (!['Pending', 'Admin Approved'].includes(currentStatus)) {
      return res.status(409).json({
        message: `Cannot process leave with status "${currentStatus}". Only "Pending" or "Admin Approved" leaves can be finalized by HOD.`,
      });
    }

    // Cannot approve own leave!
    if (
      (leave.applicantRole === req.user.role && Number(leave.applicantUserId) === Number(userId)) ||
      (leave.applicantUserId == null && leave.appliedBy === req.user.name)
    ) {
      return res.status(403).json({ message: 'You cannot approve or reject your own leave request.' });
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Declined';
    const declinedBy = action === 'decline' ? (req.user.name || 'HOD') : null;
    const finalDeclineReason = (action === 'decline' && reason) ? reason.trim() : null;
    const approvedBy = action === 'approve' ? (req.user.name || 'HOD') : null;
    const approverRole = action === 'approve' ? 'hod' : null;
    const approvedById = action === 'approve' ? userId : null;

    let approverSignature = null;
    try {
      const [hodRows] = await pool.query(
        `SELECT signature_image FROM hod WHERE id = ? LIMIT 1`,
        [userId]
      );
      if (hodRows.length > 0 && hodRows[0].signature_image) {
        approverSignature = hodRows[0].signature_image;
      }
    } catch (e) {}

    // Atomic update: if multiple HODs exist, first one to approve succeeds. Subsequent attempts fail with 409.
    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           declined_by = ?,
           decline_reason = ?,
           approved_by = ?,
           approver_role = ?,
           approved_by_id = ?,
           approver_signature = COALESCE(?, approver_signature)
       WHERE id = ? AND status IN ('Pending', 'Admin Approved')`,
      [newStatus, declinedBy, finalDeclineReason, approvedBy, approverRole, approvedById, approverSignature, leaveId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: 'This leave request has already been processed by another approver.',
      });
    }

    const emailLeave = leave;
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
      approvedBy,
      approverRole,
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

    if (leave.acting_officer_confirmed === 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit after the acting officer has confirmed.',
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
      if (computedDays === 0) {
        return res.status(400).json({
          success: false,
          message: 'The selected range contains no working days.',
        });
      }
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
        acting_officer_confirmed,
        approved_by as approvedBy,
        approver_role as approverRole
       FROM leaves WHERE id = ?`,
      [leaveId]
    );

    return res.status(200).json({
      success: true,
      message: 'Leave request updated successfully.',
      leave: updated[0],
    });
  } catch (error) {
    console.error('[API Error] PUT /leaves/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update leave request.',
    });
  }
});

// ============================================
// ADMIN-ONLY ROUTES
// ✅ Everything below this line is locked to Admins ONLY
// ============================================
router.use(verifyToken, requireAdmin);

router.get('/dashboard-stats', async (req, res) => {
  const division = req.user.division;

  try {
    const [empCount] = await pool.query(
      'SELECT COUNT(*) as count FROM employees WHERE division = ?', [division]);

    const [pendingCount] = await pool.query(
      `SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = 'Pending'`,
      [division]);
    const [adminApprovedCount] = await pool.query(
      `SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = 'Admin Approved'`,
      [division]);
    const [approvedCount] = await pool.query(
      'SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = "Approved"', [division]);
    const [actingCount] = await pool.query(
      'SELECT COUNT(*) as count FROM leaves WHERE division = ? AND status = "Pending Acting Officer"', [division]);

    return res.status(200).json({
      division,
      totalEmployees: empCount[0].count,
      pendingLeaves: pendingCount[0].count,
      awaitingHodLeaves: adminApprovedCount[0].count,
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
    // Return employee leaves in this division, excluding Admin's own leaves
    const [rows] = await pool.query(
      `${LEAVE_BASE_QUERY}
       WHERE l.division = ? AND (l.applicant_role IS NULL OR l.applicant_role = 'employee')
       ORDER BY l.applied_on DESC, l.id DESC`,
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

    // ✅ NEW: Admin cannot touch EO leaves
    if (check[0].applicantRole === 'executive_officer') {
      return res.status(403).json({
        message: 'Executive Officer leave requests are handled by the Secretary only.',
      });
    }

    const currentStatus = check[0].status;

    if (!['Pending', 'Admin Approved'].includes(currentStatus)) {
      return res.status(400).json({
        message: `Cannot update leave with status "${currentStatus}". Only "Pending" or "Admin Approved" leaves can be processed.`,
      });
    }

    if (!['Approved', 'Admin Approved', 'Declined'].includes(status)) {
      return res.status(400).json({
        message: 'Admin can only set status to "Approved", "Admin Approved", or "Declined".',
      });
    }

    const finalDeclineReason = (status === 'Declined' && reason) ? reason.trim() : null;
    const finalDeclinedBy = status === 'Declined' ? 'Admin' : null;
    const isFinalApproval = status === 'Approved';
    const approvedBy = isFinalApproval ? (req.user.name || 'Admin') : null;
    const approverRole = isFinalApproval ? 'admin' : null;
    const recommendedByAdmin = status === 'Admin Approved' ? 1 : 0;

    let adminSignature = null;
    try {
      const [admRows] = await pool.query(
        `SELECT signature_image FROM admins WHERE id = ? LIMIT 1`,
        [req.user.id]
      );
      if (admRows.length > 0 && admRows[0].signature_image) {
        adminSignature = admRows[0].signature_image;
      }
    } catch (e) {}

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           recommended_by_admin = ?,
           declined_by = ?,
           decline_reason = ?,
           approved_by = ?,
           approver_role = ?,
           admin_signature = COALESCE(?, admin_signature)
       WHERE id = ? AND division = ? AND status IN ('Pending', 'Admin Approved')`,
      [
        status,
        recommendedByAdmin,
        finalDeclinedBy,
        finalDeclineReason,
        approvedBy,
        approverRole,
        adminSignature,
        leaveId,
        division,
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

      if (status === 'Approved') {
        emailSent = await sendEmailNotification(
          () => sendFinalApprovalEmails(emailLeave),
          'Admin final approval'
        );
      } else if (status === 'Admin Approved') {
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
      approvedBy,
      approverRole,
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

router.post('/employees', async (req, res) => {
  const division = req.user.division;
  const { name, designation, email, appointment_date, password } = req.body;

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


// ============================================
// APPROVAL RULES API (Configurable Relationships)
// ============================================
// Approval Settings is a user-scoped view over approval_rules. It deliberately
// uses the existing workflow table so old rules and leave records remain intact.
router.get('/approval-settings', verifyToken, requireAdminOrHOD, async (req, res) => {
  const { role, id, division } = req.user;

  try {
    const [candidateRows] = role === 'admin'
      ? await pool.query(
          `SELECT id, name, email, designation, division
           FROM hod WHERE division = ? ORDER BY name ASC, id ASC`,
          [division]
        )
      : await pool.query(
          `SELECT id, name, email, designation, NULL AS division
           FROM secretary ORDER BY name ASC, id ASC`
        );

    const [ruleRows] = await pool.query(
      `SELECT approver_id AS approverId, approver_role AS approverRole,
              approver_email AS approverEmail, approver_name AS approverName
       FROM approval_rules
       WHERE rule_type = 'USER_HIERARCHY' AND applicant_id = ? AND applicant_role = ?
       ORDER BY id ASC LIMIT 1`,
      [id, role]
    );

    const rule = ruleRows[0] || null;
    return res.status(200).json({
      candidates: candidateRows,
      selected: rule && rule.approverId !== null && rule.approverId !== undefined ? {
        id: rule.approverId,
        role: rule.approverRole,
        email: rule.approverEmail,
        name: rule.approverName,
      } : null,
    });
  } catch (error) {
    console.error('[API Error] GET /approval-settings:', error);
    return res.status(500).json({ message: 'Failed to retrieve approval settings.' });
  }
});

router.put('/approval-settings', verifyToken, requireAdminOrHOD, async (req, res) => {
  const { role, id, email: tokenEmail, name: tokenName, division: tokenDivision } = req.user;
  const rawApproverId = req.body?.approverId;
  const approverId = rawApproverId === '' || rawApproverId === null || rawApproverId === undefined
    ? null
    : Number(rawApproverId);

  if (approverId !== null && (!Number.isInteger(approverId) || approverId <= 0)) {
    return res.status(400).json({ message: 'A valid approver must be selected.' });
  }

  const approverRole = role === 'admin' ? 'hod' : 'secretary';
  const fallbackDivision = tokenDivision || null;

  try {
    const profileTable = role === 'admin' ? 'admins' : 'hod';
    const [profiles] = await pool.query(
      `SELECT id, name, email, division FROM ${profileTable} WHERE id = ? LIMIT 1`,
      [id]
    );
    if (profiles.length === 0) return res.status(404).json({ message: 'Authenticated profile not found.' });

    const applicant = profiles[0];
    const applicantDivision = applicant.division || fallbackDivision;
    let approver = null;

    if (approverId !== null) {
      const [rows] = role === 'admin'
        ? await pool.query(
            `SELECT id, name, email, designation, division FROM hod
             WHERE id = ? AND division = ? LIMIT 1`,
            [approverId, applicantDivision]
          )
        : await pool.query(
            `SELECT id, name, email, designation, NULL AS division FROM secretary
             WHERE id = ? LIMIT 1`,
            [approverId]
          );

      if (rows.length === 0) {
        return res.status(403).json({ message: 'The selected officer is not authorized for your approval hierarchy.' });
      }
      approver = rows[0];
    }

    const [existingRules] = await pool.query(
      `SELECT id FROM approval_rules
       WHERE rule_type = 'USER_HIERARCHY' AND applicant_id = ? AND applicant_role = ?
       ORDER BY id ASC LIMIT 1`,
      [id, role]
    );

    const ruleValues = [
      applicantDivision,
      role,
      id,
      applicant.email || tokenEmail || null,
      applicant.name || tokenName || null,
      approverRole,
      approver ? approver.id : null,
      approver ? approver.email : null,
      approver ? approver.name : null,
      approver ? 'Approval Settings selection' : 'Approval Settings cleared; use default workflow',
    ];

    // Update only this user's existing rule. If none exists, create a rule only
    // for a real selection; clearing settings must fall through to defaults.
    if (existingRules.length > 0) {
      await pool.query(
        `UPDATE approval_rules
         SET division = ?, applicant_role = ?, applicant_id = ?, applicant_email = ?, applicant_name = ?,
             approver_role = ?, approver_id = ?, approver_email = ?, approver_name = ?, description = ?
         WHERE id = ?`,
        [...ruleValues, existingRules[0].id]
      );
    } else if (approver) {
      await pool.query(
        `INSERT INTO approval_rules
         (rule_type, division, applicant_role, applicant_id, applicant_email, applicant_name,
          approver_role, approver_id, approver_email, approver_name, stage, require_admin_approval, description)
         VALUES ('USER_HIERARCHY', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, FALSE, ?)`,
        ruleValues
      );
    }

    return res.status(200).json({
      message: approver ? 'Approval settings saved.' : 'Approval settings cleared. The default workflow will be used.',
      selected: approver ? {
        id: approver.id,
        role: approverRole,
        name: approver.name,
        email: approver.email,
      } : null,
    });
  } catch (error) {
    console.error('[API Error] PUT /approval-settings:', error);
    return res.status(500).json({ message: 'Failed to save approval settings.' });
  }
});

router.get('/approval-rules', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, rule_type as ruleType, division, applicant_role as applicantRole,
              applicant_id as applicantId, applicant_email as applicantEmail, applicant_name as applicantName,
              approver_role as approverRole, approver_id as approverId, approver_email as approverEmail,
              approver_name as approverName, stage, require_admin_approval as requireAdminApproval,
              description, created_at as createdAt, updated_at as updatedAt
       FROM approval_rules
       ORDER BY rule_type DESC, id ASC`
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[API Error] GET /approval-rules:', error);
    return res.status(500).json({ message: 'Failed to retrieve approval rules.' });
  }
});

router.post('/approval-rules', verifyToken, async (req, res) => {
  if (!['admin', 'secretary', 'hod'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only Admins, Secretary, or HOD can configure approval rules.' });
  }

  const {
    ruleType = 'USER_HIERARCHY',
    division,
    applicantRole,
    applicantId,
    applicantEmail,
    applicantName,
    approverRole,
    approverId,
    approverEmail,
    approverName,
    stage = 1,
    requireAdminApproval = true,
    description,
  } = req.body;

  if (!approverRole) {
    return res.status(400).json({ message: 'Approver role is required.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO approval_rules
       (rule_type, division, applicant_role, applicant_id, applicant_email, applicant_name,
        approver_role, approver_id, approver_email, approver_name, stage, require_admin_approval, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ruleType,
        division || null,
        applicantRole || null,
        applicantId || null,
        applicantEmail || null,
        applicantName || null,
        approverRole,
        approverId || null,
        approverEmail || null,
        approverName || null,
        stage,
        requireAdminApproval !== false,
        description || null,
      ]
    );

    return res.status(201).json({
      message: 'Approval rule configured successfully.',
      id: result.insertId,
    });
  } catch (error) {
    console.error('[API Error] POST /approval-rules:', error);
    return res.status(500).json({ message: 'Failed to save approval rule.' });
  }
});

router.delete('/approval-rules/:id', verifyToken, async (req, res) => {
  if (!['admin', 'secretary'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only Admins and Secretary can delete approval rules.' });
  }

  try {
    await pool.query('DELETE FROM approval_rules WHERE id = ?', [req.params.id]);
    return res.status(200).json({ message: 'Approval rule removed successfully.' });
  } catch (error) {
    console.error('[API Error] DELETE /approval-rules/:id:', error);
    return res.status(500).json({ message: 'Failed to delete approval rule.' });
  }
});

module.exports = router;
