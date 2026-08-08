import { Repository } from 'typeorm';
import { ExternalTicketService } from './external-ticket.service';
import { ExternalTicket } from './entity/external-ticket.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { Message } from '../chat/entity/message.entity';
import { Session } from '../session/entity/session.entity';
import { Customer } from '../customer/entity/customer.entity';
import { OrderCache } from '../order/entity/order-cache.entity';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
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
    const bus = { subscribe: jest.fn() } as never;
    const svc = new ExternalTicketService(
      extRepo,
      tenantRepo,
      msgRepo,
      sessionRepo,
      customerRepo,
      orderRepo,
      credRepo,
      bus,
    );
    return { svc, extRepo, getSavedRef: () => savedRef };
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
