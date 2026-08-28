import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

export const INGEST_STATUS = {
  RUNNING: 'running',
  READY: 'ready',
  CONSUMED: 'consumed',
  FAILED: 'failed',
} as const;
export type IngestStatus = (typeof INGEST_STATUS)[keyof typeof INGEST_STATUS];

export const INGEST_PHASE = {
  EXTRACTING: 'extracting',
  ANALYZING: 'analyzing',
  DONE: 'done',
} as const;
export type IngestPhase = (typeof INGEST_PHASE)[keyof typeof INGEST_PHASE];

export interface IngestDraft {
  title: string;
  category: string;
  content: string;
  /** True when this draft is a parse-failure fallback (whole chunk, P3-4). */
  fallback: boolean;
}

export interface IngestJob {
  id: string;
  status: IngestStatus;
  phase: IngestPhase;
  /** Chunks analyzed so far, out of the total. */
  analyzed: number;
  analyzeTotal: number;
  /** What is being ingested — filename or video title. */
  sourceLabel: string;
  /** file_upload | youtube */
  sourceKind: string;
  docGroup: string;
  /** kb_files row id backing the upload; null for a video. */
  fileId: number | null;
  /** Where the knowledge came from (video URL; file download path later). */
  sourceUrl: string | null;
  truncated: boolean;
  drafts: IngestDraft[];
  error: string | null;
  /** Result of the approve step, once consumed. */
  result: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
}

/** A finished job stays readable this long so a reload still shows the outcome. */
const RESULT_TTL_MS = 60 * 60 * 1000;

/**
 * In-memory ingest job per tenant (PLN-260829 P3-1/P3-10, catalog-sync-job
 * pattern). Drafts live only here: they are proposals, not knowledge — the
 * durable record is written at approve time (documents + audit). A restart
 * mid-analysis loses the live view only; the original file survives in
 * kb_files and a re-run re-creates the drafts.
 */
@Injectable()
export class KnowledgeIngestJobService {
  private readonly logger = new Logger(KnowledgeIngestJobService.name);
  private readonly jobs = new Map<number, IngestJob>();

  get(tenantId: number): IngestJob | null {
    const job = this.jobs.get(tenantId);
    if (!job) return null;
    if (job.status !== INGEST_STATUS.RUNNING && job.finishedAt) {
      const age = Date.now() - new Date(job.finishedAt).getTime();
      if (age > RESULT_TTL_MS) {
        this.jobs.delete(tenantId);
        return null;
      }
    }
    return job;
  }

  /** The tenant's job only if its drafts are ready to approve. */
  ready(tenantId: number): IngestJob {
    const job = this.get(tenantId);
    if (!job || job.status !== INGEST_STATUS.READY) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return job;
  }

  markConsumed(tenantId: number, result: Record<string, unknown>): void {
    const job = this.jobs.get(tenantId);
    if (!job) return;
    job.status = INGEST_STATUS.CONSUMED;
    job.result = result;
  }

  start(
    tenantId: number,
    meta: {
      sourceLabel: string;
      sourceKind: string;
      docGroup: string;
      fileId: number | null;
      sourceUrl: string | null;
    },
    work: (report: {
      analyzing: (done: number, total: number) => void;
      extracted: (truncated: boolean, sourceLabel?: string) => void;
    }) => Promise<IngestDraft[]>,
  ): IngestJob {
    if (this.get(tenantId)?.status === INGEST_STATUS.RUNNING) {
      throw new BusinessException(ERROR_CODE.INGEST_JOB_RUNNING, HttpStatus.CONFLICT);
    }

    const job: IngestJob = {
      id: randomUUID(),
      status: INGEST_STATUS.RUNNING,
      phase: INGEST_PHASE.EXTRACTING,
      analyzed: 0,
      analyzeTotal: 0,
      truncated: false,
      drafts: [],
      error: null,
      result: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      ...meta,
    };
    this.jobs.set(tenantId, job);

    const report = {
      extracted: (truncated: boolean, sourceLabel?: string) => {
        job.truncated = truncated;
        // A video learns its real title only after the page is fetched.
        if (sourceLabel) job.sourceLabel = sourceLabel;
        job.phase = INGEST_PHASE.ANALYZING;
      },
      analyzing: (done: number, total: number) => {
        job.analyzed = done;
        job.analyzeTotal = total;
      },
    };

    // Detached on purpose: the caller has already returned 202.
    void work(report)
      .then((drafts) => {
        job.drafts = drafts;
        job.analyzed = job.analyzeTotal;
        job.status = INGEST_STATUS.READY;
      })
      .catch((e: Error & { errorCode?: string }) => {
        job.status = INGEST_STATUS.FAILED;
        // BusinessException codes localize client-side; anything else is text.
        job.error = e.errorCode ?? e.message;
        this.logger.warn(`ingest job failed (tenant ${tenantId}): ${e.message}`);
      })
      .finally(() => {
        job.phase = INGEST_PHASE.DONE;
        job.finishedAt = new Date().toISOString();
      });

    return job;
  }
}
