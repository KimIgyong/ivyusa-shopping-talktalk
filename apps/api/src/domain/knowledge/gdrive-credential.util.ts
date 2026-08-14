/**
 * Service-account key handling (PLN-260815 G1).
 *
 * The operator pastes the whole JSON Google hands them; we keep only the two
 * fields needed to sign a token. That is both a size decision and a privacy one
 * — the rest of the file (project id, cert URLs, client id) buys nothing at
 * runtime, and a secret store should not hold what it never reads.
 */
export interface GoogleServiceAccount {
  clientEmail: string;
  privateKey: string;
}

/** Longest secret the column accepts, minus AES-GCM's iv + tag. */
export const SECRET_MAX_PLAINTEXT = 4096 - 28;

export class InvalidServiceAccountError extends Error {}

/**
 * Pull the usable parts out of a pasted service-account key.
 *
 * Throws with a reason an operator can act on rather than returning null: the
 * paste is a one-shot action, and "invalid" without a why means retrying the
 * same wrong file.
 */
export function parseServiceAccount(raw: string): GoogleServiceAccount {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new InvalidServiceAccountError('not valid JSON');
  }
  if (json.type && json.type !== 'service_account') {
    // An OAuth client secret is the likeliest wrong paste, and it looks
    // plausible enough to waste an afternoon.
    throw new InvalidServiceAccountError(`expected a service account key, got "${String(json.type)}"`);
  }

  const clientEmail = typeof json.client_email === 'string' ? json.client_email.trim() : '';
  const privateKeyRaw = typeof json.private_key === 'string' ? json.private_key : '';
  if (!clientEmail) throw new InvalidServiceAccountError('client_email is missing');
  if (!privateKeyRaw) throw new InvalidServiceAccountError('private_key is missing');

  // Keys pasted through form fields often arrive with literal \n sequences
  // instead of newlines, which fails at signing time with an opaque error.
  const privateKey = privateKeyRaw.includes('\\n')
    ? privateKeyRaw.replace(/\\n/g, '\n')
    : privateKeyRaw;
  if (!privateKey.includes('BEGIN') || !privateKey.includes('PRIVATE KEY')) {
    throw new InvalidServiceAccountError('private_key is not a PEM block');
  }

  const stored = JSON.stringify({ clientEmail, privateKey });
  if (Buffer.byteLength(stored) > SECRET_MAX_PLAINTEXT) {
    throw new InvalidServiceAccountError('key is too large to store');
  }
  return { clientEmail, privateKey };
}

export function serializeServiceAccount(sa: GoogleServiceAccount): string {
  return JSON.stringify({ clientEmail: sa.clientEmail, privateKey: sa.privateKey });
}

export function deserializeServiceAccount(stored: string): GoogleServiceAccount {
  const json = JSON.parse(stored) as Partial<GoogleServiceAccount>;
  if (!json.clientEmail || !json.privateKey) {
    throw new InvalidServiceAccountError('stored credential is incomplete');
  }
  return { clientEmail: json.clientEmail, privateKey: json.privateKey };
}
