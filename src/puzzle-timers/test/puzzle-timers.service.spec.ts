import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PuzzleTimersService } from '../puzzle-timers.service';
import { PuzzleTimer } from '../entities/puzzle-timer.entity';

describe('PuzzleTimersService', () => {
  let service: PuzzleTimersService;

  const repositoryMock = {
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'timer-1', ...data })),
    preload: jest.fn((data) => Promise.resolve(data)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleTimersService,
        { provide: getRepositoryToken(PuzzleTimer), useValue: repositoryMock },
      ],
    }).compile();

    service = module.get<PuzzleTimersService>(PuzzleTimersService);
  });

  describe('create', () => {
    const challengeId = '123e4567-e89b-12d3-a456-426614174000';

    it('creates a timer when endTime is after startTime', async () => {
      await expect(
        service.create({
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:05:00.000Z',
          challengeId,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a negative duration (endTime before startTime)', async () => {
      await expect(
        service.create({
          startTime: '2026-01-01T00:05:00.000Z',
          endTime: '2026-01-01T00:00:00.000Z',
          challengeId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a zero duration (endTime equal to startTime)', async () => {
      await expect(
        service.create({
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T00:00:00.000Z',
          challengeId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid date value', async () => {
      await expect(
        service.create({
          startTime: 'not-a-date',
          endTime: '2026-01-01T00:00:00.000Z',
          challengeId,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('rejects an update that would make endTime precede startTime', async () => {
      repositoryMock.preload.mockResolvedValueOnce({
        id: 'timer-1',
        startTime: new Date('2026-01-01T00:05:00.000Z'),
        endTime: new Date('2026-01-01T00:00:00.000Z'),
      });

      await expect(
        service.update('timer-1', { endTime: '2026-01-01T00:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
