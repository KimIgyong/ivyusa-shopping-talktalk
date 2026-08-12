import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { AiConfigService } from '../ai-engine/ai-config.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { GoldenQuestion } from './entity/golden-question.entity';
import { GOLDEN_RUN_KIND, GoldenRun, GoldenRunItem, GoldenRunKind } from './entity/golden-run.entity';

/**
 * Per-run cap. Every question costs a retrieval (embedding) plus a completion,
 * and the embedding provider's free tier has already been rate-limited in
 * production use — so the set is bounded and run sequentially.
 */
export const GOLDEN_MAX_QUESTIONS = 20;

export interface CompareItem {
  question: string;
  base: { answer: string; confidence: number | null; citations: string[]; blocked: boolean } | null;
  target: { answer: string; confidence: number | null; citations: string[]; blocked: boolean } | null;
  confidenceDelta: number | null;
  lengthDelta: number | null;
  citationsChanged: boolean;
  textChanged: boolean;
}

/**
 * Golden-question regression (FR-073).
 *
 * Deliberately reports facts and renders no verdict. The model rewords the same
 * answer on every call, so "the text changed" is not evidence that a config
 * change worked — calling a diff a regression without knowing the natural
 * variance would just manufacture false alarms (TCR-260813 §3 O-1). The `noise`
 * run kind exists so a human can measure that variance when they need to.
 */
@Injectable()
export class GoldenService {
  private readonly logger = new Logger(GoldenService.name);

  constructor(
    @InjectRepository(GoldenQuestion) private readonly questionRepo: Repository<GoldenQuestion>,
    @InjectRepository(GoldenRun) private readonly runRepo: Repository<GoldenRun>,
    @InjectRepository(GoldenRunItem) private readonly itemRepo: Repository<GoldenRunItem>,
    private readonly aiConfig: AiConfigService,
    private readonly knowledge: KnowledgeService,
  ) {}

  // ---- question set ----

  async listQuestions(tenantId: number): Promise<GoldenQuestion[]> {
    return this.questionRepo.find({ where: { tenantId }, order: { id: 'ASC' } });
  }

  async addQuestion(
    tenantId: number,
    userId: number,
    input: { question: string; language?: string; note?: string },
  ): Promise<GoldenQuestion> {
    return this.questionRepo.save(
      this.questionRepo.create({
        tenantId,
        question: input.question.trim(),
        language: (input.language ?? 'KO').toUpperCase(),
        note: input.note?.trim() || null,
        active: 1,
        createdBy: userId,
      }),
    );
  }

  async updateQuestion(
    tenantId: number,
    id: number,
    input: { question?: string; language?: string; note?: string | null; active?: number },
  ): Promise<GoldenQuestion> {
    const row = await this.questionRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (input.question !== undefined) row.question = input.question.trim();
    if (input.language !== undefined) row.language = input.language.toUpperCase();
    if (input.note !== undefined) row.note = input.note?.trim() || null;
    if (input.active !== undefined) row.active = input.active ? 1 : 0;
    return this.questionRepo.save(row);
  }

  async removeQuestion(tenantId: number, id: number): Promise<void> {
    const row = await this.questionRepo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    await this.questionRepo.delete({ id, tenantId });
  }

  // ---- runs ----

  /**
   * Fingerprint of everything that shapes an answer's wording. Two runs sharing
   * it are measuring variance; two runs differing are measuring a change.
   */
  async configHash(tenantId: number): Promise<string> {
    const cfg = await this.aiConfig.getConfig(tenantId);
    const material = JSON.stringify({
      persona: cfg.persona,
      rules: cfg.rules,
      scenarioOverrides: cfg.scenarioOverrides ?? {},
    });
    return createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  /**
   * Ask every active question on the current config and record the answers.
   * Runs sequentially: the point is a faithful reading, and hammering the
   * embedding provider in parallel is how the free tier starts returning 429s.
   */
  async run(
    tenantId: number,
    userId: number,
    kind: GoldenRunKind,
    opts: { label?: string; proposalId?: number } = {},
  ): Promise<GoldenRun> {
    const all = await this.questionRepo.find({
      where: { tenantId, active: 1 },
      order: { id: 'ASC' },
    });
    if (!all.length) {
      throw new BusinessException(ERROR_CODE.GOLDEN_SET_EMPTY, HttpStatus.BAD_REQUEST);
    }
    const questions = all.slice(0, GOLDEN_MAX_QUESTIONS);
    const truncated = all.length > questions.length;
    if (truncated) {
      // Silent truncation would read as "we checked everything" when we did not.
      this.logger.warn(
        `golden run: tenant ${tenantId} has ${all.length} active questions; running the first ${GOLDEN_MAX_QUESTIONS}`,
      );
    }

    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId,
        kind,
        label: opts.label?.slice(0, 120) ?? null,
        proposalId: opts.proposalId ?? null,
        configHash: await this.configHash(tenantId),
        questionCount: questions.length,
        truncated: truncated ? 1 : 0,
        status: 'running',
        createdBy: userId,
      }),
    );

    for (const q of questions) {
      try {
        const res = await this.knowledge.ask(tenantId, q.question, q.language);
        await this.itemRepo.save(
          this.itemRepo.create({
            tenantId,
            runId: Number(run.id),
            questionId: Number(q.id),
            question: q.question,
            answer: res.answer,
            confidence: res.confidence ?? null,
            blocked: res.blocked ? 1 : 0,
            citations: res.sources.map((s) => ({
              id: s.id,
              title: s.title,
              similarity: s.similarity,
            })),
          }),
        );
      } catch (e) {
        // One bad question must not cost the whole run — record and continue.
        this.logger.warn(`golden run ${run.id}: question ${q.id} failed: ${(e as Error).message}`);
        await this.itemRepo.save(
          this.itemRepo.create({
            tenantId,
            runId: Number(run.id),
            questionId: Number(q.id),
            question: q.question,
            answer: '',
            confidence: null,
            blocked: 0,
            citations: null,
            error: (e as Error).message.slice(0, 300),
          }),
        );
      }
    }

    run.status = 'done';
    run.completedAt = new Date();
    return this.runRepo.save(run);
  }

  async listRuns(tenantId: number, limit = 10): Promise<GoldenRun[]> {
    return this.runRepo.find({ where: { tenantId }, order: { id: 'DESC' }, take: limit });
  }

  async getRun(tenantId: number, id: number): Promise<{ run: GoldenRun; items: GoldenRunItem[] }> {
    const run = await this.runRepo.findOne({ where: { id, tenantId } });
    if (!run) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const items = await this.itemRepo.find({ where: { tenantId, runId: id }, order: { id: 'ASC' } });
    return { run, items };
  }

  /**
   * Line up two runs question by question. Questions are matched on their text,
   * not their id, so a run still compares against one taken before the question
   * was edited or removed.
   */
  async compare(
    tenantId: number,
    baseId: number,
    targetId: number,
  ): Promise<{
    base: GoldenRun;
    target: GoldenRun;
    sameConfig: boolean;
    items: CompareItem[];
  }> {
    const [base, target] = await Promise.all([
      this.getRun(tenantId, baseId),
      this.getRun(tenantId, targetId),
    ]);

    const key = (q: string) => q.trim();
    const baseByQ = new Map(base.items.map((i) => [key(i.question), i]));
    const targetByQ = new Map(target.items.map((i) => [key(i.question), i]));
    const questions = [...new Set([...baseByQ.keys(), ...targetByQ.keys()])];

    const shape = (i: GoldenRunItem | undefined) =>
      i
        ? {
            answer: i.answer,
            confidence: i.confidence,
            citations: (i.citations ?? []).map((c) => c.title),
            blocked: !!i.blocked,
          }
        : null;

    const items: CompareItem[] = questions.map((q) => {
      const b = baseByQ.get(q);
      const t = targetByQ.get(q);
      const bs = shape(b);
      const ts = shape(t);
      return {
        question: b?.question ?? t?.question ?? q,
        base: bs,
        target: ts,
        confidenceDelta:
          bs?.confidence != null && ts?.confidence != null
            ? Number((ts.confidence - bs.confidence).toFixed(3))
            : null,
        lengthDelta: bs && ts ? ts.answer.length - bs.answer.length : null,
        citationsChanged: !!bs && !!ts && JSON.stringify(bs.citations) !== JSON.stringify(ts.citations),
        textChanged: !!bs && !!ts && bs.answer.trim() !== ts.answer.trim(),
      };
    });

    return {
      base: base.run,
      target: target.run,
      // Equal hashes mean nothing about the config changed between the runs, so
      // any difference below is the model's own variance — not an effect.
      sameConfig: base.run.configHash === target.run.configHash,
      items,
    };
  }
}
