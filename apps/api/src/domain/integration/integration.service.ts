import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationStatusEntity } from './entity/integration-status.entity';

/** External integration connection state (FR-047). */
@Injectable()
export class IntegrationService {
  constructor(
    @InjectRepository(IntegrationStatusEntity)
    private readonly statusRepo: Repository<IntegrationStatusEntity>,
  ) {}

  async listStatus(): Promise<IntegrationStatusEntity[]> {
    return this.statusRepo.find({ order: { name: 'ASC' } });
  }

  async findByName(name: string): Promise<IntegrationStatusEntity | null> {
    return this.statusRepo.findOne({ where: { name } });
  }

  /** Upsert an integration's status by name and stamp last_sync_at. */
  async upsert(
    name: string,
    status: string,
    detail?: string,
  ): Promise<IntegrationStatusEntity> {
    let row = await this.statusRepo.findOne({ where: { name } });
    if (row) {
      row.status = status;
      if (detail !== undefined) row.detail = detail;
      row.lastSyncAt = new Date();
    } else {
      row = this.statusRepo.create({
        name,
        status,
        detail: detail ?? null,
        lastSyncAt: new Date(),
      });
    }
    return this.statusRepo.save(row);
  }
}
