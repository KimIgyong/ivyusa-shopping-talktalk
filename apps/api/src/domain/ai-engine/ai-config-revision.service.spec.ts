import { AiConfigRevisionService, type ConfigSnapshot } from './ai-config-revision.service';
import {
  CONFIG_REVISION_KIND,
  type TenantAiConfigRevision,
} from './entity/tenant-ai-config-revision.entity';

/**
 * Config history (FR-073). The persona used to be overwritten in place, so
 * "why does it say this?" had no answer and there was nothing to roll back to.
 * These cases guard the two ways a history stops being trustworthy: missing the
 * state a change replaced, and blocking the change it was supposed to record.
 */

function serviceFor(existingMax: number | null) {
  const saved: TenantAiConfigRevision[] = [];
  const repo = {
    create: (v: Partial<TenantAiConfigRevision>) => v as TenantAiConfigRevision,
    save: async (r: TenantAiConfigRevision) => {
      saved.push(r);
      return r;
    },
    find: async () => saved,
    findOne: async () => saved[0] ?? null,
    createQueryBuilder: () => ({
      select: () => ({
        where: () => ({ getRawOne: async () => ({ max: existingMax }) }),
      }),
    }),
  };
  return { service: new AiConfigRevisionService(repo as never), saved };
}

const snap = (persona: string, rules: string[]): ConfigSnapshot => ({
  persona,
  rules,
  scenarioOverrides: null,
});

describe('AiConfigRevisionService.record', () => {
  it('writes a baseline first so the very first edit has somewhere to roll back to', async () => {
    const { service, saved } = serviceFor(null);
    await service.record(1, snap('new', []), snap('old', []), {
      kind: CONFIG_REVISION_KIND.MANUAL,
      actorUserId: 9,
    });
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ revisionNo: 1, kind: CONFIG_REVISION_KIND.BASELINE, persona: 'old' });
    expect(saved[1]).toMatchObject({ revisionNo: 2, kind: CONFIG_REVISION_KIND.MANUAL, persona: 'new' });
  });

  it('numbers from the highest existing revision, not the row count', async () => {
    // count+1 reuses a number as soon as one row is deleted (code convention §2).
    const { service, saved } = serviceFor(7);
    await service.record(1, snap('b', []), snap('a', []), { kind: CONFIG_REVISION_KIND.MANUAL });
    expect(saved[0].revisionNo).toBe(8);
  });

  it('skips a save that changed nothing rather than littering the history', async () => {
    const { service, saved } = serviceFor(3);
    const same = snap('same', ['r1']);
    const res = await service.record(1, same, snap('same', ['r1']), {
      kind: CONFIG_REVISION_KIND.MANUAL,
    });
    expect(res).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('records which fields moved', async () => {
    const { service, saved } = serviceFor(2);
    await service.record(1, snap('p', ['a', 'b']), snap('p', ['a']), {
      kind: CONFIG_REVISION_KIND.COACHING,
    });
    expect(saved[0].changedFields).toEqual(['rules']);
  });

  it('keeps the coaching rationale as the version note', async () => {
    const { service, saved } = serviceFor(2);
    await service.record(1, snap('p2', []), snap('p1', []), {
      kind: CONFIG_REVISION_KIND.COACHING,
      note: 'Admin wanted warmer refund replies.',
      proposalId: 12,
      actorUserId: 9,
    });
    expect(saved[0]).toMatchObject({
      note: 'Admin wanted warmer refund replies.',
      proposalId: 12,
      actorUserId: 9,
    });
  });

  it('never lets a history failure fail the save it is describing', async () => {
    // The config write has already happened by the time we get here; throwing
    // would fail a save that actually succeeded.
    const repo = {
      create: (v: unknown) => v,
      save: async () => {
        throw new Error('history table is gone');
      },
      createQueryBuilder: () => ({
        select: () => ({ where: () => ({ getRawOne: async () => ({ max: 1 }) }) }),
      }),
    };
    const service = new AiConfigRevisionService(repo as never);
    await expect(
      service.record(1, snap('b', []), snap('a', []), { kind: CONFIG_REVISION_KIND.MANUAL }),
    ).resolves.toBeNull();
  });
});
