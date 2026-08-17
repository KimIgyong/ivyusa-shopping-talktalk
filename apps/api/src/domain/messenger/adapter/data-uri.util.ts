import type { InboundAttachmentRef } from './messenger-adapter';

/**
 * `data:` URIs arriving as a message body (FIX-260817).
 *
 * The btbz relay does not hand out file URLs: a photo forwarded from KakaoTalk
 * arrives with `body_type: "photo"` and the whole image inline as
 * `data:image/jpeg;base64,…` in `body`. Read as text — which is what happened
 * until now — that is a 50KB wall of base64 in the conversation, and the
 * customer's photo never becomes an attachment at all.
 */

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

/** `data:<mime>[;charset=…][;base64],<payload>` — the only form the relay sends. */
const DATA_URI = /^data:([^;,]+)((?:;[^;,]+)*),(.*)$/s;

export interface ParsedDataUri {
  mime: string;
  data: Buffer;
}

/**
 * Decode a data URI, or null when the string is not one (or is malformed).
 * Never throws: an unparseable body is a text message as far as the caller is
 * concerned, which is the safe reading.
 */
export function parseDataUri(raw: string): ParsedDataUri | null {
  if (!raw.startsWith('data:')) return null;
  const match = DATA_URI.exec(raw);
  if (!match) return null;

  const [, mime, params, payload] = match;
  const isBase64 = /;base64/i.test(params ?? '');
  try {
    if (isBase64 && !isWellFormedBase64(payload)) return null;
    const data = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    if (!data.length) return null;
    return { mime: mime.trim().toLowerCase(), data };
  } catch {
    return null;
  }
}

/**
 * `Buffer.from(s, 'base64')` silently drops characters it does not recognise,
 * so `AAAA$` decodes to three bytes instead of failing. A truncated or
 * corrupted payload would then be stored as a "file" nobody can open, which is
 * worse than treating the turn as text — so the payload is checked first.
 */
function isWellFormedBase64(payload: string): boolean {
  // Line breaks are legal inside a base64 body; nothing else is.
  const compact = payload.replace(/\s+/g, '');
  if (!compact.length || compact.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

/**
 * Split a relay message body into the text and the file it carries.
 *
 * The payload decides, not the label. The relay does carry a `body_type`
 * ("text" | "photo"), but reading it instead of the body would let one
 * mislabelled turn put 50KB of base64 back into the conversation — the same
 * reasoning the attachment module applies to a browser's Content-Type.
 */
export function splitRelayBody(
  body: string | null | undefined,
  seq = 0,
): { text: string; attachments: InboundAttachmentRef[] } {
  const raw = (body ?? '').trim();
  if (!raw) return { text: '', attachments: [] };

  const parsed = parseDataUri(raw);
  if (!parsed) {
    // A media body type with no data URI is something we cannot fetch — keep it
    // as text so the agent at least sees what arrived.
    return { text: raw, attachments: [] };
  }

  const ext = EXT_BY_MIME[parsed.mime] ?? parsed.mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? 'bin';
  const label = parsed.mime.startsWith('image/') ? 'photo' : 'file';
  return {
    text: '',
    attachments: [
      {
        // The relay gives no filename; the stored name is what an agent sees in
        // the download, so it says what the file is and stays unique per turn.
        data: parsed.data,
        filename: `${label}-${seq || 1}.${ext}`,
        mime: parsed.mime,
        size: parsed.data.length,
      },
    ],
  };
}
