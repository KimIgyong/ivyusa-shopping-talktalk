import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizePage } from '@ivy/common';
import { KnowledgeSource } from './entity/knowledge-source.entity';
import { KbDocument } from './entity/kb-document.entity';
import { KbBoardPost } from './entity/kb-board-post.entity';
import { KbFile } from './entity/kb-file.entity';
import {
  CreateDocumentRequest,
  CreatePostRequest,
  CreateSourceRequest,
  ListDocumentsQuery,
  UpdateDocumentRequest,
  UpdateSourceRequest,
} from './knowledge.dto';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Knowledge source / RAG corpus management (FR-064, FR-065). All operations are
 * tenant-scoped. Embedding is simulated synchronously (no external embedder yet):
 * documents are marked 'embedded' with a synthetic embedding reference.
 */
@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeSource) private readonly sourceRepo: Repository<KnowledgeSource>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(KbBoardPost) private readonly postRepo: Repository<KbBoardPost>,
    @InjectRepository(KbFile) private readonly fileRepo: Repository<KbFile>,
  ) {}

  // ---- Sources ----

  async listSources(tenantId: number): Promise<KnowledgeSource[]> {
    return this.sourceRepo.find({ where: { tenantId }, order: { id: 'DESC' } });
  }

  async createSource(tenantId: number, body: CreateSourceRequest): Promise<KnowledgeSource> {
    const source = this.sourceRepo.create({
      tenantId,
      type: body.type,
      name: body.name,
      status: 'active',
      designated: body.designated ?? 1,
      configJson: body.config_json ?? null,
    });
    return this.sourceRepo.save(source);
  }

  async updateSource(
    tenantId: number,
    id: number,
    body: UpdateSourceRequest,
  ): Promise<KnowledgeSource> {
    const source = await this.findSource(tenantId, id);
    if (body.name !== undefined) source.name = body.name;
    if (body.status !== undefined) source.status = body.status;
    if (body.designated !== undefined) source.designated = body.designated;
    return this.sourceRepo.save(source);
  }

  async deleteSource(tenantId: number, id: number): Promise<void> {
    await this.findSource(tenantId, id);
    await this.sourceRepo.delete({ id, tenantId });
  }

  // ---- Documents ----

  async listDocuments(
    tenantId: number,
    query: ListDocumentsQuery,
  ): Promise<{ items: KbDocument[]; total: number; page: number; size: number }> {
    const { page, size } = normalizePage(query.page, query.size);
    const where: Record<string, unknown> = { tenantId };
    if (query.source_id !== undefined) where.sourceId = Number(query.source_id);
    if (query.category !== undefined) where.category = query.category;
    const [items, total] = await this.docRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total, page, size };
  }

  async createDocument(tenantId: number, body: CreateDocumentRequest): Promise<KbDocument> {
    const doc = this.docRepo.create({
      tenantId,
      source: body.source ?? 'knowledge_store',
      sourceId: body.source_id ?? null,
      category: body.category,
      title: body.title,
      content: body.content,
      active: 1,
      status: 'pending',
      embeddingRef: null,
    });
    const saved = await this.docRepo.save(doc);
    return this.embed(saved);
  }

  async updateDocument(
    tenantId: number,
    id: number,
    body: UpdateDocumentRequest,
  ): Promise<KbDocument> {
    const doc = await this.findDocument(tenantId, id);
    if (body.title !== undefined) doc.title = body.title;
    if (body.category !== undefined) doc.category = body.category;
    if (body.active !== undefined) doc.active = body.active;
    let reembed = false;
    if (body.content !== undefined && body.content !== doc.content) {
      doc.content = body.content;
      reembed = true;
    }
    const saved = await this.docRepo.save(doc);
    return reembed ? this.embed(saved) : saved;
  }

  async deleteDocument(tenantId: number, id: number): Promise<void> {
    await this.findDocument(tenantId, id);
    await this.docRepo.delete({ id, tenantId });
  }

  /** Simulate embedding: assign a synthetic reference and mark the document ready. */
  private async embed(doc: KbDocument): Promise<KbDocument> {
    doc.embeddingRef = `emb_${doc.id}`;
    doc.status = 'embedded';
    doc.active = 1;
    return this.docRepo.save(doc);
  }

  // ---- Board posts ----

  async createPost(
    tenantId: number,
    sourceId: number,
    authorUserId: number,
    body: CreatePostRequest,
  ): Promise<KbBoardPost> {
    await this.findSource(tenantId, sourceId);
    const post = this.postRepo.create({
      tenantId,
      sourceId,
      title: body.title,
      body: body.body ?? null,
      authorUserId,
    });
    return this.postRepo.save(post);
  }

  async listPosts(tenantId: number, sourceId: number): Promise<KbBoardPost[]> {
    await this.findSource(tenantId, sourceId);
    return this.postRepo.find({ where: { tenantId, sourceId }, order: { id: 'DESC' } });
  }

  // ---- Helpers ----

  private async findSource(tenantId: number, id: number): Promise<KnowledgeSource> {
    const source = await this.sourceRepo.findOne({ where: { id, tenantId } });
    if (!source) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return source;
  }

  private async findDocument(tenantId: number, id: number): Promise<KbDocument> {
    const doc = await this.docRepo.findOne({ where: { id, tenantId } });
    if (!doc) {
      throw new BusinessException(ERROR_CODE.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return doc;
  }
}
