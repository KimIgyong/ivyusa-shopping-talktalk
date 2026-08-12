import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerReuse } from './entity/answer-reuse.entity';
import { AnswerReuseService } from './answer-reuse.service';
import { AnswerReuseController } from './answer-reuse.controller';

/**
 * Answer reuse (PLN-260808 Track C): verified past answers replayed for
 * near-duplicate questions before the LLM runs. Consumed by Chat (lookup +
 * AI ingest), Agent (reply ingest) and Privacy (DSAR erasure). AiGateway and
 * ReuseQdrant arrive via the global infrastructure/vector modules.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AnswerReuse])],
  controllers: [AnswerReuseController],
  providers: [AnswerReuseService],
  exports: [AnswerReuseService],
})
export class AnswerReuseModule {}
