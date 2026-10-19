import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { ManagedFilesModule } from '../managed-files/managed-files.module';
import {
  AiMaterialsController,
  MaterialGenerationTasksController,
} from './ai-materials.controller';
import { AiMaterialsService } from './ai-materials.service';
import { AiMaterial } from './entities/ai-material.entity';
import { MaterialGenerationTask } from './entities/material-generation-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiMaterial,
      MaterialGenerationTask,
      AiFeatureConfig,
    ]),
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
    ManagedFilesModule,
  ],
  controllers: [AiMaterialsController, MaterialGenerationTasksController],
  providers: [AiMaterialsService],
})
export class AiMaterialsModule {}
