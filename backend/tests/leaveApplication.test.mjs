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

function secretaryToken() {
  return jwt.sign(
    { id: 81, name: 'Ministry Secretary', email: 'secretary@example.test', role: 'secretary' },
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

  it('requires an Acting Officer before creating a leave request', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await post('/api/admin/leaves', {
      type: 'Annual',
      fromDate: '2026-10-13',
      toDate: '2026-10-13',
    }, employeeToken());

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Select an Acting Officer');
    expect(query).not.toHaveBeenCalled();
  });

  it('creates a half-day leave with the authenticated employee as applicant', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('FROM employees') && sql.includes('WHERE id = ?')) {
        return params[0] === 17
          ? [[{ id: 17, name: 'Test Employee', email: 'test.employee@example.test', division: 'Accounts' }], []]
          : [[{ id: 99, name: 'Acting Officer', email: 'acting@example.test' }], []];
      }
      if (sql.includes('FROM admins') && sql.includes('LOWER(TRIM(division))')) {
        return [[{ id: 31, email: 'admin@example.test' }], []];
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
      actingOfficerUserId: 99,
      actingOfficerRole: 'employee',
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
      99,
      'employee',
      17,
      'employee',
      'Pending Acting Officer',
      1,
      'Test Employee',
      expect.any(String),
      'Personal appointment',
      'Test address',
      null,
      'hod',
      null,
      null,
    ]);
    const [notificationSql, notificationValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO notifications')
    );
    expect(notificationSql).toContain('recipient_role, recipient_user_id');
    expect(notificationValues.slice(1, 5)).toEqual([
      'Acting Officer',
      'employee',
      99,
      'Accounts',
    ]);
  });

  it('resolves a name-only acting officer and persists the resolved account identity', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('FROM employees') && sql.includes('WHERE id = ?')) {
        return params[0] === 17
          ? [[{ id: 17, name: 'Test Employee', email: 'test.employee@example.test', division: 'Accounts' }], []]
          : [[{ id: 99, name: 'Acting Officer', email: 'acting@example.test' }], []];
      }
      if (sql.includes('FROM employees') && sql.includes('LOWER(TRIM(name))')) {
        return [[{ id: 99, name: 'Acting Officer', email: 'acting@example.test' }], []];
      }
      if (sql.includes('INSERT INTO leaves')) return [{ insertId: 252 }, []];
      if (sql.includes('INSERT INTO notifications')) return [{ insertId: 88 }, []];
      return [[], []];
    });

    const response = await post('/api/admin/leaves', {
      type: 'Half-day',
      fromDate: '2026-10-13',
      toDate: '2026-10-13',
      actingOfficer: 'Acting Officer',
    }, employeeToken());

    expect(response.status).toBe(201);
    const [, insertValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO leaves')
    );
    expect(insertValues.slice(6, 9)).toEqual([
      'Acting Officer',
      99,
      'employee',
    ]);
    const [, notificationValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO notifications')
    );
    expect(notificationValues.slice(1, 5)).toEqual([
      'Acting Officer',
      'employee',
      99,
      'Accounts',
    ]);
  });

  it('calculates a one-day weekday leave inclusively without waiting on notification email', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { ok: true, data: { holidays: [] } },
    });
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('FROM employees') && sql.includes('WHERE id = ?')) {
        return params[0] === 17
          ? [[{ id: 17, name: 'Test Employee', email: 'test.employee@example.test', division: 'Accounts' }], []]
          : [[{ id: 99, name: 'Acting Officer', email: 'acting@example.test' }], []];
      }
      if (sql.includes('INSERT INTO leaves')) return [{ insertId: 251 }, []];
      return [[], []];
    });

    const response = await post('/api/admin/leaves', {
      type: 'Annual',
      fromDate: '2027-02-01',
      toDate: '2027-02-01',
      actingOfficer: 'Acting Officer',
      actingOfficerUserId: 99,
      actingOfficerRole: 'employee',
    }, employeeToken());

    expect(response.status).toBe(201);
    expect(response.body.noOfDays).toBe(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO leaves'))).toBe(true);
    expect(global.setImmediate).toHaveBeenCalledTimes(1);
  });

  it('requires an Acting Officer for Admin leave requests and uses the Admin profile identity', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('FROM admins') && sql.includes('WHERE id = ?')) {
        return [[{ id: 31, name: 'Division Admin', email: 'admin@example.test', division: 'Accounts' }], []];
      }
      if (sql.includes('FROM employees') && sql.includes('WHERE id = ?')) {
        return [[{ id: 99, name: 'Acting Officer', email: 'acting@example.test' }], []];
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
      actingOfficer: 'Acting Officer',
      actingOfficerUserId: 99,
      actingOfficerRole: 'employee',
    }, adminToken());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      leaveId: 247,
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
      'Division Admin',
      'Accounts',
      'Half-day',
      '2026-10-13',
      '2026-10-13',
      0.5,
      'Acting Officer',
      99,
      'employee',
      31,
      'admin',
      'Pending Acting Officer',
      0,
      'Division Admin',
      expect.any(String),
      undefined,
      undefined,
      null,
      'hod',
      null,
      null,
    ]);
  });

  it('fetches acting assignments for the authenticated role and account with legacy division scoping', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT name, division FROM employees')) {
        return [[{ name: 'Test Employee', division: 'Accounts' }], []];
      }
      if (sql.includes('FROM leaves l')) return [[], []];
      return [[], []];
    });
    const token = jwt.sign(
      { id: 17, name: 'Test Employee', role: 'employee', division: 'Accounts' },
      process.env.JWT_SECRET
    );

    const response = await get('/api/admin/leaves/acting-officer', token);

    expect(response.status).toBe(200);
    const [sql, params] = query.mock.calls.find(([statement]) => statement.includes('FROM leaves l'));
    expect(sql).toContain('l.acting_officer_user_id = ? AND l.acting_officer_role = ?');
    expect(sql).toContain("l.acting_officer_user_id IS NULL");
    expect(sql).toContain("LOWER(TRIM(l.division)) = LOWER(TRIM(?))");
    expect(params).toEqual([17, 'employee', 'Test Employee', 'employee', 'Accounts']);
  });

  it('lets an admin assign an employee in the same division as Acting Officer', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('FROM admins') && sql.includes('WHERE id = ?')) {
        return [[{ id: 31, name: 'Division Admin', email: 'admin@example.test', division: 'Accounts' }], []];
      }
      if (sql.includes('FROM employees') && sql.includes('WHERE id = ?')) {
        return [[{ id: 99, name: 'Acting Officer', email: 'acting@example.test' }], []];
      }
      if (sql.includes('INSERT INTO leaves')) return [{ insertId: 252 }, []];
      return [[], []];
    });

    const response = await post('/api/admin/leaves', {
      type: 'Half-day',
      fromDate: '2026-10-13',
      toDate: '2026-10-13',
      actingOfficer: 'Acting Officer',
      actingOfficerUserId: 99,
      actingOfficerRole: 'employee',
    }, adminToken());

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Pending Acting Officer');
    const [insertSql, insertValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO leaves')
    );
    expect(insertSql).toContain('acting_officer_user_id, acting_officer_role');
    expect(insertValues.slice(6, 12)).toEqual([
      'Acting Officer',
      99,
      'employee',
      31,
      'admin',
      'Pending Acting Officer',
    ]);
  });

  it('retrieves leave history by permanent applicant ID and role', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([[], []]);
    const response = await get('/api/admin/leaves/employee', employeeToken());

    expect(response.status).toBe(200);
    const [selectSql, selectValues] = query.mock.calls[0];
    expect(selectSql).toContain('WHERE l.applicant_user_id = ? AND l.applicant_role = ?');
    expect(selectValues).toEqual([17, 'employee']);
  });

  it('prevents an HOD from approving their own leave request', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT email, division')) {
        return [[{ email: 'hod@example.test', division: 'Accounts' }], []];
      }
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
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('sends an employee request to division Admins after the Acting Officer confirms it', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT * FROM leaves WHERE id = ?')) {
        return [[{
          id: 254,
          status: 'Pending Acting Officer',
          employee: 'Test Employee',
          division: 'Accounts',
          type: 'Annual',
          from_date: '2026-10-13',
          to_date: '2026-10-14',
          no_of_days: 2,
          applicant_user_id: 17,
          applicant_role: 'employee',
          acting_officer_user_id: 99,
          acting_officer_role: 'employee',
          admin_approval_required: 1,
          target_approver_role: 'hod',
        }], []];
      }
      if (sql.includes('SELECT name, signature_image')) {
        return [[{ name: 'Acting Officer', signature_image: 'acting-signature', division: 'Accounts' }], []];
      }
      if (sql.includes('SELECT id, email FROM admins')) {
        return [[{ id: 31, email: 'admin@example.test' }], []];
      }
      if (sql.includes('UPDATE leaves')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await put('/api/admin/leaves/254/acting-confirm', {
      action: 'confirm',
    }, jwt.sign(
      { id: 99, name: 'Acting Officer', role: 'employee', division: 'Accounts' },
      process.env.JWT_SECRET
    ));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Pending');
    expect(response.body.emailQueued).toBe(true);
    expect(query.mock.calls.some(([sql]) =>
      sql.includes('SELECT id, email FROM admins')
    )).toBe(true);
    const [updateSql, updateValues] = query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE leaves')
    );
    expect(updateSql).toContain('acting_officer_signature = COALESCE(?, acting_officer_signature)');
    expect(updateValues[5]).toBe('acting-signature');
  });

  it('persists an Acting Officer decline reason for later display', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM leaves WHERE id = ?')) {
        return [[{
          id: 255,
          status: 'Pending Acting Officer',
          employee: 'Test Employee',
          division: 'Accounts',
          type: 'Annual',
          from_date: '2026-10-13',
          to_date: '2026-10-14',
          no_of_days: 2,
          applicant_user_id: 17,
          applicant_role: 'employee',
          acting_officer_user_id: 99,
          acting_officer_role: 'employee',
          target_approver_role: 'hod',
        }], []];
      }
      if (sql.includes('SELECT name, signature_image')) {
        return [[{ name: 'Acting Officer', signature_image: 'acting-signature', division: 'Accounts' }], []];
      }
      if (sql.includes('UPDATE leaves')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await put('/api/admin/leaves/255/acting-confirm', {
      action: 'decline',
      reason: '  Insufficient coverage  ',
    }, jwt.sign(
      { id: 99, name: 'Acting Officer', role: 'employee', division: 'Accounts' },
      process.env.JWT_SECRET
    ));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Declined');
    const [updateSql, updateValues] = query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE leaves')
    );
    expect(updateSql).toContain('decline_reason = ?');
    expect(updateValues[2]).toBe('Acting Officer');
    expect(updateValues[3]).toBe('Insufficient coverage');
  });

  it('requires a decline reason for Secretary decisions', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await put('/api/admin/leaves/245/secretary-approve', {
      action: 'decline',
      reason: '   ',
    }, secretaryToken());

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('A decline reason is required.');
    expect(query).not.toHaveBeenCalled();
  });

  it('allows the assigned Secretary to decide only HOD requests and persists decision history', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('FROM leaves WHERE id = ?')) {
        return [[{
          id: 245,
          status: 'Pending',
          applicantRole: 'hod',
          applicantUserId: 71,
          employee: 'Accounts HOD',
          division: 'Accounts',
          type: 'Annual',
          target_approver_role: 'secretary',
          target_approver_id: 81,
          target_approver_email: 'secretary@example.test',
          from: '2026-11-02',
          to: '2026-11-04',
          noOfDays: 2,
          actingOfficer: 'Acting Officer',
          reason: null,
          address: null,
        }], []];
      }
      if (sql.includes('FROM secretary WHERE id = ?')) {
        return [[{ name: 'Ministry Secretary', email: 'secretary@example.test', signature_image: 'secretary-signature' }], []];
      }
      if (sql.includes('UPDATE leaves')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await put('/api/admin/leaves/245/secretary-approve', {
      action: 'decline',
      reason: '  Coverage is unavailable  ',
    }, secretaryToken());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'Declined',
      declineReason: 'Coverage is unavailable',
      secretaryDecidedById: 81,
      emailQueued: true,
    });
    const [updateSql, updateValues] = query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE leaves')
    );
    expect(updateSql).toContain('secretary_decided_at = CURRENT_TIMESTAMP');
    expect(updateSql).toContain('secretary_decided_by_id = ?');
    expect(updateSql).toContain('secretary_signature = COALESCE(?, secretary_signature)');
    expect(updateSql).not.toContain('approved_by =');
    expect(updateSql).not.toContain('approver_signature =');
    expect(updateSql).toContain("applicant_role = 'hod'");
    expect(updateSql).toContain("target_approver_role = 'secretary'");
    expect(updateValues.slice(0, 3)).toEqual([
      'Declined',
      'Ministry Secretary',
      'Coverage is unavailable',
    ]);
    expect(updateValues[4]).toBe(81);
    expect(response.body.secretarySignature).toBe('secretary-signature');
  });

  it('does not allow a Secretary to process a request assigned to another approver or applicant role', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('FROM leaves WHERE id = ?')) {
        return [[{
          id: 246,
          status: 'Pending',
          applicantRole: 'employee',
          applicantUserId: 17,
          target_approver_role: 'secretary',
          target_approver_id: 82,
          target_approver_email: 'other@example.test',
        }], []];
      }
      if (sql.includes('FROM secretary WHERE id = ?')) {
        return [[{ email: 'secretary@example.test', signature_image: null }], []];
      }
      return [[], []];
    });

    const response = await put('/api/admin/leaves/246/secretary-approve', {
      action: 'approve',
    }, secretaryToken());

    expect(response.status).toBe(403);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE leaves'))).toBe(false);
  });

  it('does not expose Acting Officer queues to Secretaries', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await get('/api/admin/leaves/acting-officer', secretaryToken());

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not allow Secretaries to approve or decline as Acting Officers', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await put('/api/admin/leaves/245/acting-confirm', {
      action: 'confirm',
    }, secretaryToken());

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('orders Secretary leave records FIFO by submission timestamp and request ID', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([[], []]);
    const response = await get('/api/admin/leaves/all', secretaryToken());

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'ORDER BY COALESCE(l.created_at, l.applied_on) ASC, l.id ASC'
    );
  });

  it('returns HOD approval as soon as the leave status is committed and queues email separately', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT email, division')) {
        return [[{ email: 'hod@example.test', division: 'Accounts' }], []];
      }
      if (sql.includes('SELECT id, status, applicant_user_id')) {
        return [[{
          id: 250,
          status: 'Admin Approved',
          applicantUserId: 17,
          applicantRole: 'employee',
          adminApprovalRequired: true,
          appliedBy: 'Test Employee',
          employee: 'Test Employee',
          division: 'Accounts',
          type: 'Annual',
          from: '2026-10-13',
          to: '2026-10-14',
          noOfDays: 2,
          actingOfficer: 'Acting Officer',
          target_approver_id: null,
          target_approver_role: null,
          target_approver_email: null,
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
    const [updateSql] = query.mock.calls.find(([sql]) => sql.includes('UPDATE leaves'));
    expect(updateSql).toContain('WHERE id = ? AND status = ?');
    expect(updateSql).not.toContain('admin_signature =');
    expect(global.setImmediate).toHaveBeenCalledTimes(1);
  });

  it('prevents HOD approval before Admin pre-approval when the division has an Admin', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT email, division')) {
        return [[{ email: 'hod@example.test', division: 'Accounts' }], []];
      }
      if (sql.includes('SELECT id, status, applicant_user_id')) {
        return [[{
          id: 251,
          status: 'Pending',
          applicantUserId: 17,
          applicantRole: 'employee',
          adminApprovalRequired: true,
          appliedBy: 'Test Employee',
          division: 'Accounts',
          target_approver_id: null,
          target_approver_role: 'hod',
          target_approver_email: null,
        }], []];
      }
      return [[], []];
    });

    const response = await put('/api/admin/leaves/251/hod-approve', {
      action: 'approve',
    }, hodToken());

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('must be approved by Admin');
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE leaves'))).toBe(false);
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

  it('requires Admin pre-approval before an employee leave can be sent to HOD', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([[
      {
        id: 252,
        status: 'Pending',
        applicantRole: 'employee',
        adminApprovalRequired: true,
      },
    ], []]);

    const response = await put('/api/admin/leaves/252/status', {
      status: 'Approved',
    }, adminToken());

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('HOD gives the final approval');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stores the Admin signature and pre-approval without waiting for email delivery', async () => {
    vi.spyOn(global, 'setImmediate').mockImplementation(() => 0);
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('FROM leaves WHERE id = ? AND division = ?')) {
        return [[{
          id: 253,
          status: 'Pending',
          applicantRole: 'employee',
          adminApprovalRequired: true,
          employee: 'Test Employee',
          division: 'Accounts',
          type: 'Annual',
          from: '2026-10-13',
          to: '2026-10-14',
          applicantUserId: 17,
          applicantRole: 'employee',
          actingOfficerUserId: 99,
          actingOfficerRole: 'employee',
          adminSignature: 'data:image/png;base64,admin-signature',
        }], []];
      }
      if (sql.includes('UPDATE leaves')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await put('/api/admin/leaves/253/status', {
      status: 'Admin Approved',
    }, adminToken());

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Admin Approved');
    const [updateSql, updateValues] = query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE leaves')
    );
    expect(updateSql).toContain('admin_signature = COALESCE(?, admin_signature)');
    expect(updateValues[6]).toBe('data:image/png;base64,admin-signature');
    expect(global.setImmediate).toHaveBeenCalled();
  });
});
