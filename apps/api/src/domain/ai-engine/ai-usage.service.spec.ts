import { AiUsageService } from './ai-usage.service';
import { ENGINE_OWNER } from './entity/ai-usage-daily.entity';

describe('AiUsageService.ownerOf', () => {
  it('reads a null tenant as the platform, because that is who the invoice reaches', () => {
    expect(AiUsageService.ownerOf(null)).toBe(ENGINE_OWNER.PLATFORM);
    expect(AiUsageService.ownerOf(undefined)).toBe(ENGINE_OWNER.PLATFORM);
    expect(AiUsageService.ownerOf(4)).toBe(ENGINE_OWNER.TENANT);
  });
});

describe('AiUsageService', () => {
  const build = (rows: any[] = []) => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const repo = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return [];
      }),
      find: jest.fn(async () => rows),
      findOne: jest.fn(async () => rows[0] ?? null),
    };
    return { svc: new AiUsageService(repo as never), queries };
  };

  describe('record', () => {
    it('accumulates rather than overwrites', async () => {
      // Two conversations finishing in the same second must both be counted; a
      // read-modify-write would lose one.
      const { svc, queries } = build();

      await svc.record(
        {
          tenantId: 1,
          feature: 'chat_answer',
          aiFunction: 'chat',
          engineId: 5,
          provider: 'anthropic',
          model: 'claude-opus-4-8',
          engineOwner: ENGINE_OWNER.TENANT,
          tokensIn: 100,
          tokensOut: 20,
        },
        new Date('2026-08-24T10:00:00Z'),
      );

      expect(queries[0].sql).toContain('ON DUPLICATE KEY UPDATE');
      expect(queries[0].sql).toContain('calls      = calls + 1');
      expect(queries[0].sql).toContain('tokens_in  = tokens_in + VALUES(tokens_in)');
      expect(queries[0].params.slice(0, 4)).toEqual([1, '2026-08-24', 'chat_answer', 'chat']);
    });

    it('files an unlabelled call under its function instead of dropping it', async () => {
      const { svc, queries } = build();

      await svc.record({
        tenantId: 1,
        feature: '',
        aiFunction: 'summary',
        engineId: null,
        provider: 'stub',
        model: 'stub-1',
        engineOwner: ENGINE_OWNER.PLATFORM,
        tokensIn: 0,
        tokensOut: 0,
      });

      expect(queries[0].params[2]).toBe('summary');
    });

    it('counts a stub fallback apart from a real answer', async () => {
      // The stub spends no tokens. Folded into the totals it reads as cheap
      // traffic instead of an engine that is not answering.
      const { svc, queries } = build();

      await svc.record({
        tenantId: 1,
        feature: 'chat_answer',
        aiFunction: 'chat',
        engineId: 5,
        provider: 'anthropic',
        model: 'claude-opus-4-8',
        engineOwner: ENGINE_OWNER.TENANT,
        tokensIn: 0,
        tokensOut: 0,
        stub: true,
        failed: true,
      });

      const p = queries[0].params;
      expect(p[p.length - 2]).toBe(1); // stub_calls
      expect(p[p.length - 1]).toBe(1); // failures
    });
  });

  describe('summarize', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      feature: 'chat_answer',
      aiFunction: 'chat',
      engineId: 5,
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      engineOwner: ENGINE_OWNER.TENANT,
      statDate: '2026-08-20',
      calls: 2,
      tokensIn: 100,
      tokensOut: 30,
      stubCalls: 0,
      failures: 0,
      ...over,
    });

    it('sums days into the requested range', async () => {
      // Weeks and months are not stored — they are sums of daily rows.
      const { svc } = build([row(), row({ statDate: '2026-08-21', calls: 3, tokensIn: 50 })]);

      const res = await svc.summarize(1, { from: '2026-08-01', to: '2026-08-31', groupBy: 'feature' });

      expect(res.buckets).toHaveLength(1);
      expect(res.buckets[0]).toMatchObject({ key: 'chat_answer', calls: 5, tokensIn: 150 });
      expect(res.totals.calls).toBe(5);
    });

    it('keeps tenant-paid and platform-paid apart', async () => {
      // Summed together the number matches neither invoice.
      const { svc } = build([
        row({ tokensIn: 100 }),
        row({ engineOwner: ENGINE_OWNER.PLATFORM, engineId: null, tokensIn: 40 }),
      ]);

      const res = await svc.summarize(1, { from: '2026-08-01', to: '2026-08-31', groupBy: 'owner' });

      expect(res.buckets.map((b) => [b.key, b.tokensIn])).toEqual([
        ['tenant', 100],
        ['platform', 40],
      ]);
    });

    it('reports when metering began, so an empty month is not read as no usage', async () => {
      const { svc } = build([row({ statDate: '2026-08-20' })]);

      const res = await svc.summarize(1, { from: '2026-07-01', to: '2026-07-31', groupBy: 'feature' });

      expect(res.since).toBe('2026-08-20');
    });

    it('still reports usage from an engine that has been deleted', async () => {
      const { svc } = build([row({ engineId: null, provider: 'openai', model: 'gpt-5' })]);

      const res = await svc.summarize(1, { from: '2026-08-01', to: '2026-08-31', groupBy: 'engine' });

      expect(res.buckets[0]).toMatchObject({ key: 'removed', label: 'openai / gpt-5' });
    });
  });
});
