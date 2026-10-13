import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sendEmail, wrapTemplate, htmlToText } = require('../utils/emailService');

const smtpEnvironmentKeys = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'FROM_NAME',
  'FROM_EMAIL',
  'REPLY_TO_EMAIL',
  'FRONTEND_URL',
  'NODE_ENV',
];
const originalSmtpEnvironment = Object.fromEntries(
  smtpEnvironmentKeys.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of smtpEnvironmentKeys) {
    const originalValue = originalSmtpEnvironment[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
  vi.restoreAllMocks();
});

describe('email service', () => {
  it('wraps email body content in the shared template', () => {
    const html = wrapTemplate({
      title: 'Leave update',
      bodyHtml: '<p>Your request was updated.</p>',
      accentColor: '#123456',
    });

    expect(html).toContain('<h2 style="color: #1e293b; margin: 0;">Leave update</h2>');
    expect(html).toContain('border-left: 4px solid #123456');
    expect(html).toContain('<p>Your request was updated.</p>');
    expect(html).toContain('Ministry Leave System');
  });

  it('converts HTML notifications to readable plain text and keeps button URLs', () => {
    expect(htmlToText(
      '<h2>Leave update</h2><p>Status: approved</p><a href="https://example.test/leaves">View leave</a>'
    )).toBe('Leave update\nStatus: approved\nView leave (https://example.test/leaves)');
  });

  it('reports an error when the recipient is missing', async () => {
    await expect(sendEmail({ subject: 'Test message' })).rejects.toThrow(
      'Email recipient is required.'
    );
  });

  it('reports missing SMTP configuration instead of logging a fake delivery', async () => {
    for (const key of smtpEnvironmentKeys) {
      delete process.env[key];
    }

    await expect(
      sendEmail({ to: 'test@example.com', subject: 'Test message', text: 'Hello' })
    ).rejects.toThrow(
      'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
  });

  it('uses implicit TLS on SMTP port 465 and reports successful transport delivery', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'sender@example.test';
    process.env.SMTP_PASS = 'test-password';

    const nodemailer = require('nodemailer');
    const sendMail = vi.fn().mockResolvedValue({
      messageId: 'unit-test',
      accepted: ['recipient@example.test'],
      rejected: [],
    });
    const createTransport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });
    const servicePath = require.resolve('../utils/emailService');
    delete require.cache[servicePath];
    const { sendEmail: configuredSendEmail } = require(servicePath);

    await expect(configuredSendEmail({
      to: 'recipient@example.test',
      subject: 'Test message',
      html: '<p>Hello <strong>there</strong>.</p>',
    })).resolves.toBe(true);

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      port: 465,
      secure: true,
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"Ministry Leave System" <sender@example.test>',
      replyTo: 'sender@example.test',
      text: 'Hello there.',
    }));
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it('builds production links from FRONTEND_URL and uses the deployed site as fallback', () => {
    const { getFrontendUrl } = require('../utils/emailService');
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;
    expect(getFrontendUrl('/reset-password?token=test')).toBe(
      'https://leave-7a9d6.web.app/reset-password?token=test'
    );

    process.env.FRONTEND_URL = 'https://example.test/';
    expect(getFrontendUrl('/userdashboard?tab=myleaves')).toBe(
      'https://example.test/userdashboard?tab=myleaves'
    );
  });

  it('reports SMTP recipient rejection instead of reporting successful delivery', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'sender@example.test';
    process.env.SMTP_PASS = 'test-password';

    const nodemailer = require('nodemailer');
    const sendMail = vi.fn().mockResolvedValue({
      messageId: 'unit-test',
      accepted: [],
      rejected: ['recipient@example.test'],
    });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });
    const servicePath = require.resolve('../utils/emailService');
    delete require.cache[servicePath];
    const { sendEmail: configuredSendEmail } = require(servicePath);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(configuredSendEmail({
      to: 'recipient@example.test',
      subject: 'Test message',
      text: 'Hello',
    })).rejects.toMatchObject({ code: 'EENVELOPE' });
    expect(error).toHaveBeenCalledWith('[Email] Delivery failed (EENVELOPE).');
  });
});
