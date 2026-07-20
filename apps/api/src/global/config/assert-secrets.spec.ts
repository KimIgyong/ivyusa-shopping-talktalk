import { ConfigService } from '@nestjs/config';
import { collectSecretProblems } from './assert-secrets';

function cfg(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

const STRONG_A = 'a'.repeat(40);
const STRONG_B = 'b'.repeat(40);

describe('collectSecretProblems (SEC-M5)', () => {
  const good = {
    JWT_ACCESS_SECRET: STRONG_A,
    JWT_REFRESH_SECRET: STRONG_B,
    CRED_ENC_KEY: 'c'.repeat(40),
    DB_SYNCHRONIZE: 'false',
  };

  it('passes with strong, distinct secrets in production', () => {
    expect(collectSecretProblems(cfg(good), true)).toEqual([]);
  });

  it('flags a missing secret', () => {
    const problems = collectSecretProblems(cfg({ ...good, CRED_ENC_KEY: undefined }), true);
    expect(problems).toContain('CRED_ENC_KEY is not set');
  });

  it('flags a short secret', () => {
    const problems = collectSecretProblems(cfg({ ...good, JWT_ACCESS_SECRET: 'short' }), true);
    expect(problems.some((p) => p.includes('too short'))).toBe(true);
  });

  it('flags dev placeholders only in production', () => {
    const withPlaceholder = { ...good, JWT_ACCESS_SECRET: 'dev_access_secret_change_me_padding_padding' };
    expect(collectSecretProblems(cfg(withPlaceholder), true).some((p) => p.includes('placeholder'))).toBe(true);
    // Same value outside production is length-checked but placeholder-allowed.
    expect(collectSecretProblems(cfg(withPlaceholder), false).some((p) => p.includes('placeholder'))).toBe(false);
  });

  it('rejects identical access/refresh secrets', () => {
    const problems = collectSecretProblems(cfg({ ...good, JWT_REFRESH_SECRET: STRONG_A }), true);
    expect(problems).toContain('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  });

  it('rejects DB_SYNCHRONIZE=true in production only', () => {
    const sync = { ...good, DB_SYNCHRONIZE: 'true' };
    expect(collectSecretProblems(cfg(sync), true).some((p) => p.includes('DB_SYNCHRONIZE'))).toBe(true);
    expect(collectSecretProblems(cfg(sync), false).some((p) => p.includes('DB_SYNCHRONIZE'))).toBe(false);
  });
});
