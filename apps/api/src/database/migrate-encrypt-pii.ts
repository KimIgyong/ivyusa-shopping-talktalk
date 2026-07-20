import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { Customer } from '../domain/customer/entity/customer.entity';

/**
 * One-time backfill for PRV-M6: encrypt existing customer PII and populate
 * email_hash. Safe to run repeatedly — the entity transformer tolerantly reads
 * legacy plaintext (stored as bytes after the varchar→varbinary ALTER), and
 * `save()` re-encrypts + the BeforeUpdate hook recomputes the (deterministic)
 * blind index.
 *
 * PRODUCTION ORDER (data-preserving):
 *   1. `ALTER TABLE customers MODIFY email VARBINARY(512) NULL,
 *       MODIFY name VARBINARY(512) NULL, MODIFY phone VARBINARY(256) NULL,
 *       ADD email_hash VARCHAR(64) NULL, ADD KEY idx_customers_email_hash (email_hash);`
 *      MODIFY converts varchar→varbinary in place, keeping the bytes.
 *   2. `npm run db:migrate-pii` (this script) to encrypt + populate the hash.
 * Do NOT rely on TypeORM `synchronize` for this — it drops/recreates the column
 * and loses the plaintext. `synchronize` is dev-only.
 *
 * NOTE: PII + email_hash are bound to CRED_ENC_KEY. Rotating that key requires
 * decrypting with the old key and re-running this backfill with the new one.
 */
const BATCH = 200;

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Customer);
  let processed = 0;
  try {
    for (let offset = 0; ; offset += BATCH) {
      const rows = await repo.find({ order: { id: 'ASC' }, skip: offset, take: BATCH });
      if (rows.length === 0) break;
      // save() runs the piiTransformer (encrypt) + BeforeUpdate (email_hash).
      await repo.save(rows);
      processed += rows.length;
      console.log(`  …encrypted ${processed} customer row(s)`);
    }
    console.log(`✅ PII backfill complete: ${processed} customer row(s).`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error('PII backfill failed:', e);
  process.exit(1);
});
