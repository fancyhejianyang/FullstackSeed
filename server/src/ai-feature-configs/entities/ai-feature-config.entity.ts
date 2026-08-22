import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AiFeatureType,
  AiResponseFormat,
} from '../ai-feature-config.constants';

@Entity('ai_feature_configs')
export class AiFeatureConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Index()
  @Column({ length: 40 })
  featureType: AiFeatureType;

  @Column({ type: 'int', nullable: true })
  providerId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string | null;

  @Column({ type: 'tinyint', default: false })
  useMineru: boolean;

  @Column({ type: 'int', nullable: true })
  mineruConfigId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mineruConfigName: string | null;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'text', nullable: true })
  rules: string | null;

  @Column({ length: 40, default: 'text' })
  responseFormat: AiResponseFormat;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
