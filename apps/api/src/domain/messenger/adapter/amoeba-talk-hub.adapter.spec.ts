import { AmoebaTalkHubAdapter, normalizeSocialType } from './amoeba-talk-hub.adapter';
import { MessengerChannel } from '../entity/messenger-channel.entity';
import { ChannelThread } from '../entity/channel-thread.entity';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { encryptChannelSecret } from '../messenger-secret.util';

/**
 * Hub polling (PLN-260810 PR-M2): only customer turns are ingested, cursors
 * bound the work, and the operator/bot side never comes back in.
 */
describe('AmoebaTalkHubAdapter', () => {
  const OLD_ENV = process.env;
  beforeAll(() => {
    process.env = { ...OLD_ENV, CRED_ENC_KEY: Buffer.alloc(32, 5).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
  });
  const originalFetch = global.fetch;

  const channel = () =>
    ({
      id: 7,
      tenantId: 1,
      provider: 'amoebatalk',
      config: { social_types: ['zalo'], base_url: 'https://hub.test' },
      secretEnc: encryptChannelSecret({ email: 'bot@amoeba.group', password: 'pw', company_id: '3' }),
    }) as unknown as MessengerChannel;

  /** Minimal hub stub: signin → select-company → inbox list → messages. */
  function stubFetch(responses: Record<string, unknown>) {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      const href = String(url);
      calls.push(href);
      const key = Object.keys(responses).find((k) => href.includes(k));
      return {
        ok: key !== undefined,
        status: key === undefined ? 404 : 200,
        text: async () => JSON.stringify(key === undefined ? {} : responses[key]),
      } as Response;
    }) as unknown as typeof fetch;
    return calls;
  }

  const redis = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) } as unknown as RedisService;

  const authStubs = {
    '/api/auth/signin': { data: { temp_token: 'temp-1', companies: [{ id: 3 }] } },
    '/api/auth/select-company': { data: { access_token: 'access-1' } },
  };

  it('ingests only customer turns from a changed conversation', async () => {
    const calls = stubFetch({
      ...authStubs,
      '/api/inbox/conversations?': {
        data: {
          items: [
            {
              conversation_id: 12,
              customer_id: 90,
              customer_name: 'Gray Kim',
              last_message_time: '2026-08-10 15:30:45',
              social_type: 'zalo',
            },
          ],
        },
      },
      '/api/inbox/conversations/12/messages': {
        data: {
          messages: [
            { id: 100, content: 'old customer turn', user_type: '0', created_at: '2026-08-10T15:00:00Z' },
            { id: 101, content: 'agent answer', user_type: '1', created_at: '2026-08-10T15:20:00Z' },
            { id: 102, content: 'new question', user_type: '0', created_at: '2026-08-10T15:30:00Z' },
          ],
        },
      },
    });

    const adapter = new AmoebaTalkHubAdapter(redis);
    const out = await adapter.pull({ channel: channel(), secret: 'x' }, [
      { externalThreadId: '12', inboundCursor: '100', lastInboundAt: new Date('2026-08-10T15:00:00Z') },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      externalThreadId: '12',
      externalMessageId: '102',
      externalUserName: 'Gray Kim',
      subChannel: 'zalo',
      text: 'new question',
    });
    // The list is filtered by the configured sub-channel, not fetched wholesale.
    expect(calls.some((c) => c.includes('social_type=zalo'))).toBe(true);
  });

  it('skips a conversation whose watermark is unchanged', async () => {
    const calls = stubFetch({
      ...authStubs,
      '/api/inbox/conversations?': {
        data: { items: [{ conversation_id: 12, last_message_time: '2026-08-10 15:30:45' }] },
      },
    });
    const warmRedis = {
      get: jest.fn(async (key: string) =>
        key.startsWith('atk:wm:') ? '2026-08-10 15:30:45' : null,
      ),
      set: jest.fn(async () => undefined),
    } as unknown as RedisService;

    const adapter = new AmoebaTalkHubAdapter(warmRedis);
    const out = await adapter.pull({ channel: channel(), secret: 'x' }, [
      { externalThreadId: '12', inboundCursor: '102', lastInboundAt: new Date('2026-08-10T16:00:00Z') },
    ]);

    expect(out).toEqual([]);
    expect(calls.some((c) => c.includes('/messages'))).toBe(false);
  });

  it('refetches when the watermark moved, even though the timestamp has no timezone', async () => {
    stubFetch({
      ...authStubs,
      '/api/inbox/conversations?': {
        data: { items: [{ conversation_id: 12, last_message_time: '2026-08-10 15:30:45' }] },
      },
      '/api/inbox/conversations/12/messages': {
        data: { messages: [{ id: 103, content: 'newer', user_type: '0' }] },
      },
    });
    const staleRedis = {
      get: jest.fn(async (key: string) => (key.startsWith('atk:wm:') ? '2026-08-10 15:00:00' : null)),
      set: jest.fn(async () => undefined),
    } as unknown as RedisService;

    const adapter = new AmoebaTalkHubAdapter(staleRedis);
    const out = await adapter.pull({ channel: channel(), secret: 'x' }, [
      // A naive local timestamp parses as an instant *behind* this UTC cursor;
      // a Date comparison would drop the message, the watermark does not.
      { externalThreadId: '12', inboundCursor: '102', lastInboundAt: new Date('2026-08-10T16:00:00Z') },
    ]);

    expect(out.map((m) => m.externalMessageId)).toEqual(['103']);
  });

  it('reuses a cached access token instead of logging in again', async () => {
    const calls = stubFetch({
      '/api/inbox/conversations?': { data: { items: [] } },
    });
    const cachedRedis = {
      get: jest.fn(async () => 'cached-token'),
      set: jest.fn(async () => undefined),
    } as unknown as RedisService;

    const adapter = new AmoebaTalkHubAdapter(cachedRedis);
    await adapter.pull({ channel: channel(), secret: 'x' }, []);

    expect(calls.some((c) => c.includes('/api/auth/signin'))).toBe(false);
  });

  it('sends an operator reply to the hub conversation', async () => {
    const calls = stubFetch({ ...authStubs, '/messages': { data: { id: 555 } } });
    const adapter = new AmoebaTalkHubAdapter(redis);

    const result = await adapter.send(
      { channel: channel(), secret: 'x' },
      { externalThreadId: '12' } as ChannelThread,
      'on its way',
    );

    expect(result.externalMessageId).toBe('555');
    expect(calls.some((c) => c.endsWith('/api/inbox/conversations/12/messages'))).toBe(true);
  });

  it('reports a failed credential check instead of throwing', async () => {
    stubFetch({}); // every call 404s
    const adapter = new AmoebaTalkHubAdapter(redis);
    const result = await adapter.test({ channel: channel(), secret: 'x' });
    expect(result.ok).toBe(false);
  });
});

describe('normalizeSocialType', () => {
  it.each([
    ['kakaotalk', 'kakao'],
    ['chatwidget', 'widget'],
    ['ZALO', 'zalo'],
    ['', null],
    [null, null],
  ])('maps %s → %s', (input, expected) => {
    expect(normalizeSocialType(input as string | null)).toBe(expected);
  });
});
