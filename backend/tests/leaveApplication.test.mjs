import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-leave-application-secret';

const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
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

function employeeToken() {
  return jwt.sign(
    { id: 17, name: 'Test Employee', role: 'employee', division: 'Accounts' },
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
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
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
      emailSent: false,
    });

    const [insertSql, insertValues] = query.mock.calls.find(
      ([sql]) => sql.includes('INSERT INTO leaves')
    );
    expect(insertSql).toContain("'Pending Acting Officer'");
    expect(insertValues).toEqual([
      'Test Employee',
      'Accounts',
      'Half-day',
      '2026-10-13',
      '2026-10-13',
      0.5,
      'Acting Officer',
      'Test Employee',
      expect.any(String),
      'Personal appointment',
      'Test address',
    ]);
  });
});
