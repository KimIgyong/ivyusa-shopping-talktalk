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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { CAPABILITY, Principal } from '@ivy/types';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { buildPagination, normalizePage } from '@ivy/common';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeMapper } from './knowledge.mapper';
import {
  AskKnowledgeRequest,
  CreateDocumentRequest,
  CreatePostRequest,
  CreateSourceRequest,
  ListConflictsQuery,
  ListDocumentsQuery,
  ResolveConflictRequest,
  UpdateDocumentRequest,
  UpdateSourceRequest,
} from './dto/request/knowledge.request';
import { KbConflictService } from './kb-conflict.service';
import { KbRevisionService } from './kb-revision.service';

/** Knowledge source & RAG corpus management (FR-064, FR-065). Tenant-scoped. */
@ApiTags('Knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly conflictService: KbConflictService,
    private readonly revisionService: KbRevisionService,
  ) {}

  /** Narrow to a tenant user; knowledge management is tenant-scoped only. */
  private tenantUser(user: Principal): { tenantId: number; userId: number } {
    if (user.actorType !== 'user') {
      throw new BusinessException(ERROR_CODE.FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return { tenantId: user.tenantId, userId: user.userId };
  }

  // ---- Sources ----

  @Get('sources')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'List tenant knowledge sources' })
  async listSources(@CurrentUser() user: Principal) {
    const sources = await this.knowledgeService.listSources(this.tenantUser(user).tenantId);
    return KnowledgeMapper.toSourceList(sources, this.knowledgeService.supportedSourceTypes());
  }

  @Post('sources')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Create a knowledge source (board/repository/gdrive)' })
  async createSource(@CurrentUser() user: Principal, @Body() body: CreateSourceRequest) {
    const source = await this.knowledgeService.createSource(this.tenantUser(user).tenantId, body);
    return KnowledgeMapper.toSource(
      source,
      this.knowledgeService.supportedSourceTypes().includes(source.type),
    );
  }

  @Patch('sources/:id')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Update a knowledge source (toggle active/designated)' })
  async updateSource(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSourceRequest,
  ) {
    const source = await this.knowledgeService.updateSource(
      this.tenantUser(user).tenantId,
      id,
      body,
    );
    return KnowledgeMapper.toSource(
      source,
      this.knowledgeService.supportedSourceTypes().includes(source.type),
    );
  }

  @Delete('sources/:id')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Delete a knowledge source' })
  async deleteSource(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    await this.knowledgeService.deleteSource(this.tenantUser(user).tenantId, id);
    return { deleted: true };
  }

  // ---- Board posts ----

  @Post('sources/:id/posts')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Create a board-mode knowledge post' })
  async createPost(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreatePostRequest,
  ) {
    const principal = this.tenantUser(user);
    const post = await this.knowledgeService.createPost(
      principal.tenantId,
      id,
      principal.userId,
      body,
    );
    return KnowledgeMapper.toPost(post);
  }

  @Post('sources/:id/sync')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Pull a knowledge source into the RAG corpus' })
  async syncSource(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const actor = this.tenantUser(user);
    return this.knowledgeService.syncSource(actor.tenantId, id, actor.userId);
  }

  @Get('sources/:id/posts')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'List board-mode knowledge posts for a source' })
  async listPosts(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const posts = await this.knowledgeService.listPosts(this.tenantUser(user).tenantId, id);
    return KnowledgeMapper.toPostList(posts);
  }

  // ---- Documents ----

  @Get('documents')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'List RAG documents (paginated, filterable)' })
  async listDocuments(@CurrentUser() user: Principal, @Query() query: ListDocumentsQuery) {
    const { items, total, page, size } = await this.knowledgeService.listDocuments(
      this.tenantUser(user).tenantId,
      query,
    );
    return new Paginated(KnowledgeMapper.toDocumentList(items), buildPagination(page, size, total));
  }

  @Get('categories')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Document counts per category (console category navigator)' })
  async categories(@CurrentUser() user: Principal, @Query('group') group?: string) {
    return this.knowledgeService.categoryCounts(this.tenantUser(user).tenantId, group);
  }

  @Post('ask')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Answer a question from the KB and return its source documents' })
  async ask(@CurrentUser() user: Principal, @Body() body: AskKnowledgeRequest) {
    return this.knowledgeService.ask(
      this.tenantUser(user).tenantId,
      body.question,
      body.language ?? 'EN',
      body.group,
    );
  }

  @Get('documents/:id')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Get one RAG document with full content' })
  async getDocument(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const doc = await this.knowledgeService.getDocument(this.tenantUser(user).tenantId, id);
    return KnowledgeMapper.toDocument(doc);
  }

  @Post('documents')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Create and embed a RAG document' })
  async createDocument(@CurrentUser() user: Principal, @Body() body: CreateDocumentRequest) {
    const actor = this.tenantUser(user);
    const doc = await this.knowledgeService.createDocument(actor.tenantId, body, actor.userId);
    return KnowledgeMapper.toDocument(doc);
  }

  @Patch('documents/:id')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Update a RAG document (re-embeds when content changes)' })
  async updateDocument(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDocumentRequest,
  ) {
    const actor = this.tenantUser(user);
    const doc = await this.knowledgeService.updateDocument(actor.tenantId, id, body, actor.userId);
    return KnowledgeMapper.toDocument(doc);
  }

  @Delete('documents/:id')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Delete a RAG document' })
  async deleteDocument(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const actor = this.tenantUser(user);
    await this.knowledgeService.deleteDocument(actor.tenantId, id, actor.userId);
    return { deleted: true };
  }

  @Post('documents/import/product')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      // Memory storage on purpose: the catalogue export is ~300KB and container
      // disk does not survive a redeploy. The raw file is not retained — the
      // audit entry and the import summary carry the traceability.
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Import a product catalogue CSV into the ProductInfo group' })
  async importProducts(
    @CurrentUser() user: Principal,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const actor = this.tenantUser(user);
    if (!file) throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    // Browsers label .csv inconsistently (text/csv, application/vnd.ms-excel,
    // sometimes text/plain), so the extension is the reliable check and the
    // parser rejects anything that is not tabular anyway.
    if (!/\.csv$/i.test(file.originalname)) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }
    return this.knowledgeService.importProductCsv(
      actor.tenantId,
      file.buffer.toString('utf8'),
      actor.userId,
      file.originalname,
    );
  }

  // --- Revision history (PLN T3) -------------------------------------------

  @Get('documents/:id/revisions')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Change history for a document (newest first)' })
  async listRevisions(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const rows = await this.revisionService.list(this.tenantUser(user).tenantId, id);
    return KnowledgeMapper.toRevisionList(rows);
  }

  @Get('documents/:id/revisions/:revisionId')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'One revision including its full content' })
  async getRevision(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ) {
    const rev = await this.revisionService.get(this.tenantUser(user).tenantId, id, revisionId);
    return KnowledgeMapper.toRevision(rev, true);
  }

  @Post('documents/:id/revisions/:revisionId/restore')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Roll the document back to a revision (recorded as a new revision)' })
  async restoreRevision(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ) {
    const actor = this.tenantUser(user);
    const doc = await this.knowledgeService.restoreRevision(
      actor.tenantId,
      id,
      revisionId,
      actor.userId,
    );
    return KnowledgeMapper.toDocument(doc);
  }

  @Post('documents/:id/reviewed')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Mark a document reviewed (resets its staleness clock)' })
  async markReviewed(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const actor = this.tenantUser(user);
    const doc = await this.knowledgeService.markReviewed(actor.tenantId, id, actor.userId);
    return KnowledgeMapper.toDocument(doc);
  }

  // --- Conflict review (PLN S4) --------------------------------------------

  @Get('conflicts')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Conflicting/duplicate document pairs awaiting review' })
  async listConflicts(@CurrentUser() user: Principal, @Query() query: ListConflictsQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const { items, total } = await this.conflictService.list(
      this.tenantUser(user).tenantId,
      query.status,
      page,
      size,
    );
    return new Paginated(items, buildPagination(page, size, total));
  }

  @Post('conflicts/scan')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Re-scan the knowledge base for contradicting pairs' })
  async scanConflicts(@CurrentUser() user: Principal) {
    return this.conflictService.scan(this.tenantUser(user).tenantId);
  }

  @Post('conflicts/:id/resolve')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Pick which document to follow; hides the other' })
  async resolveConflict(
    @CurrentUser() user: Principal,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResolveConflictRequest,
  ) {
    const actor = this.tenantUser(user);
    return this.conflictService.resolve(actor.tenantId, id, body.resolution, actor.userId);
  }

  @Post('conflicts/:id/retry')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Re-judge a pair the model failed on (ignores the attempt budget)' })
  async retryConflict(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.conflictService.retry(this.tenantUser(user).tenantId, id);
  }

  @Post('conflicts/:id/rejudge')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Re-judge a pair against the current document contents' })
  async rejudgeConflict(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.conflictService.rejudge(this.tenantUser(user).tenantId, id);
  }

  @Post('conflicts/:id/dismiss')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Mark a pair as not a conflict (keeps it out of future scans)' })
  async dismissConflict(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    const actor = this.tenantUser(user);
    return this.conflictService.dismiss(actor.tenantId, id, actor.userId);
  }
}
