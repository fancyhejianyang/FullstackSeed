import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { AiWorkflowDefinition } from '../workflow-definition';

export type KnowledgeRetrievalMode = 'fullText' | 'vector' | 'hybrid';

@Entity('knowledge_retrieval_configs')
export class KnowledgeRetrievalConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 40, default: 'hybrid' })
  retrievalMode: KnowledgeRetrievalMode;

  @Column({ type: 'simple-json', nullable: true })
  categoryIds: number[] | null;

  @Column({ type: 'text', nullable: true })
  categoryNames: string | null;

  @Column({ type: 'simple-json', nullable: true })
  knowledgeBaseIds: number[] | null;

  @Column({ type: 'text', nullable: true })
  knowledgeBaseNames: string | null;

  @Column({ type: 'int', default: 6 })
  topK: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0.35 })
  minScore: number;

  @Column({ type: 'int', default: 60 })
  rrfK: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 0.8 })
  textWeight: number;

  @Column({ type: 'decimal', precision: 8, scale: 4, default: 1 })
  vectorWeight: number;

  @Column({ type: 'int', default: 15 })
  sessionContextTimeoutMinutes: number;

  /** 已关联的可复用 AI 工作流；为空时继续兼容读取旧工作流定义。 */
  @Column({ type: 'int', nullable: true })
  workflowId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  workflowName: string | null;

  /** 存量检索配置的内嵌工作流定义，保留用于兼容，不再由新页面编辑。 */
  @Column({ type: 'simple-json', nullable: true })
  workflowDefinition: AiWorkflowDefinition | null;

  /** 是否先用固定答案拦截已审核的标准问题。 */
  @Column({ type: 'tinyint', default: true })
  enableStandardQa: boolean;

  /** 是否把口语表达校准为可检索、可理解的业务语义。 */
  @Column({ type: 'tinyint', default: true })
  enableColloquial: boolean;

  /** 是否执行路由规则、候选召回与重排等知识库流程。 */
  @Column({ type: 'tinyint', default: true })
  enableKnowledgeRetrieval: boolean;

  /** 是否允许工作流调用已授权的只读业务指令。 */
  @Column({ type: 'tinyint', default: false })
  enableBusinessCommands: boolean;

  @Column({ type: 'tinyint', default: true })
  enableRerank: boolean;

  @Column({ type: 'int', nullable: true })
  rerankAiFeatureConfigId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  rerankAiFeatureConfigName: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
