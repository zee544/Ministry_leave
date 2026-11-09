import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-system-admin-profile-secret';

const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const pool = {
  query: vi.fn(),
  getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
};
const createPool = vi.spyOn(mysql, 'createPool').mockReturnValue(pool);
const router = require('../routes/authRoutes');
createPool.mockRestore();

let server;
let baseUrl;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const systemAdminToken = (slot = 1) => jwt.sign(
  { id: slot, role: 'system_admin' },
  process.env.JWT_SECRET
);

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
});

afterAll(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe('System Admin profile access', () => {
  it('loads the profile for the authenticated account slot only', async () => {
    pool.query.mockResolvedValueOnce([[
      {
        id: 1,
        name: 'Admin One',
        username: 'admin-one',
        email: 'admin.one@example.test',
        phone: '555-0101',
        designation: 'System Administrator',
        role: 'system_admin',
      },
    ], []]);

    const response = await request(
      'GET',
      '/api/auth/system-admin/profile',
      undefined,
      systemAdminToken(1)
    );

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      id: 1,
      username: 'admin-one',
      phone: '555-0101',
    });
    expect(pool.query.mock.calls[0][1]).toEqual([1]);
  });

  it('updates only the authenticated account and ignores attempts to change username, role, or slot', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('UPDATE system_admins')) return [{ affectedRows: 1 }, []];
      if (sql.includes('SELECT account_slot AS id')) {
        return [[{
          id: 1,
          name: 'Updated Name',
          username: 'admin-one',
          email: 'updated@example.test',
          phone: '555-0199',
          designation: 'System Administrator',
          role: 'system_admin',
        }], []];
      }
      return [[], []];
    });

    const response = await request(
      'PUT',
      '/api/auth/system-admin/profile',
      {
        name: 'Updated Name',
        email: 'Updated@example.test',
        phone: '555-0199',
        designation: 'System Administrator',
        account_slot: 2,
        username: 'changed-name',
        role: 'admin',
      },
      systemAdminToken(1)
    );

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      id: 1,
      username: 'admin-one',
      role: 'system_admin',
      email: 'updated@example.test',
    });
    const [updateSql, updateValues] = pool.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE system_admins')
    );
    expect(updateSql).toContain('WHERE account_slot = ?');
    expect(updateValues).toEqual([
      'Updated Name',
      'updated@example.test',
      '555-0199',
      'System Administrator',
      1,
    ]);
  });

  it('denies non-System Admin roles before accessing profile data', async () => {
    const employeeToken = jwt.sign(
      { id: 42, role: 'employee' },
      process.env.JWT_SECRET
    );

    const response = await request(
      'PUT',
      '/api/auth/system-admin/profile',
      { name: 'Not Allowed' },
      employeeToken
    );

    expect(response.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
