import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ADMIN_LEVEL, AdminLevel } from '@ivy/types';
import { AdminUser } from './entity/admin-user.entity';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../../infrastructure/infrastructure.module';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { BCRYPT_ROUNDS } from '../../global/constant/security.constant';
import { generateTempPassword } from '../../global/util/password-policy.util';
import { buildTempPasswordMail } from '../../global/util/temp-password-mail.util';
import { maskPii } from '../../global/util/pii.util';

/** Where an invited admin signs in — the mail links here, never a tenant path. */
const ADMIN_LOGIN_PATH = '/admin/login';

const ADMIN_STATUS = { ACTIVE: 'active', SUSPENDED: 'suspended' } as const;

export interface AdminCredentialResult {
  adminId: number;
  email: string;
  tempPassword: string;
  emailSent?: boolean;
}

/**
 * Platform-admin account management (REQ-260824-Admin-Account-Invite) — the
 * first real user of the reserved admin_account.manage policy: every caller
 * is gated @AdminOnly(SUPER_ADMIN) at the controller.
 *
 * Invitation is the proven console pattern, not a token link: create the row
 * with a policy-clean temp password + must_change_password, reveal the
 * plaintext ONCE to the inviter, optionally mail it with the /admin/login
 * link. No schema change — admin_users already carries everything needed.
 */
@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(AdminUser) private readonly adminRepo: Repository<AdminUser>,
    private readonly loginLimiter: LoginRateLimitService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async list(): Promise<AdminUser[]> {
    return this.adminRepo.find({ order: { id: 'ASC' } });
  }

  async invite(
    inviterId: number,
    email: string,
    level: AdminLevel,
    sendEmail?: boolean,
  ): Promise<AdminCredentialResult> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.adminRepo.findOne({ where: { email: normalized } });
    if (existing) {
      this.logger.warn(`admin invite refused: email already exists (${maskPii(normalized)})`);
      throw new BusinessException(ERROR_CODE.EMAIL_TAKEN, HttpStatus.CONFLICT);
    }
    const tempPassword = generateTempPassword();
    const admin = await this.adminRepo.save(
      this.adminRepo.create({
        email: normalized,
        passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
        level,
        status: ADMIN_STATUS.ACTIVE,
        mustChangePassword: 1,
      }),
    );
    const emailSent = await this.mailTempPassword(admin, tempPassword, sendEmail);
    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId: inviterId,
      action: 'admin.invited',
      target: `admin:${admin.id} ${maskPii(admin.email)}`,
      metadata: { level, emailSent: emailSent ?? false },
    });
    return { adminId: Number(admin.id), email: admin.email, tempPassword, emailSent };
  }

  /** Fresh temp password + forced change; doubles as the lock-recovery hook. */
  async issueTempPassword(
    actorId: number,
    adminId: number,
    sendEmail?: boolean,
  ): Promise<AdminCredentialResult> {
    const admin = await this.owned(adminId);
    const tempPassword = generateTempPassword();
    admin.passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    admin.mustChangePassword = 1;
    await this.adminRepo.save(admin);
    await this.loginLimiter.clearAccountLock('admin', admin.email);
    const emailSent = await this.mailTempPassword(admin, tempPassword, sendEmail);
    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId,
      action: 'admin.temp_password_issued',
      target: `admin:${admin.id} ${maskPii(admin.email)}`,
      metadata: { emailSent: emailSent ?? false },
    });
    return { adminId: Number(admin.id), email: admin.email, tempPassword, emailSent };
  }

  async setStatus(actorId: number, adminId: number, status: string): Promise<AdminUser> {
    const admin = await this.owned(adminId);
    if (Number(admin.id) === Number(actorId)) {
      // Locking yourself out is never what was meant.
      this.logger.warn(`admin status refused: self-change (admin:${adminId})`);
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (
      status === ADMIN_STATUS.SUSPENDED &&
      admin.level === ADMIN_LEVEL.SUPER_ADMIN &&
      admin.status === ADMIN_STATUS.ACTIVE
    ) {
      const otherActiveSupers = await this.adminRepo.count({
        where: { level: ADMIN_LEVEL.SUPER_ADMIN, status: ADMIN_STATUS.ACTIVE, id: Not(admin.id) },
      });
      if (otherActiveSupers === 0) {
        this.logger.warn(`admin status refused: last active super admin (admin:${adminId})`);
        throw new BusinessException(ERROR_CODE.LAST_SUPER_ADMIN, HttpStatus.CONFLICT);
      }
    }
    admin.status = status;
    await this.adminRepo.save(admin);
    await this.audit.write({
      tenantId: null,
      actorType: 'admin',
      actorId,
      action: 'admin.status_changed',
      target: `admin:${admin.id} ${maskPii(admin.email)}`,
      metadata: { status },
    });
    return admin;
  }

  private async owned(id: number): Promise<AdminUser> {
    const admin = await this.adminRepo.findOne({ where: { id } });
    if (!admin) {
      this.logger.warn(`admin not found: id=${id}`);
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return admin;
  }

  /**
   * Best-effort delivery, same contract as the tenant flows: the plaintext is
   * still returned so the inviter can hand it over manually on failure.
   */
  private async mailTempPassword(
    admin: AdminUser,
    tempPassword: string,
    sendEmail?: boolean,
  ): Promise<boolean | undefined> {
    if (!sendEmail) return undefined;
    let emailSent = false;
    if (this.mailer.configured()) {
      emailSent = await this.mailer.send(
        buildTempPasswordMail(
          this.config.get<string>('APP_PUBLIC_URL'),
          ADMIN_LOGIN_PATH,
          admin.email,
          tempPassword,
        ),
      );
    }
    if (!emailSent) {
      this.logger.warn(`Admin temp-password mail not delivered (admin:${admin.id})`);
    }
    return emailSent;
  }
}
