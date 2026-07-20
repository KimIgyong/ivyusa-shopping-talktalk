import { ConfigService } from '@nestjs/config';

/** Dev-placeholder markers that must never survive into production secrets. */
const PLACEHOLDER = /change_me|changeme|placeholder|example|dev_|_dev|secret_here|xxxx/i;

/** Secrets that must be present + strong in production (SEC-M5). */
const REQUIRED_SECRETS: Array<{ key: string; minLen: number }> = [
  { key: 'JWT_ACCESS_SECRET', minLen: 32 },
  { key: 'JWT_REFRESH_SECRET', minLen: 32 },
  { key: 'CRED_ENC_KEY', minLen: 32 },
];

/**
 * Fail fast at boot if production is running on missing, short, or placeholder
 * secrets (SEC-M5). Outside production this only warns, so local dev keeps
 * working with the committed `.env.development` placeholders.
 *
 * Returns the list of problems (empty = OK) so it is unit-testable without
 * exiting the process.
 */
export function collectSecretProblems(config: ConfigService, isProd: boolean): string[] {
  const problems: string[] = [];
  for (const { key, minLen } of REQUIRED_SECRETS) {
    const val = config.get<string>(key);
    if (!val || !val.trim()) {
      problems.push(`${key} is not set`);
      continue;
    }
    if (val.length < minLen) {
      problems.push(`${key} is too short (${val.length} < ${minLen} chars)`);
    }
    if (isProd && PLACEHOLDER.test(val)) {
      problems.push(`${key} looks like a dev placeholder — set a real secret`);
    }
  }
  // Access and refresh secrets sharing a value defeats refresh-token isolation.
  const access = config.get<string>('JWT_ACCESS_SECRET');
  const refresh = config.get<string>('JWT_REFRESH_SECRET');
  if (access && refresh && access === refresh) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  // Production must not auto-sync the schema (drift/data-loss risk).
  if (isProd && config.get<string>('DB_SYNCHRONIZE') === 'true') {
    problems.push('DB_SYNCHRONIZE=true is unsafe in production — use migrations');
  }
  return problems;
}
