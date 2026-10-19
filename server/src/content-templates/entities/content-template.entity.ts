import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('content_templates')
export class ContentTemplate extends BaseEntity {
  @Index('IDX_content_templates_owner')
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text' })
  instruction: string;
}
