const SECRETARY_DECISION_COLUMNS = [
  ['secretary_decided_at', 'DATETIME NULL'],
  ['secretary_decided_by_id', 'INT NULL'],
  ['secretary_signature', 'MEDIUMTEXT NULL'],
];
const SIGNATURE_PROFILE_TABLES = [
  'admins',
  'hod',
  'executive_officers',
  'secretary',
  'employees',
];

async function ensureSystemAdminTables(database) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS system_admin_slots (
      slot TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      CONSTRAINT chk_system_admin_slot CHECK (slot IN (1, 2))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await database.query(
    'INSERT IGNORE INTO system_admin_slots (slot) VALUES (1), (2)'
  );
  await database.query(`
    CREATE TABLE IF NOT EXISTS system_admins (
      account_slot TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(80) NOT NULL UNIQUE,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'system_admin',
      designation VARCHAR(100) NOT NULL DEFAULT 'System Administrator',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_system_admin_account_slot
        FOREIGN KEY (account_slot) REFERENCES system_admin_slots (slot)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [columns] = await database.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'system_admins'
       AND COLUMN_NAME IN ('username', 'phone')`
  );
  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existingColumns.has('username')) {
    await database.query(
      'ALTER TABLE system_admins ADD COLUMN username VARCHAR(80) NULL UNIQUE AFTER name'
    );
    console.log('[DB Migration] Added System Admin usernames.');
  }
  if (!existingColumns.has('phone')) {
    await database.query(
      'ALTER TABLE system_admins ADD COLUMN phone VARCHAR(30) NULL AFTER email'
    );
    console.log('[DB Migration] Added System Admin phone numbers.');
  }
}

async function ensureSecretaryDecisionColumns(database) {
  const [existingColumns] = await database.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'leaves'
       AND COLUMN_NAME IN (?, ?, ?)`,
    SECRETARY_DECISION_COLUMNS.map(([columnName]) => columnName)
  );
  const existing = new Set(existingColumns.map((column) => column.COLUMN_NAME));
  const addedColumns = [];

  for (const [columnName, definition] of SECRETARY_DECISION_COLUMNS) {
    if (existing.has(columnName)) continue;
    await database.query(
      `ALTER TABLE leaves ADD COLUMN \`${columnName}\` ${definition}`
    );
    addedColumns.push(columnName);
  }

  if (addedColumns.length) {
    console.log(`[DB Migration] Added leave decision columns: ${addedColumns.join(', ')}.`);
  }
}

async function ensureExtractedSignatureColumns(database) {
  const [existingColumns] = await database.query(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${SIGNATURE_PROFILE_TABLES.map(() => '?').join(', ')})
       AND COLUMN_NAME = 'signature_image_extracted'`,
    SIGNATURE_PROFILE_TABLES
  );
  const existing = new Set(
    existingColumns.map((column) => `${column.TABLE_NAME}:${column.COLUMN_NAME}`)
  );
  const addedColumns = [];

  for (const tableName of SIGNATURE_PROFILE_TABLES) {
    if (existing.has(`${tableName}:signature_image_extracted`)) continue;
    await database.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`signature_image_extracted\` MEDIUMTEXT NULL`
    );
    addedColumns.push(tableName);
  }

  if (addedColumns.length) {
    console.log(`[DB Migration] Added extracted signature columns to: ${addedColumns.join(', ')}.`);
  }
}

module.exports = {
  ensureSecretaryDecisionColumns,
  ensureExtractedSignatureColumns,
  ensureSystemAdminTables,
};
