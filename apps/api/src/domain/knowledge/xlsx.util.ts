import { Workbook } from 'exceljs';

/**
 * Read the first worksheet of an .xlsx into header-keyed records — the same
 * shape `parseCsvRecords` returns, so the bulk importer treats both formats
 * identically past this point.
 *
 * xlsx is supported at all because Korean-locale Excel saves "CSV" as CP949 by
 * default, which mangles Hangul on a UTF-8 server. Letting operators upload the
 * workbook itself sidesteps the encoding question entirely (PLN-260828 D2).
 */
export async function parseXlsxRecords(
  buffer: Buffer,
): Promise<{ headers: string[]; records: Record<string, string>[] }> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], records: [] };

  // cell.text resolves formula results and rich-text runs to the string the
  // spreadsheet displays — cell.value would hand back objects for those.
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = (cell.text ?? '').trim();
  });
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  if (headers.length === 0) return { headers: [], records: [] };

  const records: Record<string, string>[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const rec: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      const text = (cell.text ?? '').trim();
      rec[h] = text;
      if (text !== '') hasValue = true;
    });
    // eachRow skips fully-empty rows, but a row with only formatting still
    // arrives — drop it the way the CSV parser drops blank lines.
    if (hasValue) records.push(rec);
  });
  return { headers, records };
}
