import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReviewDto } from '../create-review.dto';

describe('CreateReviewDto', () => {
  const validPayload = {
    challengeId: '123e4567-e89b-12d3-a456-426614174000',
    stars: 4,
    comment: 'Great puzzle! Really challenging but fair.',
  };

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateReviewDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a rating above the allowed range', async () => {
    const dto = plainToInstance(CreateReviewDto, { ...validPayload, stars: 6 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'stars')).toBe(true);
  });

  it('rejects a rating below the allowed range', async () => {
    const dto = plainToInstance(CreateReviewDto, { ...validPayload, stars: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'stars')).toBe(true);
  });

  it('rejects an overlong comment', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      ...validPayload,
      comment: 'a'.repeat(1001),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejects a missing/invalid challengeId', async () => {
    const dto = plainToInstance(CreateReviewDto, { ...validPayload, challengeId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'challengeId')).toBe(true);
  });
});
