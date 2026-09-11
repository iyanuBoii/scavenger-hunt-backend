import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PuzzleUnlockService } from './puzzle-unlock.service';
import { Unlock, UnlockType } from './entities/unlock.entity';
import { UnlockRequirement } from './entities/unlock-requirement.entity';

describe('PuzzleUnlockService', () => {
  let service: PuzzleUnlockService;
  let unlockRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    unlockRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleUnlockService,
        { provide: getRepositoryToken(Unlock), useValue: unlockRepo },
        { provide: getRepositoryToken(UnlockRequirement), useValue: {} },
      ],
    }).compile();

    service = module.get<PuzzleUnlockService>(PuzzleUnlockService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUnlockAttempt (eligibility)', () => {
    const validate = (unlockType: UnlockType, options: any) =>
      (service as any).validateUnlockAttempt('user1', 'puzzle1', unlockType, options);

    it('allows a KEY unlock when the key matches', async () => {
      const result = await validate(UnlockType.KEY, {
        unlockKey: 'secret',
        requirement: { unlockKey: 'secret' },
      });
      expect(result).toEqual({ canUnlock: true });
    });

    it('rejects a KEY unlock when the key is wrong', async () => {
      const result = await validate(UnlockType.KEY, {
        unlockKey: 'wrong',
        requirement: { unlockKey: 'secret' },
      });
      expect(result.canUnlock).toBe(false);
      expect(result.reason).toBe('Invalid unlock key');
    });

    it('rejects a TOKEN unlock when insufficient tokens are offered', async () => {
      const result = await validate(UnlockType.TOKEN, {
        tokensToSpend: 5,
        requirement: { tokenCost: 10 },
      });
      expect(result.canUnlock).toBe(false);
      expect(result.reason).toBe('Insufficient tokens');
    });

    it('allows a TOKEN unlock when enough tokens are offered', async () => {
      const result = await validate(UnlockType.TOKEN, {
        tokensToSpend: 15,
        requirement: { tokenCost: 10 },
      });
      expect(result).toEqual({ canUnlock: true });
    });
  });
});
