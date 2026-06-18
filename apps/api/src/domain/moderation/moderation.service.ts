import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AI_FUNCTION, MODERATION_ACTION, MODERATION_DECISION, ModerationDecision } from '@ivy/types';
import { truncate } from '@ivy/common';
import { ContentFilterRule } from './entity/content-filter-rule.entity';
import { ModerationLog } from './entity/moderation-log.entity';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';

export interface ModerateInput {
  tenantId: number;
  scope: 'ai' | 'agent';
  authorType: 'ai' | 'agent';
  authorId?: number | null;
  conversationId?: number | null;
  text: string;
}

export interface ModerateResult {
  decision: ModerationDecision;
  action: string;
  text: string; // possibly masked/rephrased; empty when blocked
  ruleId?: number;
}

/**
 * Outbound response moderation gate (FR-069 / POL-020 / NFR-013). Mandatory and
 * non-bypassable for every AI and agent outbound message. Combines word/phrase/
 * regex rules with an optional LLM context classifier. Fail-safe: on ANY error
 * the message is BLOCKED (never delivered unfiltered).
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectRepository(ContentFilterRule) private readonly ruleRepo: Repository<ContentFilterRule>,
    @InjectRepository(ModerationLog) private readonly logRepo: Repository<ModerationLog>,
    private readonly ai: AiGatewayService,
  ) {}

  async moderate(input: ModerateInput): Promise<ModerateResult> {
    try {
      const rules = await this.ruleRepo.find({
        where: [
          { tenantId: input.tenantId, scope: input.scope, isActive: 1 },
          { tenantId: input.tenantId, scope: 'both', isActive: 1 },
        ],
      });

      let working = input.text;
      for (const rule of rules) {
        const hit = this.matches(rule, working);
        if (!hit) continue;
        const action = rule.action;
        if (action === MODERATION_ACTION.BLOCK || action === MODERATION_ACTION.WARN) {
          return this.finalize(input, MODERATION_DECISION.BLOCKED, action, '', rule.id);
        }
        if (action === MODERATION_ACTION.MASK) {
          working = this.mask(rule, working);
        }
        if (action === MODERATION_ACTION.REPHRASE) {
          working = await this.rephrase(input.tenantId, working);
          return this.finalize(input, MODERATION_DECISION.EDITED, action, working, rule.id);
        }
      }

      // Context classifier (LLM) — only if a context-type rule exists.
      if (rules.some((r) => r.type === 'context')) {
        const flagged = await this.contextFlagged(input.tenantId, working);
        if (flagged) return this.finalize(input, MODERATION_DECISION.BLOCKED, 'block', '');
      }

      const decision = working === input.text ? MODERATION_DECISION.DELIVERED : MODERATION_DECISION.EDITED;
      return this.finalize(input, decision, decision === MODERATION_DECISION.EDITED ? 'mask' : 'pass', working);
    } catch (e) {
      this.logger.error(`Moderation failed, blocking (fail-safe): ${(e as Error).message}`);
      return this.finalize(input, MODERATION_DECISION.BLOCKED, 'block', '');
    }
  }

  private matches(rule: ContentFilterRule, text: string): boolean {
    const t = text.toLowerCase();
    if (rule.type === 'word' || rule.type === 'phrase') {
      return t.includes(rule.patternOrPrompt.toLowerCase());
    }
    if (rule.type === 'regex') {
      try {
        return new RegExp(rule.patternOrPrompt, 'i').test(text);
      } catch {
        return false;
      }
    }
    return false; // context handled separately
  }

  private mask(rule: ContentFilterRule, text: string): string {
    if (rule.type === 'regex') {
      try {
        return text.replace(new RegExp(rule.patternOrPrompt, 'gi'), '▇▇▇');
      } catch {
        return text;
      }
    }
    return text.replace(new RegExp(this.escape(rule.patternOrPrompt), 'gi'), '▇▇▇');
  }

  private escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async rephrase(tenantId: number, text: string): Promise<string> {
    const res = await this.ai.complete({
      tenantId,
      function: AI_FUNCTION.MODERATION,
      system: 'Rephrase the assistant message to be polite and policy-compliant. Keep meaning.',
      messages: [{ role: 'user', content: text }],
    });
    return res.text || text;
  }

  private async contextFlagged(tenantId: number, text: string): Promise<boolean> {
    const res = await this.ai.complete({
      tenantId,
      function: AI_FUNCTION.MODERATION,
      system:
        'JSON_MODE:moderation. Decide if the message violates safety/policy. Return {"flagged":boolean,"reason":string}.',
      messages: [{ role: 'user', content: text }],
    });
    try {
      return JSON.parse(res.text).flagged === true;
    } catch {
      return false;
    }
  }

  private async finalize(
    input: ModerateInput,
    decision: ModerationDecision,
    action: string,
    text: string,
    ruleId?: number,
  ): Promise<ModerateResult> {
    await this.logRepo
      .save(
        this.logRepo.create({
          tenantId: input.tenantId,
          conversationId: input.conversationId ?? null,
          authorType: input.authorType,
          authorId: input.authorId ?? null,
          excerpt: truncate(input.text, 512),
          ruleId: ruleId ?? null,
          action,
          decision,
        }),
      )
      .catch(() => undefined);
    return { decision, action, text, ruleId };
  }
}
