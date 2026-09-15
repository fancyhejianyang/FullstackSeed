import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeAiChatMessage } from '../knowledge-ai-chat/entities/knowledge-ai-chat-message.entity';
import { KnowledgeStandardQasController } from './knowledge-standard-qas.controller';
import { KnowledgeStandardQasService } from './knowledge-standard-qas.service';
import { KnowledgeStandardQa } from './entities/knowledge-standard-qa.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeStandardQa,
      KnowledgeAiChatMessage,
    ]),
  ],
  controllers: [KnowledgeStandardQasController],
  providers: [KnowledgeStandardQasService],
  exports: [KnowledgeStandardQasService],
})
export class KnowledgeStandardQasModule {}
