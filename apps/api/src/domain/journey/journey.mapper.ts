import { JourneyReport } from './entity/journey-report.entity';
import { JourneyReportCriteria } from './entity/journey-report-criteria.entity';

export class JourneyMapper {
  /**
   * The body is omitted from lists on purpose — a report runs to several
   * thousand words and a group can hold dozens.
   */
  static toReport(r: JourneyReport, withBody = false) {
    return {
      id: String(r.id),
      groupId: String(r.groupId),
      kind: r.kind,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      criteriaVersion: r.criteriaVersion,
      sessionCount: r.sessionIdsJson?.length ?? 0,
      status: r.status,
      error: r.error,
      language: r.language,
      provider: r.provider,
      model: r.model,
      sourceReportIds: r.sourceReportIds?.map(String) ?? null,
      createdAt: r.createdAt,
      finishedAt: r.finishedAt,
      ...(withBody ? { bodyMd: r.bodyMd, metrics: r.metricsJson } : {}),
    };
  }

  static toReportList(rows: JourneyReport[]) {
    return rows.map((r) => this.toReport(r));
  }

  static toCriteria(c: JourneyReportCriteria) {
    return {
      id: String(c.id),
      version: c.version,
      sections: c.sectionsJson,
      topQuestionsN: c.topQuestionsN,
      sampleCap: c.sampleCap,
      quoteMaxChars: c.quoteMaxChars,
      tone: c.tone,
      banned: c.bannedJson ?? [],
      createdAt: c.createdAt,
    };
  }
}
