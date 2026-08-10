import { Repository } from 'typeorm';
import { MessengerService } from './messenger.service';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { AuditService } from '../audit/audit.service';
import { channelField, decryptChannelSecretFields } from './messenger-secret.util';

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
