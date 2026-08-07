/**
 * Credential redaction for anything we echo into logs.
 *
 * Distinct from `maskPii`: that protects a data subject, this protects a
 * secret we are holding. Provider error bodies are the concrete hazard —
 * OpenAI's 401 quotes the key it just rejected verbatim
 * ("Incorrect API key provided: sk-..."), so logging the response body writes
 * the credential to disk. Observed on staging 2026-08-07 with a placeholder
 * key; with a real one it would have been a live secret in the log.
 */

const REDACTED = '***redacted***';

/**
 * Provider key shapes worth catching even when we never held the value —
 * an error body can quote a key belonging to some other caller or project.
 */
const KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}/g, // OpenAI / Anthropic style
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
];

/**
 * Shortest secret worth substring-replacing. Below this a "secret" is likely a
 * fragment that appears in ordinary prose, and blanket replacement would mangle
 * the message we are trying to read.
 */
const MIN_LITERAL_LENGTH = 4;

/** Replace known secrets and key-shaped tokens in `text` with a placeholder. */
export function redactSecrets(text: string, ...secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < MIN_LITERAL_LENGTH) continue;
    out = out.split(secret).join(REDACTED);
  }
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}
