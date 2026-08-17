import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import type { ReadStream } from 'fs';
import { dirname, join, normalize, resolve, sep } from 'path';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { MessageAttachment } from './entity/message-attachment.entity';
import {
  ATTACHMENT_KIND,
  AttachmentKind,
  ResolvedType,
  extensionOf,
  resolveType,
  sanitizeFilename,
  withExtension,
} from './file-type.util';
import { ImageDecodeService } from './image-decode.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Raw upload as multer hands it over (memory storage). */
export interface UploadInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadOwner {
  tenantId: number;
  conversationId?: number | null;
  sessionId?: number | null;
  uploaderType: 'user' | 'agent' | 'system';
  uploaderId?: number | null;
  /** widget | console | telegram | viber | hub | gmail */
  source: string;
}

const DEFAULT_MAX_IMAGE_MB = 10;
const DEFAULT_MAX_FILE_MB = 20;
const DEFAULT_MAX_PER_MESSAGE = 5;
/** Uploaded but never sent: swept with its file after this long. */
const UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;
/** Cap on pending (unsent) uploads per session — a public endpoint needs a ceiling. */
const MAX_PENDING_PER_OWNER = 20;
const THUMB_EDGE = 320;
/** Conversion target for HEIC: readable everywhere, and re-usable after download. */
const HEIF_JPEG_QUALITY = 82;

type SharpFactory = typeof import('sharp');

/**
 * Result of the image stage. `ext`/`mime` are set only when the conversion
 * changed the format, in which case they — not the upload — describe the file.
 */
interface ProcessedImage {
  image: Buffer | null;
  thumb: Buffer | null;
  width: number | null;
  height: number | null;
  ext?: string;
  mime?: string;
}

/**
 * Attachment storage (PLN-260814 S1). Files live on a mounted volume, not in the
 * database and not in the container's own filesystem — the API image is rebuilt
 * on every deploy, so anything written outside UPLOAD_DIR is gone by the next one.
 */
@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);
  /** undefined = not probed yet, null = unavailable (thumbnails degrade off). */
  private sharpModule: SharpFactory | null | undefined;

  constructor(
    @InjectRepository(MessageAttachment)
    private readonly attachmentRepo: Repository<MessageAttachment>,
    private readonly config: ConfigService,
    /** Optional so existing unit tests can construct the service with two args. */
    private readonly decoder?: ImageDecodeService,
  ) {}

  // ---- configuration ------------------------------------------------------

  private uploadDir(): string {
    return resolve(this.config.get<string>('UPLOAD_DIR', './.uploads'));
  }

  private numberSetting(key: string, fallback: number): number {
    const raw = Number(this.config.get<string | number>(key, fallback));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  maxBytes(kind: AttachmentKind): number {
    const mb =
      kind === ATTACHMENT_KIND.IMAGE
        ? this.numberSetting('ATTACHMENT_MAX_IMAGE_MB', DEFAULT_MAX_IMAGE_MB)
        : this.numberSetting('ATTACHMENT_MAX_FILE_MB', DEFAULT_MAX_FILE_MB);
    return mb * 1024 * 1024;
  }

  maxPerMessage(): number {
    return this.numberSetting('ATTACHMENT_MAX_PER_MESSAGE', DEFAULT_MAX_PER_MESSAGE);
  }

  /** HEIC acceptance, on by default; `false` restores the pre-PLN-260817 policy. */
  private heicEnabled(): boolean {
    return String(this.config.get('ATTACHMENT_ALLOW_HEIC', 'true')).toLowerCase() !== 'false';
  }

  // ---- upload -------------------------------------------------------------

  /**
   * Validate, transform and persist one upload. Throws a BusinessException the
   * caller can surface as-is; nothing is written to disk before every check has
   * passed, so a rejected upload leaves no trace.
   */
  async store(file: UploadInput, owner: UploadOwner): Promise<MessageAttachment> {
    const head = file.buffer.subarray(0, 64);
    const type = resolveType(file.originalname, file.mimetype, head);
    if (!type) {
      this.logger.warn(`attachment rejected (type): ${extensionOf(file.originalname) || 'none'}`);
      throw new BusinessException(ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED, HttpStatus.BAD_REQUEST);
    }
    // Kill switch for the HEIC path (PLN-260817 §7): flipping this to false
    // returns the policy to what it was before, without a code rollback.
    if (type.decoder === 'heif' && !this.heicEnabled()) {
      this.logger.warn('attachment rejected (heic disabled by configuration)');
      throw new BusinessException(ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED, HttpStatus.BAD_REQUEST);
    }
    if (file.buffer.length > this.maxBytes(type.kind)) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_TOO_LARGE, HttpStatus.BAD_REQUEST);
    }
    await this.assertPendingQuota(owner);

    const uuid = randomUUID();
    const month = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

    let bytes = file.buffer;
    let width: number | null = null;
    let height: number | null = null;
    let thumbRelative: string | null = null;
    // What actually lands on disk. A HEIC is stored as the JPEG it was converted
    // into, so path, mime and display name follow the output — not the upload.
    let storedExt = type.ext;
    let storedMime = type.mime;

    if (type.kind === ATTACHMENT_KIND.IMAGE) {
      const processed = await this.processImage(file.buffer, type);
      // Re-encoding is what strips EXIF (GPS, device, timestamps), so the stored
      // "original" is the re-encoded copy — see PLN-260814 §7 SI-10.
      if (processed.image) bytes = processed.image;
      if (processed.ext) storedExt = processed.ext;
      if (processed.mime) storedMime = processed.mime;
      width = processed.width;
      height = processed.height;
      if (processed.thumb) {
        thumbRelative = join(String(owner.tenantId), month, `${uuid}_t.webp`);
        await this.writeFile(thumbRelative, processed.thumb);
      }
    }

    const relative = join(String(owner.tenantId), month, `${uuid}.${storedExt}`);
    await this.writeFile(relative, bytes);

    try {
      return await this.attachmentRepo.save(
        this.attachmentRepo.create({
          uuid,
          tenantId: owner.tenantId,
          conversationId: owner.conversationId ?? null,
          messageId: null,
          sessionId: owner.sessionId ?? null,
          uploaderType: owner.uploaderType,
          uploaderId: owner.uploaderId ?? null,
          kind: type.kind,
          // The name follows the bytes: a file offered as IMG_0001.HEIC that is
          // stored as JPEG is shown and downloaded as IMG_0001.jpg, so the
          // extension never contradicts what the browser receives (Q-2).
          filename: withExtension(sanitizeFilename(file.originalname), storedExt),
          mime: storedMime,
          size: bytes.length,
          width,
          height,
          storagePath: relative,
          thumbPath: thumbRelative,
          checksum: createHash('sha256').update(bytes).digest('hex'),
          source: owner.source,
        }),
      );
    } catch (err) {
      // The row is the only thing that will ever find these bytes again; if it
      // fails to insert, the files are already orphans — remove them now rather
      // than leaving them for the sweeper.
      await this.removeFiles([relative, thumbRelative]);
      throw err;
    }
  }

  /** A public upload endpoint needs a ceiling on what one session can park. */
  private async assertPendingQuota(owner: UploadOwner): Promise<void> {
    if (owner.sessionId == null) return;
    const pending = await this.attachmentRepo.count({
      where: { sessionId: owner.sessionId, messageId: IsNull() },
    });
    if (pending >= MAX_PENDING_PER_OWNER) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_LIMIT_EXCEEDED, HttpStatus.BAD_REQUEST);
    }
  }

  // ---- attach / read ------------------------------------------------------

  /**
   * Bind uploaded files to the message that carries them. Only rows belonging to
   * this tenant and still unattached are claimed, so replaying someone else's
   * attachment id onto your own message silently attaches nothing rather than
   * leaking their file.
   */
  async attachToMessage(
    ids: string[],
    params: { tenantId: number; messageId: number; conversationId: number; sessionId?: number | null },
  ): Promise<MessageAttachment[]> {
    const wanted = ids.filter((id) => !!id).slice(0, this.maxPerMessage());
    if (!wanted.length) return [];

    const rows = await this.attachmentRepo.find({
      where: { uuid: In(wanted), tenantId: params.tenantId, messageId: IsNull() },
    });
    const claimable = rows.filter(
      // A widget upload is owned by its session; a console upload has no session
      // and is claimed by conversation instead.
      (r) =>
        r.sessionId == null ||
        params.sessionId == null ||
        String(r.sessionId) === String(params.sessionId),
    );
    if (!claimable.length) return [];

    await this.attachmentRepo.update(
      { id: In(claimable.map((r) => r.id)) },
      { messageId: params.messageId, conversationId: params.conversationId },
    );
    return claimable.map((r) => ({
      ...r,
      messageId: params.messageId,
      conversationId: params.conversationId,
    }));
  }

  /** Attachments for a set of messages, in one query (no N+1 in the mapper). */
  async findByMessageIds(messageIds: number[]): Promise<Map<string, MessageAttachment[]>> {
    const map = new Map<string, MessageAttachment[]>();
    if (!messageIds.length) return map;
    const rows = await this.attachmentRepo.find({
      where: { messageId: In(messageIds) },
      order: { id: 'ASC' },
    });
    for (const row of rows) {
      const key = String(row.messageId);
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  }

  async findByUuid(uuid: string): Promise<MessageAttachment | null> {
    return this.attachmentRepo.findOne({ where: { uuid } });
  }

  /**
   * Open a stored file for streaming. The path is rebuilt from the row and
   * re-checked against UPLOAD_DIR: even if a stored path were ever tampered
   * with, it cannot escape the upload root.
   */
  openStream(attachment: MessageAttachment, variant: 'full' | 'thumb'): ReadStream {
    const relative =
      variant === 'thumb' && attachment.thumbPath ? attachment.thumbPath : attachment.storagePath;
    return createReadStream(this.absolutePath(relative));
  }

  hasThumb(attachment: MessageAttachment): boolean {
    return !!attachment.thumbPath;
  }

  // ---- deletion -----------------------------------------------------------

  /** Delete rows and their files. Used by retention, tenant purge and DSAR. */
  async deleteByIds(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await this.attachmentRepo.find({ where: { id: In(ids) } });
    if (!rows.length) return 0;
    await this.attachmentRepo.delete({ id: In(rows.map((r) => r.id)) });
    for (const row of rows) await this.removeFiles([row.storagePath, row.thumbPath]);
    return rows.length;
  }

  async deleteByConversationIds(conversationIds: number[]): Promise<number> {
    if (!conversationIds.length) return 0;
    const rows = await this.attachmentRepo.find({
      where: { conversationId: In(conversationIds) },
      select: ['id'],
    });
    return this.deleteByIds(rows.map((r) => Number(r.id)));
  }

  async deleteByTenant(tenantId: number): Promise<number> {
    const rows = await this.attachmentRepo.find({ where: { tenantId }, select: ['id'] });
    return this.deleteByIds(rows.map((r) => Number(r.id)));
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.attachmentRepo.find({
      where: { createdAt: LessThan(cutoff) },
      select: ['id'],
    });
    return this.deleteByIds(rows.map((r) => Number(r.id)));
  }

  /** Uploads abandoned before they were ever sent (PLN §2, orphan window). */
  async purgeUnattached(now: number = Date.now()): Promise<number> {
    const cutoff = new Date(now - UNATTACHED_TTL_MS);
    const rows = await this.attachmentRepo.find({
      where: { messageId: IsNull(), createdAt: LessThan(cutoff) },
      select: ['id'],
    });
    return this.deleteByIds(rows.map((r) => Number(r.id)));
  }

  // ---- filesystem ---------------------------------------------------------

  /**
   * Resolve a stored relative path inside UPLOAD_DIR, refusing anything that
   * climbs out of it (`../`, absolute paths). Storage paths are machine-built
   * from a uuid, so this can only fire on corrupted or hostile data — which is
   * exactly when it matters.
   */
  private absolutePath(relative: string): string {
    const root = this.uploadDir();
    const full = resolve(root, normalize(relative));
    if (full !== root && !full.startsWith(root + sep)) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_STORAGE_FAILED, HttpStatus.BAD_REQUEST);
    }
    return full;
  }

  private async writeFile(relative: string, bytes: Buffer): Promise<void> {
    const full = this.absolutePath(relative);
    try {
      await fs.mkdir(dirname(full), { recursive: true });
      await fs.writeFile(full, bytes);
    } catch (err) {
      this.logger.error(`attachment write failed (${relative}): ${String(err)}`);
      throw new BusinessException(
        ERROR_CODE.ATTACHMENT_STORAGE_FAILED,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async removeFiles(paths: (string | null)[]): Promise<void> {
    for (const relative of paths) {
      if (!relative) continue;
      try {
        await fs.unlink(this.absolutePath(relative));
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        // Already gone is the desired end state, not a failure.
        if (code !== 'ENOENT') {
          this.logger.warn(`attachment file delete failed (${relative}): ${String(err)}`);
        }
      }
    }
  }

  // ---- image processing ---------------------------------------------------

  /**
   * HEIC/HEIF → JPEG (PLN-260817 §2.1).
   *
   * Unlike every other image path this one is **fail-closed**: if the decode or
   * the re-encode fails there is no "store it as uploaded" fallback. Storing the
   * original would leave bytes no console browser can render *and* — because
   * EXIF is stripped by the act of re-encoding, not by a separate scrubber —
   * would keep the shopper's GPS coordinates in the file we serve back.
   */
  private async processHeif(buffer: Buffer): Promise<ProcessedImage> {
    const sharp = this.sharp();
    if (!sharp || !this.decoder) {
      this.logger.warn('heic upload rejected — image pipeline unavailable');
      throw new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST);
    }

    const startedAt = Date.now();
    // Throws E5042/E5043 on its own; those are the messages the shopper sees.
    const raw = await this.decoder.decodeHeif(buffer);
    const decodedAt = Date.now();

    try {
      // No `.rotate()` here: raw pixels carry no EXIF to read, and libheif has
      // already applied the container's own rotation/mirror properties.
      const image = await sharp(raw.data, {
        raw: { width: raw.width, height: raw.height, channels: 4 },
      })
        .jpeg({ quality: HEIF_JPEG_QUALITY })
        .toBuffer();

      const thumb = await sharp(image)
        .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      this.logger.log(
        `attachment.convert heic→jpeg ${raw.width}x${raw.height} ` +
          `decode=${decodedAt - startedAt}ms encode=${Date.now() - decodedAt}ms ` +
          `in=${buffer.length}B out=${image.length}B`,
      );

      return {
        image,
        thumb,
        width: raw.width,
        height: raw.height,
        ext: 'jpg',
        mime: 'image/jpeg',
      };
    } catch (err) {
      this.logger.warn(`heic re-encode failed: ${String(err)}`);
      throw new BusinessException(ERROR_CODE.ATTACHMENT_DECODE_FAILED, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * sharp is loaded lazily and optionally: if the native binary is missing in
   * this image, attachments still work — images are stored as uploaded and the
   * console falls back to the original for the thumbnail (PLN §11 risk).
   */
  private sharp(): SharpFactory | null {
    if (this.sharpModule !== undefined) return this.sharpModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.sharpModule = require('sharp') as SharpFactory;
    } catch (err) {
      this.logger.warn(`sharp unavailable — thumbnails disabled: ${String(err)}`);
      this.sharpModule = null;
    }
    return this.sharpModule;
  }

  private async processImage(buffer: Buffer, type: ResolvedType): Promise<ProcessedImage> {
    if (type.decoder === 'heif') return this.processHeif(buffer);

    const ext = type.ext;
    const sharp = this.sharp();
    if (!sharp) return { image: null, thumb: null, width: null, height: null };

    try {
      const meta = await sharp(buffer).metadata();
      const width = meta.width ?? null;
      const height = meta.height ?? null;

      // Animated GIFs would be flattened to their first frame by a re-encode, so
      // they are stored untouched; the thumbnail still comes from frame one.
      const animated = ext === 'gif';
      const pipeline = animated
        ? null
        : sharp(buffer).rotate(); // bake in EXIF orientation before the metadata is dropped
      // `storeAs` forces the output format; without it the re-encode keeps the
      // input's, which for AVIF means paying for AV1 encoding (see the spec).
      const image = pipeline
        ? await (type.storeAs === 'jpg' ? pipeline.jpeg({ quality: HEIF_JPEG_QUALITY }) : pipeline).toBuffer()
        : null;

      const thumb = await sharp(buffer)
        .rotate()
        .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();

      return image && type.storeAs === 'jpg'
        ? { image, thumb, width, height, ext: 'jpg', mime: 'image/jpeg' }
        : { image, thumb, width, height };
    } catch (err) {
      // A file that sniffed as an image but cannot be decoded: keep the bytes,
      // skip the thumbnail. Rejecting here would break legitimate odd encoders.
      this.logger.warn(`image processing failed — storing as uploaded: ${String(err)}`);
      return { image: null, thumb: null, width: null, height: null };
    }
  }
}
