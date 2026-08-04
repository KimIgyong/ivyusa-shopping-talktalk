import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AiConfigService } from '../ai-engine/ai-config.service';
import { AuditService } from '../audit/audit.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import {
  CoachingProposal,
  PROPOSAL_STATUS,
  PROPOSAL_TYPE,
  ProposalPayload,
  ProposalType,
} from './entity/coaching-proposal.entity';
import { RULE_LIMITS } from './coach-context.service';

/** A proposal as parsed out of the model reply, before it is persisted. */
export interface ParsedProposal {
  type: ProposalType;
  payload: ProposalPayload;
}

const VALID_TYPES = new Set<string>(Object.values(PROPOSAL_TYPE));

/**
 * Turns coaching replies into reviewable config diffs, and applies approved
 * ones by delegating to the existing config service (FN-055 / FN-056).
 *
 * Delegation is the point: AiConfigService.upsertConfig already invalidates the
 * persona cache that every RAG turn reads. A bespoke write path here would work
 * in tests and go stale in production for up to a minute.
 */
@Injectable()
export class CoachProposalService {
  private readonly logger = new Logger(CoachProposalService.name);

  constructor(
    @InjectRepository(CoachingProposal) private readonly proposalRepo: Repository<CoachingProposal>,
    private readonly aiConfig: AiConfigService,
    private readonly audit: AuditService,
  ) {}

  // ---- parsing ----

  /**
   * Split a model reply into prose and proposals.
   *
   * Failure is deliberately silent-but-safe: a malformed block yields zero
   * proposals and the prose still shows. The gateway falls back to a stub
   * adapter on any provider error (ai-gateway.service.ts), so unparseable
   * output is an expected steady state in a keyless environment — it must not
   * surface as an error, and it must never be repaired into a guessed change.
   */
  extract(text: string): { body: string; proposals: ParsedProposal[] } {
    const fence = /```json\s*([\s\S]*?)```/gi;
    const matches = [...text.matchAll(fence)];
    if (!matches.length) return { body: text.trim(), proposals: [] };

    const last = matches[matches.length - 1];
    let parsed: unknown;
    try {
      parsed = JSON.parse(last[1]);
    } catch {
      this.logger.warn('Coach reply had an unparseable proposal block; showing prose only');
      return { body: text.replace(last[0], '').trim(), proposals: [] };
    }

    const raw = (parsed as { proposals?: unknown })?.proposals;
    const proposals = Array.isArray(raw) ? raw.flatMap((p) => this.normalize(p)) : [];
    return { body: text.replace(last[0], '').trim(), proposals };
  }

  /** Keep only well-formed proposals; drop anything we cannot apply verbatim. */
  private normalize(input: unknown): ParsedProposal[] {
    const p = input as Record<string, unknown> | null;
    if (!p || typeof p !== 'object') return [];
    const type = String(p.type ?? '');
    if (!VALID_TYPES.has(type)) return [];

    const str = (v: unknown, max: number): string | undefined => {
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s.slice(0, max) : undefined;
    };

    const payload: ProposalPayload = {
      rationale: str(p.rationale, 1000),
      conflictsWith: Array.isArray(p.conflictsWith)
        ? p.conflictsWith.filter((c): c is string => typeof c === 'string').slice(0, 5)
        : undefined,
    };

    if (type === PROPOSAL_TYPE.PERSONA_PATCH) {
      payload.persona = str(p.persona, RULE_LIMITS.MAX_PERSONA_CHARS);
      if (!payload.persona) return [];
    } else {
      payload.rule = str(p.rule, RULE_LIMITS.MAX_RULE_CHARS);
      payload.targetRule = str(p.targetRule, RULE_LIMITS.MAX_RULE_CHARS);
      if (type === PROPOSAL_TYPE.RULE_ADD && !payload.rule) return [];
      if (type === PROPOSAL_TYPE.RULE_EDIT && !(payload.rule && payload.targetRule)) return [];
      if (type === PROPOSAL_TYPE.RULE_REMOVE && !payload.targetRule) return [];
    }

    return [{ type: type as ProposalType, payload }];
  }

  // ---- applying ----

  private async find(tenantId: number, id: number): Promise<CoachingProposal> {
    const row = await this.proposalRepo.findOne({ where: { id, tenantId } });
    if (!row) {
      throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /**
   * Apply an approved proposal. `override` lets the admin edit the wording
   * before accepting — the agent drafts, the human decides the final text.
   */
  async apply(
    tenantId: number,
    userId: number,
    id: number,
    override?: { persona?: string; rule?: string },
  ): Promise<CoachingProposal> {
    const proposal = await this.find(tenantId, id);
    if (proposal.status !== PROPOSAL_STATUS.PENDING) {
      throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_NOT_PENDING, HttpStatus.CONFLICT);
    }

    const config = await this.aiConfig.getConfig(tenantId);
    const payload: ProposalPayload = { ...proposal.payload };
    if (override?.persona) payload.persona = override.persona.slice(0, RULE_LIMITS.MAX_PERSONA_CHARS);
    if (override?.rule) payload.rule = override.rule.slice(0, RULE_LIMITS.MAX_RULE_CHARS);

    if (proposal.type === PROPOSAL_TYPE.PERSONA_PATCH) {
      payload.previous = { persona: config.persona };
      await this.aiConfig.upsertConfig(tenantId, { persona: payload.persona });
    } else {
      const rules = [...config.rules];
      payload.previous = { rules: [...rules] };

      if (proposal.type === PROPOSAL_TYPE.RULE_ADD) {
        if (rules.length >= RULE_LIMITS.MAX_RULES) {
          throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
        }
        rules.push(payload.rule!);
      } else {
        // Matched by text, not index: the list may have moved since the agent
        // read it, and rewriting position N blind would edit the wrong rule.
        const idx = rules.indexOf(payload.targetRule!);
        if (idx < 0) {
          throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_STALE, HttpStatus.CONFLICT);
        }
        if (proposal.type === PROPOSAL_TYPE.RULE_EDIT) rules[idx] = payload.rule!;
        else rules.splice(idx, 1);
      }

      await this.aiConfig.upsertConfig(tenantId, { rules });
    }

    proposal.payload = payload;
    proposal.status = PROPOSAL_STATUS.APPLIED;
    proposal.appliedBy = userId;
    proposal.appliedAt = new Date();
    const saved = await this.proposalRepo.save(proposal);

    await this.supersedePeers(proposal);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: userId,
      action: 'ai_coach.proposal_applied',
      target: `proposal:${proposal.id}`,
      metadata: {
        threadId: proposal.threadId,
        type: proposal.type,
        edited: !!(override?.persona || override?.rule),
      },
    });
    return saved;
  }

  /**
   * Other pending proposals against the same target now describe a diff from a
   * config that no longer exists. Marking them superseded stops an admin from
   * applying a stale second opinion minutes later.
   */
  private async supersedePeers(applied: CoachingProposal): Promise<void> {
    const peers = await this.proposalRepo.find({
      where: {
        tenantId: applied.tenantId,
        status: PROPOSAL_STATUS.PENDING,
        id: Not(applied.id),
      },
    });
    const isPersona = applied.type === PROPOSAL_TYPE.PERSONA_PATCH;
    const target = applied.payload.targetRule;
    const stale = peers.filter((p) =>
      isPersona
        ? p.type === PROPOSAL_TYPE.PERSONA_PATCH
        : !!target && p.payload?.targetRule === target,
    );
    if (!stale.length) return;
    await this.proposalRepo.update(
      stale.map((p) => p.id),
      { status: PROPOSAL_STATUS.SUPERSEDED },
    );
  }

  async reject(tenantId: number, userId: number, id: number): Promise<CoachingProposal> {
    const proposal = await this.find(tenantId, id);
    if (proposal.status !== PROPOSAL_STATUS.PENDING) {
      throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_NOT_PENDING, HttpStatus.CONFLICT);
    }
    proposal.status = PROPOSAL_STATUS.REJECTED;
    return this.proposalRepo.save(proposal);
  }

  /**
   * Restore the value this proposal replaced. Only the immediately preceding
   * state is kept, so a revert is refused once something else has changed the
   * same target — restoring a stale snapshot would silently discard that work.
   */
  async revert(tenantId: number, userId: number, id: number): Promise<CoachingProposal> {
    const proposal = await this.find(tenantId, id);
    if (proposal.status !== PROPOSAL_STATUS.APPLIED) {
      throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_NOT_PENDING, HttpStatus.CONFLICT);
    }
    const previous = proposal.payload.previous;
    if (!previous) {
      throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_STALE, HttpStatus.CONFLICT);
    }

    const config = await this.aiConfig.getConfig(tenantId);
    if (proposal.type === PROPOSAL_TYPE.PERSONA_PATCH) {
      if (config.persona !== proposal.payload.persona) {
        throw new BusinessException(ERROR_CODE.COACH_PROPOSAL_STALE, HttpStatus.CONFLICT);
      }
      await this.aiConfig.upsertConfig(tenantId, { persona: previous.persona });
    } else {
      await this.aiConfig.upsertConfig(tenantId, { rules: previous.rules ?? [] });
    }

    proposal.status = PROPOSAL_STATUS.REVERTED;
    const saved = await this.proposalRepo.save(proposal);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: userId,
      action: 'ai_coach.proposal_reverted',
      target: `proposal:${proposal.id}`,
      metadata: { threadId: proposal.threadId, type: proposal.type },
    });
    return saved;
  }

  async listForThread(tenantId: number, threadId: number): Promise<CoachingProposal[]> {
    return this.proposalRepo.find({ where: { tenantId, threadId }, order: { id: 'ASC' } });
  }

  async persist(
    tenantId: number,
    threadId: number,
    messageId: number,
    proposals: ParsedProposal[],
  ): Promise<CoachingProposal[]> {
    if (!proposals.length) return [];
    return this.proposalRepo.save(
      proposals.map((p) =>
        this.proposalRepo.create({
          tenantId,
          threadId,
          messageId,
          type: p.type,
          payload: p.payload,
          status: PROPOSAL_STATUS.PENDING,
        }),
      ),
    );
  }
}
