import { validateEnv } from '../env.validation';

describe('validateEnv', () => {
  const validConfig = {
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '5432',
    DATABASE_USERNAME: 'postgres',
    DATABASE_PASSWORD: 'password',
    DATABASE_NAME: 'scavenger_hunt_dev',
    JWT_SECRET: 'secret',
    PORT: '5000',
  };

  it('returns the config unchanged when all required variables are present', () => {
    expect(validateEnv({ ...validConfig })).toEqual(validConfig);
  });

  it('throws a descriptive error when a required variable is missing', () => {
    const { JWT_SECRET, ...rest } = validConfig;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('throws a descriptive error when a required variable is empty', () => {
    expect(() => validateEnv({ ...validConfig, PORT: '' })).toThrow(/PORT/);
  });

  it('lists all missing variables in a single error', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_HOST.*JWT_SECRET|JWT_SECRET.*DATABASE_HOST/s);
  });
});
