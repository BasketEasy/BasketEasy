import { randomBytes } from 'crypto';
import { parseCidrArg, runCli } from './platform-admin';

const env = { PLATFORM_TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64') };

describe('platform-admin CLI', () => {
  let db: {
    user: { findUnique: jest.Mock };
    platformAdmin: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  const log = jest.fn();
  const run = (...argv: string[]) => runCli(db as never, argv, env, log);

  beforeEach(() => {
    log.mockReset();
    db = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      platformAdmin: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ allowedCidrs: ['203.0.113.0/24'] }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(db)),
    };
  });

  describe('parseCidrArg', () => {
    it('keeps the stored list when none is passed, and clears it on `none`', () => {
      expect(parseCidrArg(undefined)).toBeUndefined();
      expect(parseCidrArg('none')).toEqual([]);
    });

    it('accepts addresses and subnets of both families', () => {
      expect(parseCidrArg('203.0.113.0/24, 198.51.100.7,2001:db8::/32')).toEqual([
        '203.0.113.0/24',
        '198.51.100.7',
        '2001:db8::/32',
      ]);
    });

    it('refuses a malformed entry instead of silently dropping it', () => {
      expect(() => parseCidrArg('203.0.113.0/24,203.0.113/33')).toThrow('203.0.113/33');
      expect(() => parseCidrArg('not-an-ip')).toThrow('Invalid');
    });
  });

  describe('grant', () => {
    it('re-granting without an allowlist rotates the secret but keeps the allowlist', async () => {
      await run('grant', 'dpo@kluvo.net', 'DATA_OFFICER');

      const { create, update } = db.platformAdmin.upsert.mock.calls[0][0];
      expect(update).not.toHaveProperty('allowedCidrs');
      expect(update.totpSecret).toEqual(expect.any(String));
      expect(create.allowedCidrs).toEqual([]);
      expect(log).toHaveBeenCalledWith('Network allowlist: 203.0.113.0/24');
    });

    it('replaces the allowlist when one is passed', async () => {
      await run('grant', 'dpo@kluvo.net', 'DATA_OFFICER', '198.51.100.0/24');

      expect(db.platformAdmin.upsert.mock.calls[0][0].update.allowedCidrs).toEqual([
        '198.51.100.0/24',
      ]);
    });

    it('writes nothing for a malformed allowlist', async () => {
      await expect(run('grant', 'dpo@kluvo.net', 'DATA_OFFICER', '10.0.0/8')).rejects.toThrow();
      expect(db.platformAdmin.upsert).not.toHaveBeenCalled();
    });

    it('records the grant in the audit log, in the same transaction', async () => {
      await run('grant', 'dpo@kluvo.net', 'DATA_OFFICER');

      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADMIN_GRANT_CHANGED',
          userId: null,
          actorEmail: expect.stringMatching(/^cli:/),
          metadata: {
            command: 'grant',
            subjectUserId: 'user-1',
            subjectEmail: 'dpo@kluvo.net',
            role: 'DATA_OFFICER',
            allowedCidrs: ['203.0.113.0/24'],
          },
        }),
      });
    });
  });

  it.each(['revoke', 'unlock'])(
    'records a %s, and nothing when there was no grant',
    async (cmd) => {
      await run(cmd, 'dpo@kluvo.net');
      expect(db.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADMIN_GRANT_CHANGED',
          metadata: { command: cmd, subjectUserId: 'user-1', subjectEmail: 'dpo@kluvo.net' },
        }),
      });

      db.auditLog.create.mockClear();
      db.platformAdmin.updateMany.mockResolvedValue({ count: 0 });
      db.platformAdmin.deleteMany.mockResolvedValue({ count: 0 });
      await run(cmd, 'nobody@kluvo.net');
      expect(db.auditLog.create).not.toHaveBeenCalled();
      expect(log).toHaveBeenLastCalledWith('No grant for nobody@kluvo.net.');
    },
  );
});
