import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { Principal } from '@ivy/types';
import { RequireMenu } from '../../global/decorator/auth.decorator';
import { Public } from '../../global/decorator/public.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { decodeUploadName } from '../../global/util/upload-name.util';
import { BoardService, BoardActor } from './board.service';
import { BoardAttachmentService, UploadedBoardFile } from './board-attachment.service';
import { BoardMapper } from './board.mapper';
import {
  AddBoardLinkRequest,
  CreateBoardDocumentRequest,
  ListBoardDocumentsQuery,
  UpdateBoardDocumentRequest,
} from './dto/request/board.request';

/**
 * Smart Knowledge Board (PLN-260829 B1). Lives under the existing `knowledge`
 * menu scope (B1-7) — no new menu-provisioning surface. Read/write is open to
 * everyone who can open the knowledge screen; adoption into KB (B2) is where
 * KNOWLEDGE_SOURCE_MANAGE comes back in.
 */
@ApiTags('Board')
@Controller('board')
@RequireMenu('knowledge')
export class BoardController {
  constructor(
    private readonly board: BoardService,
    private readonly attachments: BoardAttachmentService,
  ) {}

  /** Narrow to a tenant user, keeping the rank the delete rule needs. */
  private actor(user: Principal): { tenantId: number } & BoardActor {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return { tenantId: user.tenantId, userId: user.userId, rank: user.rank };
  }

  @Get()
  @ApiOperation({ summary: "This tenant's Smart Knowledge Board (created on first touch)" })
  async getBoard(@CurrentUser() user: Principal) {
    return BoardMapper.toBoard(await this.board.ensureDefault(this.actor(user).tenantId));
  }

  @Get('documents')
  @ApiOperation({ summary: 'Board documents (paginated; group/category/tag/status/search filters)' })
  async list(@CurrentUser() user: Principal, @Query() query: ListBoardDocumentsQuery) {
    return this.board.list(this.actor(user).tenantId, query);
  }

  // Literal segment before `documents/:id` — the id route would swallow it.
  @Get('documents/category-counts')
  @ApiOperation({ summary: 'group → category1 → category2 counts for the navigator' })
  async categoryCounts(@CurrentUser() user: Principal) {
    return this.board.categoryCounts(this.actor(user).tenantId);
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'One board document with content and attachments' })
  async get(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const a = this.actor(user);
    const doc = await this.board.get(a.tenantId, id);
    const files = await this.attachments.listFor(a.tenantId, id);
    const review = await this.board.reviewMeta(a.tenantId, doc);
    return { ...BoardMapper.toDocument(doc, files), ...review };
  }

  @Post('documents')
  @ApiOperation({ summary: 'Create a board document (revision 1 recorded)' })
  async create(@CurrentUser() user: Principal, @Body() body: CreateBoardDocumentRequest) {
    const a = this.actor(user);
    const doc = await this.board.create(a.tenantId, body, a);
    return BoardMapper.toDocument(doc);
  }

  @Patch('documents/:id')
  @ApiOperation({ summary: 'Update a board document (snapshots a revision)' })
  async update(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateBoardDocumentRequest,
  ) {
    const a = this.actor(user);
    const doc = await this.board.update(a.tenantId, id, body, a);
    const files = await this.attachments.listFor(a.tenantId, id);
    return BoardMapper.toDocument(doc, files);
  }

  @Delete('documents/:id')
  @ApiOperation({ summary: 'Delete a board document (author or master/director)' })
  async remove(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const a = this.actor(user);
    await this.board.remove(a.tenantId, id, a);
    await this.attachments.removeAllFor(a.tenantId, id);
    return { deleted: true };
  }

  @Get('documents/:id/revisions')
  @ApiOperation({ summary: 'Edit history, newest first' })
  async revisions(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const rows = await this.board.revisions(this.actor(user).tenantId, id);
    return rows.map((r) => BoardMapper.toRevision(r));
  }

  @Get('documents/:id/revisions/:revisionId')
  @ApiOperation({ summary: 'One revision including its full content' })
  async revision(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ) {
    const rev = await this.board.revision(this.actor(user).tenantId, id, revisionId);
    return BoardMapper.toRevision(rev, true);
  }

  @Post('documents/:id/revisions/:revisionId/restore')
  @ApiOperation({ summary: 'Roll the document back to a revision (recorded as a new revision)' })
  async restore(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ) {
    const a = this.actor(user);
    const doc = await this.board.restore(a.tenantId, id, revisionId, a);
    return BoardMapper.toDocument(doc);
  }

  @Post('documents/:id/attachments')
  @UseInterceptors(
    // 50MB per file, 10 files per request (B1-6). Memory storage: the write
    // to UPLOAD_DIR is ours, so nothing transient lands on container disk.
    FilesInterceptor('files', 10, { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload attachments (pdf/docx/xlsx/csv/png/jpg/webp/zip/rar, ≤50MB)' })
  async upload(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files?: UploadedBoardFile[],
  ) {
    const a = this.actor(user);
    await this.board.get(a.tenantId, id);
    const rows = await this.attachments.upload(
      a.tenantId,
      id,
      (files ?? []).map((f) => ({ ...f, originalname: decodeUploadName(f.originalname) })),
      a.userId,
    );
    return rows.map((r) => BoardMapper.toAttachment(r));
  }

  @Post('documents/:id/attachments/link')
  @ApiOperation({ summary: 'Attach an external link (e.g. Google Drive)' })
  async addLink(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AddBoardLinkRequest,
  ) {
    const a = this.actor(user);
    await this.board.get(a.tenantId, id);
    const row = await this.attachments.addLink(a.tenantId, id, body.url, body.label, a.userId);
    return BoardMapper.toAttachment(row);
  }

  @Delete('attachments/:id')
  @ApiOperation({ summary: 'Remove an attachment (file bytes included)' })
  async removeAttachment(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    await this.attachments.remove(this.actor(user).tenantId, id);
    return { deleted: true };
  }

  /**
   * Signed download. @Public on purpose — the exp+sig pair IS the credential
   * (same contract as chat attachments): the editor preview's <img> cannot
   * carry an Authorization header.
   */
  @Get('files/:uuid')
  @Public()
  @ApiOperation({ summary: 'Stream a board attachment by signed URL (exp + sig required)' })
  async file(
    @Param('uuid') uuid: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const { stream, row } = await this.attachments.openSigned(uuid, Number(exp), sig);
    res.setHeader('Content-Type', row.mime ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    );
    stream.pipe(res);
  }
}
