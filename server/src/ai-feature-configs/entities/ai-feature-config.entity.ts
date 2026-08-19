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

  @Column()
  providerId: number;

  @Column({ length: 120 })
  providerName: string;

  @Column({ length: 120 })
  model: string;

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

