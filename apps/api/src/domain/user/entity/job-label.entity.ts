import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** job_labels — editable per-tenant job labels (FR-055). */
@Entity('job_labels')
@Unique('uk_label_tenant_code', ['tenantId', 'code'])
export class JobLabel {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 24 })
  code: string; // consult/accounting/operations

  @Column({ type: 'varchar', length: 64 })
  name: string;
}
