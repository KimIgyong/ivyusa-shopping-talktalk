import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entity/audit-log.entity';
import { getRequestContext } from '../../global/middleware/request-context.middleware';

export type AuditResult = 'success' | 'denied' | 'error';

export interface WriteAuditParams {
  tenantId?: number | null;
  /** 'system' = machine writer (webhook/scheduler/event consumer) — never a fake admin/user. */
  actorType: 'admin' | 'user' | 'system';
  actorId: number;
  action: string;
  target?: string;
  /** Overrides the request-context IP (rarely needed). */
  ip?: string | null;
  /** Overrides the request-context correlation id (rarely needed). */
  requestId?: string | null;
  /** Defaults to 'success'. */
  result?: AuditResult;
  /** Small structured context — NEVER raw PII (mask via pii.util first). */
  metadata?: Record<string, unknown> | null;
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

  /**
   * Insert an audit_logs row. IP + request id auto-fill from the per-request
   * AsyncLocalStorage context when not passed explicitly; both stay null for
   * writes outside an HTTP request (schedulers, event consumers).
   */
  async write(params: WriteAuditParams): Promise<AuditLog> {
    const ctx = getRequestContext();
    return this.logRepo.save(
      this.logRepo.create({
        tenantId: params.tenantId ?? null,
        actorType: params.actorType,
        actorId: params.actorId,
        action: params.action,
        target: params.target ?? null,
        ip: params.ip !== undefined ? params.ip : (ctx?.ip ?? null),
        requestId: params.requestId !== undefined ? params.requestId : (ctx?.requestId ?? null),
        result: params.result ?? 'success',
        metadata: params.metadata ?? null,
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
