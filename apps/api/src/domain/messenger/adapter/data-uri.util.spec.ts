import { parseDataUri, splitRelayBody } from './data-uri.util';

/**
 * FIX-260817 — the relay delivers a KakaoTalk photo as `body_type: "photo"` plus
 * the whole image inline as a data URI. Read as text it became 50KB of base64 in
 * the conversation and no attachment at all.
 *
 * Payload confirmed against the live relay (2026-08-17): 3,355 `text` and 494
 * `photo` turns, every photo `data:image/jpeg;base64,…`.
 */
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const JPEG_URI = `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`;

describe('parseDataUri', () => {
  it('decodes a base64 image', () => {
    const parsed = parseDataUri(JPEG_URI);
    expect(parsed?.mime).toBe('image/jpeg');
    expect(parsed?.data).toEqual(JPEG_BYTES);
  });

  it('decodes a percent-encoded (non-base64) payload', () => {
    expect(parseDataUri('data:text/plain,hi%20there')?.data.toString()).toBe('hi there');
  });

  it('ignores anything that is not a data URI', () => {
    expect(parseDataUri('https://example.test/a.jpg')).toBeNull();
    expect(parseDataUri('사진 보냈어요')).toBeNull();
    expect(parseDataUri('')).toBeNull();
  });

  it('returns null rather than throwing on a malformed one', () => {
    expect(parseDataUri('data:image/jpeg;base64')).toBeNull(); // no comma
    expect(parseDataUri('data:image/jpeg;base64,')).toBeNull(); // empty payload
  });

  it('refuses base64 that node would silently salvage', () => {
    // Buffer.from ignores stray characters and short payloads, turning a
    // corrupted body into a few bytes that pretend to be a file.
    expect(parseDataUri('data:image/jpeg;base64,AAAA$')).toBeNull();
    expect(parseDataUri('data:image/jpeg;base64,AAA')).toBeNull(); // not a multiple of 4
    expect(parseDataUri('data:image/jpeg;base64,//9j/4AA=')).toBeNull(); // 9 chars
  });

  it('accepts base64 wrapped across lines', () => {
    const wrapped = `data:image/jpeg;base64,${JPEG_BYTES.toString('base64').replace(/(.{4})/, '$1\n')}`;
    expect(parseDataUri(wrapped)?.data).toEqual(JPEG_BYTES);
  });
});

describe('splitRelayBody', () => {
  it('turns a photo turn into an attachment and leaves no text', () => {
    const { text, attachments } = splitRelayBody(JPEG_URI, 707);
    expect(text).toBe('');
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      mime: 'image/jpeg',
      filename: 'photo-707.jpg',
      size: JPEG_BYTES.length,
    });
    expect(attachments[0].data).toEqual(JPEG_BYTES);
  });

  it('still rescues a photo the relay mislabelled as text', () => {
    // The discriminator is the payload, not the label — the same reasoning the
    // attachment module applies to Content-Type.
    const { text, attachments } = splitRelayBody(JPEG_URI, 1);
    expect(text).toBe('');
    expect(attachments).toHaveLength(1);
  });

  it('leaves an ordinary text turn alone', () => {
    const { text, attachments } = splitRelayBody('  배송 언제 오나요?  ', 1);
    expect(text).toBe('배송 언제 오나요?');
    expect(attachments).toHaveLength(0);
  });

  it('keeps a media turn we cannot decode as text rather than dropping it', () => {
    // body_type says photo but the body is a link we have no credentials for:
    // the agent should still see that something arrived.
    const { text, attachments } = splitRelayBody('https://relay.test/f/9', 1);
    expect(text).toBe('https://relay.test/f/9');
    expect(attachments).toHaveLength(0);
  });

  it('treats an empty body as nothing to ingest', () => {
    expect(splitRelayBody('', 1)).toEqual({ text: '', attachments: [] });
    expect(splitRelayBody(null, 1)).toEqual({ text: '', attachments: [] });
  });

  it('names a non-image data URI by its own type', () => {
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4').toString('base64')}`;
    expect(splitRelayBody(pdf, 42).attachments[0]).toMatchObject({
      mime: 'application/pdf',
      filename: 'file-42.pdf',
    });
  });
});
