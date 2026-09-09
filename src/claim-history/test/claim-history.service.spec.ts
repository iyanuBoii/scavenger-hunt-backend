import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimHistoryService } from '../claim-history.service';
import { ClaimHistory } from '../entities/claim-history.entity';
import { CreateClaimDto } from '../dto/create-claim.dto';
import { ClaimStatus } from '../enums/claim-status.enum';

describe('ClaimHistoryService - recording logic', () => {
  let service: ClaimHistoryService;
  let repository: jest.Mocked<Repository<ClaimHistory>>;

  const playerId = '123e4567-e89b-12d3-a456-426614174001';

  const baseClaim: Partial<ClaimHistory> = {
    id: '123e4567-e89b-12d3-a456-426614174099',
    rewardId: '123e4567-e89b-12d3-a456-426614174000',
    rewardName: '100 Gold Coins',
    playerId,
    status: ClaimStatus.CLAIMED,
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimHistoryService,
        {
          provide: getRepositoryToken(ClaimHistory),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ClaimHistoryService>(ClaimHistoryService);
    repository = module.get(getRepositoryToken(ClaimHistory));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createClaim', () => {
    const dto: CreateClaimDto = {
      rewardId: baseClaim.rewardId!,
      rewardName: baseClaim.rewardName!,
      rewardType: 'coins',
      rewardValue: 100,
      source: 'daily_login',
    };

    it('records a claim for the given player with a claimedAt timestamp', async () => {
      const created = { ...baseClaim, ...dto } as ClaimHistory;
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(created);

      const result = await service.createClaim(dto, playerId);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...dto,
          playerId,
          claimedAt: expect.any(Date),
        }),
      );
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });
  });

  describe('bulkCreateClaims', () => {
    const dtos: CreateClaimDto[] = [
      { rewardId: 'reward-1', rewardName: 'Reward One' },
      { rewardId: 'reward-2', rewardName: 'Reward Two' },
    ];

    it('records multiple claims for the given player in one call', async () => {
      const createdEntities = dtos.map(
        (dto) => ({ ...baseClaim, ...dto }) as ClaimHistory,
      );
      repository.create
        .mockReturnValueOnce(createdEntities[0])
        .mockReturnValueOnce(createdEntities[1]);
      repository.save.mockResolvedValue(createdEntities);

      const result = await service.bulkCreateClaims(dtos, playerId);

      expect(repository.create).toHaveBeenCalledTimes(dtos.length);
      dtos.forEach((dto) => {
        expect(repository.create).toHaveBeenCalledWith(
          expect.objectContaining({ ...dto, playerId, claimedAt: expect.any(Date) }),
        );
      });
      expect(repository.save).toHaveBeenCalledWith(createdEntities);
      expect(result).toEqual(createdEntities);
    });

    it('records zero claims without error when given an empty list', async () => {
      repository.save.mockResolvedValue([]);

      const result = await service.bulkCreateClaims([], playerId);

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });
  });
});
