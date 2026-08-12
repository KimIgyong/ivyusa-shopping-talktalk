import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

export const JOB_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const JOB_PHASE = {
  PLANNING: 'planning',
  WRITING: 'writing',
  EMBEDDING: 'embedding',
  DONE: 'done',
} as const;
export type JobPhase = (typeof JOB_PHASE)[keyof typeof JOB_PHASE];

export interface CatalogSyncJob {
  id: string;
  status: JobStatus;
  phase: JobPhase;
  /** Documents written so far, out of the families to process. */
  written: number;
  writeTotal: number;
  /** Documents embedded so far, out of those that changed. */
  embedded: number;
  embedTotal: number;
  /** Final counts, once the run finishes. */
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** A finished job stays readable this long so a reload still shows the outcome. */
const RESULT_TTL_MS = 30 * 60 * 1000;

/**
 * Runs the catalogue conversion outside the request (PLN-260807 P1, D3).
 *
 * The synchronous route returned a 504: nginx gives an upstream 60 seconds to
 * produce a response header, and the run takes ~111 seconds (1,689 documents
 * written, then embedded in batches). The work completed every time — nginx cut
 * the response, not the job — but the operator saw a failure and had no way to
 * tell a stalled run from a finished one.
 *
 * State lives in memory on purpose. The durable record already exists: every
 * finished run writes `knowledge.catalog_synced` to the audit trail with its
 * counts. What memory adds is the *live* view, which is worth nothing after a
 * restart anyway. If the API restarts mid-run the job disappears and the
 * operator re-runs it — the conversion is idempotent, so a second run over
 * finished work reports `unchanged` and re-embeds nothing.
 *
 * One run per tenant at a time. Two concurrent runs would race on the same
 * documents and double the embedding bill for no benefit.
 */
@Injectable()
export class CatalogSyncJobService {
  private readonly logger = new Logger(CatalogSyncJobService.name);
  private readonly jobs = new Map<number, CatalogSyncJob>();

  /** The tenant's current or most recent job, or null once it has aged out. */
  get(tenantId: number): CatalogSyncJob | null {
    const job = this.jobs.get(tenantId);
    if (!job) return null;
    if (job.status !== JOB_STATUS.RUNNING && job.finishedAt) {
      const age = Date.now() - new Date(job.finishedAt).getTime();
      if (age > RESULT_TTL_MS) {
        this.jobs.delete(tenantId);
        return null;
      }
    }
    return job;
  }

  isRunning(tenantId: number): boolean {
    return this.get(tenantId)?.status === JOB_STATUS.RUNNING;
  }

  /**
   * Start a run and return immediately. `work` receives the reporters it should
   * call as it goes; its resolved value becomes the job result.
   */
  start(
    tenantId: number,
    work: (report: {
      write: (done: number, total: number) => void;
      embed: (done: number, total: number) => void;
    }) => Promise<Record<string, unknown>>,
  ): CatalogSyncJob {
    if (this.isRunning(tenantId)) {
      // Not an error the operator caused — the console attaches to the running
      // job instead — but the API must refuse to start a second one.
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.CONFLICT);
    }

    const job: CatalogSyncJob = {
      id: randomUUID(),
      status: JOB_STATUS.RUNNING,
      phase: JOB_PHASE.PLANNING,
      written: 0,
      writeTotal: 0,
      embedded: 0,
      embedTotal: 0,
      result: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(tenantId, job);

    const report = {
      write: (done: number, total: number) => {
        job.phase = JOB_PHASE.WRITING;
        job.written = done;
        job.writeTotal = total;
      },
      embed: (done: number, total: number) => {
        job.phase = JOB_PHASE.EMBEDDING;
        // The write phase is over once embedding starts; show it complete
        // rather than frozen one short of the total.
        job.written = job.writeTotal;
        job.embedded = done;
        job.embedTotal = total;
      },
    };

    // Detached on purpose: the caller has already returned 202.
    void work(report)
      .then((result) => {
        job.result = result;
        job.status = JOB_STATUS.SUCCEEDED;
        job.embedded = job.embedTotal;
        job.written = job.writeTotal;
      })
      .catch((e: Error) => {
        job.status = JOB_STATUS.FAILED;
        job.error = e.message;
        this.logger.error(`catalog sync job failed (tenant ${tenantId}): ${e.message}`);
      })
      .finally(() => {
        job.phase = JOB_PHASE.DONE;
        job.finishedAt = new Date().toISOString();
      });

    return job;
  }
}
