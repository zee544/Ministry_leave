import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const http = require('http');
const jwt = require('jsonwebtoken');
const express = require('express');
const { router, broadcastNotification } = require('../routes/notificationsStream');

const originalJwtSecret = process.env.JWT_SECRET;
let server;
let baseUrl;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function createTicket(token) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/stream-ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode, body: JSON.parse(body) });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function connectToStream(token) {
  return createTicket(token).then(({ status, body }) => {
    if (status !== 201) throw new Error('Unable to create a notification stream ticket.');
    return connectWithTicket(body.ticket);
  });
}

function connectWithTicket(ticket) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      `${baseUrl}/stream?ticket=${encodeURIComponent(ticket)}`,
      (response) => {
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
          if (body.includes('event: connected')) {
            resolve({ request, response, getBody: () => body });
          }
        });
        response.on('error', reject);
      }
    );
    request.on('error', reject);
  });
}

describe('notification event stream', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'vitest-notification-secret';
    const app = express();
    app.use(router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
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
    vi.restoreAllMocks();
  });

  it('requires a token to open the stream', async () => {
    const result = await get('/stream');

    expect(result.status).toBe(401);
    expect(result.body).toContain('stream ticket');
  });

  it('rejects reuse of a one-time stream ticket', async () => {
    const token = jwt.sign(
      { role: 'employee', division: 'Accounts', name: 'Alice' },
      process.env.JWT_SECRET
    );
    const { body } = await createTicket(token);
    const client = await connectWithTicket(body.ticket);
    client.request.destroy();

    const reuse = await get(`/stream?ticket=${encodeURIComponent(body.ticket)}`);
    expect(reuse.status).toBe(401);
  });

  it('sends notifications to the matching connected employee', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const token = jwt.sign(
      { role: 'employee', division: 'Accounts', name: 'Alice' },
      process.env.JWT_SECRET
    );
    const client = await connectToStream(token);
    const notification = {
      recipient: ' alice ',
      division: 'Accounts',
      message: 'Leave status updated',
    };

    broadcastNotification(notification);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Notification was not streamed')), 1000);
      const checkForNotification = () => {
        if (client.getBody().includes('event: notification')) {
          clearTimeout(timeout);
          resolve();
        }
      };
      client.response.on('data', checkForNotification);
      checkForNotification();
    });

    expect(client.getBody()).toContain(JSON.stringify(notification));
    client.request.destroy();
  });
});
