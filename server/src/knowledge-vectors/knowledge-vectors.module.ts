import { Module } from '@nestjs/common';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { VectorConfigsModule } from '../vector-configs/vector-configs.module';
import { KnowledgeEmbeddingService } from './knowledge-embedding.service';
import { KnowledgeVectorService } from './knowledge-vector.service';

@Module({
  imports: [KnowledgeAiProvidersModule, VectorConfigsModule],
  providers: [KnowledgeEmbeddingService, KnowledgeVectorService],
  exports: [KnowledgeEmbeddingService, KnowledgeVectorService],
})
export class KnowledgeVectorsModule {}
