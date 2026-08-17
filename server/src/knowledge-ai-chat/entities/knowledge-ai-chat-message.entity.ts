import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_ai_chat_messages')
export class KnowledgeAiChatMessage extends BaseEntity {
  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  providerId: number;

  @Column({ length: 120 })
  providerName: string;

  @Column({ length: 120 })
  model: string;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'tinyint', default: true })
  isSuccess: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  elapsedMilliseconds: number;
}
