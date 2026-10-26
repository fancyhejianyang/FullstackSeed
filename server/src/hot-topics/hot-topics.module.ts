import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { ContentArticlesModule } from '../content-articles/content-articles.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { User } from '../users/entities/user.entity';
import {
  HotTopic,
  HotTopicPreference,
  HotTopicRun,
  HotTopicSource,
} from './entities/hot-topic.entity';
import { HotTopicFetchService } from './hot-topic-fetch.service';
import { HotTopicSourcesService } from './hot-topic-sources.service';
import { HotTopicSourcesController } from './hot-topic-sources.controller';
import { HotTopicsController } from './hot-topics.controller';
import { HotTopicsService } from './hot-topics.service';
import { HotTopicCookieService } from './hot-topic-cookie.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HotTopic,
      HotTopicSource,
      HotTopicPreference,
      HotTopicRun,
      User,
      AiFeatureConfig,
    ]),
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
    ContentArticlesModule,
  ],
  controllers: [HotTopicsController, HotTopicSourcesController],
  providers: [
    HotTopicsService,
    HotTopicSourcesService,
    HotTopicFetchService,
    HotTopicCookieService,
  ],
  exports: [HotTopicsService],
})
export class HotTopicsModule {}
