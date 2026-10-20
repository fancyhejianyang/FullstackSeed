import { ContentTemplatesModule } from '../content-templates/content-templates.module';
import { ContentGenerationTask } from './entities/content-generation-task.entity';
import { ContentGenerationService } from './content-generation.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { ContentArticle } from './entities/content-article.entity';
import { ContentArticlesController } from './content-articles.controller';
import { ContentArticlesService } from './content-articles.service';
import { ContentCoverService } from './content-cover.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentArticle, ContentGenerationTask]),
    ContentTemplatesModule,
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
    UploadsModule,
  ],
  controllers: [ContentArticlesController],
  providers: [
    ContentArticlesService,
    ContentGenerationService,
    ContentCoverService,
  ],
  exports: [ContentArticlesService, ContentGenerationService],
})
export class ContentArticlesModule {}
