import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-profile-leave-identity-secret';

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
    const httpRequest = http.request(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
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
    httpRequest.on('error', reject);
    httpRequest.end(payload);
  });
}

const employeeToken = () => jwt.sign(
  { id: 17, name: 'New Name', role: 'employee', division: 'Accounts' },
  process.env.JWT_SECRET
);

describe('profile leave identity', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => vi.restoreAllMocks());

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

  it('associates legacy leaves with the permanent ID before changing the profile name', async () => {
    const query = vi.spyOn(pool, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT name, division FROM employees')) {
        return [[{ name: 'Old Name', division: 'Accounts' }], []];
      }
      if (sql.includes('SELECT id FROM employees WHERE LOWER(email)')) return [[], []];
      if (sql.includes('SELECT id, name, email, designation, division, status')) {
        return [[{
          id: 17,
          name: 'New Name',
          email: 'new.name@example.test',
          designation: 'Officer',
          division: 'Accounts',
          status: 'Active',
          appointmentDate: '2020-01-01',
        }], []];
      }
      return [{ affectedRows: 1 }, []];
    });

    const response = await request('PUT', '/api/auth/profile', {
      name: 'New Name',
      email: 'new.name@example.test',
      designation: 'Officer',
    }, employeeToken());

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({ id: 17, name: 'New Name' });

    const [migrationSql, migrationValues] = query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE leaves')
    );
    expect(migrationSql).toContain('applicant_user_id = ?');
    expect(migrationValues).toEqual([17, 'employee', 'Old Name', 'Accounts']);
  });
});
