import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { AgentAccessScope, AgentToolKey } from '../agent-apps.constants';

@Entity('agent_apps')
export class AgentApp extends BaseEntity {
  @Index('IDX_agent_apps_name')
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text' })
  responsibility: string;

  @Column({ type: 'int' })
  aiFeatureConfigId: number;

  @Column({ type: 'varchar', length: 120 })
  aiFeatureConfigName: string;

  @Column({ type: 'int' })
  workflowId: number;

  @Column({ type: 'varchar', length: 120 })
  workflowName: string;

  @Column({ type: 'simple-json' })
  toolKeys: AgentToolKey[];

  @Column({ type: 'varchar', length: 20, default: 'all' })
  accessScope: AgentAccessScope;

  @Column({ type: 'simple-json', nullable: true })
  allowedUserIds: number[] | null;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'tinyint', default: false })
  writeEnabled: boolean;

  @Column({ type: 'int', default: 5 })
  maxToolCalls: number;

  @Column({ type: 'int', default: 60 })
  timeoutSeconds: number;

  @Column({ type: 'int', default: 1 })
  maxConcurrentRuns: number;
}
