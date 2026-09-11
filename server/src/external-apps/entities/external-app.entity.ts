import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('external_apps')
export class ExternalApp extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  appId: string;

  @Column({ type: 'text', nullable: true })
  domain: string | null;

  @Column({ type: 'int', nullable: true })
  aiFeatureConfigId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  aiFeatureConfigName: string | null;

  @Column({ type: 'int', nullable: true })
  retrievalConfigId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  retrievalConfigName: string | null;

  /** 为空的旧应用仅使用系统基础问答指令；额外业务指令必须显式授权。 */
  @Column({ type: 'simple-json', nullable: true })
  commandKeys: string[] | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
