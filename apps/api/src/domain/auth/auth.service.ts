import { randomUUID } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { AuditService } from '../audit/audit.service';
import { maskPii } from '../../global/util/pii.util';
import { BCRYPT_ROUNDS, MFA_STEP_UP_TTL_SEC } from '../../global/constant/security.constant';
import { validatePassword } from '../../global/util/password-policy.util';
import { AdminLevel, JobLabel, Principal, UserRank } from '@ivy/types';
import { AdminUser } from './entity/admin-user.entity';
import { User } from '../user/entity/user.entity';
import { JobLabel as JobLabelEntity } from '../user/entity/job-label.entity';
import { UserJobLabel } from '../user/entity/user-job-label.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import {
  AuthTokensResponse,
  MfaChallengeResponse,
  PrincipalResponse,
} from './dto/response/auth.response';
import { LoginRateLimitService } from './login-rate-limit.service';
import { MfaService } from './mfa.service';

/** Refresh-token JWT claims beyond the principal. */
interface RefreshPayload {
  type?: string;
  jti?: string;
  iat?: number;
}

/** Purpose-limited step-up token claims (PLN-MFA Stage M1). */
interface MfaStepUpPayload {
  sub?: string;
  actorType?: string;
  purpose?: string;
}

/**
 * Authentication (SEQ-02 partial; FR-053/054, POL-018). Issues short-lived
 * access + refresh JWTs carrying the principal. Tenant-user tokens embed rank +
 * job labels so guards can evaluate the RBAC matrix without a DB round-trip.
 *
 * Refresh tokens are single-use (SEC-M1): each carries a `jti` registered in
 * Redis for its lifetime; `refresh()` consumes the jti and issues a rotated
 * pair, so a replayed (stolen) refresh token is rejected. Password changes
 * stamp `password_changed_at`, invalidating every refresh token issued before
 * the change — that revocation is DB-backed and survives a Redis restart.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(AdminUser) private readonly adminRepo: Repository<AdminUser>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(JobLabelEntity) private readonly labelRepo: Repository<JobLabelEntity>,
    @InjectRepository(UserJobLabel) private readonly userLabelRepo: Repository<UserJobLabel>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly loginLimiter: LoginRateLimitService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
  ) {}

  /** Best-effort audit (PRV-H4): auth flows must not fail on an audit-write error. */
  private async auditSafe(params: Parameters<AuditService['write']>[0]): Promise<void> {
    try {
      await this.audit.write(params);
    } catch {
      /* audited best-effort */
    }
  }

  async loginAdmin(
    email: string,
    password: string,
    clientIp: string,
  ): Promise<AuthTokensResponse | MfaChallengeResponse> {
    await this.loginLimiter.assertNotLocked('admin', email, clientIp);
    const admin = await this.adminRepo.findOne({ where: { email } });
    if (!admin?.passwordHash || !(await bcrypt.compare(password, admin.passwordHash))) {
      await this.loginLimiter.recordFailure('admin', email, clientIp);
      await this.auditSafe({
        tenantId: null,
        actorType: 'admin',
        actorId: 0,
        action: 'auth.login_failed',
        target: maskPii(email),
      });
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    await this.loginLimiter.recordSuccess('admin', email);
    // MFA step-up (PLN-MFA M1): password OK but the login is NOT complete —
    // no tokens, no principal, no auth.login audit until /auth/mfa/verify.
    const challenge = await this.mfaChallengeIfEnabled('admin', admin.id);
    if (challenge) return challenge;
    await this.auditSafe({
      tenantId: null,
      actorType: 'admin',
      actorId: admin.id,
      action: 'auth.login',
      target: maskPii(email),
    });
    const principal: Principal = {
      actorType: 'admin',
      adminId: admin.id,
      email: admin.email,
      level: admin.level as AdminLevel,
    };
    return this.issue(principal, admin.mustChangePassword === 1, {
      actorType: 'admin',
      id: admin.id,
      email: admin.email,
      level: admin.level as AdminLevel,
    });
  }

  async loginUser(
    email: string,
    password: string,
    clientIp: string,
    shopDomain?: string,
    tenantSlug?: string,
  ): Promise<AuthTokensResponse | MfaChallengeResponse> {
    await this.loginLimiter.assertNotLocked('user', email, clientIp);
    const tenant = tenantSlug
      ? await this.tenantRepo.findOne({ where: { slug: tenantSlug } })
      : shopDomain
        ? await this.tenantRepo.findOne({ where: { shopDomain } })
        : await this.tenantRepo.findOne({ where: {}, order: { id: 'ASC' } });
    if (!tenant) {
      await this.loginLimiter.recordFailure('user', email, clientIp);
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userRepo.findOne({ where: { tenantId: tenant.id, email } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.loginLimiter.recordFailure('user', email, clientIp);
      await this.auditSafe({
        tenantId: tenant.id,
        actorType: 'user',
        actorId: 0,
        action: 'auth.login_failed',
        target: maskPii(email),
      });
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    // Credentials are valid — clear the failure counter even if we then reject a
    // suspended account, so a suspended user's own attempts don't cause lockout.
    await this.loginLimiter.recordSuccess('user', email);
    // A suspended tenant blocks all of its users regardless of their own status.
    if (user.status === 'suspended' || tenant.status === 'suspended') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    // MFA step-up (PLN-MFA M1): see loginAdmin — the login completes at verify.
    const challenge = await this.mfaChallengeIfEnabled('user', user.id);
    if (challenge) return challenge;
    await this.auditSafe({
      tenantId: user.tenantId,
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login',
      target: maskPii(email),
    });
    const labels = await this.loadLabels(user.id);
    const principal: Principal = {
      actorType: 'user',
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      rank: user.rank as UserRank,
      labels,
    };
    return this.issue(principal, user.mustChangePassword === 1, {
      actorType: 'user',
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      rank: user.rank as UserRank,
      labels,
    });
  }

  /**
   * Step-up verification (POST /auth/mfa/verify — @Public; the mfa_token IS the
   * credential). Accepts a 6-digit TOTP or a recovery code, then issues EXACTLY
   * the same response as the corresponding successful login. Rate limited by
   * actor+ip (login-rate-limit pattern); invalid/reused codes are E1011,
   * invalid/expired/mispurposed tokens are the existing 401.
   */
  async verifyMfa(mfaToken: string, code: string, clientIp: string): Promise<AuthTokensResponse> {
    let payload: MfaStepUpPayload;
    try {
      payload = await this.jwt.verifyAsync<MfaStepUpPayload>(mfaToken, { algorithms: ['HS256'] });
    } catch {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    if (
      payload.purpose !== 'mfa' ||
      !payload.sub ||
      (payload.actorType !== 'admin' && payload.actorType !== 'user')
    ) {
      this.logger.warn('mfa verify rejected: token is not an mfa step-up token');
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    const actorType = payload.actorType;
    const actorId = Number(payload.sub);
    const limiterKey = this.mfa.limiterKey({ actorType, actorId });
    await this.loginLimiter.assertNotLocked('mfa', limiterKey, clientIp);

    if (actorType === 'admin') {
      const admin = await this.adminRepo.findOne({ where: { id: actorId } });
      if (!admin) {
        throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
      }
      await this.consumeMfaCode('admin', admin.id, null, admin.email, code, limiterKey, clientIp);
      await this.auditSafe({
        tenantId: null,
        actorType: 'admin',
        actorId: admin.id,
        action: 'auth.login',
        target: maskPii(admin.email),
        metadata: { mfa: true },
      });
      const principal: Principal = {
        actorType: 'admin',
        adminId: admin.id,
        email: admin.email,
        level: admin.level as AdminLevel,
      };
      return this.issue(principal, admin.mustChangePassword === 1, {
        actorType: 'admin',
        id: admin.id,
        email: admin.email,
        level: admin.level as AdminLevel,
      });
    }

    const user = await this.userRepo.findOne({ where: { id: actorId } });
    if (!user) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
    if (user.status === 'suspended' || tenant?.status === 'suspended') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    await this.consumeMfaCode('user', user.id, user.tenantId, user.email, code, limiterKey, clientIp);
    await this.auditSafe({
      tenantId: user.tenantId,
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login',
      target: maskPii(user.email),
      metadata: { mfa: true },
    });
    const labels = await this.loadLabels(user.id);
    const principal: Principal = {
      actorType: 'user',
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      rank: user.rank as UserRank,
      labels,
    };
    return this.issue(principal, user.mustChangePassword === 1, {
      actorType: 'user',
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      rank: user.rank as UserRank,
      labels,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    let payload: Principal & RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
    // Single-use rotation: the jti must still be registered, and is consumed here.
    // When Redis is down we skip the check (degrades open like the login limiter —
    // the signature/expiry/password-change checks below still apply).
    if (this.redis.available()) {
      const live = await this.redis.get(this.refreshKey(payload.jti));
      if (!live) {
        throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
      }
      await this.redis.del(this.refreshKey(payload.jti));
    }

    // Re-load the principal from the DB so a refreshed access token reflects the
    // CURRENT account state (rank/labels/suspension/must-change), not a snapshot.
    if (payload.actorType === 'admin') {
      const admin = await this.adminRepo.findOne({ where: { id: payload.adminId } });
      if (!admin) throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
      this.assertIssuedAfterPasswordChange(payload.iat, admin.passwordChangedAt);
      const principal: Principal = {
        actorType: 'admin',
        adminId: admin.id,
        email: admin.email,
        level: admin.level as AdminLevel,
      };
      return this.issue(principal, admin.mustChangePassword === 1, {
        actorType: 'admin',
        id: admin.id,
        email: admin.email,
        level: admin.level as AdminLevel,
      });
    }
    const user = await this.userRepo.findOne({ where: { id: payload.userId } });
    if (!user || user.status === 'suspended') {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
    this.assertIssuedAfterPasswordChange(payload.iat, user.passwordChangedAt);
    const labels = await this.loadLabels(user.id);
    const principal: Principal = {
      actorType: 'user',
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      rank: user.rank as UserRank,
      labels,
    };
    return this.issue(principal, user.mustChangePassword === 1, {
      actorType: 'user',
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      rank: user.rank as UserRank,
      labels,
    });
  }

  /**
   * Change password, stamp `password_changed_at` (revoking all previously issued
   * refresh tokens), and hand back a fresh token pair so the client can drop the
   * pwd-pending access token immediately.
   */
  async changePassword(
    principal: Principal,
    current: string,
    next: string,
  ): Promise<AuthTokensResponse> {
    if (principal.actorType === 'admin') {
      const admin = await this.adminRepo.findOneByOrFail({ id: principal.adminId });
      await this.assertAndSet(admin.passwordHash, current, next, { email: admin.email }, async (hash) => {
        admin.passwordHash = hash;
        admin.mustChangePassword = 0;
        admin.passwordChangedAt = new Date();
        await this.adminRepo.save(admin);
      });
      await this.auditSafe({
        tenantId: null,
        actorType: 'admin',
        actorId: admin.id,
        action: 'auth.password_changed',
      });
      return this.issue(principal, false, this.toPrincipalResponse(principal));
    }
    const user = await this.userRepo.findOneByOrFail({ id: principal.userId });
    await this.assertAndSet(user.passwordHash, current, next, { email: user.email, name: user.name }, async (hash) => {
      user.passwordHash = hash;
      user.mustChangePassword = 0;
      user.passwordChangedAt = new Date();
      await this.userRepo.save(user);
    });
    await this.auditSafe({
      tenantId: user.tenantId,
      actorType: 'user',
      actorId: user.id,
      action: 'auth.password_changed',
    });
    return this.issue(principal, false, this.toPrincipalResponse(principal));
  }

  /** Revoke the presented refresh token (best-effort; invalid tokens are ignored). */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
      if (payload.jti) await this.redis.del(this.refreshKey(payload.jti));
    } catch {
      /* not a valid refresh token — nothing to revoke */
    }
  }

  async me(principal: Principal): Promise<PrincipalResponse> {
    return this.toPrincipalResponse(principal);
  }

  // ---- helpers ----

  /**
   * When the account has an active MFA credential, mint the purpose-limited
   * step-up JWT (5 min, `purpose:'mfa'` — rejected by JwtAuthGuard for normal
   * APIs) and return the challenge instead of tokens.
   */
  private async mfaChallengeIfEnabled(
    actorType: 'admin' | 'user',
    actorId: number,
  ): Promise<MfaChallengeResponse | null> {
    if (!(await this.mfa.isEnabled(actorType, actorId))) return null;
    const mfaToken = this.jwt.sign(
      { sub: String(actorId), actorType, purpose: 'mfa' },
      { expiresIn: MFA_STEP_UP_TTL_SEC },
    );
    return { mfaRequired: true, mfaToken };
  }

  /** Consume a TOTP/recovery code, recording rate-limit failures per actor+ip. */
  private async consumeMfaCode(
    actorType: 'admin' | 'user',
    actorId: number,
    tenantId: number | null,
    email: string,
    code: string,
    limiterKey: string,
    clientIp: string,
  ): Promise<void> {
    try {
      await this.mfa.consumeLoginCode(actorType, actorId, tenantId, email, code);
    } catch (e) {
      if (e instanceof BusinessException && e.errorCode === ERROR_CODE.MFA_CODE_INVALID.code) {
        await this.loginLimiter.recordFailure('mfa', limiterKey, clientIp);
      }
      throw e;
    }
    await this.loginLimiter.recordSuccess('mfa', limiterKey);
  }

  private async loadLabels(userId: number): Promise<JobLabel[]> {
    const links = await this.userLabelRepo.find({ where: { userId } });
    if (!links.length) return [];
    const labels = await this.labelRepo.findByIds(links.map((l) => l.jobLabelId));
    return labels.map((l) => l.code as JobLabel);
  }

  /**
   * Verify the current password, enforce the password policy on the NEW one
   * (service-layer double enforcement — DTO validation can be bypassed), then
   * hash and persist. Policy failures are E1009 with the failed rule keys in
   * `details.password`, and warned to the log (4xx are not logged by default).
   */
  private async assertAndSet(
    currentHash: string | null,
    current: string,
    next: string,
    identity: { email?: string | null; name?: string | null },
    save: (hash: string) => Promise<void>,
  ): Promise<void> {
    if (!currentHash || !(await bcrypt.compare(current, currentHash))) {
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    const policy = validatePassword(next, { ...identity, currentPasswordPlain: current });
    if (!policy.ok) {
      this.logger.warn(
        `password change rejected by policy [${policy.failed.join(', ')}] for ${maskPii(identity.email ?? '')}`,
      );
      throw new BusinessException(ERROR_CODE.PASSWORD_POLICY_VIOLATION, HttpStatus.BAD_REQUEST, {
        password: policy.failed,
      });
    }
    await save(await bcrypt.hash(next, BCRYPT_ROUNDS));
  }

  private async issue(
    rawPrincipal: Principal,
    mustChangePassword: boolean,
    principalResponse: PrincipalResponse,
  ): Promise<AuthTokensResponse> {
    // Allowlist the principal fields: callers may pass req.user, which is the
    // decoded JWT payload and carries iat/exp/pwdPending — re-signing those
    // breaks jsonwebtoken (`expiresIn` + existing `exp`) and would smuggle
    // stale claims into the fresh token.
    const principal = this.cleanPrincipal(rawPrincipal);
    // pwd-pending rides in the ACCESS token so JwtAuthGuard can enforce the
    // forced-change lockout (SEC-M2) without a DB hit per request.
    const accessToken = this.jwt.sign({
      ...(principal as object),
      ...(mustChangePassword ? { pwdPending: true } : {}),
    });
    const refreshTtl = Number(this.config.get<string>('JWT_REFRESH_TTL', '604800'));
    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { ...(principal as object), type: 'refresh', jti },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );
    await this.redis.set(this.refreshKey(jti), '1', refreshTtl);
    return { accessToken, refreshToken, mustChangePassword, principal: principalResponse };
  }

  private refreshKey(jti: string): string {
    return `auth:rt:${jti}`;
  }

  private cleanPrincipal(p: Principal): Principal {
    return p.actorType === 'admin'
      ? { actorType: 'admin', adminId: p.adminId, email: p.email, level: p.level }
      : {
          actorType: 'user',
          userId: p.userId,
          tenantId: p.tenantId,
          email: p.email,
          rank: p.rank,
          labels: p.labels,
        };
  }

  /**
   * Reject refresh tokens minted before the last password change. Compared at
   * second precision (JWT iat granularity) so the pair issued by
   * `changePassword` itself, in the same second as the stamp, stays valid.
   */
  private assertIssuedAfterPasswordChange(
    iatSec: number | undefined,
    passwordChangedAt: Date | null,
  ): void {
    if (!passwordChangedAt) return;
    if (Math.floor(passwordChangedAt.getTime() / 1000) > (iatSec ?? 0)) {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
  }

  private toPrincipalResponse(p: Principal): PrincipalResponse {
    return p.actorType === 'admin'
      ? { actorType: 'admin', id: p.adminId, email: p.email, level: p.level }
      : { actorType: 'user', id: p.userId, email: p.email, tenantId: p.tenantId, rank: p.rank, labels: p.labels };
  }
}
