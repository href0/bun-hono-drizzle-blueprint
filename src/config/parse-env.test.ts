import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { assertEnvironmentLoaded, isTestEnvironment, parseEnv } from './parse-env';

describe('parseEnv (Unit)', () => {
  const schema = z.object({
    MODE: z.enum(['alpha', 'beta']),
    LIMIT: z.coerce.number().int().positive(),
    SECRET_KEY: z.string(),
  });

  it('should return parsed and coerced values when the source is valid', () => {
    expect(parseEnv('sample', schema, { MODE: 'alpha', LIMIT: '5', SECRET_KEY: 'k' })).toEqual({
      MODE: 'alpha',
      LIMIT: 5,
      SECRET_KEY: 'k',
    });
  });

  it('should list every invalid variable at once without echoing any value', () => {
    const run = (): unknown =>
      parseEnv('sample', schema, { MODE: 'super-secret-mode', LIMIT: '-1' });

    expect(run).toThrow('Invalid environment configuration (sample):');
    expect(run).toThrow('MODE: must be one of: alpha | beta');
    expect(run).toThrow('LIMIT: Number must be greater than 0');
    expect(run).toThrow('SECRET_KEY: is required');

    try {
      run();
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-mode');
    }
  });

  it('should describe a wrong type and a root-level issue', () => {
    const typed = z.object({ FLAG: z.boolean() });
    expect(() => parseEnv('typed', typed, { FLAG: 'yes' })).toThrow('FLAG: must be a boolean');

    const refined = z
      .object({ A: z.string().optional() })
      .refine((value) => value.A !== undefined, 'A is mandatory');
    expect(() => parseEnv('refined', refined, {})).toThrow('(root): A is mandatory');
  });
});

describe('assertEnvironmentLoaded (Unit)', () => {
  it('should pass in test mode, with a .env file, or with injected variables', () => {
    expect(() => {
      assertEnvironmentLoaded({ NODE_ENV: 'test' }, false);
    }).not.toThrow();
    expect(() => {
      assertEnvironmentLoaded({}, true);
    }).not.toThrow();
    expect(() => {
      assertEnvironmentLoaded({ DATABASE_URL: 'postgresql://h/db' }, false);
    }).not.toThrow();
  });

  it('should fail fast with setup instructions when no configuration is present', () => {
    expect(() => {
      assertEnvironmentLoaded({ NODE_ENV: 'production' }, false);
    }).toThrow('cp .env.example .env');
  });

  it('isTestEnvironment should only be true for NODE_ENV=test', () => {
    expect(isTestEnvironment({ NODE_ENV: 'test' })).toBe(true);
    expect(isTestEnvironment({ NODE_ENV: 'development' })).toBe(false);
  });
});
