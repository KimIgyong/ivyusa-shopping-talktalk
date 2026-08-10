import { BtbzRelayAdapter, extractCookieToken } from './btbz-relay.adapter';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { ChannelThread } from '../entity/channel-thread.entity';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { encryptChannelSecret } from '../messenger-secret.util';

/**
 * btbz KSR relay (PLN-260810 PR-M3): SMS is receive-only, a reply is a device
 * command with no delivery proof, and our own replies must not come back in.
 */
describe('BtbzRelayAdapter', () => {
  const OLD_ENV = process.env;
  const originalFetch = global.fetch;
  beforeAll(() => {
    process.env = { ...OLD_ENV, CRED_ENC_KEY: Buffer.alloc(32, 11).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
  });

  const channel = () =>
    ({
      id: 4,
      tenantId: 1,
      provider: 'btbz_relay',
      config: { base_url: 'https://relay.test' },
      secretEnc: encryptChannelSecret({ email: 'ops@amoeba.group', password: 'pw' }),
    }) as unknown as MessengerChannel;

  function stubFetch(responses: Record<string, unknown>) {
    const calls: Array<{ url: string; body?: string }> = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, body: init?.body as string | undefined });
      if (href.includes('/api/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'ksr_token=jwt-abc; Path=/; HttpOnly; SameSite=Lax' },
          text: async () => JSON.stringify({ success: true }),
        } as unknown as Response;
      }
      const key = Object.keys(responses).find((k) => href.includes(k));
      return {
        ok: key !== undefined,
        status: key === undefined ? 404 : 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(key === undefined ? {} : responses[key]),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    return calls;
  }

  const redis = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
  } as unknown as RedisService;

  it('ingests inbound KakaoTalk turns and marks the thread replyable', async () => {
    stubFetch({
      '/api/inbox/conversations/9/messages': {
        data: [
          { id: 41, direction: 'outbound', body: 'our earlier reply' },
          { id: 42, direction: 'inbound', body: '재고 있나요?', sender_name: '김철수', occurred_at: '2026-08-10 14:31:00' },
        ],
      },
      '/api/inbox/conversations': {
        data: [
          {
            id: 9,
            channel_type: 'relay_kakao_pc',
            counterpart_display: '김철수',
            reply_enabled: true,
            last_message_at: '2026-08-10 14:31:00',
          },
        ],
      },
    });

    const adapter = new BtbzRelayAdapter(redis);
    const out = await adapter.pull({ channel: channel(), secret: 'x' }, []);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalThreadId: '9',
      externalMessageId: '42',
      subChannel: 'kakao',
      replyEnabled: true,
      text: '재고 있나요?',
    });
  });

  it('marks SMS threads receive-only so the outbox never tries to answer', async () => {
    stubFetch({
      '/api/inbox/conversations/3/messages': {
        data: [{ id: 7, direction: 'inbound', body: '배송조회', sender_number: '010-1234-5678' }],
      },
      '/api/inbox/conversations': {
        data: [{ id: 3, channel_type: 'relay_sms', reply_enabled: false, last_message_at: '2026-08-10 14:28:00' }],
      },
    });

    const adapter = new BtbzRelayAdapter(redis);
    const out = await adapter.pull({ channel: channel(), secret: 'x' }, []);

    expect(out[0]).toMatchObject({ subChannel: 'sms', replyEnabled: false, externalUserId: '010-1234-5678' });
  });

  it('reports a reply as unconfirmed — the relay only queues a device command', async () => {
    stubFetch({ '/api/relay/replies': { data: { command_id: 77, status: 'DISPATCHED', agent_online: true } } });

    const adapter = new BtbzRelayAdapter(redis);
    const result = await adapter.send(
      { channel: channel(), secret: 'x' },
      { externalThreadId: '9' } as ChannelThread,
      'in stock',
    );

    expect(result).toEqual({ externalMessageId: '77', unconfirmed: true });
  });

  it.each([
    ['SENT', 'sent'],
    ['SENT_UNCONFIRMED', 'unconfirmed'],
    ['FAILED', 'failed'],
    ['DISPATCHED', 'pending'],
  ])('maps command status %s → %s', async (status, expected) => {
    stubFetch({ '/commands': { data: [{ id: 77, status }] } });
    const adapter = new BtbzRelayAdapter(redis);

    const verdict = await adapter.confirm(
      { channel: channel(), secret: 'x' },
      { externalThreadId: '9' } as ChannelThread,
      '77',
    );

    expect(verdict).toBe(expected);
  });

  it('treats a command that expired out of the list as failed, not delivered', async () => {
    stubFetch({ '/commands': { data: [] } });
    const adapter = new BtbzRelayAdapter(redis);

    const verdict = await adapter.confirm(
      { channel: channel(), secret: 'x' },
      { externalThreadId: '9' } as ChannelThread,
      '77',
    );

    expect(verdict).toBe('failed');
  });

  it('surfaces the relay refusal message on a rejected reply', async () => {
    stubFetch({}); // every non-login call 404s
    const adapter = new BtbzRelayAdapter(redis);

    await expect(
      adapter.send({ channel: channel(), secret: 'x' }, { externalThreadId: '9' } as ChannelThread, 'hi'),
    ).rejects.toThrow(/btbz relay POST \/api\/relay\/replies failed: 404/);
  });
});

describe('extractCookieToken', () => {
  it('reads ksr_token out of a Set-Cookie header', () => {
    expect(extractCookieToken('ksr_token=abc123; Path=/; HttpOnly; SameSite=Lax')).toBe('abc123');
  });

  it('finds it among several cookies', () => {
    expect(extractCookieToken('other=1; Path=/, ksr_token=xyz; HttpOnly')).toBe('xyz');
  });

  it('returns null when absent', () => {
    expect(extractCookieToken('other=1; Path=/')).toBeNull();
    expect(extractCookieToken(null)).toBeNull();
  });
});
