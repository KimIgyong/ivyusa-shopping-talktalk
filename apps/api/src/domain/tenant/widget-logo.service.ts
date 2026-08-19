import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import type { ReadStream } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join, normalize, resolve, sep } from 'path';
import type { WidgetLogo } from '@ivy/types';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Raw upload as multer hands it over (memory storage). */
export interface LogoUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_BYTES = 1024 * 1024;
/** Bigger than any header needs; anything larger is downscaled, not refused. */
const MAX_WIDTH = 1000;
const MAX_HEIGHT = 400;

type SharpFactory = typeof import('sharp');

interface LogoSpec {
  ext: string;
  mime: string;
  sniff: (b: Buffer) => boolean;
}

const startsWith = (b: Buffer, bytes: number[], offset = 0): boolean =>
  b.length >= offset + bytes.length && bytes.every((v, i) => b[offset + i] === v);

const ascii = (b: Buffer, text: string, offset = 0): boolean =>
  b.length >= offset + text.length && b.toString('latin1', offset, offset + text.length) === text;

/**
 * SVG is deliberately absent, for the same reason it is absent from chat
 * attachments: it is a script-execution vector served from our own origin, and
 * this file is served to every visitor of the storefront.
 */
const SPECS: LogoSpec[] = [
  { ext: 'png', mime: 'image/png', sniff: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { ext: 'jpg', mime: 'image/jpeg', sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    ext: 'webp',
    mime: 'image/webp',
    sniff: (b) => ascii(b, 'RIFF') && ascii(b, 'WEBP', 8),
  },
];

/**
 * Tenant brand mark (PLN-260819 S4 FR-T1).
 *
 * Stored beside chat attachments on the same volume but under `branding/`, and
 * deliberately NOT in `message_attachments`: that table is keyed to
 * conversations, and retention, DSAR and tenant purge all delete along that
 * axis. A logo is tenant configuration, not customer data — filed there, it
 * would disappear the day a retention window closed.
 */
@Injectable()
export class WidgetLogoService {
  private readonly logger = new Logger(WidgetLogoService.name);
  private sharpModule: SharpFactory | null | undefined;

  constructor(private readonly config: ConfigService) {}

  private uploadDir(): string {
    return resolve(this.config.get<string>('UPLOAD_DIR', './.uploads'));
  }

  /** Same path-escape guard the attachment store uses; paths are machine-built. */
  private absolutePath(relative: string): string {
    const root = this.uploadDir();
    const full = resolve(root, normalize(relative));
    if (full !== root && !full.startsWith(root + sep)) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_STORAGE_FAILED, HttpStatus.BAD_REQUEST);
    }
    return full;
  }

  private relativePath(tenantId: number, logo: Pick<WidgetLogo, 'id' | 'ext'>): string {
    return join(String(tenantId), 'branding', `${logo.id}.${logo.ext}`);
  }

  private sharp(): SharpFactory | null {
    if (this.sharpModule !== undefined) return this.sharpModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.sharpModule = require('sharp') as SharpFactory;
    } catch (err) {
      this.logger.warn(`sharp unavailable — logo upload disabled: ${String(err)}`);
      this.sharpModule = null;
    }
    return this.sharpModule;
  }

  /**
   * Validate, re-encode and store. Fail-closed: without sharp we refuse rather
   * than storing the upload untouched, because the re-encode is also what strips
   * EXIF — a brand file with the photographer's GPS in it would otherwise be
   * served to every visitor.
   */
  async store(tenantId: number, file: LogoUpload): Promise<WidgetLogo> {
    if (!file?.buffer?.length) {
      throw new BusinessException(ERROR_CODE.WIDGET_LOGO_REJECTED, HttpStatus.BAD_REQUEST);
    }
    if (file.buffer.length > MAX_BYTES) {
      this.logger.warn(`logo rejected: ${file.buffer.length} bytes (tenant ${tenantId})`);
      throw new BusinessException(ERROR_CODE.WIDGET_LOGO_REJECTED, HttpStatus.BAD_REQUEST);
    }
    const head = file.buffer.subarray(0, 32);
    const spec = SPECS.find((s) => s.sniff(head));
    if (!spec) {
      this.logger.warn(`logo rejected: unsupported or mislabelled image (tenant ${tenantId})`);
      throw new BusinessException(ERROR_CODE.WIDGET_LOGO_REJECTED, HttpStatus.BAD_REQUEST);
    }

    const sharp = this.sharp();
    if (!sharp) {
      throw new BusinessException(ERROR_CODE.WIDGET_LOGO_REJECTED, HttpStatus.BAD_REQUEST);
    }

    let bytes: Buffer;
    let width: number;
    let height: number;
    try {
      const pipeline = sharp(file.buffer)
        .rotate()
        // `inside` + withoutEnlargement: a small logo is left alone, an oversized
        // one is fitted — never stretched, never padded.
        .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true });
      bytes = await (spec.ext === 'png'
        ? pipeline.png()
        : spec.ext === 'webp'
          ? pipeline.webp({ quality: 90 })
          : pipeline.jpeg({ quality: 90 })
      ).toBuffer();
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      if (!width || !height) throw new Error('re-encoded logo has no dimensions');
    } catch (err) {
      this.logger.warn(`logo rejected: could not process (tenant ${tenantId}): ${String(err)}`);
      throw new BusinessException(ERROR_CODE.WIDGET_LOGO_REJECTED, HttpStatus.BAD_REQUEST);
    }

    const logo: WidgetLogo = {
      id: randomUUID(),
      ext: spec.ext,
      mime: spec.mime,
      width,
      height,
    };
    const relative = this.relativePath(tenantId, logo);
    const full = this.absolutePath(relative);
    try {
      await fs.mkdir(dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
    } catch (err) {
      this.logger.error(`logo write failed (${relative}): ${String(err)}`);
      throw new BusinessException(
        ERROR_CODE.ATTACHMENT_STORAGE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return logo;
  }

  openStream(tenantId: number, logo: Pick<WidgetLogo, 'id' | 'ext'>): ReadStream {
    return createReadStream(this.absolutePath(this.relativePath(tenantId, logo)));
  }

  /** Best-effort: a missing file is the desired end state, not a failure. */
  async remove(tenantId: number, logo: Pick<WidgetLogo, 'id' | 'ext'> | null | undefined): Promise<void> {
    if (!logo?.id) return;
    try {
      await fs.unlink(this.absolutePath(this.relativePath(tenantId, logo)));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.logger.warn(`logo delete failed: ${String(err)}`);
    }
  }
}
