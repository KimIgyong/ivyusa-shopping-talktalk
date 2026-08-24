import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../user/entity/user.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { LoginRateLimitService } from './login-rate-limit.service';
import { MailerService } from '../../infrastructure/infrastructure.module';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { BCRYPT_ROUNDS } from '../../global/constant/security.constant';
import { generateTempPassword, validatePassword } from '../../global/util/password-policy.util';
import { buildTempPasswordMail } from '../../global/util/temp-password-mail.util';
import { maskPii } from '../../global/util/pii.util';

/** One hour, in seconds — the sliding window for both recovery quotas. */
const QUOTA_WINDOW_SEC = 60 * 60;
/** Temp-password requests replace the user's password → tight per-account cap (DoS guard). */
const TEMP_REQUEST_LIMITS = { maxPerAccount: 3, maxPerIp: 10 };
/** Locked-out change verifies credentials → stricter than the login budget itself. */
const CHANGE_LIMITS = { maxPerAccount: 5, maxPerIp: 15 };

/**
 * Self-service password recovery from the tenant login page (PLN-260824).
 *
 * Design constraints (REQ-260824 §4):
 * - Account enumeration: temp-request returns the SAME response whether or not
 *   the account exists; only pre-checks that are independent of the account
 *   (mailer configured, quota) may fail loudly.
 * - No lockout bypass: both endpoints run their own always-enforced quota, and
 *   a failed change also feeds the login limiter — together they keep the
 *   total guessing budget bounded even while the login lock is active.
 * - Mail is best-effort (MailerService contract): a send failure must not
 *   distinguish the response, only a server-side warn log.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly loginLimiter: LoginRateLimitService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue a temp password and email it to the account's registered address.
   * Neutral `{ requested: true }` regardless of whether the account exists.
   */
  async requestTempPassword(
    tenantSlug: string,
    email: string,
    clientIp: string,
  ): Promise<{ requested: true }> {
    // Account-independent pre-checks may throw: they leak nothing about the account.
    if (!this.mailer.configured()) {
      throw new BusinessException(ERROR_CODE.EMAIL_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    await this.loginLimiter.assertQuota('pwreset', email, clientIp, TEMP_REQUEST_LIMITS);
    // Every request counts — existence-dependent counting would itself be an oracle.
    await this.loginLimiter.bumpQuota('pwreset', email, clientIp, QUOTA_WINDOW_SEC);

    const target = await this.findActiveUser(tenantSlug, email);
    if (!target) return { requested: true };
    const { tenant, user } = target;

    const tempPassword = generateTempPassword();
    user.passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = 1;
    await this.userRepo.save(user);
    // Getting the temp password issued is what unlocks the account (same as the
    // admin-issued path in UserService.issueTempPassword).
    await this.loginLimiter.clearAccountLock('user', user.email);
    await this.auditSafe(tenant.id, user.id, 'user.temp_password_requested', user.email);

    const sent = await this.mailer.send(
      buildTempPasswordMail(
        this.config.get<string>('PUBLIC_WEB_BASE_URL'),
        tenant.slug,
        user.email,
        tempPassword,
      ),
    );
    if (!sent) {
      // Response stays neutral; the operator can spot delivery trouble here.
      this.logger.warn(`Temp-password mail not delivered (tenant ${tenant.id}, user ${user.id})`);
    }
    return { requested: true };
  }

  /**
   * Change the password with the current (or temp) password as proof — works
   * while the login lock is active and clears it on success.
   */
  async changePassword(
    tenantSlug: string,
    email: string,
    currentPassword: string,
    newPassword: string,
    clientIp: string,
  ): Promise<{ changed: true }> {
    await this.loginLimiter.assertQuota('pwchange', email, clientIp, CHANGE_LIMITS);

    const target = await this.findActiveUser(tenantSlug, email);
    const hash = target?.user.passwordHash;
    if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
      // A wrong guess spends BOTH budgets: this endpoint's own quota and the
      // regular login counter (so the login lock keeps extending too).
      await this.loginLimiter.bumpQuota('pwchange', email, clientIp, QUOTA_WINDOW_SEC);
      await this.loginLimiter.recordFailure('user', email, clientIp);
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    const { tenant, user } = target;

    // Full-context re-validation (DTO covers only the context-free rules).
    const policy = validatePassword(newPassword, {
      email: user.email,
      name: user.name,
      currentPasswordPlain: currentPassword,
    });
    if (!policy.ok) {
      throw new BusinessException(ERROR_CODE.PASSWORD_POLICY_VIOLATION, HttpStatus.BAD_REQUEST, {
        password: policy.failed,
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = 0;
    // Revokes refresh tokens issued before this instant (SEC-M1).
    user.passwordChangedAt = new Date();
    await this.userRepo.save(user);
    await this.loginLimiter.clearAccountLock('user', user.email);
    await this.auditSafe(tenant.id, user.id, 'user.password_changed_self', user.email);
    return { changed: true };
  }

  /** Tenant by slug + its non-suspended user by email, or null (never throws). */
  private async findActiveUser(
    tenantSlug: string,
    email: string,
  ): Promise<{ tenant: Tenant; user: User } | null> {
    const tenant = await this.tenantRepo.findOne({ where: { slug: tenantSlug } });
    if (!tenant || tenant.status === 'suspended') return null;
    const user = await this.userRepo.findOne({ where: { tenantId: tenant.id, email } });
    if (!user || user.status === 'suspended') return null;
    return { tenant, user };
  }

  /** Audit is best-effort here — recovery must not fail on an audit hiccup. */
  private async auditSafe(
    tenantId: number,
    userId: number,
    action: string,
    email: string,
  ): Promise<void> {
    try {
      await this.audit.write({
        tenantId,
        actorType: 'user',
        actorId: userId,
        action,
        target: `user:${userId} ${maskPii(email)}`,
      });
    } catch (e) {
      this.logger.warn(`audit write failed for ${action}: ${(e as Error).message}`);
    }
  }
}
