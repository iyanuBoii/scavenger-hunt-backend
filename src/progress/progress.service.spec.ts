import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { Progress, ProgressStatus } from './entities/progress.entity';

describe('ProgressService', () => {
  let service: ProgressService;

  const queryBuilderMock = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getManyAndCount: jest.fn(),
    getRawMany: jest.fn(),
  };

  const repositoryMock = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve({ id: 'progress-1', ...data })),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilderMock),
  };

  const userId = 'user-1';
  const puzzleId = 'puzzle-1';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: getRepositoryToken(Progress), useValue: repositoryMock },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
  });

  describe('create', () => {
    it('creates progress when none exists yet for the user/puzzle pair', async () => {
      repositoryMock.findOne.mockResolvedValueOnce(null);

      const result = await service.create(userId, { puzzleId } as any);

      expect(result).toBeDefined();
      expect(repositoryMock.save).toHaveBeenCalled();
    });

    it('rejects creating duplicate progress for the same user/puzzle pair', async () => {
      repositoryMock.findOne.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.create(userId, { puzzleId } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('incrementAttempts', () => {
    it('increments the attempts counter by exactly 1', async () => {
      repositoryMock.findOne.mockResolvedValueOnce({
        userId,
        puzzleId,
        attempts: 3,
        status: ProgressStatus.IN_PROGRESS,
      });

      const result = await service.incrementAttempts(userId, puzzleId);

      expect(result.attempts).toBe(4);
    });

    it('throws when there is no progress to increment', async () => {
      repositoryMock.findOne.mockResolvedValueOnce(null);

      await expect(service.incrementAttempts(userId, puzzleId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('sets completedAt when status transitions into completed', async () => {
      repositoryMock.findOne.mockResolvedValueOnce({
        userId,
        puzzleId,
        status: ProgressStatus.IN_PROGRESS,
        completedAt: null,
      });

      const result = await service.update(userId, puzzleId, {
        status: ProgressStatus.COMPLETED,
      } as any);

      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('does not touch completedAt when status stays unchanged', async () => {
      repositoryMock.findOne.mockResolvedValueOnce({
        userId,
        puzzleId,
        status: ProgressStatus.IN_PROGRESS,
        completedAt: null,
      });

      const result = await service.update(userId, puzzleId, { score: 50 } as any);

      expect(result.completedAt).toBeNull();
    });

    it('does not reset completedAt when already completed and updated again', async () => {
      const existingCompletedAt = new Date('2026-01-01T00:00:00.000Z');
      repositoryMock.findOne.mockResolvedValueOnce({
        userId,
        puzzleId,
        status: ProgressStatus.COMPLETED,
        completedAt: existingCompletedAt,
      });

      const result = await service.update(userId, puzzleId, {
        status: ProgressStatus.COMPLETED,
        score: 90,
      } as any);

      expect(result.completedAt).toBe(existingCompletedAt);
    });
  });

  describe('getPlayerStats', () => {
    it('calculates completion rate as a percentage of completed puzzles', async () => {
      queryBuilderMock.getRawOne.mockResolvedValueOnce({
        totalPuzzles: '4',
        completedPuzzles: '3',
        inProgressPuzzles: '1',
        totalScore: '300',
        averageScore: '75',
        totalTimeSpent: '1200',
      });

      const stats = await service.getPlayerStats(userId);

      expect(stats.totalPuzzles).toBe(4);
      expect(stats.completedPuzzles).toBe(3);
      expect(stats.completionRate).toBe(75);
      expect(stats.averageScore).toBe(75);
    });

    it('returns a completion rate of 0 when the player has no puzzles yet', async () => {
      queryBuilderMock.getRawOne.mockResolvedValueOnce({
        totalPuzzles: '0',
        completedPuzzles: '0',
        inProgressPuzzles: '0',
        totalScore: '0',
        averageScore: '0',
        totalTimeSpent: '0',
      });

      const stats = await service.getPlayerStats(userId);

      expect(stats.completionRate).toBe(0);
    });
  });
});
