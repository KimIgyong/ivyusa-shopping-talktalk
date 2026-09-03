/**
 * Minimal RFC 4180 CSV reader for knowledge imports.
 *
 * Written rather than pulled in: the only shapes that matter here are quoted
 * fields containing commas or newlines and the doubled-quote escape, and the
 * import path should not add a dependency for ~50 lines. If a future source
 * needs dialect detection or streaming, replace this wholesale.
 */

/** Strip a UTF-8 BOM — the supplied product export starts with one. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Split CSV text into rows of raw cells. Handles quotes, commas and newlines. */
export function parseCsv(text: string): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // Swallow CR; the LF that follows ends the row.
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  // A file that does not end in a newline still has a final row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop trailing blank lines, which every spreadsheet export seems to add.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Serialize rows back into RFC 4180 CSV — the write half of the reader above,
 * used by the bulk export so a downloaded file re-imports byte-identically.
 * CRLF row endings because Excel on Windows still treats lone LF as suspect.
 * The UTF-8 BOM is the caller's concern (it belongs on the file, not on
 * every fragment).
 */
export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string): string =>
    /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n';
}

/**
 * Parse into objects keyed by header. Rows with fewer cells than the header
 * are padded rather than rejected — a trailing empty column is common and is
 * not worth failing an import over.
 */
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? '').trim();
    });
    return rec;
  });
  return { headers, records };
}
