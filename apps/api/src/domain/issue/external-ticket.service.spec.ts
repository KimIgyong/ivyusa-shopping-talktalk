import { Repository } from 'typeorm';
import { ExternalTicketService } from './external-ticket.service';
import { ExternalTicket } from './entity/external-ticket.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Message } from '../chat/entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { Conversation } from '../chat/entity/conversation.entity';
import { encryptSecret } from '../../global/util/crypto.util';

/**
 * Gorgias L1 connector (PLN-260808-Issue-Workflow-P2 S4): bridge-only gating,
 * email requirement, create-vs-append idempotency via the message cursor.
 */
describe('ExternalTicketService', () => {
  const OLD = process.env;
  beforeAll(() => {
    // encryptSecret needs a real 32-byte key in this suite (credentials fixture).
    process.env = { ...OLD, CRED_ENC_KEY: Buffer.alloc(32, 7).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD;
  });

  const payload = { tenantId: 1, conversationId: 7, sessionId: 5, reason: 'user_request' };

  function build(opts: {
    mode?: string;
    cred?: boolean;
    email?: string | null;
    existingRef?: Partial<ExternalTicket> | null;
    messages?: Array<Partial<Message>>;
  }) {
    let savedRef: Partial<ExternalTicket> | null = null;
    const extRepo = {
      findOne: jest.fn(async () => opts.existingRef ?? null),
      save: jest.fn(async (e: ExternalTicket) => {
        savedRef = e;
        return e;
      }),
      create: (e: Partial<ExternalTicket>) => e as ExternalTicket,
    } as unknown as Repository<ExternalTicket>;
    const tenantRepo = {
      findOne: jest.fn(async () => ({ id: 1, workflowMode: opts.mode ?? 'bridge' }) as Tenant),
    } as unknown as Repository<Tenant>;
    const msgRepo = {
      find: jest.fn(async () => (opts.messages ?? []) as Message[]),
    } as unknown as Repository<Message>;
    const sessionRepo = {
      findOne: jest.fn(async () => ({ id: 5, customerId: 9 }) as Session),
    } as unknown as Repository<Session>;
    const customerRepo = {
      findOne: jest.fn(async () =>
        opts.email === null ? null : ({ id: 9, email: opts.email ?? 'a@b.com' } as Customer),
      ),
      createQueryBuilder: jest.fn(),
    } as unknown as Repository<Customer>;
    const orderRepo = { find: jest.fn(async () => []) } as unknown as Repository<OrderCache>;
    const credRepo = {
      findOne: jest.fn(async () =>
        opts.cred === false
          ? null
          : ({
              secretEnc: encryptSecret(
                JSON.stringify({ subdomain: 'acme', email: 'agent@acme.com', api_key: 'k' }),
              ),
            } as IntegrationCredential),
      ),
    } as unknown as Repository<IntegrationCredential>;
    const convRepo = {
      findOne: jest.fn(async () => ({ id: 7, sessionId: 5 })),
    } as unknown as Repository<Conversation>;
    const bus = { subscribe: jest.fn(), publish: jest.fn() } as never;
    const svc = new ExternalTicketService(
      extRepo,
      tenantRepo,
      msgRepo,
      sessionRepo,
      customerRepo,
      orderRepo,
      credRepo,
      convRepo,
      bus,
    );
    return {
      svc,
      extRepo,
      bus: bus as unknown as { publish: jest.Mock },
      getSavedRef: () => savedRef,
    };
  }

  const userMsg = (id: number, body: string): Partial<Message> => ({
    id,
    senderType: 'user',
    body,
    createdAt: new Date('2026-08-08T00:00:00Z'),
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a Gorgias ticket with the transcript and stores the ref + cursor', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 555 }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { svc, getSavedRef } = build({
      messages: [userMsg(1, '환불해 주세요'), { id: 2, senderType: 'ai', body: '안내드립니다', createdAt: new Date() }],
    });
    await svc.relayEscalation(payload);
    expect(getSavedRef()).toMatchObject({ externalId: '555', lastRelayedMessageId: 2 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://acme.gorgias.com/api/tickets');
    const body = JSON.parse(String(init.body)) as {
      customer: { email: string };
      messages: Array<{ from_agent: boolean }>;
    };
    expect(body.customer.email).toBe('a@b.com');
    expect(body.messages[0].from_agent).toBe(false); // customer turn
    expect(body.messages[1].from_agent).toBe(true); // our side
  });

  it.each([
    ['native tenant (mode exclusivity)', { mode: 'native' }],
    ['missing credentials', { cred: false }],
    ['no customer email', { email: null }],
  ] as const)('skips without fetching when %s', async (_why, opt) => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { svc, getSavedRef } = build({ ...opt, messages: [userMsg(1, 'x')] });
    await svc.relayEscalation(payload);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSavedRef()).toBeNull();
  });

  it('re-escalation appends only messages past the cursor and advances it', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { svc, getSavedRef } = build({
      existingRef: { conversationId: 7, provider: 'gorgias', externalId: '555', lastRelayedMessageId: 2 },
      messages: [userMsg(3, '아직 답을 못 받았어요')],
    });
    await svc.relayEscalation(payload);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://acme.gorgias.com/api/tickets/555/messages');
    expect(getSavedRef()).toMatchObject({ lastRelayedMessageId: 3 });
  });
});

/** L2 webhook (P3): token auth, status mirror, close notice, closed→new ticket. */
describe('ExternalTicketService.handleWebhook (P3)', () => {
  const OLD = process.env;
  beforeAll(() => {
    process.env = { ...OLD, CRED_ENC_KEY: Buffer.alloc(32, 7).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD;
  });

  function buildHook(opts: { ref?: Partial<ExternalTicket> | null; secret?: string }) {
    let savedRef: Partial<ExternalTicket> | null = null;
    const extRepo = {
      findOne: jest.fn(async () => opts.ref ?? null),
      save: jest.fn(async (e: ExternalTicket) => {
        savedRef = e;
        return e;
      }),
      create: (e: Partial<ExternalTicket>) => e as ExternalTicket,
    } as unknown as Repository<ExternalTicket>;
    const credRepo = {
      find: jest.fn(async () => [
        {
          tenantId: 1,
          secretEnc: encryptSecret(
            JSON.stringify({
              subdomain: 'acme',
              email: 'a@a.com',
              api_key: 'k',
              webhook_secret: opts.secret ?? 'hook-token',
            }),
          ),
        } as IntegrationCredential,
      ]),
    } as unknown as Repository<IntegrationCredential>;
    const convRepo = {
      findOne: jest.fn(async () => ({ id: 7, sessionId: 5 })),
    } as unknown as Repository<Conversation>;
    const sessionRepo = {
      findOne: jest.fn(async () => ({ id: 5, language: 'KO', customerId: 9 })),
    } as unknown as Repository<Session>;
    const bus = { subscribe: jest.fn(), publish: jest.fn() };
    const svc = new ExternalTicketService(
      extRepo,
      {} as never,
      {} as never,
      sessionRepo,
      {} as never,
      {} as never,
      credRepo,
      convRepo,
      bus as never,
    );
    return { svc, bus, getSavedRef: () => savedRef };
  }

  it('rejects an unknown token (→ controller 401)', async () => {
    const { svc } = buildHook({ secret: 'other' });
    await expect(svc.handleWebhook('wrong', '555', 'closed')).resolves.toBe(false);
  });

  it('mirrors closed and notifies the customer once', async () => {
    const { svc, bus, getSavedRef } = buildHook({
      ref: { tenantId: 1, conversationId: 7, provider: 'gorgias', externalId: '555', status: 'open' },
    });
    await expect(svc.handleWebhook('hook-token', '555', 'closed')).resolves.toBe(true);
    expect(getSavedRef()).toMatchObject({ status: 'closed' });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: 'issue', sessionId: 5 }),
    );
  });

  it('re-escalation after a CLOSED ticket creates a NEW ticket on the same ref (결정 12)', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ id: 777 }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    // Reuse the main harness: existing ref is closed → createTicket path.
    // (buildHook lacks msg/tenant repos, so use the top-level build.)
    const { svc, getSavedRef } = (function () {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      return buildForClosed();
    })();
    await svc.relayEscalation({ tenantId: 1, conversationId: 7, sessionId: 5, reason: 'user_request' });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://acme.gorgias.com/api/tickets');
    expect(getSavedRef()).toMatchObject({ externalId: '777', status: 'open' });
  });
});

/** Closed-ref harness for the re-escalation → new-ticket case. */
function buildForClosed() {
  let savedRef: Partial<ExternalTicket> | null = null;
  const closedRef = {
    tenantId: 1,
    conversationId: 7,
    provider: 'gorgias',
    externalId: '555',
    status: 'closed',
    lastRelayedMessageId: 2,
  } as ExternalTicket;
  const extRepo = {
    findOne: jest.fn(async () => closedRef),
    save: jest.fn(async (e: ExternalTicket) => {
      savedRef = e;
      return e;
    }),
    create: (e: Partial<ExternalTicket>) => e as ExternalTicket,
  } as unknown as Repository<ExternalTicket>;
  const tenantRepo = {
    findOne: jest.fn(async () => ({ id: 1, workflowMode: 'bridge' }) as Tenant),
  } as unknown as Repository<Tenant>;
  const msgRepo = {
    find: jest.fn(async () => [
      { id: 3, senderType: 'user', body: '다시 문의드립니다', createdAt: new Date() } as Message,
    ]),
  } as unknown as Repository<Message>;
  const sessionRepo = {
    findOne: jest.fn(async () => ({ id: 5, customerId: 9 }) as Session),
  } as unknown as Repository<Session>;
  const customerRepo = {
    findOne: jest.fn(async () => ({ id: 9, email: 'a@b.com' }) as Customer),
  } as unknown as Repository<Customer>;
  const orderRepo = { find: jest.fn(async () => []) } as unknown as Repository<OrderCache>;
  const credRepo = {
    findOne: jest.fn(async () => ({
      secretEnc: encryptSecret(
        JSON.stringify({ subdomain: 'acme', email: 'agent@acme.com', api_key: 'k' }),
      ),
    }) as IntegrationCredential),
  } as unknown as Repository<IntegrationCredential>;
  const convRepo = { findOne: jest.fn() } as unknown as Repository<Conversation>;
  const bus = { subscribe: jest.fn(), publish: jest.fn() } as never;
  const svc = new ExternalTicketService(
    extRepo,
    tenantRepo,
    msgRepo,
    sessionRepo,
    customerRepo,
    orderRepo,
    credRepo,
    convRepo,
    bus,
  );
  return { svc, getSavedRef: () => savedRef };
}
