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

module.exports = { ensureSecretaryDecisionColumns, ensureExtractedSignatureColumns };
