import { CatalogSyncJobService, JOB_PHASE, JOB_STATUS } from './catalog-sync-job.service';

/** Resolvable promise so a test can hold a job "in flight" and inspect it. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('CatalogSyncJobService', () => {
  let svc: CatalogSyncJobService;

  beforeEach(() => {
    svc = new CatalogSyncJobService();
  });

  it('returns immediately while the work is still running', async () => {
    const d = deferred<Record<string, unknown>>();

    const job = svc.start(1, () => d.promise);

    expect(job.status).toBe(JOB_STATUS.RUNNING);
    expect(svc.isRunning(1)).toBe(true);
    d.resolve({ created: 3 });
    await flush();
  });

  it('reports progress through both phases', async () => {
    const d = deferred<Record<string, unknown>>();
    let report!: Parameters<Parameters<CatalogSyncJobService['start']>[1]>[0];
    svc.start(1, (r) => {
      report = r;
      return d.promise;
    });

    report.write(120, 1828);
    expect(svc.get(1)).toMatchObject({
      phase: JOB_PHASE.WRITING,
      written: 120,
      writeTotal: 1828,
    });

    report.embed(64, 1689);
    expect(svc.get(1)).toMatchObject({
      phase: JOB_PHASE.EMBEDDING,
      embedded: 64,
      embedTotal: 1689,
      // The write phase is done once embedding starts — showing it frozen one
      // short of the total reads as a stall.
      written: 1828,
    });

    d.resolve({ created: 1689 });
    await flush();
  });

  it('records the result and completes both bars on success', async () => {
    const d = deferred<Record<string, unknown>>();
    let report!: Parameters<Parameters<CatalogSyncJobService['start']>[1]>[0];
    svc.start(1, (r) => {
      report = r;
      return d.promise;
    });
    report.embed(1600, 1689);

    d.resolve({ created: 1689, embedFailed: 0 });
    await flush();

    expect(svc.get(1)).toMatchObject({
      status: JOB_STATUS.SUCCEEDED,
      phase: JOB_PHASE.DONE,
      embedded: 1689,
      result: { created: 1689, embedFailed: 0 },
    });
    expect(svc.isRunning(1)).toBe(false);
  });

  it('keeps the failure reason instead of leaving the job running forever', async () => {
    const d = deferred<Record<string, unknown>>();
    svc.start(1, () => d.promise);

    d.reject(new Error('Qdrant unreachable'));
    await flush();

    expect(svc.get(1)).toMatchObject({
      status: JOB_STATUS.FAILED,
      phase: JOB_PHASE.DONE,
      error: 'Qdrant unreachable',
    });
    expect(svc.isRunning(1)).toBe(false);
  });

  it('refuses a second run for the same tenant', async () => {
    const d = deferred<Record<string, unknown>>();
    svc.start(1, () => d.promise);

    expect(() => svc.start(1, async () => ({}))).toThrow();

    d.resolve({});
    await flush();
    // Once finished, a fresh run is allowed again.
    expect(() => svc.start(1, async () => ({}))).not.toThrow();
  });

  it('runs tenants independently', async () => {
    const a = deferred<Record<string, unknown>>();
    const b = deferred<Record<string, unknown>>();

    svc.start(1, () => a.promise);
    expect(() => svc.start(2, () => b.promise)).not.toThrow();

    expect(svc.isRunning(1)).toBe(true);
    expect(svc.isRunning(2)).toBe(true);
    a.resolve({});
    b.resolve({});
    await flush();
  });

  it('has nothing to report for a tenant that never ran one', () => {
    expect(svc.get(99)).toBeNull();
  });
});
