import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalAppsModule } from '../external-apps/external-apps.module';
import { AiFeatureConfigsModule } from '../ai-feature-configs/ai-feature-configs.module';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { KnowledgeAiChatController } from './knowledge-ai-chat.controller';
import { KnowledgeAiChatService } from './knowledge-ai-chat.service';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeAiChatSession, KnowledgeAiChatMessage]),
    ExternalAppsModule,
    AiFeatureConfigsModule,
    KnowledgeAiProvidersModule,
  ],
  controllers: [KnowledgeAiChatController],
  providers: [KnowledgeAiChatService],
})
export class KnowledgeAiChatModule {}
