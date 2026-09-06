import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AuditService, auditContextFrom } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AuditService);
  });

  it('writes the event with its request context', () => {
    service.record({
      type: 'LOGIN_SUCCESS',
      userId: 'user-1',
      actorEmail: 'a@b.com',
      context: { ipAddress: '10.0.0.1', userAgent: 'jest' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        type: 'LOGIN_SUCCESS',
        userId: 'user-1',
        actorEmail: 'a@b.com',
        ipAddress: '10.0.0.1',
        userAgent: 'jest',
        metadata: undefined,
      },
    });
  });

  it('records an event with no account behind it', () => {
    service.record({ type: 'LOGIN_FAILURE', actorEmail: 'nobody@b.com' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null, actorEmail: 'nobody@b.com' }),
    });
  });

  it('swallows a write failure rather than rejecting into its caller', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));

    expect(() => service.record({ type: 'LOGOUT', userId: 'user-1' })).not.toThrow();
    // Let the swallowed rejection settle so it can't surface as an unhandled one.
    await Promise.resolve();
  });
});

describe('auditContextFrom', () => {
  function requestWith(ip: string | undefined, userAgent: string | undefined): Request {
    return { ip, get: () => userAgent } as unknown as Request;
  }

  it('pulls the ip and user agent off the request', () => {
    expect(auditContextFrom(requestWith('10.0.0.1', 'Firefox'))).toEqual({
      ipAddress: '10.0.0.1',
      userAgent: 'Firefox',
    });
  });

  it('nulls both when the request carries neither', () => {
    expect(auditContextFrom(requestWith(undefined, undefined))).toEqual({
      ipAddress: null,
      userAgent: null,
    });
  });

  it('truncates an unbounded user agent', () => {
    const context = auditContextFrom(requestWith('10.0.0.1', 'x'.repeat(1000)));
    expect(context.userAgent).toHaveLength(400);
  });
});
