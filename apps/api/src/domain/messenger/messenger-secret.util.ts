import { decryptSecret, encryptSecret } from '../../global/util/crypto.util';
import { MessengerChannel } from './entity/messenger-channel.entity';

/**
 * Channel credentials are stored as one AES-256-GCM blob (POL-018). Providers
 * differ in shape — Telegram has a single bot token, the hubs need
 * email+password — so the blob holds either a bare string or a JSON object,
 * and the adapters read whichever they declared in MESSENGER_FIELDS.
 */
export function encryptChannelSecret(value: string | Record<string, string>): Buffer {
  return encryptSecret(typeof value === 'string' ? value : JSON.stringify(value));
}

/** Decrypted credential, or '' when unset — adapters must treat '' as "not configured". */
export function decryptChannelSecret(channel: MessengerChannel): string {
  if (!channel.secretEnc || channel.secretEnc.length === 0) return '';
  return decryptSecret(channel.secretEnc);
}

/** Decrypted credential parsed as a field map (multi-field providers). */
export function decryptChannelSecretFields(channel: MessengerChannel): Record<string, string> {
  const raw = decryptChannelSecret(channel);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* single-value credential (bot token) — not JSON */
  }
  return {};
}
