import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { ScoresheetsController } from './scoresheets.controller';
import { ScoresheetsService } from './scoresheets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

const user: RequestUser = { id: 'user-1', email: 'coach@example.com' };

describe('ScoresheetsController', () => {
  let controller: ScoresheetsController;
  let service: { getExtraction: jest.Mock; confirmExtraction: jest.Mock };

  beforeEach(async () => {
    service = { getExtraction: jest.fn(), confirmExtraction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoresheetsController],
      providers: [{ provide: ScoresheetsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TeamManagerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScoresheetsController>(ScoresheetsController);
  });

  function makeResponse(): { res: Response; status: jest.Mock; json: jest.Mock } {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return { res: { status } as unknown as Response, status, json };
  }

  describe('getExtraction', () => {
    it('delegates clubId, teamId, eventId and writes the result as JSON, including a null body', async () => {
      service.getExtraction.mockResolvedValue(null);
      const { res, status, json } = makeResponse();

      await controller.getExtraction('club-1', 'team-1', 'event-1', res);

      expect(service.getExtraction).toHaveBeenCalledWith('club-1', 'team-1', 'event-1');
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(null);
    });

    it('writes the extraction body when one exists', async () => {
      const extraction = { status: 'PARSED', parsedData: null, confidence: null };
      service.getExtraction.mockResolvedValue(extraction);
      const { res, json } = makeResponse();

      await controller.getExtraction('club-1', 'team-1', 'event-1', res);

      expect(json).toHaveBeenCalledWith(extraction);
    });
  });

  describe('confirmExtraction', () => {
    it('delegates clubId, teamId, eventId, the caller id, and the DTO', async () => {
      service.confirmExtraction.mockResolvedValue({ status: 'CONFIRMED' });
      const dto = { corrections: undefined, rosterMapping: [] };

      const result = await controller.confirmExtraction('club-1', 'team-1', 'event-1', dto, user);

      expect(service.confirmExtraction).toHaveBeenCalledWith(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        dto,
      );
      expect(result).toEqual({ status: 'CONFIRMED' });
    });
  });
});
