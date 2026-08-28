import { decodeUploadName } from './upload-name.util';

describe('decodeUploadName', () => {
  it('restores a latin1-mangled Korean filename', () => {
    const mangled = Buffer.from('쇼피파이연동점검.pdf', 'utf8').toString('latin1');
    expect(decodeUploadName(mangled)).toBe('쇼피파이연동점검.pdf');
  });

  it('leaves ASCII names untouched', () => {
    expect(decodeUploadName('manual-v2.pdf')).toBe('manual-v2.pdf');
  });

  it('keeps a name whose re-decode would corrupt it', () => {
    // Already-correct UTF-8 like "café.pdf" survives: é re-read as UTF-8 is
    // invalid (�), so the original is kept.
    expect(decodeUploadName('café.pdf')).toBe('café.pdf');
  });
});
