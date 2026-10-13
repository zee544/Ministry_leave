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

// ═══════════════════════════════════════════════
// Helper: Look up an email address by name + division
// ═══════════════════════════════════════════════
async function findEmployeeEmail(name, division) {
  if (!name) return null;

  // 1) Try employees table
  const [empRows] = await pool.query(
    `SELECT email FROM employees 
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
     LIMIT 1`,
    [name]
  );
  if (empRows.length > 0 && empRows[0].email) return empRows[0].email;

  const [adminRows] = await pool.query(
    `SELECT email FROM admins 
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
     LIMIT 1`,
    [name]
  );
  if (adminRows.length > 0 && adminRows[0].email) return adminRows[0].email;

  const [hodRows] = await pool.query(
    `SELECT email FROM hod 
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
     LIMIT 1`,
    [name]
  );
  if (hodRows.length > 0 && hodRows[0].email) return hodRows[0].email;

  return null;
}

async function findDivisionAdminEmail(division) {
  const [rows] = await pool.query(
    `SELECT email FROM admins WHERE LOWER(TRIM(division)) = LOWER(TRIM(?)) LIMIT 1`,
    [division]
  );
  return rows[0]?.email || null;
}

async function findDivisionHodEmail(division) {
  const [rows] = await pool.query(
    `SELECT email FROM hod WHERE LOWER(TRIM(division)) = LOWER(TRIM(?)) LIMIT 1`,
    [division]
  );
  return rows[0]?.email || null;
}

// ═══════════════════════════════════════════════
// STAGE 1 — Employee submits leave → notify Acting Officer
// ═══════════════════════════════════════════════
async function sendActingOfficerAssignedEmail(leave, actingOfficerName) {
  const email = await findEmployeeEmail(actingOfficerName, leave.division);
  if (!email) {
    throw new Error('Acting officer email address was not found.');
  }
  const action = emailAction('/userdashboard?tab=actingapprovals', 'Open Acting Approvals');

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
// STAGE 2a — Acting Officer CONFIRMED → notify Admin
// ═══════════════════════════════════════════════
async function sendAdminAwaitingApprovalEmail(leave, actingOfficerName) {
  const email = await findDivisionAdminEmail(leave.division);
  if (!email) {
    throw new Error('Division admin email address was not found.');
  }
  const action = emailAction('/Admindashboard?tab=leaves', 'Review Leave Request');

  await sendEmail({
    to: email,
    subject: `Leave Awaiting Your Approval — ${leave.employee}`,
    text: `${leave.employee}'s ${leave.type} leave has been confirmed by Acting Officer ${actingOfficerName} and is awaiting your approval. Sign in to review the request and choose an action: ${action.url}`,
    html: wrapTemplate({
      title: 'Leave Request Awaiting Approval',
      accentColor: '#2563eb',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong style="color: #2563eb;">Administrator</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">The following leave request has been <strong>confirmed by the Acting Officer</strong> and is now awaiting your approval:</p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Employee</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.employee}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.to}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Days</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.noOfDays}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc;"><strong>Acting Officer</strong></td><td style="padding:9px 12px; color: #1e293b;">${actingOfficerName}</td></tr>
          </table>

          ${action.html}
        </div>
      `,
    }),
  });
}

// ═══════════════════════════════════════════════
// STAGE 2b — Acting Officer DECLINED → notify Employee
// ═══════════════════════════════════════════════
async function sendEmployeeDeclinedByActingOfficerEmail(leave, actingOfficerName, reason) {
  const email = await findEmployeeEmail(leave.employee, leave.division);
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
// STAGE 3a — Admin APPROVED → notify HOD
// ═══════════════════════════════════════════════
async function sendHodAwaitingFinalApprovalEmail(leave) {
  const email = await findDivisionHodEmail(leave.division);
  if (!email) {
    throw new Error('Division HOD email address was not found.');
  }
  const action = emailAction('/hoddashboard?tab=leaves', 'Review Leave Request');

  await sendEmail({
    to: email,
    subject: `Leave Awaiting Final Approval — ${leave.employee}`,
    text: `${leave.employee}'s ${leave.type} leave has been pre-approved by Admin and is awaiting your final approval. Sign in to review the request and choose an action: ${action.url}`,
    html: wrapTemplate({
      title: 'Leave Awaiting Your Final Approval',
      accentColor: '#7c3aed',
      bodyHtml: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; font-size: 14px; line-height: 1.5;">
          <p style="margin-bottom: 10px;">Hello <strong style="color: #7c3aed;">Head of Division</strong>,</p>
          <p style="color: #475569; margin-bottom: 16px;">The following leave request has been <strong>pre-approved by the Admin</strong> and is now awaiting your <strong>final approval</strong>:</p>
          
          <table style="width:100%; border-collapse:separate; border-spacing:0; margin:12px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px;">
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0; width: 35%;"><strong>Employee</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.employee}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Leave Type</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.type}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>From</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.from}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>To</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.to}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc; border-bottom: 1px solid #e2e8f0;"><strong>Days</strong></td><td style="padding:9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${leave.noOfDays}</td></tr>
            <tr><td style="padding:9px 12px; background:#f8fafc;"><strong>Acting Officer</strong></td><td style="padding:9px 12px; color: #1e293b;">${leave.actingOfficer || '—'}</td></tr>
          </table>

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
  const email = await findEmployeeEmail(leave.employee, leave.division);
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
// STAGE 4a — HOD APPROVED → notify Employee + Acting Officer
// ═══════════════════════════════════════════════
async function sendFinalApprovalEmails(leave) {
  // ─── EMAIL 1: to Employee (personal approval) ───
  const employeeEmail = await findEmployeeEmail(leave.employee, leave.division);
  if (!employeeEmail) throw new Error('Employee email address was not found.');
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
            <p style="color: #475569; margin-bottom: 16px;">Your leave request has been <strong style="color:#059669;">FULLY APPROVED</strong> by the Head of Division. Enjoy your leave!</p>
            
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

  // ─── EMAIL 2: to Acting Officer (with full details) ───
  if (leave.actingOfficer) {
    const aoEmail = await findEmployeeEmail(leave.actingOfficer, leave.division);
    if (!aoEmail) throw new Error('Acting officer email address was not found.');
    const actingOfficerAction = emailAction('/userdashboard?tab=actingapprovals', 'View Acting Assignments');

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
  const email = await findEmployeeEmail(leave.actingOfficer, leave.division);
  if (!email) {
    throw new Error('Acting officer email address was not found.');
  }
  const action = emailAction('/userdashboard?tab=actingapprovals', 'View Acting Assignments');

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
  const email = await findEmployeeEmail(leave.employee, leave.division);
  if (!email) throw new Error('Employee email address was not found.');
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
  sendHodAwaitingFinalApprovalEmail,
  sendEmployeeDeclinedByAdminEmail,
  sendFinalApprovalEmails,
  sendEmployeeDeclinedByHodEmail,
  sendActingOfficerCancelledEmail,
};