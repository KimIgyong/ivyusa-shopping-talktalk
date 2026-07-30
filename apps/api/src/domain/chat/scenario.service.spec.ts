import { Repository } from 'typeorm';
import { CONSENT_STATE, MODERATION_DECISION } from '@ivy/types';
import { ScenarioService } from './scenario.service';
import { ChatService } from './chat.service';
import { Message } from './entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { ModerationService } from '../moderation/moderation.service';
import { SessionService } from '../session/session.service';

/**
 * Consent gate on the scenario-button path (PLN-Privacy-Control-Gap Stage 1) —
 * the previously UNGUARDED path: a button press must not persist anything or
 * reach moderation/AI without an effective GRANTED consent.
 */
describe('ScenarioService consent gate', () => {
  let msgSave: jest.Mock;
  let getOrCreateConversation: jest.Mock;
  let moderate: jest.Mock;
  let effectiveConsentFor: jest.Mock;
  let svc: ScenarioService;

  const session = {
    id: 9,
    tenantId: 1,
    language: 'EN',
    consentState: CONSENT_STATE.PENDING,
    consentVersion: null,
  } as Session;

  beforeEach(() => {
    msgSave = jest.fn(async (m: Message) => m);
    getOrCreateConversation = jest.fn(async () => ({ id: 42, sessionId: 9 }));
    moderate = jest.fn(async () => ({ decision: MODERATION_DECISION.DELIVERED, text: 'ok' }));
    effectiveConsentFor = jest.fn();

    const msgRepo = {
      save: msgSave,
      create: (m: Partial<Message>) => m,
    } as unknown as Repository<Message>;

    svc = new ScenarioService(
      msgRepo,
      { getOrCreateConversation, handoff: jest.fn() } as unknown as ChatService,
      { moderate } as unknown as ModerationService,
      { effectiveConsentFor } as unknown as SessionService,
    );
  });

  it.each([
    [CONSENT_STATE.PENDING],
    [CONSENT_STATE.DECLINED],
  ])('soft-blocks without persist or AI/moderation call when consent is %s', async (state) => {
    effectiveConsentFor.mockResolvedValue(state);
    const result = await svc.handle(session, 'cancel_refund');
    expect(result.conversationId).toBe(0);
    expect(result.reply.senderType).toBe('system');
    expect(result.reply.body).toContain('privacy notice');
    expect(result.followUps).toEqual([]);
    expect(getOrCreateConversation).not.toHaveBeenCalled();
    expect(msgSave).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
    // Gate consulted the fresh (DB) consent read, tenant-scoped.
    expect(effectiveConsentFor).toHaveBeenCalledWith(9, 1);
  });

  it('proceeds with the scripted turn when consent is GRANTED', async () => {
    effectiveConsentFor.mockResolvedValue(CONSENT_STATE.GRANTED);
    const result = await svc.handle(session, 'cancel_refund');
    expect(result.conversationId).toBe(42);
    expect(result.reply.senderType).toBe('ai');
    expect(msgSave).toHaveBeenCalledTimes(2); // echoed user turn + script AI turn
    expect(moderate).toHaveBeenCalledTimes(1);
    expect(result.followUps.length).toBeGreaterThan(0);
  });
});
