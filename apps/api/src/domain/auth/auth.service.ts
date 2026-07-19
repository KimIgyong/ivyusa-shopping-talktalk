import { randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { AuditService } from '../audit/audit.service';
import { maskPii } from '../../global/util/pii.util';
import { BCRYPT_ROUNDS } from '../../global/constant/security.constant';
import { AdminLevel, JobLabel, Principal, UserRank } from '@ivy/types';
import { AdminUser } from './entity/admin-user.entity';
import { User } from '../user/entity/user.entity';
import { JobLabel as JobLabelEntity } from '../user/entity/job-label.entity';
import { UserJobLabel } from '../user/entity/user-job-label.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuthTokensResponse, PrincipalResponse } from './dto/response/auth.response';
import { LoginRateLimitService } from './login-rate-limit.service';

/** Refresh-token JWT claims beyond the principal. */
interface RefreshPayload {
  type?: string;
  jti?: string;
  iat?: number;
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
  ) {}

  /** Best-effort audit (PRV-H4): auth flows must not fail on an audit-write error. */
  private async auditSafe(params: Parameters<AuditService['write']>[0]): Promise<void> {
    try {
      await this.audit.write(params);
    } catch {
      /* audited best-effort */
    }
  }

  async loginAdmin(email: string, password: string, clientIp: string): Promise<AuthTokensResponse> {
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
  ): Promise<AuthTokensResponse> {
    await this.loginLimiter.assertNotLocked('user', email, clientIp);
    const tenant = shopDomain
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
    if (user.status === 'suspended') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
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
      await this.assertAndSet(admin.passwordHash, current, next, async (hash) => {
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
    await this.assertAndSet(user.passwordHash, current, next, async (hash) => {
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
  private async loadLabels(userId: number): Promise<JobLabel[]> {
    const links = await this.userLabelRepo.find({ where: { userId } });
    if (!links.length) return [];
    const labels = await this.labelRepo.findByIds(links.map((l) => l.jobLabelId));
    return labels.map((l) => l.code as JobLabel);
  }

  private async assertAndSet(
    currentHash: string | null,
    current: string,
    next: string,
    save: (hash: string) => Promise<void>,
  ): Promise<void> {
    if (!currentHash || !(await bcrypt.compare(current, currentHash))) {
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
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
