import { CONSENT_STATE, MODERATION_DECISION } from '@ivy/types';
import { AgentService } from './agent.service';
import { Conversation } from '../chat/entity/conversation.entity';
import { Message } from '../chat/entity/message.entity';

/**
 * Off-hours threads are answered by email (PLN-260806): the shopper was told so
 * when they wrote, and hours later nobody is sitting in the widget to read the
 * agent's reply.
 */
describe('AgentService.sendMessage — off-hours email delivery', () => {
  function build(opts: { replyChannel?: string | null; customerId?: number | null; email?: string | null } = {}) {
    const conversation = {
      id: 77,
      tenantId: 1,
      sessionId: 5,
      status: 'agent',
      // `?? 'email'` would turn an explicit null back into the email channel.
      replyChannel: 'replyChannel' in opts ? opts.replyChannel : 'email',
    } as Conversation;
    const saved: Message[] = [];
    const send = jest.fn(async () => true);
    const svc = new AgentService(
      { findOne: jest.fn(async () => conversation) } as never,
      {
        save: jest.fn(async (m: Message) => {
          saved.push(m);
          return { ...m, id: saved.length } as Message;
        }),
        create: (m: Partial<Message>) => m,
      } as never,
      {} as never, // userRepo
      {
        findOne: jest.fn(async () => ({
          id: 5,
          customerId: opts.customerId === undefined ? 42 : opts.customerId,
          language: 'KO',
        })),
      } as never,
      {} as never, // profileRepo
      {} as never, // assignmentRepo
      {} as never, // statRepo
      {
        moderate: jest.fn(async () => ({
          decision: MODERATION_DECISION.DELIVERED,
          text: '내일 발송됩니다.',
        })),
      } as never,
      {
        contactEmail: jest.fn(async () => (opts.email === undefined ? 'shopper@example.com' : opts.email)),
      } as never,
      {} as never, // aiGateway
      {} as never, // audit
      {} as never, // redis
      { effectiveConsentFor: jest.fn(async () => CONSENT_STATE.GRANTED) } as never,
      { publish: jest.fn() } as never,
      { send } as never,
    );
    return { svc, send, saved };
  }

  it('mails the moderated reply and notes it in the transcript', async () => {
    const { svc, send, saved } = build();
    await svc.sendMessage(77, 9, 1, '내일 발송됩니다.');

    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe('shopper@example.com');
    expect(mail.text).toContain('내일 발송됩니다.');
    // Agent reply + the "this went out by email" note.
    expect(saved.map((m) => m.senderType)).toEqual(['agent', 'system']);
  });

  it('does not mail a thread the shopper is reading in the widget', async () => {
    const { svc, send, saved } = build({ replyChannel: null });
    await svc.sendMessage(77, 9, 1, 'here you go');
    expect(send).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
  });

  it('skips silently when no address is on file', async () => {
    const { svc, send } = build({ email: null });
    await svc.sendMessage(77, 9, 1, 'here you go');
    expect(send).not.toHaveBeenCalled();
  });
});
