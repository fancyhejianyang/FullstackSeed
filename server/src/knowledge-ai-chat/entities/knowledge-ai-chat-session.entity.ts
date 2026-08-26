import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_ai_chat_sessions')
export class KnowledgeAiChatSession extends BaseEntity {
  @Column({ length: 200 })
  title: string;

  @Column({ type: 'int' })
  providerId: number;

  @Column({ length: 120 })
  providerName: string;

  @Column({ length: 120 })
  model: string;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'text', nullable: true })
  lastQuestion: string | null;

  @Column({ type: 'text', nullable: true })
  lastAnswer: string | null;

  @Column({ type: 'text', nullable: true })
  hitKnowledgeBaseNames: string | null;

  @Column({ type: 'tinyint', default: true })
  isSuccess: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  elapsedMilliseconds: number;
}
