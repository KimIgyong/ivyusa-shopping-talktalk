import { MessengerChannel } from './entity/messenger-channel.entity';

/** Console view of a channel. Credentials are never included — only whether one exists. */
export class MessengerMapper {
  static toChannelResponse(channel: MessengerChannel, webhookUrl: string | null) {
    return {
      id: String(channel.id),
      provider: channel.provider,
      mode: channel.mode,
      label: channel.label,
      accountId: channel.externalAccountId,
      /** Presence only — the secret itself is write-only (POL-018). */
      credentialSet: !!channel.secretEnc && channel.secretEnc.length > 0,
      config: channel.config ?? {},
      autoReply: channel.autoReply === 1,
      /** off | approve | auto — what the channel actually does now. */
      replyMode: channel.replyMode || (channel.autoReply === 1 ? 'auto' : 'off'),
      consentMode: channel.consentMode,
      active: channel.active === 1,
      status: channel.status,
      lastSyncAt: channel.lastSyncAt,
      lastError: channel.lastError,
      /** Receive URL to paste into the provider console; null for poll channels. */
      webhookUrl,
      updatedAt: channel.updatedAt,
    };
  }
}
