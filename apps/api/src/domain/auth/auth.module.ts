import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from './entity/admin-user.entity';
import { MfaCredential } from './entity/mfa-credential.entity';
import { MfaRecoveryCode } from './entity/mfa-recovery-code.entity';
import { User } from '../user/entity/user.entity';
import { JobLabel } from '../user/entity/job-label.entity';
import { UserJobLabel } from '../user/entity/user-job-label.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminUser,
      MfaCredential,
      MfaRecoveryCode,
      User,
      JobLabel,
      UserJobLabel,
      Tenant,
    ]),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, LoginRateLimitService],
  exports: [MfaService],
})
export class AuthModule {}
