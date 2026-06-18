import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { JobLabel } from './entity/job-label.entity';
import { UserJobLabel } from './entity/user-job-label.entity';
import { Invitation } from './entity/invitation.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JobLabelController } from './job-label.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, JobLabel, UserJobLabel, Invitation])],
  controllers: [UserController, JobLabelController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
