/**
 * Multer/busboy decodes multipart filenames as latin1, so a Korean filename
 * arrives as mojibake ("ì¼í¼…") — first seen in the ingest audit trail
 * (RPT-260829 3차). Re-interpreting the bytes as UTF-8 restores it; ASCII
 * names are unchanged by the round-trip. If the re-decode produces
 * replacement characters the original was NOT latin1-mangled UTF-8 (some
 * client sent a correctly encoded name) — keep it as it came.
 */
export function decodeUploadName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
