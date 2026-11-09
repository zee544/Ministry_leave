const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'employes_db',
  multipleStatements: true,
};

/**
 * Default / Example Approval Relationships
 * These represent the hierarchical approval chains.
 * You can customize these relationships or add rules for additional divisions anytime.
 */
const INITIAL_APPROVAL_RULES = [
  // 1. Division HOD Hierarchy Chain Example:
  //    Anandani -> Priyanka
  {
    rule_type: 'USER_HIERARCHY',
    applicant_email: 'anandani@ministry.gov.lk',
    applicant_role: 'hod',
    approver_email: 'priyanka@ministry.gov.lk',
    approver_role: 'hod',
    description: 'HOD Anandani leave approved by HOD Priyanka',
  },
  //    Priyanka -> Nissanka
  {
    rule_type: 'USER_HIERARCHY',
    applicant_email: 'priyanka@ministry.gov.lk',
    applicant_role: 'hod',
    approver_email: 'nissanka@ministry.gov.lk',
    approver_role: 'hod',
    description: 'HOD Priyanka leave approved by Nissanka',
  },
  //    Nissanka -> Secretary
  {
    rule_type: 'USER_HIERARCHY',
    applicant_email: 'nissanka@ministry.gov.lk',
    applicant_role: 'hod',
    approver_role: 'secretary',
    approver_email: null, // Any active Secretary
    description: 'Nissanka leave approved by Secretary',
  },
  // 2. Secretary Leave Approval Hierarchy:
  //    Secretary -> Senior Approver / Minister / Additional Secretary
  {
    rule_type: 'USER_HIERARCHY',
    applicant_role: 'secretary',
    approver_role: 'secretary', // Or senior_approver / minister
    approver_email: 'senior.approver@ministry.gov.lk',
    description: 'Secretary leave approved by Senior Approver / Minister',
  },
  // 3. Division Default Rules (Skipping Admin stage where applicable):
  //    Example: Fisheries division skips Admin recommendation and routes directly to HODs
  {
    rule_type: 'DIVISION_DEFAULT',
    division: 'Fisheries & Ocean Resources',
    require_admin_approval: true,
    description: 'Fisheries division leave approval settings',
  },
  {
    rule_type: 'DIVISION_DEFAULT',
    division: 'Administration',
    require_admin_approval: true,
    description: 'Administration division leave approval settings',
  },
];

async function ensureColumn(conn, tableName, columnName, definition) {
  const [columns] = await conn.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_CONFIG.database, tableName, columnName]
  );
  if (columns.length === 0) {
    await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`[OK] Added missing column ${tableName}.${columnName}`);
    return true;
  }
  return false;
}

async function findUserByEmailOrRole(conn, email, role, division = null) {
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    for (const table of ['hod', 'admins', 'secretary', 'executive_officers', 'employees']) {
      try {
        const [rows] = await conn.query(
          `SELECT id, name, email, role FROM \`${table}\` WHERE LOWER(email) = ? LIMIT 1`,
          [cleanEmail]
        );
        if (rows.length > 0) return rows[0];
      } catch (e) {
        // Table might not exist yet
      }
    }
  }

  if (role) {
    const tableMap = {
      admin: 'admins',
      hod: 'hod',
      secretary: 'secretary',
      executive_officer: 'executive_officers',
      employee: 'employees',
    };
    const table = tableMap[role];
    if (table) {
      try {
        let query = `SELECT id, name, email, role FROM \`${table}\``;
        const params = [];
        if (division) {
          query += ` WHERE LOWER(division) = LOWER(?)`;
          params.push(division);
        }
        query += ` ORDER BY id ASC LIMIT 1`;
        const [rows] = await conn.query(query, params);
        if (rows.length > 0) return rows[0];
      } catch (e) {}
    }
  }

  return null;
}

async function setupApprovalWorkflow() {
  console.log('=== Setting up Configurable Leave Approval Workflow ===');
  console.log(`Target database: ${DB_CONFIG.database} on ${DB_CONFIG.host}:${DB_CONFIG.port}\n`);

  let conn;
  try {
    conn = await mysql.createConnection(DB_CONFIG);

    // 1. Ensure support tables exist
    await conn.query(`
      CREATE TABLE IF NOT EXISTS secretary (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'secretary',
        designation VARCHAR(100) DEFAULT 'Secretary',
        employee_id VARCHAR(50),
        signature_image MEDIUMTEXT,
        signature_image_extracted MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sec_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS executive_officers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        division VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'executive_officer',
        designation VARCHAR(100) DEFAULT 'Executive Officer',
        employee_id VARCHAR(50),
        signature_image MEDIUMTEXT,
        signature_image_extracted MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_eo_division (division),
        INDEX idx_eo_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    for (const tableName of ['admins', 'hod', 'executive_officers', 'secretary', 'employees']) {
      await ensureColumn(conn, tableName, 'signature_image_extracted', 'MEDIUMTEXT NULL');
    }

    // 2. Ensure approval_rules table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS approval_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_type VARCHAR(50) NOT NULL DEFAULT 'USER_HIERARCHY',
        division VARCHAR(100) NULL,
        applicant_role VARCHAR(50) NULL,
        applicant_id INT NULL,
        applicant_email VARCHAR(150) NULL,
        applicant_name VARCHAR(100) NULL,
        approver_role VARCHAR(50) NOT NULL,
        approver_id INT NULL,
        approver_email VARCHAR(150) NULL,
        approver_name VARCHAR(100) NULL,
        stage INT DEFAULT 1,
        require_admin_approval BOOLEAN DEFAULT TRUE,
        description VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rule_applicant (applicant_role, applicant_id, applicant_email),
        INDEX idx_rule_approver (approver_role, approver_id, approver_email),
        INDEX idx_rule_division (division)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[OK] approval_rules table verified/created.');

    // 3. Ensure all workflow columns in leaves table
    const columnsToEnsure = [
      ['leaves', 'approved_by', 'VARCHAR(100) NULL'],
      ['leaves', 'approver_role', 'VARCHAR(50) NULL'],
      ['leaves', 'approved_by_id', 'INT NULL'],
      ['leaves', 'target_approver_id', 'INT NULL'],
      ['leaves', 'target_approver_role', 'VARCHAR(50) NULL'],
      ['leaves', 'target_approver_email', 'VARCHAR(150) NULL'],
      ['leaves', 'approver_signature', 'MEDIUMTEXT NULL'],
      ['leaves', 'admin_signature', 'MEDIUMTEXT NULL'],
      ['leaves', 'applicant_signature', 'MEDIUMTEXT NULL'],
      ['leaves', 'acting_officer_signature', 'MEDIUMTEXT NULL'],
      ['leaves', 'acting_officer_confirmed', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['leaves', 'decline_reason', 'TEXT NULL'],
    ];

    for (const [table, col, def] of columnsToEnsure) {
      await ensureColumn(conn, table, col, def);
    }

    // 4. Seed or Update Default Approval Rules
    console.log('\n[...] Seeding / syncing configurable approval relationships...');

    for (const rule of INITIAL_APPROVAL_RULES) {
      let applicantUser = null;
      let approverUser = null;

      if (rule.applicant_email) {
        applicantUser = await findUserByEmailOrRole(conn, rule.applicant_email, rule.applicant_role);
      }
      if (rule.approver_email) {
        approverUser = await findUserByEmailOrRole(conn, rule.approver_email, rule.approver_role);
      }

      const applicantId = applicantUser ? applicantUser.id : (rule.applicant_id || null);
      const applicantName = applicantUser ? applicantUser.name : (rule.applicant_name || null);
      const approverId = approverUser ? approverUser.id : (rule.approver_id || null);
      const approverName = approverUser ? approverUser.name : (rule.approver_name || null);

      if (rule.rule_type === 'USER_HIERARCHY') {
        // Build a precise lookup: prefer email match, then id match, never cross-match
        let existingRows = [];

        if (rule.applicant_email) {
          const cleanEmail = rule.applicant_email.trim().toLowerCase();
          const [byEmail] = await conn.query(
            `SELECT id FROM approval_rules
             WHERE rule_type = 'USER_HIERARCHY'
               AND applicant_email IS NOT NULL
               AND LOWER(applicant_email) = ?
             LIMIT 1`,
            [cleanEmail]
          );
          existingRows = byEmail;
        }

        // Only fall back to ID lookup if no email was given AND we have a resolved ID
        if (existingRows.length === 0 && !rule.applicant_email && applicantId) {
          const [byId] = await conn.query(
            `SELECT id FROM approval_rules
             WHERE rule_type = 'USER_HIERARCHY'
               AND applicant_id = ?
               AND (applicant_email IS NULL OR applicant_email = '')
             LIMIT 1`,
            [applicantId]
          );
          existingRows = byId;
        }

        if (existingRows.length === 0) {
          await conn.query(
            `INSERT INTO approval_rules
             (rule_type, division, applicant_role, applicant_id, applicant_email, applicant_name,
              approver_role, approver_id, approver_email, approver_name, stage, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              rule.rule_type,
              rule.division || null,
              rule.applicant_role || null,
              applicantId,
              rule.applicant_email || null,
              applicantName,
              rule.approver_role,
              approverId,
              rule.approver_email || null,
              approverName,
              rule.stage || 1,
              rule.description || null,
            ]
          );
          console.log(`[+] Added hierarchy rule: ${rule.description}`);
        } else {
          await conn.query(
            `UPDATE approval_rules
             SET approver_role = ?,
                 approver_id = COALESCE(?, approver_id),
                 approver_email = COALESCE(?, approver_email),
                 approver_name = COALESCE(?, approver_name),
                 applicant_id = COALESCE(?, applicant_id),
                 applicant_name = COALESCE(?, applicant_name),
                 description = COALESCE(?, description)
             WHERE id = ?`,
            [
              rule.approver_role,
              approverId,
              rule.approver_email || null,
              approverName,
              applicantId,
              applicantName,
              rule.description,
              existingRows[0].id,
            ]
          );
          console.log(`[~] Updated hierarchy rule ID ${existingRows[0].id}: ${rule.description}`);
        }
      } else if (rule.rule_type === 'DIVISION_DEFAULT') {
        const [existing] = await conn.query(
          `SELECT id FROM approval_rules
           WHERE rule_type = 'DIVISION_DEFAULT' AND division = ?
           LIMIT 1`,
          [rule.division]
        );

        if (existing.length === 0) {
          await conn.query(
            `INSERT INTO approval_rules
             (rule_type, division, approver_role, require_admin_approval, description)
             VALUES ('DIVISION_DEFAULT', ?, 'hod', ?, ?)`,
            [rule.division, rule.require_admin_approval !== false, rule.description]
          );
          console.log(`[+] Added division rule for "${rule.division}"`);
        } else {
          await conn.query(
            `UPDATE approval_rules
             SET require_admin_approval = ?, description = ?
             WHERE id = ?`,
            [rule.require_admin_approval !== false, rule.description, existing[0].id]
          );
          console.log(`[~] Updated division rule for "${rule.division}"`);
        }
      }
    }

    console.log('\n=== Current Configured Approval Rules in MySQL ===');
    const [allRules] = await conn.query(
      `SELECT id, rule_type, division, applicant_role, applicant_email, applicant_name,
              approver_role, approver_email, approver_name, require_admin_approval, description
       FROM approval_rules
       ORDER BY rule_type DESC, id ASC`
    );
    console.table(allRules);

    console.log('\n[SUCCESS] Leave approval workflow setup completed successfully.');
  } catch (error) {
    console.error('[ERROR] Approval workflow setup failed:', error);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

// Allow running directly from command line
if (require.main === module) {
  setupApprovalWorkflow();
}

module.exports = { setupApprovalWorkflow, findUserByEmailOrRole };
