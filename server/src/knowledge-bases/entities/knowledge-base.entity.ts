import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_bases')
export class KnowledgeBase extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ length: 80, default: '' })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
