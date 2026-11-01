import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'vitest-notification-routes-secret';

const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const pool = {
  query: vi.fn(),
  getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
};
const createPool = vi.spyOn(mysql, 'createPool').mockReturnValue(pool);
const router = require('../routes/notificationRoutes');
createPool.mockRestore();

let server;
let baseUrl;

function get(path, token) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

describe('notification recipient routes', () => {
  beforeAll(async () => {
    const app = express();
    app.use(router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('returns notifications for the exact HOD identity and division', async () => {
    const query = vi.spyOn(pool, 'query').mockResolvedValue([[
      {
        id: 12,
        message: 'A leave request needs your approval.',
        type: 'leave_application',
        recipient: 'Accounts HOD',
        recipientRole: 'hod',
        recipientUserId: 71,
        division: 'Accounts',
        read: 0,
      },
    ], []]);
    const token = jwt.sign(
      { id: 71, name: 'Accounts HOD', role: 'hod', division: 'Accounts' },
      process.env.JWT_SECRET
    );

    const response = await get('/', token);

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      recipientRole: 'hod',
      recipientUserId: 71,
      division: 'Accounts',
    });
    expect(query.mock.calls[0][0]).toContain('recipient_role = ? AND recipient_user_id = ?');
    expect(query.mock.calls[0][1]).toEqual(['hod', 71, 'Accounts HOD', 'Accounts']);
  });
});
