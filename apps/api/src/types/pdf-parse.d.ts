/** pdf-parse (v2) ships no root types; only what the ingest extractor uses is declared. */
declare module 'pdf-parse' {
  export interface PdfTextResult {
    text: string;
  }
  export class PDFParse {
    constructor(options: { data: Uint8Array });
    getText(): Promise<PdfTextResult>;
    destroy(): Promise<void>;
  }
}
