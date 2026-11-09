const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ensureSystemAdminTables } = require('../utils/schemaMigrations');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_SPECIAL_PATTERN = /[!@#$%^&*(),.?":{}|<>]/;

function ask(question) {
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    prompt.question(question, (answer) => {
      prompt.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Run this command from an interactive terminal to enter passwords securely.'));
      return;
    }

    let value = '';
    const finish = (error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Password entry cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ') value += character;
      }
    };

    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

function validateAccount(account, index) {
  if (!account.name || account.name.length > 100) {
    throw new Error(`Account ${index}: name is required and must be at most 100 characters.`);
  }
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(account.username)) {
    throw new Error(`Account ${index}: username must be 3-80 characters using letters, numbers, dots, underscores, or hyphens.`);
  }
  if (!EMAIL_PATTERN.test(account.email) || account.email.length > 150) {
    throw new Error(`Account ${index}: enter a valid email address (maximum 150 characters).`);
  }
  const password = account.password;
  if (
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !PASSWORD_SPECIAL_PATTERN.test(password)
  ) {
    throw new Error(`Account ${index}: password must have at least 12 characters, including uppercase, lowercase, a number, and a special character.`);
  }
}

async function collectAccounts() {
  const accounts = [];
  for (let index = 1; index <= 2; index++) {
    console.log(`\nSystem Admin account ${index} of 2`);
    const name = await ask('Name: ');
    const username = (await ask('Username: ')).toLowerCase();
    const email = (await ask('Email: ')).toLowerCase();
    accounts.push({ name, username, email });
  }

  for (let index = 0; index < accounts.length; index++) {
    const first = await askHidden(`Password for ${accounts[index].email}: `);
    const confirmation = await askHidden('Confirm password: ');
    if (first !== confirmation) {
      throw new Error(`Account ${index + 1}: passwords do not match.`);
    }
    accounts[index].password = first;
    validateAccount(accounts[index], index + 1);
  }

  if (
    accounts[0].email === accounts[1].email ||
    accounts[0].username === accounts[1].username
  ) {
    throw new Error('The two System Admin accounts must use different usernames and email addresses.');
  }
  return accounts;
}

async function provisionAccounts(accounts) {
  const identifiers = accounts.flatMap(({ username, email }) => [email, username]);
  const [existingAccounts] = await pool.query(
    `SELECT email FROM admins WHERE LOWER(email) IN (?, ?, ?, ?)
     UNION ALL SELECT email FROM hod WHERE LOWER(email) IN (?, ?, ?, ?)
     UNION ALL SELECT email FROM secretary WHERE LOWER(email) IN (?, ?, ?, ?)
     UNION ALL SELECT email FROM executive_officers WHERE LOWER(email) IN (?, ?, ?, ?)
     UNION ALL SELECT email FROM employees WHERE LOWER(email) IN (?, ?, ?, ?)
     UNION ALL SELECT email FROM system_admins
       WHERE LOWER(email) IN (?, ?, ?, ?) OR LOWER(username) IN (?, ?, ?, ?)`,
    [
      ...Array.from({ length: 5 }, () => identifiers).flat(),
      ...identifiers,
      ...identifiers,
    ]
  );
  if (existingAccounts.length) {
    throw new Error('A supplied username or email address is already assigned to another Ministry account.');
  }

  const passwordHashes = await Promise.all(
    accounts.map(({ password }) => bcrypt.hash(password, 12))
  );

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [slots] = await connection.query(
      'SELECT slot FROM system_admin_slots ORDER BY slot FOR UPDATE'
    );
    if (slots.length !== 2 || Number(slots[0].slot) !== 1 || Number(slots[1].slot) !== 2) {
      throw new Error('System Admin account slots are not configured correctly.');
    }

    const [[countRow]] = await connection.query(
      'SELECT COUNT(*) AS accountCount FROM system_admins'
    );
    if (Number(countRow.accountCount) !== 0) {
      throw new Error('System Admin accounts have already been provisioned; refusing to replace or add accounts.');
    }

    for (let index = 0; index < accounts.length; index++) {
      await connection.query(
        `INSERT INTO system_admins (account_slot, name, username, email, password)
         VALUES (?, ?, ?, ?, ?)`,
        [
          slots[index].slot,
          accounts[index].name,
          accounts[index].username,
          accounts[index].email,
          passwordHashes[index],
        ]
      );
    }
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`[System Admin Provisioning] Rollback failed (${rollbackError.code || 'UNKNOWN'}).`);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    await ensureSystemAdminTables(pool);
    const accounts = await collectAccounts();
    await provisionAccounts(accounts);
    console.log('\nExactly two System Admin accounts were created successfully.');
  } catch (error) {
    console.error(`[System Admin Provisioning] ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
