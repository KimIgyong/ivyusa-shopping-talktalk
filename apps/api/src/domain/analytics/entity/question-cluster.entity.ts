import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/**
 * question_clusters — persistent centroids for the similar-question lens.
 *
 * Kept across runs so each day's questions are assigned incrementally (nearest
 * centroid, or a new cluster below the similarity threshold) rather than
 * re-clustering the entire history nightly.
 */
@Entity('question_clusters')
@Index('idx_qcluster_tenant', ['tenantId'])
export class QuestionCluster {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  /** Representative question for the group; PII-scrubbed, editable by an admin. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  /** Running mean of member embeddings. */
  @Column({ type: 'json', nullable: true })
  centroid: number[] | null;

  @Column({ type: 'int', default: 0 })
  size: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
