import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { Worker } from 'worker_threads';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import type { DecodeResponse } from './heic-decode.worker';

export interface DecodedImage {
  width: number;
  height: number;
  /** Raw RGBA, ready to hand to sharp with `{ raw: { width, height, channels: 4 } }`. */
  data: Buffer;
}

interface Job {
  id: number;
  bytes: Buffer;
  resolve: (image: DecodedImage) => void;
  reject: (err: Error) => void;
  /** Started at enqueue, so a long queue counts against the deadline too. */
  timer: NodeJS.Timeout;
  settled: boolean;
}

/** A worker plus the job it is currently running (null when idle). */
interface Pooled {
  worker: Worker;
  job: Job | null;
}

const DEFAULT_WORKERS = 2;
const DEFAULT_TIMEOUT_MS = 15_000;
/** 50 megapixels — an iPhone tops out around 48MP, so this admits every phone photo. */
const DEFAULT_MAX_MEGAPIXELS = 50;
/**
 * Ceiling on waiting decodes. Each one pins its upload buffer (up to 10MB) in
 * memory, so an unbounded queue turns a burst of uploads into heap growth and
 * requests that hang for as long as the queue is deep.
 */
const DEFAULT_MAX_QUEUE = 32;

/**
 * Bounded pool of HEIF decode workers (PLN-260817 §2.1).
 *
 * The pool exists for two reasons the request thread cannot provide: decoding
 * is ~1s of synchronous CPU per photo, and the raw result is ~48MB for a 12MP
 * image. Unbounded concurrency would turn five simultaneous uploads into five
 * seconds of dead API and a quarter-gigabyte of live buffers.
 */
@Injectable()
export class ImageDecodeService implements OnModuleDestroy {
  private readonly logger = new Logger(ImageDecodeService.name);
  /** Every worker the pool owns, idle or busy. */
  private readonly pool: Pooled[] = [];
  private readonly queue: Job[] = [];
  private nextJobId = 1;
  private destroyed = false;

  constructor(private readonly config: ConfigService) {}

  private setting(key: string, fallback: number): number {
    const raw = Number(this.config.get<string | number>(key, fallback));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  private poolSize(): number {
    return Math.floor(this.setting('HEIC_WORKERS', DEFAULT_WORKERS));
  }

  private timeoutMs(): number {
    return this.setting('HEIC_DECODE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  }

  private maxQueue(): number {
    return Math.floor(this.setting('HEIC_MAX_QUEUE', DEFAULT_MAX_QUEUE));
  }

  maxPixels(): number {
    return Math.floor(this.setting('ATTACHMENT_MAX_MEGAPIXELS', DEFAULT_MAX_MEGAPIXELS) * 1_000_000);
  }

  /** Live worker count — used by tests to assert the pool is actually bounded. */
  get workerCount(): number {
    return this.pool.length;
  }

  /**
   * Decode HEIC/HEIF bytes to raw RGBA.
   *
   * Throws a BusinessException the caller can surface as-is: E5043 when the
   * image is too many pixels, E5044 when the pool is saturated, E5042 for
   * anything else (corrupt file, codec we cannot read, timeout). It never
   * resolves with "no thumbnail" — a HEIC we cannot decode must not be stored
   * (PLN §2.1-2).
   */
  async decodeHeif(bytes: Buffer): Promise<DecodedImage> {
    if (this.destroyed) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (this.queue.length >= this.maxQueue()) {
      // Failing fast beats a request that hangs for a minute and then fails.
      this.logger.warn(`heic decode queue full (${this.queue.length}) — upload rejected`);
      throw new BusinessException(ERROR_CODE.ATTACHMENT_BUSY, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return new Promise<DecodedImage>((resolve, reject) => {
      const job: Job = {
        id: this.nextJobId++,
        bytes,
        resolve,
        reject,
        settled: false,
        // Armed here, not when a worker picks it up: time spent waiting is time
        // the caller's request is hanging, and it has to count.
        timer: setTimeout(() => this.expire(job), this.timeoutMs()),
      };
      this.queue.push(job);
      this.pump();
    });
  }

  /** Hand queued jobs to free workers, spawning up to the pool size. */
  private pump(): void {
    while (this.queue.length) {
      let slot = this.pool.find((p) => p.job === null);
      if (!slot) {
        if (this.pool.length >= this.poolSize()) return; // all busy; a finishing worker resumes this
        slot = this.spawn();
      }
      const job = this.queue.shift();
      if (!job) return;
      if (job.settled) continue; // timed out while queued
      this.dispatch(slot, job);
    }
  }

  private spawn(): Pooled {
    // The running app is always the compiled output, so the sibling .js is the
    // real path. Under ts-jest there is no dist, and a worker that cannot be
    // found would turn every decode into a silent E5042 — so tests exercise the
    // .ts through ts-node instead of skipping the pool entirely.
    const compiled = join(__dirname, 'heic-decode.worker.js');
    const source = join(__dirname, 'heic-decode.worker.ts');
    const useSource = !existsSync(compiled) && existsSync(source);
    const worker = new Worker(useSource ? source : compiled, {
      execArgv: useSource ? ['-r', 'ts-node/register/transpile-only'] : undefined,
    });
    worker.unref(); // a decode in flight must not hold the process open on shutdown

    const slot: Pooled = { worker, job: null };
    // These listeners live as long as the worker does. Removing them while the
    // worker sits idle — as an earlier version did — leaves an EventEmitter with
    // no 'error' handler, and one crashed worker would take the API down with it.
    worker.on('message', (res: DecodeResponse) => this.onMessage(slot, res));
    worker.on('error', (err: Error) => this.onDeath(slot, `error: ${err.message}`));
    worker.on('exit', (code: number) => this.onDeath(slot, `exited (${code})`));

    this.pool.push(slot);
    return slot;
  }

  private dispatch(slot: Pooled, job: Job): void {
    slot.job = job;
    // The buffer is transferred, so it must be a copy the caller no longer
    // needs — `store()` keeps its own reference to the original upload.
    const transferable = job.bytes.buffer.slice(
      job.bytes.byteOffset,
      job.bytes.byteOffset + job.bytes.byteLength,
    ) as ArrayBuffer;
    slot.worker.postMessage({ id: job.id, buffer: transferable, maxPixels: this.maxPixels() }, [
      transferable,
    ]);
  }

  private onMessage(slot: Pooled, res: DecodeResponse): void {
    const job = slot.job;
    if (!job || res.id !== job.id) return;
    slot.job = null;

    if (!job.settled) {
      job.settled = true;
      clearTimeout(job.timer);
      if (res.ok) {
        job.resolve({ width: res.width, height: res.height, data: Buffer.from(res.data) });
      } else if (res.reason === 'pixels') {
        this.logger.warn(`heic decode rejected: ${res.message}`);
        job.reject(
          new BusinessException(ERROR_CODE.ATTACHMENT_PIXELS_EXCEEDED, HttpStatus.BAD_REQUEST),
        );
      } else {
        this.logger.warn(`heic decode failed: ${res.message}`);
        job.reject(
          new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST),
        );
      }
    }
    this.pump();
  }

  /** A worker died — with or without a job on it. Drop it and carry on. */
  private onDeath(slot: Pooled, why: string): void {
    const at = this.pool.indexOf(slot);
    if (at >= 0) this.pool.splice(at, 1);

    const job = slot.job;
    slot.job = null;
    if (job && !job.settled) {
      job.settled = true;
      clearTimeout(job.timer);
      this.logger.warn(`heic decode worker ${why}`);
      job.reject(new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST));
    } else if (!this.destroyed) {
      this.logger.warn(`heic decode worker ${why} while idle`);
    }
    if (!this.destroyed) this.pump();
  }

  /**
   * Deadline reached, whether the job was queued or running. A worker mid-decode
   * is inside synchronous WASM and cannot answer a "stop" message, so the only
   * way to reclaim it is to kill it.
   */
  private expire(job: Job): void {
    if (job.settled) return;
    job.settled = true;
    this.logger.warn(`heic decode timed out after ${this.timeoutMs()}ms`);
    job.reject(new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST));

    const slot = this.pool.find((p) => p.job === job);
    if (slot) {
      slot.job = null;
      void slot.worker.terminate(); // 'exit' fires → onDeath removes it from the pool
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    // Nothing will ever run these; leaving them pending would hang shutdown for
    // whoever is awaiting them.
    for (const job of this.queue.splice(0, this.queue.length)) {
      if (job.settled) continue;
      job.settled = true;
      clearTimeout(job.timer);
      job.reject(new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST));
    }
    const slots = this.pool.splice(0, this.pool.length);
    for (const slot of slots) {
      if (slot.job && !slot.job.settled) {
        slot.job.settled = true;
        clearTimeout(slot.job.timer);
        slot.job.reject(
          new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST),
        );
      }
    }
    await Promise.all(slots.map((s) => s.worker.terminate()));
  }
}
