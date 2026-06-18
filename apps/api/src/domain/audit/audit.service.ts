import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entity/audit-log.entity';

export interface WriteAuditParams {
  tenantId?: number | null;
  actorType: 'admin' | 'user';
  actorId: number;
  action: string;
  target?: string;
}

export interface ListAuditParams {
  tenantId: number | null; // null => all tenants (system admin)
  action?: string;
  actorType?: string;
  page: number;
  size: number;
}

/** Privileged action audit trail (FR-061). */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logRepo: Repository<AuditLog>,
  ) {}

  /** Insert an audit_logs row. */
  async write(params: WriteAuditParams): Promise<AuditLog> {
    return this.logRepo.save(
      this.logRepo.create({
        tenantId: params.tenantId ?? null,
        actorType: params.actorType,
        actorId: params.actorId,
        action: params.action,
        target: params.target ?? null,
      }),
    );
  }

  async list(params: ListAuditParams): Promise<{ items: AuditLog[]; total: number }> {
    const qb = this.logRepo.createQueryBuilder('a');
    if (params.tenantId != null) qb.andWhere('a.tenant_id = :tenantId', { tenantId: params.tenantId });
    if (params.action) qb.andWhere('a.action = :action', { action: params.action });
    if (params.actorType) qb.andWhere('a.actor_type = :actorType', { actorType: params.actorType });
    qb.orderBy('a.id', 'DESC')
      .skip((params.page - 1) * params.size)
      .take(params.size);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
