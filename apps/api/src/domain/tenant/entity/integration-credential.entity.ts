import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** integration_credentials — per-tenant provider secrets, AES-256-GCM (FR-060). */
@Entity('integration_credentials')
@Unique('uk_cred_tenant_provider', ['tenantId', 'provider'])
export class IntegrationCredential {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 32 })
  provider: string; // shopify/fulfillment/klaviyo/odoo/google_drive

  @Column({ name: 'secret_enc', type: 'varbinary', length: 2048, nullable: true })
  secretEnc: Buffer | null;

  @Column({ type: 'varchar', length: 16, default: 'connected' })
  status: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
