const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const { broadcastNotification } = require('./notificationsStream');

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for current user (role-aware)
 * @access  Private
 */
router.get('/', verifyToken, async (req, res) => {
  const role = req.user.role;
  const userName = req.user.name;
  const userDivision = req.user.division;

  try {
    let query = '';
    let params = [];

    if (role === 'admin') {
      query = `
        SELECT id, message, type, recipient, division, link,
          read_status as \`read\`,
          created_at as timestamp
        FROM notifications
        WHERE recipient = 'admin'
          AND (division = ? OR division IS NULL)
        ORDER BY created_at DESC
        LIMIT 100
      `;
      params = [userDivision];
    } else if (role === 'hod') {
      query = `
        SELECT id, message, type, recipient, division, link,
          read_status as \`read\`,
          created_at as timestamp
        FROM notifications
        WHERE recipient = 'hod'
          AND (division = ? OR division IS NULL)
        ORDER BY created_at DESC
        LIMIT 100
      `;
      params = [userDivision];
    } else {
      query = `
        SELECT id, message, type, recipient, division, link,
          read_status as \`read\`,
          created_at as timestamp
        FROM notifications
        WHERE recipient = ?
        ORDER BY created_at DESC
        LIMIT 100
      `;
      params = [userName];
    }

    const [rows] = await pool.query(query, params);

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
router.post('/', verifyToken, async (req, res) => {
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
      `SELECT id, message, type, recipient, division, link, read_status as \`read\`, created_at as timestamp
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
router.patch('/:id/read', verifyToken, async (req, res) => {
  const notifId = req.params.id;
  const role = req.user.role;
  const userName = req.user.name;
  const userDivision = req.user.division;

  try {
    let ownershipQuery;
    let ownershipParams;

    if (role === 'admin') {
      ownershipQuery = `recipient = 'admin' AND (division = ? OR division IS NULL)`;
      ownershipParams = [userDivision];
    } else if (role === 'hod') {
      ownershipQuery = `recipient = 'hod' AND (division = ? OR division IS NULL)`;
      ownershipParams = [userDivision];
    } else {
      ownershipQuery = `recipient = ?`;
      ownershipParams = [userName];
    }

    const [result] = await pool.query(
      `UPDATE notifications SET read_status = 1 
       WHERE id = ? AND ${ownershipQuery}`,
      [notifId, ...ownershipParams]
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
router.patch('/read-all', verifyToken, async (req, res) => {
  const role = req.user.role;
  const userName = req.user.name;
  const userDivision = req.user.division;

  try {
    let query = '';
    let params = [];

    if (role === 'admin') {
      query = `UPDATE notifications SET read_status = 1 
               WHERE recipient = 'admin' AND (division = ? OR division IS NULL)`;
      params = [userDivision];
    } else if (role === 'hod') {
      query = `UPDATE notifications SET read_status = 1 
               WHERE recipient = 'hod' AND (division = ? OR division IS NULL)`;
      params = [userDivision];
    } else {
      query = `UPDATE notifications SET read_status = 1 WHERE recipient = ?`;
      params = [userName];
    }

    await pool.query(query, params);

    return res.status(200).json({ message: 'All marked as read.' });
  } catch (error) {
    console.error('[Notifications API] PATCH /read-all:', error);
    return res.status(500).json({ message: 'Failed to mark all as read.' });
  }
});

module.exports = router;