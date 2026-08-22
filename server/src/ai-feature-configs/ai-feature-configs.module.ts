import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { MineruConfigsModule } from '../mineru-configs/mineru-configs.module';
import { AiFeatureConfigsController } from './ai-feature-configs.controller';
import { AiFeatureConfigsService } from './ai-feature-configs.service';
import { AiFeatureConfig } from './entities/ai-feature-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiFeatureConfig]),
    KnowledgeAiProvidersModule,
    MineruConfigsModule,
  ],
  controllers: [AiFeatureConfigsController],
  providers: [AiFeatureConfigsService],
  exports: [AiFeatureConfigsService],
})
export class AiFeatureConfigsModule {}
