import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('log_api_sources')
@Index(['method', 'apiPath'], { unique: true })
export class LogApiSource extends BaseEntity {
  @Column({ length: 80 })
  moduleId: string;

  @Column({ length: 100 })
  moduleName: string;

  @Column({ length: 100, default: '' })
  modelName: string;

  @Column({ length: 100, default: '' })
  tableName: string;

  @Column({ length: 160 })
  routePath: string;

  @Column({ length: 240, default: '' })
  sourceFile: string;

  @Column({ length: 12 })
  method: string;

  @Column({ length: 240 })
  apiPath: string;

  @Column({ length: 80 })
  action: string;

  @Column({ length: 160 })
  actionLabel: string;

  @Column({ type: 'tinyint', default: false })
  isSystem: boolean;

  @Column({ type: 'tinyint', default: false })
  isEnabled: boolean;
}
