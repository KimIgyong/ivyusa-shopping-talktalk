import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErasedIdentity } from './entity/erased-identity.entity';
import { ErasureSuppressionService } from './erasure-suppression.service';

/**
 * Standalone so both sides of the erasure contract can depend on it without a
 * cycle: PrivacyModule records, CustomerModule enforces.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ErasedIdentity])],
  providers: [ErasureSuppressionService],
  exports: [ErasureSuppressionService],
})
export class ErasureSuppressionModule {}
