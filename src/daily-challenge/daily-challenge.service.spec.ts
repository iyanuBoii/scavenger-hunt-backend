import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DailyChallengeService } from './daily-challenge.service';
import { DailyChallenge } from './daily-challenge.entity';

describe('DailyChallengeService', () => {
  let service: DailyChallengeService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 'saved', ...data })),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyChallengeService,
        { provide: getRepositoryToken(DailyChallenge), useValue: repo },
      ],
    }).compile();

    service = module.get<DailyChallengeService>(DailyChallengeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTodayChallenge (rotation/selection)', () => {
    it('returns the existing challenge for today without rotating', async () => {
      const existing = { id: 'today', challengeId: 'challenge2' };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.getTodayChallenge();

      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rotates and persists a new challenge when none exists for today', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.getTodayChallenge();

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(['challenge1', 'challenge2', 'challenge3']).toContain(
        result.challengeId,
      );
      expect(result.date).toBeInstanceOf(Date);
    });
  });
});
