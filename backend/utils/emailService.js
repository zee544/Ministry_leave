const nodemailer = require('nodemailer');

// ═══════════════════════════════════════════════
// Gmail SMTP transporter (lazy init)
// ═══════════════════════════════════════════════
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP not configured — emails will be logged instead of sent');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function getFromAddress() {
  const name = process.env.FROM_NAME || 'Ministry Leave System';
  const email = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return `"${name}" <${email}>`;
}

// ═══════════════════════════════════════════════
// Main send function
// ═══════════════════════════════════════════════
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[Email] No recipient email — skipping');
    return false;
  }

  const t = getTransporter();

  if (!t) {
    console.log('\n══════════════════════════════════════════════');
    console.log('[Email] (SMTP not configured — dev log)');
    console.log(`[Email] To: ${to}`);
    console.log(`[Email] Subject: ${subject}`);
    console.log(`[Email] Text: ${text || '(html only)'}`);
    console.log('══════════════════════════════════════════════\n');
    return false;
  }

  try {
    const info = await t.sendMail({
      from: getFromAddress(),
      to,
      subject,
      text: text || '',
      html,
    });
    console.log(`[Email] ✅ Sent to ${to} (Message ID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[Email] ❌ Failed to send to ${to}:`, err.message);
    return false;
  }
}

function wrapTemplate({ title, bodyHtml, accentColor = '#3b82f6' }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; color: #1e293b;">
      <div style="border-left: 4px solid ${accentColor}; padding-left: 16px; margin-bottom: 24px;">
        <h2 style="color: #1e293b; margin: 0;">${title}</h2>
      </div>
      ${bodyHtml}
      <hr style="border:none; border-top:1px solid #e2e8f0; margin: 24px 0;"/>
      <p style="font-size:12px; color:#94a3b8;">
        This is an automated message from the Ministry Leave System.
        
      </p>
    </div>
  `;
}

module.exports = { sendEmail, wrapTemplate };