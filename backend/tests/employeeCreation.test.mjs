import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-employee-creation-secret';

const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
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
        ...(token ? { Authorization: token } : {}),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(responseBody) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function patch(path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: token } : {}),
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(responseBody) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function tokenFor(role) {
  return jwt.sign(
    { id: 5, name: 'Test Admin', role, division: 'Accounts' },
    process.env.JWT_SECRET
  );
}

describe('employee creation endpoint', () => {
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

  it('requires authentication', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await post('/api/admin/employees', {});

    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows employee creation only for admins', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await post('/api/admin/employees', {}, tokenFor('employee'));

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires a name, designation, and email', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await post(
      '/api/admin/employees',
      { name: 'New Employee', designation: 'Officer' },
      tokenFor('admin')
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Name, division, and email are required.');
    expect(query).not.toHaveBeenCalled();
  });

  it('creates an active employee in the authenticated admin division with a hashed password', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([{ insertId: 325 }, []]);
    const response = await post('/api/admin/employees', {
      name: 'New Employee',
      designation: 'Officer',
      division: 'A different division',
      email: 'new.employee@example.test',
      appointment_date: '2026-10-12',
      password: 'SecureTestPass123',
    }, tokenFor('admin'));

    expect(response.status).toBe(201);
    expect(response.body.employee).toMatchObject({
      id: 325,
      name: 'New Employee',
      designation: 'Officer',
      division: 'Accounts',
      email: 'new.employee@example.test',
      appointment_date: '2026-10-12',
      status: 'Active',
    });

    const [insertSql, insertValues] = query.mock.calls[0];
    expect(insertSql).toContain("VALUES (?, ?, ?, ?, ?, ?, 'Active')");
    expect(insertValues.slice(0, 4)).toEqual([
      'New Employee',
      'Officer',
      'Accounts',
      'new.employee@example.test',
    ]);
    await expect(bcrypt.compare('SecureTestPass123', insertValues[4])).resolves.toBe(true);
    expect(insertValues[5]).toBe('2026-10-12');
  });

  it('lets HODs create employees in their assigned division with optional details and the default password', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT division FROM hod')) return [[{ division: 'Accounts' }], []];
      if (sql.includes('SELECT id FROM')) return [[], []];
      if (sql.includes('INSERT INTO employees')) return [{ insertId: 326 }, []];
      return [[], []];
    });

    const response = await post('/api/admin/hod/employees', {
      name: 'HOD Employee',
      email: 'hod.employee@example.test',
      division: 'A different division',
    }, tokenFor('hod'));

    expect(response.status).toBe(201);
    expect(response.body.employee).toMatchObject({
      id: 326,
      division: 'Accounts',
      email: 'hod.employee@example.test',
      designation: null,
      appointment_date: null,
      status: 'Active',
    });
    expect(response.body.temporaryPassword).toBe('Ministry@123');

    const [insertSql, insertValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO employees')
    );
    expect(insertSql).toContain('must_change_password');
    expect(insertValues.slice(0, 4)).toEqual([
      'HOD Employee',
      null,
      'Accounts',
      'hod.employee@example.test',
    ]);
    expect(insertValues[5]).toBeNull();
    expect(insertSql).toContain("'Active', 1");
    await expect(bcrypt.compare('Ministry@123', insertValues[4])).resolves.toBe(true);
  });

  it('allows HODs to set a custom initial password', async () => {
    vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT division FROM hod')) return [[{ division: 'Accounts' }], []];
      if (sql.includes('SELECT id FROM')) return [[], []];
      if (sql.includes('INSERT INTO employees')) return [{ insertId: 327 }, []];
      return [[], []];
    });

    const response = await post('/api/admin/hod/employees', {
      name: 'Custom Password Employee',
      email: 'custom.employee@example.test',
      password: 'MyCustomPass123',
    }, tokenFor('hod'));

    expect(response.status).toBe(201);
    expect(response.body.temporaryPassword).toBe('MyCustomPass123');
  });

  it('allows HODs to edit employees only in their own division', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT division FROM hod')) return [[{ division: 'Accounts' }], []];
      if (sql.includes('SELECT id FROM employees') && sql.includes('WHERE id = ? AND LOWER(TRIM(division))')) {
        return [[{ id: 410 }], []];
      }
      if (sql.includes('UPDATE employees')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await put('/api/admin/hod/employees/410', {
      name: 'Updated Employee',
      designation: '',
      division: 'Accounts',
      email: 'updated.employee@example.test',
      appointment_date: '',
      status: 'On Leave',
    }, tokenFor('hod'));

    expect(response.status).toBe(200);
    expect(response.body.employee).toMatchObject({
      id: 410,
      name: 'Updated Employee',
      designation: null,
      division: 'Accounts',
      email: 'updated.employee@example.test',
      appointment_date: null,
      status: 'On Leave',
    });
    const [updateSql, updateValues] = query.mock.calls.find(([sql]) => sql.includes('UPDATE employees'));
    expect(updateSql).toContain('WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))');
    expect(updateValues).toEqual([
      'Updated Employee',
      null,
      'Accounts',
      'updated.employee@example.test',
      null,
      'On Leave',
      '410',
      'Accounts',
    ]);
  });

  it('prevents HODs from assigning employees to another division', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT division FROM hod')) return [[{ division: 'Accounts' }], []];
      return [[], []];
    });
    const response = await put('/api/admin/hod/employees/410', {
      name: 'Updated Employee',
      designation: '',
      division: 'Administration',
      email: 'updated.employee@example.test',
      appointment_date: '',
      status: 'Active',
    }, tokenFor('hod'));

    expect(response.status).toBe(403);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE employees'))).toBe(false);
  });

  it('lets HODs activate and deactivate employees in their own division', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT division FROM hod')) return [[{ division: 'Accounts' }], []];
      if (sql.includes('SELECT status FROM employees')) return [[{ status: 'Active' }], []];
      if (sql.includes('UPDATE employees')) return [{ affectedRows: 1 }, []];
      return [[], []];
    });

    const response = await patch('/api/admin/hod/employees/410/status', {}, tokenFor('hod'));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Inactive');
    const [updateSql, updateValues] = query.mock.calls.find(([sql]) => sql.includes('UPDATE employees'));
    expect(updateSql).toContain('WHERE id = ? AND LOWER(TRIM(division)) = LOWER(TRIM(?))');
    expect(updateValues).toEqual(['Inactive', '410', 'Accounts']);
  });

  it('does not allow employees to use the HOD employee creation endpoint', async () => {
    const query = vi.spyOn(pool, 'query');
    const response = await post('/api/admin/hod/employees', {}, tokenFor('employee'));

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
