import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from './entity/admin-user.entity';
import { User } from '../user/entity/user.entity';
import { JobLabel } from '../user/entity/job-label.entity';
import { UserJobLabel } from '../user/entity/user-job-label.entity';
import { Tenant } from '../tenant/entity/tenant.entity';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser, User, JobLabel, UserJobLabel, Tenant])],
  controllers: [AuthController],
  providers: [AuthService, LoginRateLimitService],
})
export class AuthModule {}
