import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_base_chunks')
export class KnowledgeBaseChunk extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  knowledgeBaseId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @Index()
  @Column({ type: 'int' })
  documentId: number;

  @Column({ type: 'int', default: 0 })
  chunkIndex: number;

  @Column({ length: 200, default: '' })
  title: string;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'int', default: 0 })
  tokenCount: number;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
