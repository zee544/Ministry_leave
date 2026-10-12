const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
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
const seedData = process.argv.includes('--seed');

const DIVISIONS = [
  { name: 'Accounts', code: 'ACC' },
  { name: 'Administration', code: 'ADMIN' },
  { name: 'Agriculture', code: 'AGRI' },
  { name: 'Development', code: 'DEV' },
  { name: 'Engineering', code: 'ENG' },
  { name: 'Fisheries & Ocean Resources', code: 'FISH' },
  { name: 'Government Audit', code: 'AUDIT' },
  { name: 'Human Resources', code: 'HR' },
  { name: 'Legal', code: 'LEGAL' },
  { name: 'Planning', code: 'PLAN' },
  { name: 'Statistics', code: 'STATS' },
  { name: 'Technical', code: 'TECH' },
];

const ADMINS = [
  { name: 'Accounts Admin', email: 'admin.accounts@ministry.gov.lk', password: 'Accounts#2026!Acc', division: 'Accounts', empId: 'EMP-ADM-01' },
  { name: 'Samuel Kiprop', email: 'admin@ministry.gov.lk', password: 'Admin#2026!Adm', division: 'Administration', empId: 'EMP-2023-0001' },
  { name: 'Agriculture Admin', email: 'admin.agri@ministry.gov.lk', password: 'Agri#2026!Farm', division: 'Agriculture', empId: 'EMP-ADM-03' },
  { name: 'Development Admin', email: 'admin.dev@ministry.gov.lk', password: 'Dev#2026!Build', division: 'Development', empId: 'EMP-ADM-04' },
  { name: 'Engineering Admin', email: 'admin.eng@ministry.gov.lk', password: 'Eng#2026!Power', division: 'Engineering', empId: 'EMP-ADM-05' },
  { name: 'Fisheries Admin', email: 'admin.fisheries@ministry.gov.lk', password: 'Fish#2026!Ocean', division: 'Fisheries & Ocean Resources', empId: 'EMP-ADM-06' },
  { name: 'Government Audit Admin', email: 'admin.audit@ministry.gov.lk', password: 'Audit#2026!Check', division: 'Government Audit', empId: 'EMP-ADM-07' },
  { name: 'Human Resources Admin', email: 'admin.hr@ministry.gov.lk', password: 'HR#2026!People', division: 'Human Resources', empId: 'EMP-ADM-08' },
  { name: 'Legal Admin', email: 'admin.legal@ministry.gov.lk', password: 'Legal#2026!Law', division: 'Legal', empId: 'EMP-ADM-09' },
  { name: 'Planning Admin', email: 'admin.planning@ministry.gov.lk', password: 'Plan#2026!Future', division: 'Planning', empId: 'EMP-ADM-10' },
  { name: 'Statistics Admin', email: 'admin.stats@ministry.gov.lk', password: 'Stats#2026!Data', division: 'Statistics', empId: 'EMP-ADM-11' },
  { name: 'Technical Admin', email: 'admin.tech@ministry.gov.lk', password: 'Tech#2026!Cyber', division: 'Technical', empId: 'EMP-ADM-12' },
];

const INITIAL_EMPLOYEES = [
  { name: "David Mwangi", designation: "Accountant", division: "Accounts", email: "david.mwangi@ministry.gov.lk", appointment_date: "2020-07-22", status: "Active" },
  { name: "Patrick Ochieng", designation: "Senior Accountant", division: "Accounts", email: "patrick.ochieng@ministry.gov.lk", appointment_date: "2017-04-03", status: "Active" },
  { name: "Tom Odhiambo", designation: "Assistant Accountant", division: "Accounts", email: "tom.odhiambo@ministry.gov.lk", appointment_date: "2023-01-28", status: "Active" },
  { name: "Grace Akinyi", designation: "Administrative Officer", division: "Administration", email: "grace.akinyi@ministry.gov.lk", appointment_date: "2022-01-10", status: "Active" },
  { name: "Emily Nyambura", designation: "Head of Division", division: "Administration", email: "emily.nyambura@ministry.gov.lk", appointment_date: "2018-05-12", status: "Active" },
  { name: "Nancy Moraa", designation: "Procurement Officer", division: "Administration", email: "nancy.moraa@ministry.gov.lk", appointment_date: "2020-01-09", status: "Active" },
  { name: "Lucy Akoth", designation: "Junior Officer", division: "Administration", email: "lucy.akoth@ministry.gov.lk", appointment_date: "2023-06-07", status: "Active" },
  { name: "John Kamau", designation: "Senior Officer", division: "Agriculture", email: "john.kamau@ministry.gov.lk", appointment_date: "2020-03-15", status: "Active" },
  { name: "Agnes Kemunto", designation: "Agricultural Officer", division: "Agriculture", email: "agnes.kemunto@ministry.gov.lk", appointment_date: "2018-08-11", status: "Active" },
  { name: "Sarah Chebet", designation: "Development Officer", division: "Development", email: "sarah.chebet@ministry.gov.lk", appointment_date: "2023-02-14", status: "Active" },
  { name: "George Maina", designation: "Project Coordinator", division: "Development", email: "george.maina@ministry.gov.lk", appointment_date: "2019-02-25", status: "Active" },
  { name: "James Omondi", designation: "Engineer", division: "Engineering", email: "james.omondi@ministry.gov.lk", appointment_date: "2021-09-05", status: "Active" },
  { name: "Brian Kiplagat", designation: "Civil Engineer", division: "Engineering", email: "brian.kiplagat@ministry.gov.lk", appointment_date: "2021-12-18", status: "Active" },
  { name: "Kavindu Perera", designation: "Marine Biologist", division: "Fisheries & Ocean Resources", email: "kavindu.p@ministry.gov.lk", appointment_date: "2021-04-10", status: "Active" },
  { name: "Anura Silva", designation: "Aquaculture Specialist", division: "Fisheries & Ocean Resources", email: "anura.s@ministry.gov.lk", appointment_date: "2022-09-01", status: "Active" },
  { name: "Faith Njeri", designation: "Auditor", division: "Government Audit", email: "faith.njeri@ministry.gov.lk", appointment_date: "2020-09-14", status: "Active" },
  { name: "Michael Njoroge", designation: "Senior Auditor", division: "Government Audit", email: "michael.njoroge@ministry.gov.lk", appointment_date: "2020-02-20", status: "Active" },
  { name: "Beatrice Achieng", designation: "HR Assistant", division: "Human Resources", email: "beatrice.hr@ministry.gov.lk", appointment_date: "2023-04-17", status: "Active" },
  { name: "Kasun Fernando", designation: "Legal Officer", division: "Legal", email: "kasun.legal@ministry.gov.lk", appointment_date: "2019-08-15", status: "Active" },
  { name: "Mary Wanjiku", designation: "Research Assistant", division: "Planning", email: "mary.wanjiku@ministry.gov.lk", appointment_date: "2021-06-01", status: "Active" },
  { name: "Hannah Chelangat", designation: "Planning Officer", division: "Planning", email: "hannah.chelangat@ministry.gov.lk", appointment_date: "2023-08-14", status: "Active" },
  { name: "Diana Wambui", designation: "Data Analyst", division: "Statistics", email: "diana.wambui@ministry.gov.lk", appointment_date: "2021-11-30", status: "Active" },
  { name: "Rose Wairimu", designation: "Statistician", division: "Statistics", email: "rose.wairimu@ministry.gov.lk", appointment_date: "2021-05-16", status: "Active" },
  { name: "Peter Otieno", designation: "Technical Officer", division: "Technical", email: "peter.otieno@ministry.gov.lk", appointment_date: "2019-11-20", status: "Active" },
  { name: "Kevin Mutua", designation: "IT Specialist", division: "Technical", email: "kevin.mutua@ministry.gov.lk", appointment_date: "2022-04-22", status: "Active" },
];

const INITIAL_LEAVES = [
  { employee: "David Mwangi", division: "Accounts", type: "Casual", from: "2026-09-10", to: "2026-09-12", noOfDays: 2, actingOfficer: "Patrick Ochieng", status: "Pending", appliedBy: "David Mwangi", appliedOn: "2026-09-01", reason: "Family event", address: "Colombo" },
  { employee: "Patrick Ochieng", division: "Accounts", type: "Annual", from: "2026-08-10", to: "2026-08-15", noOfDays: 5, actingOfficer: "Tom Odhiambo", status: "Approved", appliedBy: "Patrick Ochieng", appliedOn: "2026-08-01", reason: "Annual holiday", address: "Kandy" },
  { employee: "Grace Akinyi", division: "Administration", type: "Annual", from: "2026-09-15", to: "2026-09-20", noOfDays: 5, actingOfficer: "Lucy Akoth", status: "Pending", appliedBy: "Grace Akinyi", appliedOn: "2026-09-02", reason: "Personal affairs", address: "Negombo" },
  { employee: "Nancy Moraa", division: "Administration", type: "Casual", from: "2026-09-05", to: "2026-09-07", noOfDays: 2, actingOfficer: "Lucy Akoth", status: "Admin Approved", appliedBy: "Nancy Moraa", appliedOn: "2026-08-28", reason: "Short trip", address: "Galle" },
  { employee: "John Kamau", division: "Agriculture", type: "Annual", from: "2026-09-12", to: "2026-09-18", noOfDays: 6, actingOfficer: "Agnes Kemunto", status: "Pending", appliedBy: "John Kamau", appliedOn: "2026-09-03", reason: "Field inspection travel", address: "Matara" },
  { employee: "Sarah Chebet", division: "Development", type: "Other", from: "2026-09-08", to: "2026-09-10", noOfDays: 2, actingOfficer: "George Maina", status: "Pending", appliedBy: "Sarah Chebet", appliedOn: "2026-09-01", reason: "Project workshop", address: "Jaffna" },
  { employee: "James Omondi", division: "Engineering", type: "Casual", from: "2026-09-14", to: "2026-09-16", noOfDays: 2, actingOfficer: "Brian Kiplagat", status: "Pending", appliedBy: "James Omondi", appliedOn: "2026-09-04", reason: "Site inspection rest", address: "Kurunegala" },
  { employee: "Kavindu Perera", division: "Fisheries & Ocean Resources", type: "Annual", from: "2026-09-20", to: "2026-09-25", noOfDays: 5, actingOfficer: "Anura Silva", status: "Pending", appliedBy: "Kavindu Perera", appliedOn: "2026-09-05", reason: "Coastal study leave", address: "Trincomalee" },
  { employee: "Faith Njeri", division: "Government Audit", type: "Casual", from: "2026-09-11", to: "2026-09-13", noOfDays: 2, actingOfficer: "Michael Njoroge", status: "Pending", appliedBy: "Faith Njeri", appliedOn: "2026-09-02", reason: "Personal work", address: "Colombo" },
  { employee: "Kasun Fernando", division: "Legal", type: "Annual", from: "2026-09-18", to: "2026-09-22", noOfDays: 4, actingOfficer: "Kasun Fernando", status: "Pending", appliedBy: "Kasun Fernando", appliedOn: "2026-09-04", reason: "Court recess leave", address: "Batticaloa" },
  { employee: "Mary Wanjiku", division: "Planning", type: "Annual", from: "2026-09-16", to: "2026-09-20", noOfDays: 4, actingOfficer: "Hannah Chelangat", status: "Pending", appliedBy: "Mary Wanjiku", appliedOn: "2026-09-03", reason: "Annual vacation", address: "Kandy" },
  { employee: "Diana Wambui", division: "Statistics", type: "Half-day", from: "2026-09-09", to: "2026-09-10", noOfDays: 0.5, actingOfficer: "Rose Wairimu", status: "Pending", appliedBy: "Diana Wambui", appliedOn: "2026-09-05", reason: "Medical appointment", address: "Gampaha" },
  { employee: "Peter Otieno", division: "Technical", type: "Casual", from: "2026-09-15", to: "2026-09-17", noOfDays: 2, actingOfficer: "Kevin Mutua", status: "Pending", appliedBy: "Peter Otieno", appliedOn: "2026-09-02", reason: "Personal affairs", address: "Colombo" },
];

async function setupDatabase() {
  console.log('--- Setting up Ministry Leave System MySQL Database ---');
  console.log(`Target Database: ${DB_CONFIG.database} on ${DB_CONFIG.host}`);

  let conn;
  try {
    // 1. Connect to MySQL server (without database first, to ensure DB exists)
    const rootConn = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
    });
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConn.end();

    // 2. Connect directly to the configured database
    conn = await mysql.createConnection(DB_CONFIG);
    console.log(`[OK] Connected to "${DB_CONFIG.database}".`);

    // 3. Create Tables
    console.log('[...] Creating and updating database tables...');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS divisions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        code VARCHAR(20) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        division VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        designation VARCHAR(100) DEFAULT 'System Administrator',
        employee_id VARCHAR(50),
        signature_image MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin_division (division),
        INDEX idx_admin_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS hod (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        division VARCHAR(100) NOT NULL,
        role VARCHAR(50) DEFAULT 'hod',
        designation VARCHAR(100) DEFAULT 'Head of Division',
        employee_id VARCHAR(50),
        signature_image MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_hod_division (division)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL DEFAULT '',
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        designation VARCHAR(100) NOT NULL,
        division VARCHAR(100) NOT NULL,
        appointment_date DATE NOT NULL,
        status ENUM('Active', 'Inactive', 'On Leave') DEFAULT 'Active',
        signature_image MEDIUMTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_emp_division (division),
        INDEX idx_emp_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS leaves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee VARCHAR(100) NOT NULL,
        division VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        no_of_days DECIMAL(4, 1) NOT NULL,
        acting_officer VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending',
        applied_by VARCHAR(100) NOT NULL,
        applied_on DATE NOT NULL,
        reason TEXT,
        address TEXT,
        recommended_by_admin BOOLEAN DEFAULT FALSE,
        declined_by VARCHAR(50) DEFAULT NULL,
        decline_reason TEXT,
        acting_officer_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_leave_division (division),
        INDEX idx_leave_status (status),
        INDEX idx_leave_applied_on (applied_on)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        recipient VARCHAR(100) NOT NULL,
        division VARCHAR(100),
        link VARCHAR(255),
        read_status BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notification_recipient_created (recipient, created_at),
        INDEX idx_notification_division_created (division, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(150) NOT NULL,
        role VARCHAR(20) NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_password_resets_email_role_used (email, role, used)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const ensureColumn = async (tableName, columnName, definition) => {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [DB_CONFIG.database, tableName, columnName]
      );
      if (columns.length === 0) {
        await conn.query(
          `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
        );
        console.log(`[OK] Added missing column ${tableName}.${columnName}.`);
      }
    };

    for (const [tableName, columnName, definition] of [
      ['admins', 'signature_image', 'MEDIUMTEXT NULL'],
      ['hod', 'signature_image', 'MEDIUMTEXT NULL'],
      ['employees', 'password', "VARCHAR(255) NOT NULL DEFAULT ''"],
      ['employees', 'must_change_password', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['employees', 'signature_image', 'MEDIUMTEXT NULL'],
      ['leaves', 'decline_reason', 'TEXT NULL'],
      ['leaves', 'acting_officer_confirmed', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ]) {
      await ensureColumn(tableName, columnName, definition);
    }
    console.log('[OK] Tables created or verified.');

    // 4. Seed Divisions
    console.log('[...] Seeding 12 Divisions...');
    for (const div of DIVISIONS) {
      await conn.query(
        'INSERT INTO divisions (name, code) VALUES (?, ?) ON DUPLICATE KEY UPDATE code = VALUES(code)',
        [div.name, div.code]
      );
    }
    console.log('[OK] 12 Divisions seeded successfully.');

    if (seedData) {
      // 5. Seed Admins with unique individual bcrypt password hashes
      console.log('[...] Seeding 12 Division Admin Accounts with unique passwords...');
      for (const adm of ADMINS) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adm.password, salt);

        await conn.query(
          `INSERT INTO admins (name, email, password, division, role, designation, employee_id)
           VALUES (?, ?, ?, ?, 'admin', 'System Administrator', ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [adm.name, adm.email, hashedPassword, adm.division, adm.empId]
        );
      }
      console.log('[OK] 12 Division Admins configured in MySQL database with separate unique passwords.');

      // 6. Seed Sample Employees with hashed passwords
      console.log('[...] Seeding Sample Employees with passwords...');
      for (const emp of INITIAL_EMPLOYEES) {
        const empPassword = emp.email.startsWith('nancy.moraa') ? 'Nancy@123' : 'Ministry@123';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(empPassword, salt);

        await conn.query(
          `INSERT INTO employees (name, designation, division, email, password, appointment_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [emp.name, emp.designation, emp.division, emp.email, hashedPassword, emp.appointment_date, emp.status]
        );
      }
      console.log('[OK] Sample employees configured with passwords.');

      // 7. Seed Sample Leaves
      console.log('[...] Seeding Sample Leave Requests...');
      const [existingLeaves] = await conn.query('SELECT COUNT(*) as count FROM leaves');
      if (existingLeaves[0].count === 0) {
        for (const l of INITIAL_LEAVES) {
          await conn.query(
            `INSERT INTO leaves (employee, division, type, from_date, to_date, no_of_days, acting_officer, status, applied_by, applied_on, reason, address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [l.employee, l.division, l.type, l.from, l.to, l.noOfDays, l.actingOfficer, l.status, l.appliedBy, l.appliedOn, l.reason, l.address]
          );
        }
        console.log('[OK] Sample leave requests seeded.');
      } else {
        console.log(`[INFO] Leaves table already contains ${existingLeaves[0].count} records, skipping seed.`);
      }
    } else {
      console.log('[INFO] Demo users and leave records were not seeded. Pass --seed to add missing demo records.');
    }

    console.log('\n=== Database Setup Complete Successfully! ===');
    console.log('Admins currently in MySQL:');
    const [allAdmins] = await conn.query('SELECT id, name, email, division, role FROM admins ORDER BY id ASC');
    console.table(allAdmins);
  } catch (error) {
    console.error('[ERROR] Database setup failed:', error);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

setupDatabase();
