import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JourneyReportCriteria } from './entity/journey-report-criteria.entity';

/**
 * The starting rules, taken from the feature spec (GUIDE-260825 §3).
 *
 * Seeded rather than hardcoded so a tenant can improve them — which is the
 * point of the feature — while a fresh tenant still gets something that works.
 */
export const DEFAULT_SECTIONS: Record<string, string> = {
  summary:
    'Three sentences at most: the question this report answers, the answer, and one next action.',
  contact:
    'First contact, channel mix and primary channel, conversation and message counts, average loops, handoffs.',
  questions:
    'The top questions asked and what we answered. Mark any that went unanswered or were escalated as a knowledge gap. Note repeats across sessions.',
  resolution:
    'Median resolution time. Print the counting rule verbatim, including what was excluded and why.',
  path:
    'Kotler 5A. Aware and Appeal are not observable from support logs — say so rather than estimating. Judge Advocate on advocacy language, not purchase count.',
  needs:
    'Maslow, as hypothesis only. For each layer: a quoted utterance, the hypothesis it suggests, and the condition that would disprove it.',
  actions: 'Two or three next actions, each citing the section it follows from.',
};

/** Phrases that make an unearned number look like evidence. */
export const DEFAULT_BANNED = ['관계 점수', 'relationship score', '신뢰도 점수', 'loyalty score'];

@Injectable()
export class JourneyCriteriaService {
  private readonly logger = new Logger(JourneyCriteriaService.name);

  constructor(
    @InjectRepository(JourneyReportCriteria)
    private readonly repo: Repository<JourneyReportCriteria>,
  ) {}

  /**
   * The criteria a new report is written by: the highest version this tenant
   * has, seeding v1 on first use.
   *
   * "Highest version" is the whole rule. A separate active flag would be a
   * second source of truth, and a past report pins the version it used — when
   * the two disagree there is no way to tell which one actually wrote it.
   */
  async current(tenantId: number, actorUserId = 0): Promise<JourneyReportCriteria> {
    const latest = await this.repo.findOne({
      where: { tenantId },
      order: { version: 'DESC' },
    });
    if (latest) return latest;
    return this.seed(tenantId, actorUserId);
  }

  /** A specific version — what a past report must be read with. */
  async version(tenantId: number, version: number): Promise<JourneyReportCriteria | null> {
    return this.repo.findOne({ where: { tenantId, version } });
  }

  async list(tenantId: number): Promise<JourneyReportCriteria[]> {
    return this.repo.find({ where: { tenantId }, order: { version: 'DESC' } });
  }

  /**
   * Save as a NEW version. Editing in place would rewrite the rules a past
   * report was judged by, and its conclusions would no longer be retraceable.
   */
  async save(
    tenantId: number,
    input: Partial<JourneyReportCriteria>,
    actorUserId: number,
  ): Promise<JourneyReportCriteria> {
    const current = await this.current(tenantId, actorUserId);
    const saved = await this.repo.save(
      this.repo.create({
        tenantId,
        version: current.version + 1,
        sectionsJson: input.sectionsJson ?? current.sectionsJson,
        topQuestionsN: input.topQuestionsN ?? current.topQuestionsN,
        sampleCap: input.sampleCap ?? current.sampleCap,
        quoteMaxChars: input.quoteMaxChars ?? current.quoteMaxChars,
        tone: input.tone ?? current.tone,
        bannedJson: input.bannedJson ?? current.bannedJson,
        createdBy: actorUserId,
      }),
    );
    this.logger.log(`journey criteria v${saved.version} saved (tenant ${tenantId})`);
    return saved;
  }

  private async seed(tenantId: number, actorUserId: number): Promise<JourneyReportCriteria> {
    return this.repo.save(
      this.repo.create({
        tenantId,
        version: 1,
        sectionsJson: DEFAULT_SECTIONS,
        topQuestionsN: 5,
        sampleCap: 200,
        quoteMaxChars: 200,
        tone: null,
        bannedJson: DEFAULT_BANNED,
        createdBy: actorUserId,
      }),
    );
  }
}
