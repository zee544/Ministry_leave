const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const pool = require('../config/db');
const { broadcastNotification } = require('./notificationsStream');
const { verifyToken, requireAdmin, requireHOD, requireAdminOrHOD } = require('../middleware/auth');

const {
  sendActingOfficerAssignedEmail,
  sendEmployeeDeclinedByActingOfficerEmail,
  sendHodAwaitingFinalApprovalEmail,
  sendEmployeeDeclinedByAdminEmail,
  sendSecretaryDecisionEmail,
  sendFinalApprovalEmails,
  sendEmployeeDeclinedByHodEmail,
  sendActingOfficerCancelledEmail,
  sendAdminNewLeaveEmail,
  sendApprovalRequestEmail,
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

function actingOfficerDashboardLink(role) {
  const dashboardByRole = {
    employee: '/userdashboard?tab=actingapprovals',
    hod: '/hoddashboard?tab=acting-approvals',
    admin: '/Admindashboard?tab=acting-approvals',
    secretary: '/secretarydashboard?tab=pending',
    executive_officer: '/executiveofficerdashboard?tab=acting-approvals',
  };
  return dashboardByRole[role] || '/userdashboard?tab=actingapprovals';
}

async function notifyLeaveApplicant(leave, message, link = '/userdashboard?tab=myleaves') {
  const profileTables = { employee: 'employees', hod: 'hod', admin: 'admins', secretary: 'secretary', executive_officer: 'executive_officers' };
  const role = leave.applicantRole || leave.applicant_role;
  const userId = leave.applicantUserId ?? leave.applicant_user_id;
  const table = profileTables[role];
  if (!table || userId == null) return;
  const [profiles] = await pool.query(`SELECT name, division FROM ${table} WHERE id = ? LIMIT 1`, [userId]);
  if (!profiles.length) return;
  const recipient = profiles[0].name;
  const division = profiles[0].division || leave.division || 'Ministry';
  const [result] = await pool.query(
    `INSERT INTO notifications
     (message, type, recipient, recipient_role, recipient_user_id, division, link, read_status)
     VALUES (?, 'status_update', ?, ?, ?, ?, ?, 0)`,
    [message, recipient, role, userId, division, link]
  );
  broadcastNotification({
    id: result.insertId,
    message,
    type: 'status_update',
    recipient,
    recipientRole: role,
    recipientUserId: userId,
    division,
    link,
    read: false,
    timestamp: new Date().toISOString(),
  });
}

async function notifyProfile(role, userId, message, type, division, link) {
  const profileTables = { employee: 'employees', hod: 'hod', admin: 'admins', secretary: 'secretary', executive_officer: 'executive_officers' };
  const table = profileTables[role];
  if (!table || userId == null) return;
  const [profiles] = await pool.query(`SELECT name FROM ${table} WHERE id = ? LIMIT 1`, [userId]);
  if (!profiles.length) return;
  const recipient = profiles[0].name;
  const [result] = await pool.query(
    `INSERT INTO notifications
     (message, type, recipient, recipient_role, recipient_user_id, division, link, read_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [message, type, recipient, role, userId, division || null, link]
  );
  broadcastNotification({
    id: result.insertId,
    message,
    type,
    recipient,
    recipientRole: role,
    recipientUserId: userId,
    division: division || null,
    link,
    read: false,
    timestamp: new Date().toISOString(),
  });
}

async function notifyDivisionHods(division, message, type = 'leave_application') {
  if (!division) return;
  const [hods] = await pool.query(
    `SELECT id FROM hod WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))`,
    [division]
  );
  await Promise.all(hods.map((hod) =>
    notifyProfile('hod', hod.id, message, type, division, '/hoddashboard?tab=leaves')
  ));
}

async function notifyDivisionAdmins(division, message, type = 'leave_application') {
  if (!division) return;
  const [admins] = await pool.query(
    `SELECT id FROM admins WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))`,
    [division]
  );
  await Promise.all(admins.map((admin) =>
    notifyProfile('admin', admin.id, message, type, division, '/Admindashboard?tab=leaves')
  ));
}

async function notifyActingOfficer(leave, message) {
  const role = leave.actingOfficerRole || leave.acting_officer_role;
  const userId = leave.actingOfficerUserId ?? leave.acting_officer_user_id;
  if (role && userId != null) {
    await notifyProfile(role, userId, message, 'status_update', leave.division, actingOfficerDashboardLink(role));
  }
}

async function findEligibleActingOfficer(name, division, applicantRole, applicantId, selectedRole = null, selectedId = null) {
  const actingTables = {
    employee: 'employees',
    hod: 'hod',
    admin: 'admins',
  };
  if (selectedRole && selectedId != null) {
    const table = actingTables[selectedRole];
    if (!table) return null;
    const divisionFilter = selectedRole === 'secretary' || !division
      ? ''
      : 'AND LOWER(TRIM(division)) = LOWER(TRIM(?))';
    const params = selectedRole === 'secretary' || !division
      ? [selectedId]
      : [selectedId, division];
    const [rows] = await pool.query(
      `SELECT id, name, email FROM ${table}
       WHERE id = ? ${divisionFilter}
         ${selectedRole === 'employee' ? "AND status = 'Active'" : ''}
       LIMIT 1`,
      params
    );
    const candidate = rows[0] ? { ...rows[0], role: selectedRole } : null;
    if (!candidate || (candidate.role === applicantRole && Number(candidate.id) === Number(applicantId))) return null;
    if (applicantRole === 'hod' && ['hod', 'admin'].includes(candidate.role)) {
      const descendants = await getHierarchyDescendantKeys(applicantRole, applicantId);
      if (!descendants.has(`${candidate.role}:${candidate.id}`)) return null;
    }
    return candidate;
  }

  const employeeQuery = division
    ? [`SELECT id, name, email FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(division)) = LOWER(TRIM(?)) AND status = 'Active' LIMIT 1`, [name, division]]
    : [`SELECT id, name, email FROM employees WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND status = 'Active' LIMIT 1`, [name]];
  const hodQuery = division
    ? [`SELECT id, name, email FROM hod WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(division)) = LOWER(TRIM(?)) LIMIT 1`, [name, division]]
    : [`SELECT id, name, email FROM hod WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`, [name]];
  const adminQuery = division
    ? [`SELECT id, name, email FROM admins WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(division)) = LOWER(TRIM(?)) LIMIT 1`, [name, division]]
    : [`SELECT id, name, email FROM admins WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`, [name]];
  const [[employees], [hods], [admins]] = await Promise.all([
    pool.query(employeeQuery[0], employeeQuery[1]),
    pool.query(hodQuery[0], hodQuery[1]),
    pool.query(adminQuery[0], adminQuery[1]),
  ]);
  const rows = [
    ...employees.map((row) => ({ ...row, role: 'employee' })),
    ...hods.map((row) => ({ ...row, role: 'hod' })),
    ...admins.map((row) => ({ ...row, role: 'admin' })),
  ];
  const candidate = rows.find((row) => !(row.role === applicantRole && Number(row.id) === Number(applicantId))) || null;
  if (!candidate || applicantRole !== 'hod' || !['hod', 'admin'].includes(candidate.role)) return candidate;

  const descendants = await getHierarchyDescendantKeys(applicantRole, applicantId);
  return descendants.has(`${candidate.role}:${candidate.id}`) ? candidate : null;
}

async function getHierarchyDescendantKeys(role, id) {
  const [rules] = await pool.query(
    `SELECT applicant_role, applicant_id, approver_role, approver_id
     FROM approval_rules
     WHERE rule_type = 'USER_HIERARCHY'
       AND applicant_id IS NOT NULL AND approver_id IS NOT NULL`
  );
  const descendants = new Set();
  const queue = [`${role}:${id}`];
  while (queue.length) {
    const approverKey = queue.shift();
    for (const rule of rules) {
      const applicantKey = `${String(rule.applicant_role || '').toLowerCase()}:${rule.applicant_id}`;
      const ruleApproverKey = `${String(rule.approver_role || '').toLowerCase()}:${rule.approver_id}`;
      if (ruleApproverKey === approverKey && !descendants.has(applicantKey)) {
        descendants.add(applicantKey);
        queue.push(applicantKey);
      }
    }
  }
  return descendants;
}

async function notifyApprovalTarget(leave, message) {
  const tables = {
    hod: 'hod',
    admin: 'admins',
    secretary: 'secretary',
    employee: 'employees',
    executive_officer: 'executive_officers',
  };
  const table = tables[leave.target_approver_role];
  if (!table) return;
  const where = leave.target_approver_id ? 'id = ?' : 'LOWER(TRIM(email)) = LOWER(TRIM(?))';
  const value = leave.target_approver_id || leave.target_approver_email;
  const [rows] = await pool.query(`SELECT id, name FROM ${table} WHERE ${where} LIMIT 1`, [value]);
  if (!rows.length) return;
  const recipient = rows[0].name;
  const link = leave.target_approver_role === 'secretary'
    ? '/secretarydashboard?tab=pending'
    : leave.target_approver_role === 'hod'
      ? '/hoddashboard?tab=leaves'
      : leave.target_approver_role === 'executive_officer'
        ? '/executiveofficerdashboard?tab=leaves'
        : '/Admindashboard?tab=leaves';
  const [result] = await pool.query(
    `INSERT INTO notifications
     (message, type, recipient, recipient_role, recipient_user_id, division, link, read_status)
     VALUES (?, 'leave_application', ?, ?, ?, ?, ?, 0)`,
    [message, recipient, leave.target_approver_role, rows[0].id, leave.division, link]
  );
  broadcastNotification({
    id: result.insertId,
    message,
    type: 'leave_application',
    recipient,
    recipientRole: leave.target_approver_role,
    recipientUserId: rows[0].id,
    division: leave.division,
    link,
    read: false,
    timestamp: new Date().toISOString(),
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
    l.acting_officer_user_id AS actingOfficerUserId,
    l.acting_officer_role AS actingOfficerRole,
    l.status,
    l.applied_by AS appliedBy,
    DATE_FORMAT(l.applied_on, '%Y-%m-%d') AS appliedOn,
    DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
    DATE_FORMAT(l.secretary_decided_at, '%Y-%m-%d %H:%i:%s') AS secretaryDecidedAt,
    l.secretary_decided_by_id AS secretaryDecidedById,
    (SELECT s.name FROM secretary s WHERE s.id = l.secretary_decided_by_id LIMIT 1) AS secretaryName,
    COALESCE(
      (SELECT s.signature_image_extracted FROM secretary s WHERE s.id = l.secretary_decided_by_id LIMIT 1),
      l.secretary_signature,
      (SELECT s.signature_image FROM secretary s WHERE s.id = l.secretary_decided_by_id LIMIT 1)
    ) AS secretarySignature,
    DATE_FORMAT(COALESCE(l.created_at, l.applied_on), '%Y-%m-%d %H:%i:%s') AS submittedAt,
    l.reason,
    l.address,
    l.recommended_by_admin AS recommendedByAdmin,
    l.admin_approval_required AS adminApprovalRequired,
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
      (SELECT h.signature_image_extracted FROM hod h WHERE h.id = l.approved_by_id AND l.approver_role = 'hod' LIMIT 1),
      (SELECT h.signature_image_extracted FROM hod h WHERE LOWER(CONVERT(h.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approver_role = 'hod' AND l.approved_by_id IS NULL LIMIT 1),
      (SELECT s.signature_image_extracted FROM secretary s WHERE s.id = l.approved_by_id AND l.approver_role = 'secretary' LIMIT 1),
      (SELECT s.signature_image_extracted FROM secretary s WHERE LOWER(CONVERT(s.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approver_role = 'secretary' AND l.approved_by_id IS NULL LIMIT 1),
      (SELECT a.signature_image_extracted FROM admins a WHERE a.id = l.approved_by_id AND l.approver_role = 'admin' LIMIT 1),
      (SELECT a.signature_image_extracted FROM admins a WHERE LOWER(CONVERT(a.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approver_role = 'admin' AND l.approved_by_id IS NULL LIMIT 1),
      l.approver_signature,
      (SELECT h.signature_image FROM hod h WHERE h.id = l.approved_by_id AND l.approver_role = 'hod' LIMIT 1),
      (SELECT h.signature_image FROM hod h WHERE LOWER(CONVERT(h.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approver_role = 'hod' AND l.approved_by_id IS NULL LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE s.id = l.approved_by_id AND l.approver_role = 'secretary' LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE LOWER(CONVERT(s.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approver_role = 'secretary' AND l.approved_by_id IS NULL LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE a.id = l.approved_by_id AND l.approver_role = 'admin' LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE LOWER(CONVERT(a.name USING utf8mb4)) = LOWER(CONVERT(l.approved_by USING utf8mb4)) AND l.approver_role = 'admin' AND l.approved_by_id IS NULL LIMIT 1)
    ) AS approverSignature,
    COALESCE(
      (SELECT a.signature_image_extracted FROM admins a WHERE LOWER(CONVERT(a.division USING utf8mb4)) = LOWER(CONVERT(l.division USING utf8mb4)) LIMIT 1),
      l.admin_signature,
      (SELECT a.signature_image FROM admins a WHERE LOWER(CONVERT(a.division USING utf8mb4)) = LOWER(CONVERT(l.division USING utf8mb4)) LIMIT 1)
    ) AS adminSignature,
    COALESCE(
      (SELECT e.signature_image_extracted FROM employees e WHERE e.id = l.applicant_user_id AND l.applicant_role = 'employee' LIMIT 1),
      (SELECT h.signature_image_extracted FROM hod h WHERE h.id = l.applicant_user_id AND l.applicant_role = 'hod' LIMIT 1),
      (SELECT a.signature_image_extracted FROM admins a WHERE a.id = l.applicant_user_id AND l.applicant_role = 'admin' LIMIT 1),
      (SELECT s.signature_image_extracted FROM secretary s WHERE s.id = l.applicant_user_id AND l.applicant_role = 'secretary' LIMIT 1),
      (SELECT eo.signature_image_extracted FROM executive_officers eo WHERE eo.id = l.applicant_user_id AND l.applicant_role = 'executive_officer' LIMIT 1),
      l.applicant_signature,
      (SELECT e.signature_image FROM employees e WHERE e.id = l.applicant_user_id AND l.applicant_role = 'employee' LIMIT 1),
      (SELECT h.signature_image FROM hod h WHERE h.id = l.applicant_user_id AND l.applicant_role = 'hod' LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE a.id = l.applicant_user_id AND l.applicant_role = 'admin' LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE s.id = l.applicant_user_id AND l.applicant_role = 'secretary' LIMIT 1),
      (SELECT eo.signature_image FROM executive_officers eo WHERE eo.id = l.applicant_user_id AND l.applicant_role = 'executive_officer' LIMIT 1)
    ) AS applicantSignature,
    COALESCE(
      (SELECT e.signature_image_extracted FROM employees e WHERE e.id = l.acting_officer_user_id AND l.acting_officer_role = 'employee' LIMIT 1),
      (SELECT h.signature_image_extracted FROM hod h WHERE h.id = l.acting_officer_user_id AND l.acting_officer_role = 'hod' LIMIT 1),
      (SELECT a.signature_image_extracted FROM admins a WHERE a.id = l.acting_officer_user_id AND l.acting_officer_role = 'admin' LIMIT 1),
      (SELECT s.signature_image_extracted FROM secretary s WHERE s.id = l.acting_officer_user_id AND l.acting_officer_role = 'secretary' LIMIT 1),
      (SELECT eo.signature_image_extracted FROM executive_officers eo WHERE eo.id = l.acting_officer_user_id AND l.acting_officer_role = 'executive_officer' LIMIT 1),
      l.acting_officer_signature,
      (SELECT e.signature_image FROM employees e WHERE e.id = l.acting_officer_user_id AND l.acting_officer_role = 'employee' LIMIT 1),
      (SELECT h.signature_image FROM hod h WHERE h.id = l.acting_officer_user_id AND l.acting_officer_role = 'hod' LIMIT 1),
      (SELECT a.signature_image FROM admins a WHERE a.id = l.acting_officer_user_id AND l.acting_officer_role = 'admin' LIMIT 1),
      (SELECT s.signature_image FROM secretary s WHERE s.id = l.acting_officer_user_id AND l.acting_officer_role = 'secretary' LIMIT 1),
      (SELECT eo.signature_image FROM executive_officers eo WHERE eo.id = l.acting_officer_user_id AND l.acting_officer_role = 'executive_officer' LIMIT 1),
      (SELECT COALESCE(h.signature_image_extracted, h.signature_image) FROM hod h WHERE LOWER(CONVERT(h.name USING utf8mb4)) = LOWER(CONVERT(l.acting_officer USING utf8mb4)) AND LOWER(CONVERT(h.division USING utf8mb4)) = LOWER(CONVERT(l.division USING utf8mb4)) LIMIT 1),
      (SELECT COALESCE(e.signature_image_extracted, e.signature_image) FROM employees e WHERE LOWER(CONVERT(e.name USING utf8mb4)) = LOWER(CONVERT(l.acting_officer USING utf8mb4)) AND LOWER(CONVERT(e.division USING utf8mb4)) = LOWER(CONVERT(l.division USING utf8mb4)) LIMIT 1)
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
      // The configured approver ID is authoritative. Always resolve the
      // current profile email so renamed/updated accounts do not leave a
      // stale email in the workflow snapshot.
      let targetApproverEmail = r.approver_email;
      if (r.approver_id) {
        const approverTables = { hod: 'hod', admin: 'admins', secretary: 'secretary', employee: 'employees', executive_officer: 'executive_officers' };
        const approverTable = approverTables[r.approver_role];
        if (approverTable) {
          const [approverRows] = await pool.query(`SELECT email FROM ${approverTable} WHERE id = ? LIMIT 1`, [r.approver_id]);
          targetApproverEmail = approverRows[0]?.email || targetApproverEmail || null;
        }
      }
      return {
        targetApproverRole: r.approver_role,
        targetApproverId: r.approver_id,
        targetApproverEmail,
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

  if (!division && req.user.role !== 'secretary') {
    return res.status(400).json({ message: 'User division not found in token.' });
  }

  try {
    // ✅ Fetch ONLY Active employees in THIS specific division
    const [[employees], [hods], [admins]] = await Promise.all([
      division
        ? pool.query(`SELECT id, name, designation, division, email, status, 'employee' AS role FROM employees WHERE LOWER(TRIM(division)) = LOWER(TRIM(?)) AND status = 'Active'`, [division])
        : pool.query(`SELECT id, name, designation, division, email, status, 'employee' AS role FROM employees WHERE status = 'Active'`, []),
      division
        ? pool.query(`SELECT id, name, designation, division, email, 'Active' AS status, 'hod' AS role FROM hod WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))`, [division])
        : pool.query(`SELECT id, name, designation, division, email, 'Active' AS status, 'hod' AS role FROM hod`, []),
      division
        ? pool.query(`SELECT id, name, designation, division, email, 'Active' AS status, 'admin' AS role FROM admins WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))`, [division])
        : pool.query(`SELECT id, name, designation, division, email, 'Active' AS status, 'admin' AS role FROM admins`, []),
    ]);
    const rows = [...employees, ...hods, ...admins]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.role).localeCompare(String(b.role)));
    let eligibleRows = rows;
    if (req.user.role === 'hod') {
      const descendants = await getHierarchyDescendantKeys(req.user.role, req.user.id);
      eligibleRows = rows.filter((row) =>
        row.role === 'employee' || descendants.has(`${row.role}:${row.id}`)
      );
    }

    console.log(`[API] Fetched ${eligibleRows.length} acting officers for division: ${division || 'Ministry-wide'}`);
    return res.status(200).json(eligibleRows);
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
      `${LEAVE_BASE_QUERY} ORDER BY COALESCE(l.created_at, l.applied_on) DESC, l.id DESC`
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
      `${LEAVE_BASE_QUERY} WHERE l.division = ? ORDER BY COALESCE(l.created_at, l.applied_on) DESC, l.id DESC`,
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
              acting_officer_user_id as actingOfficerUserId,
              acting_officer_role as actingOfficerRole,
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
  const declineReason = typeof reason === 'string' ? reason.trim() : '';

  if (!['approve', 'decline'].includes(action)) {
    return res.status(400).json({ message: 'Action must be "approve" or "decline".' });
  }
  if (action === 'decline' && !declineReason) {
    return res.status(400).json({ message: 'A decline reason is required.' });
  }

  try {
    const [check] = await pool.query(
      `SELECT id, status,
              applicant_role as applicantRole,
              applicant_user_id as applicantUserId,
              employee, division, type,
              target_approver_role, target_approver_id, target_approver_email,
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

    const [secretaryRows] = await pool.query(
      `SELECT name, email,
              COALESCE(signature_image_extracted, signature_image) AS signature_image
       FROM secretary WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (!secretaryRows.length) {
      return res.status(403).json({ message: 'Secretary account could not be verified.' });
    }

    const secretaryEmail = String(secretaryRows[0].email || '').trim().toLowerCase();
    const assignedSecretaryId = check[0].target_approver_id;
    const assignedSecretaryEmail = String(check[0].target_approver_email || '').trim().toLowerCase();
    const assignedToCurrentSecretary = assignedSecretaryId != null
      ? Number(assignedSecretaryId) === Number(userId)
      : Boolean(secretaryEmail && assignedSecretaryEmail === secretaryEmail);
    if (
      check[0].applicantRole !== 'hod' ||
      check[0].target_approver_role !== 'secretary' ||
      !assignedToCurrentSecretary
    ) {
      return res.status(403).json({
        message: 'Only HOD leave requests assigned to you as the authorized approver can be processed.',
      });
    }

    if (check[0].status !== 'Pending') {
      return res.status(409).json({
        message: `Cannot process leave with status "${check[0].status}". Only "Pending" leaves can be processed.`,
      });
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Declined';
    const declinedBy = action === 'decline' ? (req.user.name || 'Secretary') : null;
    const storedDeclineReason = action === 'decline' ? declineReason : null;
    const secretaryName = secretaryRows[0].name || req.user.name || 'Secretary';
    const approvedBy = action === 'approve' ? secretaryName : null;
    const approverRole = 'secretary';
    const approverSignature = secretaryRows[0].signature_image || null;

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           declined_by = ?,
           decline_reason = ?,
           secretary_signature = COALESCE(?, secretary_signature),
           secretary_decided_at = CURRENT_TIMESTAMP,
           secretary_decided_by_id = ?
       WHERE id = ? AND status = 'Pending'
         AND applicant_role = 'hod'
         AND target_approver_role = 'secretary'
         AND (
           (target_approver_id = ? AND ? IS NOT NULL)
           OR (target_approver_id IS NULL AND LOWER(TRIM(target_approver_email)) = ?)
         )`,
      [
        newStatus,
        declinedBy,
        storedDeclineReason,
        approverSignature,
        userId,
        leaveId,
        userId,
        userId,
        secretaryEmail,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ message: 'This leave request has already been processed.' });
    }

    const emailLeave = check[0];
    void notifyLeaveApplicant(
      emailLeave,
      action === 'approve'
        ? `${emailLeave.employee}'s leave request was approved by ${approvedBy}.`
        : `${emailLeave.employee}'s leave request was declined by ${declinedBy}. Reason: ${storedDeclineReason}`,
      '/hoddashboard?tab=my-leaves'
    ).catch((error) => console.warn('[Notifications] Secretary applicant notification failed:', error.message));

    sendEmailNotificationInBackground(
      () => sendSecretaryDecisionEmail(
        emailLeave,
        action,
        storedDeclineReason
      ),
      action === 'approve' ? 'Secretary approval decision' : 'Secretary decline decision'
    );

    return res.status(200).json({
      message: `Leave ${action === 'approve' ? 'approved' : 'declined'} by Secretary successfully.`,
      id: leaveId,
      status: newStatus,
      approvedBy,
      approverRole,
      secretaryDecidedAt: new Date().toISOString(),
      secretaryDecidedById: userId,
      secretaryName,
      secretarySignature: approverSignature,
      declineReason: storedDeclineReason,
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
  let { type, fromDate, toDate, actingOfficer, actingOfficerUserId, actingOfficerRole, reason, address } = req.body;
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

  const hasActingOfficer = Boolean(
    actingOfficer && String(actingOfficer).trim() && String(actingOfficer).trim() !== '—'
  );
  if (!hasActingOfficer) {
    return res.status(400).json({ message: 'Select an Acting Officer before submitting your leave request.' });
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
      `SELECT id, name, email,
              ${applicantRole === 'secretary' ? "'Ministry' as division" : "COALESCE(division, 'Ministry') as division"},
              COALESCE(signature_image_extracted, signature_image) AS signature_image
       FROM ${profileTable} WHERE id = ? LIMIT 1`,
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
    const [workflow, divisionAdmins] = await Promise.all([
      resolveWorkflow(applicantRole, applicantId, applicantEmail, division),
      applicantRole === 'employee'
        ? pool.query(
          `SELECT id, email FROM admins WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))`,
          [division]
        ).then(([rows]) => rows)
        : Promise.resolve([]),
    ]);
    const adminApprovalRequired = applicantRole === 'employee' && divisionAdmins.length > 0;
    let assignedActingOfficer = actingOfficer.trim();
    let actingUser = null;

    if (hasActingOfficer) {
      actingUser = await findEligibleActingOfficer(
        assignedActingOfficer,
        applicantRole === 'secretary' ? null : division,
        applicantRole,
        applicantId,
        actingOfficerRole,
        actingOfficerUserId
      );
      if (!actingUser) {
        return res.status(403).json({ message: 'The selected Acting Officer is not registered and authorized for this division.' });
      }
      if (applicantRole === 'admin' && actingUser.role !== 'employee') {
        return res.status(403).json({ message: 'Admins may select an Acting Officer only from their own division employees.' });
      }
      // Persist the canonical database value so notifications, SSE, and
      // authenticated acting-officer queries all use the same identity.
      assignedActingOfficer = actingUser.name;
    }

    // Initial status
    const status = hasActingOfficer ? 'Pending Acting Officer' : 'Pending';
    const today = new Date().toISOString().split('T')[0];

    const needsTransaction = ['hod', 'executive_officer', 'secretary'].includes(applicantRole);

    let result;
    const notifications = [];
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
         (employee, division, type, from_date, to_date, no_of_days, acting_officer, acting_officer_user_id, acting_officer_role,
          applicant_user_id, applicant_role, status, admin_approval_required, applied_by, applied_on, reason, address,
          target_approver_id, target_approver_role, target_approver_email, applicant_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee, division, type, fromDate, toDate, noOfDays, assignedActingOfficer,
          actingUser?.id || null, actingUser?.role || null,
          applicantId, applicantRole, status, adminApprovalRequired ? 1 : 0, appliedBy, today, reason, address,
          workflow.targetApproverId, workflow.targetApproverRole, workflow.targetApproverEmail, applicantSignature
        ]
      );

      if (hasActingOfficer) {
        const actingMessage = `${employee} submitted a ${type} leave request (${fromDate} to ${toDate}) and assigned you as Acting Officer.`;
        const [actingNotification] = await connection.query(
          `INSERT INTO notifications
           (message, type, recipient, recipient_role, recipient_user_id, division, link, read_status)
           VALUES (?, 'acting_officer', ?, ?, ?, ?, ?, 0)`,
          [actingMessage, assignedActingOfficer, actingUser.role, actingUser.id, division, actingOfficerDashboardLink(actingUser.role)]
        );
        notifications.push({
          id: actingNotification.insertId,
          message: actingMessage,
          type: 'acting_officer',
          recipient: assignedActingOfficer,
          recipientRole: actingUser.role,
          recipientUserId: actingUser.id,
          division,
          link: actingOfficerDashboardLink(actingUser.role),
          read: false,
          timestamp: new Date().toISOString(),
        });
      }

      // The acting stage is the gate. Once it is absent, notify the exact
      // approver resolved from Approval Settings (including a targeted ID).
      if (!hasActingOfficer && workflow.targetApproverRole) {
        const message = `${employee} submitted a ${type} leave request (${fromDate} to ${toDate}) awaiting your approval.`;
        const target = {
          target_approver_role: workflow.targetApproverRole,
          target_approver_id: workflow.targetApproverId,
          target_approver_email: workflow.targetApproverEmail,
          division,
        };
        const targetTables = { hod: 'hod', admin: 'admins', secretary: 'secretary', employee: 'employees', executive_officer: 'executive_officers' };
        const targetTable = targetTables[workflow.targetApproverRole];
        if (targetTable) {
          const targetWhere = workflow.targetApproverId ? 'id = ?' : 'LOWER(TRIM(email)) = LOWER(TRIM(?))';
          const [targetRows] = await connection.query(
            `SELECT id, name FROM ${targetTable} WHERE ${targetWhere} LIMIT 1`,
            [workflow.targetApproverId || workflow.targetApproverEmail]
          );
          if (targetRows.length) {
            const recipient = targetRows[0].name;
            const link = workflow.targetApproverRole === 'secretary' ? '/secretarydashboard?tab=pending' : workflow.targetApproverRole === 'hod' ? '/hoddashboard?tab=leaves' : '/Admindashboard?tab=leaves';
            const [notificationResult] = await connection.query(
              `INSERT INTO notifications
               (message, type, recipient, recipient_role, recipient_user_id, division, link, read_status)
               VALUES (?, 'leave_application', ?, ?, ?, ?, ?, 0)`,
              [message, recipient, workflow.targetApproverRole, targetRows[0].id, division, link]
            );
            notifications.push({
              id: notificationResult.insertId,
              message,
              type: 'leave_application',
              recipient,
              recipientRole: workflow.targetApproverRole,
              recipientUserId: targetRows[0].id,
              division,
              link,
              read: false,
              timestamp: new Date().toISOString(),
            });
          }
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

    notifications.forEach((notification) => {
      try { broadcastNotification(notification); } catch (e) {
        console.warn('[Notifications] broadcast failed:', e.message);
      }
    });

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
      applicantUserId: applicantId,
      applicantRole,
      actingOfficerUserId: actingUser?.id || null,
      actingOfficerRole: actingUser?.role || null,
    };

    if (hasActingOfficer) {
      sendEmailNotificationInBackground(
        () => sendActingOfficerAssignedEmail(leaveEmailData, assignedActingOfficer, actingUser),
        'Acting officer assignment'
      );
    } else if (workflow.targetApproverEmail) {
      sendEmailNotificationInBackground(
        () => sendApprovalRequestEmail({ leave: leaveEmailData, approverEmail: workflow.targetApproverEmail, approverRole: workflow.targetApproverRole }),
        'targeted approval request'
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
  if (req.user.role === 'secretary') {
    return res.status(403).json({ success: false, message: 'Secretaries cannot act as Acting Officers.' });
  }
  const leaveId = req.params.id;
  const { action, reason } = req.body;
  const actingOfficer = req.user.name;
  const actingOfficerRole = req.user.role;

  if (!action || (action !== 'confirm' && action !== 'decline')) {
    return res.status(400).json({
      success: false,
      message: 'Action must be "confirm" or "decline".'
    });
  }

  try {
    const actingProfileTables = {
      employee: 'employees',
      hod: 'hod',
      admin: 'admins',
      secretary: 'secretary',
      executive_officer: 'executive_officers',
    };
    const actingProfileTable = actingProfileTables[actingOfficerRole];
    const [leaveResult, profileResult] = await Promise.all([
      pool.query('SELECT * FROM leaves WHERE id = ?', [leaveId]),
      actingProfileTable
        ? pool.query(
          `SELECT name,
                  COALESCE(signature_image_extracted, signature_image) AS signature_image
                  ${actingOfficerRole === 'secretary' ? '' : ', division'}
           FROM ${actingProfileTable} WHERE id = ? LIMIT 1`,
          [req.user.id]
        )
        : Promise.resolve([[], []]),
    ]);
    const [leave] = leaveResult;

    if (leave.length === 0) {
      return res.status(404).json({ success: false, message: 'Leave record not found.' });
    }

    const leaveData = leave[0];
    const [actingProfiles] = profileResult;
    const actingProfile = actingProfiles[0];
    const hasActingIdentity = leaveData.acting_officer_user_id != null && leaveData.acting_officer_role;
    const authenticatedNameMatches = actingProfile && (
      hasActingIdentity
        ? Number(leaveData.acting_officer_user_id) === Number(req.user.id) &&
          leaveData.acting_officer_role === actingOfficerRole
        : leaveData.acting_officer?.trim().toLowerCase() === String(actingProfile.name || '').trim().toLowerCase()
    );
    const authorizedDivision = actingOfficerRole === 'secretary' || (
      actingProfile?.division && leaveData.division &&
      String(actingProfile.division).trim().toLowerCase() === String(leaveData.division).trim().toLowerCase()
    );
    if (!authenticatedNameMatches || !authorizedDivision) {
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

    let nextApproverEmail = leaveData.target_approver_email;
    const [divisionAdmins] = leaveData.applicant_role === 'employee'
      ? await pool.query(
        `SELECT id, email FROM admins WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))`,
        [leaveData.division]
      )
      : [[]];
    const adminApprovalRequired = leaveData.applicant_role === 'employee' &&
      divisionAdmins.length > 0;
    if (
      action === 'confirm' &&
      leaveData.target_approver_id &&
      leaveData.target_approver_role
    ) {
      const approverTables = { hod: 'hod', admin: 'admins', secretary: 'secretary', employee: 'employees', executive_officer: 'executive_officers' };
      const approverTable = approverTables[leaveData.target_approver_role];
      if (approverTable) {
        const [approverRows] = await pool.query(
          `SELECT email FROM ${approverTable} WHERE id = ? LIMIT 1`,
          [leaveData.target_approver_id]
        );
        nextApproverEmail = approverRows[0]?.email || nextApproverEmail || null;
      }
    }

    const actingOfficerSignature = actingProfile.signature_image || null;

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           acting_officer_confirmed = ?,
           declined_by = ?,
           decline_reason = ?,
           admin_approval_required = IF(applicant_role = 'employee', ?, admin_approval_required),
           target_approver_email = COALESCE(?, target_approver_email),
           acting_officer_signature = COALESCE(?, acting_officer_signature)
       WHERE id = ? AND status = 'Pending Acting Officer'`,
      [
        newStatus,
        confirmed,
        declinedBy,
        finalDeclineReason,
        adminApprovalRequired ? 1 : 0,
        nextApproverEmail,
        actingOfficerSignature,
        leaveId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        success: false,
        message: 'This leave request has already been processed.',
      });
    }

    const applicantNotificationLeave = {
      applicantUserId: leaveData.applicant_user_id,
      applicantRole: leaveData.applicant_role,
      employee: leaveData.employee,
      division: leaveData.division,
      actingOfficerUserId: leaveData.acting_officer_user_id,
      actingOfficerRole: leaveData.acting_officer_role,
    };
    void notifyLeaveApplicant(
      applicantNotificationLeave,
      action === 'confirm'
        ? `${leaveData.employee}'s leave request was confirmed by Acting Officer ${actingOfficer}.`
        : `${leaveData.employee}'s leave request was declined by Acting Officer ${actingOfficer}.${finalDeclineReason ? ` Reason: ${finalDeclineReason}` : ''}`
    ).catch((error) => console.warn('[Notifications] Acting Officer applicant notification failed:', error.message));
    const emailLeave = {
      employee: leaveData.employee,
      division: leaveData.division,
      type: leaveData.type,
      from: leaveData.from_date?.toISOString?.().split('T')[0] || leaveData.from_date,
      to: leaveData.to_date?.toISOString?.().split('T')[0] || leaveData.to_date,
      noOfDays: leaveData.no_of_days,
      actingOfficer: actingOfficer,
      reason: leaveData.reason,
      applicantUserId: leaveData.applicant_user_id,
      applicantRole: leaveData.applicant_role,
      actingOfficerUserId: leaveData.acting_officer_user_id,
      actingOfficerRole: leaveData.acting_officer_role,
    };

    if (action === 'confirm' && adminApprovalRequired) {
      const adminMessage = `${leaveData.employee}'s leave request is awaiting your approval after Acting Officer confirmation.`;
      void notifyDivisionAdmins(leaveData.division, adminMessage)
        .catch((error) => console.warn('[Notifications] Division Admin approval notification failed:', error.message));
      const hodMessage = `${leaveData.employee}'s leave request is awaiting HOD approval after Acting Officer confirmation.`;
      if (leaveData.target_approver_role === 'hod' &&
          (leaveData.target_approver_id || nextApproverEmail)) {
        void notifyApprovalTarget({
          target_approver_role: 'hod',
          target_approver_id: leaveData.target_approver_id,
          target_approver_email: nextApproverEmail,
          division: leaveData.division,
        }, hodMessage)
          .catch((error) => console.warn('[Notifications] Target HOD approval notification failed:', error.message));
      } else {
        void notifyDivisionHods(leaveData.division, hodMessage)
          .catch((error) => console.warn('[Notifications] Division HOD approval notification failed:', error.message));
      }
      divisionAdmins.forEach((admin) => {
        if (admin.email) {
          sendEmailNotificationInBackground(
            () => sendApprovalRequestEmail({
              leave: {
                employee: leaveData.employee,
                division: leaveData.division,
                type: leaveData.type,
                from: leaveData.from_date?.toISOString?.().split('T')[0] || leaveData.from_date,
                to: leaveData.to_date?.toISOString?.().split('T')[0] || leaveData.to_date,
                noOfDays: leaveData.no_of_days,
                reason: leaveData.reason,
              },
              approverEmail: admin.email,
              approverRole: 'admin',
            }),
            'Admin approval request'
          );
        }
      });
      if (leaveData.target_approver_role === 'hod' && nextApproverEmail) {
        sendEmailNotificationInBackground(
          () => sendApprovalRequestEmail({
            leave: {
              employee: leaveData.employee,
              division: leaveData.division,
              type: leaveData.type,
              from: leaveData.from_date?.toISOString?.().split('T')[0] || leaveData.from_date,
              to: leaveData.to_date?.toISOString?.().split('T')[0] || leaveData.to_date,
              noOfDays: leaveData.no_of_days,
              reason: leaveData.reason,
            },
            approverEmail: nextApproverEmail,
            approverRole: 'hod',
          }),
          'HOD approval request'
        );
      } else {
        sendEmailNotificationInBackground(
          () => sendHodAwaitingFinalApprovalEmail(emailLeave),
          'HOD final approval request'
        );
      }
    } else if (action === 'confirm' && leaveData.target_approver_role) {
      const approvalMessage =
        `${leaveData.employee}'s leave request is now awaiting your approval after Acting Officer confirmation.`;
      if (
        leaveData.applicant_role === 'employee' &&
        leaveData.target_approver_role === 'hod' &&
        !leaveData.target_approver_id &&
        !nextApproverEmail
      ) {
        void notifyDivisionHods(leaveData.division, approvalMessage)
          .catch((error) => console.warn('[Notifications] Division HOD approval notification failed:', error.message));
      } else {
        void notifyApprovalTarget({
          target_approver_role: leaveData.target_approver_role,
          target_approver_id: leaveData.target_approver_id,
          target_approver_email: nextApproverEmail,
          division: leaveData.division,
        }, approvalMessage)
          .catch((error) => console.warn('[Notifications] Approval target notification failed:', error.message));
      }
    }

    if (action === 'confirm') {
      if (!adminApprovalRequired && nextApproverEmail) {
        sendEmailNotificationInBackground(
          () => sendApprovalRequestEmail({
            leave: emailLeave,
            approverEmail: nextApproverEmail,
            approverRole: leaveData.target_approver_role,
          }),
          'configured approval request'
        );
      } else if (
        !adminApprovalRequired &&
        leaveData.applicant_role === 'employee' &&
        leaveData.target_approver_role === 'hod'
      ) {
        sendEmailNotificationInBackground(
          () => sendHodAwaitingFinalApprovalEmail(emailLeave),
          'HOD final approval request'
        );
      }
    } else {
      sendEmailNotificationInBackground(
        () => sendEmployeeDeclinedByActingOfficerEmail(emailLeave, actingOfficer, reason),
        'Acting officer decline'
      );
    }

    return res.status(200).json({
      success: true,
      message: `Leave ${action === 'confirm' ? 'confirmed' : 'declined'} by acting officer.`,
      id: leaveId,
      status: newStatus,
      emailSent: null,
      emailQueued: true,
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
      actingOfficerUserId: leave.acting_officer_user_id,
      actingOfficerRole: leave.acting_officer_role,
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
       ORDER BY COALESCE(l.created_at, l.applied_on) DESC, l.id DESC`,
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
  const actingOfficerRole = req.user.role;
  if (actingOfficerRole === 'secretary') {
    return res.status(403).json({ message: 'Secretaries cannot access Acting Officer approvals.' });
  }
  const actingProfileTables = {
    employee: 'employees',
    hod: 'hod',
    admin: 'admins',
    secretary: 'secretary',
    executive_officer: 'executive_officers',
  };
  const actingProfileTable = actingProfileTables[actingOfficerRole];

  try {
    if (!actingProfileTable) {
      return res.status(403).json({ message: 'This role cannot act as an Acting Officer.' });
    }

    const [profiles] = await pool.query(
      `SELECT name, ${actingOfficerRole === 'secretary' ? "NULL AS division" : "division"} FROM ${actingProfileTable} WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    if (!profiles.length) {
      return res.status(404).json({ message: 'Authenticated Acting Officer profile not found.' });
    }

    const actingOfficerName = profiles[0].name;
    const actingOfficerDivision = profiles[0].division || req.user.division;
    if (actingOfficerRole !== 'secretary' && !actingOfficerDivision) {
      return res.status(404).json({ message: 'Authenticated Acting Officer division not found.' });
    }
    const [rows] = await pool.query(
      `${LEAVE_BASE_QUERY}
       WHERE (
           (l.acting_officer_user_id = ? AND l.acting_officer_role = ?)
           OR (
             l.acting_officer_user_id IS NULL
             AND LOWER(TRIM(l.acting_officer)) = LOWER(TRIM(?))
             AND (? = 'secretary' OR LOWER(TRIM(l.division)) = LOWER(TRIM(?)))
           )
         )
       ORDER BY COALESCE(l.created_at, l.applied_on) DESC, l.id DESC`,
      [req.user.id, actingOfficerRole, actingOfficerName, actingOfficerRole, actingOfficerDivision || '']
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
       ORDER BY COALESCE(l.created_at, l.applied_on) DESC, l.id DESC`,
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
  let userEmail = (req.user.email || '').trim().toLowerCase();

  if (!action || (action !== 'approve' && action !== 'decline')) {
    return res.status(400).json({ message: 'Action must be "approve" or "decline".' });
  }

  try {
    const [approverProfile, check] = await Promise.all([
      pool.query(
        `SELECT email, division,
                COALESCE(signature_image_extracted, signature_image) AS signature_image
         FROM hod WHERE id = ? LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT id, status, applicant_user_id as applicantUserId,
                applicant_role as applicantRole, applied_by as appliedBy,
                employee, division, type, target_approver_id, target_approver_role, target_approver_email,
                admin_approval_required AS adminApprovalRequired,
                acting_officer_confirmed AS actingOfficerConfirmed,
                DATE_FORMAT(from_date, '%Y-%m-%d') as \`from\`,
                DATE_FORMAT(to_date, '%Y-%m-%d') as \`to\`,
                no_of_days as noOfDays, acting_officer as actingOfficer,
                acting_officer_user_id as actingOfficerUserId,
                acting_officer_role as actingOfficerRole,
                reason, address
         FROM leaves WHERE id = ?`,
        [leaveId]
      ),
    ]);
    const [profileRows] = approverProfile;
    const [leaveRows] = check;
    if (profileRows[0]?.email) {
      userEmail = profileRows[0].email.trim().toLowerCase();
    }

    if (leaveRows.length === 0) {
      return res.status(404).json({
        message: 'Leave record not found.',
      });
    }

    const leave = leaveRows[0];

    // Check self-approval before target/division authorization so the caller
    // receives the correct policy error even when their own request is not
    // otherwise visible in the approval queue.
    if (
      (leave.applicantRole === req.user.role && Number(leave.applicantUserId) === Number(userId)) ||
      (leave.applicantUserId == null && leave.appliedBy === req.user.name)
    ) {
      return res.status(403).json({ message: 'You cannot approve or reject your own leave request.' });
    }

    // Authorization check
    const isTargetedToMe =
      Number(leave.target_approver_id) === Number(userId) ||
      (leave.target_approver_email && leave.target_approver_email.trim().toLowerCase() === userEmail);

    const isInMyDivision =
      leave.division === division &&
      (leave.target_approver_role === null || leave.target_approver_role === 'hod') &&
      (leave.target_approver_id === null || Number(leave.target_approver_id) === Number(userId)) &&
      (!leave.target_approver_email || leave.target_approver_email.trim().toLowerCase() === userEmail);

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
    const adminApprovalRequired = leave.applicantRole === 'employee' &&
      Boolean(leave.adminApprovalRequired);
    const actingOfficerConfirmed = Boolean(leave.actingOfficerConfirmed);
    const validStatus = leave.applicantRole === 'employee'
      ? actingOfficerConfirmed &&
        (adminApprovalRequired
          ? ['Pending', 'Admin Approved'].includes(currentStatus)
          : currentStatus === 'Pending')
      : ['Pending', 'Admin Approved'].includes(currentStatus);

    if (!validStatus) {
      return res.status(409).json({
        message: adminApprovalRequired
          ? 'This employee leave must be confirmed by the Acting Officer before HOD approval.'
          : leave.applicantRole === 'employee'
            ? 'This employee leave must be confirmed by the Acting Officer before HOD approval.'
          : `Cannot process leave with status "${currentStatus}". The leave is not awaiting HOD approval.`,
      });
    }

    const newStatus = action === 'approve' ? 'Approved' : 'Declined';
    const declinedBy = action === 'decline' ? (req.user.name || 'HOD') : null;
    const finalDeclineReason = (action === 'decline' && reason) ? reason.trim() : null;
    const approvedBy = action === 'approve' ? (req.user.name || 'HOD') : null;
    const approverRole = action === 'approve' ? 'hod' : null;
    const approvedById = action === 'approve' ? userId : null;

    const approverSignature = profileRows[0]?.signature_image || null;

    const statusCondition = leave.applicantRole === 'employee'
      ? adminApprovalRequired
        ? "acting_officer_confirmed = 1 AND status IN ('Pending', 'Admin Approved')"
        : "acting_officer_confirmed = 1 AND status = 'Pending'"
      : "status IN ('Pending', 'Admin Approved')";
    const updateParams = [
      newStatus,
      declinedBy,
      finalDeclineReason,
      approvedBy,
      approverRole,
      approvedById,
      approverSignature,
      leaveId,
    ];

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           declined_by = ?,
           decline_reason = ?,
           approved_by = ?,
           approver_role = ?,
           approved_by_id = ?,
           approver_signature = COALESCE(?, approver_signature)
       WHERE id = ? AND ${statusCondition}`,
      updateParams
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: 'This leave request has already been processed by another approver.',
      });
    }

    const emailLeave = leave;
    void notifyLeaveApplicant(
      leave,
      action === 'approve'
        ? `${leave.appliedBy || leave.employee}'s leave request was approved by ${approvedBy}.`
        : `${leave.appliedBy || leave.employee}'s leave request was declined by ${declinedBy}.${finalDeclineReason ? ` Reason: ${finalDeclineReason}` : ''}`
    ).catch((error) => console.warn('[Notifications] HOD applicant notification failed:', error.message));
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

  const { type, from, to, reason, address, actingOfficer, actingOfficerUserId, actingOfficerRole } = req.body;

  if (!['employee', 'hod'].includes(role)) {
    return res.status(403).json({
      success: false,
      message: 'Only employees and HODs can edit their own pending leave requests.',
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

    const profileTable = role === 'hod' ? 'hod' : 'employees';
    const [[profile]] = await pool.query(`SELECT division, email FROM ${profileTable} WHERE id = ? LIMIT 1`, [userId]);
    const workflow = await resolveWorkflow(role, userId, profile?.email || req.user.email || '', profile?.division || leave.division);
    const nextActingOfficer = actingOfficer !== undefined ? (actingOfficer || null) : leave.acting_officer;
    let nextActingUser = null;
    if (nextActingOfficer) {
      nextActingUser = await findEligibleActingOfficer(
        nextActingOfficer,
        role === 'secretary' ? null : (profile?.division || leave.division),
        role,
        userId,
        actingOfficerRole,
        actingOfficerUserId
      );
      if (!nextActingUser) {
        return res.status(403).json({ success: false, message: 'The selected Acting Officer is not registered and authorized for this division.' });
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
           acting_officer = ?,
           acting_officer_user_id = ?,
           acting_officer_role = ?,
           status = ?,
           target_approver_id = ?,
           target_approver_role = ?,
           target_approver_email = ?,
           approved_by = NULL,
           approver_role = NULL,
           approved_by_id = NULL,
           approver_signature = NULL
       WHERE id = ? AND applicant_user_id = ? AND applicant_role = ?`,
      [
        type || null,
        from || null,
        to || null,
        computedDays || null,
        reason !== undefined ? reason : null,
        address !== undefined ? address : null,
        nextActingUser?.name || nextActingOfficer,
        nextActingUser?.id || null,
        nextActingUser?.role || null,
        nextActingOfficer ? 'Pending Acting Officer' : 'Pending',
        workflow.targetApproverId,
        workflow.targetApproverRole,
        workflow.targetApproverEmail,
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
        acting_officer_user_id as actingOfficerUserId,
        acting_officer_role as actingOfficerRole,
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

    if (nextActingUser && (
      Number(nextActingUser.id) !== Number(leave.acting_officer_user_id) ||
      nextActingUser.role !== leave.acting_officer_role
    )) {
      const emailLeave = {
        ...updated[0],
        applicantUserId: updated[0].applicantUserId,
        applicantRole: updated[0].applicantRole,
      };
      void notifyProfile(
        nextActingUser.role,
        nextActingUser.id,
        `${updated[0].employee} updated a leave request and assigned you as Acting Officer.`,
        'acting_officer',
        updated[0].division,
        actingOfficerDashboardLink(nextActingUser.role)
      ).catch((error) => console.warn('[Notifications] Acting Officer reassignment notification failed:', error.message));
      sendEmailNotificationInBackground(
        () => sendActingOfficerAssignedEmail(emailLeave, nextActingUser.name, nextActingUser),
        'Acting officer reassignment'
      );
    }

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

router.get('/hod/employees', verifyToken, requireHOD, async (req, res) => {
  try {
    const [hodRows] = await pool.query(
      'SELECT division FROM hod WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!hodRows.length || !hodRows[0].division) {
      return res.status(404).json({ message: 'HOD division could not be resolved.' });
    }

    const division = hodRows[0].division;
    const [employees] = await pool.query(
      `SELECT id, name, designation, division, email,
        DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, status
       FROM employees
       WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))
       ORDER BY name ASC`,
      [division]
    );
    return res.status(200).json(employees);
  } catch (error) {
    console.error('[HOD API Error] GET /hod/employees:', error);
    return res.status(500).json({ message: 'Failed to fetch division employees.' });
  }
});

router.post('/hod/employees', verifyToken, requireHOD, async (req, res) => {
  const { name, designation, email, appointment_date } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedDesignation = typeof designation === 'string' ? designation.trim() : '';
  const normalizedAppointmentDate = typeof appointment_date === 'string' && appointment_date.trim()
    ? appointment_date.trim()
    : null;

  if (
    typeof name !== 'string' || !name.trim() ||
    (designation != null && typeof designation !== 'string') ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    name.trim().length > 100 ||
    normalizedDesignation.length > 100 ||
    normalizedEmail.length > 150
  ) {
    return res.status(400).json({
      message: 'A valid name and email are required. Designation and appointment date are optional.',
    });
  }
  if (normalizedAppointmentDate) {
    const parsedAppointmentDate = new Date(`${normalizedAppointmentDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalizedAppointmentDate) ||
      !Number.isFinite(parsedAppointmentDate.getTime()) ||
      parsedAppointmentDate.toISOString().slice(0, 10) !== normalizedAppointmentDate
    ) {
      return res.status(400).json({ message: 'A valid appointment date is required.' });
    }
  }

  try {
    const [hodRows] = await pool.query(
      'SELECT division FROM hod WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!hodRows.length || !hodRows[0].division) {
      return res.status(404).json({ message: 'HOD division could not be resolved.' });
    }

    const division = hodRows[0].division;
    const accountTables = ['employees', 'admins', 'hod', 'secretary', 'executive_officers'];
    const duplicateChecks = await Promise.all(accountTables.map((table) =>
      pool.query(
        `SELECT id FROM ${table} WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1`,
        [normalizedEmail]
      )
    ));
    if (duplicateChecks.some(([rows]) => rows.length > 0)) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const temporaryPassword = String(req.body.password || '').trim() || 'Ministry@123';
    if (temporaryPassword.length < 6 || temporaryPassword.length > 128) {
      return res.status(400).json({ message: 'Password must be between 6 and 128 characters.' });
    }
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    const [result] = await pool.query(
      `INSERT INTO employees
       (name, designation, division, email, password, appointment_date, status, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, 'Active', 1)`,
      [name.trim(), normalizedDesignation || null, division, normalizedEmail, hashedPassword, normalizedAppointmentDate]
    );

    return res.status(201).json({
      message: 'Employee created successfully. Share the temporary password securely.',
      employee: {
        id: result.insertId,
        name: name.trim(),
        designation: normalizedDesignation || null,
        division,
        email: normalizedEmail,
        appointment_date: normalizedAppointmentDate,
        status: 'Active',
      },
      temporaryPassword,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    console.error('[HOD API Error] POST /hod/employees:', error);
    return res.status(500).json({ message: 'Failed to create division employee.' });
  }
});

router.put('/hod/employees/:id', verifyToken, requireHOD, async (req, res) => {
  const { name, designation, division: requestedDivision, email, appointment_date, status } = req.body;
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedDesignation = typeof designation === 'string' ? designation.trim() : '';
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedAppointmentDate = typeof appointment_date === 'string' && appointment_date.trim()
    ? appointment_date.trim()
    : null;
  const validStatuses = ['Active', 'Inactive', 'On Leave'];

  if (
    !normalizedName ||
    normalizedName.length > 100 ||
    (designation != null && typeof designation !== 'string') ||
    normalizedDesignation.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    normalizedEmail.length > 150 ||
    !validStatuses.includes(status)
  ) {
    return res.status(400).json({ message: 'Enter valid employee details and status.' });
  }
  if (normalizedAppointmentDate) {
    const parsedAppointmentDate = new Date(`${normalizedAppointmentDate}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalizedAppointmentDate) ||
      !Number.isFinite(parsedAppointmentDate.getTime()) ||
      parsedAppointmentDate.toISOString().slice(0, 10) !== normalizedAppointmentDate
    ) {
      return res.status(400).json({ message: 'A valid appointment date is required.' });
    }
  }

  try {
    const [hodRows] = await pool.query(
      'SELECT division FROM hod WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!hodRows.length || !hodRows[0].division) {
      return res.status(404).json({ message: 'HOD division could not be resolved.' });
    }

    const division = hodRows[0].division;
    if (
      typeof requestedDivision !== 'string' ||
      requestedDivision.trim().toLowerCase() !== division.trim().toLowerCase()
    ) {
      return res.status(403).json({ message: 'You can only assign employees to your own division.' });
    }

    const [ownedEmployees] = await pool.query(
      `SELECT id FROM employees
       WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))
       LIMIT 1`,
      [req.params.id, division]
    );
    if (!ownedEmployees.length) {
      return res.status(404).json({ message: 'Employee not found in your division.' });
    }

    const accountTables = ['employees', 'admins', 'hod', 'secretary', 'executive_officers'];
    const duplicateChecks = await Promise.all(accountTables.map((table) =>
      pool.query(
        `SELECT id FROM ${table}
         WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))${table === 'employees' ? ' AND id <> ?' : ''}
         LIMIT 1`,
        table === 'employees' ? [normalizedEmail, req.params.id] : [normalizedEmail]
      )
    ));
    if (duplicateChecks.some(([rows]) => rows.length > 0)) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const [result] = await pool.query(
      `UPDATE employees
       SET name = ?, designation = ?, division = ?, email = ?, appointment_date = ?, status = ?
       WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))`,
      [
        normalizedName,
        normalizedDesignation || null,
        division,
        normalizedEmail,
        normalizedAppointmentDate,
        status,
        req.params.id,
        division,
      ]
    );
    if (!result.affectedRows) {
      const [stillOwned] = await pool.query(
        `SELECT id FROM employees
         WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))
         LIMIT 1`,
        [req.params.id, division]
      );
      if (!stillOwned.length) {
        return res.status(404).json({ message: 'Employee not found in your division.' });
      }
    }

    return res.status(200).json({
      message: 'Employee updated successfully.',
      employee: {
        id: Number(req.params.id),
        name: normalizedName,
        designation: normalizedDesignation || null,
        division,
        email: normalizedEmail,
        appointment_date: normalizedAppointmentDate,
        status,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    console.error('[HOD API Error] PUT /hod/employees/:id:', error);
    return res.status(500).json({ message: 'Failed to update division employee.' });
  }
});

router.patch('/hod/employees/:id/status', verifyToken, requireHOD, async (req, res) => {
  try {
    const [hodRows] = await pool.query(
      'SELECT division FROM hod WHERE id = ? LIMIT 1',
      [req.user.id]
    );
    if (!hodRows.length || !hodRows[0].division) {
      return res.status(404).json({ message: 'HOD division could not be resolved.' });
    }

    const division = hodRows[0].division;
    const [employees] = await pool.query(
      `SELECT status FROM employees
       WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))
       LIMIT 1`,
      [req.params.id, division]
    );
    if (!employees.length) {
      return res.status(404).json({ message: 'Employee not found in your division.' });
    }

    const status = employees[0].status === 'Active' ? 'Inactive' : 'Active';
    const [result] = await pool.query(
      `UPDATE employees SET status = ?
       WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))`,
      [status, req.params.id, division]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Employee not found in your division.' });
    }
    return res.status(200).json({
      message: `Employee ${status === 'Active' ? 'activated' : 'deactivated'} successfully.`,
      status,
    });
  } catch (error) {
    console.error('[HOD API Error] PATCH /hod/employees/:id/status:', error);
    return res.status(500).json({ message: 'Failed to update employee status.' });
  }
});

// ============================================
// ADMIN-ONLY ROUTES
// ✅ Everything below this line is locked to Admins ONLY
// ============================================
router.use(verifyToken, (req, res, next) => {
  if (req.path === '/approval-settings') {
    if (!['admin', 'hod', 'secretary'].includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access forbidden. Admin, HOD, or Secretary privileges required.',
      });
    }
    return next();
  }
  return requireAdmin(req, res, next);
});

router.get('/dashboard-stats', async (req, res) => {
  const division = req.user.division;

  try {
    const [empCount] = await pool.query(
      'SELECT COUNT(*) as count FROM employees WHERE division = ?', [division]);

    const [pendingCount] = await pool.query(
      `SELECT COUNT(*) as count FROM leaves
       WHERE division = ? AND status = 'Pending'
         AND (applicant_role IS NULL OR admin_approval_required = 1)`,
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
       WHERE l.division = ?
         AND (l.applicant_role IS NULL OR l.applicant_role = 'employee')
         AND (l.applicant_role IS NULL OR l.admin_approval_required = 1)
       ORDER BY COALESCE(l.created_at, l.applied_on) DESC, l.id DESC`,
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
      `SELECT id, status,
              admin_approval_required AS adminApprovalRequired,
              employee, division, type,
              applicant_user_id AS applicantUserId, applicant_role AS applicantRole,
              acting_officer_user_id AS actingOfficerUserId,
              acting_officer_role AS actingOfficerRole,
              target_approver_id AS targetApproverId,
              target_approver_role AS targetApproverRole,
              target_approver_email AS targetApproverEmail,
              (SELECT email FROM hod WHERE id = leaves.target_approver_id
               AND leaves.target_approver_role = 'hod' LIMIT 1) AS finalApproverEmail,
              DATE_FORMAT(from_date, '%Y-%m-%d') AS \`from\`,
              DATE_FORMAT(to_date, '%Y-%m-%d') AS \`to\`,
              no_of_days AS noOfDays, acting_officer AS actingOfficer, reason, address,
              (SELECT COALESCE(signature_image_extracted, signature_image)
               FROM admins WHERE id = ? LIMIT 1) AS adminSignature
       FROM leaves WHERE id = ? AND division = ?`,
      [req.user.id, leaveId, division]
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
    const employeeLeave = check[0].applicantRole === 'employee';
    const adminApprovalRequired = employeeLeave && Boolean(check[0].adminApprovalRequired);

    if (employeeLeave && !adminApprovalRequired) {
      return res.status(403).json({
        message: 'This employee leave is assigned directly to the HOD because the division has no Admin.',
      });
    }

    if (employeeLeave && currentStatus !== 'Pending') {
      return res.status(409).json({
        message: `Cannot process leave with status "${currentStatus}". It is not awaiting Admin approval.`,
      });
    }

    if (!employeeLeave && !['Pending', 'Admin Approved'].includes(currentStatus)) {
      return res.status(400).json({
        message: `Cannot update leave with status "${currentStatus}". Only "Pending" or "Admin Approved" leaves can be processed.`,
      });
    }

    const allowedStatuses = employeeLeave
      ? ['Admin Approved', 'Declined']
      : ['Approved', 'Admin Approved', 'Declined'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: employeeLeave
          ? 'Admin can only pre-approve or decline an employee leave. HOD gives the final approval.'
          : 'Admin can only set status to "Approved", "Admin Approved", or "Declined".',
      });
    }

    const finalDeclineReason = (status === 'Declined' && reason) ? reason.trim() : null;
    const finalDeclinedBy = status === 'Declined' ? 'Admin' : null;
    const isFinalApproval = status === 'Approved';
    const approvedBy = isFinalApproval ? (req.user.name || 'Admin') : null;
    const approverRole = isFinalApproval ? 'admin' : null;
    const recommendedByAdmin = status === 'Admin Approved' ? 1 : 0;
    const adminSignature = check[0].adminSignature || null;

    const [result] = await pool.query(
      `UPDATE leaves
       SET status = ?,
           recommended_by_admin = ?,
           declined_by = ?,
           decline_reason = ?,
           approved_by = ?,
           approver_role = ?,
           admin_signature = COALESCE(?, admin_signature)
       WHERE id = ? AND division = ? AND ${employeeLeave ? "status = 'Pending'" : "status IN ('Pending', 'Admin Approved')"}`,
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

    {
      const emailLeave = check[0];
      const statusMessage = status === 'Declined'
        ? `Your ${emailLeave.type} leave (${emailLeave.from} to ${emailLeave.to}) was declined by Admin.${finalDeclineReason ? ` Reason: ${finalDeclineReason}` : ''}`
        : status === 'Admin Approved'
          ? `Your ${emailLeave.type} leave (${emailLeave.from} to ${emailLeave.to}) was pre-approved by Admin and forwarded for final approval.`
          : `Your ${emailLeave.type} leave (${emailLeave.from} to ${emailLeave.to}) was approved by Admin.`;
      void notifyLeaveApplicant(emailLeave, statusMessage)
        .catch((error) => console.warn('[Notifications] Admin applicant notification failed:', error.message));
      void notifyActingOfficer(
        emailLeave,
        `${emailLeave.employee}'s ${emailLeave.type} leave was ${status === 'Declined' ? 'declined' : status === 'Admin Approved' ? 'pre-approved' : 'approved'} by Admin.`
      ).catch((error) => console.warn('[Notifications] Admin acting-officer notification failed:', error.message));
      const hodMessage = status === 'Admin Approved'
        ? `${emailLeave.employee}'s ${emailLeave.type} leave is awaiting final HOD approval.`
        : `${emailLeave.employee}'s ${emailLeave.type} leave was ${status.toLowerCase()} by Admin.`;
      if (status === 'Admin Approved') {
        if (emailLeave.targetApproverRole === 'hod' &&
            (emailLeave.targetApproverId || emailLeave.targetApproverEmail)) {
          void notifyApprovalTarget({
            target_approver_role: emailLeave.targetApproverRole,
            target_approver_id: emailLeave.targetApproverId,
            target_approver_email: emailLeave.targetApproverEmail || emailLeave.finalApproverEmail,
            division,
          }, hodMessage)
            .catch((error) => console.warn('[Notifications] Target HOD approval notification failed:', error.message));
        } else {
          void notifyDivisionHods(division, hodMessage)
            .catch((error) => console.warn('[Notifications] HOD status notification failed:', error.message));
        }

        const hodEmail = emailLeave.targetApproverEmail || emailLeave.finalApproverEmail;
        sendEmailNotificationInBackground(
          () => hodEmail
            ? sendApprovalRequestEmail({ leave: emailLeave, approverEmail: hodEmail, approverRole: 'hod' })
            : sendHodAwaitingFinalApprovalEmail(emailLeave),
          'HOD final approval request'
        );
      } else if (status === 'Declined') {
        sendEmailNotificationInBackground(
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
      emailSent: null,
      emailQueued: true,
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
const requireApprovalSettingsRole = (req, res, next) => {
  if (!['admin', 'hod', 'secretary'].includes(req.user.role)) {
    return res.status(403).json({
      message: 'Access forbidden. Admin, HOD, or Secretary privileges required.',
    });
  }
  next();
};

async function getApprovalSettingsContext(role, userId) {
  const profileTable = { admin: 'admins', hod: 'hod' }[role];
  if (!profileTable && role !== 'secretary') return null;
  const [profileRows] = role === 'secretary'
    ? await pool.query(
      'SELECT id, name, email, NULL AS division FROM secretary WHERE id = ? LIMIT 1',
      [userId]
    )
    : await pool.query(
      `SELECT id, name, email, division FROM ${profileTable} WHERE id = ? LIMIT 1`,
      [userId]
    );

  if (profileRows.length === 0) return null;

  const profile = profileRows[0];
  if (role === 'admin') {
    const [hodRows] = await pool.query(
      `SELECT id, name, email, designation, division, 'hod' AS role
       FROM hod
       WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))
       ORDER BY name ASC, id ASC`,
      [profile.division]
    );
    return { profile, candidates: hodRows };
  }

  if (role === 'secretary') {
    const [hodRows] = await pool.query(
      `SELECT id, name, email, designation, division, 'hod' AS role
       FROM hod
       ORDER BY division ASC, name ASC, id ASC`
    );
    return { profile, candidates: hodRows };
  }

  // HOD candidates are restricted to same-division HODs explicitly named as
  // approvers for this HOD. Secretary candidates follow matching hierarchy
  // rules; an untargeted Secretary rule means any registered Secretary.
  const [rules] = await pool.query(
    `SELECT approver_role AS approverRole, approver_id AS approverId,
            approver_email AS approverEmail
     FROM approval_rules
     WHERE rule_type = 'USER_HIERARCHY'
       AND applicant_role = 'hod'
       AND (
         applicant_id = ? OR
         (applicant_email IS NOT NULL AND LOWER(TRIM(applicant_email)) = LOWER(TRIM(?)))
       )
     ORDER BY id ASC`,
    [profile.id, profile.email]
  );

  const hodRules = rules.filter((rule) => rule.approverRole === 'hod');
  const secretaryRules = rules.filter((rule) => rule.approverRole === 'secretary');
  const candidates = [];

  if (hodRules.length > 0) {
    const hodIds = hodRules.map((rule) => rule.approverId).filter(Boolean);
    const hodEmails = hodRules.map((rule) => rule.approverEmail).filter(Boolean);
    const [hodRows] = await pool.query(
      `SELECT id, name, email, designation, division, 'hod' AS role
       FROM hod
       WHERE LOWER(TRIM(division)) = LOWER(TRIM(?))
         AND (
           id IN (?) OR
           LOWER(TRIM(email)) IN (?)
         )
       ORDER BY name ASC, id ASC`,
      [profile.division, hodIds.length ? hodIds : [0], hodEmails.length ? hodEmails : ['']]
    );
    candidates.push(...hodRows);
  } else if (rules.length === 0) {
    // The existing HOD approval endpoint authorizes other HODs in the same
    // division when no user-specific rule exists. Keep that default visible
    // here so current HOD accounts are not blocked by stale seed identities.
    const [sameDivisionHods] = await pool.query(
      `SELECT id, name, email, designation, division, 'hod' AS role
       FROM hod
       WHERE LOWER(TRIM(division)) = LOWER(TRIM(?)) AND id <> ?
       ORDER BY name ASC, id ASC`,
      [profile.division, profile.id]
    );
    candidates.push(...sameDivisionHods);
  }

  const hasUntargetedSecretaryRule = secretaryRules.some(
    (rule) => !rule.approverId && !rule.approverEmail
  );
  const secretaryIds = secretaryRules.map((rule) => rule.approverId).filter(Boolean);
  const secretaryEmails = secretaryRules.map((rule) => rule.approverEmail).filter(Boolean);

  if (hasUntargetedSecretaryRule || rules.length === 0) {
    const [secretaryRows] = await pool.query(
      `SELECT id, name, email, designation, NULL AS division, 'secretary' AS role
       FROM secretary ORDER BY name ASC, id ASC`
    );
    candidates.push(...secretaryRows);
  } else {
    const [secretaryRows] = await pool.query(
      `SELECT id, name, email, designation, NULL AS division, 'secretary' AS role
       FROM secretary
       WHERE id IN (?) OR LOWER(TRIM(email)) IN (?)
       ORDER BY name ASC, id ASC`,
      [secretaryIds.length ? secretaryIds : [0], secretaryEmails.length ? secretaryEmails : ['']]
    );
    candidates.push(...secretaryRows);
  }

  const uniqueCandidates = Array.from(
    new Map(candidates.map((candidate) => [`${candidate.role}:${candidate.id}`, candidate])).values()
  );
  return { profile, candidates: uniqueCandidates };
}

router.get('/approval-settings', verifyToken, requireApprovalSettingsRole, async (req, res) => {
  const { role, id } = req.user;

  try {
    const context = await getApprovalSettingsContext(role, id);
    if (!context) return res.status(404).json({ message: 'Authenticated profile not found.' });

    const [ruleRows] = await pool.query(
      `SELECT approver_id AS approverId, approver_role AS approverRole,
              approver_email AS approverEmail, approver_name AS approverName
       FROM approval_rules
       WHERE rule_type = 'USER_HIERARCHY' AND applicant_role = ?
         AND (
           applicant_id = ? OR
           (applicant_email IS NOT NULL AND LOWER(TRIM(applicant_email)) = LOWER(TRIM(?)))
         )
       ORDER BY id ASC LIMIT 1`,
      [role, id, context.profile.email]
    );

    const rule = ruleRows[0] || null;
    const selectedCandidate = rule
      ? context.candidates.find((candidate) =>
          (rule.approverId && Number(candidate.id) === Number(rule.approverId)) ||
          (rule.approverEmail && candidate.email?.toLowerCase() === rule.approverEmail.toLowerCase())
        )
      : null;

    return res.status(200).json({
      candidates: context.candidates,
      selected: selectedCandidate ? {
        id: selectedCandidate.id,
        role: selectedCandidate.role,
        email: selectedCandidate.email,
        name: selectedCandidate.name,
      } : null,
    });
  } catch (error) {
    console.error('[API Error] GET /approval-settings:', error);
    return res.status(500).json({ message: 'Failed to retrieve approval settings.' });
  }
});

router.put('/approval-settings', verifyToken, requireApprovalSettingsRole, async (req, res) => {
  const { role, id, email: tokenEmail, name: tokenName } = req.user;
  const rawApproverId = req.body?.approverId;
  const requestedApproverRole = req.body?.approverRole || null;
  const approverId = rawApproverId === '' || rawApproverId === null || rawApproverId === undefined
    ? null
    : Number(rawApproverId);

  if (approverId !== null && (!Number.isInteger(approverId) || approverId <= 0)) {
    return res.status(400).json({ message: 'A valid approver must be selected.' });
  }

  try {
    const context = await getApprovalSettingsContext(role, id);
    if (!context) return res.status(404).json({ message: 'Authenticated profile not found.' });

    const applicant = context.profile;
    let approver = null;
    const approverRole = approverId === null
      ? (role === 'admin' ? 'hod' : 'secretary')
      : requestedApproverRole;

    if (approverId !== null) {
      approver = context.candidates.find((candidate) =>
        Number(candidate.id) === approverId && candidate.role === approverRole
      );

      if (!approver) {
        return res.status(403).json({ message: 'The selected officer is not authorized for your approval hierarchy.' });
      }
    }

    const [existingRules] = await pool.query(
      `SELECT id FROM approval_rules
       WHERE rule_type = 'USER_HIERARCHY' AND applicant_role = ?
         AND (
           applicant_id = ? OR
           (applicant_email IS NOT NULL AND LOWER(TRIM(applicant_email)) = LOWER(TRIM(?)))
         )
       ORDER BY id ASC LIMIT 1`,
      [role, id, applicant.email]
    );

    const ruleValues = [
      applicant.division || null,
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
