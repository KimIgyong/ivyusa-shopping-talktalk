import { Repository } from 'typeorm';
import { IssueService } from './issue.service';
import { Issue, ISSUE_STATUS } from './entity/issue.entity';
import { IssueEvent } from './entity/issue-event.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Message } from '../chat/entity/message.entity';
import { BusinessException } from '../../global/exception/business.exception';

/**
 * Issue core P1 (PLN-260808-Issue-Workflow-P1): entitlement gating, escalation
 * promotion (1:1 + reopen), state machine and the 결정 3·10 permission rules.
 */
describe('IssueService', () => {
  function build(opts: {
    mode?: string;
    existing?: Partial<Issue> | null;
    maxNo?: number;
    lastIntent?: string | null;
  }) {
    let saved: Partial<Issue> | null = null;
    const events: Array<Partial<IssueEvent>> = [];
    const issueRepo = {
      findOne: jest.fn(async () => (opts.existing === undefined ? null : opts.existing)),
      save: jest.fn(async (e: Issue) => {
        saved = { id: 101, ...e };
        return saved as Issue;
      }),
      create: (e: Partial<Issue>) => e as Issue,
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({ max: opts.maxNo ?? 0 })),
      })),
    } as unknown as Repository<Issue>;
    const eventRepo = {
      save: jest.fn(async (e: IssueEvent) => {
        events.push(e);
        return e;
      }),
      create: (e: Partial<IssueEvent>) => e as IssueEvent,
      find: jest.fn(async () => events),
    } as unknown as Repository<IssueEvent>;
    const tenantRepo = {
      findOne: jest.fn(async () => ({ id: 1, workflowMode: opts.mode ?? 'native' }) as Tenant),
    } as unknown as Repository<Tenant>;
    const msgRepo = {
      findOne: jest.fn(async () =>
        opts.lastIntent === undefined ? null : ({ intent: opts.lastIntent } as Message),
      ),
    } as unknown as Repository<Message>;
    const bus = { subscribe: jest.fn(), publish: jest.fn() } as never;
    const audit = { write: jest.fn(async () => undefined) } as never;
    const assignmentRepo = {
      update: jest.fn(),
      save: jest.fn(async (e: unknown) => e),
      create: (e: unknown) => e,
    };
    const convRepo = { update: jest.fn(), findOne: jest.fn(async () => null) };
    const sessionRepo = {
      findOne: jest.fn(async () => ({ id: 5, language: 'KO', customerId: null })),
    };
    const customerRepo = { findOne: jest.fn(async () => null) };
    const userRepo = { find: jest.fn(async () => []) };
    const mailer = { send: jest.fn(async () => true) };
    const svc = new IssueService(
      issueRepo,
      eventRepo,
      tenantRepo,
      msgRepo,
      assignmentRepo as never,
      convRepo as never,
      sessionRepo as never,
      customerRepo as never,
      userRepo as never,
      bus,
      audit,
      mailer as never,
    );
    return {
      svc,
      issueRepo,
      eventRepo,
      events,
      assignmentRepo,
      convRepo,
      bus: bus as unknown as { publish: jest.Mock },
      getSaved: () => saved,
    };
  }

  const payload = { tenantId: 1, conversationId: 7, sessionId: 5, reason: 'low_confidence' };

  describe('openForEscalation (결정 1·2 + entitlement)', () => {
    it('creates a received issue with per-tenant number and intent-mapped type', async () => {
      const { svc, getSaved, events } = build({ existing: null, maxNo: 36, lastIntent: 'refund_inquiry' });
      await svc.openForEscalation(payload);
      expect(getSaved()).toMatchObject({ issueNo: 37, type: 'refund', status: 'received' });
      expect(events[0]).toMatchObject({ type: 'created', toStatus: 'received' });
    });

    it('does nothing for a non-native tenant (server-side entitlement, §11.1)', async () => {
      const { svc, getSaved } = build({ mode: 'bridge', existing: null });
      await svc.openForEscalation(payload);
      expect(getSaved()).toBeNull();
    });

    it('reuses the open 1:1 issue instead of creating a second one', async () => {
      const { svc, getSaved } = build({ existing: { id: 9, status: ISSUE_STATUS.IN_PROGRESS } });
      await svc.openForEscalation(payload);
      expect(getSaved()).toBeNull(); // no new row, no transition
    });

    it('re-escalation reopens a settled issue (reopen_count++)', async () => {
      const { svc, getSaved, events } = build({
        existing: { id: 9, tenantId: 1, status: ISSUE_STATUS.RESOLVED, reopenCount: 0 },
      });
      await svc.openForEscalation(payload);
      expect(getSaved()).toMatchObject({ status: 'in_progress', reopenCount: 1 });
      expect(events[0]).toMatchObject({ type: 'reopened' });
    });

    // P2 (결정 4): deny-rule stamps win; otherwise default type→label routing.
    it('stamps deny-rule type/label when present, else the default label map', async () => {
      const { svc, getSaved } = build({ existing: null, maxNo: 0, lastIntent: 'greeting' });
      await svc.openForEscalation({ ...payload, issueType: 'refund', issueLabel: 'accounting' });
      expect(getSaved()).toMatchObject({ type: 'refund', assigneeLabel: 'accounting' });

      const { svc: svc2, getSaved: saved2 } = build({
        existing: null,
        maxNo: 0,
        lastIntent: 'delivery_tracking',
      });
      await svc2.openForEscalation(payload);
      expect(saved2()).toMatchObject({ type: 'delivery', assigneeLabel: 'operations' });
    });
  });

  // P2: transfer/reassign — manager-only, releases the active assignment.
  describe('assign (P2, 결정 10)', () => {
    const issue = (): Partial<Issue> => ({
      id: 9,
      tenantId: 1,
      issueNo: 37,
      conversationId: 7,
      status: ISSUE_STATUS.RECEIVED,
      assigneeUserId: 20,
      reopenCount: 0,
    });

    it('manager transfers: old assignment released as transferred, new active, issue restamped', async () => {
      const { svc, getSaved, assignmentRepo, convRepo } = build({ existing: issue() });
      await svc.assign({ userId: 99, rank: 'manager' }, 1, 9, 31);
      expect(assignmentRepo.update).toHaveBeenCalledWith(
        { conversationId: 7, status: 'active' },
        expect.objectContaining({ status: 'transferred' }),
      );
      expect(assignmentRepo.save).toHaveBeenCalled();
      expect(convRepo.update).toHaveBeenCalledWith({ id: 7 }, { agentId: 31 });
      expect(getSaved()).toMatchObject({ assigneeUserId: 31, status: 'in_progress' });
    });

    it('staff cannot transfer', async () => {
      const { svc } = build({ existing: issue() });
      await expect(svc.assign({ userId: 20, rank: 'staff' }, 1, 9, 31)).rejects.toBeInstanceOf(
        BusinessException,
      );
    });
  });

  describe('transition (결정 3·10)', () => {
    const openIssue = (): Partial<Issue> => ({
      id: 9,
      tenantId: 1,
      issueNo: 37,
      status: ISSUE_STATUS.IN_PROGRESS,
      assigneeUserId: 20,
      reopenCount: 0,
    });

    it('assignee (staff) may resolve their own issue', async () => {
      const { svc, getSaved } = build({ existing: openIssue() });
      await svc.transition({ userId: 20, rank: 'staff' }, 1, 9, ISSUE_STATUS.RESOLVED);
      expect(getSaved()).toMatchObject({ status: 'resolved', resolvedTier: 'agent' });
    });

    it('a non-assignee staff is forbidden; a manager may transition', async () => {
      const { svc } = build({ existing: openIssue() });
      await expect(
        svc.transition({ userId: 99, rank: 'staff' }, 1, 9, ISSUE_STATUS.RESOLVED),
      ).rejects.toBeInstanceOf(BusinessException);
      const { svc: svc2, getSaved } = build({ existing: openIssue() });
      await svc2.transition({ userId: 99, rank: 'manager' }, 1, 9, ISSUE_STATUS.RESOLVED);
      expect(getSaved()).toMatchObject({ status: 'resolved' });
    });

    it('reject requires manager rank AND a valid reason code', async () => {
      const { svc } = build({ existing: openIssue() });
      await expect(
        svc.transition({ userId: 20, rank: 'staff' }, 1, 9, ISSUE_STATUS.REJECTED, {
          rejectReason: 'spam',
        }),
      ).rejects.toBeInstanceOf(BusinessException); // staff, even as assignee
      const { svc: svc2 } = build({ existing: openIssue() });
      await expect(
        svc2.transition({ userId: 99, rank: 'manager' }, 1, 9, ISSUE_STATUS.REJECTED, {}),
      ).rejects.toBeInstanceOf(BusinessException); // reason missing
      const { svc: svc3, getSaved } = build({ existing: openIssue() });
      await svc3.transition({ userId: 99, rank: 'manager' }, 1, 9, ISSUE_STATUS.REJECTED, {
        rejectReason: 'policy_impossible',
      });
      expect(getSaved()).toMatchObject({ status: 'rejected', rejectReason: 'policy_impossible' });
    });

    it('blocks a transition outside the state machine', async () => {
      const { svc } = build({ existing: { ...openIssue(), status: ISSUE_STATUS.CLOSED } });
      await expect(
        svc.transition({ userId: 99, rank: 'manager' }, 1, 9, ISSUE_STATUS.RESOLVED),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });


  // P3: customer status notices ride the existing notification bus.
  describe('status notices (P3)', () => {
    it('publishes a localized notice on creation and on transition', async () => {
      const { svc, bus } = build({ existing: null, maxNo: 0, lastIntent: 'refund_inquiry' });
      await svc.openForEscalation(payload);
      await new Promise((r) => setImmediate(r)); // fire-and-forget notice
      expect(bus.publish).toHaveBeenCalledWith(
        expect.stringContaining('notification'),
        expect.objectContaining({ category: 'issue', sessionId: 5, channel: 'push' }),
      );
      const first = (bus.publish as jest.Mock).mock.calls[0][1] as { body: string };
      expect(first.body).toContain('#1'); // KO received notice with issue number
    });

    it('rejection notice uses the reason-specific wording', async () => {
      const { svc, bus } = build({
        existing: {
          id: 9, tenantId: 1, issueNo: 37, sessionId: 5,
          status: ISSUE_STATUS.IN_PROGRESS, assigneeUserId: 20, reopenCount: 0,
        },
      });
      await svc.transition({ userId: 99, rank: 'manager' }, 1, 9, ISSUE_STATUS.REJECTED, {
        rejectReason: 'policy_impossible',
      });
      await new Promise((r) => setImmediate(r));
      const call = (bus.publish as jest.Mock).mock.calls.find(
        (c) => (c[1] as { category?: string }).category === 'issue',
      );
      expect((call?.[1] as { body: string }).body).toContain('정책상');
    });
  });

  describe('onConversationEnded', () => {
    it('closes a resolved issue with the conversation; leaves an open one alone', async () => {
      const { svc, getSaved } = build({
        existing: { id: 9, tenantId: 1, status: ISSUE_STATUS.RESOLVED, reopenCount: 0 },
      });
      await svc.onConversationEnded(7);
      expect(getSaved()).toMatchObject({ status: 'closed' });

      const { svc: svc2, getSaved: saved2 } = build({
        existing: { id: 9, tenantId: 1, status: ISSUE_STATUS.IN_PROGRESS },
      });
      await svc2.onConversationEnded(7);
      expect(saved2()).toBeNull();
    });
  });
});
