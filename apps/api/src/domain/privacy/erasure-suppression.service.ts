import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { blindIndex } from '../../global/util/crypto.util';
import { ERASURE_SOURCE, ErasedIdentity, ErasureSource } from './entity/erased-identity.entity';

/** The identifiers an erasure is remembered by. Either may be absent. */
export interface ErasableIdentity {
  emailHash?: string | null;
  email?: string | null;
  shopifyCustomerId?: string | null;
}

/**
 * The suppression list behind the right to erasure (PRV-H2).
 *
 * Scrubbing the customer row only satisfies the request for as long as nothing
 * re-imports the person. Shopify still holds their email and name, so the very
 * next order sync would recreate the row and re-link their orders. Every path
 * that can mint a Customer asks here first.
 */
@Injectable()
export class ErasureSuppressionService {
  private readonly logger = new Logger(ErasureSuppressionService.name);

  constructor(
    @InjectRepository(ErasedIdentity)
    private readonly repo: Repository<ErasedIdentity>,
  ) {}

  /**
   * Remember an erasure. MUST run before the PII is scrubbed — anonymization nulls
   * both the email and the Shopify id, and once they are gone there is nothing left
   * to recognise the person by.
   *
   * Deliberately lets errors propagate: scrubbing without recording is how the
   * erasure silently comes undone, so the caller should fail rather than proceed.
   */
  async record(
    tenantId: number | null,
    identity: ErasableIdentity,
    source: ErasureSource = ERASURE_SOURCE.DSAR,
  ): Promise<void> {
    const { emailHash, shopifyCustomerHash } = this.hashesOf(identity);
    // Nothing to key on — such a row would match either everyone or no one.
    if (!emailHash && !shopifyCustomerHash) return;

    // Idempotent: a redact webhook can be delivered more than once.
    const existing = await this.repo.findOne({
      where: this.whereClauses(tenantId, emailHash, shopifyCustomerHash),
    });
    if (existing) return;

    await this.repo.save(this.repo.create({ tenantId, emailHash, shopifyCustomerHash, source }));
  }

  /**
   * True when this identity asked to be erased and must not be re-created. Either
   * identifier matching is enough: someone who erased via email and later returns
   * through the app proxy (which carries only the numeric id) is the same person.
   *
   * Fails closed, the opposite of most guards — reading a lookup error as "not
   * suppressed" would silently resurrect someone who asked to be forgotten.
   */
  async isSuppressed(tenantId: number | null, identity: ErasableIdentity): Promise<boolean> {
    const { emailHash, shopifyCustomerHash } = this.hashesOf(identity);
    if (!emailHash && !shopifyCustomerHash) return false;

    try {
      const hit = await this.repo.findOne({
        where: this.whereClauses(tenantId, emailHash, shopifyCustomerHash),
      });
      return hit != null;
    } catch (e) {
      this.logger.error(
        `suppression lookup failed — treating as suppressed: ${(e as Error).message}`,
      );
      return true;
    }
  }

  /** One clause per identifier we hold — TypeORM ORs an array of wheres. */
  private whereClauses(
    tenantId: number | null,
    emailHash: string | null,
    shopifyCustomerHash: string | null,
  ): FindOptionsWhere<ErasedIdentity>[] {
    // A tenantless row must be matched with IsNull(), not `= NULL`.
    const tenant = tenantId == null ? IsNull() : tenantId;
    const where: FindOptionsWhere<ErasedIdentity>[] = [];
    if (emailHash) where.push({ tenantId: tenant, emailHash });
    if (shopifyCustomerHash) where.push({ tenantId: tenant, shopifyCustomerHash });
    return where;
  }

  private hashesOf(identity: ErasableIdentity): {
    emailHash: string | null;
    shopifyCustomerHash: string | null;
  } {
    return {
      emailHash: identity.emailHash ?? blindIndex(identity.email) ?? null,
      shopifyCustomerHash: identity.shopifyCustomerId
        ? blindIndex(identity.shopifyCustomerId)
        : null,
    };
  }
}
