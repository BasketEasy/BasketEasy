import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScoresheetsService } from './scoresheets.service';
import { PrismaService } from '../prisma/prisma.service';
import { SCORESHEET_OCR_QUEUE } from '../queue/queue.module';

describe('ScoresheetsService', () => {
  let service: ScoresheetsService;
  let queue: { add: jest.Mock };
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock };
    eventScoresheet: { findUnique: jest.Mock; update: jest.Mock };
    scoresheetExtraction: { update: jest.Mock };
  };

  const matchEvent = { id: 'event-1', teamId: 'team-1', type: 'MATCH' };

  beforeEach(async () => {
    prisma = {
      clubTeam: { findUnique: jest.fn() },
      event: { findUnique: jest.fn() },
      eventScoresheet: { findUnique: jest.fn(), update: jest.fn() },
      scoresheetExtraction: { update: jest.fn() },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
    prisma.event.findUnique.mockResolvedValue(matchEvent);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoresheetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(SCORESHEET_OCR_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get<ScoresheetsService>(ScoresheetsService);
  });

  describe('enqueueOcr', () => {
    it('sets the scoresheet to QUEUED and adds a job for it', async () => {
      await service.enqueueOcr('sheet-1');

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'QUEUED' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'extract',
        { eventScoresheetId: 'sheet-1' },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    });
  });

  describe('getExtraction', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.getExtraction('club-1', 'team-1', 'event-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the event is not a MATCH', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, type: 'TRAINING' });

      await expect(service.getExtraction('club-1', 'team-1', 'event-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns null when no scoresheet has been uploaded yet', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue(null);

      await expect(service.getExtraction('club-1', 'team-1', 'event-1')).resolves.toBeNull();
    });

    it('returns the scoresheet status with a null extraction when the OCR job has not finished', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({ status: 'QUEUED', extraction: null });

      const result = await service.getExtraction('club-1', 'team-1', 'event-1');

      expect(result).toEqual({
        status: 'QUEUED',
        parsedData: null,
        confidence: null,
        failureReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
      });
    });

    it('returns the parsed data once the extraction exists', async () => {
      const parsedData = { homeScore: 60, awayScore: 55, quarterScores: [], players: [] };
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'PARSED',
        extraction: {
          parsedData,
          confidence: 0.9,
          failureReason: null,
          reviewedByUserId: null,
          reviewedAt: null,
        },
      });

      const result = await service.getExtraction('club-1', 'team-1', 'event-1');

      expect(result).toEqual({
        status: 'PARSED',
        parsedData,
        confidence: 0.9,
        failureReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
      });
    });
  });

  describe('confirmExtraction', () => {
    it('throws NotFoundException when there is no extraction to confirm', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({ id: 'sheet-1', extraction: null });

      await expect(
        service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks the extraction and scoresheet CONFIRMED, recording the reviewer', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        extraction: { id: 'extraction-1' },
      });
      prisma.scoresheetExtraction.update.mockResolvedValue({
        parsedData: { homeScore: 60, awayScore: 55, quarterScores: [], players: [] },
        confidence: null,
        failureReason: null,
        reviewedByUserId: 'user-1',
        reviewedAt: new Date('2026-09-01T12:00:00Z'),
      });

      const result = await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {});

      expect(prisma.scoresheetExtraction.update).toHaveBeenCalledWith({
        where: { id: 'extraction-1' },
        data: { reviewedByUserId: 'user-1', reviewedAt: expect.any(Date) },
      });
      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'CONFIRMED' },
      });
      expect(result.status).toBe('CONFIRMED');
      expect(result.reviewedByUserId).toBe('user-1');
    });

    it('overwrites parsedData with the supplied corrections', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        extraction: { id: 'extraction-1' },
      });
      const corrections = { homeScore: 61, awayScore: 55, quarterScores: [], players: [] };
      prisma.scoresheetExtraction.update.mockResolvedValue({
        parsedData: corrections,
        confidence: null,
        failureReason: null,
        reviewedByUserId: 'user-1',
        reviewedAt: new Date('2026-09-01T12:00:00Z'),
      });

      await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', { corrections });

      expect(prisma.scoresheetExtraction.update).toHaveBeenCalledWith({
        where: { id: 'extraction-1' },
        data: {
          parsedData: corrections,
          reviewedByUserId: 'user-1',
          reviewedAt: expect.any(Date),
        },
      });
    });
  });
});
