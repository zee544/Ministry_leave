import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ensureSecretaryDecisionColumns } = require('../utils/schemaMigrations');

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
