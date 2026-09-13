import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Contribution } from './entities/contribution.entity';
import { Repository } from 'typeorm';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { QueryContributionDto } from './dto/query-contribution.dto';

export interface PaginatedContributions {
  items: Contribution[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ContributionsService {
  constructor(
    @InjectRepository(Contribution)
    private readonly repo: Repository<Contribution>,
  ) {}

  async submit(dto: CreateContributionDto): Promise<Contribution> {
    const contribution = this.repo.create({ ...dto });
    return this.repo.save(contribution);
  }

  async getPending(query: QueryContributionDto = {}): Promise<PaginatedContributions> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await this.repo.findAndCount({
      where: { status: 'pending' },
      order: { submittedAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateStatus(id: string, status: 'approved' | 'rejected') {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Contribution not found');

    item.status = status;
    return this.repo.save(item);
  }

  // Score a contribution from its description: a 10-point base award plus
  // 1 point per word, so an empty/whitespace-only description scores 0.
  calculateScore(contribution: Pick<Contribution, 'description'>): number {
    const wordCount = (contribution?.description ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    return wordCount === 0 ? 0 : 10 + wordCount;
  }
}
