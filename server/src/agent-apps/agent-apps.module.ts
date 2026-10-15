import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { AiWorkflowsModule } from '../ai-workflows/ai-workflows.module';
import { KnowledgeAiChatModule } from '../knowledge-ai-chat/knowledge-ai-chat.module';
import { ProductCatalogModule } from '../product-catalog/product-catalog.module';
import { AgentAppsController } from './agent-apps.controller';
import { AgentAppsService } from './agent-apps.service';
import { AgentWorkspaceController } from './agent-workspace.controller';
import { AgentWorkspaceService } from './agent-workspace.service';
import { AgentApp } from './entities/agent-app.entity';
import { AgentDraft } from './entities/agent-draft.entity';
import { AgentExecution } from './entities/agent-execution.entity';
import { AgentMessage } from './entities/agent-message.entity';
import { AgentSession } from './entities/agent-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentApp,
      AgentSession,
      AgentMessage,
      AgentDraft,
      AgentExecution,
    ]),
    AiFeatureConfigsModule,
    AiWorkflowsModule,
    KnowledgeAiChatModule,
    ProductCatalogModule,
  ],
  controllers: [AgentAppsController, AgentWorkspaceController],
  providers: [AgentAppsService, AgentWorkspaceService],
  exports: [AgentAppsService],
})
export class AgentAppsModule {}
