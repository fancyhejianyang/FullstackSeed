import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalAppsModule } from '../external-apps/external-apps.module';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { KnowledgeBaseChunk } from '../knowledge-bases/entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfigsModule } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.module';
import { KnowledgeVectorsModule } from '../knowledge-vectors/knowledge-vectors.module';
import { KnowledgeAiChatController } from './knowledge-ai-chat.controller';
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
    KnowledgeRetrievalConfigsModule,
    KnowledgeAiProvidersModule,
    KnowledgeVectorsModule,
  ],
  controllers: [KnowledgeAiChatController],
  providers: [KnowledgeAiChatService, KnowledgeAiChatRetrievalService],
})
export class KnowledgeAiChatModule {}
