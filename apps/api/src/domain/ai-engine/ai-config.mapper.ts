import type { TenantAiConfigRevision } from './entity/tenant-ai-config-revision.entity';

/** Entity -> camelCase response mapping for the AI config history. */
export class AiConfigMapper {
  /**
   * List row. The content is deliberately left out: a persona is long, and the
   * list is for choosing which version to look at, not for reading them all.
   */
  static toRevisionSummary(r: TenantAiConfigRevision) {
    return {
      id: Number(r.id),
      revisionNo: r.revisionNo,
      kind: r.kind,
      changedFields: r.changedFields ?? [],
      note: r.note,
      proposalId: r.proposalId ? Number(r.proposalId) : null,
      actorUserId: r.actorUserId ? Number(r.actorUserId) : null,
      createdAt: r.createdAt,
    };
  }

  static toRevision(r: TenantAiConfigRevision) {
    return {
      ...AiConfigMapper.toRevisionSummary(r),
      persona: r.persona,
      rules: r.rules ?? [],
      scenarioOverrides: r.scenarioOverrides ?? {},
    };
  }
}
