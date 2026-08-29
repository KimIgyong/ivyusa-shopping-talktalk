import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { BOARD_ATTACHMENT_KIND, BoardAttachment } from './entity/board-attachment.entity';
import { verifyFileUrl } from '../../global/util/crypto.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** REQ file matrix (B1-6). zip/rar are stored and served, never analyzed (C8). */
const ALLOWED_EXT = /\.(pdf|docx|xlsx|csv|png|jpg|jpeg|webp|zip|rar)$/i;
const MAX_FILES_PER_UPLOAD = 10;

export interface UploadedBoardFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Board attachments: stored files and external links on one table (B1-2).
 * Files are addressed by uuid through the shared signed-URL scheme — the
 * editor's <img> preview cannot send an Authorization header, and the chat
 * attachment pipeline already proved the exp+sig link shape.
 */
@Injectable()
export class BoardAttachmentService {
  private readonly logger = new Logger(BoardAttachmentService.name);

  constructor(
    @InjectRepository(BoardAttachment) private readonly repo: Repository<BoardAttachment>,
    private readonly config: ConfigService,
  ) {}

  async listFor(tenantId: number, documentId: number): Promise<BoardAttachment[]> {
    return this.repo.find({ where: { tenantId, documentId }, order: { id: 'ASC' } });
  }

  async upload(
    tenantId: number,
    documentId: number,
    files: UploadedBoardFile[],
    userId: number,
  ): Promise<BoardAttachment[]> {
    if (!files.length) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    if (files.length > MAX_FILES_PER_UPLOAD) {
      throw new BusinessException(ERROR_CODE.BOARD_ATTACHMENT_LIMIT, HttpStatus.BAD_REQUEST);
    }
    for (const f of files) {
      if (!ALLOWED_EXT.test(f.originalname)) {
        this.logger.warn(`board attachment rejected: "${f.originalname}"`);
        throw new BusinessException(ERROR_CODE.BOARD_ATTACHMENT_UNSUPPORTED, HttpStatus.BAD_REQUEST);
      }
    }

    const rel = join('board', String(tenantId));
    await mkdir(join(this.root(), rel), { recursive: true });
    const rows: BoardAttachment[] = [];
    for (const f of files) {
      const uuid = randomUUID();
      const ext = (f.originalname.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
      const storagePath = join(rel, `${uuid}${ext}`);
      await writeFile(join(this.root(), storagePath), f.buffer);
      rows.push(
        await this.repo.save(
          this.repo.create({
            uuid,
            tenantId,
            documentId,
            kind: BOARD_ATTACHMENT_KIND.FILE,
            filename: f.originalname,
            mime: f.mimetype,
            storagePath,
            size: f.size,
            url: null,
            createdBy: userId,
          }),
        ),
      );
    }
    return rows;
  }

  async addLink(
    tenantId: number,
    documentId: number,
    url: string,
    label: string | undefined,
    userId: number,
  ): Promise<BoardAttachment> {
    if (!/^https?:\/\/\S+$/i.test(url.trim())) {
      throw new BusinessException(ERROR_CODE.BOARD_LINK_INVALID, HttpStatus.BAD_REQUEST);
    }
    return this.repo.save(
      this.repo.create({
        uuid: randomUUID(),
        tenantId,
        documentId,
        kind: BOARD_ATTACHMENT_KIND.LINK,
        filename: (label?.trim() || url.trim()).slice(0, 255),
        mime: null,
        storagePath: null,
        size: null,
        url: url.trim().slice(0, 1024),
        createdBy: userId,
      }),
    );
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    await this.repo.delete({ id, tenantId });
    if (row.storagePath) {
      await unlink(this.resolveInRoot(row.storagePath)).catch((e) =>
        this.logger.warn(`board attachment file unlink failed (${row.uuid}): ${(e as Error).message}`),
      );
    }
  }

  /** Delete every attachment of a document (called when the document goes). */
  async removeAllFor(tenantId: number, documentId: number): Promise<void> {
    const rows = await this.listFor(tenantId, documentId);
    for (const row of rows) await this.remove(tenantId, Number(row.id));
  }

  /** Signed download: exp+sig verified against the shared file-URL signer. */
  async openSigned(uuid: string, exp: number, sig: string): Promise<{
    stream: ReturnType<typeof createReadStream>;
    row: BoardAttachment;
  }> {
    if (!verifyFileUrl(uuid, 'full', exp, sig)) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    const row = await this.repo.findOne({ where: { uuid } });
    if (!row?.storagePath) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return { stream: createReadStream(this.resolveInRoot(row.storagePath)), row };
  }

  private root(): string {
    return resolve(this.config.get<string>('UPLOAD_DIR', './.uploads'));
  }

  /** Refuse anything that escapes UPLOAD_DIR, tampered path or not. */
  private resolveInRoot(storagePath: string): string {
    const abs = resolve(this.root(), storagePath);
    if (!abs.startsWith(this.root())) {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return abs;
  }
}
