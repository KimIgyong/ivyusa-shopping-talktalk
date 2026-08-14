import { ChatAttachmentResponse } from '@ivy/types';
import { MessageAttachment } from './entity/message-attachment.entity';
import { FileVariant, signFileUrl } from '../../global/util/crypto.util';

/** How long a minted link stays usable (PLN-260814 §5). */
export const ATTACHMENT_URL_TTL_SEC = 15 * 60;

/**
 * Attachment → API shape. URLs are minted here, so every response carries links
 * that are valid from the moment the client receives them; a link copied out of
 * an older payload expires on schedule rather than living forever.
 *
 * The path is returned relative to the API root. The widget runs on the
 * merchant's storefront origin, so it prefixes its own configured API base —
 * an absolute URL baked in here would point at the wrong host in dev.
 */
export class AttachmentMapper {
  static url(
    uuid: string,
    variant: FileVariant,
    now: number = Date.now(),
    baseUrl = '',
    ttlSec: number = ATTACHMENT_URL_TTL_SEC,
  ): string {
    const exp = Math.floor(now / 1000) + ttlSec;
    const sig = signFileUrl(uuid, variant, exp);
    const query = `exp=${exp}&sig=${sig}${variant === 'thumb' ? '&v=thumb' : ''}`;
    return `${baseUrl.replace(/\/+$/, '')}/api/v1/files/${uuid}?${query}`;
  }

  static toResponse(
    attachment: MessageAttachment,
    now: number = Date.now(),
    baseUrl = '',
  ): ChatAttachmentResponse {
    return {
      id: attachment.uuid,
      kind: attachment.kind === 'image' ? 'image' : 'file',
      filename: attachment.filename,
      mime: attachment.mime,
      size: Number(attachment.size),
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      url: AttachmentMapper.url(attachment.uuid, 'full', now, baseUrl),
      thumbUrl: attachment.thumbPath
        ? AttachmentMapper.url(attachment.uuid, 'thumb', now, baseUrl)
        : null,
    };
  }

  /** Undefined (not an empty array) for a text-only turn — the field is optional. */
  static toResponseList(
    attachments: MessageAttachment[] | undefined,
    now: number = Date.now(),
    baseUrl = '',
  ): ChatAttachmentResponse[] | undefined {
    if (!attachments?.length) return undefined;
    return attachments.map((a) => AttachmentMapper.toResponse(a, now, baseUrl));
  }
}
