import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import {
  CONFIG_REVISION_KIND,
  ConfigRevisionKind,
  TenantAiConfigRevision,
} from './entity/tenant-ai-config-revision.entity';
import type { ScenarioOverride } from './entity/tenant-ai-config.entity';

/** The fields a revision tracks — everything that shapes how the agent speaks. */
const TRACKED = ['persona', 'rules', 'scenarioOverrides'] as const;

export interface ConfigSnapshot {
  persona: string;
  rules: string[];
  scenarioOverrides: Record<string, ScenarioOverride> | null;
}

export interface RecordRevisionMeta {
  kind: ConfigRevisionKind;
  actorUserId?: number | null;
  note?: string | null;
  proposalId?: number | null;
}

/**
 * Version history for the tenant AI config (FR-073). Mirrors
 * `KbRevisionService`: a baseline row on first write, no-op saves skipped, and
 * a failure here never blocks the save it is recording.
 */
@Injectable()
export class AiConfigRevisionService {
  private readonly logger = new Logger(AiConfigRevisionService.name);

  constructor(
    @InjectRepository(TenantAiConfigRevision)
    private readonly revRepo: Repository<TenantAiConfigRevision>,
  ) {}

  /**
   * Record a change. `before` is the config as it stood beforehand.
   *
   * On the very first recorded change this writes TWO rows — a baseline holding
   * the pre-change state, then the change itself. Otherwise the first edit
   * after this shipped would have nothing to roll back *to*.
   */
  async record(
    tenantId: number,
    after: ConfigSnapshot,
    before: ConfigSnapshot | null,
    meta: RecordRevisionMeta,
  ): Promise<TenantAiConfigRevision | null> {
    try {
      let next = await this.nextRevisionNo(tenantId);

      if (before && next === 1) {
        await this.revRepo.save(
          this.snapshot(tenantId, before, 1, CONFIG_REVISION_KIND.BASELINE, null, {
            kind: CONFIG_REVISION_KIND.BASELINE,
          }),
        );
        next = 2;
      }

      const changed = before ? this.changedFields(before, after) : [...TRACKED];
      // Opening the form and pressing save without editing should not litter
      // the history with identical versions.
      if (before && changed.length === 0) return null;

      return await this.revRepo.save(
        this.snapshot(tenantId, after, next, meta.kind, changed, meta),
      );
    } catch (e) {
      // The config write already happened; losing its history entry is bad but
      // failing the user's save because of it would be worse.
      this.logger.warn(`config revision record failed for tenant ${tenantId}: ${(e as Error).message}`);
      return null;
    }
  }

  async list(tenantId: number, limit = 30): Promise<TenantAiConfigRevision[]> {
    return this.revRepo.find({
      where: { tenantId },
      order: { revisionNo: 'DESC' },
      take: limit,
    });
  }

  async get(tenantId: number, id: number): Promise<TenantAiConfigRevision> {
    const row = await this.revRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return row;
  }

  private changedFields(before: ConfigSnapshot, after: ConfigSnapshot): string[] {
    return TRACKED.filter(
      (f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null),
    );
  }

  private snapshot(
    tenantId: number,
    cfg: ConfigSnapshot,
    revisionNo: number,
    kind: string,
    changedFields: string[] | null,
    meta: Partial<RecordRevisionMeta>,
  ): TenantAiConfigRevision {
    return this.revRepo.create({
      tenantId,
      revisionNo,
      persona: cfg.persona ?? null,
      rules: cfg.rules ?? null,
      scenarioOverrides: cfg.scenarioOverrides ?? null,
      kind,
      changedFields,
      note: meta.note?.slice(0, 500) ?? null,
      proposalId: meta.proposalId ?? null,
      actorUserId: meta.actorUserId ?? null,
    });
  }

  /**
   * max+1, never count+1 — a deleted or concurrent row would otherwise reuse a
   * number that already exists (code convention §2).
   */
  private async nextRevisionNo(tenantId: number): Promise<number> {
    const row = await this.revRepo
      .createQueryBuilder('r')
      .select('MAX(r.revision_no)', 'max')
      .where('r.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: number | null }>();
    return Number(row?.max ?? 0) + 1;
  }
}
