/**
 * Attachment type policy (PLN-260814 §5). Three checks must agree before a byte
 * is written: the extension, the declared Content-Type, and the file's own magic
 * bytes. A browser's Content-Type is a claim, not evidence — the sniffed type is
 * what gets stored and what the download route later replays.
 *
 * `svg` is deliberately absent: it is a script-execution vector served from our
 * own origin. Archives are out of scope for the first stage.
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
    if (declaredIsImage && declared !== spec.mime) return null;
  }

  return { ext, mime: spec.mime, kind: spec.kind };
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
