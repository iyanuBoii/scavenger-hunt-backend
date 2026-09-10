import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBookmarkDto } from './create-bookmark.dto';
import { BookmarkType } from '../entities/bookmark.entity';

describe('CreateBookmarkDto', () => {
  const validPayload = {
    playerId: '123e4567-e89b-12d3-a456-426614174000',
    itemId: '123e4567-e89b-12d3-a456-426614174001',
    type: Object.values(BookmarkType)[0],
  };

  it('accepts a valid minimal payload', async () => {
    const dto = plainToInstance(CreateBookmarkDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing playerId', async () => {
    const { playerId, ...rest } = validPayload;
    const dto = plainToInstance(CreateBookmarkDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'playerId')).toBe(true);
  });

  it('rejects a non-UUID itemId', async () => {
    const dto = plainToInstance(CreateBookmarkDto, { ...validPayload, itemId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'itemId')).toBe(true);
  });

  it('rejects an invalid bookmark type', async () => {
    const dto = plainToInstance(CreateBookmarkDto, { ...validPayload, type: 'not-a-real-type' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects a title over the length limit', async () => {
    const dto = plainToInstance(CreateBookmarkDto, {
      ...validPayload,
      title: 'a'.repeat(256),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects a description over the length limit', async () => {
    const dto = plainToInstance(CreateBookmarkDto, {
      ...validPayload,
      description: 'a'.repeat(1001),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });
});
