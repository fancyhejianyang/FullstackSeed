import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_base_documents')
export class KnowledgeBaseDocument extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  knowledgeBaseId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ length: 200 })
  title: string;

  @Column({ length: 40, default: 'manual' })
  sourceType: string;

  @Column({ length: 255, default: '' })
  sourceName: string;

  @Column({ type: 'longtext', nullable: true })
  content: string | null;

  @Column({ length: 30, default: 'draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  hitKeywords: string | null;

  @Column({ type: 'text', nullable: true })
  colloquialDescription: string | null;

  @Column({ type: 'int', default: 1 })
  matchPriority: number;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
