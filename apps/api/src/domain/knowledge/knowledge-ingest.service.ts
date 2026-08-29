import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { AI_FUNCTION } from '@ivy/types';
import { AiGatewayService } from '../../infrastructure/external/ai/ai-gateway.service';
import { KbFile } from './entity/kb-file.entity';
import { KbCategoryService } from './kb-category.service';
import { KbRevisionService } from './kb-revision.service';
import { BoardService } from '../board/board.service';
import { BoardAttachmentService } from '../board/board-attachment.service';
import { BOARD_DOC_STATUS } from '../board/entity/board-document.entity';
import { extractText } from './file-extract.util';
import { fetchYoutubeTranscript } from './youtube-transcript.util';
import {
  IngestDraft,
  IngestJob,
  KnowledgeIngestJobService,
} from './knowledge-ingest-job.service';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** ~12K chars per LLM pass — small enough to segment attentively. */
const CHUNK_CHARS = 12_000;
/** P3-7: a runaway segmentation stops proposing, not the operator reviewing. */
const MAX_DRAFTS = 100;

/**
 * AI file/video ingest (PLN-260829 3차): unstructured source → draft articles
 * → operator approval → knowledge documents.
 *
 * Routed as SUMMARY with feature 'knowledge_ingest' — the same precedent the
 * conflict judge set (CHAT + feature): a new AI capability rides an existing
 * function's routing instead of inventing one nothing routes yet, and usage
 * metering already breaks out by feature.
 *
 * Nothing is knowledge until a person approves it (D4-1): the LLM only ever
 * produces drafts held in the job store.
 */
@Injectable()
export class KnowledgeIngestService {
  private readonly logger = new Logger(KnowledgeIngestService.name);

  constructor(
    @InjectRepository(KbFile) private readonly fileRepo: Repository<KbFile>,
    private readonly ai: AiGatewayService,
    private readonly categories: KbCategoryService,
    private readonly revisions: KbRevisionService,
    private readonly board: BoardService,
    private readonly attachments: BoardAttachmentService,
    private readonly jobs: KnowledgeIngestJobService,
    private readonly config: ConfigService,
  ) {}

  status(tenantId: number): IngestJob | null {
    return this.jobs.get(tenantId);
  }

  /** Upload path: store the original (D4-2), then analyze detached. */
  async startFile(
    tenantId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    docGroup: string,
  ): Promise<IngestJob> {
    // Extension gate up front so an unsupported file fails the REQUEST, not the
    // job the operator would have to poll to see fail.
    if (!/\.(pdf|docx|xlsx|csv|md|markdown)$/i.test(file.originalname)) {
      throw new BusinessException(ERROR_CODE.INGEST_UNSUPPORTED_FILE, HttpStatus.BAD_REQUEST);
    }
    const stored = await this.storeOriginal(tenantId, file);

    return this.jobs.start(
      tenantId,
      {
        sourceLabel: file.originalname,
        sourceKind: 'file_upload',
        docGroup,
        fileId: Number(stored.id),
        sourceUrl: null,
      },
      async (report) => {
        const extracted = await extractText(file.originalname, file.buffer);
        report.extracted(extracted.truncated);
        return this.analyze(tenantId, docGroup, file.originalname, extracted.text, report);
      },
    );
  }

  /** Video path (R5 P1): public YouTube captions → the same analysis. */
  startVideo(tenantId: number, url: string, docGroup: string): IngestJob {
    return this.jobs.start(
      tenantId,
      {
        sourceLabel: url,
        sourceKind: 'youtube',
        docGroup,
        fileId: null,
        sourceUrl: url,
      },
      async (report) => {
        const transcript = await fetchYoutubeTranscript(url);
        report.extracted(false, `${transcript.title} [${transcript.track}]`);
        return this.analyze(tenantId, docGroup, transcript.title, transcript.text, report);
      },
    );
  }

  /**
   * Publish the drafts the operator selected onto the Smart Knowledge Board
   * (B2 P4-6 — REQ C2: external material lands on the board first; adoption
   * into KB is the reviewer's separate call). Consumes the job: a second
   * approve of the same run would duplicate every article.
   */
  async approve(
    tenantId: number,
    articles: Array<{ title: string; category: string; content: string }>,
    actorUserId: number,
  ): Promise<Record<string, unknown>> {
    const job = this.jobs.ready(tenantId);
    if (!articles.length) {
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
    }

    const boardDocumentIds: string[] = [];
    for (const a of articles) {
      const title = a.title.trim().slice(0, 255);
      const category = a.category.trim().slice(0, 64);
      const content = a.content.trim();
      if (!title || !category || !content) {
        throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST);
      }
      const doc = await this.board.create(
        tenantId,
        {
          doc_group: job.docGroup,
          category1: category,
          title,
          content,
          // The tag is how a reviewer later tells machine-drafted entries from
          // hand-written ones.
          tags: ['ai-import'],
          status: BOARD_DOC_STATUS.PUBLISHED,
        },
        { userId: actorUserId, rank: 'staff' },
      );
      boardDocumentIds.push(String(doc.id));
    }

    // B4 P6-6: link the source to every approved document so the reviewer can
    // open the original from the board. Attachment failure must not undo an
    // approval that already published the documents — warn and move on.
    const attachedOriginals = await this.attachOriginal(tenantId, job, boardDocumentIds, actorUserId);

    const result = {
      sourceLabel: job.sourceLabel,
      sourceKind: job.sourceKind,
      docGroup: job.docGroup,
      drafted: job.drafts.length,
      saved: boardDocumentIds.length,
      target: 'board',
      boardDocumentIds,
      attachedOriginals,
    };
    await this.revisions.recordAudit(tenantId, 0, 'knowledge.file_ingested', actorUserId, result);
    this.jobs.markConsumed(tenantId, result);
    this.logger.log(
      `ingest approved (tenant ${tenantId}): "${job.sourceLabel}" → board docs=${boardDocumentIds.length}`,
    );
    return result;
  }

  // ---- internals ----------------------------------------------------------

  private async attachOriginal(
    tenantId: number,
    job: { sourceKind: string; sourceLabel: string; fileId: number | null; sourceUrl: string | null },
    boardDocumentIds: string[],
    actorUserId: number,
  ): Promise<number> {
    const ids = boardDocumentIds.map(Number);
    try {
      if (job.sourceKind === 'youtube' && job.sourceUrl) {
        for (const id of ids) {
          await this.attachments.addLink(tenantId, id, job.sourceUrl, job.sourceLabel, actorUserId);
        }
        return ids.length;
      }
      if (job.fileId) {
        const original = await this.fileRepo.findOne({ where: { id: job.fileId, tenantId } });
        if (!original?.storagePath) return 0;
        const root = resolve(this.config.get<string>('UPLOAD_DIR', './.uploads'));
        const buffer = await readFile(join(root, original.storagePath));
        // ONE stored copy under board/, shared by every approved document —
        // the kb_files original stays where it is, for audit (P6-7).
        return this.attachments.attachSharedCopy(
          tenantId,
          ids,
          { filename: original.filename, mime: original.mime, buffer },
          actorUserId,
        );
      }
      return 0;
    } catch (e) {
      this.logger.warn(`ingest original attach failed (tenant ${tenantId}): ${(e as Error).message}`);
      return 0;
    }
  }

  private async storeOriginal(
    tenantId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<KbFile> {
    // Same volume as chat attachments (S-10): anything outside UPLOAD_DIR does
    // not survive a redeploy.
    const root = resolve(this.config.get<string>('UPLOAD_DIR', './.uploads'));
    const rel = join('kb-ingest', String(tenantId));
    const ext = file.originalname.match(/\.[a-z0-9]+$/i)?.[0] ?? '';
    const name = `${randomUUID()}${ext.toLowerCase()}`;
    await mkdir(join(root, rel), { recursive: true });
    await writeFile(join(root, rel, name), file.buffer);
    return this.fileRepo.save(
      this.fileRepo.create({
        tenantId,
        // source_id is NOT NULL (built for board posts); 0 = "no source —
        // direct operator upload", chosen over a schema change (P3-6).
        sourceId: 0,
        postId: null,
        filename: file.originalname,
        mime: file.mimetype,
        storagePath: join(rel, name),
        size: file.size,
      }),
    );
  }

  private async analyze(
    tenantId: number,
    docGroup: string,
    sourceLabel: string,
    text: string,
    report: { analyzing: (done: number, total: number) => void },
  ): Promise<IngestDraft[]> {
    const chunks = this.split(text);
    // Existing categories steer the mapping — reusing the tenant's taxonomy
    // beats inventing a parallel one (same reason the console suggests them).
    const existing = (await this.categories.list(tenantId, docGroup))
      .filter((c) => !c.hidden)
      .map((c) => c.name)
      .slice(0, 50);

    const drafts: IngestDraft[] = [];
    for (const [i, chunk] of chunks.entries()) {
      report.analyzing(i, chunks.length);
      if (drafts.length >= MAX_DRAFTS) break;
      drafts.push(...(await this.analyzeChunk(tenantId, docGroup, sourceLabel, existing, chunk, i, chunks.length)));
    }
    report.analyzing(chunks.length, chunks.length);
    return drafts.slice(0, MAX_DRAFTS);
  }

  private async analyzeChunk(
    tenantId: number,
    docGroup: string,
    sourceLabel: string,
    existingCategories: string[],
    chunk: string,
    index: number,
    total: number,
  ): Promise<IngestDraft[]> {
    const res = await this.ai.complete({
      tenantId,
      function: AI_FUNCTION.SUMMARY,
      feature: 'knowledge_ingest',
      maxTokens: 8000,
      system:
        'JSON_MODE:kb_ingest. You convert a source document into self-contained knowledge-base ' +
        'articles for a customer-support RAG system. Segment the given text into articles, one ' +
        'per task/topic. Rules: keep the source language; never invent facts not in the text; ' +
        'each article must be understandable on its own; title ≤ 100 chars; prefer one of the ' +
        `existing categories [${existingCategories.join(', ')}] and only propose a new short ` +
        'category name when none fits. Return ONLY JSON: ' +
        '{"articles":[{"title":string,"category":string,"content":string}]}',
      messages: [
        {
          role: 'user',
          content: `Source: ${sourceLabel} (part ${index + 1}/${total}, group: ${docGroup})\n\n${chunk}`,
        },
      ],
    });

    const parsed = this.parseArticles(res.text);
    if (parsed) return parsed.map((a) => ({ ...a, fallback: false }));
    // P3-4: a chunk whose output cannot be read becomes ONE whole-chunk draft.
    // Review catches the quality; nothing silently disappears. This is also
    // what makes the keyless/stub environment usable end to end.
    return [
      {
        title: `${sourceLabel} — part ${index + 1}/${total}`,
        category: existingCategories[0] ?? 'general',
        content: chunk,
        fallback: true,
      },
    ];
  }

  private parseArticles(
    raw: string,
  ): Array<{ title: string; category: string; content: string }> | null {
    // Models fence JSON or preface it; slice from the outermost braces.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        articles?: Array<{ title?: unknown; category?: unknown; content?: unknown }>;
      };
      if (!Array.isArray(parsed.articles) || !parsed.articles.length) return null;
      const items = parsed.articles
        .filter(
          (a) =>
            typeof a.title === 'string' &&
            typeof a.category === 'string' &&
            typeof a.content === 'string' &&
            (a.content as string).trim() !== '',
        )
        .map((a) => ({
          title: (a.title as string).trim().slice(0, 255),
          category: (a.category as string).trim().slice(0, 64),
          content: (a.content as string).trim(),
        }));
      return items.length ? items : null;
    } catch {
      return null;
    }
  }

  /** Split on paragraph boundaries near the chunk size — mid-sentence cuts cost accuracy. */
  private split(text: string): string[] {
    const chunks: string[] = [];
    let rest = text;
    while (rest.length > CHUNK_CHARS) {
      const window = rest.slice(0, CHUNK_CHARS);
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), CHUNK_CHARS / 2);
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    if (rest.trim()) chunks.push(rest.trim());
    return chunks;
  }
}
