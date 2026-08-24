import { BriefingService } from './briefing.service';
import { ConversationBriefing } from './entity/conversation-briefing.entity';

/**
 * On-demand briefing (REQ-260824 R3): reads never cost a model call, failures
 * surface instead of masquerading as "no briefing", and a stored translation
 * wins over a second model call.
 */
describe('BriefingService', () => {
  function build(opts: { stored?: Partial<ConversationBriefing> | null; aiText?: string; aiFails?: boolean } = {}) {
    const stored = opts.stored === undefined ? null : (opts.stored as ConversationBriefing | null);
    const saved: Partial<ConversationBriefing>[] = [];
    const briefingRepo = {
      findOne: jest.fn(async () => stored),
      create: jest.fn((v: Partial<ConversationBriefing>) => v as ConversationBriefing),
      save: jest.fn(async (v: ConversationBriefing) => {
        saved.push(v);
        return v;
      }),
    };
    const agentService = {
      findConversation: jest.fn(async () => ({ id: 5, tenantId: 1 })),
      listMessages: jest.fn(async () => ({
        messages: [
          { id: 1, senderType: 'user', body: '배송이 언제 오나요?' },
          { id: 2, senderType: 'ai', body: '확인해 드릴게요.' },
        ],
        hasMore: false,
      })),
    };
    const complete = opts.aiFails
      ? jest.fn(async () => {
          throw new Error('engine down');
        })
      : jest.fn(async () => ({ text: opts.aiText ?? '요약: 배송 문의' }));
    const aiGateway = { complete };

    const svc = new BriefingService(briefingRepo as never, agentService as never, aiGateway as never);
    return { svc, briefingRepo, agentService, aiGateway, saved };
  }

  it('latest reads the stored row and never calls the model', async () => {
    const h = build({ stored: { id: 3, body: '요약' } });

    const result = await h.svc.latest(5, 1);

    expect(result?.body).toBe('요약');
    expect(h.aiGateway.complete).not.toHaveBeenCalled();
    // Tenant ownership is checked through the conversation, up front.
    expect(h.agentService.findConversation).toHaveBeenCalledWith(5, 1);
  });

  it('generate persists the result with its coverage watermark and requester', async () => {
    const h = build();

    const row = await h.svc.generate(5, 1, 7);

    expect(row).toMatchObject({
      tenantId: 1,
      conversationId: 5,
      lastMessageId: 2,
      body: '요약: 배송 문의',
      requestedBy: 7,
    });
    expect(h.saved).toHaveLength(1);
  });

  it('generate surfaces a model failure instead of returning an empty briefing', async () => {
    const h = build({ aiFails: true });

    await expect(h.svc.generate(5, 1, 7)).rejects.toThrow();
    expect(h.saved).toHaveLength(0);
  });

  it('translate reuses a stored translation without a model call', async () => {
    const h = build({ stored: { id: 3, tenantId: 1, body: 'Summary', translations: { ko: '요약' } } });

    const row = await h.svc.translate(3, 1, 'ko');

    expect(row.translations?.ko).toBe('요약');
    expect(h.aiGateway.complete).not.toHaveBeenCalled();
  });

  it('translate stores a new translation under its language', async () => {
    const h = build({ stored: { id: 3, tenantId: 1, body: 'Summary', translations: null }, aiText: '요약' });

    const row = await h.svc.translate(3, 1, 'KO');

    expect(row.translations).toEqual({ ko: '요약' });
    expect(h.saved).toHaveLength(1);
  });

  it('rejects a language outside the system set', async () => {
    const h = build({ stored: { id: 3, tenantId: 1, body: 'Summary' } });

    await expect(h.svc.translate(3, 1, 'fr')).rejects.toThrow();
    expect(h.aiGateway.complete).not.toHaveBeenCalled();
  });
});
