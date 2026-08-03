import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('log_module_configs')
export class LogModuleConfig extends BaseEntity {
  @Column({ length: 80, unique: true })
  moduleId: string;

  @Column({ length: 100 })
  moduleName: string;

  @Column({ length: 100 })
  modelName: string;

  @Column({ type: 'tinyint', default: false })
  enabled: boolean;

  @Column({ type: 'simple-json', nullable: true })
  enabledActions: string[] | null;
}
