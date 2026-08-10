import { createHmac } from 'crypto';
import { ViberAdapter } from './viber.adapter';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { BusinessException } from '../../../global/exception/business.exception';

/**
 * Viber signs every delivery with the account auth token; a forged or missing
 * signature must reject (PLN-260810 §7).
 */
describe('ViberAdapter.parse', () => {
  const adapter = new ViberAdapter();
  const secret = 'viber-auth-token';
  const channel = { id: 3, webhookToken: 'tok', config: null } as unknown as MessengerChannel;
  const ctx = { channel, secret };

  const body = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload));
  const sign = (raw: Buffer) => ({
    'x-viber-content-signature': createHmac('sha256', secret).update(raw).digest('hex'),
  });

  it('normalizes a signed message event', () => {
    const raw = body({
      event: 'message',
      message_token: 5_099_005,
      timestamp: 1_700_000_000_000,
      sender: { id: 'subscriber-1', name: 'Jane', language: 'es' },
      message: { type: 'text', text: 'hola' },
    });

    const out = adapter.parse(ctx, sign(raw), raw);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalThreadId: 'subscriber-1',
      externalMessageId: '5099005',
      externalUserName: 'Jane',
      languageHint: 'es',
      text: 'hola',
      replyEnabled: true,
    });
  });

  it('rejects a forged signature', () => {
    const raw = body({ event: 'message', message_token: 1, sender: { id: 's' }, message: { text: 'hi' } });
    expect(() => adapter.parse(ctx, { 'x-viber-content-signature': 'deadbeef' }, raw)).toThrow(
      BusinessException,
    );
  });

  it('rejects when no auth token is configured (fail closed)', () => {
    const raw = body({ event: 'message', message_token: 1, sender: { id: 's' }, message: { text: 'hi' } });
    expect(() => adapter.parse({ channel, secret: '' }, sign(raw), raw)).toThrow(BusinessException);
  });

  it('ignores non-message events — conversation_started carries no shopper text', () => {
    const raw = body({ event: 'conversation_started', sender: { id: 's' } });
    expect(adapter.parse(ctx, sign(raw), raw)).toEqual([]);
  });
});
