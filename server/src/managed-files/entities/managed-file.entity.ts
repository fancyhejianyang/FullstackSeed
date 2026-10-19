import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type ManagedFileStatus =
  | 'staged'
  | 'ready'
  | 'pending_delete'
  | 'deleting'
  | 'deleted'
  | 'delete_failed';

@Entity('managed_files')
@Index('IDX_managed_file_cleanup', ['scope', 'status', 'deleteAfter'])
@Index('IDX_managed_file_owner', ['ownerId', 'scope', 'id'])
export class ManagedFile extends BaseEntity {
  @Column({ type: 'int' }) ownerId: number;
  @Column({ type: 'varchar', length: 40 }) scope: string;
  @Column({ type: 'varchar', length: 30 }) environment: string;
  @Column({ type: 'varchar', length: 24 }) storageProvider: string;
  @Column({ type: 'varchar', length: 64 }) storageIdentity: string;
  @Column({ type: 'varchar', length: 700 }) objectKey: string;
  @Column({ type: 'varchar', length: 2048 }) publicUrl: string;
  @Column({ type: 'varchar', length: 120 }) fileName: string;
  @Column({ type: 'varchar', length: 120 }) mimeType: string;
  @Column({ type: 'bigint', default: 0 }) size: number;
  @Column({ type: 'varchar', length: 24, default: 'staged' })
  status: ManagedFileStatus;
  @Column({ type: 'datetime', nullable: true }) deleteAfter: Date | null;
  @Column({ type: 'datetime', nullable: true }) retryAt: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;
}
