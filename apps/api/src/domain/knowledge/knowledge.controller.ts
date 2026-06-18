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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpStatus } from '@nestjs/common';
import { CAPABILITY, Principal } from '@ivy/types';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { buildPagination } from '@ivy/common';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeMapper } from './knowledge.mapper';
import {
  CreateDocumentRequest,
  CreatePostRequest,
  CreateSourceRequest,
  ListDocumentsQuery,
  UpdateDocumentRequest,
  UpdateSourceRequest,
} from './knowledge.dto';

/** Knowledge source & RAG corpus management (FR-064, FR-065). Tenant-scoped. */
@ApiTags('Knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

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
    return KnowledgeMapper.toSourceList(sources);
  }

  @Post('sources')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Create a knowledge source (board/repository/gdrive)' })
  async createSource(@CurrentUser() user: Principal, @Body() body: CreateSourceRequest) {
    const source = await this.knowledgeService.createSource(this.tenantUser(user).tenantId, body);
    return KnowledgeMapper.toSource(source);
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
    return KnowledgeMapper.toSource(source);
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

  @Post('documents')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Create and embed a RAG document' })
  async createDocument(@CurrentUser() user: Principal, @Body() body: CreateDocumentRequest) {
    const doc = await this.knowledgeService.createDocument(this.tenantUser(user).tenantId, body);
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
    const doc = await this.knowledgeService.updateDocument(
      this.tenantUser(user).tenantId,
      id,
      body,
    );
    return KnowledgeMapper.toDocument(doc);
  }

  @Delete('documents/:id')
  @RequireCapability(CAPABILITY.KNOWLEDGE_SOURCE_MANAGE)
  @ApiOperation({ summary: 'Delete a RAG document' })
  async deleteDocument(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    await this.knowledgeService.deleteDocument(this.tenantUser(user).tenantId, id);
    return { deleted: true };
  }
}
