import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeRetrievalConfigsModule } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.module';
import { ExternalAppsController } from './external-apps.controller';
import { ExternalAppsService } from './external-apps.service';
import { ExternalApp } from './entities/external-app.entity';
import { AppIdGuard } from './guards/app-id.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalApp]),
    AiFeatureConfigsModule,
    KnowledgeRetrievalConfigsModule,
  ],
  controllers: [ExternalAppsController],
  providers: [ExternalAppsService, AppIdGuard],
  exports: [ExternalAppsService, AppIdGuard],
})
export class ExternalAppsModule {}
