import { WIDGET_COPY_DEFAULTS } from '@ivy/types';
import type { AiConfigDefaults } from './ai-config.service';
import type { TenantAiConfigRevision } from './entity/tenant-ai-config-revision.entity';

/** Entity -> camelCase response mapping for the AI config history. */
export interface AiConfigDefaultsResponse extends AiConfigDefaults {
  widgetCopy: typeof WIDGET_COPY_DEFAULTS;
}

export class AiConfigMapper {
  /**
   * The shipped conversation copy the console renders as its starting values:
   * the service's scripts/buttons plus the widget greetings, which live in the
   * shared registry so the widget and the console cannot drift apart.
   */
  static toDefaults(defaults: AiConfigDefaults): AiConfigDefaultsResponse {
    return { ...defaults, widgetCopy: WIDGET_COPY_DEFAULTS };
  }

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
