// src/starknet-quiz/starknet-quiz.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStarknetQuizDto } from './dto/create-starknet-quiz.dto';
import { UpdateStarknetQuizDto } from './dto/update-starknet-quiz.dto';
import { StarknetQuiz } from './entities/starknet-quiz.entity';

@Injectable()
export class StarknetQuizService {
  constructor(
    @InjectRepository(StarknetQuiz)
    private readonly quizRepository: Repository<StarknetQuiz>,
  ) {}

  create(createQuizDto: CreateStarknetQuizDto): Promise<StarknetQuiz> {
    const quiz = this.quizRepository.create(createQuizDto);
    return this.quizRepository.save(quiz);
  }

  findAll(): Promise<StarknetQuiz[]> {
    return this.quizRepository.find();
    // NOTE: For a player-facing endpoint, you would strip the 'correctAnswer' field
    // before returning the data. For admin CRUD, returning the full entity is acceptable.
  }

  async findOne(id: string): Promise<StarknetQuiz> {
    const quiz = await this.quizRepository.findOneBy({ id });
    if (!quiz) {
      throw new NotFoundException(`Quiz with ID "${id}" not found`);
    }
    return quiz;
  }

  async update(
    id: string,
    updateQuizDto: UpdateStarknetQuizDto,
  ): Promise<StarknetQuiz> {
    const quiz = await this.quizRepository.preload({
      id,
      ...updateQuizDto,
    });
    if (!quiz) {
      throw new NotFoundException(`Quiz with ID "${id}" not found`);
    }
    return this.quizRepository.save(quiz);
  }

  async remove(id: string): Promise<{ id: string; message: string }> {
    const quiz = await this.findOne(id);
    await this.quizRepository.remove(quiz);
    return { id, message: 'Successfully deleted quiz question.' };
  }

  /**
   * Scores a set of submitted answers against the quiz bank.
   * Pure function: no DB access, so it is unit-testable in isolation.
   */
  static scoreSubmission(
    quizzes: Pick<StarknetQuiz, 'id' | 'correctAnswer'>[],
    submittedAnswers: Record<string, string>,
  ): { total: number; correct: number; scorePercentage: number } {
    const total = quizzes.length;
    const correct = quizzes.filter(
      (quiz) => submittedAnswers[quiz.id] === quiz.correctAnswer,
    ).length;
    const scorePercentage = total === 0 ? 0 : Math.round((correct / total) * 100);
    return { total, correct, scorePercentage };
  }
}