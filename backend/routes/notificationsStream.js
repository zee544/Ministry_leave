const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const clients = new Map();

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

/**
 * GET /api/notifications/stream
 * Server-Sent Events connection
 */
router.get('/stream', (req, res) => {
  const token = req.query.token;

  if (!token) {
    console.warn('[SSE] ❌ No token provided');
    return res.status(401).json({
      message: 'Token required',
    });
  }

  let user;

  try {
    user = jwt.verify(
      token,
      process.env.JWT_SECRET || 'leave_sys_123'
    );
  } catch (err) {
    console.warn('[SSE] ❌ Invalid token:', err.message);

    return res.status(401).json({
      message: 'Invalid token',
    });
  }

  // SSE headers
  res.statusCode = 200;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Important for SSE
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Initial connection message
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      ok: true,
    })}\n\n`
  );

  const key = keyFor(user);

  if (!clients.has(key)) {
    clients.set(key, new Set());
  }

  clients.get(key).add(res);

  console.log(
    `[SSE] ✅ Client connected: ${key} | Connections: ${
      clients.get(key).size
    }`
  );

  let closed = false;

  // Heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    if (closed || res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }

    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      console.log('[SSE] ⚠️ Heartbeat failed');

      closed = true;
      clearInterval(heartbeat);
      removeClient(key, res);

      try {
        res.end();
      } catch (_) {}
    }
  }, 20000);

  // Browser/client closed connection
  const cleanup = () => {
    if (closed) return;

    closed = true;

    clearInterval(heartbeat);
    removeClient(key, res);

    console.log(`[SSE] 🔌 Client disconnected: ${key}`);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);

  // Prevent ECONNRESET / socket errors from becoming uncaught
  res.on('error', (error) => {
    console.log(
      `[SSE] ⚠️ Response error for ${key}: ${error.code || error.message}`
    );

    cleanup();
  });
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

  let sentCount = 0;

  for (const client of targets) {
    try {
      if (
        !client.destroyed &&
        !client.writableEnded
      ) {
        client.write(payload);
        sentCount++;
      }
    } catch (error) {
      console.log(
        '[SSE] ⚠️ Failed to send notification:',
        error.code || error.message
      );
    }
  }

  console.log(
    `[SSE] 📢 Broadcast recipient="${recipient}" division="${division}" → ${sentCount} client(s)`
  );
}

module.exports = {
  router,
  broadcastNotification,
};