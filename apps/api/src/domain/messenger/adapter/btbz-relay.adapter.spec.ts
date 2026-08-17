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
    ['EXPIRED', 'failed'],
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
      // The URL is in the message on purpose: a 404 here is nearly always a
      // wrong server URL, and the operator needs to see which one was called.
    ).rejects.toThrow(/btbz relay POST https:\/\/relay\.test\/api\/relay\/replies failed: 404/);
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

/**
 * Server URL handling (FIX-260810). The 404 an operator hit on staging was a
 * wrong base URL that nothing on screen revealed.
 */
describe('BtbzRelayAdapter — server URL', () => {
  const OLD_ENV = process.env;
  const originalFetch = global.fetch;
  beforeAll(() => {
    process.env = { ...OLD_ENV, CRED_ENC_KEY: Buffer.alloc(32, 11).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
  });

  const redis = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
  } as unknown as RedisService;

  function channelWith(config: Record<string, unknown>): MessengerChannel {
    return {
      id: 4,
      tenantId: 1,
      provider: 'btbz_relay',
      config,
      secretEnc: encryptChannelSecret('pw'),
    } as unknown as MessengerChannel;
  }

  function stubLogin(status: number) {
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: unknown) => {
      urls.push(String(url));
      return {
        ok: status < 400,
        status,
        headers: { get: () => (status < 400 ? 'ksr_token=jwt' : null) },
        text: async () => '{}',
      } as unknown as Response;
    }) as unknown as typeof fetch;
    return urls;
  }

  it('names the failing URL so a wrong server URL is visible', async () => {
    stubLogin(404);
    const adapter = new BtbzRelayAdapter(redis);

    const result = await adapter.test({
      channel: channelWith({ base_url: 'https://wrong.example/login', email: 'a@b.c' }),
      secret: 'pw',
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('https://wrong.example/login/api/auth/login');
  });

  it('reports a rejected account as credentials, not as a failed connection', async () => {
    // The staging case (FIX-260813): messenger.amoeba.site was up and answering
    // 401 to a ShopTalk console login, and the console said "connection failed".
    stubLogin(401);
    const adapter = new BtbzRelayAdapter(redis);

    const result = await adapter.test({
      channel: channelWith({ base_url: 'https://messenger.amoeba.site', email: 'a@b.c' }),
      secret: 'pw',
    });

    expect(result).toMatchObject({ ok: false, reason: 'credentials' });
    expect(result.detail).toContain('rejected the account: 401');
    expect(result.detail).toContain('not the ShopTalk console login');
  });

  it('still blames the URL, not the account, on a 404', async () => {
    stubLogin(404);
    const adapter = new BtbzRelayAdapter(redis);

    const result = await adapter.test({
      channel: channelWith({ base_url: 'https://wrong.example', email: 'a@b.c' }),
      secret: 'pw',
    });

    expect(result).toMatchObject({ ok: false, reason: 'not_found' });
    expect(result.detail).toContain('check the server URL');
  });

  it('separates "never answered" from any status the relay could return', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const adapter = new BtbzRelayAdapter(redis);

    const result = await adapter.test({
      channel: channelWith({ base_url: 'https://down.example', email: 'a@b.c' }),
      secret: 'pw',
    });

    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(result.detail).toContain('https://down.example');
  });

  it('accepts a host pasted without a scheme', async () => {
    const urls = stubLogin(200);
    const adapter = new BtbzRelayAdapter(redis);

    await adapter
      .test({ channel: channelWith({ base_url: 'messenger.amoeba.site', email: 'a@b.c' }), secret: 'pw' })
      .catch(() => undefined);

    expect(urls[0]).toBe('https://messenger.amoeba.site/api/auth/login');
  });

  it('refuses to log in with no account email instead of posting an empty body', async () => {
    stubLogin(200);
    const adapter = new BtbzRelayAdapter(redis);

    const result = await adapter.test({ channel: channelWith({}), secret: 'pw' });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('email or password is not set');
  });
});

/**
 * Signed provider mode (PLN-260814): key_id + api_secret switch reads to the
 * HMAC-signed provider API; replies stay on the operator account (D1a hybrid).
 */
describe('BtbzRelayAdapter — signed provider mode', () => {
  const OLD_ENV = process.env;
  const originalFetch = global.fetch;
  beforeAll(() => {
    process.env = { ...OLD_ENV, CRED_ENC_KEY: Buffer.alloc(32, 11).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = originalFetch;
  });

  const signedChannel = (extraConfig: Record<string, unknown> = {}) =>
    ({
      id: 7,
      tenantId: 1,
      provider: 'btbz_relay',
      config: { base_url: 'https://relay.test', key_id: 'ksrk_test', ...extraConfig },
      secretEnc: encryptChannelSecret({
        email: 'ops@amoeba.group',
        password: 'pw',
        api_secret: 'ksrsk_unit_secret',
      }),
    }) as unknown as MessengerChannel;

  interface Captured {
    url: string;
    headers: Record<string, string>;
  }

  /** Stub keyed by URL substring; captures the signed headers of every call. */
  function stubProvider(responses: Record<string, { status?: number; body: unknown }>) {
    const calls: Captured[] = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, headers: (init?.headers ?? {}) as Record<string, string> });
      if (href.includes('/api/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'ksr_token=jwt-abc; Path=/' },
          text: async () => JSON.stringify({ success: true }),
        } as unknown as Response;
      }
      const key = Object.keys(responses).find((k) => href.includes(k));
      const hit = key === undefined ? undefined : responses[key];
      return {
        ok: hit !== undefined && (hit.status ?? 200) < 400,
        status: hit === undefined ? 404 : (hit.status ?? 200),
        headers: { get: () => null },
        text: async () => JSON.stringify(hit === undefined ? {} : hit.body),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    return calls;
  }

  function freshRedis(store: Record<string, string> = {}) {
    return {
      get: jest.fn(async (k: string) => store[k] ?? null),
      set: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
    } as unknown as RedisService;
  }

  const MSG = (id: number, conv: number, body: string, extra: Record<string, unknown> = {}) => ({
    messageId: id,
    conversationId: conv,
    origin: 'relay_kakao_pc',
    direction: 'inbound',
    senderName: '김철수',
    body,
    bodyType: 'text',
    occurredAt: '2026-08-14T02:00:00.000Z',
    customerRef: 'CUST-1',
    ...extra,
  });

  it('pulls via /messages?since_id= with signed headers, one meta fetch per conversation', async () => {
    const calls = stubProvider({
      '/api/provider/v1/messages': {
        body: {
          data: [
            MSG(11, 9, '재고 있나요?'),
            MSG(12, 9, '색상은요?'),
            MSG(13, 9, 'our own reply', { direction: 'outbound' }),
          ],
          nextCursor: 13,
          hasMore: false,
        },
      },
      '/api/provider/v1/conversations/9': {
        body: { data: { conversationId: 9, origin: 'relay_kakao_pc', counterpartDisplay: '김철수', replyEnabled: true } },
      },
    });
    const store: Record<string, string> = {};
    const adapter = new BtbzRelayAdapter(freshRedis(store));

    const out = await adapter.pull({ channel: signedChannel(), secret: '' }, []);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      externalThreadId: '9',
      externalMessageId: '11',
      subChannel: 'kakao',
      replyEnabled: true,
    });
    // Cursor advanced to the page's nextCursor.
    expect(store['ksr:pcursor:7']).toBe('13');
    // Conversation meta fetched exactly once for the two messages.
    expect(calls.filter((c) => c.url.includes('/conversations/9'))).toHaveLength(1);
    // Signed request shape: as-sent path (prefix + query) and well-formed headers.
    const msgCall = calls.find((c) => c.url.includes('/messages'))!;
    expect(msgCall.url).toBe(
      'https://relay.test/api/provider/v1/messages?since_id=0&direction=inbound&limit=100',
    );
    expect(msgCall.headers['X-KSR-Key-Id']).toBe('ksrk_test');
    expect(msgCall.headers['X-KSR-Signature']).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it('re-signs every request — no two calls share a nonce', async () => {
    const calls = stubProvider({
      '/api/provider/v1/messages': { body: { data: [MSG(1, 2, 'a'), MSG(3, 4, 'b')], hasMore: false } },
      '/api/provider/v1/conversations/': { body: { data: { replyEnabled: true } } },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());

    await adapter.pull({ channel: signedChannel(), secret: '' }, []);

    const nonces = calls.map((c) => c.headers['X-KSR-Nonce']).filter(Boolean);
    expect(nonces.length).toBeGreaterThanOrEqual(3);
    expect(new Set(nonces).size).toBe(nonces.length);
  });

  it('aborts the pull when a row carries a different customerRef than expected', async () => {
    stubProvider({
      '/api/provider/v1/messages': {
        body: { data: [MSG(11, 9, 'hello', { customerRef: 'CUST-OTHER' })], hasMore: false },
      },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());

    await expect(
      adapter.pull({ channel: signedChannel({ expected_customer: 'CUST-1' }), secret: '' }, []),
    ).rejects.toThrow(/wrong instance/);
  });

  it('confirm() reads the single-command endpoint and maps SENT_UNCONFIRMED', async () => {
    stubProvider({
      '/api/provider/v1/commands/55': { body: { data: { status: 'SENT_UNCONFIRMED' } } },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());
    const thread = { externalThreadId: '9' } as unknown as ChannelThread;

    await expect(
      adapter.confirm({ channel: signedChannel(), secret: '' }, thread, '55'),
    ).resolves.toBe('unconfirmed');
  });

  it('confirm() maps EXPIRED (device never picked it up) to failed, ending the poll', async () => {
    stubProvider({
      '/api/provider/v1/commands/34': {
        body: { data: { status: 'EXPIRED', failReason: 'handle_expired' } },
      },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());
    const thread = { externalThreadId: '9' } as unknown as ChannelThread;

    await expect(
      adapter.confirm({ channel: signedChannel(), secret: '' }, thread, '34'),
    ).resolves.toBe('failed');
  });

  it('confirm() treats a swept command (404) as failed, not as delivered', async () => {
    stubProvider({});
    const adapter = new BtbzRelayAdapter(freshRedis());
    const thread = { externalThreadId: '9' } as unknown as ChannelThread;

    await expect(
      adapter.confirm({ channel: signedChannel(), secret: '' }, thread, '99'),
    ).resolves.toBe('failed');
  });

  it('test() verifies the instance binding and probes the reply path', async () => {
    const calls = stubProvider({
      '/api/provider/v1/instance': {
        body: { data: { customerRef: 'CUST-1', relayState: 'ONLINE' } },
      },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());

    const result = await adapter.test({
      channel: signedChannel({ expected_customer: 'CUST-1' }),
      secret: '',
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toContain('CUST-1');
    expect(result.detail).toContain('reply path ok');
    expect(result.accountId).toBe('ksrk_test');
    const instanceCall = calls.find((c) => c.url.includes('/instance'))!;
    expect(instanceCall.headers['X-KSR-Expected-Customer']).toBe('CUST-1');
  });

  it('test() names a rejected key as a credentials failure (E1103)', async () => {
    stubProvider({
      '/api/provider/v1/instance': {
        status: 401,
        body: { error: { code: 'E1103', message: 'signature mismatch' } },
      },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());

    const result = await adapter.test({ channel: signedChannel(), secret: '' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('credentials');
    expect(result.detail).toContain('E1103');
  });

  it('test() names a mispointed instance (E5101) instead of a generic failure', async () => {
    stubProvider({
      '/api/provider/v1/instance': {
        status: 409,
        body: { error: { code: 'E5101', message: 'this instance does not serve the customer you asserted' } },
      },
    });
    const adapter = new BtbzRelayAdapter(freshRedis());

    const result = await adapter.test({
      channel: signedChannel({ expected_customer: 'CUST-1' }),
      secret: '',
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('different customer');
  });

  it('stays on the legacy operator path when no provider key is configured', async () => {
    const calls = stubProvider({
      '/api/inbox/conversations': { body: { data: [] } },
    });
    const legacy = {
      id: 4,
      tenantId: 1,
      provider: 'btbz_relay',
      config: { base_url: 'https://relay.test' },
      secretEnc: encryptChannelSecret({ email: 'ops@amoeba.group', password: 'pw' }),
    } as unknown as MessengerChannel;
    const adapter = new BtbzRelayAdapter(freshRedis());

    await adapter.pull({ channel: legacy, secret: '' }, []);

    expect(calls.some((c) => c.url.includes('/api/provider/'))).toBe(false);
    expect(calls.some((c) => c.url.includes('/api/inbox/conversations'))).toBe(true);
  });
});
