import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCommandDefinitionsModule } from '../ai-command-definitions/ai-command-definitions.module';
import { KnowledgeAiChatModule } from '../knowledge-ai-chat/knowledge-ai-chat.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { ProductCatalogModule } from '../product-catalog/product-catalog.module';
import { DemoModule } from '../demo/demo.module';
import { KnowledgeStandardQasModule } from '../knowledge-standard-qas/knowledge-standard-qas.module';
import { KnowledgeColloquialTermsModule } from '../knowledge-colloquial-terms/knowledge-colloquial-terms.module';
import { KnowledgeBasesModule } from '../knowledge-bases/knowledge-bases.module';
import { ContentArticlesModule } from '../content-articles/content-articles.module';
import { AgentBusinessService } from './agent-business.service';
import { AgentModelRouterService } from './agent-model-router.service';
import { AgentAppsController } from './agent-apps.controller';
import { AgentAppsService } from './agent-apps.service';
import { AgentWorkspaceController } from './agent-workspace.controller';
import { AgentWorkspaceService } from './agent-workspace.service';
import { AgentApp } from './entities/agent-app.entity';
import { AgentDraft } from './entities/agent-draft.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSession } from './entities/agent-session.entity';
import { AgentImage } from './entities/agent-image.entity';
import { AgentMediaService } from './agent-media.service';
import { AgentMediaProbeService } from './agent-media-probe.service';
import { AgentExecutionRuntimeService } from './agent-execution-runtime.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentApp,
      AgentSession,
      AgentMessage,
      AgentDraft,
      AgentExecution,
      AgentImage,
    ]),
    AiCommandDefinitionsModule,
    KnowledgeAiChatModule,
    KnowledgeAiProvidersModule,
    ProductCatalogModule,
    DemoModule,
    KnowledgeStandardQasModule,
    KnowledgeColloquialTermsModule,
    KnowledgeBasesModule,
    ContentArticlesModule,
  ],
  controllers: [AgentAppsController, AgentWorkspaceController],
  providers: [
    AgentAppsService,
    AgentWorkspaceService,
    AgentBusinessService,
    AgentModelRouterService,
    AgentMediaService,
    AgentMediaProbeService,
    AgentExecutionRuntimeService,
  ],
  exports: [AgentAppsService],
})
export class AgentAppsModule {}
