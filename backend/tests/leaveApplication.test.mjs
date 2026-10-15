import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-leave-application-secret';

const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const axios = require('axios');
const pool = {
  query: vi.fn(),
  getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
};
const createPool = vi.spyOn(mysql, 'createPool').mockReturnValue(pool);
const router = require('../routes/adminRoutes');
createPool.mockRestore();

let server;
let baseUrl;

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode, body: JSON.parse(responseBody) });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function put(path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode, body: JSON.parse(responseBody) });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}${path}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode, body: JSON.parse(responseBody) });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function employeeToken() {
  return jwt.sign(
    { id: 17, name: 'Test Employee', role: 'employee', division: 'Accounts' },
    process.env.JWT_SECRET
  );
}

function adminToken() {
  return jwt.sign(
    { id: 31, name: 'Division Admin', role: 'admin', division: 'Accounts' },
    process.env.JWT_SECRET
  );
}

function hodToken() {
  return jwt.sign(
    { id: 71, name: 'Accounts HOD', role: 'hod', division: 'Accounts' },
    process.env.JWT_SECRET
  );
}

describe('leave application endpoint', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('rejects applications missing required fields without writing to the database', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await post('/api/admin/leaves', {
      employee: 'Test Employee',
      division: 'Accounts',
      type: 'Half-day',
    }, employeeToken());

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('All required fields must be filled.');
    expect(query).not.toHaveBeenCalled();
  });

  it('creates a half-day leave with the authenticated employee as applicant', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT name, division FROM employees')) {
        return [[{ name: 'Test Employee', division: 'Accounts' }], []];
      }
      if (sql.includes('INSERT INTO leaves')) {
        return [{ insertId: 246 }, []];
      }
      return [[], []];
    });
    const response = await post('/api/admin/leaves', {
      employee: 'Test Employee',
      division: 'Accounts',
      type: 'Half-day',
      fromDate: '2026-10-13',
      toDate: '2026-10-13',
      actingOfficer: 'Acting Officer',
      reason: 'Personal appointment',
      address: 'Test address',
    }, employeeToken());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      leaveId: 246,
      status: 'Pending Acting Officer',
      noOfDays: 0.5,
      emailSent: null,
      emailQueued: true,
    });

    const [insertSql, insertValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO leaves')
    );
    expect(insertSql).toContain('applicant_user_id');
    expect(insertValues).toEqual([
      'Test Employee',
      'Accounts',
      'Half-day',
      '2026-10-13',
      '2026-10-13',
      0.5,
      'Acting Officer',
      17,
      'employee',
      'Pending Acting Officer',
      'Test Employee',
      expect.any(String),
      'Personal appointment',
      'Test address',
    ]);
  });

  it('calculates a one-day weekday leave inclusively without waiting on notification email', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { ok: true, data: { holidays: [] } },
    });
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT name, division FROM employees')) {
        return [[{ name: 'Test Employee', division: 'Accounts' }], []];
      }
      if (sql.includes('INSERT INTO leaves')) return [{ insertId: 251 }, []];
      return [[], []];
    });

    const response = await post('/api/admin/leaves', {
      type: 'Annual',
      fromDate: '2027-02-01',
      toDate: '2027-02-01',
      actingOfficer: 'Acting Officer',
    }, employeeToken());

    expect(response.status).toBe(201);
    expect(response.body.noOfDays).toBe(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO leaves'))).toBe(true);
    expect(global.setImmediate).toHaveBeenCalledTimes(1);
  });

  it('routes admin leave directly to the HOD using the admin profile identity', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT name, division FROM admins')) {
        return [[{ name: 'Division Admin', division: 'Accounts' }], []];
      }
      if (sql.includes('INSERT INTO leaves')) return [{ insertId: 247 }, []];
      return [[], []];
    });
    const response = await post('/api/admin/leaves', {
      employee: 'Forged Employee',
      division: 'Other Division',
      type: 'Half-day',
      fromDate: '2026-10-13',
      toDate: '2026-10-13',
      actingOfficer: 'Another Admin',
    }, adminToken());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      leaveId: 247,
      status: 'Admin Approved',
      noOfDays: 0.5,
      emailSent: null,
      emailQueued: true,
    });
    const [insertSql, insertValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO leaves')
    );
    expect(insertSql).toContain('applicant_user_id');
    expect(insertValues).toEqual([
      'Division Admin',
      'Accounts',
      'Half-day',
      '2026-10-13',
      '2026-10-13',
      0.5,
      null,
      31,
      'admin',
      'Admin Approved',
      'Division Admin',
      expect.any(String),
      undefined,
      undefined,
    ]);
  });

  it('retrieves leave history by permanent applicant ID and role', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([[], []]);
    const response = await get('/api/admin/leaves/employee', employeeToken());

    expect(response.status).toBe(200);
    const [selectSql, selectValues] = query.mock.calls[0];
    expect(selectSql).toContain('WHERE applicant_user_id = ? AND applicant_role = ?');
    expect(selectValues).toEqual([17, 'employee']);
  });

  it('prevents an HOD from approving their own leave request', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, status, applicant_user_id')) {
        return [[{
          id: 248,
          status: 'Admin Approved',
          applicantUserId: 71,
          applicantRole: 'hod',
          appliedBy: 'Accounts HOD',
        }], []];
      }
      return [[], []];
    });
    const response = await put('/api/admin/leaves/248/hod-approve', {
      action: 'approve',
    }, hodToken());

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('cannot approve or reject your own');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns HOD approval as soon as the leave status is committed and queues email separately', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, status, applicant_user_id')) {
        return [[{
          id: 250,
          status: 'Admin Approved',
          applicantUserId: 17,
          applicantRole: 'employee',
          appliedBy: 'Test Employee',
          employee: 'Test Employee',
          division: 'Accounts',
          type: 'Annual',
          from: '2026-10-13',
          to: '2026-10-14',
          noOfDays: 2,
          actingOfficer: 'Acting Officer',
          reason: null,
          address: null,
        }], []];
      }
      if (sql.includes('UPDATE leaves')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await put('/api/admin/leaves/250/hod-approve', {
      action: 'approve',
    }, hodToken());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: '250',
      status: 'Approved',
      emailSent: null,
      emailQueued: true,
    });
    expect(query.mock.calls.filter(([sql]) => sql.includes('UPDATE leaves'))).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('WHERE id = ? AND division = ? AND status'))).toBe(true);
    expect(global.setImmediate).toHaveBeenCalledTimes(1);
  });

  it('does not allow an admin to decide an admin-originated leave request', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([[
      { id: 249, status: 'Admin Approved', applicantRole: 'admin' },
    ], []]);
    const response = await put('/api/admin/leaves/249/status', {
      status: 'Declined',
    }, adminToken());

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('only be approved or rejected by the HOD');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
