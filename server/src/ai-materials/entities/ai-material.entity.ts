import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type {
  AiMaterialGenerationMode,
  AiMaterialStyleKey,
} from '../ai-material.constants';

export type AiMaterialGenerationStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'storing'
  | 'succeeded'
  | 'failed'
  | 'interrupted';

@Entity('ai_materials')
@Index('IDX_ai_material_owner', ['userId', 'id'])
export class AiMaterial extends BaseEntity {
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'text' }) prompt: string;
  @Column({ type: 'varchar', length: 40, default: 'original' })
  styleKey: AiMaterialStyleKey;
  @Column({ type: 'text', nullable: true }) customStyle: string | null;
  @Column({ type: 'int' }) aiConfigId: number;
  @Column({ type: 'varchar', length: 24, default: 'textToImage' })
  generationMode: AiMaterialGenerationMode;
  @Column({ type: 'int', nullable: true }) referenceFileId: number | null;
  @Column({ type: 'varchar', length: 2048, nullable: true })
  referenceImageUrl: string | null;
  @Column({ type: 'int', nullable: true }) currentFileId: number | null;
  @Column({ type: 'varchar', length: 2048, nullable: true })
  currentImageUrl: string | null;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'int', default: 0 }) generationRevision: number;
  @Column({ type: 'varchar', length: 24, default: 'idle' })
  generationStatus: AiMaterialGenerationStatus;
  @Column({ type: 'varchar', length: 500, nullable: true })
  generationError: string | null;
}
