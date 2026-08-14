import { createHash, createHmac, randomUUID } from 'crypto';

/**
 * KSR provider-API request signing (PLN-260814-KSR-Provider-Signed-Client S1).
 *
 * canonical = METHOD \n path+query \n timestamp \n nonce \n sha256hex(body)
 * signature = "v1=" + hmac_sha256_hex(secret, canonical)
 *
 * Two traps the spec calls out, both fixed here by construction:
 * - `pathWithQuery` must be the string that goes on the wire, INCLUDING the
 *   `/api/provider/v1` prefix and the query in its original order — the server
 *   verifies against `req.originalUrl`, so re-sorting or re-encoding the query
 *   yields E1103.
 * - The hex must be exactly 64 lowercase chars; anything else fails header
 *   PARSING and surfaces as E1101 (missing header), not E1103 — misleading
 *   when debugging. Node's `digest('hex')` is lowercase already; nothing here
 *   may uppercase or truncate it.
 */
export interface KsrSignatureInput {
  method: string;
  /** Path + query exactly as sent, e.g. `/api/provider/v1/messages?since_id=8`. */
  pathWithQuery: string;
  /** Unix seconds. The server allows ±300s skew (E1104 beyond). */
  timestamp: number;
  /** Unique per request; the server holds it ~600s and replays get 409 E1105. */
  nonce: string;
  /** Raw request body bytes as a string; '' for GET. */
  body: string;
}

export function ksrCanonicalString(input: KsrSignatureInput): string {
  return [
    input.method.toUpperCase(),
    input.pathWithQuery,
    String(input.timestamp),
    input.nonce,
    createHash('sha256').update(input.body).digest('hex'),
  ].join('\n');
}

export function ksrSignature(secret: string, input: KsrSignatureInput): string {
  return `v1=${createHmac('sha256', secret).update(ksrCanonicalString(input)).digest('hex')}`;
}

/**
 * The four auth headers for one request. Generate per attempt — a retry MUST
 * call this again: reusing a (timestamp, nonce) pair is a replay to the server
 * (409 E1105) even when the first attempt died on the network.
 */
export function ksrHeaders(
  keyId: string,
  secret: string,
  method: string,
  pathWithQuery: string,
  body = '',
): Record<string, string> {
  const input: KsrSignatureInput = {
    method,
    pathWithQuery,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomUUID(),
    body,
  };
  return {
    'X-KSR-Key-Id': keyId,
    'X-KSR-Timestamp': String(input.timestamp),
    'X-KSR-Nonce': input.nonce,
    'X-KSR-Signature': ksrSignature(secret, input),
  };
}
