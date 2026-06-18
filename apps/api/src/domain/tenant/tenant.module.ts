import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entity/tenant.entity';
import { IntegrationCredential } from './entity/integration-credential.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, IntegrationCredential])],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
