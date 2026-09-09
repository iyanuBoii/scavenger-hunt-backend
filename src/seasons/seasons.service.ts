import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Season } from './entities/season.entity';
import { CreateSeasonDto } from './dto/create-season.dto';
import { UpdateSeasonDto } from './dto/update-season.dto';

@Injectable()
export class SeasonsService {
  constructor(
    @InjectRepository(Season)
    private seasonRepo: Repository<Season>,
  ) {}

  /**
   * Throws ConflictException if [startDate, endDate] overlaps any existing
   * season's range. Standard interval-overlap test: two ranges overlap iff
   * each one starts before the other ends. excludeId excludes a season from
   * the check (used when updating that same season).
   */
  private async assertNoOverlap(
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ): Promise<void> {
    const query = this.seasonRepo
      .createQueryBuilder('season')
      .where('season.startDate < :endDate', { endDate })
      .andWhere('season.endDate > :startDate', { startDate });

    if (excludeId) {
      query.andWhere('season.id != :excludeId', { excludeId });
    }

    const overlapping = await query.getOne();
    if (overlapping) {
      throw new ConflictException(
        `Season dates overlap with existing season "${overlapping.name}" (${overlapping.startDate.toISOString()} - ${overlapping.endDate.toISOString()})`,
      );
    }
  }

  async create(dto: CreateSeasonDto) {
    await this.assertNoOverlap(new Date(dto.startDate), new Date(dto.endDate));
    const season = this.seasonRepo.create(dto);
    return this.seasonRepo.save(season);
  }

  findAll() {
    return this.seasonRepo.find({ order: { startDate: 'DESC' } });
  }

  findOne(id: string) {
    return this.seasonRepo.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateSeasonDto) {
    const season = await this.seasonRepo.preload({ id, ...dto });
    if (!season) throw new NotFoundException('Season not found');

    if (dto.startDate || dto.endDate) {
      await this.assertNoOverlap(new Date(season.startDate), new Date(season.endDate), id);
    }

    return this.seasonRepo.save(season);
  }

  async remove(id: string) {
    const season = await this.findOne(id);
    if (!season) throw new NotFoundException('Season not found');
    return this.seasonRepo.remove(season);
  }

  async getCurrentSeason(): Promise<Season | null> {
    const now = new Date();
    return this.seasonRepo.findOne({
      where: {
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
      order: { startDate: 'DESC' },
    });
  }
}
