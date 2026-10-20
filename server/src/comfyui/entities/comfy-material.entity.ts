import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type ComfyMaterialSource = 'input' | 'output';
export type ComfyMediaType = 'image' | 'video' | 'file';

@Entity('comfy_materials')
@Index('IDX_comfy_material_owner', ['userId', 'id'])
export class ComfyMaterial extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'varchar', length: 20 }) sourceType: ComfyMaterialSource;
  @Column({ type: 'varchar', length: 20 }) mediaType: ComfyMediaType;
  @Column({ type: 'int', nullable: true }) fileId: number | null;
  @Column({ type: 'varchar', length: 2048, nullable: true })
  fileUrl: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType: string | null;
  @Column({ type: 'bigint', default: 0 }) size: number;
  @Column({ type: 'int', nullable: true }) sourceTaskId: number | null;
  @Column({ type: 'boolean', default: false }) isFavorite: boolean;
}
