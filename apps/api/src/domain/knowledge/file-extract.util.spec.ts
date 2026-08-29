import { Workbook } from 'exceljs';

const mockGetText = jest.fn();
jest.mock('pdf-parse', () => ({
  // v2 class API — mirrored so the spec exercises the real calling convention.
  PDFParse: class {
    getText = mockGetText;
    destroy = jest.fn(async () => undefined);
  },
}));
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));

const pdfParseMock = mockGetText;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammothMock = require('mammoth') as { extractRawText: jest.Mock };

import { extractText, INGEST_MAX_CHARS } from './file-extract.util';

describe('extractText', () => {
  it('reads a CSV into pipe-joined rows', async () => {
    const out = await extractText('faq.csv', Buffer.from('질문,답변\n환불 되나요?,7일 이내 가능', 'utf8'));
    expect(out.kind).toBe('csv');
    expect(out.text).toContain('환불 되나요? | 7일 이내 가능');
    expect(out.truncated).toBe(false);
  });

  it('rejects a CP949 CSV with the extract-failed code', async () => {
    const cp949 = Buffer.from([0xb0, 0xa1, 0x2c, 0xb3, 0xaa]);
    await expect(extractText('list.csv', cp949)).rejects.toMatchObject({ errorCode: 'E5067' });
  });

  it('reads every worksheet of an xlsx', async () => {
    const wb = new Workbook();
    wb.addWorksheet('규정').addRow(['체크인', '오후 3시부터']);
    wb.addWorksheet('부칙').addRow(['주차', '1박 1대 무료']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const out = await extractText('policy.xlsx', buffer);
    expect(out.text).toContain('# 규정');
    expect(out.text).toContain('체크인 | 오후 3시부터');
    expect(out.text).toContain('주차 | 1박 1대 무료');
  });

  it('delegates pdf/docx to their parsers and maps failures to E5067', async () => {
    pdfParseMock.mockResolvedValueOnce({ text: '숙박 약관 전문' });
    expect((await extractText('terms.pdf', Buffer.from('x'))).text).toBe('숙박 약관 전문');

    // A scanned PDF parses fine but yields no text layer → empty, not error.
    pdfParseMock.mockResolvedValueOnce({ text: '   ' });
    await expect(extractText('scan.pdf', Buffer.from('x'))).rejects.toMatchObject({
      errorCode: 'E5068',
    });

    pdfParseMock.mockRejectedValueOnce(new Error('bad xref'));
    await expect(extractText('broken.pdf', Buffer.from('x'))).rejects.toMatchObject({
      errorCode: 'E5067',
    });

    mammothMock.extractRawText.mockResolvedValueOnce({ value: '운영 매뉴얼 본문' });
    expect((await extractText('manual.docx', Buffer.from('x'))).text).toBe('운영 매뉴얼 본문');
  });

  it('keeps markdown as markdown — headings, lists and tables survive', async () => {
    const md = ['# 체크인 안내', '', '- 오후 3시부터', '', '| 항목 | 값 |', '| --- | --- |', '| 주차 | 무료 |'].join('\n');
    const out = await extractText('guide.md', Buffer.from(md, 'utf8'));
    expect(out.kind).toBe('md');
    expect(out.text).toContain('# 체크인 안내');
    expect(out.text).toContain('- 오후 3시부터');
    expect(out.text).toContain('| 주차 | 무료 |');
  });

  it('drops the leading YAML front matter but keeps a later horizontal rule', async () => {
    const md = '---\nname: kb\ndescription: meta\n---\n# 본문\n\n앞 절\n\n---\n\n뒷 절';
    const out = await extractText('doc.markdown', Buffer.from(md, 'utf8'));
    expect(out.kind).toBe('markdown');
    expect(out.text).not.toContain('description: meta');
    expect(out.text.startsWith('# 본문')).toBe(true);
    expect(out.text).toContain('---\n\n뒷 절');
  });

  it('strips a UTF-8 BOM and refuses a CP949-saved markdown', async () => {
    const bom = await extractText('bom.md', Buffer.from('\uFEFF# 제목', 'utf8'));
    expect(bom.text).toBe('# 제목');

    const cp949 = Buffer.from([0x23, 0x20, 0xb0, 0xa1, 0xb3, 0xaa]);
    await expect(extractText('mojibake.md', cp949)).rejects.toMatchObject({ errorCode: 'E5067' });
  });

  it('an empty markdown file is refused as unreadable, not ingested blank', async () => {
    await expect(extractText('blank.md', Buffer.from('   \n\n', 'utf8'))).rejects.toMatchObject({
      errorCode: 'E5068',
    });
  });

  it('rejects unsupported extensions up front', async () => {
    await expect(extractText('video.mp4', Buffer.from('x'))).rejects.toMatchObject({
      errorCode: 'E5066',
    });
  });

  it('cuts past the budget and says so instead of failing', async () => {
    const big = 'a'.repeat(INGEST_MAX_CHARS + 500);
    pdfParseMock.mockResolvedValueOnce({ text: big });
    const out = await extractText('big.pdf', Buffer.from('x'));
    expect(out.text).toHaveLength(INGEST_MAX_CHARS);
    expect(out.truncated).toBe(true);
  });
});
