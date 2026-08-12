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

/**
 * One field of a channel's credentials, wherever it lives.
 *
 * Non-secret fields (mailbox address, server URL, hosts) are kept in `config`
 * so the console can show them back; secrets are in the encrypted blob, which
 * holds either a JSON map or — when the provider has a single secret — the
 * bare value. Channels saved before that split still carry everything in the
 * blob, so it is checked last rather than dropped.
 */
export function channelField(
  channel: MessengerChannel,
  key: string,
  opts: { secret?: boolean } = {},
): string {
  const fromConfig = channel.config?.[key];
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim();

  const fields = decryptChannelSecretFields(channel);
  const fromFields = fields[key];
  if (typeof fromFields === 'string' && fromFields.trim()) return fromFields.trim();

  // Single-secret providers store the value bare — only a secret field may claim it.
  if (opts.secret) {
    const bare = decryptChannelSecret(channel);
    if (bare && Object.keys(fields).length === 0) return bare;
  }
  return '';
}
