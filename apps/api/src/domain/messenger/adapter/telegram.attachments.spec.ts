import { TelegramAdapter } from './telegram.adapter';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { ChannelThread } from '../entity/channel-thread.entity';

const channel = { id: 3, webhookToken: 'shared-secret' } as MessengerChannel;
const ctx = { channel, secret: 'bot-token' };
const headers = { 'x-telegram-bot-api-secret-token': 'shared-secret' };

const body = (msg: unknown): Buffer => Buffer.from(JSON.stringify({ message: msg }), 'utf8');

/**
 * Photos in and out (PLN-260814 S5). Before this, a caption-less photo was
 * dropped at the parser: the shopper watched it send and no agent ever saw it.
 */
describe('TelegramAdapter — attachments', () => {
  const adapter = new TelegramAdapter();

  it('ingests a photo with no caption', () => {
    const out = adapter.parse(
      ctx,
      headers,
      body({
        message_id: 10,
        chat: { id: 55 },
        from: { id: 7, first_name: 'Mina' },
        photo: [
          { file_id: 'small', file_size: 100 },
          { file_id: 'original', file_size: 90_000 },
        ],
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('');
    // Telegram sends every rescaled copy; only the last one is the original.
    expect(out[0].attachments).toEqual([
      { fileId: 'original', filename: null, mime: 'image/jpeg', size: 90_000 },
    ]);
  });

  it('keeps the caption as the message text', () => {
    const out = adapter.parse(
      ctx,
      headers,
      body({
        message_id: 11,
        chat: { id: 55 },
        from: { id: 7 },
        caption: 'is this the right shade?',
        photo: [{ file_id: 'original' }],
      }),
    );

    expect(out[0].text).toBe('is this the right shade?');
    expect(out[0].attachments).toHaveLength(1);
  });

  it('ingests a document with its own name and type', () => {
    const out = adapter.parse(
      ctx,
      headers,
      body({
        message_id: 12,
        chat: { id: 55 },
        from: { id: 7 },
        document: {
          file_id: 'doc-1',
          file_name: 'receipt.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
        },
      }),
    );

    expect(out[0].attachments).toEqual([
      { fileId: 'doc-1', filename: 'receipt.pdf', mime: 'application/pdf', size: 2048 },
    ]);
  });

  it('still ignores an update with neither text nor files', () => {
    const out = adapter.parse(ctx, headers, body({ message_id: 13, chat: { id: 55 } }));
    expect(out).toEqual([]);
  });

  it('sends an image as a photo and a file as a document', async () => {
    const calls: { method: string; payload: Record<string, unknown> }[] = [];
    global.fetch = jest.fn(async (url: string, init: { body: string }) => {
      calls.push({
        method: String(url).split('/').pop() as string,
        payload: JSON.parse(init.body) as Record<string, unknown>,
      });
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
    }) as unknown as typeof fetch;

    await adapter.send(ctx, { externalThreadId: '55' } as ChannelThread, 'here you go', [
      { url: 'https://host/api/v1/files/a?sig=x', filename: 'a.png', mime: 'image/png', kind: 'image' },
      { url: 'https://host/api/v1/files/b?sig=y', filename: 'b.pdf', mime: 'application/pdf', kind: 'file' },
    ]);

    expect(calls.map((c) => c.method)).toEqual(['sendMessage', 'sendPhoto', 'sendDocument']);
    expect(calls[1].payload.photo).toBe('https://host/api/v1/files/a?sig=x');
    expect(calls[2].payload.document).toBe('https://host/api/v1/files/b?sig=y');
  });

  it('sends files without a text message when the reply is files only', async () => {
    const methods: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      methods.push(String(url).split('/').pop() as string);
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 2 } }) };
    }) as unknown as typeof fetch;

    await adapter.send(ctx, { externalThreadId: '55' } as ChannelThread, '', [
      { url: 'https://host/f', filename: 'a.png', mime: 'image/png', kind: 'image' },
    ]);

    expect(methods).toEqual(['sendPhoto']);
  });
});
