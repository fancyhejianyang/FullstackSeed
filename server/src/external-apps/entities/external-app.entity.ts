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

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
