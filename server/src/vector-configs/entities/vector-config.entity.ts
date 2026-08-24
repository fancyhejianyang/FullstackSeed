import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('vector_configs')
export class VectorConfig extends BaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ length: 40, default: 'chroma' })
  vectorDbType: string;

  @Column({ type: 'int', nullable: true })
  providerId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  providerName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string | null;

  @Column({ length: 500, default: 'http://localhost:8000' })
  chromaUrl: string;

  @Column({ length: 120, default: 'knowledge_chunks' })
  collectionName: string;

  @Column({ length: 120, default: 'default_tenant' })
  tenant: string;

  @Column({ length: 120, default: 'default_database' })
  database: string;

  @Column({ type: 'text', nullable: true })
  token: string | null;

  @Column({ type: 'tinyint', default: false })
  isEnabled: boolean;
}
