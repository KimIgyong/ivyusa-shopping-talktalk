import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { INTEGRATION_PROVIDER } from '@ivy/types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationCredential } from '../tenant/entity/integration-credential.entity';
import { decryptSecret, encryptSecret } from '../../global/util/crypto.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';
import { AuditService } from '../audit/audit.service';
import { NotionAuthError, NotionClient, NotionRequestError, NOT_FOUND_CODE } from './notion.client';
import { extractNotionId, validateNotionToken } from './notion.util';

export const NOTION_PROVIDER = INTEGRATION_PROVIDER.NOTION;

/**
 * Stores and reads the Notion internal-integration token (PLN-260821 W1, G3).
 *
 * Mirrors the Drive service-account service on purpose: same table, same
 * encryption, same "save once, read on every sync" split. An operator who has
 * connected one should recognise the other.
 */
@Injectable()
export class NotionCredentialService {
  private readonly logger = new Logger(NotionCredentialService.name);

  constructor(
    @InjectRepository(IntegrationCredential)
    private readonly credRepo: Repository<IntegrationCredential>,
    private readonly client: NotionClient,
    private readonly audit: AuditService,
  ) {}

  async save(tenantId: number, rawToken: string, actorUserId?: number): Promise<{ hint: string }> {
    const reason = validateNotionToken(rawToken);
    if (reason) {
      // The reason reaches the operator; "invalid" alone means pasting the same
      // wrong string again.
      this.logger.warn(`notion token rejected for tenant ${tenantId}: ${reason}`);
      throw new BusinessException(ERROR_CODE.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, {
        token: [reason],
      });
    }
    const token = rawToken.trim();

    const existing = await this.credRepo.findOne({ where: { tenantId, provider: NOTION_PROVIDER } });
    const row = existing ?? this.credRepo.create({ tenantId, provider: NOTION_PROVIDER });
    row.secretEnc = encryptSecret(token);
    row.status = 'connected';
    await this.credRepo.save(row);
    this.logger.log(`notion token stored for tenant ${tenantId}`);
    // Writing a tenant secret is a privileged action. The record carries no
    // part of the token — only that it changed, and who changed it.
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actorUserId ?? 0,
      action: 'knowledge.notion_credential.save',
      target: `tenant:${tenantId}`,
      metadata: { provider: NOTION_PROVIDER, replaced: !!existing },
    });
    return { hint: hintOf(token) };
  }

  async load(tenantId: number): Promise<string | null> {
    const row = await this.credRepo.findOne({ where: { tenantId, provider: NOTION_PROVIDER } });
    if (!row?.secretEnc) return null;
    try {
      return decryptSecret(row.secretEnc);
    } catch (e) {
      this.logger.warn(`notion token unreadable for tenant ${tenantId}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * What the console shows. Only the last four characters come back — enough
   * to tell two tokens apart, not enough to be one.
   */
  async status(tenantId: number): Promise<{ connected: boolean; tokenHint: string | null }> {
    const token = await this.load(tenantId);
    return { connected: !!token, tokenHint: token ? hintOf(token) : null };
  }

  async remove(tenantId: number, actorUserId?: number): Promise<void> {
    await this.credRepo.delete({ tenantId, provider: NOTION_PROVIDER });
    this.logger.log(`notion token removed for tenant ${tenantId}`);
    await this.audit.write({
      tenantId,
      actorType: 'user',
      actorId: actorUserId ?? 0,
      action: 'knowledge.notion_credential.remove',
      target: `tenant:${tenantId}`,
      metadata: { provider: NOTION_PROVIDER },
    });
  }

  /**
   * Check the token, and the target when one is given.
   *
   * The two failures are worth separating because Notion reports them almost
   * identically: a page that was never connected to the integration is simply
   * `object_not_found`, the same answer as a typo'd id. Only one of those is
   * fixed in Notion's own Connections menu, so the message has to say so.
   */
  async test(
    tenantId: number,
    targetId?: string,
  ): Promise<{ ok: boolean; message: string; kind?: string; pages?: number }> {
    const token = await this.load(tenantId);
    if (!token) return { ok: false, message: 'No Notion integration token is registered.' };

    let workspace: string;
    try {
      workspace = (await this.client.me(token)).name;
    } catch (e) {
      if (e instanceof NotionAuthError) {
        return { ok: false, message: `Notion rejected the token: ${e.message}` };
      }
      return { ok: false, message: `Could not reach Notion: ${(e as Error).message}` };
    }
    if (!targetId?.trim()) return { ok: true, message: `Token accepted for ${workspace}.` };

    const id = extractNotionId(targetId);
    if (!id) return { ok: false, message: 'That is not a Notion page or database ID.' };

    try {
      const target = await this.client.retrieveTarget(token, id);
      if (target.archived) {
        return { ok: false, message: `"${target.ref.title}" is in the Notion trash.` };
      }
      if (target.kind === 'database') {
        const listing = await this.client.listDatabasePages(token, id, 1);
        const count = listing.pages.length;
        return {
          ok: true,
          kind: 'database',
          pages: count,
          message: `Database "${target.ref.title}" is readable — ${count}${listing.hasMore ? '+' : ''} row(s).`,
        };
      }
      const children = await this.client.listChildPages(token, id, 1);
      const count = children.pages.length + 1; // the page itself is a document too
      return {
        ok: true,
        kind: 'page',
        pages: count,
        message: `Page "${target.ref.title}" is readable — ${count}${children.hasMore ? '+' : ''} page(s).`,
      };
    } catch (e) {
      if (e instanceof NotionRequestError && (e.status === 404 || e.code === NOT_FOUND_CODE)) {
        return {
          ok: false,
          // The likeliest cause first: the id is usually right and the sharing
          // is usually missing, because sharing is the step nothing prompts for.
          message:
            'The integration cannot see that target. In Notion, open the page or database → ⋯ → ' +
            'Connections → add this integration, then check the ID.',
        };
      }
      if (e instanceof NotionAuthError) {
        return { ok: false, message: `Notion rejected the token: ${e.message}` };
      }
      return { ok: false, message: `Could not read the target: ${(e as Error).message}` };
    }
  }
}

/** Last four characters, the way every other console shows a stored key. */
function hintOf(token: string): string {
  return `…${token.slice(-4)}`;
}
