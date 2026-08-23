import { Module } from '@nestjs/common';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { KnowledgeEmbeddingService } from './knowledge-embedding.service';
import { KnowledgeVectorService } from './knowledge-vector.service';

@Module({
  imports: [AiFeatureConfigsModule, KnowledgeAiProvidersModule],
  providers: [KnowledgeEmbeddingService, KnowledgeVectorService],
  exports: [KnowledgeEmbeddingService, KnowledgeVectorService],
})
export class KnowledgeVectorsModule {}
