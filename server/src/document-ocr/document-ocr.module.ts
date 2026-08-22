import { Module } from '@nestjs/common';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { MineruConfigsModule } from '../mineru-configs/mineru-configs.module';
import { DocumentOcrService } from './document-ocr.service';

@Module({
  imports: [
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
    MineruConfigsModule,
  ],
  providers: [DocumentOcrService],
  exports: [DocumentOcrService],
})
export class DocumentOcrModule {}
