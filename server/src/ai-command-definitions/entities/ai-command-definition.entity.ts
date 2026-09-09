import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import {
  type AiCommandAction,
  type AiCommandExecutionMode,
} from '../ai-command-definitions.constants';

@Entity('ai_command_definitions')
export class AiCommandDefinition extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 100 })
  commandKey: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'simple-json', nullable: true })
  semanticKeywords: string[] | null;

  @Column({ length: 20 })
  action: AiCommandAction;

  @Column({ length: 20 })
  executionMode: AiCommandExecutionMode;

  @Column({ length: 100 })
  handlerKey: string;

  @Column({ length: 240 })
  executionTarget: string;

  @Column({ length: 12 })
  apiMethod: string;

  @Column({ length: 240 })
  apiPath: string;

  @Column({ type: 'text' })
  requestSchema: string;

  @Column({ type: 'text' })
  contextBindings: string;

  @Column({ type: 'tinyint', default: false })
  chatCallable: boolean;

  @Column({ type: 'tinyint', default: false })
  requireApproval: boolean;

  @Column({ type: 'tinyint', default: true })
  isEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
