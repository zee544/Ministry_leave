const nodemailer = require('nodemailer');

// ═══════════════════════════════════════════════
// Gmail SMTP transporter (lazy init)
// ═══════════════════════════════════════════════
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.');
  }

  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port.');
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  return transporter;
}

function getFromAddress() {
  const name = process.env.FROM_NAME || 'Ministry Leave System';
  const email = process.env.FROM_EMAIL || process.env.SMTP_USER;
  return `"${name}" <${email}>`;
}

function getFrontendUrl(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Frontend link path must be an absolute application path.');
  }

  const fallbackUrl = process.env.NODE_ENV === 'production'
    ? 'https://leave-7a9d6.web.app'
    : 'http://localhost:5173';
  const baseUrl = new URL(process.env.FRONTEND_URL || fallbackUrl);

  if (
    !['http:', 'https:'].includes(baseUrl.protocol)
    || (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:')
  ) {
    throw new Error('FRONTEND_URL must use HTTPS in production.');
  }

  return new URL(path, baseUrl).toString();
}

function htmlToText(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(address|article|blockquote|div|h[1-6]|li|p|table|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => decodeHtmlCodePoint(code, 10))
    .replace(/&#x([\da-f]+);/gi, (_, code) => decodeHtmlCodePoint(code, 16))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

function decodeHtmlCodePoint(value, radix) {
  const codePoint = parseInt(value, radix);
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
}

// ═══════════════════════════════════════════════
// Main send function
// ═══════════════════════════════════════════════
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    throw new Error('Email recipient is required.');
  }

  const t = getTransporter();
  const from = getFromAddress();

  try {
    const result = await t.sendMail({
      from,
      replyTo: process.env.REPLY_TO_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_USER,
      to,
      subject,
      text: text || (html ? htmlToText(html) : ''),
      html,
    });

    if (!result.accepted?.length || result.rejected?.length) {
      const error = Object.assign(
        new Error('The mail server did not accept every recipient.'),
        { code: 'EENVELOPE', responseCode: result.responseCode }
      );
      throw error;
    }

    return true;
  } catch (err) {
    const code = err.code || 'UNKNOWN';
    const responseCode = Number.isInteger(err.responseCode) ? `, SMTP ${err.responseCode}` : '';
    console.error(`[Email] Delivery failed (${code}${responseCode}).`);
    throw Object.assign(new Error(`Email delivery failed (${code}${responseCode}).`), {
      code,
      responseCode: err.responseCode,
    });
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

module.exports = { sendEmail, wrapTemplate, getFrontendUrl, htmlToText };