import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { AiWorkflowDefinition } from '../../knowledge-retrieval-configs/workflow-definition';

/**
 * 可复用的 AI 工作流：画布定义用于系统执行，AI 说明用于约束回答模型。
 */
@Entity('ai_workflows')
export class AiWorkflow extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'simple-json', nullable: true })
  workflowDefinition: AiWorkflowDefinition | null;

  @Column({ type: 'text', nullable: true })
  aiInstruction: string | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  /**
   * 旧版历史字段：保留数据库列及既有内容，新的工作流管理界面和 DTO 不再读写它。
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;
}
