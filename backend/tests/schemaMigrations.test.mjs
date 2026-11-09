import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ensureSecretaryDecisionColumns,
  ensureExtractedSignatureColumns,
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
