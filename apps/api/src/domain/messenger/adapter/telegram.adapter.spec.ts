import { TelegramAdapter, splitText } from './telegram.adapter';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { BusinessException } from '../../../global/exception/business.exception';

/**
 * Telegram inbound: the secret header is the only proof the caller is Telegram,
 * so a mismatch must reject rather than ingest (PLN-260810 §7).
 */
describe('TelegramAdapter.parse', () => {
  const adapter = new TelegramAdapter();
  const channel = { id: 1, webhookToken: 'tok-abc', config: null } as unknown as MessengerChannel;
  const ctx = { channel, secret: 'bot-token' };

  const update = (message: Record<string, unknown>) => Buffer.from(JSON.stringify({ message }));
  const goodHeaders = { 'x-telegram-bot-api-secret-token': 'tok-abc' };

  it('normalizes a text message', () => {
    const out = adapter.parse(
      ctx,
      goodHeaders,
      update({
        message_id: 42,
        date: 1_700_000_000,
        text: '  주문 언제 오나요?  ',
        chat: { id: -1001, type: 'private' },
        from: { id: 777, first_name: 'Gil', last_name: 'Hong', language_code: 'ko-KR' },
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalThreadId: '-1001',
      externalMessageId: '42',
      externalUserId: '777',
      externalUserName: 'Gil Hong',
      text: '주문 언제 오나요?',
      languageHint: 'ko-KR',
      replyEnabled: true,
    });
  });

  it('rejects a delivery whose secret token does not match', () => {
    expect(() =>
      adapter.parse(ctx, { 'x-telegram-bot-api-secret-token': 'wrong' }, update({ message_id: 1, text: 'hi', chat: { id: 5 } })),
    ).toThrow(BusinessException);
  });

  it('rejects when the channel has no webhook token (fail closed)', () => {
    const tokenless = { channel: { id: 2, webhookToken: null } as unknown as MessengerChannel, secret: 'x' };
    expect(() => adapter.parse(tokenless, {}, update({ message_id: 1, text: 'hi', chat: { id: 5 } }))).toThrow(
      BusinessException,
    );
  });

  it('ignores bot messages — loop prevention #1', () => {
    const out = adapter.parse(
      ctx,
      goodHeaders,
      update({ message_id: 9, text: 'echo', chat: { id: 5 }, from: { id: 1, is_bot: true } }),
    );
    expect(out).toEqual([]);
  });

  it('ignores an update with no text (sticker/photo without caption)', () => {
    expect(adapter.parse(ctx, goodHeaders, update({ message_id: 9, chat: { id: 5 } }))).toEqual([]);
  });

  it('ignores an unparseable body instead of throwing (no endless redelivery)', () => {
    expect(adapter.parse(ctx, goodHeaders, Buffer.from('not json'))).toEqual([]);
  });
});

describe('splitText', () => {
  it('keeps short text whole', () => {
    expect(splitText('hello', 100)).toEqual(['hello']);
  });

  it('splits on a word boundary and loses nothing', () => {
    const text = `${'a'.repeat(50)} ${'b'.repeat(40)}`;
    const parts = splitText(text, 60);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(' ')).toBe(text);
  });

  it('still splits text with no separators', () => {
    const parts = splitText('x'.repeat(25), 10);
    expect(parts).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});
