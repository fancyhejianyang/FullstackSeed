import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { ContentArticle } from './entities/content-article.entity';
import { ContentArticlesController } from './content-articles.controller';
import { ContentArticlesService } from './content-articles.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentArticle]),
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
  ],
  controllers: [ContentArticlesController],
  providers: [ContentArticlesService],
})
export class ContentArticlesModule {}
