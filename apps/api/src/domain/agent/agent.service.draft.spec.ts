import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';
import { ReplyDraft } from '../chat/entity/reply-draft.entity';

/**
 * Draft approval (PLN-260812 S4). Approving must go out through the ordinary
 * agent reply — that is where moderation, duplicate suppression and the channel
 * outbox already live.
 */
describe('AgentService — draft approval', () => {
  function build(draft?: Partial<ReplyDraft> | null) {
    const updates: Array<Record<string, unknown>> = [];
    const draftRepo = {
      findOne: jest.fn(async () =>
        draft === null ? null : ({ id: 11, conversationId: 5, body: 'proposed answer', ...draft } as ReplyDraft),
      ),
      update: jest.fn(async (_w: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { affected: 1 };
      }),
    };
    const convRepo = {
      findOne: jest.fn(async () => ({ id: 5, tenantId: 1, sessionId: 90 }) as Conversation),
    };
    const audit = { write: jest.fn(async () => undefined) };

    const svc = new AgentService(
      convRepo as never,
      {} as never, // msgRepo
      {} as never, // userRepo
      {} as never, // sessionRepo
      {} as never, // profileRepo
      {} as never, // assignmentRepo
      {} as never, // statRepo
      {} as never, // moderation
      {} as never, // customerService
      {} as never, // aiGateway
      audit as never,
      { del: jest.fn(), get: jest.fn(), set: jest.fn(), available: () => false } as never,
      {} as never, // sessionService
      {} as never, // bus
      {} as never, // mailer
      undefined, // answerReuse
      undefined, // issueService
      undefined, // aiConfigRepo
      undefined, // threadRepo
      undefined, // channelRepo
      draftRepo as never,
    );
    // The reply path itself is covered by its own suite; here we only care that
    // approval routes through it rather than inventing a second sender.
    const sendMessage = jest.spyOn(svc, 'sendMessage').mockResolvedValue({ id: 999 } as never);
    return { svc, sendMessage, updates, draftRepo };
  }

  it('sends the draft as the agent reply and marks it sent', async () => {
    const h = build();

    const result = await h.svc.approveDraft(5, 1, 7);

    expect(h.sendMessage).toHaveBeenCalledWith(5, 7, 1, 'proposed answer');
    expect(h.updates[0]).toMatchObject({ status: 'sent', resolvedBy: 7 });
    expect(result).toEqual({ approved: true });
  });

  it('sends the agent edit when they changed the wording', async () => {
    const h = build();

    await h.svc.approveDraft(5, 1, 7, '  재고 있습니다. 오늘 출고돼요.  ');

    expect(h.sendMessage).toHaveBeenCalledWith(5, 7, 1, '재고 있습니다. 오늘 출고돼요.');
  });

  it('refuses to send an empty edit', async () => {
    const h = build();

    await expect(h.svc.approveDraft(5, 1, 7, '   ')).rejects.toThrow();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('discards without sending anything', async () => {
    const h = build();

    const result = await h.svc.discardDraft(5, 1, 7);

    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.updates[0]).toMatchObject({ status: 'discarded', resolvedBy: 7 });
    expect(result).toEqual({ discarded: true });
  });

  it('404s when there is nothing pending', async () => {
    const h = build(null);

    await expect(h.svc.approveDraft(5, 1, 7)).rejects.toThrow();
    await expect(h.svc.discardDraft(5, 1, 7)).rejects.toThrow();
  });
});
