import { randomBytes } from 'crypto';
import { ErasureSuppressionService } from './erasure-suppression.service';
import { ERASURE_SOURCE } from './entity/erased-identity.entity';
import { blindIndex } from '../../global/util/crypto.util';

/**
 * ErasureSuppressionService — the memory that makes erasure stick.
 *
 * Observed in live data: a shopper was erased, then a later order sync read their
 * email back out of Shopify, recreated the customer row and re-linked their order.
 * Anonymization also nulls the Shopify id, so after the scrub there is nothing left
 * to recognise them by — hence a separate list, written before the scrub.
 */
describe('ErasureSuppressionService', () => {
  const EMAIL = 'erased@example.com';
  const SHOPIFY_ID = '8984201134254';

  // blindIndex is keyed by CRED_ENC_KEY; any 32-byte key works as long as the test
  // and the service share it (the index only has to be deterministic in-process).
  beforeAll(() => {
    process.env.CRED_ENC_KEY = randomBytes(32).toString('base64');
  });

  function build(rows: Array<Record<string, unknown>> = []) {
    const saved: Array<Record<string, unknown>> = [];
    const repo = {
      findOne: jest.fn(({ where }: { where: Array<Record<string, unknown>> }) => {
        const clauses = Array.isArray(where) ? where : [where];
        const hit = rows.find((r) =>
          clauses.some((c) =>
            Object.entries(c).every(([k, v]) => v === undefined || r[k] === v),
          ),
        );
        return Promise.resolve(hit ?? null);
      }),
      create: jest.fn((x: Record<string, unknown>) => ({ ...x })),
      save: jest.fn((x: Record<string, unknown>) => {
        saved.push(x);
        return Promise.resolve(x);
      }),
    };
    return { svc: new ErasureSuppressionService(repo as never), repo, saved };
  }

  describe('record', () => {
    it('stores blind indexes, never the address or the raw id', async () => {
      const { svc, saved } = build();
      await svc.record(2, { email: EMAIL, shopifyCustomerId: SHOPIFY_ID }, ERASURE_SOURCE.DSAR);

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        tenantId: 2,
        emailHash: blindIndex(EMAIL),
        shopifyCustomerHash: blindIndex(SHOPIFY_ID),
        source: 'dsar',
      });
      // The point of the blind index: nothing recoverable is written down.
      expect(JSON.stringify(saved[0])).not.toContain(EMAIL);
      expect(JSON.stringify(saved[0])).not.toContain(SHOPIFY_ID);
    });

    it('accepts an already-hashed email (customers.email_hash) as-is', async () => {
      const { svc, saved } = build();
      await svc.record(2, { emailHash: 'precomputed-hash' });
      expect(saved[0]).toMatchObject({ emailHash: 'precomputed-hash' });
    });

    it('is idempotent — a redelivered redact webhook adds no second row', async () => {
      const { svc, saved } = build([{ tenantId: 2, emailHash: blindIndex(EMAIL) }]);
      await svc.record(2, { email: EMAIL });
      expect(saved).toHaveLength(0);
    });

    it('writes nothing when there is no identifier to key on', async () => {
      // Such a row would match either everyone or no one.
      const { svc, saved, repo } = build();
      await svc.record(2, { email: null, shopifyCustomerId: null });
      expect(saved).toHaveLength(0);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('lets a write failure surface instead of scrubbing unrecorded', async () => {
      // Scrubbing without recording is exactly how the erasure came undone.
      const { svc, repo } = build();
      repo.save.mockRejectedValueOnce(new Error('table locked'));
      await expect(svc.record(2, { email: EMAIL })).rejects.toThrow('table locked');
    });
  });

  describe('isSuppressed', () => {
    it('matches on the email alone', async () => {
      const { svc } = build([{ tenantId: 2, emailHash: blindIndex(EMAIL) }]);
      await expect(svc.isSuppressed(2, { email: EMAIL })).resolves.toBe(true);
    });

    it('matches on the Shopify id alone — the app proxy carries only that', async () => {
      const { svc } = build([{ tenantId: 2, shopifyCustomerHash: blindIndex(SHOPIFY_ID) }]);
      await expect(svc.isSuppressed(2, { shopifyCustomerId: SHOPIFY_ID })).resolves.toBe(true);
    });

    it('matches the same person across identifiers', async () => {
      // Erased by email, returns signed into the storefront: still the same person.
      const { svc } = build([{ tenantId: 2, emailHash: blindIndex(EMAIL) }]);
      await expect(
        svc.isSuppressed(2, { email: EMAIL, shopifyCustomerId: 'some-other-id' }),
      ).resolves.toBe(true);
    });

    it('does not leak across tenants', async () => {
      const { svc } = build([{ tenantId: 2, emailHash: blindIndex(EMAIL) }]);
      await expect(svc.isSuppressed(3, { email: EMAIL })).resolves.toBe(false);
    });

    it('lets an unrelated shopper through', async () => {
      const { svc } = build([{ tenantId: 2, emailHash: blindIndex(EMAIL) }]);
      await expect(svc.isSuppressed(2, { email: 'someone@else.com' })).resolves.toBe(false);
    });

    it('says no when there is nothing to check', async () => {
      const { svc } = build([{ tenantId: 2, emailHash: blindIndex(EMAIL) }]);
      await expect(svc.isSuppressed(2, {})).resolves.toBe(false);
    });

    it('fails CLOSED — a lookup error must not resurrect anyone', async () => {
      // Inverted from most guards on purpose: reading an error as "not suppressed"
      // silently re-imports someone who asked to be forgotten.
      const { svc, repo } = build();
      repo.findOne.mockRejectedValueOnce(new Error('connection lost'));
      await expect(svc.isSuppressed(2, { email: EMAIL })).resolves.toBe(true);
    });
  });
});
