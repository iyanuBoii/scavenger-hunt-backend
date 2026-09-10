// src/puzzle-timers/puzzle-timers.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePuzzleTimerDto } from './dto/create-puzzle-timer.dto';
import { UpdatePuzzleTimerDto } from './dto/update-puzzle-timer.dto';
import { PuzzleTimer } from './entities/puzzle-timer.entity';

export function assertValidTimerRange(startTime: Date, endTime: Date): void {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new BadRequestException('startTime and endTime must be valid dates.');
  }
  if (endTime.getTime() <= startTime.getTime()) {
    throw new BadRequestException(
      'endTime must be strictly after startTime (timer duration cannot be negative or zero).',
    );
  }
}

@Injectable()
export class PuzzleTimersService {
  constructor(
    @InjectRepository(PuzzleTimer)
    private readonly timerRepository: Repository<PuzzleTimer>,
  ) {}

  async create(createPuzzleTimerDto: CreatePuzzleTimerDto): Promise<PuzzleTimer> {
    const startTime = new Date(createPuzzleTimerDto.startTime);
    const endTime = new Date(createPuzzleTimerDto.endTime);
    assertValidTimerRange(startTime, endTime);

    const timer = this.timerRepository.create({
      ...createPuzzleTimerDto,
      startTime,
      endTime,
    });
    return this.timerRepository.save(timer);
  }

  findAll(): Promise<PuzzleTimer[]> {
    return this.timerRepository.find();
  }

  async findOne(id: string): Promise<PuzzleTimer> {
    const timer = await this.timerRepository.findOneBy({ id });
    if (!timer) {
      throw new NotFoundException(`Timer with ID "${id}" not found`);
    }
    return timer;
  }

  async update(
    id: string,
    updatePuzzleTimerDto: UpdatePuzzleTimerDto,
  ): Promise<PuzzleTimer> {
    const timer = await this.timerRepository.preload({
      id,
      ...updatePuzzleTimerDto,
      // Ensure date strings are converted to Date objects if they exist
      ...(updatePuzzleTimerDto.startTime && {
        startTime: new Date(updatePuzzleTimerDto.startTime),
      }),
      ...(updatePuzzleTimerDto.endTime && {
        endTime: new Date(updatePuzzleTimerDto.endTime),
      }),
    });

    if (!timer) {
      throw new NotFoundException(`Timer with ID "${id}" not found`);
    }
    assertValidTimerRange(timer.startTime, timer.endTime);
    return this.timerRepository.save(timer);
  }

  async remove(id: string): Promise<{ id: string; message: string }> {
    const timer = await this.findOne(id);
    await this.timerRepository.remove(timer);
    return { id, message: 'Successfully deleted timer.' };
  }
}