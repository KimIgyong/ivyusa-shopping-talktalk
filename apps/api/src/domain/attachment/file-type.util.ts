/**
 * Attachment type policy (PLN-260814 §5). Three checks must agree before a byte
 * is written: the extension, the declared Content-Type, and the file's own magic
 * bytes. A browser's Content-Type is a claim, not evidence — the sniffed type is
 * what gets stored and what the download route later replays.
 *
 * `svg` is deliberately absent: it is a script-execution vector served from our
 * own origin. Archives are out of scope for the first stage.
 *
 * A spec may also declare a `decoder`, meaning the format is accepted at the
 * door but never stored as-is — see PLN-260817 for HEIC.
 */

export const ATTACHMENT_KIND = {
  IMAGE: 'image',
  FILE: 'file',
} as const;
export type AttachmentKind = (typeof ATTACHMENT_KIND)[keyof typeof ATTACHMENT_KIND];

interface TypeSpec {
  ext: string[];
  mime: string;
  kind: AttachmentKind;
  /** Byte signature test against the head of the file. */
  sniff: (b: Buffer) => boolean;
  /**
   * Content-Types a browser may legitimately declare for this extension besides
   * `mime`. iOS reports HEIC as either image/heic or image/heif depending on the
   * upload path, and an exact-match veto would reject the honest ones.
   */
  altMime?: string[];
  /**
   * Container our image pipeline cannot read on its own. The stored file is the
   * conversion output, never these bytes (PLN-260817 §2.1).
   */
  decoder?: 'heif';
  /**
   * Store as this format instead of re-encoding to the uploaded one. Set where
   * keeping the input format would be slow or unreadable downstream.
   */
  storeAs?: 'jpg';
}

const startsWith = (b: Buffer, bytes: number[], offset = 0): boolean =>
  b.length >= offset + bytes.length && bytes.every((v, i) => b[offset + i] === v);

const ascii = (b: Buffer, text: string, offset = 0): boolean =>
  b.length >= offset + text.length && b.toString('latin1', offset, offset + text.length) === text;

/** ZIP container (docx/xlsx are zips) — PK\x03\x04, plus the empty/spanned variants. */
const isZipContainer = (b: Buffer): boolean =>
  startsWith(b, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWith(b, [0x50, 0x4b, 0x05, 0x06]) ||
  startsWith(b, [0x50, 0x4b, 0x07, 0x08]);

/** OLE2/CFB container (legacy .doc/.xls) — the D0 CF 11 E0 signature. */
const isOle2Container = (b: Buffer): boolean =>
  startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * ISO base media container (HEIC/HEIF/AVIF): a `ftyp` box at offset 4, the major
 * brand at offset 8, then a list of compatible brands. Testing the brands — not
 * just `ftyp` — is what keeps an MP4 renamed to .heic out of the decoder, since
 * both share this header.
 *
 * The compatible list matters: an encoder may write `mif1` as the major brand
 * and declare `avif` only as compatible, and judging by the major brand alone
 * would turn that file away.
 */
const isIsoBmffBrand = (b: Buffer, brands: string[]): boolean => {
  if (!ascii(b, 'ftyp', 4)) return false;
  // Box length is big-endian at offset 0; brands are 4 bytes each from offset 8
  // (major), then 12 (minor version), then the compatible list from 16.
  const declared = b.length >= 4 ? b.readUInt32BE(0) : 0;
  const end = Math.min(b.length, declared > 8 ? declared : b.length);
  if (brands.some((brand) => ascii(b, brand, 8))) return true;
  for (let at = 16; at + 4 <= end; at += 4) {
    if (brands.some((brand) => ascii(b, brand, at))) return true;
  }
  return false;
};

/** Apple's HEIC brands plus the generic HEIF ones iOS also emits. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
/** AVIF is a HEIF sibling; sharp reads it natively, so it needs no decoder. */
const AVIF_BRANDS = ['avif', 'avis'];

const SPECS: TypeSpec[] = [
  {
    ext: ['jpg', 'jpeg'],
    mime: 'image/jpeg',
    kind: ATTACHMENT_KIND.IMAGE,
    sniff: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    ext: ['png'],
    mime: 'image/png',
    kind: ATTACHMENT_KIND.IMAGE,
    sniff: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    ext: ['gif'],
    mime: 'image/gif',
    kind: ATTACHMENT_KIND.IMAGE,
    sniff: (b) => ascii(b, 'GIF87a') || ascii(b, 'GIF89a'),
  },
  {
    ext: ['webp'],
    mime: 'image/webp',
    kind: ATTACHMENT_KIND.IMAGE,
    sniff: (b) => ascii(b, 'RIFF') && ascii(b, 'WEBP', 8),
  },
  {
    // What an iPhone actually produces. The bytes are HEVC-coded and neither
    // sharp's prebuilt libvips nor a non-Safari browser can read them, so these
    // are decoded and re-encoded to JPEG before storage (PLN-260817).
    ext: ['heic', 'heif'],
    mime: 'image/heic',
    altMime: ['image/heif', 'image/heic-sequence', 'image/heif-sequence'],
    kind: ATTACHMENT_KIND.IMAGE,
    sniff: (b) => isIsoBmffBrand(b, HEIF_BRANDS),
    decoder: 'heif',
  },
  {
    // sharp reads AVIF, so no decoder is needed — but re-encoding one costs AV1
    // encoding: 3.8s for a 12MP photo on the request thread, measured, versus
    // 1.0s to JPEG. A public upload endpoint cannot afford the difference.
    ext: ['avif'],
    mime: 'image/avif',
    kind: ATTACHMENT_KIND.IMAGE,
    sniff: (b) => isIsoBmffBrand(b, AVIF_BRANDS),
    storeAs: 'jpg',
  },
  {
    ext: ['pdf'],
    mime: 'application/pdf',
    kind: ATTACHMENT_KIND.FILE,
    sniff: (b) => ascii(b, '%PDF-'),
  },
  {
    ext: ['docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: ATTACHMENT_KIND.FILE,
    sniff: isZipContainer,
  },
  {
    ext: ['xlsx'],
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: ATTACHMENT_KIND.FILE,
    sniff: isZipContainer,
  },
  // Legacy Office (REQ-260824 R5): container-level check, same strength as the
  // zip test above for their OOXML successors.
  {
    ext: ['doc'],
    mime: 'application/msword',
    kind: ATTACHMENT_KIND.FILE,
    sniff: isOle2Container,
  },
  {
    ext: ['xls'],
    mime: 'application/vnd.ms-excel',
    kind: ATTACHMENT_KIND.FILE,
    sniff: isOle2Container,
  },
  // Text formats have no signature. They are accepted on extension alone and
  // must therefore pass the "no NUL byte" check below — a renamed binary fails it.
  { ext: ['txt'], mime: 'text/plain', kind: ATTACHMENT_KIND.FILE, sniff: () => true },
  { ext: ['csv'], mime: 'text/csv', kind: ATTACHMENT_KIND.FILE, sniff: () => true },
];

const SIGNATURE_LESS = new Set(['txt', 'csv']);

export interface ResolvedType {
  ext: string;
  mime: string;
  kind: AttachmentKind;
  /** Set when the bytes need an explicit decode before anything can read them. */
  decoder?: 'heif';
  /** Set when the stored file must be a different format than the upload. */
  storeAs?: 'jpg';
}

/** Lowercased extension without the dot; empty string when the name has none. */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Decide the stored type, or return null when the file is not allowed.
 * `declaredMime` participates only as a veto: a mismatch with the extension's
 * family is rejected rather than silently overridden.
 */
export function resolveType(filename: string, declaredMime: string, head: Buffer): ResolvedType | null {
  const ext = extensionOf(filename);
  if (!ext) return null;
  const spec = SPECS.find((s) => s.ext.includes(ext));
  if (!spec) return null;
  if (!spec.sniff(head)) return null;

  // Signature-less text: reject anything carrying a NUL in its head — that is a
  // binary wearing a .txt name.
  if (SIGNATURE_LESS.has(ext) && head.includes(0x00)) return null;

  // The browser's claim may be generic (application/octet-stream) or absent;
  // only an explicit contradiction of the sniffed family is a rejection.
  const declared = (declaredMime || '').split(';')[0].trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') {
    const declaredIsImage = declared.startsWith('image/');
    if (declaredIsImage !== (spec.kind === ATTACHMENT_KIND.IMAGE)) return null;
    if (declaredIsImage && declared !== spec.mime && !spec.altMime?.includes(declared)) return null;
  }

  return { ext, mime: spec.mime, kind: spec.kind, decoder: spec.decoder, storeAs: spec.storeAs };
}

/**
 * Re-point a filename at the extension the file was actually stored as. Used
 * when a conversion changed the format (HEIC → JPEG): keeping `.HEIC` on a JPEG
 * would hand the shopper a download their own machine refuses to open.
 */
export function withExtension(filename: string, ext: string): string {
  const current = extensionOf(filename);
  if (current === ext) return filename;
  const base = current ? filename.slice(0, filename.length - current.length - 1) : filename;
  return `${base || 'file'}.${ext}`;
}

/**
 * Display-safe filename: strip any path, control characters and quotes, and cap
 * the length. Never used to build a storage path — the uuid does that — so this
 * only has to be safe to render and to put in a Content-Disposition header.
 */
export function sanitizeFilename(raw: string): string {
  const base = (raw || 'file').split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim();
  const safe = cleaned.length ? cleaned : 'file';
  return safe.length > 200 ? `${safe.slice(0, 190)}…${extensionOf(safe) ? `.${extensionOf(safe)}` : ''}` : safe;
}
