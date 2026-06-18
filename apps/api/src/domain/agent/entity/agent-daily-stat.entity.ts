import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { bigintTransformer, decimalTransformer } from '../../../global/util/transformers';

/** agent_daily_stats — per-agent daily performance metrics (FR-068). */
@Entity('agent_daily_stats')
@Unique('uk_agentstat', ['tenantId', 'agentId', 'statDate'])
export class AgentDailyStat {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'tenant_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  tenantId: number;

  @Column({ name: 'agent_id', type: 'bigint', nullable: false, transformer: bigintTransformer })
  agentId: number;

  @Column({ name: 'stat_date', type: 'date' })
  statDate: string;

  @Column({ type: 'int', default: 0 })
  handled: number;

  @Column({ name: 'avg_first_response_sec', type: 'int', nullable: true })
  avgFirstResponseSec: number | null;

  @Column({ name: 'avg_handle_sec', type: 'int', nullable: true })
  avgHandleSec: number | null;

  @Column({ type: 'int', default: 0 })
  resolved: number;

  @Column({ type: 'int', default: 0 })
  escalated: number;

  @Column({ name: 'csat_avg', type: 'decimal', precision: 4, scale: 2, nullable: true, transformer: decimalTransformer })
  csatAvg: number | null;

  @Column({ name: 'online_sec', type: 'int', nullable: true })
  onlineSec: number | null;

  @Column({ name: 'blocked_msgs', type: 'int', default: 0 })
  blockedMsgs: number;
}
