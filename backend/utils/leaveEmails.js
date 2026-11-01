const pool = require('../config/db');
const { sendEmail, wrapTemplate, getFrontendUrl } = require('./emailService');

function emailAction(path, label) {
  const url = getFrontendUrl(path);
  return {
    url,
    html: `
      <div style="text-align:center; margin:24px 0;">
        <a href="${url}" style="background:#2563eb; color:#fff; text-decoration:none; padding:11px 24px; border-radius:6px; font-weight:600; font-size:13px; display:inline-block;">
          ${label}
        </a>
      </div>
    `,
  };
}

function actingOfficerApprovalsPath(role) {
  const paths = {
    employee: '/userdashboard?tab=actingapprovals',
    hod: '/hoddashboard?tab=acting-approvals',
    admin: '/Admindashboard?tab=acting-approvals',
    secretary: '/secretarydashboard?tab=acting-approvals',
    executive_officer: '/executiveofficerdashboard?tab=acting-approvals',
  };
  return paths[role] || paths.employee;
}

const profileTableByRole = {
  employee: 'employees',
  admin: 'admins',
  hod: 'hod',
  secretary: 'secretary',
  executive_officer: 'executive_officers',
};

async function findEmployeeEmail(name, division, role = null, userId = null) {
  const preferredRole = String(role || '').toLowerCase();
  const preferredTable = profileTableByRole[preferredRole];

  if (preferredTable && userId != null) {
    const [rows] = await pool.query(
      `SELECT email FROM ${preferredTable} WHERE id = ? LIMIT 1`,
      [userId]
    );
    return rows[0]?.email || null;
  }

  if (!name) return null;

  const roleOrder = preferredTable
    ? [preferredRole]
    : ['employee', 'admin', 'hod', 'secretary', 'executive_officer'];
  for (const candidateRole of roleOrder) {
    const table = profileTableByRole[candidateRole];
    const divisionFilter = candidateRole === 'secretary'
      ? ''
      : 'AND (? IS NULL OR LOWER(TRIM(division)) = LOWER(TRIM(?)))';
    const params = candidateRole === 'secretary'
      ? [name]
      : [name, division || null, division || null];
    const [rows] = await pool.query(
      `SELECT email FROM ${table}
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ${divisionFilter}
       LIMIT 1`,
      params
    );
    if (rows[0]?.email) return rows[0].email;
  }

  return null;
}

async function findApplicantEmail(leave) {
  const role = leave?.applicantRole || leave?.applicant_role;
  const userId = leave?.applicantUserId ?? leave?.applicant_user_id;
  return findEmployeeEmail(leave?.employee, leave?.division, role, userId);
}

async function findDivisionAdminEmail(division) {
  if (!division) return null;
  const [rows] = await pool.query(
    `SELECT email FROM admins WHERE LOWER(TRIM(division)) = LOWER(TRIM(?)) LIMIT 1`,
    [division]
  );
  return rows[0]?.email || null;
}

async function findDivisionHodEmail(division) {
  if (!division) return null;
  const [rows] = await pool.query(
    `SELECT email FROM hod WHERE LOWER(TRIM(division)) = LOWER(TRIM(?)) LIMIT 1`,
    [division]
  );
  return rows[0]?.email || null;
}

async function sendHodAwaitingFinalApprovalEmail(leave) {
  const email = await findDivisionHodEmail(leave.division);
  if (!email) throw new Error('HOD email address was not found for the division.');
  const action = emailAction('/hoddashboard?tab=leaves', 'Review Leave Request');
  await sendEmail({
    to: email,
    subject: `Leave Approval Required — ${leave.employee}`,
    text: `${leave.employee} submitted a ${leave.type} leave from ${leave.from} to ${leave.to}. Review the request: ${action.url}`,
    html: wrapTemplate({ title: 'Leave Approval Required', accentColor: '#7c3aed', bodyHtml: `<p>Hello,</p><p>${leave.employee} submitted a leave request awaiting HOD approval.</p>${action.html}` }),
  });
}

/**
 * Send the same "leave details" email to Admin AND HOD in parallel.
 * Returns { adminSent, hodSent } — never throws unless both fail.
 */
async function sendToAdminAndHod({ leave, subject, text, mailHtml, accentAdmin, accentHod }) {
  const adminEmail = await findDivisionAdminEmail(leave.division);
  const hodEmail = await findDivisionHodEmail(leave.division);

  if (!adminEmail && !hodEmail) {
    throw new Error('Neither Admin nor HOD email could be resolved for division: ' + leave.division);
  }

  const results = { adminSent: false, hodSent: false };
  const errors = [];

  if (adminEmail) {
    try {
      await sendEmail({
        to: adminEmail,
        subject,
        text,
        html: wrapTemplate({ title: subject, accentColor: accentAdmin || '#2563eb', bodyHtml: mailHtml }),
      });
      results.adminSent = true;
    } catch (err) {
      errors.push({ target: 'admin', error: err });
    }
  }

  if (hodEmail) {
    try {
      await sendEmail({
        to: hodEmail,
        subject,
        text,
        html: wrapTemplate({ title: subject, accentColor: accentHod || '#7c3aed', bodyHtml: mailHtml }),
      });
      results.hodSent = true;
    } catch (err) {
      errors.push({ target: 'hod', error: err });
    }
  }

  // Only throw if BOTH failed (partial success is acceptable)
  if (!results.adminSent && !results.hodSent && errors.length > 0) {
    throw Object.assign(
      new Error('Failed to send leave notification to both Admin and HOD.'),
      { code: errors[0].error?.code }
    );
  }

  return results;
}

// ═══════════════════════════════════════════════
// STAGE 1 — Employee submits leave → notify Acting Officer
// ═══════════════════════════════════════════════
async function sendActingOfficerAssignedEmail(leave, actingOfficerName, actingUser = null) {
  const role = actingUser?.role || leave.actingOfficerRole || leave.acting_officer_role;
  const userId = actingUser?.id || leave.actingOfficerUserId || leave.acting_officer_user_id;
  const email = actingUser?.email || await findEmployeeEmail(actingOfficerName, leave.division, role, userId);
  if (!email) {
    throw new Error('Acting officer email address was not found.');
  }
  const action = emailAction(actingOfficerApprovalsPath(role), 'Open Acting Approvals');

  await sendEmail({
    to: email,
    subject: `New Acting Officer Assignment — ${leave.employee}'s ${leave.type} Leave`,
    text: `You have been assigned as Acting Officer for ${leave.employee}'s ${leave.type} leave from ${leave.from} to ${leave.to}. Sign in to review and confirm or decline this assignment: ${action.url}`,
    html: wrapTemplate({
      title: 'New Acting Officer Assignment',
      accentColor: '#0f766e',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong style="color: #0f766e;">${actingOfficerName}</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">You have been assigned as the <strong>Acting Officer</strong> for the following leave request:</p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Employee</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.employee}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Division</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.division}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.to}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc;"><strong>Days</strong></td><td style="padding:9px 12px; color: #1e293b;">${leave.noOfDays}</td></tr>
          </table>
          
          <p style="color: #475569; margin-top: 16px;">Please log in to the system to <strong>confirm</strong> or <strong>decline</strong> this assignment.</p>
          
          ${action.html}
        </div>
      `,
    }),
  });
}

// ═══════════════════════════════════════════════
// STAGE 1b — Employee submits leave WITHOUT acting officer → notify BOTH Admin & HOD (parallel)
// ═══════════════════════════════════════════════
async function sendAdminNewLeaveEmail(leave) {
  const { employee, division, type, from, to, noOfDays, reason, address } = leave;

  const mailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
      <p style="margin-bottom: 10px;">Hello,</p>
      <p style="color: #475569; margin-bottom: 16px;">A new leave application has been submitted. You can approve or decline it directly — no acting officer was assigned.</p>

      <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Employee</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${employee}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Division</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${division}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${type}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${from}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${to}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''}"><strong>Days</strong></td><td style="padding:9px 12px; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #1e293b;">${noOfDays}</td></tr>
        ${reason ? `<tr><td style="padding:9px 12px; background:#f8fafc; ${address ? 'border-bottom: 1px solid #e2e8f0;' : ''}"><strong>Reason</strong></td><td style="padding:9px 12px; ${address ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #1e293b;">${reason}</td></tr>` : ''}
        ${address ? `<tr><td style="padding:9px 12px; background:#f8fafc;"><strong>Address on Leave</strong></td><td style="padding:9px 12px; color: #1e293b;">${address}</td></tr>` : ''}
      </table>

      <p style="color: #475569; margin-top: 16px;">Please log in to the Ministry Leave System to review this request. <strong>Whichever of you (Admin or HOD) acts first will finalize the leave.</strong></p>
      ${emailAction('/Admindashboard?tab=leaves', 'Review Leave Request').html}
    </div>
  `;

  await sendToAdminAndHod({
    leave,
    subject: `New Leave Application — ${employee} (${division})`,
    text: `${employee} has submitted a ${type} leave from ${from} to ${to}. Sign in to review.`,
    mailHtml,
    accentAdmin: '#2563eb',
    accentHod: '#7c3aed',
  });
}

async function sendApprovalRequestEmail({ leave, approverEmail, approverRole }) {
  if (!approverEmail) throw new Error('Approval recipient email address was not found.');
  const roleLabel = approverRole === 'secretary' ? 'Secretary' : approverRole === 'hod' ? 'HOD' : 'Admin';
  const actionPath = approverRole === 'secretary' ? '/secretarydashboard?tab=pending' : approverRole === 'hod' ? '/hoddashboard?tab=leaves' : '/Admindashboard?tab=leaves';
  const action = emailAction(actionPath, 'Review Leave Request');
  await sendEmail({
    to: approverEmail,
    subject: `Leave Approval Required — ${leave.employee}`,
    text: `${leave.employee} submitted a ${leave.type} leave from ${leave.from} to ${leave.to}. Review as ${roleLabel}: ${action.url}`,
    html: wrapTemplate({
      title: 'Leave Approval Required',
      accentColor: '#2563eb',
      bodyHtml: `<p>Hello,</p><p>${leave.employee} submitted a leave request for your approval as the authorized ${roleLabel}.</p><p><strong>Division:</strong> ${leave.division}<br/><strong>Leave:</strong> ${leave.type}<br/><strong>Dates:</strong> ${leave.from} to ${leave.to}</p>${action.html}`,
    }),
  });
}

// ═══════════════════════════════════════════════
// STAGE 2a — Acting Officer CONFIRMED → notify BOTH Admin & HOD (parallel)
// ═══════════════════════════════════════════════
async function sendAdminAwaitingApprovalEmail(leave, actingOfficerName) {
  const action = emailAction('/Admindashboard?tab=leaves', 'Review Leave Request');
  const mailHtml = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
      <p style="margin-bottom: 10px;">Hello,</p>
      <p style="color: #475569; margin-bottom: 16px;">The following leave request has been <strong>confirmed by the Acting Officer</strong> and is now awaiting your approval.</p>
      
      <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Employee</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.employee}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.to}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Days</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.noOfDays}</td></tr>
        <tr><td style="padding:9px 12px; background:#f8fafc;"><strong>Acting Officer</strong></td><td style="padding:9px 12px; color: #1e293b;">${actingOfficerName}</td></tr>
      </table>
      
      <p style="color: #475569; margin-top: 16px;">Please log in. <strong>Whichever of you (Admin or HOD) acts first will finalize the leave.</strong></p>
      ${action.html}
    </div>
  `;

  await sendToAdminAndHod({
    leave,
    subject: `Leave Awaiting Approval — ${leave.employee}`,
    text: `${leave.employee}'s ${leave.type} leave has been confirmed by Acting Officer ${actingOfficerName} and is awaiting approval. Sign in to review: ${action.url}`,
    mailHtml,
    accentAdmin: '#2563eb',
    accentHod: '#7c3aed',
  });
}

// ═══════════════════════════════════════════════
// STAGE 2b — Acting Officer DECLINED → notify Employee
// ═══════════════════════════════════════════════
async function sendEmployeeDeclinedByActingOfficerEmail(leave, actingOfficerName, reason) {
  const email = await findApplicantEmail(leave);
  if (!email) throw new Error('Employee email address was not found.');
  const action = emailAction('/userdashboard?tab=myleaves', 'View My Leave Requests');

  await sendEmail({
    to: email,
    subject: `Your Leave Request Was Declined — ${leave.type}`,
    text: `Your ${leave.type} leave from ${leave.from} to ${leave.to} was declined by Acting Officer ${actingOfficerName}. ${reason ? 'Reason: ' + reason : ''} View your leave requests: ${action.url}`,
    html: wrapTemplate({
      title: 'Your Leave Was Declined',
      accentColor: '#dc2626',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong>${leave.employee}</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">Your leave request was <strong style="color:#dc2626;">declined</strong> by your Acting Officer (<strong>${actingOfficerName}</strong>).</p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''}"><strong>To</strong></td><td style="padding:9px 12px; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #1e293b;">${leave.to}</td></tr>
            ${reason ? `<tr><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;"><strong>Reason</strong></td><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;">${reason}</td></tr>` : ''}
          </table>
          
          <p style="color: #475569; margin-top: 16px;">You may submit a new leave application if needed.</p>
          ${action.html}
        </div>
      `,
    }),
  });
}

// ═══════════════════════════════════════════════
// STAGE 3b — Admin DECLINED → notify Employee
// ═══════════════════════════════════════════════
async function sendEmployeeDeclinedByAdminEmail(leave, reason) {
  const email = await findApplicantEmail(leave);
  if (!email) throw new Error('Employee email address was not found.');
  const action = emailAction('/userdashboard?tab=myleaves', 'View My Leave Requests');

  await sendEmail({
    to: email,
    subject: `Your Leave Request Was Declined by Admin — ${leave.type}`,
    text: `Your ${leave.type} leave from ${leave.from} to ${leave.to} was declined by the Admin. ${reason ? 'Reason: ' + reason : ''} View your leave requests: ${action.url}`,
    html: wrapTemplate({
      title: 'Your Leave Was Declined by Admin',
      accentColor: '#dc2626',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong>${leave.employee}</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">Your leave request was <strong style="color:#dc2626;">declined by the Admin</strong>.</p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''}"><strong>To</strong></td><td style="padding:9px 12px; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #1e293b;">${leave.to}</td></tr>
            ${reason ? `<tr><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;"><strong>Reason</strong></td><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;">${reason}</td></tr>` : ''}
          </table>
          ${action.html}
        </div>
      `,
    }),
  });
}

// ═══════════════════════════════════════════════
// STAGE 4a — FINAL APPROVAL (Admin or HOD) → notify Employee + Acting Officer
// ═══════════════════════════════════════════════
async function sendFinalApprovalEmails(leave) {
  const employeeEmail = await findApplicantEmail(leave);
  if (!employeeEmail) throw new Error('Applicant email address was not found.');
  const employeeAction = emailAction('/userdashboard?tab=myleaves', 'View My Leave Requests');
  const deliveryErrors = [];

  try {
    await sendEmail({
      to: employeeEmail,
      subject: `Your Leave Has Been Fully Approved — ${leave.type}`,
      text: `Your ${leave.type} leave from ${leave.from} to ${leave.to} has been fully approved. View your leave requests: ${employeeAction.url}`,
      html: wrapTemplate({
        title: 'Your Leave Has Been Fully Approved',
        accentColor: '#059669',
        bodyHtml: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
            <p style="margin-bottom: 10px;">Hello <strong>${leave.employee}</strong>,</p>
            <p style="color: #475569; margin-bottom: 16px;">Your leave request has been <strong style="color:#059669;">FULLY APPROVED</strong>. Enjoy your leave!</p>
            
            <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
              <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
              <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
              <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.to}</td></tr>
              <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Days</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.noOfDays}</td></tr>
              <tr><td style="padding:9px 12px; background:#f8fafc;"><strong>Acting Officer</strong></td><td style="padding:9px 12px; color: #1e293b;">${leave.actingOfficer || '—'}</td></tr>
            </table>
            
            <p style="font-size: 13px; color: #64748b; margin-top: 16px; background: #f8fafc; padding: 10px 12px; border-left: 3px solid #059669; border-radius: 4px;">Please make sure your Acting Officer is aware of your responsibilities during this time.</p>
            ${employeeAction.html}
          </div>
        `,
      }),
    });
  } catch (error) {
    deliveryErrors.push(error);
  }

  if (leave.actingOfficer) {
    const aoEmail = await findEmployeeEmail(
      leave.actingOfficer,
      leave.division,
      leave.actingOfficerRole || leave.acting_officer_role,
      leave.actingOfficerUserId ?? leave.acting_officer_user_id
    );
    if (aoEmail) {
      const actingOfficerAction = emailAction(
        actingOfficerApprovalsPath(leave.actingOfficerRole || leave.acting_officer_role),
        'View Acting Assignments'
      );
      try {
        await sendEmail({
          to: aoEmail,
          subject: `You Are Officially Acting — ${leave.employee}'s Leave is Approved`,
          text: `You are now officially acting for ${leave.employee} from ${leave.from} to ${leave.to}. View your acting assignments: ${actingOfficerAction.url}`,
          html: wrapTemplate({
            title: 'Your Acting Assignment is Now Active',
            accentColor: '#0284c7',
            bodyHtml: `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
                <p style="margin-bottom: 10px;">Hello <strong style="color: #0284c7;">${leave.actingOfficer}</strong>,</p>
                <p style="color: #475569; margin-bottom: 16px;">You are now <strong>officially acting</strong> for the following leave, which has been fully approved:</p>
                
                <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #bae6fd; border-radius: 6px; overflow: hidden; font-size: 13px;">
                  <tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd; width: 35%;"><strong>Employee on Leave</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.employee}</td></tr>
                  <tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd;"><strong>Division</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.division}</td></tr>
                  <tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.type}</td></tr>
                  <tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.from}</td></tr>
                  <tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.to}</td></tr>
                  <tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd;"><strong>Total Days</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.noOfDays}</td></tr>
                  ${leave.reason ? `<tr><td style="padding:9px 12px; background:#f0f9ff; border-bottom: 1px solid #bae6fd;"><strong>Reason</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #bae6fd; color: #0369a1;">${leave.reason}</td></tr>` : ''}
                  ${leave.address ? `<tr><td style="padding:9px 12px; background:#f0f9ff;"><strong>Address on Leave</strong></td><td style="padding:9px 12px; color: #0369a1;">${leave.address}</td></tr>` : ''}
                </table>
                
                <div style="background: #f0f9ff; padding: 12px 14px; border-radius: 6px; border: 1px solid #bae6fd; margin-top: 16px;">
                  <p style="font-weight: 600; color: #0369a1; margin-top: 0; margin-bottom: 6px;">Your responsibilities:</p>
                  <ul style="margin: 0; padding-left: 18px; color: #334155;">
                    <li style="margin-bottom: 3px;">Handle the employee's duties during this period</li>
                    <li style="margin-bottom: 3px;">Ensure critical tasks are not delayed</li>
                    <li>Report any issues to the Division Head / Admin</li>
                  </ul>
                </div>
                
                <p style="font-size: 13px; color: #64748b; margin-top: 16px;">If you have any concerns, contact your Division Head immediately.</p>
                ${actingOfficerAction.html}
              </div>
            `,
          }),
        });
      } catch (error) {
        deliveryErrors.push(error);
      }
    }
  }

  if (deliveryErrors.length > 0) {
    throw Object.assign(
      new Error('One or more final approval emails failed.'),
      { code: deliveryErrors[0].code }
    );
  }
}

// ═══════════════════════════════════════════════
// EMPLOYEE CANCELLED → notify Acting Officer
// ═══════════════════════════════════════════════
async function sendActingOfficerCancelledEmail(leave, reason) {
  const email = await findEmployeeEmail(
    leave.actingOfficer,
    leave.division,
    leave.actingOfficerRole || leave.acting_officer_role,
    leave.actingOfficerUserId ?? leave.acting_officer_user_id
  );
  if (!email) {
    throw new Error('Acting officer email address was not found.');
  }
  const action = emailAction(
    actingOfficerApprovalsPath(leave.actingOfficerRole || leave.acting_officer_role),
    'View Acting Assignments'
  );

  await sendEmail({
    to: email,
    subject: `Leave Request Cancelled — ${leave.employee}'s ${leave.type} Leave`,
    text: `${leave.employee} has cancelled their ${leave.type} leave from ${leave.from} to ${leave.to}. No action is needed from you. ${reason ? 'Reason: ' + reason : ''} View your acting assignments: ${action.url}`,
    html: wrapTemplate({
      title: 'Leave Request Cancelled by Employee',
      accentColor: '#64748b',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong style="color: #64748b;">${leave.actingOfficer}</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">
            The following leave request, for which you were assigned as <strong>Acting Officer</strong>, has been 
            <strong style="color:#dc2626;">cancelled by the Applier</strong>. 
            <strong>No action is needed from you.</strong>
          </p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Employee</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.employee}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Division</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.division}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''}"><strong>To</strong></td><td style="padding:9px 12px; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #1e293b;">${leave.to}</td></tr>
            ${reason ? `<tr><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;"><strong>Cancellation Reason</strong></td><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;">${reason}</td></tr>` : ''}
          </table>
          
          <div style="background: #f1f5f9; padding: 12px 14px; border-radius: 6px; border-left: 4px solid #64748b; margin-top: 16px;">
            <p style="margin: 0; color: #475569; font-size: 13px;">
              <strong>ℹ Note:</strong> You do not need to take any action. This email is for your information only.
            </p>
          </div>
          ${action.html}
        </div>
      `,
    }),
  });
}

// ═══════════════════════════════════════════════
// STAGE 4b — HOD DECLINED → notify Employee
// ═══════════════════════════════════════════════
async function sendEmployeeDeclinedByHodEmail(leave, reason) {
  const email = await findApplicantEmail(leave);
  if (!email) throw new Error('Applicant email address was not found.');
  const action = emailAction('/userdashboard?tab=myleaves', 'View My Leave Requests');

  await sendEmail({
    to: email,
    subject: `Your Leave Was Declined by Head of Division — ${leave.type}`,
    text: `Your ${leave.type} leave from ${leave.from} to ${leave.to} was declined by the Head of Division. ${reason ? 'Reason: ' + reason : ''} View your leave requests: ${action.url}`,
    html: wrapTemplate({
      title: 'Your Leave Was Declined by Head of Division',
      accentColor: '#dc2626',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong>${leave.employee}</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">Your leave request was <strong style="color:#dc2626;">declined by the Head of Division</strong>.</p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''}"><strong>To</strong></td><td style="padding:9px 12px; ${reason ? 'border-bottom: 1px solid #e2e8f0;' : ''} color: #1e293b;">${leave.to}</td></tr>
            ${reason ? `<tr><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;"><strong>Reason</strong></td><td style="padding:9px 12px; background:#fef2f2; color: #991b1b;">${reason}</td></tr>` : ''}
          </table>
          
          <p style="color: #475569; margin-top: 16px;">If you have questions, please contact your Division Head.</p>
          ${action.html}
        </div>
      `,
    }),
  });
}

module.exports = {
  sendActingOfficerAssignedEmail,
  sendAdminAwaitingApprovalEmail,
  sendEmployeeDeclinedByActingOfficerEmail,
  sendEmployeeDeclinedByAdminEmail,
  sendFinalApprovalEmails,
  sendEmployeeDeclinedByHodEmail,
  sendActingOfficerCancelledEmail,
  sendAdminNewLeaveEmail,
  sendApprovalRequestEmail,
  sendHodAwaitingFinalApprovalEmail,
};
