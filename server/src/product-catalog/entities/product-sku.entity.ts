import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('product_skus')
export class ProductSku extends BaseEntity {
  @Index()
  @Column({ type: 'int' })
  productId: number;

  @Index({ unique: true })
  @Column({ length: 100 })
  skuCode: string;

  /** 同一产品下可用于区分 SKU 的展示名称，例如“蓝色 / 256G”。 */
  @Column({ length: 160, default: '' })
  name: string;

  /** SKU 的真实业务参数，例如颜色、容量、重量、尺寸。 */
  @Column({ type: 'simple-json' })
  specifications: Record<string, unknown>;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  /** 内部 Agent 写入幂等键；普通 CRUD 不接收或展示此字段。 */
  @Index('UQ_product_skus_agent_operation', { unique: true })
  @Column({ type: 'varchar', length: 120, nullable: true, select: false })
  agentOperationKey: string | null;
}
