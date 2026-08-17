import { CONSENT_STATE, MODERATION_DECISION } from '@ivy/types';
import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';
import { AttachmentService } from '../attachment/attachment.service';
import { MessageAttachment } from '../attachment/entity/message-attachment.entity';

/**
 * An agent reply that carries files (PLN-260814 S4).
 *
 * Two rules are easy to get wrong and expensive when wrong: moderation is a
 * text service (a files-only reply has nothing to send it), and the
 * duplicate-suppression window keys on the body — which would silently eat the
 * second of two photos sent under the same caption.
 */
describe('AgentService.sendMessage — attachments', () => {
  function build(opts: { replyChannel?: string | null; lastAgentBody?: string } = {}) {
    const conversation = {
      id: 7,
      sessionId: 3,
      tenantId: 1,
      replyChannel: opts.replyChannel ?? null,
    } as Conversation;

    const saved: Message[] = [];
    const msgRepo = {
      findOne: jest.fn(async () =>
        opts.lastAgentBody
          ? ({ id: 90, body: opts.lastAgentBody, createdAt: new Date() } as Message)
          : null,
      ),
      create: (m: Partial<Message>) => m as Message,
      save: jest.fn(async (m: Message) => {
        const row = { ...m, id: 100 } as Message;
        saved.push(row);
        return row;
      }),
    };
    const moderate = jest.fn(async () => ({
      decision: MODERATION_DECISION.DELIVERED,
      text: 'moderated text',
    }));
    const attachToMessage = jest.fn(async (ids: string[]) =>
      ids.map((uuid, i) => ({ id: i + 1, uuid }) as MessageAttachment),
    );
    const mailSend = jest.fn(async () => true);

    const svc = new AgentService(
      { findOne: jest.fn(async () => conversation) } as never,
      msgRepo as never,
      {} as never, // userRepo
      { findOne: jest.fn(async () => ({ id: 3, customerId: 9, language: 'KO' })) } as never,
      {} as never, // profileRepo
      {} as never, // assignmentRepo
      {} as never, // statRepo
      { moderate } as unknown as never,
      { contactEmail: jest.fn(async () => 'shopper@example.com') } as never,
      {} as never, // aiGateway
      { write: jest.fn() } as never,
      { available: () => false, get: jest.fn(), set: jest.fn(), del: jest.fn() } as never,
      { effectiveConsentFor: jest.fn(async () => CONSENT_STATE.GRANTED) } as never,
      { publish: jest.fn() } as never,
      { send: mailSend } as never,
      undefined, // answerReuse
      undefined, // issueService
      undefined, // aiConfigRepo
      undefined, // threadRepo
      undefined, // channelRepo
      undefined, // draftRepo
      { attachToMessage } as unknown as AttachmentService,
    );

    return { svc, moderate, attachToMessage, mailSend, saved };
  }

  it('sends a files-only reply without calling text moderation', async () => {
    const { svc, moderate, attachToMessage, saved } = build();

    await svc.sendMessage(7, 5, 1, '', ['uuid-a']);

    expect(moderate).not.toHaveBeenCalled();
    expect(saved[0].body).toBe('');
    expect(attachToMessage).toHaveBeenCalledWith(
      ['uuid-a'],
      expect.objectContaining({ tenantId: 1, conversationId: 7, messageId: 100 }),
    );
  });

  it('still moderates a reply that has text alongside the file', async () => {
    const { svc, moderate, saved } = build();

    await svc.sendMessage(7, 5, 1, 'here is the label', ['uuid-a']);

    expect(moderate).toHaveBeenCalled();
    expect(saved[0].body).toBe('moderated text');
  });

  it('does not suppress a repeat caption when files are attached', async () => {
    // Same words, different photo: two replies, not a double submission.
    const { svc, saved } = build({ lastAgentBody: 'moderated text' });

    const result = await svc.sendMessage(7, 5, 1, 'here it is', ['uuid-b']);

    expect(saved).toHaveLength(1);
    expect(result.id).toBe(100);
  });

  it('still suppresses an identical text-only reply inside the window', async () => {
    const { svc, saved } = build({ lastAgentBody: 'same answer' });

    const result = await svc.sendMessage(7, 5, 1, 'same answer');

    expect(saved).toHaveLength(0);
    expect(result.id).toBe(90);
  });

  it('tells an off-hours email where the file is, since the link would expire', async () => {
    const { svc, mailSend } = build({ replyChannel: 'email' });

    await svc.sendMessage(7, 5, 1, '확인했습니다', ['uuid-a']);

    const body = (mailSend.mock.calls[0][0] as { text: string }).text;
    expect(body).toContain('첨부 파일');
  });

  it('leaves the email unchanged when the reply has no files', async () => {
    const { svc, mailSend } = build({ replyChannel: 'email' });

    await svc.sendMessage(7, 5, 1, '확인했습니다');

    const body = (mailSend.mock.calls[0][0] as { text: string }).text;
    expect(body).not.toContain('첨부 파일');
  });
});
