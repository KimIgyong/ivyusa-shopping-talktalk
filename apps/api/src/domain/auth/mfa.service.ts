import { randomBytes } from 'crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Principal } from '@ivy/types';
import { AdminUser } from './entity/admin-user.entity';
import { MfaCredential } from './entity/mfa-credential.entity';
import { MfaRecoveryCode } from './entity/mfa-recovery-code.entity';
import { User } from '../user/entity/user.entity';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { decryptSecret, encryptSecret } from '../../global/util/crypto.util';
import { maskPii } from '../../global/util/pii.util';
import {
  BCRYPT_ROUNDS,
  MFA_RECOVERY_CODE_COUNT,
} from '../../global/constant/security.constant';
import {
  buildOtpauthUri,
  generateTotpSecret,
  verifyTotp,
} from '../../global/util/totp.util';

/** otpauth issuer shown in authenticator apps. */
const OTPAUTH_ISSUER = 'ShopTalk';
/** Recovery code shape: 10 hex chars as `xxxxx-xxxxx`. */
const RECOVERY_CODE_RE = /^[0-9a-f]{5}-[0-9a-f]{5}$/i;

/** The (actor_type, actor_id) axis of the dual account model + audit context. */
interface ActorRef {
  actorType: 'admin' | 'user';
  actorId: number;
  tenantId: number | null;
  email: string;
}

/**
 * TOTP MFA credential lifecycle (PLN-MFA Stage M1, REQ-MFA): enrollment,
 * code verification with a same-step replay guard, single-use recovery codes,
 * disable, and admin reset. Spans both account types via (actor_type, actor_id).
 *
 * NOTE (D-M1): this service provides CAPABILITY only — required-rank policy
 * enforcement (grace period, forced enrollment) is Stage M3, not here.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    @InjectRepository(MfaCredential) private readonly credRepo: Repository<MfaCredential>,
    @InjectRepository(MfaRecoveryCode) private readonly codeRepo: Repository<MfaRecoveryCode>,
    @InjectRepository(AdminUser) private readonly adminRepo: Repository<AdminUser>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly limiter: LoginRateLimitService,
    private readonly audit: AuditService,
  ) {}

  /** Whether the account has an ACTIVE (verified) MFA credential. */
  async isEnabled(actorType: 'admin' | 'user', actorId: number): Promise<boolean> {
    const cred = await this.credRepo.findOne({ where: { actorType, actorId } });
    return cred?.enabledAt != null;
  }

  /** GET /auth/mfa/status */
  async status(principal: Principal): Promise<{ enrolled: boolean; enabledAt: string | null }> {
    const actor = this.actorOf(principal);
    const cred = await this.credRepo.findOne({
      where: { actorType: actor.actorType, actorId: actor.actorId },
    });
    return {
      enrolled: cred?.enabledAt != null,
      enabledAt: cred?.enabledAt ? cred.enabledAt.toISOString() : null,
    };
  }

  /**
   * POST /auth/mfa/enroll — issue (or, while still pending, re-issue) a secret.
   * The base32 secret + otpauth URI are returned ONCE here for QR/manual entry;
   * only the AES-256-GCM ciphertext is stored, and the secret is never logged.
   */
  async enroll(principal: Principal): Promise<{ otpauthUri: string; secret: string }> {
    const actor = this.actorOf(principal);
    let cred = await this.credRepo.findOne({
      where: { actorType: actor.actorType, actorId: actor.actorId },
    });
    if (cred?.enabledAt) {
      this.logger.warn(`mfa enroll rejected: already enrolled (${actor.actorType}:${actor.actorId})`);
      throw new BusinessException(ERROR_CODE.MFA_ALREADY_ENROLLED, HttpStatus.CONFLICT);
    }
    const secret = generateTotpSecret();
    const secretEnc = encryptSecret(secret).toString('base64');
    if (cred) {
      // Pending re-enroll: regenerate the secret (the old one is dead).
      cred.secretEnc = secretEnc;
      cred.lastUsedStep = null;
    } else {
      cred = this.credRepo.create({
        actorType: actor.actorType,
        actorId: actor.actorId,
        secretEnc,
        enabledAt: null,
        lastUsedStep: null,
      });
    }
    await this.credRepo.save(cred);
    return { otpauthUri: buildOtpauthUri(OTPAUTH_ISSUER, actor.email, secret), secret };
  }

  /**
   * POST /auth/mfa/enroll/verify — confirm the authenticator with a first code,
   * activate the credential, and return the 10 single-use recovery codes
   * (plaintext appears ONLY in this response; bcrypt hashes are stored).
   */
  async enrollVerify(principal: Principal, code: string): Promise<{ recoveryCodes: string[] }> {
    const actor = this.actorOf(principal);
    const cred = await this.credRepo.findOne({
      where: { actorType: actor.actorType, actorId: actor.actorId },
    });
    if (!cred) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (cred.enabledAt) {
      throw new BusinessException(ERROR_CODE.MFA_ALREADY_ENROLLED, HttpStatus.CONFLICT);
    }
    const step = verifyTotp(this.secretOf(cred), code.trim());
    if (step == null) {
      this.logger.warn(`mfa enroll-verify code rejected (${actor.actorType}:${actor.actorId})`);
      throw new BusinessException(ERROR_CODE.MFA_CODE_INVALID, HttpStatus.BAD_REQUEST);
    }
    cred.enabledAt = new Date();
    // The confirmation code counts as used — it cannot be replayed at login.
    cred.lastUsedStep = step;
    await this.credRepo.save(cred);
    await this.codeRepo.delete({ credentialId: cred.id }); // stale codes from a prior enrollment
    const recoveryCodes = await this.issueRecoveryCodes(cred.id);
    await this.audit.write({
      tenantId: actor.tenantId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: 'mfa.enrolled',
      target: maskPii(actor.email),
    });
    return { recoveryCodes };
  }

  /**
   * Login-flow code consumption (POST /auth/mfa/verify). TOTP first (with the
   * same-step replay guard), then recovery (single-use). Failures audit
   * `mfa.verify_failed` (result: denied) and throw E1011; rate limiting is the
   * caller's concern (AuthService keys it by actor+ip).
   */
  async consumeLoginCode(
    actorType: 'admin' | 'user',
    actorId: number,
    tenantId: number | null,
    email: string,
    code: string,
  ): Promise<'totp' | 'recovery'> {
    const cred = await this.credRepo.findOne({ where: { actorType, actorId } });
    if (!cred?.enabledAt) {
      // Credential reset/disabled after the challenge was issued — the step-up
      // token no longer corresponds to an MFA-pending login.
      this.logger.warn(`mfa verify rejected: no active credential (${actorType}:${actorId})`);
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    return this.consume(cred, { actorType, actorId, tenantId, email }, code);
  }

  /**
   * POST /auth/mfa/disable — requires the account password AND a valid code
   * (TOTP or recovery). Deletes the credential + recovery codes.
   */
  async disable(
    principal: Principal,
    password: string,
    code: string,
    clientIp: string,
  ): Promise<{ disabled: true }> {
    const actor = this.actorOf(principal);
    const limiterKey = this.limiterKey(actor);
    await this.limiter.assertNotLocked('mfa', limiterKey, clientIp);
    const cred = await this.credRepo.findOne({
      where: { actorType: actor.actorType, actorId: actor.actorId },
    });
    if (!cred?.enabledAt) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const passwordHash = await this.passwordHashOf(actor);
    if (!passwordHash || !(await bcrypt.compare(password, passwordHash))) {
      await this.limiter.recordFailure('mfa', limiterKey, clientIp);
      this.logger.warn(`mfa disable rejected: bad password (${actor.actorType}:${actor.actorId})`);
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    try {
      await this.consume(cred, actor, code);
    } catch (e) {
      if (e instanceof BusinessException && e.errorCode === ERROR_CODE.MFA_CODE_INVALID.code) {
        await this.limiter.recordFailure('mfa', limiterKey, clientIp);
      }
      throw e;
    }
    await this.limiter.recordSuccess('mfa', limiterKey);
    await this.codeRepo.delete({ credentialId: cred.id });
    await this.credRepo.delete({ id: cred.id });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: 'mfa.disabled',
      target: maskPii(actor.email),
    });
    return { disabled: true };
  }

  /**
   * Admin/console MFA reset for a tenant user (POST /users/:id/mfa-reset and the
   * platform-admin variant). Deletes the credential + recovery codes so the
   * target re-enrolls at next login. Audited with the RESETTING actor.
   */
  async resetForUser(
    tenantId: number,
    userId: number,
    actorPrincipal: Principal,
  ): Promise<{ reset: true }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(ERROR_CODE.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (user.tenantId !== tenantId) {
      this.logger.warn(`mfa reset rejected: cross-tenant target user:${userId}`);
      throw new BusinessException(ERROR_CODE.TENANT_MISMATCH, HttpStatus.FORBIDDEN);
    }
    const cred = await this.credRepo.findOne({ where: { actorType: 'user', actorId: user.id } });
    if (cred) {
      await this.codeRepo.delete({ credentialId: cred.id });
      await this.credRepo.delete({ id: cred.id });
    }
    const actor = this.actorOf(actorPrincipal);
    await this.audit.write({
      tenantId: user.tenantId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: 'mfa.reset',
      target: `user:${user.id}`,
      metadata: { email: maskPii(user.email), hadCredential: !!cred },
    });
    return { reset: true };
  }

  // ---- helpers ----

  /** Rate-limit key for MFA verification: the actor identity (paired with ip by the limiter). */
  limiterKey(actor: { actorType: string; actorId: number }): string {
    return `${actor.actorType}:${actor.actorId}`;
  }

  private actorOf(principal: Principal): ActorRef {
    return principal.actorType === 'admin'
      ? { actorType: 'admin', actorId: principal.adminId, tenantId: null, email: principal.email }
      : {
          actorType: 'user',
          actorId: principal.userId,
          tenantId: principal.tenantId,
          email: principal.email,
        };
  }

  private secretOf(cred: MfaCredential): string {
    return decryptSecret(Buffer.from(cred.secretEnc, 'base64'));
  }

  private async passwordHashOf(actor: ActorRef): Promise<string | null> {
    if (actor.actorType === 'admin') {
      const admin = await this.adminRepo.findOne({ where: { id: actor.actorId } });
      return admin?.passwordHash ?? null;
    }
    const user = await this.userRepo.findOne({ where: { id: actor.actorId } });
    return user?.passwordHash ?? null;
  }

  /** TOTP first, then recovery — formats are disjoint (6 digits vs `xxxxx-xxxxx`). */
  private async consume(
    cred: MfaCredential,
    actor: ActorRef,
    rawCode: string,
  ): Promise<'totp' | 'recovery'> {
    const code = rawCode.trim();
    if (/^\d{6}$/.test(code)) {
      const step = verifyTotp(this.secretOf(cred), code);
      if (step != null && (cred.lastUsedStep == null || step > cred.lastUsedStep)) {
        cred.lastUsedStep = step;
        await this.credRepo.save(cred);
        return 'totp';
      }
      return this.denied(actor, step != null ? 'totp_replayed' : 'totp_invalid');
    }
    if (RECOVERY_CODE_RE.test(code)) {
      const unused = await this.codeRepo.find({
        where: { credentialId: cred.id, usedAt: IsNull() },
      });
      for (const row of unused) {
        if (await bcrypt.compare(code.toLowerCase(), row.codeHash)) {
          row.usedAt = new Date();
          await this.codeRepo.save(row);
          await this.auditSafe({
            tenantId: actor.tenantId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            action: 'mfa.recovery_used',
            target: maskPii(actor.email),
          });
          return 'recovery';
        }
      }
      return this.denied(actor, 'recovery_invalid');
    }
    return this.denied(actor, 'malformed');
  }

  /** 4xx are not server-logged by default — warn, audit as denied, throw E1011. */
  private async denied(actor: ActorRef, reason: string): Promise<never> {
    this.logger.warn(`mfa code rejected (${reason}) for ${actor.actorType}:${actor.actorId}`);
    await this.auditSafe({
      tenantId: actor.tenantId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: 'mfa.verify_failed',
      target: maskPii(actor.email),
      result: 'denied',
      metadata: { reason },
    });
    throw new BusinessException(ERROR_CODE.MFA_CODE_INVALID, HttpStatus.BAD_REQUEST);
  }

  private async issueRecoveryCodes(credentialId: number): Promise<string[]> {
    const codes: string[] = [];
    const rows: MfaRecoveryCode[] = [];
    for (let i = 0; i < MFA_RECOVERY_CODE_COUNT; i++) {
      const hex = randomBytes(5).toString('hex'); // 10 hex chars
      const code = `${hex.slice(0, 5)}-${hex.slice(5)}`;
      codes.push(code);
      rows.push(
        this.codeRepo.create({
          credentialId,
          codeHash: await bcrypt.hash(code, BCRYPT_ROUNDS),
        }),
      );
    }
    await this.codeRepo.save(rows);
    return codes;
  }

  /** Best-effort audit for hot-path (login verify) writes. */
  private async auditSafe(params: Parameters<AuditService['write']>[0]): Promise<void> {
    try {
      await this.audit.write(params);
    } catch {
      /* audited best-effort */
    }
  }
}
