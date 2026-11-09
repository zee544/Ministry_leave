import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ensureSecretaryDecisionColumns,
  ensureExtractedSignatureColumns,
  ensureSystemAdminTables,
} = require('../utils/schemaMigrations');

describe('Secretary decision schema migration', () => {
  it('adds only missing decision-history columns to existing databases', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ COLUMN_NAME: 'secretary_decided_at' }], []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    await ensureSecretaryDecisionColumns({ query });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain("TABLE_NAME = 'leaves'");
    expect(query.mock.calls[1][0]).toBe(
      'ALTER TABLE leaves ADD COLUMN `secretary_decided_by_id` INT NULL'
    );
    expect(query.mock.calls[2][0]).toBe(
      'ALTER TABLE leaves ADD COLUMN `secretary_signature` MEDIUMTEXT NULL'
    );
  });

  it('does not alter databases where all decision columns already exist', async () => {
    const query = vi.fn().mockResolvedValueOnce([[
      { COLUMN_NAME: 'secretary_decided_at' },
      { COLUMN_NAME: 'secretary_decided_by_id' },
      { COLUMN_NAME: 'secretary_signature' },
    ], []]);

    await ensureSecretaryDecisionColumns({ query });

    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('Extracted signature schema migration', () => {
  it('adds a separate extracted-signature field without replacing source signatures', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ TABLE_NAME: 'employees', COLUMN_NAME: 'signature_image_extracted' }], []])
      .mockResolvedValue([{ affectedRows: 0 }, []]);

    await ensureExtractedSignatureColumns({ query });

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0][0]).toContain("COLUMN_NAME = 'signature_image_extracted'");
    expect(query.mock.calls.slice(1).map(([sql]) => sql)).toEqual([
      'ALTER TABLE `admins` ADD COLUMN `signature_image_extracted` MEDIUMTEXT NULL',
      'ALTER TABLE `hod` ADD COLUMN `signature_image_extracted` MEDIUMTEXT NULL',
      'ALTER TABLE `executive_officers` ADD COLUMN `signature_image_extracted` MEDIUMTEXT NULL',
      'ALTER TABLE `secretary` ADD COLUMN `signature_image_extracted` MEDIUMTEXT NULL',
    ]);
  });
});

describe('System Admin schema migration', () => {
  it('adds the phone field to the existing System Admin table without replacing accounts', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[{ COLUMN_NAME: 'username' }], []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    await ensureSystemAdminTables({ query });

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS system_admin_slots');
    expect(query.mock.calls[0][0]).toContain('CHECK (slot IN (1, 2))');
    expect(query.mock.calls[1]).toEqual([
      'INSERT IGNORE INTO system_admin_slots (slot) VALUES (1), (2)',
    ]);
    expect(query.mock.calls[2][0]).toContain('account_slot TINYINT UNSIGNED NOT NULL PRIMARY KEY');
    expect(query.mock.calls[2][0]).toContain('FOREIGN KEY (account_slot) REFERENCES system_admin_slots (slot)');
    expect(query.mock.calls[4][0]).toBe(
      'ALTER TABLE system_admins ADD COLUMN phone VARCHAR(30) NULL AFTER email'
    );
  });

  it('adds both profile columns without replacing existing account data', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    await ensureSystemAdminTables({ query });

    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[4][0]).toBe(
      'ALTER TABLE system_admins ADD COLUMN username VARCHAR(80) NULL UNIQUE AFTER name'
    );
    expect(query.mock.calls[5][0]).toBe(
      'ALTER TABLE system_admins ADD COLUMN phone VARCHAR(30) NULL AFTER email'
    );
  });

  it('does not alter databases where username and phone columns already exist', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[
        { COLUMN_NAME: 'username' },
        { COLUMN_NAME: 'phone' },
      ], []]);

    await ensureSystemAdminTables({ query });

    expect(query).toHaveBeenCalledTimes(4);
  });
});
