import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
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

/**
 * Authentication (SEQ-02 partial; FR-053/054, POL-018). Issues short-lived
 * access + refresh JWTs carrying the principal. Tenant-user tokens embed rank +
 * job labels so guards can evaluate the RBAC matrix without a DB round-trip.
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
  ) {}

  async loginAdmin(email: string, password: string): Promise<AuthTokensResponse> {
    const admin = await this.adminRepo.findOne({ where: { email } });
    if (!admin?.passwordHash || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
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

  async loginUser(email: string, password: string, shopDomain?: string): Promise<AuthTokensResponse> {
    const tenant = shopDomain
      ? await this.tenantRepo.findOne({ where: { shopDomain } })
      : await this.tenantRepo.findOne({ where: {}, order: { id: 'ASC' } });
    if (!tenant) throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);

    const user = await this.userRepo.findOne({ where: { tenantId: tenant.id, email } });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new BusinessException(ERROR_CODE.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    if (user.status === 'suspended') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
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
    let payload: Principal & { type?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
    const principal = this.stripJwtMeta(payload);
    return this.issue(principal, false, this.toPrincipalResponse(principal));
  }

  async changePassword(principal: Principal, current: string, next: string): Promise<void> {
    if (principal.actorType === 'admin') {
      const admin = await this.adminRepo.findOneByOrFail({ id: principal.adminId });
      await this.assertAndSet(admin.passwordHash, current, next, async (hash) => {
        admin.passwordHash = hash;
        admin.mustChangePassword = 0;
        await this.adminRepo.save(admin);
      });
    } else {
      const user = await this.userRepo.findOneByOrFail({ id: principal.userId });
      await this.assertAndSet(user.passwordHash, current, next, async (hash) => {
        user.passwordHash = hash;
        user.mustChangePassword = 0;
        await this.userRepo.save(user);
      });
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

  private issue(
    principal: Principal,
    mustChangePassword: boolean,
    principalResponse: PrincipalResponse,
  ): AuthTokensResponse {
    const accessToken = this.jwt.sign(principal as object);
    const refreshToken = this.jwt.sign(principal as object, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: Number(this.config.get<string>('JWT_REFRESH_TTL', '604800')),
    });
    return { accessToken, refreshToken, mustChangePassword, principal: principalResponse };
  }

  private stripJwtMeta(payload: Principal & { iat?: number; exp?: number; type?: string }): Principal {
    const { iat, exp, type, ...rest } = payload as Record<string, unknown>;
    return rest as unknown as Principal;
  }

  private toPrincipalResponse(p: Principal): PrincipalResponse {
    return p.actorType === 'admin'
      ? { actorType: 'admin', id: p.adminId, email: p.email, level: p.level }
      : { actorType: 'user', id: p.userId, email: p.email, tenantId: p.tenantId, rank: p.rank, labels: p.labels };
  }
}
