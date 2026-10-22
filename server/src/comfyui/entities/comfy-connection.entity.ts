import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type ComfyAuthType = 'none' | 'basic' | 'bearer' | 'apiKey';
export type ComfyConnectionStatus = 'untested' | 'available' | 'unavailable';

@Entity('comfy_connections')
@Index('UQ_comfy_connection_name', ['name'], { unique: true })
export class ComfyConnection extends BaseEntity {
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'varchar', length: 500 }) baseUrl: string;
  @Column({ type: 'varchar', length: 20, default: 'none' })
  authType: ComfyAuthType;
  @Column({ type: 'varchar', length: 120, nullable: true })
  username: string | null;
  @Column({ type: 'text', nullable: true, select: false })
  secret: string | null;
  @Column({ type: 'int', default: 15000 }) requestTimeoutMs: number;
  @Column({ type: 'int', default: 1800 }) taskTimeoutSec: number;
  @Column({ type: 'int', default: 1 }) maxConcurrency: number;
  @Column({ type: 'boolean', default: true }) isEnabled: boolean;
  @Column({ type: 'boolean', default: false }) isDefault: boolean;
  @Column({ type: 'varchar', length: 20, default: 'untested' })
  lastTestStatus: ComfyConnectionStatus;
  @Column({ type: 'datetime', nullable: true }) lastTestedAt: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  lastTestMessage: string | null;
  @Column({ type: 'simple-json', nullable: true })
  capabilitySnapshot: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;
}
