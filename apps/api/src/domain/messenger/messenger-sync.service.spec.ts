import { Repository } from 'typeorm';
import { MessengerSyncService } from './messenger-sync.service';
import { MessengerChannel } from './entity/messenger-channel.entity';
import { ChannelThread } from './entity/channel-thread.entity';
import { AdapterRegistry } from './adapter/adapter.registry';
import { MessengerAdapter } from './adapter/messenger-adapter';
import { MessengerIngestService } from './messenger-ingest.service';
import { encryptChannelSecret } from './messenger-secret.util';

/** Poll driver (PLN-260810 PR-M2): cursor hand-off, error isolation, gating. */
describe('MessengerSyncService', () => {
  const OLD = process.env;
  beforeAll(() => {
    process.env = { ...OLD, CRED_ENC_KEY: Buffer.alloc(32, 9).toString('base64') };
  });
  afterAll(() => {
    process.env = OLD;
  });

  function build(opts: {
    channels?: Array<Partial<MessengerChannel>>;
    threads?: Array<Partial<ChannelThread>>;
    pull?: MessengerAdapter['pull'];
    kind?: 'poll' | 'webhook';
  }) {
    const channels = (opts.channels ?? [
      { id: 7, tenantId: 1, provider: 'amoebatalk', active: 1, secretEnc: encryptChannelSecret({ email: 'a', password: 'b' }) },
    ]) as MessengerChannel[];

    const channelUpdates: Array<Partial<MessengerChannel>> = [];
    const channelRepo = {
      find: jest.fn(async () => channels),
      update: jest.fn(async (_w: unknown, patch: Partial<MessengerChannel>) => {
        channelUpdates.push(patch);
        return { affected: 1 };
      }),
    } as unknown as Repository<MessengerChannel>;

    const threadRepo = {
      find: jest.fn(async () => (opts.threads ?? []) as ChannelThread[]),
    } as unknown as Repository<ChannelThread>;

    const adapter = {
      provider: 'amoebatalk',
      kind: opts.kind ?? 'poll',
      test: jest.fn(),
      send: jest.fn(),
      pull: opts.pull ?? jest.fn(async () => []),
    } as unknown as MessengerAdapter;
    const registry = { find: () => adapter } as unknown as AdapterRegistry;

    const ingest = { ingestBatch: jest.fn(async () => undefined) } as unknown as MessengerIngestService;

    const service = new MessengerSyncService(channelRepo, threadRepo, registry, ingest);
    return { service, adapter, ingest, channelUpdates };
  }

  it('hands the adapter the cursors it needs and ingests the result', async () => {
    const pull = jest.fn(async () => [
      {
        externalThreadId: '12',
        externalMessageId: '102',
        externalUserId: null,
        externalUserName: null,
        text: 'hi',
        languageHint: null,
        subChannel: 'zalo',
        replyEnabled: true,
        occurredAt: null,
      },
    ]);
    const h = build({
      threads: [{ externalThreadId: '12', inboundCursor: '100', lastInboundAt: new Date('2026-08-10') }],
      pull,
    });

    await h.service.tick();

    expect(pull).toHaveBeenCalledWith(
      expect.anything(),
      [{ externalThreadId: '12', inboundCursor: '100', lastInboundAt: new Date('2026-08-10') }],
    );
    expect(h.ingest.ingestBatch).toHaveBeenCalled();
    expect(h.channelUpdates[0]).toMatchObject({ status: 'connected', lastError: null });
  });

  it('skips webhook-kind channels — they are pushed to, not polled', async () => {
    const h = build({ kind: 'webhook' });
    await h.service.tick();
    expect(h.adapter.pull).not.toHaveBeenCalled();
  });

  it('records a channel error instead of failing the whole tick', async () => {
    const h = build({
      pull: jest.fn(async () => {
        throw new Error('amoebatalk GET /api/inbox/conversations failed: 401');
      }),
    });

    await expect(h.service.tick()).resolves.toBeUndefined();
    expect(h.channelUpdates[0]).toMatchObject({ status: 'error' });
    expect(h.channelUpdates[0].lastError).toContain('401');
  });

  it('refuses to poll a channel with no stored credential', async () => {
    const h = build({ channels: [{ id: 7, tenantId: 1, provider: 'amoebatalk', active: 1, secretEnc: null }] });
    await h.service.tick();
    expect(h.adapter.pull).not.toHaveBeenCalled();
    expect(h.channelUpdates[0]).toMatchObject({ status: 'error', lastError: 'credential not set' });
  });
});
