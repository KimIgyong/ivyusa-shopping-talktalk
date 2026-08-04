import { parseCsv, parseCsvRecords } from './csv.util';

describe('csv.util', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    // The product export quotes every Detail cell, and those contain commas.
    expect(parseCsv('a,b\n"x, y",z')).toEqual([
      ['a', 'b'],
      ['x, y', 'z'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    const rows = parseCsv('a,b\n"line1\nline2",z');
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('line1\nline2');
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    // The supplied file starts with one; without stripping, the first column
    // key would be "﻿Product Name" and every lookup would miss.
    const { headers } = parseCsvRecords('﻿Product Name,Handle\nA,a-1');
    expect(headers[0]).toBe('Product Name');
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a final row that has no trailing newline', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']]);
  });

  it('drops blank trailing lines', () => {
    expect(parseCsv('a,b\n1,2\n\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('pads short rows instead of rejecting them', () => {
    // A trailing empty column is common in spreadsheet exports and is not
    // worth failing an import over.
    const { records } = parseCsvRecords('a,b,c\n1,2');
    expect(records[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('trims cells and headers', () => {
    const { headers, records } = parseCsvRecords(' a , b \n 1 , 2 ');
    expect(headers).toEqual(['a', 'b']);
    expect(records[0]).toEqual({ a: '1', b: '2' });
  });

  it('returns nothing for empty input', () => {
    expect(parseCsvRecords('')).toEqual({ headers: [], records: [] });
  });
});
