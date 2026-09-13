import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
  } from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
  import { Repository, Between } from 'typeorm';
  import { ClaimHistory } from './entities/claim-history.entity';
  import { CreateClaimDto } from './dto/create-claim.dto';
  import { QueryClaimDto } from './dto/query-claim.dto';
  import { ClaimSummaryDto } from './dto/claim-summary.dto';
  import { ClaimStatus } from './enums/claim-status.enum';
  
  export interface PaginatedClaims {
    claims: ClaimHistory[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }
  
  @Injectable()
  export class ClaimHistoryService {
    constructor(
      @InjectRepository(ClaimHistory)
      private claimRepository: Repository<ClaimHistory>,
    ) {}
  
    async createClaim(createClaimDto: CreateClaimDto, playerId: string): Promise<ClaimHistory> {
      const claim = this.claimRepository.create({
        ...createClaimDto,
        playerId,
        claimedAt: new Date(),
      });
  
      return this.claimRepository.save(claim);
    }
  
    async bulkCreateClaims(claims: CreateClaimDto[], playerId: string): Promise<ClaimHistory[]> {
      const claimEntities = claims.map(claim => 
        this.claimRepository.create({
          ...claim,
          playerId,
          claimedAt: new Date(),
        })
      );
  
      return this.claimRepository.save(claimEntities);
    }
  
    async findAll(queryDto: QueryClaimDto): Promise<PaginatedClaims> {
      const {
        playerId,
        rewardId,
        rewardType,
        status,
        source,
        fromDate,
        toDate,
        page = 1,
        limit = 10,
        sort = 'newest',
      } = queryDto;
  
      const queryBuilder = this.claimRepository.createQueryBuilder('claim');
  
      // Apply filters
      if (playerId) {
        queryBuilder.andWhere('claim.playerId = :playerId', { playerId });
      }
  
      if (rewardId) {
        queryBuilder.andWhere('claim.rewardId = :rewardId', { rewardId });
      }
  
      if (rewardType) {
        queryBuilder.andWhere('claim.rewardType = :rewardType', { rewardType });
      }
  
      if (status) {
        queryBuilder.andWhere('claim.status = :status', { status });
      }
  
      if (source) {
        queryBuilder.andWhere('claim.source = :source', { source });
      }
  
      if (fromDate) {
        queryBuilder.andWhere('claim.claimedAt >= :fromDate', { fromDate });
      }
  
      if (toDate) {
        queryBuilder.andWhere('claim.claimedAt <= :toDate', { toDate });
      }
  
      // Apply sorting
      switch (sort) {
        case 'newest':
          queryBuilder.orderBy('claim.claimedAt', 'DESC');
          break;
        case 'oldest':
          queryBuilder.orderBy('claim.claimedAt', 'ASC');
          break;
        case 'value_desc':
          queryBuilder.orderBy('claim.rewardValue', 'DESC');
          break;
        case 'value_asc':
          queryBuilder.orderBy('claim.rewardValue', 'ASC');
          break;
      }
  
      // Defensive re-validation in case findAll() is invoked directly with an unvalidated query object
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));

      // Apply pagination
      const skip = (safePage - 1) * safeLimit;
      queryBuilder.skip(skip).take(safeLimit);

      const [claims, total] = await queryBuilder.getManyAndCount();

      return {
        claims,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      };
    }
  
    async findOne(id: string): Promise<ClaimHistory> {
      const claim = await this.claimRepository.findOne({ where: { id } });
      
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }
  
      return claim;
    }
  
    async findPlayerClaims(playerId: string, queryDto: Partial<QueryClaimDto> = {}): Promise<PaginatedClaims> {
      return this.findAll({ ...queryDto, playerId });
    }
  
    async findRewardClaims(rewardId: string, queryDto: Partial<QueryClaimDto> = {}): Promise<PaginatedClaims> {
      return this.findAll({ ...queryDto, rewardId });
    }
  
    async hasPlayerClaimedReward(playerId: string, rewardId: string): Promise<boolean> {
      const claim = await this.claimRepository.findOne({
        where: {
          playerId,
          rewardId,
          status: ClaimStatus.CLAIMED,
        },
      });
  
      return !!claim;
    }
  
    async updateClaimStatus(id: string, status: ClaimStatus, notes?: string): Promise<ClaimHistory> {
      const claim = await this.findOne(id);
  
      claim.status = status;
      if (notes) {
        claim.notes = notes;
      }
  
      return this.claimRepository.save(claim);
    }
  
    async getPlayerSummary(playerId: string): Promise<ClaimSummaryDto> {
      const claims = await this.claimRepository.find({ where: { playerId } });
  
      const summary = new ClaimSummaryDto();
      summary.totalClaims = claims.length;
      summary.totalValue = claims.reduce((sum, claim) => sum + (claim.rewardValue || 0), 0);
  
      // Group by status
      summary.claimsByStatus = {};
      Object.values(ClaimStatus).forEach(status => {
        summary.claimsByStatus[status] = claims.filter(c => c.status === status).length;
      });
  
      // Group by type
      summary.claimsByType = {};
      claims.forEach(claim => {
        const type = claim.rewardType || 'unknown';
        summary.claimsByType[type] = (summary.claimsByType[type] || 0) + 1;
      });
  
      // Group by source
      summary.claimsBySource = {};
      claims.forEach(claim => {
        const source = claim.source || 'unknown';
        summary.claimsBySource[source] = (summary.claimsBySource[source] || 0) + 1;
      });
  
      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentClaims = claims.filter(claim => claim.claimedAt >= sevenDaysAgo);
      summary.recentActivity = {};
      
      recentClaims.forEach(claim => {
        const date = claim.claimedAt.toISOString().split('T')[0];
        summary.recentActivity[date] = (summary.recentActivity[date] || 0) + 1;
      });
  
      return summary;
    }
  
    async getGlobalSummary(): Promise<ClaimSummaryDto> {
      const claims = await this.claimRepository.find();
  
      const summary = new ClaimSummaryDto();
      summary.totalClaims = claims.length;
      summary.totalValue = claims.reduce((sum, claim) => sum + (claim.rewardValue || 0), 0);
  
      // Group by status
      summary.claimsByStatus = {};
      Object.values(ClaimStatus).forEach(status => {
        summary.claimsByStatus[status] = claims.filter(c => c.status === status).length;
      });
  
      // Group by type
      summary.claimsByType = {};
      claims.forEach(claim => {
        const type = claim.rewardType || 'unknown';
        summary.claimsByType[type] = (summary.claimsByType[type] || 0) + 1;
      });
  
      // Group by source
      summary.claimsBySource = {};
      claims.forEach(claim => {
        const source = claim.source || 'unknown';
        summary.claimsBySource[source] = (summary.claimsBySource[source] || 0) + 1;
      });
  
      // Recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentClaims = claims.filter(claim => claim.claimedAt >= thirtyDaysAgo);
      summary.recentActivity = {};
      
      recentClaims.forEach(claim => {
        const date = claim.claimedAt.toISOString().split('T')[0];
        summary.recentActivity[date] = (summary.recentActivity[date] || 0) + 1;
      });
  
      return summary;
    }
  
    async deleteClaim(id: string): Promise<void> {
      const claim = await this.findOne(id);
      await this.claimRepository.remove(claim);
    }
  
    async getTopRewards(limit: number = 10): Promise<any[]> {
      const result = await this.claimRepository
        .createQueryBuilder('claim')
        .select(['claim.rewardId', 'claim.rewardName', 'COUNT(*) as claimCount'])
        .where('claim.status = :status', { status: ClaimStatus.CLAIMED })
        .groupBy('claim.rewardId, claim.rewardName')
        .orderBy('claimCount', 'DESC')
        .limit(limit)
        .getRawMany();
  
      return result;
    }
  
    async getTopPlayers(limit: number = 10): Promise<any[]> {
      const result = await this.claimRepository
        .createQueryBuilder('claim')
        .select(['claim.playerId', 'COUNT(*) as claimCount', 'SUM(claim.rewardValue) as totalValue'])
        .where('claim.status = :status', { status: ClaimStatus.CLAIMED })
        .groupBy('claim.playerId')
        .orderBy('claimCount', 'DESC')
        .limit(limit)
        .getRawMany();
  
      return result;
    }
  }