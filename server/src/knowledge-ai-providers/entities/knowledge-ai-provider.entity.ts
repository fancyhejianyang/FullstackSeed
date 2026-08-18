import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_ai_providers')
export class KnowledgeAiProvider extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ length: 500 })
  apiUrl: string;

  @Column({ length: 200, default: 'v1/chat/completions' })
  chatApiPath: string;

  @Column({ type: 'text', nullable: true })
  secretKey: string | null;

  @Column({ type: 'text', nullable: true })
  models: string | null;

  @Column({ type: 'text', nullable: true })
  textModels: string | null;

  @Column({ type: 'text', nullable: true })
  visionModels: string | null;

  @Column({ type: 'text', nullable: true })
  embeddingModels: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
