import { Global, Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';

/** Global vector-index access (KB hybrid RAG). */
@Global()
@Module({
  providers: [QdrantService],
  exports: [QdrantService],
})
export class VectorModule {}
