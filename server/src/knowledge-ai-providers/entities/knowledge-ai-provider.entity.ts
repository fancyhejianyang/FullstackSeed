import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('knowledge_ai_providers')
export class KnowledgeAiProvider extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ length: 500 })
  apiUrl: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  workspaceId: string | null;

  /** 历史兼容列：保留存量数据，接口与调用链路不再读取或写入。 */
  @Column({ length: 200, default: 'v1/chat/completions' })
  chatApiPath: string;

  @Column({ type: 'text', nullable: true })
  secretKey: string | null;

  @Column({ type: 'text', nullable: true })
  models: string | null;

  @Column({ type: 'text', nullable: true })
  textModels: string | null;

  @Column({ type: 'text', nullable: true })
  visionModels: string | null;

  @Column({ type: 'text', nullable: true })
  imageGenerationModels: string | null;

  /** 历史兼容列：协议统一由模型功能接口卡片维护。 */
  @Column({ type: 'varchar', length: 24, default: 'openai' })
  imageGenerationProtocol: 'openai' | 'dashscope';

  /** 历史兼容列：保留旧值但不作为调用回退地址。 */
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageGenerationApiUrl: string | null;

  @Column({ type: 'text', nullable: true })
  videoGenerationModels: string | null;

  /** 历史兼容列：保留旧值但不作为调用回退地址。 */
  @Column({ type: 'varchar', length: 500, nullable: true })
  videoGenerationApiUrl: string | null;

  @Column({ type: 'text', nullable: true })
  embeddingModels: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
