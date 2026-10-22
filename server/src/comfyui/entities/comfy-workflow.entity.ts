import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type ComfyOutputType = 'image' | 'video';
export type ComfyBindingType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'image'
  | 'seed'
  | 'outputPrefix';
export type ComfyBindingSemanticRole =
  | 'normal'
  | 'mainPrompt'
  | 'positivePrompt'
  | 'negativePrompt'
  | 'videoMotion'
  | 'cameraMotion';

export interface ComfyInputBinding {
  key: string;
  label: string;
  type: ComfyBindingType;
  nodeId: string;
  inputKey: string;
  semanticRole?: ComfyBindingSemanticRole;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string | number }>;
  hint?: string;
}

@Entity('comfy_workflows')
@Index('IDX_comfy_workflow_connection', ['connectionId', 'isEnabled'])
export class ComfyWorkflow extends BaseEntity {
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'int' }) connectionId: number;
  @Column({ type: 'varchar', length: 20, default: 'image' })
  outputType: ComfyOutputType;
  @Column({ type: 'varchar', length: 120, nullable: true })
  targetModel: string | null;
  @Column({ type: 'int', nullable: true })
  visualPromptTemplateId: number | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
  @Column({ type: 'longtext', select: false }) apiWorkflow: string;
  @Column({ type: 'simple-json' }) inputBindings: ComfyInputBinding[];
  @Column({ type: 'simple-json', nullable: true })
  outputNodeIds: string[] | null;
  @Column({ type: 'text', nullable: true }) dependencyNotes: string | null;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'boolean', default: true }) isEnabled: boolean;
}
