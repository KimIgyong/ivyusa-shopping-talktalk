import { HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Sliding window (seconds) that failed-login counters live for. */
const WINDOW_SEC = 15 * 60;
/** Failed attempts per account (email) before lockout — the primary defense. */
const MAX_PER_ACCOUNT = 5;
/** Failed attempts per source IP before lockout — supplementary (IP may be shared/NAT). */
const MAX_PER_IP = 20;

/**
 * Brute-force protection for the login endpoints (SEC-H3). Counts FAILED attempts
 * in Redis, keyed by both account (email, per scope) and source IP, and locks out
 * once either threshold is crossed within the window. A successful login clears the
 * account counter so legitimate users are never locked by their own success.
 *
 * The account counter is the real protection (email is not spoofable by the caller);
 * the IP counter is a secondary limit — a client-supplied XFF could rotate it, but
 * cannot evade the per-account lock. Degrades open if Redis is unavailable (matches
 * the guest-lookup limiter): counters return 0, so login still requires valid creds.
 */
@Injectable()
export class LoginRateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Throw 429 if the account or IP has already exceeded its failure budget. */
  async assertNotLocked(scope: string, email: string, ip: string): Promise<void> {
    const [accountHits, ipHits] = await Promise.all([
      this.count(this.accountKey(scope, email)),
      this.count(this.ipKey(scope, ip)),
    ]);
    if (accountHits >= MAX_PER_ACCOUNT || ipHits >= MAX_PER_IP) {
      throw new BusinessException(ERROR_CODE.LOGIN_RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Record a failed attempt against both the account and the IP (TTL on first hit). */
  async recordFailure(scope: string, email: string, ip: string): Promise<void> {
    await Promise.all([
      this.bump(this.accountKey(scope, email)),
      this.bump(this.ipKey(scope, ip)),
    ]);
  }

  /** Clear the account counter after a successful login (IP counter is left intact). */
  async recordSuccess(scope: string, email: string): Promise<void> {
    await this.redis.del(this.accountKey(scope, email));
  }

  private async count(key: string): Promise<number> {
    const raw = await this.redis.get(key);
    return raw ? Number(raw) : 0;
  }

  private async bump(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.set(key, '1', WINDOW_SEC);
  }

  private accountKey(scope: string, email: string): string {
    return `login:fail:acct:${scope}:${email.toLowerCase()}`;
  }

  private ipKey(scope: string, ip: string): string {
    return `login:fail:ip:${scope}:${ip}`;
  }
}
