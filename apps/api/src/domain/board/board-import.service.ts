import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BOARD_DOC_STATUS, BoardDocument } from './entity/board-document.entity';
import { BoardActor, BoardService } from './board.service';
import { AuditService } from '../audit/audit.service';
import { parseCsvRecords } from '../knowledge/csv.util';
import { parseXlsxRecords } from '../knowledge/xlsx.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/** Same ceilings as the KB bulk importer — one mental model for operators. */
const MAX_ROWS = 5_000;

export interface FaqImportResult {
  parsed: number;
  created: number;
  skipped: number;
  invalid: number;
  errors: Array<{ row: number; reason: string }>;
}

/**
 * FAQ/Q&A board import → Smart Knowledge Board (PLN-260829 B4 P6-1~P6-4).
 *
 * Structured exports only (CSV/XLSX): every help-desk and forum can export a
 * CSV, while crawling arbitrary board HTML is unbounded — unstructured
 * sources already have the AI import. Rows become PUBLISHED board documents
 * (an exported FAQ is already vetted knowledge); adoption into the KB stays
 * the reviewer's separate call (B2).
 *
 * Board documents carry no external key, so idempotence is a duplicate-title
 * skip: re-uploading the same export creates nothing twice, and updating a
 * changed answer is a board edit, not a re-import.
 */
@Injectable()
export class BoardImportService {
  private readonly logger = new Logger(BoardImportService.name);

  constructor(
    @InjectRepository(BoardDocument) private readonly docRepo: Repository<BoardDocument>,
    private readonly board: BoardService,
    private readonly audit: AuditService,
  ) {}

  async importFaq(
    tenantId: number,
    docGroup: string,
    file: { originalname: string; buffer: Buffer },
    actor: BoardActor,
  ): Promise<FaqImportResult> {
    const parsed = await this.parseFile(file.originalname, file.buffer);
    const headerMap = new Map(parsed.headers.map((h) => [h.toLowerCase(), h]));
    for (const required of ['title', 'content']) {
      if (!headerMap.has(required)) {
        this.logger.warn(`faq import rejected: missing column ${required}`);
        throw new BusinessException(ERROR_CODE.BULK_IMPORT_MISSING_COLUMNS, HttpStatus.BAD_REQUEST);
      }
    }
    if (!parsed.records.length) {
      throw new BusinessException(ERROR_CODE.BULK_IMPORT_EMPTY, HttpStatus.BAD_REQUEST);
    }
    if (parsed.records.length > MAX_ROWS) {
      throw new BusinessException(ERROR_CODE.BULK_IMPORT_TOO_MANY_ROWS, HttpStatus.BAD_REQUEST);
    }
    const col = (rec: Record<string, string>, name: string): string => {
      const key = headerMap.get(name);
      return key ? (rec[key] ?? '').trim() : '';
    };

    // One read up front: the duplicate-title check must also see rows created
    // earlier in this same file.
    const existing = await this.docRepo.find({ where: { tenantId } });
    const knownTitles = new Set(existing.map((d) => d.title));

    const result: FaqImportResult = {
      parsed: parsed.records.length,
      created: 0,
      skipped: 0,
      invalid: 0,
      errors: [],
    };

    for (const [i, rec] of parsed.records.entries()) {
      const rowNo = i + 2;
      const title = col(rec, 'title').slice(0, 255);
      const content = col(rec, 'content');
      if (!title || !content) {
        result.invalid += 1;
        result.errors.push({ row: rowNo, reason: !title ? 'title is empty' : 'content is empty' });
        continue;
      }
      if (knownTitles.has(title)) {
        result.skipped += 1;
        continue;
      }
      const tags = col(rec, 'tags')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);
      await this.board.create(
        tenantId,
        {
          doc_group: docGroup,
          category1: col(rec, 'category1').slice(0, 64) || 'FAQ',
          category2: col(rec, 'category2').slice(0, 64) || undefined,
          title,
          content,
          // The marker tag is how a reviewer later tells imported FAQ entries
          // from hand-written ones (same stance as ai-import).
          tags: [...tags, 'faq-import'],
          status: BOARD_DOC_STATUS.PUBLISHED,
        },
        actor,
      );
      knownTitles.add(title);
      result.created += 1;
    }

    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'board.faq_imported',
      metadata: { filename: file.originalname, docGroup, ...result, errors: undefined },
    });
    this.logger.log(
      `faq import "${file.originalname}" (tenant ${tenantId}, ${docGroup}): ` +
        `parsed=${result.parsed} created=${result.created} skipped=${result.skipped} invalid=${result.invalid}`,
    );
    return result;
  }

  private async parseFile(filename: string, buffer: Buffer) {
    if (/\.xlsx$/i.test(filename)) return parseXlsxRecords(buffer);
    if (/\.csv$/i.test(filename)) {
      const text = buffer.toString('utf8');
      if (text.includes('�')) {
        this.logger.warn(`faq import rejected: "${filename}" is not valid UTF-8`);
        throw new BusinessException(ERROR_CODE.BULK_IMPORT_ENCODING, HttpStatus.BAD_REQUEST);
      }
      return parseCsvRecords(text);
    }
    this.logger.warn(`faq import rejected: unsupported file "${filename}"`);
    throw new BusinessException(ERROR_CODE.BULK_IMPORT_UNSUPPORTED_FILE, HttpStatus.BAD_REQUEST);
  }
}
