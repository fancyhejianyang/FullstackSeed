import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('products')
export class Product extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 80 })
  productCode: string;

  @Index()
  @Column({ length: 160 })
  name: string;

  /** 用于产品识别；最终事实仍以 SKU 记录为准。 */
  @Column({ type: 'simple-json', nullable: true })
  aliases: string[] | null;

  @Column({ length: 80, default: '' })
  category: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;
}
