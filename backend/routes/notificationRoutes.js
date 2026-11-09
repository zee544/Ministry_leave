const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, denySystemAdmin } = require('../middleware/auth');
const { broadcastNotification } = require('./notificationsStream');

function getNotificationScope(user) {
  const role = user.role;
  const roleRecipient = role === 'admin' || role === 'hod' ? ` OR recipient = '${role}'` : '';
  const recipientClause = `((
    recipient_role = ? AND recipient_user_id = ?
  ) OR (
    recipient_role IS NULL AND (LOWER(CONVERT(recipient USING utf8mb4)) = LOWER(CONVERT(? USING utf8mb4))${roleRecipient})
  ))`;
  const divisionClause = role === 'hod'
    ? 'LOWER(CONVERT(division USING utf8mb4)) = LOWER(CONVERT(? USING utf8mb4))'
    : role === 'secretary'
      ? '1 = 1'
      : '(LOWER(CONVERT(division USING utf8mb4)) = LOWER(CONVERT(? USING utf8mb4)) OR division IS NULL)';

  return {
    clause: `${recipientClause} AND ${divisionClause}`,
    params: role === 'secretary'
      ? [role, user.id, user.name]
      : [role, user.id, user.name, user.division || ''],
  };
}

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for current user (role-aware)
 * @access  Private
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const scope = getNotificationScope(req.user);
    const [rows] = await pool.query(
      `SELECT id, message, type, recipient, recipient_role AS recipientRole,
        recipient_user_id AS recipientUserId, division, link,
        read_status as \`read\`, created_at as timestamp
       FROM notifications
       WHERE ${scope.clause}
       ORDER BY created_at DESC
       LIMIT 100`,
      scope.params
    );

    const mapped = rows.map((n) => ({
      ...n,
      read: Boolean(n.read),
    }));

    return res.status(200).json(mapped);
  } catch (error) {
    console.error('[Notifications API] GET /:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

/**
 * @route   POST /api/notifications
 * @desc    Create a new notification
 * @access  Private
 */
router.post('/', verifyToken, denySystemAdmin, async (req, res) => {
  const { message, type, recipient, division, link } = req.body;

  if (!message || !type || !recipient) {
    return res.status(400).json({ message: 'Message, type, and recipient are required.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (message, type, recipient, division, link, read_status)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [message, type, recipient, division || null, link || null]
    );

    const [newNotif] = await pool.query(
      `SELECT id, message, type, recipient, recipient_role AS recipientRole,
        recipient_user_id AS recipientUserId, division, link,
        read_status as \`read\`, created_at as timestamp
       FROM notifications WHERE id = ?`,
      [result.insertId]
    );

    const notification = {
      ...newNotif[0],
      read: Boolean(newNotif[0].read),
    };

    broadcastNotification(notification);

    return res.status(201).json(notification);
  } catch (error) {
    console.error('[Notifications API] POST /:', error);
    return res.status(500).json({ message: 'Failed to create notification.' });
  }
});

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.patch('/:id/read', verifyToken, denySystemAdmin, async (req, res) => {
  const notifId = req.params.id;
  try {
    const scope = getNotificationScope(req.user);

    const [result] = await pool.query(
      `UPDATE notifications SET read_status = 1 
       WHERE id = ? AND ${scope.clause}`,
      [notifId, ...scope.params]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notification not found or access denied.' });
    }

    return res.status(200).json({ message: 'Marked as read.' });
  } catch (error) {
    console.error('[Notifications API] PATCH /:id/read:', error);
    return res.status(500).json({ message: 'Failed to mark as read.' });
  }
});

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications for current user as read
 * @access  Private
 */
router.patch('/read-all', verifyToken, denySystemAdmin, async (req, res) => {
  try {
    const scope = getNotificationScope(req.user);
    await pool.query(
      `UPDATE notifications SET read_status = 1 WHERE ${scope.clause}`,
      scope.params
    );

    return res.status(200).json({ message: 'All marked as read.' });
  } catch (error) {
    console.error('[Notifications API] PATCH /read-all:', error);
    return res.status(500).json({ message: 'Failed to mark all as read.' });
  }
});

module.exports = router;
