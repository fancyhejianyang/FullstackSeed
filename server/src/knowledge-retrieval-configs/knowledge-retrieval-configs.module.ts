import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeBaseCategory } from '../knowledge-bases/entities/knowledge-base-category.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from './entities/knowledge-retrieval-config.entity';
import { KnowledgeRetrievalConfigsController } from './knowledge-retrieval-configs.controller';
import { KnowledgeRetrievalConfigsService } from './knowledge-retrieval-configs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeRetrievalConfig,
      KnowledgeBase,
      KnowledgeBaseCategory,
    ]),
    AiFeatureConfigsModule,
  ],
  controllers: [KnowledgeRetrievalConfigsController],
  providers: [KnowledgeRetrievalConfigsService],
  exports: [KnowledgeRetrievalConfigsService],
})
export class KnowledgeRetrievalConfigsModule {}
