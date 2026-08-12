import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenant/entity/tenant.entity';
import { User } from '../user/entity/user.entity';
import { TenantMenu } from './entity/tenant-menu.entity';
import { TenantRoleMenu } from './entity/tenant-role-menu.entity';
import { TenantUserMenu } from './entity/tenant-user-menu.entity';
import { AuditModule } from '../audit/audit.module';
import { MenuAccessService } from './menu-access.service';
import { MenuAccessController } from './menu-access.controller';
import { AdminTenantMenuController } from './admin-tenant-menu.controller';

/**
 * Menu provisioning & access (PLN-260812-Menu-Provisioning-Access).
 *
 * Its own domain rather than a lodger in tenant/ or user/: both sides write to
 * it (platform admin provisions, tenant master delegates) and both would
 * otherwise have to import the other.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TenantMenu, TenantRoleMenu, TenantUserMenu, Tenant, User]),
    AuditModule,
  ],
  controllers: [MenuAccessController, AdminTenantMenuController],
  providers: [MenuAccessService],
  exports: [MenuAccessService],
})
export class MenuAccessModule {}
