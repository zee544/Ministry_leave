import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const envKeys = [
  'JWT_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'FRONTEND_URL',
];
const originalEnvironment = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
process.env.JWT_SECRET = 'vitest-password-reset-secret';
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'sender@example.test';
process.env.SMTP_PASS = 'unit-test-password';
process.env.FRONTEND_URL = 'https://leave-7a9d6.web.app';

const http = require('node:http');
const express = require('express');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const sendMail = vi.fn();
const pool = {
  query: vi.fn(),
  getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
};
const createPool = vi.spyOn(mysql, 'createPool').mockReturnValue(pool);
vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail });
const router = require('../routes/authRoutes');
createPool.mockRestore();

let server;
let baseUrl;

function postForgotPassword(email) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ email });
    const request = http.request(`${baseUrl}/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

describe('password-reset email flow', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => {
    pool.query.mockReset();
    sendMail.mockReset();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    for (const key of envKeys) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
  });

  function mockDatabase() {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM admins')) {
        return [[{ id: 9, name: 'Test Admin', email: 'admin@example.test' }], []];
      }
      return [{ affectedRows: 1, insertId: 10 }, []];
    });
  }

  it('sends a reset email while storing only a hash of the token', async () => {
    mockDatabase();
    sendMail.mockResolvedValue({
      messageId: 'test-message',
      accepted: ['admin@example.test'],
      rejected: [],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await postForgotPassword('admin@example.test');

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account exists/i);
    expect(sendMail).toHaveBeenCalledOnce();

    const resetLink = sendMail.mock.calls[0][0].html.match(
      /reset-password\?token=([a-f0-9]{64})/
    );
    expect(resetLink).not.toBeNull();
    expect(sendMail.mock.calls[0][0].html).toContain(
      'https://leave-7a9d6.web.app/reset-password?token='
    );
    const expectedHash = crypto.createHash('sha256').update(resetLink[1]).digest('hex');
    const insert = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO password_resets'));
    expect(insert[1][2]).toBe(expectedHash);
    expect(JSON.stringify([response.body, log.mock.calls, error.mock.calls])).not.toContain(resetLink[1]);
  });

  it('reports delivery failure, revokes the unsent token, and never logs the reset link', async () => {
    mockDatabase();
    sendMail.mockRejectedValue(Object.assign(new Error('SMTP authentication failed'), { code: 'EAUTH' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await postForgotPassword('admin@example.test');

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/email could not be sent/i);
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE password_resets SET used = 1 WHERE token_hash = ?',
      [expect.any(String)]
    );
    expect(JSON.stringify([response.body, log.mock.calls, error.mock.calls])).not.toMatch(
      /[a-f0-9]{64}/
    );
  });
});
