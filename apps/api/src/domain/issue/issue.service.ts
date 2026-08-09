import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { SENDER_TYPE, USER_RANK } from '@ivy/types';
import { Issue, ISSUE_REJECT_REASON, ISSUE_STATUS, ISSUE_TIER } from './entity/issue.entity';
import { IssueEvent, ISSUE_EVENT_TYPE } from './entity/issue-event.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Message } from '../chat/entity/message.entity';
import { Assignment } from '../agent/entity/assignment.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { User } from '../user/entity/user.entity';
import { issueNotice } from './issue-notice';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuditService } from '../audit/audit.service';
import { EventBusService, EVENTS, MailerService } from '../../infrastructure/infrastructure.module';

/** Minimal escalation payload this service reads (decoupled from chat's type). */
interface EscalationLike {
  tenantId?: number;
  conversationId?: number;
  sessionId?: number;
  reason?: string;
  /** Deny-rule stamps (P2) — override the intent-derived type / default label. */
  issueType?: string;
  issueLabel?: string;
}

/** Actor for a console-side transition (permission checks, 결정 10). */
export interface IssueActor {
  userId: number;
  rank: string;
}

/** Allowed transitions (REQ §5.2): reopen paths bump reopen_count. */
const TRANSITIONS: Record<string, string[]> = {
  [ISSUE_STATUS.RECEIVED]: [ISSUE_STATUS.IN_PROGRESS, ISSUE_STATUS.RESOLVED, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.IN_PROGRESS]: [ISSUE_STATUS.RESOLVED, ISSUE_STATUS.REJECTED],
  [ISSUE_STATUS.RESOLVED]: [ISSUE_STATUS.CLOSED, ISSUE_STATUS.IN_PROGRESS],
  [ISSUE_STATUS.REJECTED]: [ISSUE_STATUS.CLOSED, ISSUE_STATUS.IN_PROGRESS],
  [ISSUE_STATUS.CLOSED]: [ISSUE_STATUS.IN_PROGRESS], // reopen after close
};
const REOPEN_FROM = new Set<string>([
  ISSUE_STATUS.RESOLVED,
  ISSUE_STATUS.REJECTED,
  ISSUE_STATUS.CLOSED,
]);
/** manager 이상 (결정 10): staff can only transition issues assigned to them. */
const MANAGER_RANKS = new Set<string>([USER_RANK.MASTER, USER_RANK.DIRECTOR, USER_RANK.MANAGER]);

/** intent label → issue type (REQ §6 매트릭스의 축약). */
function intentToType(intent: string | null | undefined): string {
  const v = (intent ?? '').toLowerCase();
  if (/cancel/.test(v)) return 'cancel';
  if (/refund|return|exchange/.test(v)) return 'refund';
  if (/deliver|ship|track/.test(v)) return 'delivery';
  if (/order/.test(v)) return 'order_status';
  if (/partner|affiliate|b2b/.test(v)) return 'partnership';
  return 'other';
}

/**
 * Default type → label routing (P2, 결정 4 — 기존 라벨 축; REQ §6). A deny rule's
 * explicit label wins; console-editable mapping is a later phase.
 */
const DEFAULT_LABEL_BY_TYPE: Record<string, string> = {
  cancel: 'accounting',
  refund: 'accounting',
  delivery: 'operations',
  partnership: 'operations',
  order_status: 'consult',
  other: 'consult',
};

/**
 * Issue core (PLN-260808-Issue-Workflow-P1): promotes an escalated conversation
 * to a 1:1 ticket for `workflow_mode='native'` tenants, owns the state machine +
 * timeline, and closes with the conversation. Creation rides the ESCALATION bus
 * event — one hook covers low_confidence / moderation_blocked / user_request,
 * and preview sessions never publish it. Everything here is best-effort from the
 * chat path's perspective: an issue hiccup must never break a conversation.
 */
@Injectable()
export class IssueService implements OnModuleInit {
  private readonly logger = new Logger(IssueService.name);

  constructor(
    @InjectRepository(Issue) private readonly issueRepo: Repository<Issue>,
    @InjectRepository(IssueEvent) private readonly eventRepo: Repository<IssueEvent>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(Assignment) private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly bus: EventBusService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(EVENTS.ESCALATION, async (payload: unknown) => {
      try {
        await this.openForEscalation((payload ?? {}) as EscalationLike);
      } catch (e) {
        this.logger.warn(`issue promotion failed: ${(e as Error).message}`);
      }
    });
  }

  /** True when the tenant subscribed to the native workflow add-on (§11.1). */
  private async isNative(tenantId: number): Promise<boolean> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    return tenant?.workflowMode === 'native';
  }

  /**
   * Escalation → issue (결정 1·2): create the conversation's 1:1 issue, or
   * reopen a settled one when the same conversation escalates again. Idempotent
   * under the at-least-once bus via uk_issue_conv.
   */
  async openForEscalation(payload: EscalationLike): Promise<void> {
    const { tenantId, conversationId, sessionId } = payload;
    if (!tenantId || !conversationId || !sessionId) return;
    if (!(await this.isNative(tenantId))) return;

    const existing = await this.issueRepo.findOne({ where: { conversationId } });
    if (existing) {
      if (REOPEN_FROM.has(existing.status)) {
        await this.applyTransition(existing, ISSUE_STATUS.IN_PROGRESS, {
          actorType: 'system',
          actorId: null,
          note: `re-escalated (${payload.reason ?? 'unknown'})`,
        });
      }
      return; // already open — nothing to do
    }

    const lastUser = await this.msgRepo.findOne({
      where: { conversationId, senderType: SENDER_TYPE.USER },
      order: { id: 'DESC' },
    });
    const type = payload.issueType ?? intentToType(lastUser?.intent);
    const issue = await this.insertWithSequence({
      tenantId,
      conversationId,
      sessionId,
      customerId: null,
      type,
      // Deny-rule label wins; otherwise the default type→label routing (결정 4).
      assigneeLabel: payload.issueLabel ?? DEFAULT_LABEL_BY_TYPE[type] ?? 'consult',
      status: ISSUE_STATUS.RECEIVED,
    });
    await this.record(issue, ISSUE_EVENT_TYPE.CREATED, {
      actorType: 'system',
      actorId: null,
      toStatus: ISSUE_STATUS.RECEIVED,
      note: payload.reason ?? null,
    });
    void this.notifyCustomer(issue, 'received');
    this.logger.log(
      `issue #${issue.issueNo} opened (tenant=${tenantId} conversation=${conversationId}, ${payload.reason ?? 'escalation'})`,
    );
  }

  /**
   * Agent accepted the conversation → issue moves to in_progress with the agent
   * assigned and the tier stamped to 3차 (best-effort hook from AgentService).
   */
  async onAgentAccept(conversationId: number, tenantId: number, agentId: number): Promise<void> {
    try {
      const issue = await this.issueRepo.findOne({ where: { conversationId, tenantId } });
      if (!issue) return;
      if (issue.assigneeUserId !== agentId) {
        issue.assigneeUserId = agentId;
        await this.issueRepo.save(issue);
        await this.record(issue, ISSUE_EVENT_TYPE.ASSIGNED, {
          actorType: 'agent',
          actorId: agentId,
          note: null,
        });
        await this.record(issue, ISSUE_EVENT_TYPE.TIER_ADVANCED, {
          actorType: 'system',
          actorId: null,
          note: ISSUE_TIER.AGENT,
        });
      }
      if (issue.status === ISSUE_STATUS.RECEIVED) {
        await this.applyTransition(issue, ISSUE_STATUS.IN_PROGRESS, {
          actorType: 'agent',
          actorId: agentId,
          note: null,
        });
      }
    } catch (e) {
      this.logger.warn(`issue accept hook failed: ${(e as Error).message}`);
    }
  }

  /**
   * Conversation ended (agent console or the customer's end button): a settled
   * issue closes with it; an open one stays on the worklist (best-effort hook).
   */
  async onConversationEnded(conversationId: number): Promise<void> {
    try {
      const issue = await this.issueRepo.findOne({ where: { conversationId } });
      if (!issue) return;
      if (issue.status === ISSUE_STATUS.RESOLVED || issue.status === ISSUE_STATUS.REJECTED) {
        await this.applyTransition(issue, ISSUE_STATUS.CLOSED, {
          actorType: 'system',
          actorId: null,
          note: 'conversation ended',
        });
      }
    } catch (e) {
      this.logger.warn(`issue close hook failed: ${(e as Error).message}`);
    }
  }

  /** The conversation's issue for the console thread header, or null. */
  async findByConversation(tenantId: number, conversationId: number): Promise<Issue | null> {
    return this.issueRepo.findOne({ where: { tenantId, conversationId } });
  }

  /**
   * Console transition (결정 3·10). Permission: assignee or manager+ for plain
   * transitions; reject requires manager+ AND a reason code. 4xx rejections are
   * warn-logged (dev-kit — "no error in logs ≠ request succeeded").
   */
  async transition(
    actor: IssueActor,
    tenantId: number,
    issueId: number,
    to: string,
    opts: { rejectReason?: string; note?: string } = {},
  ): Promise<Issue> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId, tenantId } });
    if (!issue) {
      this.logger.warn(`issue transition rejected: id=${issueId} not in tenant=${tenantId}`);
      throw new BusinessException(ERROR_CODE.ISSUE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const isManager = MANAGER_RANKS.has(actor.rank);
    const isAssignee = issue.assigneeUserId != null && Number(issue.assigneeUserId) === Number(actor.userId);
    if (!isManager && !isAssignee) {
      this.logger.warn(
        `issue transition forbidden: issue=${issueId} user=${actor.userId} rank=${actor.rank}`,
      );
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    if (to === ISSUE_STATUS.REJECTED) {
      if (!isManager) {
        this.logger.warn(`issue reject forbidden: issue=${issueId} user=${actor.userId} (staff)`);
        throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
      }
      const valid = Object.values(ISSUE_REJECT_REASON) as string[];
      if (!opts.rejectReason || !valid.includes(opts.rejectReason)) {
        throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
      }
    }
    const updated = await this.applyTransition(issue, to, {
      actorType: 'agent',
      actorId: actor.userId,
      note: opts.note ?? null,
      rejectReason: opts.rejectReason,
    });
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'issue.transition',
      target: `#${issue.issueNo} ${issue.status}→${to}`,
    });
    return updated;
  }

  /**
   * Transfer / reassign (P2, 결정 10: manager 이상 전용). Releases the active
   * assignment as `transferred`, creates the new active one, repoints the
   * conversation and stamps the issue — all audited.
   */
  async assign(
    actor: IssueActor,
    tenantId: number,
    issueId: number,
    targetUserId: number,
  ): Promise<Issue> {
    if (!MANAGER_RANKS.has(actor.rank)) {
      this.logger.warn(`issue assign forbidden: issue=${issueId} user=${actor.userId} rank=${actor.rank}`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    const issue = await this.issueRepo.findOne({ where: { id: issueId, tenantId } });
    if (!issue) {
      this.logger.warn(`issue assign rejected: id=${issueId} not in tenant=${tenantId}`);
      throw new BusinessException(ERROR_CODE.ISSUE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    await this.assignmentRepo.update(
      { conversationId: issue.conversationId, status: 'active' },
      { status: 'transferred', releasedAt: new Date() },
    );
    await this.assignmentRepo.save(
      this.assignmentRepo.create({
        tenantId,
        conversationId: issue.conversationId,
        agentId: targetUserId,
        assignedBy: actor.userId,
        type: 'transfer',
        status: 'active',
      }),
    );
    await this.convRepo.update({ id: issue.conversationId }, { agentId: targetUserId });
    issue.assigneeUserId = targetUserId;
    if (issue.status === ISSUE_STATUS.RECEIVED) issue.status = ISSUE_STATUS.IN_PROGRESS;
    const saved = await this.issueRepo.save(issue);
    await this.record(saved, ISSUE_EVENT_TYPE.ASSIGNED, {
      actorType: 'agent',
      actorId: actor.userId,
      note: `→ user ${targetUserId}`,
    });
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'issue.assigned',
      target: `#${saved.issueNo} → user ${targetUserId}`,
    });
    return saved;
  }

  async listEvents(tenantId: number, issueId: number): Promise<IssueEvent[]> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId, tenantId } });
    if (!issue) throw new BusinessException(ERROR_CODE.ISSUE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.eventRepo.find({ where: { issueId }, order: { id: 'ASC' } });
  }

  /* ------------------------------ internals ------------------------------ */

  private async applyTransition(
    issue: Issue,
    to: string,
    meta: { actorType: string; actorId: number | null; note: string | null; rejectReason?: string },
  ): Promise<Issue> {
    const from = issue.status;
    if (!(TRANSITIONS[from] ?? []).includes(to)) {
      throw new BusinessException(ERROR_CODE.ISSUE_TRANSITION_INVALID, HttpStatus.BAD_REQUEST);
    }
    const reopen = REOPEN_FROM.has(from) && to === ISSUE_STATUS.IN_PROGRESS;
    issue.status = to;
    if (reopen) issue.reopenCount = (issue.reopenCount ?? 0) + 1;
    if (to === ISSUE_STATUS.RESOLVED) {
      issue.resolvedAt = new Date();
      // P1 settles at tier 3 only (자동해소 티어는 후속 Phase에서 스탬프).
      issue.resolvedTier = issue.resolvedTier ?? ISSUE_TIER.AGENT;
    }
    if (to === ISSUE_STATUS.REJECTED && meta.rejectReason) issue.rejectReason = meta.rejectReason;
    if (to === ISSUE_STATUS.CLOSED) issue.closedAt = new Date();
    if (meta.note && to !== ISSUE_STATUS.CLOSED) issue.resolutionNote = meta.note;
    const saved = await this.issueRepo.save(issue);
    await this.record(saved, reopen ? ISSUE_EVENT_TYPE.REOPENED : ISSUE_EVENT_TYPE.STATUS_CHANGED, {
      actorType: meta.actorType,
      actorId: meta.actorId,
      fromStatus: from,
      toStatus: to,
      note: meta.note,
    });
    // Knowledge closed loop (P5): an agent-tier resolution is a capture
    // candidate — publish for KnowledgeGapService (module graph stays acyclic).
    if (to === ISSUE_STATUS.RESOLVED && saved.resolvedTier === ISSUE_TIER.AGENT) {
      void Promise.resolve(
        this.bus.publish(EVENTS.ISSUE_RESOLVED, {
          tenantId: saved.tenantId,
          issueId: Number(saved.id),
          issueNo: saved.issueNo,
          conversationId: Number(saved.conversationId),
        }),
      ).catch((e: Error) => this.logger.debug(`issue.resolved publish failed: ${e.message}`));
    }
    // Customer status notice (P3, REQ §5.4): every state change tells the shopper
    // where their inquiry stands — rejection wording is per reason code.
    const noticeKey = reopen
      ? 'reopened'
      : to === ISSUE_STATUS.REJECTED
        ? `rejected_${saved.rejectReason ?? 'policy_impossible'}`
        : to;
    void this.notifyCustomer(saved, noticeKey, to === ISSUE_STATUS.RESOLVED ? meta.note : null);
    return saved;
  }

  /**
   * Publish the localized notice on the existing notification bus (in-app +
   * push per customer preference — 결정 6). resolved/rejected on an email-mode
   * thread additionally reuses the off-hours mail path. Best-effort.
   */
  private async notifyCustomer(
    issue: Issue,
    key: string,
    extra?: string | null,
  ): Promise<void> {
    try {
      const session = await this.sessionRepo.findOne({ where: { id: issue.sessionId } });
      const copy = issueNotice(session?.language, key, issue.issueNo);
      if (!copy) return;
      const body = extra?.trim() ? `${copy.body}\n${extra.trim()}` : copy.body;
      await this.bus.publish(EVENTS.NOTIFICATION, {
        tenantId: issue.tenantId,
        customerId: session?.customerId ?? null,
        sessionId: issue.sessionId,
        category: 'issue',
        title: copy.title,
        body,
        channel: 'push',
      });
      if (key === 'resolved' || key.startsWith('rejected_')) {
        await this.mailIfEmailThread(issue, `${copy.title} — ${body}`);
      }
    } catch (e) {
      this.logger.debug(`issue notice skipped: ${(e as Error).message}`);
    }
  }

  /** Email-mode threads (off-hours capture) also get the notice by mail (결정 6). */
  private async mailIfEmailThread(issue: Issue, text: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id: issue.conversationId } });
    if (conv?.replyChannel !== 'email') return;
    const session = await this.sessionRepo.findOne({ where: { id: issue.sessionId } });
    if (!session?.customerId) return;
    const customer = await this.customerRepo.findOne({
      where: { id: session.customerId, tenantId: issue.tenantId },
    });
    const to = customer?.email?.trim();
    if (!to) return;
    await this.mailer.send({ to, subject: text.split('\n')[0].slice(0, 120), text });
  }

  /* ---------------- board / dashboard (P4) ---------------- */

  /**
   * Kanban board data (PLN-260809-Issue-Workflow-P4 S1): open statuses in full,
   * settled ones capped at the latest 20 per column. Names resolved in one pass.
   */
  async board(tenantId: number): Promise<{
    columns: Record<string, Issue[]>;
    names: Map<number, string>;
  }> {
    const open = await this.issueRepo.find({
      where: { tenantId, status: In([ISSUE_STATUS.RECEIVED, ISSUE_STATUS.IN_PROGRESS]) },
      order: { updatedAt: 'DESC' },
    });
    const columns: Record<string, Issue[]> = {
      [ISSUE_STATUS.RECEIVED]: open.filter((i) => i.status === ISSUE_STATUS.RECEIVED),
      [ISSUE_STATUS.IN_PROGRESS]: open.filter((i) => i.status === ISSUE_STATUS.IN_PROGRESS),
    };
    for (const status of [ISSUE_STATUS.RESOLVED, ISSUE_STATUS.REJECTED, ISSUE_STATUS.CLOSED]) {
      columns[status] = await this.issueRepo.find({
        where: { tenantId, status },
        order: { updatedAt: 'DESC' },
        take: 20,
      });
    }
    const ids = [
      ...new Set(
        Object.values(columns)
          .flat()
          .map((i) => i.assigneeUserId)
          .filter((v): v is number => v != null)
          .map(Number),
      ),
    ];
    const names = new Map<number, string>();
    if (ids.length) {
      const users = await this.userRepo.find({ where: { id: In(ids) } });
      for (const u of users) names.set(Number(u.id), u.name || u.email || `#${u.id}`);
    }
    return { columns, names };
  }

  /** Workflow KPIs for the board header (30-day window for rates/averages). */
  async stats(tenantId: number): Promise<{
    workflowMode: string;
    counts: Record<string, number>;
    unassigned: number;
    byLabel: Record<string, number>;
    avgResolutionHours: number | null;
    reopenRate: number | null;
  }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const rows = await this.issueRepo
      .createQueryBuilder('i')
      .select('i.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('i.tenant_id = :t', { t: tenantId })
      .groupBy('i.status')
      .getRawMany<{ status: string; cnt: string }>();
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = Number(r.cnt);

    const openWhere = {
      tenantId,
      status: In([ISSUE_STATUS.RECEIVED, ISSUE_STATUS.IN_PROGRESS]),
    };
    const openIssues = await this.issueRepo.find({ where: openWhere });
    const unassigned = openIssues.filter((i) => i.assigneeUserId == null).length;
    const byLabel: Record<string, number> = {};
    for (const i of openIssues) {
      const label = i.assigneeLabel ?? 'consult';
      byLabel[label] = (byLabel[label] ?? 0) + 1;
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const recent = await this.issueRepo.find({
      where: { tenantId, createdAt: MoreThan(since) },
    });
    const resolvedDurations = recent
      .filter((i) => i.resolvedAt != null)
      .map((i) => (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()) / 3_600_000);
    const avgResolutionHours = resolvedDurations.length
      ? Math.round((resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length) * 10) / 10
      : null;
    const reopenRate = recent.length
      ? Math.round((recent.filter((i) => i.reopenCount > 0).length / recent.length) * 100)
      : null;

    return {
      workflowMode: tenant?.workflowMode ?? 'base',
      counts,
      unassigned,
      byLabel,
      avgResolutionHours,
      reopenRate,
    };
  }

  /** Priority toggle (P4, 결정 5 — 2단계): assignee or manager+, audited. */
  async setPriority(
    actor: IssueActor,
    tenantId: number,
    issueId: number,
    priority: string,
  ): Promise<Issue> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId, tenantId } });
    if (!issue) {
      throw new BusinessException(ERROR_CODE.ISSUE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const isManager = MANAGER_RANKS.has(actor.rank);
    const isAssignee =
      issue.assigneeUserId != null && Number(issue.assigneeUserId) === Number(actor.userId);
    if (!isManager && !isAssignee) {
      this.logger.warn(`issue priority forbidden: issue=${issueId} user=${actor.userId}`);
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    issue.priority = priority;
    const saved = await this.issueRepo.save(issue);
    await this.record(saved, ISSUE_EVENT_TYPE.MEMO, {
      actorType: 'agent',
      actorId: actor.userId,
      note: `priority → ${priority}`,
    });
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'issue.priority',
      target: `#${saved.issueNo} ${priority}`,
    });
    return saved;
  }

  /** The session's issues for the widget inquiries feed (guest sessions included). */
  async listForSessionToken(sessionToken: string): Promise<Issue[]> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) {
      throw new BusinessException(ERROR_CODE.SESSION_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return this.issueRepo.find({
      where: { sessionId: session.id },
      order: { id: 'DESC' },
      take: 20,
    });
  }

  /** Per-tenant issue number = max+1; the unique key catches races (one retry). */
  private async insertWithSequence(seed: Partial<Issue>): Promise<Issue> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await this.issueRepo
        .createQueryBuilder('i')
        .select('MAX(i.issue_no)', 'max')
        .where('i.tenant_id = :t', { t: seed.tenantId })
        .getRawOne<{ max: number | null }>();
      const next = Number(row?.max ?? 0) + 1;
      try {
        return await this.issueRepo.save(this.issueRepo.create({ ...seed, issueNo: next }));
      } catch (e) {
        const msg = (e as Error).message ?? '';
        // uk_issue_conv: another worker just promoted the same conversation —
        // that row IS the issue we wanted.
        if (/uk_issue_conv/.test(msg)) {
          const existing = await this.issueRepo.findOne({
            where: { conversationId: seed.conversationId! },
          });
          if (existing) return existing;
        }
        if (!/uk_issue_no|Duplicate entry/i.test(msg) || attempt === 1) throw e;
      }
    }
    throw new BusinessException(ERROR_CODE.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async record(
    issue: Issue,
    type: string,
    meta: {
      actorType: string;
      actorId: number | null;
      fromStatus?: string | null;
      toStatus?: string | null;
      note: string | null;
    },
  ): Promise<void> {
    await this.eventRepo.save(
      this.eventRepo.create({
        tenantId: issue.tenantId,
        issueId: issue.id,
        actorType: meta.actorType,
        actorId: meta.actorId,
        type,
        fromStatus: meta.fromStatus ?? null,
        toStatus: meta.toStatus ?? null,
        note: meta.note,
      }),
    );
  }
}
