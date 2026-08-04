import { Repository } from 'typeorm';
import { KbRevisionService } from './kb-revision.service';
import { KbDocument } from './entity/kb-document.entity';
import { KbDocumentRevision } from './entity/kb-document-revision.entity';
import { AuditService } from '../audit/audit.service';

const doc = (over: Partial<KbDocument> = {}): KbDocument =>
  ({
    id: 10,
    tenantId: 1,
    title: 'Shipping fee',
    category: 'policy_shipping',
    content: 'Free shipping over $29.99.',
    sourceUrl: null,
    effectiveFrom: null,
    reviewIntervalDays: null,
    active: 1,
    ...over,
  }) as KbDocument;

describe('KbRevisionService', () => {
  let saved: Array<Partial<KbDocumentRevision>>;
  let audited: Array<Record<string, unknown>>;
  let docSaved: KbDocument[];

  const build = (opts: { existingMax?: number | null; revision?: KbDocumentRevision } = {}) => {
    saved = [];
    audited = [];
    docSaved = [];

    let nextId = 500;
    const revRepo = {
      create: (r: Partial<KbDocumentRevision>) => r as KbDocumentRevision,
      save: jest.fn(async (r: KbDocumentRevision) => {
        const withId = { ...r, id: r.id ?? nextId++ } as KbDocumentRevision;
        saved.push(withId);
        return withId;
      }),
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => opts.revision ?? null),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({ max: opts.existingMax ?? null })),
      })),
    } as unknown as Repository<KbDocumentRevision>;

    const docRepo = {
      findOne: jest.fn(async () => doc()),
      save: jest.fn(async (d: KbDocument) => {
        docSaved.push(d);
        return d;
      }),
    } as unknown as Repository<KbDocument>;

    const audit = {
      write: jest.fn(async (p: Record<string, unknown>) => {
        audited.push(p);
        return undefined;
      }),
    } as unknown as AuditService;

    return new KbRevisionService(docRepo, revRepo, audit);
  };

  it('writes a baseline plus the change on the first ever edit', async () => {
    // Otherwise the first edit after this shipped would be unrollbackable —
    // there would be nothing to roll back *to*.
    const svc = build({ existingMax: null });
    const before = doc();
    await svc.record(1, doc({ content: 'Free shipping over $19.99.' }), before, 'update', 7);

    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      revisionNo: 1,
      changeKind: 'baseline',
      actorUserId: null,
      content: 'Free shipping over $29.99.',
    });
    expect(saved[1]).toMatchObject({
      revisionNo: 2,
      changeKind: 'update',
      actorUserId: 7,
      content: 'Free shipping over $19.99.',
      changedFields: ['content'],
    });
  });

  it('writes only the change once a history exists', async () => {
    const svc = build({ existingMax: 4 });
    await svc.record(1, doc({ title: 'Shipping cost' }), doc(), 'update', 7);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ revisionNo: 5, changedFields: ['title'] });
  });

  it('numbers revisions from MAX + 1, never COUNT + 1', async () => {
    // A deleted or skipped revision would otherwise collide with an existing
    // number (repo convention for per-tenant sequences).
    const svc = build({ existingMax: 9 });
    await svc.record(1, doc({ title: 'x' }), doc(), 'update', 7);
    expect(saved[0].revisionNo).toBe(10);
  });

  it('records nothing when a save changed no tracked field', async () => {
    // Opening the editor and pressing save should not litter the history.
    const svc = build({ existingMax: 3 });
    expect(await svc.record(1, doc(), doc(), 'update', 7)).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('lists every changed field, not just the first', async () => {
    const svc = build({ existingMax: 1 });
    await svc.record(1, doc({ title: 'New', content: 'New body', active: 0 }), doc(), 'update', 7);
    expect(saved[0].changedFields).toEqual(expect.arrayContaining(['title', 'content', 'active']));
  });

  it('treats a date that arrives as a string or a Date as unchanged', async () => {
    // effectiveFrom is a DATE; TypeORM hands it back either way depending on
    // the driver path, and an identity check reported a change on every save.
    const svc = build({ existingMax: 2 });
    const before = doc({ effectiveFrom: '2026-03-01' });
    const after = doc({ effectiveFrom: new Date('2026-03-01') as unknown as string });
    expect(await svc.record(1, after, before, 'update', 7)).toBeNull();
  });

  it('writes an audit entry naming the fields, never the content', async () => {
    const svc = build({ existingMax: 2 });
    await svc.record(1, doc({ content: 'SECRET-BODY-TEXT' }), doc(), 'update', 7);
    expect(audited[0]).toMatchObject({
      action: 'knowledge.document_updated',
      actorId: 7,
      target: 'kb_document:10',
    });
    // The body lives in the revision row, which has a different lifetime.
    expect(JSON.stringify(audited[0].metadata)).not.toContain('SECRET-BODY-TEXT');
    expect(audited[0].metadata).toMatchObject({ changedFields: ['content'], revisionNo: 3 });
  });

  it('a creation records every tracked field and a create-kind revision', async () => {
    const svc = build({ existingMax: null });
    await svc.record(1, doc(), null, 'create', 7);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ revisionNo: 1, changeKind: 'create' });
    expect(audited[0]).toMatchObject({ action: 'knowledge.document_created' });
  });

  it('restoring moves forward: a new revision, history intact', async () => {
    const svc = build({
      existingMax: 3,
      revision: {
        id: 77,
        revisionNo: 2,
        title: 'Old title',
        category: 'policy_shipping',
        content: 'Free shipping over $19.99.',
        sourceUrl: null,
        effectiveFrom: null,
        reviewIntervalDays: null,
        active: 1,
      } as KbDocumentRevision,
    });

    const { doc: restored, contentChanged } = await svc.restore(1, 10, 77, 7);
    expect(restored.title).toBe('Old title');
    expect(contentChanged).toBe(true);
    // Recorded as rev 4 pointing back at rev 2 — nothing is rewritten.
    const rev = saved[saved.length - 1];
    expect(rev).toMatchObject({ revisionNo: 4, changeKind: 'restore', restoredFrom: 2 });
    expect(audited.some((a) => a.action === 'knowledge.document_restored')).toBe(true);
  });

  it('reports contentChanged=false when only metadata differed', async () => {
    // The caller uses this to skip a pointless re-embed.
    const svc = build({
      existingMax: 3,
      revision: {
        id: 77,
        revisionNo: 2,
        title: 'Old title',
        content: 'Free shipping over $29.99.',
        category: null,
        sourceUrl: null,
        effectiveFrom: null,
        reviewIntervalDays: null,
        active: 1,
      } as KbDocumentRevision,
    });
    expect((await svc.restore(1, 10, 77, 7)).contentChanged).toBe(false);
  });

  it('a history failure never blocks the edit that already happened', async () => {
    const svc = build({ existingMax: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).revRepo.save = jest.fn(async () => {
      throw new Error('disk full');
    });
    await expect(svc.record(1, doc({ title: 'x' }), doc(), 'update', 7)).resolves.toBeNull();
  });
});
