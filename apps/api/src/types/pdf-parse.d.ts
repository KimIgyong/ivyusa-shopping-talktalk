/** pdf-parse ships no types; only the one call the ingest extractor makes is declared. */
declare module 'pdf-parse' {
  function pdfParse(buffer: Buffer): Promise<{ text: string }>;
  export = pdfParse;
}
