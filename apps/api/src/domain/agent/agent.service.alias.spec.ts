import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';
import { Session } from '../session/entity/session.entity';
import { toSessionResponse } from './agent.mapper';

/**
 * Session alias (PLN-260812): what gets stored, what gets cleared, and what the
 * audit trail is allowed to carry.
 */
describe('AgentService.setSessionAlias', () => {
  function build(opts: { conversation?: Partial<Conversation> | null } = {}) {
    const conversation =
      opts.conversation === null
        ? null
        : ({ id: 5, tenantId: 1, sessionId: 90, ...opts.conversation } as Conversation);

    const updates: Array<Record<string, unknown>> = [];
    const convRepo = { findOne: jest.fn(async () => conversation) };
    const sessionRepo = {
      update: jest.fn(async (_w: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { affected: 1 };
      }),
      findOne: jest.fn(async () => ({ id: 90, sessionToken: 'tok-1' }) as Session),
    };
    const audits: Array<Record<string, unknown>> = [];
    const audit = {
      write: jest.fn(async (entry: Record<string, unknown>) => {
        audits.push(entry);
        return entry;
      }),
    };
    const redis = { del: jest.fn(async () => undefined), get: jest.fn(), set: jest.fn(), available: () => true };

    const svc = new AgentService(
      convRepo as never,
      {} as never, // msgRepo
      {} as never, // userRepo
      sessionRepo as never,
      {} as never, // profileRepo
      {} as never, // assignmentRepo
      {} as never, // statRepo
      {} as never, // moderation
      {} as never, // customerService
      {} as never, // aiGateway
      audit as never,
      redis as never,
      {} as never, // sessionService
      {} as never, // bus
      {} as never, // mailer
    );
    return { svc, updates, audits, redis, sessionRepo };
  }

  it('stores a trimmed alias and clears the session cache', async () => {
    const h = build();

    const result = await h.svc.setSessionAlias(5, 1, 7, '  강남점 사장님  ');

    expect(h.updates[0]).toEqual({ alias: '강남점 사장님' });
    expect(result).toEqual({ sessionId: '90', alias: '강남점 사장님' });
    // Stale alias for 30s otherwise — the token→session cache holds the row.
    expect(h.redis.del).toHaveBeenCalledWith('sess:tok:tok-1');
  });

  it('clears the alias when the value is blank', async () => {
    const h = build();

    const result = await h.svc.setSessionAlias(5, 1, 7, '   ');

    expect(h.updates[0]).toEqual({ alias: null });
    expect(result.alias).toBeNull();
  });

  it('truncates at the column length instead of failing the save', async () => {
    const h = build();

    await h.svc.setSessionAlias(5, 1, 7, 'x'.repeat(200));

    expect((h.updates[0].alias as string).length).toBe(60);
  });

  it('never puts the alias itself in the audit trail', async () => {
    const h = build();

    await h.svc.setSessionAlias(5, 1, 7, '홍길동');

    const entry = h.audits[0];
    expect(entry.action).toBe('agent.session.alias');
    expect(entry.metadata).toEqual({ conversationId: '5', set: true });
    // An alias can be a real person's name; the log records only that it changed.
    expect(JSON.stringify(entry)).not.toContain('홍길동');
  });

  it('rejects a conversation from another tenant', async () => {
    const h = build({ conversation: null });

    await expect(h.svc.setSessionAlias(5, 999, 7, 'nope')).rejects.toThrow();
    expect(h.sessionRepo.update).not.toHaveBeenCalled();
  });
});

describe('toSessionResponse — alias', () => {
  const conv = { id: 5, sessionId: 90, status: 'waiting', channel: 'telegram', escalated: 0 } as Conversation;

  it('carries the session id and alias for the console row', () => {
    const row = toSessionResponse(conv, null, { name: null, email: null }, '강남점 사장님');
    expect(row).toMatchObject({ sessionId: '90', alias: '강남점 사장님' });
  });

  it('leaves alias null when none is set', () => {
    expect(toSessionResponse(conv, null).alias).toBeNull();
  });
});
