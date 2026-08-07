import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule, PrismaHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        PrismaHealthIndicator,
        {
          provide: PrismaService,
          useValue: {
            $runCommandRaw: jest.fn().mockRejectedValue(new Error('Use the mongodb provider')),
            $queryRawUnsafe: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('reports ok on GET /api/health', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
  });

  it('reports ok on GET /api/health/ping', () => {
    const result = controller.ping();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('basketeasy-api');
  });
});
