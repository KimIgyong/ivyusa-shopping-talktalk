import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../global/decorator/public.decorator';
import { AdminOnly } from '../../global/decorator/auth.decorator';

/** Liveness/readiness probe for compose healthchecks, nginx, and load balancers. */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Public liveness probe (SEC-L5): status only — no uptime, no DB state exposed
   * to unauthenticated callers. Compose/nginx/LB healthchecks only need the 200.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness check (public, status only)' })
  check() {
    return { status: 'ok' };
  }

  /** Readiness with DB probe + uptime — admin-only (internal operational detail). */
  @Get('ready')
  @AdminOnly()
  @ApiOperation({ summary: 'Readiness check (admin: DB + uptime)' })
  async ready() {
    let db = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
