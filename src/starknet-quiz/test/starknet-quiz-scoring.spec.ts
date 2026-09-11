import { StarknetQuizService } from '../starknet-quiz.service';

describe('StarknetQuizService.scoreSubmission', () => {
  const quizzes = [
    { id: 'q1', correctAnswer: 'A' },
    { id: 'q2', correctAnswer: 'B' },
    { id: 'q3', correctAnswer: 'C' },
  ];

  it('scores a fully correct submission as 100%', () => {
    const result = StarknetQuizService.scoreSubmission(quizzes, {
      q1: 'A',
      q2: 'B',
      q3: 'C',
    });
    expect(result).toEqual({ total: 3, correct: 3, scorePercentage: 100 });
  });

  it('scores a partially correct submission proportionally', () => {
    const result = StarknetQuizService.scoreSubmission(quizzes, {
      q1: 'A',
      q2: 'wrong',
      q3: 'C',
    });
    expect(result).toEqual({ total: 3, correct: 2, scorePercentage: 67 });
  });

  it('scores a fully incorrect submission as 0%', () => {
    const result = StarknetQuizService.scoreSubmission(quizzes, {
      q1: 'x',
      q2: 'y',
      q3: 'z',
    });
    expect(result).toEqual({ total: 3, correct: 0, scorePercentage: 0 });
  });

  it('handles missing answers as incorrect', () => {
    const result = StarknetQuizService.scoreSubmission(quizzes, { q1: 'A' });
    expect(result).toEqual({ total: 3, correct: 1, scorePercentage: 33 });
  });
});
