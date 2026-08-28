import { HttpStatus } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { parseCsv } from './csv.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Plain-text extraction for the AI ingest pipeline (PLN-260829 3차 S1).
 *
 * Four formats, text layer only. Scanned PDFs (image pages, no text layer) come
 * out empty and are refused with the specific reason — OCR is out of scope.
 * Everything past MAX_CHARS is cut, reported via `truncated` rather than
 * failing: the operator decides whether a partial manual is worth ingesting.
 */
export interface ExtractedText {
  text: string;
  truncated: boolean;
  /** pdf | docx | xlsx | csv */
  kind: string;
}

/** D4-3: the analysis budget. ~17 chunks of LLM work at the chunk size below. */
export const INGEST_MAX_CHARS = 200_000;

export async function extractText(filename: string, buffer: Buffer): Promise<ExtractedText> {
  const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  let text: string;
  switch (ext) {
    case 'pdf':
      text = await extractPdf(buffer);
      break;
    case 'docx':
      text = await extractDocx(buffer);
      break;
    case 'xlsx':
      text = await extractXlsx(buffer);
      break;
    case 'csv':
      text = extractCsv(buffer);
      break;
    default:
      throw new BusinessException(ERROR_CODE.INGEST_UNSUPPORTED_FILE, HttpStatus.BAD_REQUEST);
  }
  const clean = text.replace(/\u0000/g, '').trim();
  if (!clean) throw new BusinessException(ERROR_CODE.INGEST_EMPTY, HttpStatus.BAD_REQUEST);
  return {
    text: clean.slice(0, INGEST_MAX_CHARS),
    truncated: clean.length > INGEST_MAX_CHARS,
    kind: ext,
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // CJS require on purpose: pdf-parse's index runs a debug harness when it is
  // the entry module; required from here `module.parent` is set and it is just
  // the parser. Lazy so the (heavy) dependency loads only when a PDF arrives.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
  try {
    const parsed = await pdfParse(buffer);
    return parsed.text ?? '';
  } catch {
    throw new BusinessException(ERROR_CODE.INGEST_EXTRACT_FAILED, HttpStatus.BAD_REQUEST);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  try {
    const res = await mammoth.extractRawText({ buffer });
    return res.value ?? '';
  } catch {
    throw new BusinessException(ERROR_CODE.INGEST_EXTRACT_FAILED, HttpStatus.BAD_REQUEST);
  }
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BusinessException(ERROR_CODE.INGEST_EXTRACT_FAILED, HttpStatus.BAD_REQUEST);
  }
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`# ${sheet.name}`);
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => cells.push((cell.text ?? '').trim()));
      if (cells.some((c) => c !== '')) lines.push(cells.join(' | '));
    });
  });
  return lines.join('\n');
}

function extractCsv(buffer: Buffer): string {
  const raw = buffer.toString('utf8');
  // CP949 CSVs decode to U+FFFD — same stance as the bulk importer: the row
  // text would be mojibake, so refuse with the extraction reason.
  if (raw.includes('�')) {
    throw new BusinessException(ERROR_CODE.INGEST_EXTRACT_FAILED, HttpStatus.BAD_REQUEST);
  }
  return parseCsv(raw)
    .map((row) => row.join(' | '))
    .join('\n');
}
