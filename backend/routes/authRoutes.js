const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// ═══════════════════════════════════════════════
// Gmail SMTP transporter (lazy init)
// ═══════════════════════════════════════════════
let mailer = null;
function getMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }
  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false, // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return mailer;
}

function getFromAddress() {
  const name = process.env.FROM_NAME || 'Ministry Leave System';
  const email = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return `"${name}" <${email}>`;
}

/**
 * @route   GET /api/auth/divisions-status
 */
router.get('/divisions-status', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        d.id, 
        d.name, 
        d.code,
        EXISTS(SELECT 1 FROM admins a WHERE a.division = d.name) AS hasAdmin,
        EXISTS(SELECT 1 FROM hod h WHERE h.division = d.name) AS hasHOD
      FROM divisions d 
      ORDER BY d.name ASC
    `);

    return res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        hasAdmin: Boolean(r.hasAdmin),
        hasHOD: Boolean(r.hasHOD),
      }))
    );
  } catch (error) {
    console.error('[Auth Error] /divisions-status:', error);
    return res.status(500).json({ message: 'Failed to retrieve divisions status.' });
  }
});

/**
 * @route   POST /api/auth/admin-signup
 */
router.post('/admin-signup', async (req, res) => {
  const { name, email, division, password } = req.body;

  if (!name || !email || !division || !password) {
    return res.status(400).json({ message: 'All fields (name, email, division, password) are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  if (!/[A-Z]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one uppercase letter.' });
  if (!/[a-z]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one lowercase letter.' });
  if (!/[0-9]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one number.' });
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one special character.' });

  try {
    const [divRows] = await pool.query('SELECT id, name FROM divisions WHERE name = ? LIMIT 1', [division]);
    if (divRows.length === 0) return res.status(400).json({ message: 'Selected division is not a valid ministry division.' });

    const [existingEmail] = await pool.query('SELECT id FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
    if (existingEmail.length > 0) return res.status(409).json({ message: 'An administrator with this email address is already registered.' });

    const [existingDivAdmin] = await pool.query('SELECT id, name, email FROM admins WHERE division = ? LIMIT 1', [division]);
    if (existingDivAdmin.length > 0) {
      return res.status(400).json({
        message: `An administrator account is already configured for the "${division}" division (${existingDivAdmin[0].email}). Each division has only one admin.`,
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [lastAdmin] = await pool.query('SELECT id FROM admins ORDER BY id DESC LIMIT 1');
    const nextId = lastAdmin.length > 0 ? lastAdmin[0].id + 1 : 1;
    const empId = `EMP-ADM-${String(nextId).padStart(2, '0')}`;

    const [result] = await pool.query(
      `INSERT INTO admins (name, email, password, division, role, designation, employee_id)
       VALUES (?, ?, ?, ?, 'admin', 'System Administrator', ?)`,
      [name.trim(), email.trim().toLowerCase(), hashedPassword, division, empId]
    );

    return res.status(201).json({
      message: `Division Admin registered successfully for ${division}! You can now sign in.`,
      admin: { id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), division, role: 'admin' },
    });
  } catch (error) {
    console.error('[Auth Error] /admin-signup:', error);
    return res.status(500).json({ message: 'An error occurred during admin registration. Please try again.' });
  }
});

/**
 * @route   POST /api/auth/hod-signup
 */
router.post('/hod-signup', async (req, res) => {
  const { name, email, division, password } = req.body;

  if (!name || !email || !division || !password) {
    return res.status(400).json({ message: 'All fields (name, email, division, password) are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return res.status(400).json({ message: 'Please provide a valid email address.' });

  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  if (!/[A-Z]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one uppercase letter.' });
  if (!/[a-z]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one lowercase letter.' });
  if (!/[0-9]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one number.' });
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return res.status(400).json({ message: 'Password must contain at least one special character.' });

  try {
    const [divRows] = await pool.query('SELECT id, name FROM divisions WHERE LOWER(name) = LOWER(?) LIMIT 1', [division.trim()]);
    if (divRows.length === 0) return res.status(400).json({ message: 'Selected division is not a valid ministry division.' });

    const exactDivisionName = divRows[0].name;

    const [existingEmailAdmin] = await pool.query('SELECT id FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
    const [existingEmailHOD] = await pool.query('SELECT id FROM hod WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
    if (existingEmailAdmin.length > 0 || existingEmailHOD.length > 0) {
      return res.status(409).json({ message: 'An account with this email address is already registered.' });
    }

    const [existingHOD] = await pool.query('SELECT id, name, email FROM hod WHERE LOWER(division) = LOWER(?) LIMIT 1', [exactDivisionName]);
    if (existingHOD.length > 0) {
      return res.status(400).json({
        message: `A Head of Division is already registered for "${exactDivisionName}" division (${existingHOD[0].name}). Each division has only one HOD.`,
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [lastHOD] = await pool.query('SELECT id FROM hod ORDER BY id DESC LIMIT 1');
    const nextId = lastHOD.length > 0 ? lastHOD[0].id + 1 : 1;
    const empId = `HOD-${String(nextId).padStart(4, '0')}`;

    const [result] = await pool.query(
      `INSERT INTO hod (name, email, password, division, role, designation, employee_id)
       VALUES (?, ?, ?, ?, 'hod', 'Head of Division', ?)`,
      [name.trim(), email.trim().toLowerCase(), hashedPassword, exactDivisionName, empId]
    );

    return res.status(201).json({
      message: `HOD registered successfully for ${exactDivisionName}! You can now sign in.`,
      hod: {
        id: result.insertId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        division: exactDivisionName,
        role: 'hod',
        designation: 'Head of Division',
        employeeId: empId,
      },
    });
  } catch (error) {
    console.error('[Auth Error] /hod-signup:', error);
    return res.status(500).json({ message: 'HOD registration failed. Please try again.' });
  }
});

/**
 * @route   POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const [adminRows] = await pool.query(
      'SELECT id, name, email, password, division, role, designation, employee_id FROM admins WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (adminRows.length > 0) {
      const admin = adminRows[0];
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) return res.status(401).json({ message: 'Invalid email or password. Please try again.' });

      const payload = {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        division: admin.division,
        role: 'admin',
        designation: admin.designation || 'System Administrator',
        employeeId: admin.employee_id || `EMP-ADM-${admin.id}`,
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'leave_sys_123', { expiresIn: process.env.JWT_EXPIRE || '7d' });
      return res.status(200).json({ message: 'Login successful', token, user: payload, mustChangePassword: false });
    }

    const [hodRows] = await pool.query(
      'SELECT id, name, email, password, division, role, designation, employee_id FROM hod WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (hodRows.length > 0) {
      const hod = hodRows[0];
      const isMatch = await bcrypt.compare(password, hod.password);
      if (!isMatch) return res.status(401).json({ message: 'Invalid email or password. Please try again.' });

      const payload = {
        id: hod.id,
        name: hod.name,
        email: hod.email,
        division: hod.division,
        role: 'hod',
        designation: hod.designation || 'Head of Division',
        employeeId: hod.employee_id || `HOD-${String(hod.id).padStart(4, '0')}`,
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'leave_sys_123', { expiresIn: process.env.JWT_EXPIRE || '7d' });
      return res.status(200).json({ message: 'Login successful', token, user: payload, mustChangePassword: false });
    }

    const [empRows] = await pool.query(
      'SELECT id, name, email, password, designation, division, status, must_change_password FROM employees WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (empRows.length > 0) {
      const emp = empRows[0];

      if (emp.status === 'Inactive') {
        return res.status(403).json({ message: 'Your employee account is currently inactive. Please contact your division administrator.' });
      }
      if (!emp.password) {
        return res.status(401).json({ message: 'Your account password has not been set yet. Please contact your division administrator.' });
      }

      const isMatch = await bcrypt.compare(password, emp.password);
      if (!isMatch) return res.status(401).json({ message: 'Invalid email or password. Please try again.' });

      const mustChange = Boolean(emp.must_change_password);

      const payload = {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        division: emp.division,
        role: 'employee',
        designation: emp.designation,
        employeeId: `EMP-${String(emp.id).padStart(4, '0')}`,
        must_change_password: mustChange,
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET || 'leave_sys_123', { expiresIn: process.env.JWT_EXPIRE || '7d' });
      return res.status(200).json({ message: 'Login successful', token, user: payload, mustChangePassword: mustChange });
    }

    return res.status(401).json({ message: 'Invalid email or password. Please try again.' });
  } catch (error) {
    console.error('[Auth Error] /api/auth/login:', error);
    return res.status(500).json({ message: 'Internal server error occurred during login.' });
  }
});

/**
 * @route   GET /api/auth/me
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const [rows] = await pool.query('SELECT id, name, email, division, role, designation, employee_id FROM admins WHERE id = ? LIMIT 1', [req.user.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'User not found in database.' });
      const admin = rows[0];
      return res.status(200).json({ id: admin.id, name: admin.name, email: admin.email, division: admin.division, role: 'admin', designation: admin.designation, employeeId: admin.employee_id });
    } else if (req.user.role === 'hod') {
      const [rows] = await pool.query('SELECT id, name, email, division, role, designation, employee_id FROM hod WHERE id = ? LIMIT 1', [req.user.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'HOD not found in database.' });
      const hod = rows[0];
      return res.status(200).json({ id: hod.id, name: hod.name, email: hod.email, division: hod.division, role: 'hod', designation: hod.designation || 'Head of Division', employeeId: hod.employee_id });
    } else {
      const [rows] = await pool.query('SELECT id, name, email, division, designation, status FROM employees WHERE id = ? LIMIT 1', [req.user.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Employee not found in database.' });
      const emp = rows[0];
      return res.status(200).json({ id: emp.id, name: emp.name, email: emp.email, division: emp.division, role: 'employee', designation: emp.designation, employeeId: `EMP-${String(emp.id).padStart(4, '0')}` });
    }
  } catch (error) {
    console.error('[Auth Error] /api/auth/me:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * @route   POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
});

/**
 * @route   POST /api/auth/change-password
 */
router.post('/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required.' });
  }

  if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
  if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one uppercase letter.' });
  if (!/[a-z]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one lowercase letter.' });
  if (!/[0-9]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one number.' });
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one special character.' });
  if (currentPassword === newPassword) return res.status(400).json({ message: 'New password must be different from the current password.' });

  try {
    let tableName, idField;
    if (role === 'admin') { tableName = 'admins'; idField = 'id'; }
    else if (role === 'hod') { tableName = 'hod'; idField = 'id'; }
    else { tableName = 'employees'; idField = 'id'; }

    const [rows] = await pool.query(`SELECT id, password FROM ${tableName} WHERE ${idField} = ? LIMIT 1`, [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) return res.status(401).json({ message: 'Current password is incorrect.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    if (role === 'employee') {
      await pool.query(`UPDATE employees SET password = ?, must_change_password = 0 WHERE id = ?`, [hashedPassword, userId]);
    } else {
      await pool.query(`UPDATE ${tableName} SET password = ? WHERE ${idField} = ?`, [hashedPassword, userId]);
    }

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('[Auth Error] /change-password:', error);
    return res.status(500).json({ message: 'Failed to change password.' });
  }
});

/**
 * @route   GET /api/auth/employees/search
 */
router.get('/employees/search', verifyToken, requireAdmin, async (req, res) => {
  const { q } = req.query;
  const adminDivision = req.user.division;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ message: 'Search query must be at least 2 characters.' });
  }

  try {
    const searchTerm = `%${q.trim()}%`;
    const [rows] = await pool.query(
      `SELECT id, name, email, designation, division, status, must_change_password
       FROM employees
       WHERE division = ?
         AND (name LIKE ? OR email LIKE ? OR designation LIKE ?)
       ORDER BY name ASC
       LIMIT 20`,
      [adminDivision, searchTerm, searchTerm, searchTerm]
    );
    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Auth Error] /employees/search:', error);
    return res.status(500).json({ message: 'Failed to search employees.' });
  }
});

/**
 * @route   POST /api/auth/employees/:id/reset-password
 */
router.post('/employees/:id/reset-password', verifyToken, requireAdmin, async (req, res) => {
  const employeeId = req.params.id;
  const adminDivision = req.user.division;

  try {
    const [rows] = await pool.query('SELECT id, name, email, division FROM employees WHERE id = ? LIMIT 1', [employeeId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Employee not found.' });

    const employee = rows[0];
    if (employee.division !== adminDivision) {
      return res.status(403).json({ message: 'You can only reset passwords for employees in your own division.' });
    }

    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const specials = '!@#$%&*';
    const pick = (chars) => chars[crypto.randomInt(0, chars.length)];

    let tempPassword =
      pick(upper) + pick(upper) + pick(lower) + pick(lower) +
      pick(digits) + pick(digits) + pick(digits) + pick(specials);

    tempPassword = tempPassword.split('').sort(() => crypto.randomInt(0, 3) - 1).join('');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    await pool.query(
      `UPDATE employees 
       SET password = ?, must_change_password = 1
       WHERE id = ?`,
      [hashedPassword, employeeId]
    );

    console.log(`[Password Reset] Admin ${req.user.name} reset password for employee ${employee.name} (ID ${employeeId})`);

    return res.status(200).json({
      message: `Temporary password generated for ${employee.name}.`,
      employee: { id: employee.id, name: employee.name, email: employee.email, division: employee.division },
      temporaryPassword: tempPassword,
    });
  } catch (error) {
    console.error('[Auth Error] /employees/:id/reset-password:', error);
    return res.status(500).json({ message: 'Failed to reset employee password.' });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset link via Gmail SMTP
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  const genericMessage =
    'Please check your inbox.';

  try {
    let user = null;
    let userRole = null;

    const [adminRows] = await pool.query('SELECT id, name, email FROM admins WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);
    if (adminRows.length > 0) {
      user = adminRows[0];
      userRole = 'admin';
    } else {
      const [hodRows] = await pool.query('SELECT id, name, email FROM hod WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);
      if (hodRows.length > 0) {
        user = hodRows[0];
        userRole = 'hod';
      } else {
        const [empRows] = await pool.query('SELECT id, name, email, status FROM employees WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);
        if (empRows.length > 0) {
          user = empRows[0];
          userRole = 'employee';
          if (user.status === 'Inactive') {
            return res.status(200).json({ message: genericMessage });
          }
        }
      }
    }

    if (!user) {
  return res.status(200).json({
    message: 'Please check the email address.',
    notRegistered: true,
  });
}

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE password_resets SET used = 1 WHERE email = ? AND role = ? AND used = 0',
      [cleanEmail, userRole]
    );

    await pool.query(
      `INSERT INTO password_resets (email, role, token_hash, expires_at, used)
       VALUES (?, ?, ?, ?, 0)`,
      [cleanEmail, userRole, tokenHash, expiresAt]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

    const transporter = getMailer();

    if (!transporter) {
      console.log('\n══════════════════════════════════════════════');
      console.log(`[PASSWORD RESET] (no SMTP configured — dev fallback)`);
      console.log(`[PASSWORD RESET] For: ${user.email} (${userRole})`);
      console.log(`[PASSWORD RESET] Link: ${resetLink}`);
      console.log('══════════════════════════════════════════════\n');
      return res.status(200).json({ message: genericMessage });
    }

    try {
      const fromAddress = getFromAddress();

      const info = await transporter.sendMail({
        from: fromAddress,
        to: user.email,
        subject: 'Password Reset Request — Ministry Leave System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; color: #1e293b;">
            <h2 style="color: #1e293b;">Password Reset Request</h2>
            <p>Hello ${user.name},</p>
            <p>We received a request to reset your password for the Ministry Leave System. Click the button below to set a new one:</p>
            <p style="text-align:center; margin: 30px 0;">
              <a href="${resetLink}" style="background:#3b82f6; color:#fff; text-decoration:none; padding:14px 28px; border-radius:8px; font-weight:bold; display:inline-block;">
                Reset My Password
              </a>
            </p>
            <p style="font-size:12px; color:#64748b;">
              Or copy this link into your browser:<br/>
              <span style="color:#3b82f6; word-break:break-all;">${resetLink}</span>
            </p>
            <hr style="border:none; border-top:1px solid #e2e8f0; margin: 24px 0;"/>
            <p style="font-size:12px; color:#94a3b8;">
              This link expires in <strong>15 minutes</strong>.
              If you didn't request a password reset, you can safely ignore this email — your password won't change.
            </p>
          </div>
        `,
      });

      console.log(`[PASSWORD RESET] ✅ Email sent to ${user.email} (Message ID: ${info.messageId})`);
    } catch (emailErr) {
      console.error('[PASSWORD RESET] Email send failed:', emailErr.message);
      console.log(`[PASSWORD RESET] (fallback link) ${resetLink}`);
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error('[Auth Error] /forgot-password:', error);
    return res.status(200).json({ message: genericMessage });
  }
});

/**
 * @route   POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required.' });
  }

  if (newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one uppercase letter.' });
  if (!/[a-z]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one lowercase letter.' });
  if (!/[0-9]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one number.' });
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) return res.status(400).json({ message: 'Password must contain at least one special character.' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [rows] = await pool.query(
      `SELECT id, email, role, expires_at, used
       FROM password_resets
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired password reset link.' });
    }

    const reset = rows[0];

    if (reset.used) {
      return res.status(400).json({ message: 'This password reset link has already been used.' });
    }

    if (new Date(reset.expires_at) < new Date()) {
      return res.status(400).json({ message: 'This password reset link has expired. Please request a new one.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    let tableName;
    if (reset.role === 'admin') tableName = 'admins';
    else if (reset.role === 'hod') tableName = 'hod';
    else tableName = 'employees';

    await pool.query(
      `UPDATE ${tableName} SET password = ? WHERE LOWER(email) = ?`,
      [hashedPassword, reset.email.toLowerCase()]
    );

    await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);

    return res.status(200).json({
      message: 'Password reset successfully. You can now sign in with your new password.',
    });
  } catch (error) {
    console.error('[Auth Error] /reset-password:', error);
    return res.status(500).json({ message: 'Failed to reset password.' });
  }
});

/**
 * @route   GET /api/auth/profile
 * @desc    Get own profile (any authenticated user)
 * @access  Private
 */
router.get('/profile', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let tableName;
    if (role === 'admin') tableName = 'admins';
    else if (role === 'hod') tableName = 'hod';
    else tableName = 'employees';

    let query;
    if (role === 'employee') {
      query = `SELECT id, name, email, designation, division, appointment_date, status,
               DATE_FORMAT(appointment_date, '%Y-%m-%d') as appointmentDate
               FROM employees WHERE id = ? LIMIT 1`;
    } else {
      query = `SELECT id, name, email, designation, division, employee_id
               FROM ${tableName} WHERE id = ? LIMIT 1`;
    }

    const [rows] = await pool.query(query, [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }

    const profile = rows[0];

    // Build employeeId for employees
    let employeeId = profile.employee_id;
    if (role === 'employee') {
      employeeId = `EMP-${String(profile.id).padStart(4, '0')}`;
    } else if (!employeeId) {
      employeeId = role === 'admin'
        ? `EMP-ADM-${String(profile.id).padStart(2, '0')}`
        : `HOD-${String(profile.id).padStart(4, '0')}`;
    }

    return res.status(200).json({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      designation: profile.designation,
      division: profile.division,
      appointmentDate: profile.appointmentDate || profile.appointment_date || null,
      status: profile.status || 'Active',
      role,
      employeeId,
    });
  } catch (error) {
    console.error('[Auth Error] /profile:', error);
    return res.status(500).json({ message: 'Failed to fetch profile.' });
  }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update own profile (name, email, designation, appointment_date)
 * @access  Private (Employee only for now)
 */
router.put('/profile', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { name, email, designation, appointment_date } = req.body;

    
  if (!['admin', 'hod', 'employee'].includes(role)) {
    return res.status(403).json({
      message: 'You are not allowed to update this profile.',
    });
  }

  // Validate
  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Name is required.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ message: 'Please provide a valid email address.' });
  }

  try {
    // Check if email belongs to someone else
    const [existing] = await pool.query(
      'SELECT id FROM employees WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1',
      [email.trim(), userId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'This email is already in use by another employee.' });
    }

       let tableName;
    if (role === 'admin') tableName = 'admins';
    else if (role === 'hod') tableName = 'hod';
    else tableName = 'employees';

    if (role === 'employee') {
      await pool.query(
        `UPDATE employees
         SET name = ?, email = ?, designation = COALESCE(?, designation),
             appointment_date = COALESCE(?, appointment_date)
         WHERE id = ?`,
        [
          name.trim(),
          email.trim().toLowerCase(),
          designation ? designation.trim() : null,
          appointment_date || null,
          userId,
        ]
      );

      const [rows] = await pool.query(
        `SELECT id, name, email, designation, division, status,
                DATE_FORMAT(appointment_date, '%Y-%m-%d') as appointmentDate
         FROM employees WHERE id = ? LIMIT 1`,
        [userId]
      );
      const profile = rows[0];
      return res.status(200).json({
        message: 'Profile updated successfully.',
        profile: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          designation: profile.designation,
          division: profile.division,
          appointmentDate: profile.appointmentDate,
          status: profile.status,
          role: 'employee',
          employeeId: `EMP-${String(profile.id).padStart(4, '0')}`,
        },
      });
    }

    // Admin / HOD
    await pool.query(
      `UPDATE ${tableName}
       SET name = ?, email = ?, designation = COALESCE(?, designation)
       WHERE id = ?`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        designation ? designation.trim() : null,
        userId,
      ]
    );

    const [rows] = await pool.query(
      `SELECT id, name, email, designation, division, employee_id
       FROM ${tableName} WHERE id = ? LIMIT 1`,
      [userId]
    );
    const profile = rows[0];

    return res.status(200).json({
      message: 'Profile updated successfully.',
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        designation: profile.designation,
        division: profile.division,
        role,
        employeeId: profile.employee_id ||
          (role === 'admin'
            ? `EMP-ADM-${String(profile.id).padStart(2, '0')}`
            : `HOD-${String(profile.id).padStart(4, '0')}`),
      },
    });
  } catch (error) {
    console.error('[Auth Error] PUT /profile:', error);
    return res.status(500).json({ message: 'Failed to update profile.' });
  }
});

/**
 * @route   GET /api/auth/signature
 * @desc    Get user's own signature
 * @access  Private
 */
router.get('/signature', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  try {
    let tableName;
    if (role === 'admin') tableName = 'admins';
    else if (role === 'hod') tableName = 'hod';
    else tableName = 'employees';

    const [rows] = await pool.query(
      `SELECT signature_image FROM ${tableName} WHERE id = ? LIMIT 1`,
      [userId]
    );

    return res.status(200).json({
      signature: rows[0]?.signature_image || null,
    });
  } catch (error) {
    console.error('[Auth Error] GET /signature:', error);
    return res.status(500).json({ message: 'Failed to load signature.' });
  }
});

/**
 * @route   PUT /api/auth/signature
 * @desc    Update user's own signature
 * @access  Private
 */
router.put('/signature', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { signature } = req.body;

  if (signature === undefined) {
    return res.status(400).json({ message: 'Signature field is required.' });
  }

  try {
    let tableName;
    if (role === 'admin') tableName = 'admins';
    else if (role === 'hod') tableName = 'hod';
    else tableName = 'employees';

    await pool.query(
      `UPDATE ${tableName} SET signature_image = ? WHERE id = ?`,
      [signature || null, userId]
    );

    return res.status(200).json({ message: 'Signature saved successfully.' });
  } catch (error) {
    console.error('[Auth Error] PUT /signature:', error);
    return res.status(500).json({ message: 'Failed to save signature.' });
  }
});

/**
 * @route   GET /api/auth/admin-info
 * @desc    Get admin info for the current HOD's division
 * @access  Private (HOD only)
 */
router.get('/admin-info', verifyToken, async (req, res) => {
  const role = req.user.role;
  const division = req.user.division;

  if (role !== 'hod') {
    return res.status(403).json({ message: 'Only HODs can access this endpoint.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, designation, division, employee_id
       FROM admins WHERE division = ? LIMIT 1`,
      [division]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No admin found for your division.' });
    }

    const admin = rows[0];
    return res.status(200).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      designation: admin.designation || 'System Administrator',
      division: admin.division,
      employeeId: admin.employee_id || `EMP-ADM-${String(admin.id).padStart(2, '0')}`,
    });
  } catch (error) {
    console.error('[Auth Error] /admin-info:', error);
    return res.status(500).json({ message: 'Failed to fetch admin info.' });
  }
});

/**
 * @route   GET /api/auth/hod-info
 * @desc    Get HOD info for the current Admin's division
 * @access  Private (Admin only)
 */
router.get('/hod-info', verifyToken, async (req, res) => {
  const role = req.user.role;
  const division = req.user.division;

  if (role !== 'admin') {
    return res.status(403).json({ message: 'Only Admins can access this endpoint.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, designation, division, employee_id
       FROM hod WHERE division = ? LIMIT 1`,
      [division]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No HOD found for your division.' });
    }

    const hod = rows[0];
    return res.status(200).json({
      id: hod.id,
      name: hod.name,
      email: hod.email,
      designation: hod.designation || 'Head of Division',
      division: hod.division,
      employeeId: hod.employee_id || `HOD-${String(hod.id).padStart(4, '0')}`,
    });
  } catch (error) {
    console.error('[Auth Error] /hod-info:', error);
    return res.status(500).json({ message: 'Failed to fetch HOD info.' });
  }
});

/**
 * @route   GET /api/auth/division-employees
 * @desc    Get all employees in the HOD's division
 * @access  Private (HOD only)
 */
router.get('/division-employees', verifyToken, async (req, res) => {
  const role = req.user.role;
  const division = req.user.division;

  if (role !== 'hod') {
    return res.status(403).json({ message: 'Only HODs can access this endpoint.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, designation, division, status,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') as appointment_date
       FROM employees
       WHERE division = ?
       ORDER BY name ASC`,
      [division]
    );

    return res.status(200).json(rows);
  } catch (error) {
    console.error('[Auth Error] /division-employees:', error);
    return res.status(500).json({ message: 'Failed to fetch employees.' });
  }
});


module.exports = router;