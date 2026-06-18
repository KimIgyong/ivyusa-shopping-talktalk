import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { generateToken } from '@ivy/common';
import { User } from './entity/user.entity';
import { JobLabel } from './entity/job-label.entity';
import { UserJobLabel } from './entity/user-job-label.entity';
import { Invitation } from './entity/invitation.entity';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import {
  InviteUserResponse,
  JobLabelMapper,
  JobLabelResponse,
  UserMapper,
  UserResponse,
} from './dto/response/user.response';

const TEMP_PASSWORD = 'amb2026!@';
const BCRYPT_ROUNDS = 10;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Tenant user / staff management (FR-052, FR-055, FR-063). Invitations,
 * rank/label/status adjustments and editable job labels — all tenant-scoped.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(JobLabel) private readonly labelRepo: Repository<JobLabel>,
    @InjectRepository(UserJobLabel) private readonly userLabelRepo: Repository<UserJobLabel>,
    @InjectRepository(Invitation) private readonly invitationRepo: Repository<Invitation>,
  ) {}

  // ---- Users ----

  async listUsers(
    tenantId: number,
    page: number,
    size: number,
  ): Promise<{ items: UserResponse[]; total: number }> {
    const [users, total] = await this.userRepo.findAndCount({
      where: { tenantId },
      order: { id: 'ASC' },
      skip: (page - 1) * size,
      take: size,
    });

    const labelsByUser = await this.loadLabelCodes(users.map((u) => u.id));
    const items = users.map((u) => UserMapper.toResponse(u, labelsByUser.get(u.id) ?? []));
    return { items, total };
  }

  async invite(
    tenantId: number,
    invitedBy: number,
    email: string,
    rank: string,
    labelCodes: string[] = [],
  ): Promise<InviteUserResponse> {
    const existing = await this.userRepo.findOne({ where: { tenantId, email } });
    if (existing) {
      throw new BusinessException(ERROR_CODE.EMAIL_TAKEN, HttpStatus.CONFLICT);
    }

    const now = new Date();
    const tempPasswordHash = await bcrypt.hash(TEMP_PASSWORD, BCRYPT_ROUNDS);

    const user = await this.userRepo.save(
      this.userRepo.create({
        tenantId,
        email,
        passwordHash: tempPasswordHash,
        rank,
        status: 'invited',
        mustChangePassword: 1,
        invitedAt: now,
      }),
    );

    const token = generateToken();
    await this.invitationRepo.save(
      this.invitationRepo.create({
        tenantId,
        email,
        rank,
        token,
        tempPasswordHash,
        status: 'pending',
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
        createdBy: invitedBy,
      }),
    );

    await this.assignLabels(tenantId, user.id, labelCodes);

    return { invitationToken: token, tempPassword: TEMP_PASSWORD, userId: user.id };
  }

  async acceptInvite(token: string, newPassword: string): Promise<{ accepted: true }> {
    const invitation = await this.invitationRepo.findOne({ where: { token } });
    if (
      !invitation ||
      invitation.status !== 'pending' ||
      !invitation.expiresAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new BusinessException(ERROR_CODE.INVITATION_INVALID, HttpStatus.BAD_REQUEST);
    }

    const user = await this.userRepo.findOne({
      where: { tenantId: invitation.tenantId, email: invitation.email },
    });
    if (!user) {
      throw new BusinessException(ERROR_CODE.INVITATION_INVALID, HttpStatus.BAD_REQUEST);
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.status = 'active';
    user.mustChangePassword = 0;
    await this.userRepo.save(user);

    invitation.status = 'accepted';
    await this.invitationRepo.save(invitation);

    return { accepted: true };
  }

  async updateRank(tenantId: number, userId: number, rank: string): Promise<UserResponse> {
    const user = await this.getTenantUser(tenantId, userId);
    user.rank = rank;
    await this.userRepo.save(user);
    return this.toResponseWithLabels(user);
  }

  async updateLabels(
    tenantId: number,
    userId: number,
    labelCodes: string[],
  ): Promise<UserResponse> {
    const user = await this.getTenantUser(tenantId, userId);
    await this.userLabelRepo.delete({ userId: user.id });
    await this.assignLabels(tenantId, user.id, labelCodes);
    return this.toResponseWithLabels(user);
  }

  async updateStatus(tenantId: number, userId: number, status: string): Promise<UserResponse> {
    const user = await this.getTenantUser(tenantId, userId);
    user.status = status;
    await this.userRepo.save(user);
    return this.toResponseWithLabels(user);
  }

  // ---- Job labels ----

  async listLabels(tenantId: number): Promise<JobLabelResponse[]> {
    const labels = await this.labelRepo.find({ where: { tenantId }, order: { id: 'ASC' } });
    return labels.map((l) => JobLabelMapper.toResponse(l));
  }

  async createLabel(tenantId: number, code: string, name: string): Promise<JobLabelResponse> {
    const existing = await this.labelRepo.findOne({ where: { tenantId, code } });
    if (existing) {
      throw new BusinessException(ERROR_CODE.DUPLICATE_RESOURCE, HttpStatus.CONFLICT);
    }
    const label = await this.labelRepo.save(this.labelRepo.create({ tenantId, code, name }));
    return JobLabelMapper.toResponse(label);
  }

  async updateLabel(tenantId: number, id: number, name: string): Promise<JobLabelResponse> {
    const label = await this.labelRepo.findOne({ where: { id, tenantId } });
    if (!label) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    label.name = name;
    await this.labelRepo.save(label);
    return JobLabelMapper.toResponse(label);
  }

  // ---- helpers ----

  private async getTenantUser(tenantId: number, userId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(ERROR_CODE.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (user.tenantId !== tenantId) {
      throw new BusinessException(ERROR_CODE.TENANT_MISMATCH, HttpStatus.FORBIDDEN);
    }
    return user;
  }

  /** Create user_job_labels for the tenant's job_labels matching the given codes. */
  private async assignLabels(tenantId: number, userId: number, codes: string[]): Promise<void> {
    if (!codes.length) return;
    const labels = await this.labelRepo.find({ where: { tenantId, code: In(codes) } });
    if (!labels.length) return;
    const links = labels.map((l) => this.userLabelRepo.create({ userId, jobLabelId: l.id }));
    await this.userLabelRepo.save(links);
  }

  private async toResponseWithLabels(user: User): Promise<UserResponse> {
    const labelsByUser = await this.loadLabelCodes([user.id]);
    return UserMapper.toResponse(user, labelsByUser.get(user.id) ?? []);
  }

  /** Map userId -> label codes (join user_job_labels + job_labels). */
  private async loadLabelCodes(userIds: number[]): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();
    if (!userIds.length) return result;

    const links = await this.userLabelRepo.find({ where: { userId: In(userIds) } });
    if (!links.length) return result;

    const labelIds = [...new Set(links.map((l) => l.jobLabelId))];
    const labels = await this.labelRepo.find({ where: { id: In(labelIds) } });
    const codeById = new Map(labels.map((l) => [l.id, l.code]));

    for (const link of links) {
      const code = codeById.get(link.jobLabelId);
      if (!code) continue;
      const list = result.get(link.userId) ?? [];
      list.push(code);
      result.set(link.userId, list);
    }
    return result;
  }
}
