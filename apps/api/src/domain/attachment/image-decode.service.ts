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
}

const DEFAULT_WORKERS = 2;
const DEFAULT_TIMEOUT_MS = 15_000;
/** 50 megapixels — an iPhone tops out around 48MP, so this admits every phone photo. */
const DEFAULT_MAX_MEGAPIXELS = 50;

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
  private readonly idle: Worker[] = [];
  private readonly queue: Job[] = [];
  private spawned = 0;
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

  maxPixels(): number {
    return Math.floor(this.setting('ATTACHMENT_MAX_MEGAPIXELS', DEFAULT_MAX_MEGAPIXELS) * 1_000_000);
  }

  /**
   * Decode HEIC/HEIF bytes to raw RGBA.
   *
   * Throws a BusinessException the caller can surface as-is: E5043 when the
   * image is too many pixels, E5042 for anything else (corrupt file, codec we
   * cannot read, worker timeout). It never resolves with "no thumbnail" —
   * a HEIC we cannot decode must not be stored (PLN §2.1-2).
   */
  async decodeHeif(bytes: Buffer): Promise<DecodedImage> {
    if (this.destroyed) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST);
    }
    return new Promise<DecodedImage>((resolve, reject) => {
      this.queue.push({ id: this.nextJobId++, bytes, resolve, reject });
      this.pump();
    });
  }

  /** Hand the next queued job to a free worker, spawning one if allowed. */
  private pump(): void {
    if (!this.queue.length) return;

    let worker = this.idle.pop();
    if (!worker) {
      if (this.spawned >= this.poolSize()) return; // queued; a finishing worker will pick it up
      worker = this.spawn();
    }

    const job = this.queue.shift();
    if (!job) {
      this.idle.push(worker);
      return;
    }
    this.run(worker, job);
  }

  private spawn(): Worker {
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
    this.spawned++;
    return worker;
  }

  private run(worker: Worker, job: Job): void {
    let settled = false;

    const cleanup = (): void => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      clearTimeout(timer);
    };

    /**
     * A worker mid-decode is inside synchronous WASM: it cannot answer a "stop"
     * message, so the only way out is to kill it. The pool shrinks by one and
     * the next job spawns a replacement.
     */
    const discard = (): void => {
      cleanup();
      this.spawned--;
      void worker.terminate();
      this.pump();
    };

    const release = (): void => {
      cleanup();
      this.idle.push(worker);
      this.pump();
    };

    const onMessage = (res: DecodeResponse): void => {
      if (settled || res.id !== job.id) return;
      settled = true;
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
      release();
    };

    const fail = (why: string): void => {
      if (settled) return;
      settled = true;
      this.logger.warn(`heic decode worker ${why}`);
      job.reject(new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST));
      discard();
    };

    const onError = (err: Error): void => fail(`error: ${err.message}`);
    const onExit = (code: number): void => fail(`exited (${code})`);
    const timer = setTimeout(() => fail('timed out'), this.timeoutMs());

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);

    // The source buffer is transferred out of this thread, so it must be a copy
    // the caller no longer needs — `store()` keeps its own reference to the
    // original upload, hence the slice.
    const transferable = job.bytes.buffer.slice(
      job.bytes.byteOffset,
      job.bytes.byteOffset + job.bytes.byteLength,
    ) as ArrayBuffer;
    worker.postMessage({ id: job.id, buffer: transferable, maxPixels: this.maxPixels() }, [
      transferable,
    ]);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    const workers = this.idle.splice(0, this.idle.length);
    await Promise.all(workers.map((w) => w.terminate()));
  }
}
