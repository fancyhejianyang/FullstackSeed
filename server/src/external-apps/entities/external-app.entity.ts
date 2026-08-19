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

  @Column({ nullable: true })
  aiFeatureConfigId: number | null;

  @Column({ length: 120, nullable: true })
  aiFeatureConfigName: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
