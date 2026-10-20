import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('comfy_task_outputs')
@Index('IDX_comfy_task_output_task', ['taskId', 'id'])
export class ComfyTaskOutput extends BaseEntity {
  @Column({ type: 'int' }) taskId: number;
  @Column({ type: 'int' }) materialId: number;
  @Column({ type: 'int' }) fileId: number;
  @Column({ type: 'varchar', length: 2048 }) fileUrl: string;
  @Column({ type: 'varchar', length: 120 }) fileName: string;
  @Column({ type: 'varchar', length: 120 }) mimeType: string;
  @Column({ type: 'bigint', default: 0 }) size: number;
  @Column({ type: 'varchar', length: 100, nullable: true })
  nodeId: string | null;
}
