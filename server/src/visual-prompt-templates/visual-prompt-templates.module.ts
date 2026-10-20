import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { VisualPromptTemplate } from './entities/visual-prompt-template.entity';
import { VisualPromptTemplatesController } from './visual-prompt-templates.controller';
import { VisualPromptTemplatesService } from './visual-prompt-templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VisualPromptTemplate]),
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
  ],
  controllers: [VisualPromptTemplatesController],
  providers: [VisualPromptTemplatesService],
  exports: [VisualPromptTemplatesService],
})
export class VisualPromptTemplatesModule {}
