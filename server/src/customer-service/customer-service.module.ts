import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalApp } from '../external-apps/entities/external-app.entity';
import { ExternalAppsModule } from '../external-apps/external-apps.module';
import { KnowledgeAiChatSession } from '../knowledge-ai-chat/entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatModule } from '../knowledge-ai-chat/knowledge-ai-chat.module';
import { CustomerChatTask } from './entities/customer-chat-task.entity';
import { CustomerChatMessage } from './entities/customer-chat-message.entity';
import { CustomerServiceController } from './customer-service.controller';
import { LegacyKnowledgeAiChatController } from './legacy-knowledge-ai-chat.controller';
import { CustomerServiceService } from './customer-service.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerChatTask,
      CustomerChatMessage,
      KnowledgeAiChatSession,
      ExternalApp,
    ]),
    KnowledgeAiChatModule,
    ExternalAppsModule,
  ],
  controllers: [CustomerServiceController, LegacyKnowledgeAiChatController],
  providers: [CustomerServiceService],
  exports: [CustomerServiceService],
})
export class CustomerServiceModule {}
