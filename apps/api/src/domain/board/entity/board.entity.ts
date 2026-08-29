import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * boards — one Smart Knowledge Board per tenant (PLN-260829 B1).
 *
 * A table rather than an implied page: the requirement is that every tenant
 * HAS a board, and future boards-per-team only have to relax the unique key.
 * Rows come from the migration backfill plus a lazy ensure on first API touch,
 * so a tenant created by any path ends up with one.
 */
@Entity('boards')
@Unique('uk_boards_tenant', ['tenantId'])
export class Board {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', transformer: bigintTransformer })
  tenantId: number;

  @Column({ type: 'varchar', length: 128, default: 'Smart Knowledge Board' })
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
