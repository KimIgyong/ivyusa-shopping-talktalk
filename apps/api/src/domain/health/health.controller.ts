import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../global/decorator/public.decorator';

/** Liveness/readiness probe for compose healthchecks, nginx, and load balancers. */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check (liveness + DB readiness)' })
  async check() {
    let db = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db, uptime: process.uptime(), timestamp: new Date().toISOString() };
  }
}
