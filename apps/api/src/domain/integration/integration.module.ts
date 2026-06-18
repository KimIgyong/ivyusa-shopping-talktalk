import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationStatusEntity } from './entity/integration-status.entity';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IntegrationStatusEntity])],
  controllers: [IntegrationController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
