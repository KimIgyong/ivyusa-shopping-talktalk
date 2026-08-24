import { extensionOf, resolveType, sanitizeFilename } from './file-type.util';

const png = (): Buffer =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const jpeg = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8)]);
const pdf = (): Buffer => Buffer.from('%PDF-1.7\n...');

/**
 * The browser's Content-Type is a claim; these tests pin the rule that only the
 * bytes decide. Every case here is a file that would pass a naive check on the
 * extension or the declared type alone.
 */
describe('resolveType', () => {
  it('accepts an image whose bytes, extension and declared type agree', () => {
    expect(resolveType('photo.png', 'image/png', png())).toEqual({
      ext: 'png',
      mime: 'image/png',
      kind: 'image',
    });
  });

  it('rejects an executable renamed to .png', () => {
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    expect(resolveType('payload.png', 'image/png', elf)).toBeNull();
  });

  it('rejects svg outright — it is scriptable, served from our own origin', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(resolveType('logo.svg', 'image/svg+xml', svg)).toBeNull();
  });

  it('rejects an archive (out of scope for stage one)', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    expect(resolveType('bundle.zip', 'application/zip', zip)).toBeNull();
  });

  it('accepts legacy Office files by their OLE2 container (REQ-260824 R5)', () => {
    const ole2 = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(8),
    ]);
    expect(resolveType('quote.doc', 'application/msword', ole2)).toEqual({
      ext: 'doc',
      mime: 'application/msword',
      kind: 'file',
    });
    expect(resolveType('sheet.xls', 'application/vnd.ms-excel', ole2)).toEqual({
      ext: 'xls',
      mime: 'application/vnd.ms-excel',
      kind: 'file',
    });
    // A zip renamed .doc is not an OLE2 container — the sniff turns it away.
    const zipHead = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    expect(resolveType('fake.doc', 'application/msword', zipHead)).toBeNull();
  });

  it('rejects a file with no extension', () => {
    expect(resolveType('screenshot', 'image/png', png())).toBeNull();
  });

  it('rejects a binary wearing a .txt name (no signature to check, so NUL is the tell)', () => {
    const binary = Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x01]);
    expect(resolveType('notes.txt', 'text/plain', binary)).toBeNull();
    expect(resolveType('notes.txt', 'text/plain', Buffer.from('plain text'))).toEqual({
      ext: 'txt',
      mime: 'text/plain',
      kind: 'file',
    });
  });

  it('rejects a declared type that contradicts the sniffed family', () => {
    // A PDF announced as an image would otherwise render inline.
    expect(resolveType('invoice.pdf', 'image/png', pdf())).toBeNull();
    // …and an image announced as one type but stored as another.
    expect(resolveType('photo.png', 'image/jpeg', png())).toBeNull();
  });

  it('tolerates a generic or missing declared type', () => {
    expect(resolveType('photo.jpg', 'application/octet-stream', jpeg())?.mime).toBe('image/jpeg');
    expect(resolveType('photo.jpg', '', jpeg())?.mime).toBe('image/jpeg');
    expect(resolveType('photo.jpg', 'image/jpeg; charset=binary', jpeg())?.mime).toBe('image/jpeg');
  });

  it('matches the extension case-insensitively', () => {
    expect(resolveType('PHOTO.JPEG', 'image/jpeg', jpeg())?.kind).toBe('image');
  });
});

describe('extensionOf', () => {
  it('reads the last extension and ignores directories', () => {
    expect(extensionOf('a/b/report.final.PDF')).toBe('pdf');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('plain')).toBe('');
  });
});

describe('sanitizeFilename', () => {
  it('strips any path so a stored name can never look like one', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\temp\\notes.txt')).toBe('notes.txt');
  });

  it('removes quotes and control characters that would break a header', () => {
    expect(sanitizeFilename('re"port\r\n.pdf')).toBe('report.pdf');
  });

  it('falls back rather than returning an empty name', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('"')).toBe('file');
  });
});
