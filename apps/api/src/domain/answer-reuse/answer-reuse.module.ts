import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnswerReuse } from './entity/answer-reuse.entity';
import { KbCategory } from '../knowledge/entity/kb-category.entity';
import { AnswerReuseService } from './answer-reuse.service';
import { AnswerReuseController } from './answer-reuse.controller';

/**
 * Answer reuse (PLN-260808 Track C): verified past answers replayed for
 * near-duplicate questions before the LLM runs. Consumed by Chat (lookup +
 * AI ingest), Agent (reply ingest) and Privacy (DSAR erasure). AiGateway and
 * ReuseQdrant arrive via the global infrastructure/vector modules.
 */
@Module({
  imports: [
    // KbCategory is repository-only: replay has to know whether the tenant
    // scopes any category before it may reuse a row that predates agents.
    TypeOrmModule.forFeature([AnswerReuse, KbCategory]),
  ],
  controllers: [AnswerReuseController],
  providers: [AnswerReuseService],
  exports: [AnswerReuseService],
})
export class AnswerReuseModule {}
