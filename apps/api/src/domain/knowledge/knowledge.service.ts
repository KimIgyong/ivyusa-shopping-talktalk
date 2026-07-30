import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { normalizePage } from '@ivy/common';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { QdrantService } from '../../infrastructure/external/vector/qdrant.service';
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
} from './dto/request/knowledge.request';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Knowledge source / RAG corpus management (FR-064, FR-065). All operations are
 * tenant-scoped. Documents are embedded through the AI gateway (Voyage voyage-4,
 * or the deterministic stub when keyless) and mirrored into the Qdrant vector
 * index; MySQL remains the source of truth and Qdrant is rebuildable via
 * reindexAll() (PLAN-KB-VectorHybrid-Qdrant W3).
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  /** Detached-retry backoff (ms). After the last failure the doc stays 'pending' for reindex. */
  private static readonly RETRY_DELAYS_MS = [1_000, 5_000, 15_000];
  /** Keep embedding input well inside voyage-4's 32K-token context. */
  private static readonly EMBED_MAX_CHARS = 30_000;

  constructor(
    @InjectRepository(KnowledgeSource) private readonly sourceRepo: Repository<KnowledgeSource>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(KbBoardPost) private readonly postRepo: Repository<KbBoardPost>,
    @InjectRepository(KbFile) private readonly fileRepo: Repository<KbFile>,
    private readonly ai: AiGatewayService,
    private readonly qdrant: QdrantService,
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
      // PERF-9: the list never renders the LONGTEXT body — skip it so a page
      // of documents doesn't drag megabytes of content off disk. Detail/edit
      // endpoints still load the full row.
      select: [
        'id',
        'tenantId',
        'source',
        'sourceId',
        'category',
        'title',
        'embeddingRef',
        'active',
        'status',
        'updatedAt',
      ],
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { items, total, page, size };
  }

  /** Full document including LONGTEXT content (list omits it — PERF-9). */
  async getDocument(tenantId: number, id: number): Promise<KbDocument> {
    return this.findDocument(tenantId, id);
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
    const activeChanged = body.active !== undefined && body.active !== doc.active;
    if (body.active !== undefined) doc.active = body.active;
    let reembed = body.title !== undefined && doc.embeddingModel !== null;
    if (body.content !== undefined && body.content !== doc.content) {
      doc.content = body.content;
      reembed = true;
    }
    const saved = await this.docRepo.save(doc);
    if (reembed) return this.embed(saved);
    if (activeChanged && this.qdrant.enabled) {
      // Visibility toggle only — flip the Qdrant payload flag, no re-embedding.
      this.qdrant
        .setActive(saved.id, saved.active === 1)
        .catch((e) => this.logger.warn(`qdrant setActive(${saved.id}) failed: ${e.message}`));
    }
    return saved;
  }

  async deleteDocument(tenantId: number, id: number): Promise<void> {
    await this.findDocument(tenantId, id);
    await this.docRepo.delete({ id, tenantId });
    if (this.qdrant.enabled) {
      this.qdrant
        .delete(id)
        .catch((e) => this.logger.warn(`qdrant delete(${id}) failed: ${e.message}`));
    }
  }

  /**
   * Embed the document and mirror it into Qdrant. The first attempt runs
   * inline (so a normal create returns status 'embedded'); on failure the doc
   * stays 'pending' and detached retries fire with backoff. Documents still
   * 'pending' after the last retry are swept by reindexAll().
   */
  private async embed(doc: KbDocument): Promise<KbDocument> {
    try {
      await this.embedOnce(doc);
    } catch (e) {
      this.logger.warn(`embed(${doc.id}) failed, scheduling retries: ${(e as Error).message}`);
      doc.status = 'pending';
      await this.docRepo.save(doc);
      this.scheduleEmbedRetries(doc.id, 0);
    }
    return doc;
  }

  private async embedOnce(doc: KbDocument): Promise<void> {
    const text = `${doc.title}\n${doc.content ?? ''}`.slice(0, KnowledgeService.EMBED_MAX_CHARS);
    const emb = await this.ai.embed([text], 'document');
    if (this.qdrant.enabled) {
      await this.qdrant.upsert(doc.id, emb.vectors[0], {
        tenant_id: doc.tenantId ?? 0,
        category: doc.category,
        source: doc.source,
        active: doc.active === 1,
      });
      doc.embeddingRef = `qdrant:${doc.id}`;
    } else {
      doc.embeddingRef = `emb_${doc.id}`; // FULLTEXT-only deployment
    }
    doc.embeddingModel = emb.model;
    doc.embeddedAt = new Date();
    doc.status = 'embedded';
    await this.docRepo.save(doc);
  }

  private scheduleEmbedRetries(docId: number, attempt: number): void {
    if (attempt >= KnowledgeService.RETRY_DELAYS_MS.length) return;
    const delay = KnowledgeService.RETRY_DELAYS_MS[attempt];
    setTimeout(async () => {
      const doc = await this.docRepo.findOne({ where: { id: docId } }).catch(() => null);
      if (!doc || doc.status !== 'pending') return; // deleted or already embedded
      try {
        await this.embedOnce(doc);
        this.logger.log(`embed(${docId}) succeeded on retry ${attempt + 1}`);
      } catch (e) {
        this.logger.warn(`embed(${docId}) retry ${attempt + 1} failed: ${(e as Error).message}`);
        this.scheduleEmbedRetries(docId, attempt + 1);
      }
    }, delay).unref?.();
  }

  /**
   * Rebuild the vector index from MySQL (npm run kb:reindex). Re-embeds
   * pending docs and docs whose stored embedding_model differs from the
   * current one; `force` re-embeds everything. Returns counts for reporting.
   */
  async reindexAll(opts: { force?: boolean } = {}): Promise<{ scanned: number; embedded: number; failed: number }> {
    const currentModel = (await this.ai.embed(['probe'], 'document')).model;
    const docs = opts.force
      ? await this.docRepo.find()
      : await this.docRepo.find({
          where: [
            { status: 'pending' },
            { embeddingModel: IsNull() },
            { embeddingModel: Not(currentModel) },
          ],
        });
    let embedded = 0;
    let failed = 0;
    for (const doc of docs) {
      try {
        await this.embedOnce(doc);
        embedded++;
      } catch (e) {
        failed++;
        this.logger.warn(`reindex embed(${doc.id}) failed: ${(e as Error).message}`);
      }
    }
    return { scanned: docs.length, embedded, failed };
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
