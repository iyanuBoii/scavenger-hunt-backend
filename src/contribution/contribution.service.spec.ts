import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContributionsService } from './contribution.service';
import { Contribution } from './entities/contribution.entity';

describe('ContributionsService', () => {
  let service: ContributionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        {
          provide: getRepositoryToken(Contribution),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateScore', () => {
    it('calculates a score from the word count of the description', () => {
      const score = service.calculateScore({
        description: 'Fixed a critical bug in the payment flow',
      });
      expect(score).toBe(10 + 8);
    });

    it('returns 0 for an empty or whitespace-only contribution', () => {
      expect(service.calculateScore({ description: '' })).toBe(0);
      expect(service.calculateScore({ description: '   ' })).toBe(0);
    });
  });
});
