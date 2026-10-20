import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  ComfyInputBinding,
  ComfyOutputType,
} from './comfy-workflow.entity';

@Entity('comfy_workflow_versions')
@Index('UQ_comfy_workflow_version', ['workflowId', 'version'], {
  unique: true,
})
export class ComfyWorkflowVersion extends BaseEntity {
  @Column({ type: 'int' }) workflowId: number;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'int' }) connectionId: number;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'varchar', length: 20 }) outputType: ComfyOutputType;
  @Column({ type: 'longtext' }) apiWorkflow: string;
  @Column({ type: 'simple-json' }) inputBindings: ComfyInputBinding[];
  @Column({ type: 'simple-json', nullable: true })
  outputNodeIds: string[] | null;
}
