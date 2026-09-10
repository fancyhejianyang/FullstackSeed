import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AiFeatureConfigType,
  AiResponseFormat,
} from '../ai-feature-config.constants';

@Entity('ai_feature_configs')
export class AiFeatureConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Index()
  @Column({ type: 'varchar', length: 40 })
  featureType: AiFeatureConfigType;

  @Column({ type: 'int', nullable: true })
  providerId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string | null;

  /**
   * 项目侧 Think 总开关。仅聊天配置生效，避免把供应商特有参数误用于 OCR、解析或重排调用。
   */
  @Column({ type: 'tinyint', default: false })
  enableThinking: boolean;

  /**
   * 供应商/模型特有的 Think 请求参数，例如 { "enable_thinking": true }。
   */
  @Column({ type: 'json', nullable: true })
  thinkingParameters: Record<string, unknown> | null;

  @Column({ type: 'tinyint', default: false })
  useMineru: boolean;

  @Column({ type: 'int', nullable: true })
  mineruConfigId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mineruConfigName: string | null;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'double', default: 0.2 })
  temperature: number;

  @Column({ type: 'varchar', length: 40, default: 'text' })
  responseFormat: AiResponseFormat;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
