import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalAppsModule } from '../external-apps/external-apps.module';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { AiCommandDefinitionsModule } from '../ai-command-definitions/ai-command-definitions.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { KnowledgeBaseChunk } from '../knowledge-bases/entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfigsModule } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.module';
import { KnowledgeRoutingRulesModule } from '../knowledge-routing-rules/knowledge-routing-rules.module';
import { KnowledgeStandardQasModule } from '../knowledge-standard-qas/knowledge-standard-qas.module';
import { KnowledgeColloquialTermsModule } from '../knowledge-colloquial-terms/knowledge-colloquial-terms.module';
import { KnowledgeVectorsModule } from '../knowledge-vectors/knowledge-vectors.module';
import { KnowledgeAiChatController } from './knowledge-ai-chat.controller';
import { KnowledgeAiChatCommandService } from './knowledge-ai-chat-command.service';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeAiChatSession,
      KnowledgeAiChatMessage,
      KnowledgeBase,
      KnowledgeBaseDocument,
      KnowledgeBaseChunk,
    ]),
    ExternalAppsModule,
    AiFeatureConfigsModule,
    AiCommandDefinitionsModule,
    KnowledgeRetrievalConfigsModule,
    KnowledgeRoutingRulesModule,
    KnowledgeStandardQasModule,
    KnowledgeColloquialTermsModule,
    KnowledgeAiProvidersModule,
    KnowledgeVectorsModule,
  ],
  controllers: [KnowledgeAiChatController],
  providers: [
    KnowledgeAiChatService,
    KnowledgeAiChatRetrievalService,
    KnowledgeAiChatCommandService,
  ],
})
export class KnowledgeAiChatModule {}
