import { Global, Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { ReuseQdrantService } from './reuse-qdrant.service';

/** Global vector-index access (KB hybrid RAG + answer-reuse questions). */
@Global()
@Module({
  providers: [QdrantService, ReuseQdrantService],
  exports: [QdrantService, ReuseQdrantService],
})
export class VectorModule {}
