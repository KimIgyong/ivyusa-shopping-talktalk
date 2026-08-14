import { appendLinks } from './messenger-outbox.service';
import { extractAttachments } from './adapter/gmail-imap.adapter';
import { OutboundAttachment } from './adapter/messenger-adapter';

const file = (over: Partial<OutboundAttachment> = {}): OutboundAttachment => ({
  url: 'https://shoptalk.example/api/v1/files/abc?exp=1&sig=2',
  filename: 'label.png',
  mime: 'image/png',
  kind: 'image',
  ...over,
});

/**
 * The fallback for platforms that cannot carry a file (PLN-260814 FR-7). The
 * alternative — refusing the message — loses the file with nobody told, which
 * is the failure mode this whole feature exists to end.
 */
describe('appendLinks', () => {
  it('appends the links under the text', () => {
    expect(appendLinks('여기 확인해 주세요', [file()])).toBe(
      '여기 확인해 주세요\n\nlabel.png: https://shoptalk.example/api/v1/files/abc?exp=1&sig=2',
    );
  });

  it('sends the links alone when the reply has no words', () => {
    expect(appendLinks('', [file()])).toBe(
      'label.png: https://shoptalk.example/api/v1/files/abc?exp=1&sig=2',
    );
    expect(appendLinks(null, [file()])).toContain('label.png:');
  });

  it('leaves a text-only message untouched', () => {
    expect(appendLinks('just words', [])).toBe('just words');
  });

  it('lists every file', () => {
    const out = appendLinks('two', [file(), file({ filename: 'receipt.pdf', kind: 'file' })]);
    expect(out.split('\n').filter((l) => l.includes('http'))).toHaveLength(2);
  });
});

/**
 * Mail attachments (PLN-260814 S5). The parser has to tell a real attachment
 * from the HTML alternative that sits in the same multipart envelope.
 */
describe('extractAttachments', () => {
  const build = (parts: string[]): string =>
    ['Content-Type: multipart/mixed; boundary="B1"', '', ...parts, '--B1--'].join('\n');

  const attachmentPart = (filename: string, base64: string): string =>
    [
      '--B1',
      'Content-Type: image/png; name="' + filename + '"',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64,
    ].join('\n');

  it('decodes an attached file', () => {
    const data = Buffer.from('hello world').toString('base64');
    const out = extractAttachments(build([attachmentPart('photo.png', data)]));

    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe('photo.png');
    expect(out[0].mime).toBe('image/png');
    expect(out[0].data.toString('utf8')).toBe('hello world');
  });

  it('ignores the body parts, which have no filename', () => {
    const body = ['--B1', 'Content-Type: text/plain', '', 'the message'].join('\n');
    const html = ['--B1', 'Content-Type: text/html', '', '<p>the message</p>'].join('\n');
    expect(extractAttachments(build([body, html]))).toEqual([]);
  });

  it('skips a part it cannot decode rather than storing garbage', () => {
    const part = [
      '--B1',
      'Content-Type: application/pdf; name="doc.pdf"',
      'Content-Transfer-Encoding: 7bit',
      'Content-Disposition: attachment; filename="doc.pdf"',
      '',
      'not base64 at all',
    ].join('\n');
    expect(extractAttachments(build([part]))).toEqual([]);
  });

  it('caps how many files one mail can bring', () => {
    const data = Buffer.from('x').toString('base64');
    const parts = Array.from({ length: 9 }, (_, i) => attachmentPart(`f${i}.png`, data));
    expect(extractAttachments(build(parts), 5)).toHaveLength(5);
  });

  it('returns nothing for a plain, non-multipart mail', () => {
    expect(extractAttachments('Subject: hi\n\njust text')).toEqual([]);
  });
});
