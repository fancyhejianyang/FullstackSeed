import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('managed_file_references')
@Index('UQ_managed_file_business_ref', ['businessType', 'businessId', 'role'], {
  unique: true,
})
@Index('IDX_managed_file_ref_file', ['fileId'])
export class ManagedFileReference extends BaseEntity {
  @Column({ type: 'int' }) fileId: number;
  @Column({ type: 'int' }) ownerId: number;
  @Column({ type: 'varchar', length: 40 }) businessType: string;
  @Column({ type: 'int' }) businessId: number;
  @Column({ type: 'varchar', length: 40 }) role: string;
}
