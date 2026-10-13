import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const environmentKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FRONTEND_URL'];
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);
Object.assign(process.env, {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'sender@example.test',
  SMTP_PASS: 'unit-test-password',
  FRONTEND_URL: 'https://leave-7a9d6.web.app',
});

const mysql = require('mysql2/promise');
const pool = {
  query: vi.fn(),
  getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
};
const createPool = vi.spyOn(mysql, 'createPool').mockReturnValue(pool);
delete require.cache[require.resolve('../config/db')];

const nodemailer = require('nodemailer');
const sendMail = vi.fn();
vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });

const emailServicePath = require.resolve('../utils/emailService');
delete require.cache[emailServicePath];
const leaveEmails = require('../utils/leaveEmails');
createPool.mockRestore();

const leave = {
  employee: 'Example Employee',
  actingOfficer: 'Example Officer',
  division: 'Example Division',
  type: 'Annual',
  from: '2026-11-01',
  to: '2026-11-03',
  noOfDays: 3,
};

const productionBaseUrl = 'https://leave-7a9d6.web.app';

beforeEach(() => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM admins')) {
      return [[{ email: 'admin@example.test' }], []];
    }
    if (sql.includes('FROM hod')) {
      return [[{ email: 'hod@example.test' }], []];
    }
    if (sql.includes('FROM employees')) {
      return [[{ email: 'employee@example.test' }], []];
    }
    throw new Error('Unexpected email lookup query in test.');
  });
  sendMail.mockReset().mockResolvedValue({
    messageId: 'test-message',
    accepted: ['recipient@example.test'],
    rejected: [],
  });
});

afterEach(() => {
  pool.query.mockReset();
});

afterAll(() => {
  for (const key of environmentKeys) {
    const originalValue = originalEnvironment[key];
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

describe('leave notification email links', () => {
  it.each([
    [
      'acting-officer assignment',
      () => leaveEmails.sendActingOfficerAssignedEmail(leave, leave.actingOfficer),
      '/userdashboard?tab=actingapprovals',
    ],
    [
      'admin approval request',
      () => leaveEmails.sendAdminAwaitingApprovalEmail(leave, leave.actingOfficer),
      '/Admindashboard?tab=leaves',
    ],
    [
      'acting-officer rejection',
      () => leaveEmails.sendEmployeeDeclinedByActingOfficerEmail(leave, leave.actingOfficer, 'Unavailable'),
      '/userdashboard?tab=myleaves',
    ],
    [
      'HOD approval request',
      () => leaveEmails.sendHodAwaitingFinalApprovalEmail(leave),
      '/hoddashboard?tab=leaves',
    ],
    [
      'admin rejection',
      () => leaveEmails.sendEmployeeDeclinedByAdminEmail(leave, 'Insufficient coverage'),
      '/userdashboard?tab=myleaves',
    ],
    [
      'acting-officer cancellation notice',
      () => leaveEmails.sendActingOfficerCancelledEmail(leave, 'Request withdrawn'),
      '/userdashboard?tab=actingapprovals',
    ],
    [
      'HOD rejection',
      () => leaveEmails.sendEmployeeDeclinedByHodEmail(leave, 'Please resubmit'),
      '/userdashboard?tab=myleaves',
    ],
  ])('links %s to its authorized application view', async (_name, send, path) => {
    await send();

    const message = sendMail.mock.calls[0][0];
    const expectedUrl = `${productionBaseUrl}${path}`;
    expect(message.html).toContain(`href="${expectedUrl}"`);
    expect(message.text).toContain(expectedUrl);
    expect(message.html).not.toMatch(/localhost|[?&](?:approve|reject)=/i);
  });

  it('links employee and acting-officer approval notices to their own views', async () => {
    await leaveEmails.sendFinalApprovalEmails(leave);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0][0].html).toContain(
      `href="${productionBaseUrl}/userdashboard?tab=myleaves"`
    );
    expect(sendMail.mock.calls[0][0].text).toContain(
      `${productionBaseUrl}/userdashboard?tab=myleaves`
    );
    expect(sendMail.mock.calls[1][0].html).toContain(
      `href="${productionBaseUrl}/userdashboard?tab=actingapprovals"`
    );
    expect(sendMail.mock.calls[1][0].text).toContain(
      `${productionBaseUrl}/userdashboard?tab=actingapprovals`
    );
  });
});
