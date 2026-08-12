import { Repository } from 'typeorm';
import { MessengerService } from './messenger.service';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { AuditService } from '../audit/audit.service';
import {
  channelField,
  decryptChannelSecretFields,
  encryptChannelSecret,
} from './messenger-secret.util';

/**
 * Field routing (FIX-260810). Only `secret: true` fields may be encrypted:
 * everything else has to come back to the console, or an operator reopens the
 * form to blank inputs and cannot see what the channel points at.
 */
describe('MessengerService — field routing', () => {
  const OLD = process.env;
  beforeAll(() => {
    process.env = { ...OLD, CRED_ENC_KEY: Buffer.alloc(32, 13).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD;
  });

  function build(existing?: Partial<MessengerChannel>) {
    let saved: MessengerChannel | null = null;
    const channelRepo = {
      findOne: jest.fn(async () => (existing ?? null) as MessengerChannel | null),
      create: (c: Partial<MessengerChannel>) => ({ id: 1, config: null, ...c }) as MessengerChannel,
      save: jest.fn(async (c: MessengerChannel) => {
        saved = c;
        return c;
      }),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(async () => ({ affected: 1 })),
      find: jest.fn(async () => []),
    } as unknown as Repository<MessengerChannel>;

    const registry = {
      require: () => ({ provider: 'btbz_relay', kind: 'poll' }),
    } as unknown as AdapterRegistry;
    const audit = { write: jest.fn(async () => undefined) } as unknown as AuditService;

    const service = new MessengerService(channelRepo, registry, audit);
    return { service, get saved() { return saved as MessengerChannel | null; } };
  }

  it('stores the mailbox address in config and only the password encrypted', async () => {
    const h = build();
    await h.service.upsert(1, 7, {
      provider: 'btbz_relay',
      label: 'relay',
      secret: {
        base_url: 'https://messenger.amoeba.site',
        email: 'ops@amoeba.group',
        password: 'pw',
      },
    });

    const channel = h.saved as MessengerChannel;
    // Readable back by the console…
    expect(channel.config).toMatchObject({
      base_url: 'https://messenger.amoeba.site',
      email: 'ops@amoeba.group',
    });
    // …and absent from the encrypted blob.
    expect(JSON.stringify(channel.config)).not.toContain('pw');
    expect(channelField(channel, 'email')).toBe('ops@amoeba.group');
    expect(channelField(channel, 'password', { secret: true })).toBe('pw');
  });

  it('keeps a single secret bare so ctx.secret works (telegram)', async () => {
    const h = build();
    await h.service.upsert(1, 7, {
      provider: 'telegram',
      label: 'bot',
      secret: { bot_token: '123:ABC' },
    });

    const channel = h.saved as MessengerChannel;
    expect(decryptChannelSecretFields(channel)).toEqual({});
    expect(channelField(channel, 'bot_token', { secret: true })).toBe('123:ABC');
  });

  it('merges an edit instead of dropping the other stored fields', async () => {
    const h = build({
      id: 1,
      provider: 'btbz_relay',
      config: { base_url: 'https://old.example', email: 'a@b.c' },
    });

    await h.service.update(1, 7, 1, { secret: { email: 'new@b.c' } });

    expect(h.saved?.config).toMatchObject({
      base_url: 'https://old.example',
      email: 'new@b.c',
    });
  });

  it('leaves the stored secret alone when the field is submitted empty', async () => {
    const h = build({ id: 1, provider: 'btbz_relay', secretEnc: Buffer.from('keep-me') });

    await h.service.update(1, 7, 1, { secret: { password: '   ' } });

    expect(h.saved?.secretEnc?.toString()).toBe('keep-me');
  });
});

/**
 * Legacy channels (saved before the split) must become readable on their own —
 * an operator should not have to retype values that are already stored.
 */
describe('MessengerService — legacy field hoist', () => {
  const OLD = process.env;
  beforeAll(() => {
    process.env = { ...OLD, CRED_ENC_KEY: Buffer.alloc(32, 13).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD;
  });

  function build(channel: Partial<MessengerChannel>) {
    const updates: Array<Record<string, unknown>> = [];
    const channelRepo = {
      find: jest.fn(async () => [channel as MessengerChannel]),
      findOne: jest.fn(async () => channel as MessengerChannel),
      update: jest.fn(async (_w: unknown, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { affected: 1 };
      }),
    } as unknown as Repository<MessengerChannel>;
    const service = new MessengerService(
      channelRepo,
      { require: () => ({}) } as unknown as AdapterRegistry,
      { write: jest.fn() } as unknown as AuditService,
    );
    return { service, updates };
  }

  it('surfaces the server URL and email a legacy channel already holds', async () => {
    const h = build({
      id: 1,
      provider: 'btbz_relay',
      config: null,
      secretEnc: encryptChannelSecret({
        base_url: 'https://messenger.amoeba.site/login',
        email: 'admin@amoeba.group',
        password: 'pw',
      }),
    });

    const [channel] = await h.service.list(1);

    expect(channel.config).toEqual({
      base_url: 'https://messenger.amoeba.site/login',
      email: 'admin@amoeba.group',
    });
    // The secret stays out of config, and the move is persisted once.
    expect(JSON.stringify(channel.config)).not.toContain('pw');
    expect(h.updates).toHaveLength(1);
  });

  it('does not overwrite a value the operator already set in config', async () => {
    const h = build({
      id: 1,
      provider: 'btbz_relay',
      config: { base_url: 'https://messenger.amoeba.site' },
      secretEnc: encryptChannelSecret({ base_url: 'https://old.example', password: 'pw' }),
    });

    const [channel] = await h.service.list(1);

    expect(channel.config?.base_url).toBe('https://messenger.amoeba.site');
  });

  it('writes nothing when there is nothing to move', async () => {
    const h = build({
      id: 1,
      provider: 'telegram',
      config: null,
      secretEnc: encryptChannelSecret('123:ABC'),
    });

    await h.service.list(1);

    expect(h.updates).toHaveLength(0);
  });
});
