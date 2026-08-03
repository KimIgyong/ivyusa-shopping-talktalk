import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entity/audit-log.entity';
import { User } from '../user/entity/user.entity';
import { AdminUser } from '../auth/entity/admin-user.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User, AdminUser])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
