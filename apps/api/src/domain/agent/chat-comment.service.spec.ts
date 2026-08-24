import { ChatCommentService } from './chat-comment.service';
import { ChatComment } from './entity/chat-comment.entity';
import { Conversation } from '../chat/entity/conversation.entity';

/**
 * Internal comments (REQ-260824 R4): scope routing, tenant fencing, and the
 * author-only / author-or-master permission split.
 */
describe('ChatCommentService', () => {
  function build(opts: { conversation?: Partial<Conversation> | null; rows?: Partial<ChatComment>[] } = {}) {
    const conversation =
      opts.conversation === null
        ? null
        : ({ id: 5, tenantId: 1, sessionId: 90, ...opts.conversation } as Conversation);
    const rows = (opts.rows ?? []) as ChatComment[];

    const finds: Array<Record<string, unknown>> = [];
    const saved: Partial<ChatComment>[] = [];
    const deleted: unknown[] = [];
    const commentRepo = {
      find: jest.fn(async (q: Record<string, unknown>) => {
        finds.push(q);
        return rows;
      }),
      findOne: jest.fn(
        async (q: { where: { id: number; tenantId: number } }) =>
          rows.find((r) => r.id === q.where.id && r.tenantId === q.where.tenantId) ?? null,
      ),
      create: jest.fn((v: Partial<ChatComment>) => v as ChatComment),
      save: jest.fn(async (v: ChatComment) => {
        saved.push(v);
        return v;
      }),
      delete: jest.fn(async (w: unknown) => {
        deleted.push(w);
        return { affected: 1 };
      }),
    };
    const convRepo = {
      findOne: jest.fn(async (q: { where: { id: number; tenantId: number } }) =>
        conversation && conversation.id === q.where.id && conversation.tenantId === q.where.tenantId
          ? conversation
          : null,
      ),
    };
    const userRepo = { find: jest.fn(async () => [{ id: 7, name: '김상담' }]) };

    const svc = new ChatCommentService(commentRepo as never, convRepo as never, userRepo as never);
    return { svc, commentRepo, finds, saved, deleted };
  }

  it('lists both scopes fenced to the tenant: this thread + its session', async () => {
    const h = build();

    await h.svc.listFor(5, 1);

    const where = h.finds[0].where as Array<Record<string, unknown>>;
    expect(where).toEqual([
      { tenantId: 1, scope: 'conversation', conversationId: 5 },
      { tenantId: 1, scope: 'session', sessionId: 90 },
    ]);
  });

  it("refuses another tenant's conversation before touching comments", async () => {
    const h = build();

    await expect(h.svc.listFor(5, 999)).rejects.toThrow();
    expect(h.commentRepo.find).not.toHaveBeenCalled();
  });

  it('stores a session-scoped note against the session, not the thread', async () => {
    const h = build();

    await h.svc.create(5, 1, 7, 'session', '  단골 고객 — 응대 톤 주의  ');

    expect(h.saved[0]).toMatchObject({
      tenantId: 1,
      scope: 'session',
      conversationId: null,
      sessionId: 90,
      authorId: 7,
      body: '단골 고객 — 응대 톤 주의',
    });
  });

  it('stores a conversation-scoped note against the thread only', async () => {
    const h = build();

    await h.svc.create(5, 1, 7, 'conversation', '반품 사진 재요청함');

    expect(h.saved[0]).toMatchObject({ conversationId: 5, sessionId: null });
  });

  it("refuses editing someone else's comment", async () => {
    const h = build({ rows: [{ id: 10, tenantId: 1, authorId: 8, body: 'x' }] });

    await expect(h.svc.update(10, 1, 7, 'edited')).rejects.toThrow();
    expect(h.saved).toHaveLength(0);
  });

  it("lets a master delete someone else's comment, but not a staff member", async () => {
    const h = build({ rows: [{ id: 10, tenantId: 1, authorId: 8, body: 'x' }] });

    await expect(h.svc.remove(10, 1, 7, false)).rejects.toThrow();
    await h.svc.remove(10, 1, 7, true);
    expect(h.deleted).toHaveLength(1);
  });

  it("treats another tenant's comment id as not found", async () => {
    const h = build({ rows: [{ id: 10, tenantId: 2, authorId: 7, body: 'x' }] });

    await expect(h.svc.update(10, 1, 7, 'edited')).rejects.toThrow();
  });
});
