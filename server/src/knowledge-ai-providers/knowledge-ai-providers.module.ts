import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogRecordsModule } from '../log-records/log-records.module';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { KnowledgeAiProvidersController } from './knowledge-ai-providers.controller';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';

@Module({
  imports: [
    LogRecordsModule,
    TypeOrmModule.forFeature([KnowledgeAiProvider, AiFeatureConfig]),
  ],
  controllers: [KnowledgeAiProvidersController],
  providers: [KnowledgeAiProvidersService],
  exports: [KnowledgeAiProvidersService],
})
export class KnowledgeAiProvidersModule {}
