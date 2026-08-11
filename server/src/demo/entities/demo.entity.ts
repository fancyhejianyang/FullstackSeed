import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { DemoStatus, DemoCategory } from '../demo.constants';

const decimalTransformer = {
  to: (value?: number | null) => value ?? 0,
  from: (value: string | number | null) => (value === null ? 0 : Number(value)),
};

@Entity('demo')
export class Demo extends BaseEntity {
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'original' })
  category: DemoCategory;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: DemoStatus;

  @Column({ length: 20, default: '' })
  contactPhone: string;

  @Column({ length: 120, default: '' })
  email: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  budgetAmount: number;

  @Column({ type: 'tinyint', default: false })
  isFeatured: boolean;

  @Column({ type: 'simple-json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ length: 255, default: '' })
  attachmentName: string;

  @Column({ type: 'text', nullable: true })
  attachmentUrl: string | null;
}
