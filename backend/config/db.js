const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'employes_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test connection
pool.getConnection()
  .then((conn) => {
    console.log(
      `[DB] Connected to MySQL database "${process.env.DB_NAME || 'employes_db'}" successfully.`
    );
    conn.release();
  })
  .catch((err) => {
    console.error('[DB] Error connecting to MySQL:', err.message);
  });

module.exports = pool;