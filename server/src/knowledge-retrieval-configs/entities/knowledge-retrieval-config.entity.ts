import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type KnowledgeRetrievalMode = 'fullText' | 'vector' | 'hybrid';

@Entity('knowledge_retrieval_configs')
export class KnowledgeRetrievalConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ length: 40, default: 'hybrid' })
  retrievalMode: KnowledgeRetrievalMode;

  @Column({ type: 'simple-json', nullable: true })
  categoryIds: number[] | null;

  @Column({ type: 'text', nullable: true })
  categoryNames: string | null;

  @Column({ type: 'simple-json', nullable: true })
  knowledgeBaseIds: number[] | null;

  @Column({ type: 'text', nullable: true })
  knowledgeBaseNames: string | null;

  @Column({ type: 'int', default: 10 })
  topK: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0 })
  minScore: number;

  @Column({ type: 'int', default: 60 })
  rrfK: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0.8 })
  textWeight: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 1 })
  vectorWeight: number;

  @Column({ type: 'tinyint', default: false })
  enableRerank: boolean;

  @Column({ type: 'int', nullable: true })
  rerankAiFeatureConfigId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  rerankAiFeatureConfigName: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
