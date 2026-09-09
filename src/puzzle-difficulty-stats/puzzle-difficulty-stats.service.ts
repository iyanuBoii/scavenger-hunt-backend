// src/puzzle-difficulty-stats/puzzle-difficulty-stats.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleDifficultyStat } from './entities/puzzle-difficulty-stat.entity';

const STATS_CACHE_TTL_MS = 30_000;

@Injectable()
export class PuzzleDifficultyStatsService {
  private statsCache: { data: PuzzleDifficultyStat[]; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(PuzzleDifficultyStat)
    private readonly statsRepository: Repository<PuzzleDifficultyStat>,
  ) {}

  /**
   * Increments the solve count for a given difficulty level.
   * If the level doesn't exist, it creates a new entry.
   * @param difficultyLevel The difficulty level to increment.
   * @returns The updated or newly created stat.
   */
  async incrementSolveCount(
    difficultyLevel: string,
  ): Promise<PuzzleDifficultyStat> {
    let stat = await this.statsRepository.findOneBy({ difficultyLevel });

    if (stat) {
      stat.solveCount += 1;
    } else {
      stat = this.statsRepository.create({ difficultyLevel, solveCount: 1 });
    }

    const saved = await this.statsRepository.save(stat);
    // The stats this endpoint reports have changed; invalidate the cache
    // rather than waiting out the TTL.
    this.statsCache = null;
    return saved;
  }

  /**
   * Finds all puzzle difficulty statistics, served from a short-lived
   * in-memory cache to reduce database load from frequent polling.
   * @returns An array of all stats.
   */
  async findAll(): Promise<PuzzleDifficultyStat[]> {
    if (this.statsCache && this.statsCache.expiresAt > Date.now()) {
      return this.statsCache.data;
    }

    const data = await this.statsRepository.find();
    this.statsCache = { data, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
    return data;
  }

  /**
   * Finds a puzzle difficulty stat by its level.
   * @param difficultyLevel The difficulty level to find.
   * @returns The stat for the given level.
   */
  async findByDifficulty(
    difficultyLevel: string,
  ): Promise<PuzzleDifficultyStat> {
    const stat = await this.statsRepository.findOneBy({ difficultyLevel });
    if (!stat) {
      throw new NotFoundException(
        `Stat for difficulty level "${difficultyLevel}" not found.`,
      );
    }
    return stat;
  }
}