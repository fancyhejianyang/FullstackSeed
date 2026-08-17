import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_bases')
export class KnowledgeBase extends BaseEntity {
  @Index()
  @Column({ type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 80, default: '' })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 20, default: 'text' })
  contentType: string;

  @Column({ type: 'tinyint', default: false })
  containsImages: boolean;

  @Column({ type: 'tinyint', default: false })
  allowFileUpload: boolean;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
