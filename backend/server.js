const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { router: notificationsStreamRouter } = require('./routes/notificationsStream');
const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', async (req, res) => {
  try {
    const [result] = await pool.query('SELECT 1 as is_alive');
    return res.status(200).json({
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: result[0].is_alive === 1 ? 'Connected' : 'Disconnected',
    });
  } catch (err) {
    console.error('[Health] Database check failed:', err.code || 'UNKNOWN');
    return res.status(500).json({ status: 'ERROR', database: 'Unavailable' });
  }
});

app.use('/api/notifications', notificationsStreamRouter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: `API route ${req.originalUrl} not found.` });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[Server] Ministry Leave System Backend running at http://${HOST}:${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

server.on('error', (error) => {
  console.error(`[Server] Failed to listen on ${HOST}:${PORT} (${error.code || 'UNKNOWN'}).`);
  process.exitCode = 1;
});
