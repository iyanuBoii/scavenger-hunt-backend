const REQUIRED_ENV_VARS = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USERNAME',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'JWT_SECRET',
  'PORT',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Check your .env file against .env.example.',
    );
  }

  return config;
}
