import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_base_categories')
export class KnowledgeBaseCategory extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  knowledgeBaseId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 80, default: '' })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
