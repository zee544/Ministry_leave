import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
const originalSetupKey = process.env.SYSTEM_ADMIN_SETUP_KEY;
process.env.JWT_SECRET = 'vitest-system-admin-setup-secret';
process.env.SYSTEM_ADMIN_SETUP_KEY = 'test-system-admin-setup-key-0123456789';

const http = require('node:http');
const express = require('express');
const mysql = require('mysql2/promise');
const pool = {
  query: vi.fn(),
  getConnection: vi.fn(),
};
pool.getConnection.mockResolvedValue({ release: vi.fn() });
const createPool = vi.spyOn(mysql, 'createPool').mockReturnValue(pool);
const router = require('../routes/authRoutes');
createPool.mockRestore();

let server;
let baseUrl;

function request(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(`${baseUrl}/api/auth/system-admin-setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(responseBody),
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

const validAccounts = [
  { username: 'admin-one', email: 'admin.one@example.gov', password: 'StrongPass!234' },
  { username: 'admin-two', email: 'admin.two@example.gov', password: 'OtherPass!5678' },
];

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  pool.query.mockReset();
  pool.getConnection.mockReset();
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalSetupKey === undefined) delete process.env.SYSTEM_ADMIN_SETUP_KEY;
  else process.env.SYSTEM_ADMIN_SETUP_KEY = originalSetupKey;
});

describe('System Admin one-time setup', () => {
  it('requires the backend-only setup key before querying account data', async () => {
    const result = await request({ setupKey: 'incorrect', accounts: validAccounts });

    expect(result.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('creates exactly two independently hashed accounts in one transaction', async () => {
    pool.query.mockResolvedValue([[], []]);
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn()
        .mockResolvedValueOnce([[{ slot: 1 }, { slot: 2 }], []])
        .mockResolvedValueOnce([[{ accountCount: 0 }], []])
        .mockResolvedValue([{ affectedRows: 1 }, []]),
    };
    pool.getConnection.mockResolvedValue(connection);

    const result = await request({
      setupKey: process.env.SYSTEM_ADMIN_SETUP_KEY,
      accounts: validAccounts,
    });

    expect(result.status).toBe(201);
    expect(result.body.accounts).toEqual([
      { username: 'admin-one', email: 'admin.one@example.gov' },
      { username: 'admin-two', email: 'admin.two@example.gov' },
    ]);
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledTimes(4);
    expect(connection.query.mock.calls[2][0]).toContain('(account_slot, name, username, email, password)');
    expect(connection.query.mock.calls[2][1].slice(0, 4)).toEqual([
      1, 'admin-one', 'admin-one', 'admin.one@example.gov',
    ]);
    expect(connection.query.mock.calls[2][1][4]).not.toBe(validAccounts[0].password);
    expect(connection.query.mock.calls[3][1].slice(0, 4)).toEqual([
      2, 'admin-two', 'admin-two', 'admin.two@example.gov',
    ]);
  });

  it('refuses another setup after the two accounts exist', async () => {
    pool.query.mockResolvedValue([[], []]);
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn()
        .mockResolvedValueOnce([[{ slot: 1 }, { slot: 2 }], []])
        .mockResolvedValueOnce([[{ accountCount: 2 }], []]),
    };
    pool.getConnection.mockResolvedValue(connection);

    const result = await request({
      setupKey: process.env.SYSTEM_ADMIN_SETUP_KEY,
      accounts: validAccounts,
    });

    expect(result.status).toBe(409);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledTimes(2);
  });
});
