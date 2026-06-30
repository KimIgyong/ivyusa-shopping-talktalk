import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CAPABILITY, Principal } from '@ivy/types';
import { normalizePage, buildPagination } from '@ivy/common';
import { AuditService } from './audit.service';
import { RequireCapability } from '../../global/decorator/auth.decorator';
import { CurrentUser } from '../../global/decorator/current-user.decorator';
import { Paginated } from '../../global/interceptor/transform.interceptor';
import { ListAuditQuery } from './dto/request/audit.request';

/** Audit log read access (FR-061). Tenant-scoped for tenant users. */
@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireCapability(CAPABILITY.TENANT_AUDIT_READ)
  @ApiOperation({ summary: 'List audit logs (tenant-scoped)' })
  async list(@CurrentUser() user: Principal, @Query() query: ListAuditQuery) {
    const { page, size } = normalizePage(query.page, query.size);
    const tenantId = user.actorType === 'user' ? user.tenantId : null;
    const { items, total } = await this.auditService.list({
      tenantId,
      action: query.action,
      actorType: query.actor_type,
      page,
      size,
    });
    return new Paginated(
      items.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        actorType: a.actorType,
        actorId: a.actorId,
        action: a.action,
        target: a.target,
        createdAt: a.createdAt,
      })),
      buildPagination(page, size, total),
    );
  }
}
