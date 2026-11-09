import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-secretary-signature-secret';

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

function request(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        } : {}),
        Authorization: `Bearer ${token}`,
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

const secretaryToken = () => jwt.sign(
  { id: 81, name: 'Ministry Secretary', role: 'secretary' },
  process.env.JWT_SECRET
);
const employeeToken = () => jwt.sign(
  { id: 17, name: 'Test Employee', role: 'employee' },
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
  await new Promise((resolve) => server.close(resolve));
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe('Secretary signature profile endpoints', () => {
  it('loads and saves the signature in the Secretary profile', async () => {
    pool.query
      .mockResolvedValueOnce([[{ signature_image: 'saved-signature-image' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const loaded = await request('/api/auth/signature', 'GET', undefined, secretaryToken());
    const saved = await request(
      '/api/auth/signature',
      'PUT',
      { signature: 'new-signature-image' },
      secretaryToken()
    );

    expect(loaded).toMatchObject({
      status: 200,
      body: { signature: 'saved-signature-image' },
    });
    expect(saved.status).toBe(200);
    expect(pool.query.mock.calls[0][0]).toContain('FROM secretary');
    expect(pool.query.mock.calls[1][0]).toContain('UPDATE secretary');
    expect(pool.query.mock.calls[1][1]).toEqual(['new-signature-image', 81]);
  });

  it('saves an employee signature in the employee profile', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const saved = await request(
      '/api/auth/signature',
      'PUT',
      { signature: 'employee-signature-image' },
      employeeToken()
    );

    expect(saved.status).toBe(200);
    expect(pool.query.mock.calls[0][0]).toContain('UPDATE employees');
    expect(pool.query.mock.calls[0][1]).toEqual(['employee-signature-image', 17]);
  });
});
