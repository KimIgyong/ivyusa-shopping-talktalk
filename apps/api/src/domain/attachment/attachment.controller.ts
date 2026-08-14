import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { AttachmentService, UploadInput } from './attachment.service';
import { AttachmentMapper } from './attachment.mapper';
import { Conversation } from '../chat/entity/conversation.entity';
import { SessionService } from '../session/session.service';
import { AuditService } from '../audit/audit.service';
import { Public } from '../../global/decorator/public.decorator';
import { SessionToken } from '../../global/decorator/session-token.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { FileVariant, verifyFileUrl } from '../../global/util/crypto.util';

/** Hard ceiling for multer; the per-kind limit is enforced in the service. */
const MULTER_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Attachment upload + download (PLN-260814 S1).
 *
 * Download is `@Public` on purpose: the signature in the URL is the
 * authorisation. Ownership was checked when the link was minted — the caller
 * had to be able to read that conversation — so this route only has to prove
 * the link was not forged, edited, or kept past its expiry.
 */
@ApiTags('Files')
@Controller('files')
export class AttachmentController {
  constructor(
    private readonly attachments: AttachmentService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @InjectRepository(Conversation) private readonly conversationRepo: Repository<Conversation>,
  ) {}

  @Post('upload')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      // Memory storage: the service decides where bytes land, and rejects most
      // uploads before anything is written (PLN §5 validation).
      limits: { fileSize: MULTER_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Upload a chat attachment from the widget (session-token identified)' })
  async upload(@SessionToken() token: string, @UploadedFile() file?: UploadInput) {
    if (!file) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    const session = await this.sessions.findByToken(token);

    // The customer may attach a file on the very first turn, before any
    // conversation exists — conversation_id is filled in at send time.
    const conversation = await this.conversationRepo.findOne({
      where: { sessionId: session.id },
      order: { id: 'DESC' },
    });

    // Every stored file is tenant-scoped; a session that cannot name its tenant
    // is refused rather than filed under a guessed one — misfiling here would be
    // a cross-tenant leak the signed URL would then happily serve.
    const tenantId = session.tenantId ?? conversation?.tenantId ?? null;
    if (tenantId == null) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    const saved = await this.attachments.store(file, {
      tenantId: Number(tenantId),
      conversationId: conversation ? Number(conversation.id) : null,
      sessionId: Number(session.id),
      uploaderType: 'user',
      uploaderId: null,
      source: 'widget',
    });

    await this.audit.write({
      tenantId: Number(tenantId),
      actorType: 'system',
      actorId: 0,
      action: 'chat.attachment_uploaded',
      target: `attachment:${saved.uuid}`,
      // Size/type only — the file's contents and the customer's own filename
      // stay out of the audit trail, which outlives the conversation.
      metadata: { kind: saved.kind, mime: saved.mime, size: Number(saved.size), source: 'widget' },
    });

    return AttachmentMapper.toResponse(saved);
  }

  @Get(':uuid')
  @Public()
  @SkipThrottle() // a conversation view fetches every thumbnail it shows at once
  @ApiOperation({ summary: 'Stream an attachment by signed URL (exp + sig required)' })
  async download(
    @Param('uuid') uuid: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
    @Query('v') variant?: string,
  ): Promise<void> {
    const wanted: FileVariant = variant === 'thumb' ? 'thumb' : 'full';
    if (!verifyFileUrl(uuid, wanted, Number(exp), sig ?? '')) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_URL_INVALID, HttpStatus.UNAUTHORIZED);
    }

    const attachment = await this.attachments.findByUuid(uuid);
    if (!attachment) {
      throw new BusinessException(ERROR_CODE.ATTACHMENT_NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    const served: FileVariant =
      wanted === 'thumb' && this.attachments.hasThumb(attachment) ? 'thumb' : 'full';
    const isImage = attachment.kind === 'image';

    res.setHeader('Content-Type', served === 'thumb' ? 'image/webp' : attachment.mime);
    // Never let a browser re-sniff a stored file into something executable.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Images render in place; everything else downloads rather than opening in
    // a tab on our own origin (PLN §5).
    res.setHeader(
      'Content-Disposition',
      `${isImage ? 'inline' : 'attachment'}; filename="${attachment.filename}"`,
    );

    // Only a real file read is worth an audit row. Thumbnails are re-fetched on
    // every conversation render, and logging those would bury the trail in noise.
    if (served === 'full') {
      await this.audit.write({
        tenantId: attachment.tenantId,
        actorType: 'system',
        actorId: 0,
        action: 'chat.attachment_downloaded',
        target: `attachment:${attachment.uuid}`,
        metadata: { kind: attachment.kind, mime: attachment.mime },
      });
    }

    const stream = this.attachments.openStream(attachment, served);
    stream.on('error', (err) => {
      // The row survived its file (manual deletion, volume not mounted). Answer
      // 404 rather than a truncated body the client would render as corrupt.
      if (!res.headersSent) res.status(HttpStatus.NOT_FOUND);
      res.end();
      void err;
    });
    stream.pipe(res);
  }
}
