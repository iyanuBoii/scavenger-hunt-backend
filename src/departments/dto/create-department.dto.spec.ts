import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateDepartmentDto } from './create-department.dto';

describe('CreateDepartmentDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateDepartmentDto, {
      name: 'Engineering',
      description: 'Builds the product',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing name', async () => {
    const dto = plainToInstance(CreateDepartmentDto, { description: 'No name here' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects an empty name', async () => {
    const dto = plainToInstance(CreateDepartmentDto, { name: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a name over the length limit', async () => {
    const dto = plainToInstance(CreateDepartmentDto, { name: 'a'.repeat(101) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a description over the length limit', async () => {
    const dto = plainToInstance(CreateDepartmentDto, {
      name: 'Engineering',
      description: 'a'.repeat(501),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });
});
