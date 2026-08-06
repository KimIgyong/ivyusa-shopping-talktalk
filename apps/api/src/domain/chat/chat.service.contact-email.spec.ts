import { Repository } from 'typeorm';
import { CONSENT_STATE } from '@ivy/types';
import { ChatService } from './chat.service';
import { Conversation } from './entity/conversation.entity';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { RagService } from './rag.service';
import { ModerationService } from '../moderation/moderation.service';
import { SessionService } from '../session/session.service';
import { CustomerService } from '../customer/customer.service';
import { HandoffRouterService } from '../ai-engine/handoff-router.service';
import { EventBusService, RedisService } from '../../infrastructure/infrastructure.module';

/**
 * Off-hours address capture (PLN-260806). Collecting an email is processing
 * personal data, so it rides the same consent gate as the rest of chat and the
 * same lead path (erasure suppression + encrypted storage) the console uses.
 */
describe('ChatService.saveContactEmail', () => {
  function build(consent: string = CONSENT_STATE.GRANTED) {
    const session = {
      id: 5,
      sessionToken: 'tok-5',
      tenantId: 1,
      customerId: null,
      language: 'KO',
    } as Session;
    const sessionUpdate = jest.fn();
    const msgSave = jest.fn(async (m: Message) => ({ ...m, id: 1 }) as Message);
    const createFromLead = jest.fn(async () => ({ id: 42 }));
    const redisDel = jest.fn();

    const svc = new ChatService(
      {
        findOne: jest.fn(async () => ({ id: 77, sessionId: 5, status: 'waiting' }) as Conversation),
        update: jest.fn(),
        save: jest.fn(),
        create: (c: Partial<Conversation>) => c,
      } as unknown as Repository<Conversation>,
      {
        save: msgSave,
        create: (m: Partial<Message>) => m,
        update: jest.fn(),
        find: jest.fn(async () => []),
      } as unknown as Repository<Message>,
      { update: sessionUpdate } as unknown as Repository<Session>,
      {} as unknown as Repository<Tenant>,
      {} as unknown as Repository<User>,
      {} as unknown as RagService,
      {} as unknown as ModerationService,
      {} as never,
      { effectiveConsentFor: jest.fn(async () => consent) } as unknown as SessionService,
      {} as unknown as HandoffRouterService,
      { publish: jest.fn() } as unknown as EventBusService,
      { createFromLead } as unknown as CustomerService,
      { del: redisDel } as unknown as RedisService,
    );
    return { svc, session, sessionUpdate, msgSave, createFromLead, redisDel };
  }

  it('stores the address, binds the session and confirms in the thread', async () => {
    const { svc, session, sessionUpdate, msgSave, createFromLead, redisDel } = build();
    const res = await svc.saveContactEmail(session, 'shopper@example.com');

    expect(createFromLead).toHaveBeenCalledWith(1, { email: 'shopper@example.com' });
    expect(sessionUpdate).toHaveBeenCalledWith({ id: 5 }, { customerId: 42 });
    // Without this the cached token→session row keeps the customer unbound.
    expect(redisDel).toHaveBeenCalled();
    expect(res.body).toContain('답변');
    expect(msgSave).toHaveBeenCalled(); // confirmation persisted for the agent too
  });

  it('refuses to collect an address before consent is granted', async () => {
    const { svc, session, createFromLead } = build(CONSENT_STATE.PENDING);
    await expect(svc.saveContactEmail(session, 'shopper@example.com')).rejects.toThrow();
    expect(createFromLead).not.toHaveBeenCalled();
  });
});
