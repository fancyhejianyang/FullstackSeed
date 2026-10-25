import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogRecordsModule } from '../log-records/log-records.module';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { KnowledgeAiProvidersController } from './knowledge-ai-providers.controller';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeWebSearchService } from './knowledge-web-search.service';
import { ModelEndpointsModule } from '../model-endpoints/model-endpoints.module';
import { ModelEndpointTestsController } from './model-endpoint-tests.controller';
import { ModelEndpointTestsService } from './model-endpoint-tests.service';

@Module({
  imports: [
    ModelEndpointsModule,
    LogRecordsModule,
    TypeOrmModule.forFeature([KnowledgeAiProvider, AiFeatureConfig]),
  ],
  controllers: [KnowledgeAiProvidersController, ModelEndpointTestsController],
  providers: [
    KnowledgeAiProvidersService,
    KnowledgeWebSearchService,
    ModelEndpointTestsService,
  ],
  exports: [KnowledgeAiProvidersService, KnowledgeWebSearchService],
})
export class KnowledgeAiProvidersModule {}
