import { Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../global/util/transformers';

/** user_job_labels — N:M user ↔ job_label (FR-055). */
@Entity('user_job_labels')
export class UserJobLabel {
  @PrimaryColumn({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @PrimaryColumn({ name: 'job_label_id', type: 'bigint', transformer: bigintTransformer })
  jobLabelId: number;
}
