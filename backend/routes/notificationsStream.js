const express = require('express');
const crypto = require('crypto');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const clients = new Map();
const streamTickets = new Map();
const STREAM_TICKET_TTL_MS = 30 * 1000;
const MAX_STREAM_TICKETS = 5000;

function keyFor(user) {
  return `${user.role}:${user.division || ''}:${user.name || ''}`;
}

function removeClient(key, res) {
  const set = clients.get(key);

  if (!set) return;

  set.delete(res);

  if (set.size === 0) {
    clients.delete(key);
  }
}

router.post('/stream-ticket', verifyToken, (req, res) => {
  const now = Date.now();
  for (const [ticket, entry] of streamTickets) {
    if (entry.expiresAt <= now) streamTickets.delete(ticket);
  }

  if (streamTickets.size >= MAX_STREAM_TICKETS) {
    return res.status(503).json({ message: 'Notification stream is busy. Please retry.' });
  }

  const ticket = crypto.randomBytes(32).toString('base64url');
  streamTickets.set(ticket, {
    user: req.user,
    expiresAt: now + STREAM_TICKET_TTL_MS,
  });

  return res.status(201).json({
    ticket,
    expiresInSeconds: STREAM_TICKET_TTL_MS / 1000,
  });
});

/**
 * GET /api/notifications/stream
 * Server-Sent Events connection
 */
router.get('/stream', (req, res) => {
  const ticket = req.query.ticket;

  if (typeof ticket !== 'string' || !ticket) {
    return res.status(401).json({ message: 'A valid stream ticket is required.' });
  }

  const ticketEntry = streamTickets.get(ticket);
  streamTickets.delete(ticket);
  if (!ticketEntry || ticketEntry.expiresAt <= Date.now()) {
    return res.status(401).json({ message: 'The stream ticket is invalid or expired.' });
  }

  const key = keyFor(ticketEntry.user);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);

  let closed = false;
  let heartbeat;
  const cleanup = () => {
    if (closed) return;

    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    removeClient(key, res);
  };

  req.on('aborted', cleanup);
  res.on('close', cleanup);
  res.on('error', (error) => {
    console.warn(`[SSE] Response error (${error.code || 'UNKNOWN'}).`);
    cleanup();
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  try {
    if (!closed && !res.destroyed) {
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    }
  } catch {
    cleanup();
  }

  if (!closed) {
    heartbeat = setInterval(() => {
      if (closed || res.writableEnded || res.destroyed) {
        cleanup();
        return;
      }

      try {
        res.write(': heartbeat\n\n');
      } catch {
        cleanup();
      }
    }, 20000);
  }
});


/**
 * Broadcast notification to connected clients
 */
function broadcastNotification(notification) {
  const {
    recipient,
    division,
  } = notification;

  const normalize = (value) =>
    (value || '').toString().trim().toLowerCase();

  const targetRecipient = normalize(recipient);
  const targetDivision = normalize(division);

  const targets = [];

  for (const [key, set] of clients.entries()) {
    const [role, div, ...nameParts] = key.split(':');

    const name = nameParts.join(':');

    const nRole = normalize(role);
    const nDiv = normalize(div);
    const nName = normalize(name);

    let matches = false;

    // Admin / HOD
    if (
      targetRecipient === 'admin' ||
      targetRecipient === 'hod'
    ) {
      matches =
        nRole === targetRecipient &&
        (
          !targetDivision ||
          nDiv === targetDivision ||
          nDiv === ''
        );
    }

    // Normal employee
    else {
      matches = nName === targetRecipient;
    }

    if (matches) {
      for (const client of set) {
        targets.push(client);
      }
    }
  }

  const payload =
    `event: notification\n` +
    `data: ${JSON.stringify(notification)}\n\n`;

  for (const client of targets) {
    try {
      if (
        !client.destroyed &&
        !client.writableEnded
      ) {
        client.write(payload);
      }
    } catch (error) {
      console.warn(`[SSE] Notification write failed (${error.code || 'UNKNOWN'}).`);
    }
  }
}

module.exports = {
  router,
  broadcastNotification,
};