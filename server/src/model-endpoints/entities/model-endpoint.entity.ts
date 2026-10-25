import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  ModelFunction,
  ModelProtocol,
  PlatformType,
} from '../model-endpoint.constants';

@Entity('model_endpoints')
export class ModelEndpoint extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  platformType: PlatformType;

  @Column({ length: 120 })
  modelCode: string;

  @Column({ length: 120 })
  modelName: string;

  @Column({ type: 'varchar', length: 32 })
  functionType: ModelFunction;

  @Column({ type: 'varchar', length: 40 })
  protocol: ModelProtocol;

  @Column({ length: 500 })
  apiPath: string;

  @Column({ length: 500, default: '' })
  taskApiPath: string;

  @Column({ type: 'varchar', length: 8, default: 'sync' })
  executionMode: 'sync' | 'async';

  @Column({
    type: 'tinyint',
    default: true,
    transformer: {
      to: (value: boolean) => (value ? 1 : 0),
      from: (value: number | boolean) => value === true || value === 1,
    },
  })
  isActive: boolean;

  /** 软删除时释放唯一键，保留历史配置本身。 */
  @Column({ type: 'varchar', length: 200, unique: true, nullable: true })
  routeKey: string | null;
}
